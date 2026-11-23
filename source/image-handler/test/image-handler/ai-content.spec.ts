import fs from 'fs';
import sharp from 'sharp';
import { S3 } from '@aws-sdk/client-s3';
import { ImageFormatTypes, ImageRequestInfo, RequestTypes } from '../../src/lib';
import { ImageHandler } from '../../src/image-handler';

const DIGITAL_SOURCE_TYPE =
  '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>';

describe('ai content', () => {
  const imageHandler = new ImageHandler(new S3());

  const xmpOf = async (request: Partial<ImageRequestInfo>) => {
    const result = await imageHandler.process({
      requestType: RequestTypes.THUMBOR,
      bucket: 'bucket',
      key: 'key',
      contentType: 'image/jpeg',
      originalImage: fs.readFileSync('./test/image/1x1.jpg'),
      ...request,
    } as ImageRequestInfo);
    return (await sharp(Buffer.from(result, 'base64')).metadata()).xmp?.toString();
  };

  it.each([ImageFormatTypes.JPEG, ImageFormatTypes.PNG, ImageFormatTypes.WEBP, ImageFormatTypes.AVIF])(
    'Should write IPTC DigitalSourceType XMP into %s output',
    async outputFormat => {
      expect(await xmpOf({ aiContent: true, outputFormat, edits: { resize: { width: 1 } } })).toContain(
        DIGITAL_SOURCE_TYPE,
      );
    },
  );

  it('Should write the XMP without edits', async () => {
    expect(await xmpOf({ aiContent: true })).toContain(DIGITAL_SOURCE_TYPE);
  });

  it('Should not write the XMP for regular images', async () => {
    expect(await xmpOf({ aiContent: false, outputFormat: ImageFormatTypes.JPEG })).toBeUndefined();
  });
});
