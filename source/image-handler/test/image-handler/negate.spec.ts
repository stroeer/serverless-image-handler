// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import sharp from 'sharp';
import { S3 } from '@aws-sdk/client-s3';
import { ImageEdits } from '../../src/lib';
import { ImageHandler } from '../../src/image-handler';

const s3Client = new S3();

describe('negate', () => {
  it('Should pass if negate is passed via edits.', async () => {
    // Arrange
    const originalImage = fs.readFileSync('./test/image/1x1.jpg');
    const image = sharp(originalImage, { failOn: 'none' }).withMetadata();
    const edits: ImageEdits = { negate: null };

    // Act
    const imageHandler = new ImageHandler(s3Client);
    const result = await imageHandler.applyEdits(image, edits, false);

    // Assert
    const resultBuffer = await result.toBuffer();
    const convertedImage = await sharp(originalImage, { failOn: 'none' }).withMetadata().negate().toBuffer();
    expect(resultBuffer).toEqual(convertedImage);
  });
});
