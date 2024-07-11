// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler } from '../src';
import { ImageHandlerError, StatusCodes } from '../src/lib';
import { build_event } from './image-request/helpers';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamFromString } from './mock';
import 'aws-sdk-client-mock-jest';

describe('index', () => {
  // Arrange
  process.env.SOURCE_BUCKETS = 'source-bucket';
  const mockImage = sdkStreamFromString('SampleImageContent\n');
  const mockS3Client = mockClient(S3Client);

  beforeEach(() => {
    mockS3Client.reset();
  });

  it('should return the image when there is no error', async () => {
    // Mock
    mockS3Client.on(GetObjectCommand).resolves({ Body: mockImage, ContentType: 'image/jpeg' });

    // Arrange
    const event = build_event({ rawPath: '/test.jpg' });

    // Act
    const result = await handler(event);
    const expectedResult = {
      statusCode: StatusCodes.OK,
      isBase64Encoded: true,
      headers: {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'image/jpeg',
        Expires: undefined,
        'Cache-Control': 'max-age=31536000,public',
        'Last-Modified': undefined,
      },
      body: btoa('SampleImageContent\n'),
    };

    // Assert
    expect(mockS3Client).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'source-bucket',
      Key: 'test.jpg',
    });
    expect(result).toEqual(expectedResult);
  });

  it('should return an error JSON when an error occurs', async () => {
    // Arrange
    const event = build_event({ rawPath: '/test.jpg' });
    // Mock
    mockS3Client
      .on(GetObjectCommand)
      .rejects(new ImageHandlerError(StatusCodes.NOT_FOUND, 'NoSuchKey', 'NoSuchKey error happened.'));

    // Act
    const result = await handler(event);
    const expectedResult = {
      statusCode: StatusCodes.NOT_FOUND,
      isBase64Encoded: false,
      headers: {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: StatusCodes.NOT_FOUND,
        code: 'NoSuchKey',
        message: `The image test.jpg does not exist or the request may not be base64 encoded properly.`,
      }),
    };

    // Assert
    expect(mockS3Client).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'source-bucket',
      Key: 'test.jpg',
    });
    expect(result).toEqual(expectedResult);
  });
});
