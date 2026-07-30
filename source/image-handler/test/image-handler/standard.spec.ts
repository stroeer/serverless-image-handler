// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import { S3 } from '@aws-sdk/client-s3';
import sharp, { SharpOptions } from 'sharp';
import { ImageEdits } from '../../src/lib';
import { ImageHandler } from '../../src/image-handler';

const s3Client = new S3();
const image = fs.readFileSync('./test/image/25x15.png');
const autoOrientSpy = jest.spyOn(sharp.prototype, 'autoOrient');
const keepMetadataSpy = jest.spyOn(sharp.prototype, 'keepMetadata');
const withExifSpy = jest.spyOn(sharp.prototype, 'withExif');
const withIccProfileSpy = jest.spyOn(sharp.prototype, 'withIccProfile');

describe('standard', () => {
  it('Should pass if a series of standard edits are provided to the function', async () => {
    // Arrange
    const originalImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const image = sharp(originalImage, { failOnError: false }).withMetadata();
    const edits: ImageEdits = { grayscale: true, flip: true };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.applyEdits(image, edits, false);

    // Assert
    /* eslint-disable dot-notation */
    const expectedResult1 = result['options'].greyscale;
    const expectedResult2 = result['options'].flip;
    const combinedResults = expectedResult1 && expectedResult2;
    expect(combinedResults).toEqual(true);
  });
});

describe('instantiateSharpImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Should auto-orient and keep metadata by default, without stripping EXIF or ICC', async () => {
    // Arrange
    const options: SharpOptions = { failOn: 'none' };
    const imageHandler = new ImageHandler(s3Client);

    // Act
    await imageHandler['instantiateSharpImage'](image, {}, options);

    //Assert
    expect(autoOrientSpy).toHaveBeenCalled();
    expect(keepMetadataSpy).toHaveBeenCalled();
    expect(withExifSpy).not.toHaveBeenCalled();
    expect(withIccProfileSpy).not.toHaveBeenCalled();
  });

  it('Should strip EXIF but keep the ICC profile when stripExif is set', async () => {
    // Arrange
    const options: SharpOptions = { failOn: 'none' };
    const imageHandler = new ImageHandler(s3Client);

    // Act
    await imageHandler['instantiateSharpImage'](image, { stripExif: true }, options);

    //Assert
    expect(autoOrientSpy).toHaveBeenCalled();
    expect(withExifSpy).toHaveBeenCalled();
    expect(withIccProfileSpy).not.toHaveBeenCalled();
  });

  it('Should strip the ICC profile but keep EXIF when stripIcc is set', async () => {
    // Arrange
    const options: SharpOptions = { failOn: 'none' };
    const imageHandler = new ImageHandler(s3Client);

    // Act
    await imageHandler['instantiateSharpImage'](image, { stripIcc: true }, options);

    //Assert
    expect(autoOrientSpy).toHaveBeenCalled();
    expect(withIccProfileSpy).toHaveBeenCalledWith('srgb');
    expect(withExifSpy).not.toHaveBeenCalled();
  });
});
