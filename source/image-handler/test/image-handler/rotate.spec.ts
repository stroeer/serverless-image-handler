// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import sharp from 'sharp';
import { S3 } from '@aws-sdk/client-s3';
import { ImageRequestInfo, RequestTypes } from '../../src/lib';
import { ImageHandler } from '../../src/image-handler';

const s3Client = new S3();

describe('rotate', () => {
  it('Should pass if rotate is null and return image without EXIF and ICC', async () => {
    // Arrange
    const originalImage = fs.readFileSync('./test/image/1x1.jpg');
    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      edits: { rotate: null },
      originalImage: originalImage,
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata).not.toHaveProperty('exif');
    expect(metadata).not.toHaveProperty('icc');
    expect(metadata).not.toHaveProperty('orientation');
  });

  it('Should pass if the original image has orientation', async () => {
    // Arrange
    const originalImage = fs.readFileSync('./test/image/1x1.jpg');
    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      edits: {},
      originalImage: originalImage,
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata.orientation).toEqual(3);
  });

  it('Should pass if the original image does not have orientation', async () => {
    // Arrange
    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      edits: {},
      originalImage: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata.orientation).toBe(1);
  });
});
