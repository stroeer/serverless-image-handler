// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import sharp, { OverlayOptions, SharpOptions } from 'sharp';

import {
  ContentTypes,
  ImageEdits,
  ImageFitTypes,
  ImageFormatTypes,
  ImageHandlerError,
  ImageRequestInfo,
  StatusCodes,
} from './lib';
import { S3 } from '@aws-sdk/client-s3';
import { rgbaToThumbHash } from './lib/thumbhash';

export class ImageHandler {
  private readonly LAMBDA_PAYLOAD_LIMIT = 6 * 1024 * 1024;
  private readonly MAX_ANIMATED_PIXELS = parseInt(process.env.MAX_ANIMATED_PIXELS) || 5_000_000;
  private readonly MAX_ANIMATED_FRAMES = parseInt(process.env.MAX_ANIMATED_FRAMES) || 100;

  constructor(private readonly s3Client: S3) {}

  /**
   * Creates a Sharp object from Buffer
   * @param originalImage An image buffer.
   * @param edits The edits to be applied to an image
   * @param options Additional sharp options to be applied
   * @returns A Sharp image object
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  private async instantiateSharpImage(
    originalImage: Buffer,
    edits: ImageEdits,
    options: SharpOptions,
  ): Promise<sharp.Sharp> {
    // Bake the EXIF Orientation into the pixels and clear the tag, so output looks upright in
    // every engine (Blink ignores WebP EXIF orientation; WebKit honors it). No-op when orientation
    // is 1/absent. Must run before resize/crop so those act on oriented dimensions. autoOrient()
    // wins over keepMetadata(), so the stale orientation tag is not re-attached.
    const image = sharp(originalImage, options).autoOrient().keepIccProfile().keepMetadata();

    if (edits?.stripExif) {
      // Replace EXIF with a minimal tag; leave the ICC profile untouched.
      image.keepIccProfile().withExif({ IFD0: { Software: 'ströer image-handler' } });
    }

    if (edits?.stripIcc) {
      // Normalize the color profile to sRGB (drops the embedded ICC); leave EXIF untouched.
      image.keepExif().withIccProfile('srgb');
    }

    return image;
  }

  /**
   * Modify an image's output format if specified, also automatically optimize the image based on the output format or content type.
   * @param modifiedImage the image object.
   * @param imageRequestInfo the image request
   * @returns A Sharp image object
   */
  private modifyImageOutput(modifiedImage: sharp.Sharp, imageRequestInfo: ImageRequestInfo): sharp.Sharp {
    const modifiedOutputImage = modifiedImage;

    if (
      ImageFormatTypes.WEBP === imageRequestInfo.outputFormat ||
      (undefined === imageRequestInfo.outputFormat && imageRequestInfo.contentType === ContentTypes.WEBP)
    ) {
      modifiedOutputImage.webp({ effort: imageRequestInfo.effort ?? 6 });
    } else if (
      ImageFormatTypes.PNG === imageRequestInfo.outputFormat ||
      (undefined === imageRequestInfo.outputFormat && imageRequestInfo.contentType === ContentTypes.PNG)
    ) {
      modifiedOutputImage.png({ palette: true, quality: 100, effort: 7, compressionLevel: 6 });
    } else if (
      ImageFormatTypes.JPEG === imageRequestInfo.outputFormat ||
      ImageFormatTypes.JPG === imageRequestInfo.outputFormat ||
      (undefined === imageRequestInfo.outputFormat && imageRequestInfo.contentType === ContentTypes.JPEG)
    ) {
      modifiedOutputImage.jpeg({ mozjpeg: true });
    } else if (
      ImageFormatTypes.AVIF == imageRequestInfo.outputFormat ||
      (undefined === imageRequestInfo.outputFormat && imageRequestInfo.contentType === ContentTypes.AVIF)
    ) {
      modifiedOutputImage.avif({ quality: 70, effort: 0 });
    }

    return modifiedOutputImage;
  }

  /**
   * Main method for processing image requests and outputting modified images.
   * @param imageRequestInfo An image request.
   * @returns Processed and modified image encoded as base64 string.
   */
  async process(imageRequestInfo: ImageRequestInfo): Promise<string> {
    const { originalImage, edits } = imageRequestInfo;
    const options: SharpOptions = { failOn: 'none', animated: imageRequestInfo.contentType === ContentTypes.GIF };
    let base64EncodedImage = '';

    // Apply edits if specified
    if (edits && Object.keys(edits).length) {
      // convert image to Sharp object
      options.animated =
        typeof edits.animated !== 'undefined' ? edits.animated : imageRequestInfo.contentType === ContentTypes.GIF;
      let image = await this.instantiateSharpImage(originalImage, edits, options);

      // default to non-animated if image does not have multiple pages
      if (options.animated) {
        const metadata = await image.metadata();
        if (!metadata.pages || metadata.pages <= 1) {
          options.animated = false;
          image = await this.instantiateSharpImage(originalImage, edits, options);
        } else {
          const perFramePixels = (metadata.width ?? 1) * (metadata.pageHeight ?? metadata.height ?? 1);
          const maxFrames = Math.min(
            this.MAX_ANIMATED_FRAMES,
            Math.max(1, Math.floor(this.MAX_ANIMATED_PIXELS / perFramePixels)),
          );
          if (metadata.pages > maxFrames) {
            options.pages = maxFrames;
            image = await this.instantiateSharpImage(originalImage, edits, options);
          }
        }
      }

      // apply image edits
      let modifiedImage = await this.applyEdits(image, edits, options.animated);
      if ('thumbhash' in edits) {
        base64EncodedImage = await this.thumbhash(modifiedImage, imageRequestInfo);
      } else {
        // modify image output if requested
        modifiedImage = this.modifyImageOutput(modifiedImage, imageRequestInfo);
        // convert to base64 encoded string
        const imageBuffer = await modifiedImage.toBuffer();
        base64EncodedImage = imageBuffer.toString('base64');
      }
    } else {
      // convert image to Sharp and change output format if specified
      let image = await this.instantiateSharpImage(originalImage, edits, options);
      const modifiedImage = this.modifyImageOutput(image, imageRequestInfo);
      // convert to base64 encoded string
      const imageBuffer = await modifiedImage.toBuffer();
      base64EncodedImage = imageBuffer.toString('base64');
    }

    // binary data need to be base64 encoded to pass to the API Gateway proxy https://docs.aws.amazon.com/apigateway/latest/developerguide/lambda-proxy-binary-media.html.
    // checks whether base64 encoded image fits in 6M limit, see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html.
    if (base64EncodedImage.length > this.LAMBDA_PAYLOAD_LIMIT) {
      throw new ImageHandlerError(
        StatusCodes.REQUEST_TOO_LONG,
        'TooLargeImageException',
        'The converted image is too large to return.',
      );
    }

    return base64EncodedImage;
  }

  /**
   * Applies image modifications to the original image based on edits.
   * @param originalImage The original sharp image.
   * @param edits The edits to be made to the original image.
   * @param isAnimation a flag whether the edit applies to animated files or not.
   * @returns A modifications to the original image.
   */
  public async applyEdits(originalImage: sharp.Sharp, edits: ImageEdits, isAnimation: boolean): Promise<sharp.Sharp> {
    await this.applyResize(originalImage, edits);

    // Apply the image edits
    for (const edit in edits) {
      if (this.skipEdit(edit, isAnimation)) continue;

      switch (edit) {
        case 'roundCrop': {
          originalImage = await this.applyRoundCrop(originalImage, edits);
          break;
        }
        case 'crop': {
          this.applyCrop(originalImage, edits);
          break;
        }
        case 'animated': {
          break;
        }
        case 'thumbhash': {
          originalImage.resize({ width: 100, height: 100, fit: ImageFitTypes.INSIDE });
          break;
        }
        default: {
          if (edit in originalImage) {
            originalImage[edit](edits[edit]);
          }
        }
      }
    }
    // Return the modified image
    return originalImage;
  }

  /**
   * Applies resize edit.
   * @param originalImage The original sharp image.
   * @param edits The edits to be made to the original image.
   */
  private async applyResize(originalImage: sharp.Sharp, edits: ImageEdits): Promise<void> {
    if (edits.resize === undefined) {
      return;
    }
    const resize = this.validateResizeInputs(edits.resize);

    if (resize.ratio) {
      const ratio = resize.ratio;

      const meta = resize.width && resize.height ? resize : await originalImage.metadata();
      // metadata() reports pre-autoOrient dims, so swap for 90/270 rotations (orientation 5-8).
      const swap = typeof meta.orientation === 'number' && meta.orientation >= 5;
      const width = swap ? meta.height : meta.width;
      const height = swap ? meta.width : meta.height;

      resize.width = Math.round(width * ratio);
      resize.height = Math.round(height * ratio);
      // Sharp doesn't have such parameter for resize(), we got it from Thumbor mapper.  We don't need to keep this field in the `resize` object
      delete resize.ratio;

      if (!resize.fit) resize.fit = ImageFitTypes.INSIDE;
    }
  }

  /**
   * Validates resize edit parameters.
   * @param resize The resize parameters.
   */
  private validateResizeInputs(resize: any) {
    if (resize.width) resize.width = Math.round(Number(resize.width));
    if (resize.height) resize.height = Math.round(Number(resize.height));

    if ((resize.width != null && resize.width <= 0) || (resize.height != null && resize.height <= 0)) {
      throw new ImageHandlerError(StatusCodes.BAD_REQUEST, 'InvalidResizeException', 'The image size is invalid.');
    }
    return resize;
  }

  /**
   * Determines if the edits specified contain a valid roundCrop item
   * @param edits The edits speficed
   * @returns boolean
   */
  private hasRoundCrop(edits: ImageEdits): boolean {
    return edits.roundCrop === true || typeof edits.roundCrop === 'object';
  }

  /**
   * @param param Value of corner to check
   * @returns Boolean identifying whether roundCrop parameters are valid
   */
  private validRoundCropParam(param: number) {
    return param && param >= 0;
  }

  /**
   * Applies round crop edit.
   * @param originalImage The original sharp image.
   * @param edits The edits to be made to the original image.
   */
  private async applyRoundCrop(originalImage: sharp.Sharp, edits: ImageEdits): Promise<sharp.Sharp> {
    // round crop can be boolean or object
    if (this.hasRoundCrop(edits)) {
      const { top, left, rx, ry } =
        typeof edits.roundCrop === 'object'
          ? edits.roundCrop
          : {
              top: undefined,
              left: undefined,
              rx: undefined,
              ry: undefined,
            };
      const imageBuffer = await originalImage.toBuffer({ resolveWithObject: true });
      const width = imageBuffer.info.width;
      const height = imageBuffer.info.height;

      // check for parameters, if not provided, set to defaults
      const radiusX = this.validRoundCropParam(rx) ? rx : Math.min(width, height) / 2;
      const radiusY = this.validRoundCropParam(ry) ? ry : Math.min(width, height) / 2;
      const topOffset = this.validRoundCropParam(top) ? top : height / 2;
      const leftOffset = this.validRoundCropParam(left) ? left : width / 2;

      const ellipse = Buffer.from(
        `<svg viewBox="0 0 ${width} ${height}"> <ellipse cx="${leftOffset}" cy="${topOffset}" rx="${radiusX}" ry="${radiusY}" /></svg>`,
      );
      const overlayOptions: OverlayOptions[] = [{ input: ellipse, blend: 'dest-in' }];

      // Need to break out into another sharp pipeline to allow for resize after composite
      const data = await originalImage
        .composite(overlayOptions)
        .png() // transparent background instead of black background
        .toBuffer();
      return sharp(data).withMetadata().trim();
    }

    return originalImage;
  }

  /**
   * Applies crop edit.
   * @param originalImage The original sharp image.
   * @param edits The edits to be made to the original image.
   */
  private applyCrop(originalImage: sharp.Sharp, edits: ImageEdits): void {
    originalImage.extract(edits.crop);
  }

  /**
   * Checks whether an edit needs to be skipped or not.
   * @param edit the current edit.
   * @param isAnimation a flag whether the edit applies to `gif` file or not.
   * @returns whether the edit needs to be skipped or not.
   */
  private skipEdit(edit: string, isAnimation: boolean): boolean {
    return isAnimation && ['rotate', 'smartCrop', 'roundCrop'].includes(edit);
  }
  private async thumbhash(image: sharp.Sharp, imageRequestInfo: ImageRequestInfo): Promise<string> {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const binaryThumbHash = rgbaToThumbHash(info.width, info.height, data);

    imageRequestInfo.contentType = ContentTypes.JSON;
    imageRequestInfo.cacheControl = 'max-age=3600';
    return Buffer.from(
      JSON.stringify({
        base64: Buffer.from(binaryThumbHash).toString('base64'),
        // base64_url: thumbHashToDataURL(binaryThumbHash), // debugging thedata:image/png;base64 if required, will be done in the frontend
      }),
    ).toString('base64');
  }
}
