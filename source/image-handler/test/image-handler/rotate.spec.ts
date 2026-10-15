// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import sharp from 'sharp';
import { S3 } from '@aws-sdk/client-s3';
import { ImageRequestInfo, RequestTypes } from '../../src/lib';
import { ImageHandler } from '../../src/image-handler';

const s3Client = new S3();

describe('rotate', () => {
  it('Should keep the ICC profile when stripExif is set (and normalize orientation)', async () => {
    // Arrange
    const originalImage = fs.readFileSync('./test/image/1x1.jpg'); // has EXIF + ICC + orientation 3
    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      edits: { stripExif: true },
      originalImage: originalImage,
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert: EXIF stripping keeps ICC untouched; orientation baked in and cleared
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata).toHaveProperty('icc');
    expect(metadata.orientation ?? 1).toBe(1);
  });

  it('Should keep EXIF when stripIcc is set (and normalize orientation)', async () => {
    // Arrange
    const originalImage = fs.readFileSync('./test/image/1x1.jpg');
    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      edits: { stripIcc: true },
      originalImage: originalImage,
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert: ICC stripping keeps EXIF untouched; orientation baked in and cleared
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata).toHaveProperty('exif');
    expect(metadata.orientation ?? 1).toBe(1);
  });

  it('Should bake EXIF orientation into pixels and normalize the tag', async () => {
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

    // Assert: orientation is auto-applied and cleared (was 3), not re-injected as a tag
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata.orientation ?? 1).toBe(1);
  });

  it('Should physically rotate pixels so output dims match the oriented source (all engines)', async () => {
    // Arrange: 1366x768 landscape pixels + EXIF Orientation=6 (rotate 90 CW) = a portrait photo
    const landscape = await sharp({
      create: { width: 1366, height: 768, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();
    const originalImage = await sharp(landscape).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const request: ImageRequestInfo = {
      requestType: RequestTypes.DEFAULT,
      bucket: 'sample-bucket',
      key: 'test.jpg',
      contentType: 'image/webp',
      edits: {},
      originalImage,
    };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.process(request);

    // Assert: pixels are physically rotated to portrait, and no stale orientation tag remains
    const metadata = await sharp(Buffer.from(result, 'base64')).metadata();
    expect(metadata.width).toBe(768);
    expect(metadata.height).toBe(1366);
    expect(metadata.orientation ?? 1).toBe(1);
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
