// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler } from '../src';
import { ImageHandlerError, StatusCodes } from '../src/lib';
import { build_event } from './helpers';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { sampleImageStream } from './mock';

describe('index', () => {
  // Arrange
  process.env.SOURCE_BUCKETS = 'source-bucket';
  const mockS3Client = mockClient(S3Client);

  beforeEach(() => {
    mockS3Client.reset();
  });

  it('should return the image when there is no error', async () => {
    // Mock
    mockS3Client.on(GetObjectCommand).resolves({ Body: sampleImageStream(), ContentType: 'image/jpeg' });

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
        'Cache-Control': 'max-age=31536000, immutable',
        Expires: undefined,
        Vary: 'Accept',
        'Last-Modified': undefined,
      },
      body: '/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAAAQAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAABIAAAAAQAAAEgAAAABAAAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAEAAAADoAQAAQAAAAEAAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwAGBgYGBwYHCAgHCgsKCwoPDgwMDg8WEBEQERAWIhUZFRUZFSIeJB4cHiQeNiomJio2PjQyND5MRERMX1pffHyn/9sAQwEGBgYGBwYHCAgHCgsKCwoPDgwMDg8WEBEQERAWIhUZFRUZFSIeJB4cHiQeNiomJio2PjQyND5MRERMX1pffHyn/8IAEQgAAQABAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAH/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/2gAMAwEAAhADEAAAAIOA6p//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/AH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AH//2Q==',
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
        'Cache-Control': 'max-age=3600, immutable',
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

  it('should respond with http/410 GONE for expired content', async () => {
    // Arrange
    const event = build_event({ rawPath: '/test.webp' });
    // Mock
    mockS3Client
      .on(GetObjectCommand)
      .resolves({ Expires: new Date('1970-01-01'), Body: sampleImageStream(), ContentType: 'image/webp' });

    // Act
    const result = await handler(event);
    const expectedResult = {
      statusCode: StatusCodes.GONE,
      isBase64Encoded: false,
      headers: {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=31536000, immutable',
      },
      body: JSON.stringify({
        message: `HTTP/410. Content test.webp has expired.`,
        code: 'Gone',
        status: StatusCodes.GONE,
      }),
    };

    // Assert
    expect(mockS3Client).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'source-bucket',
      Key: 'test.webp',
    });
    expect(result).toEqual(expectedResult);
  });

  it("should respond with http/410 GONE for expired content via 'buzz-status-code'", async () => {
    // Arrange
    const event = build_event({ rawPath: '/test.webp' });
    // Mock
    mockS3Client
      .on(GetObjectCommand)
      .resolves({ Metadata: { 'buzz-status-code': '410' }, Body: sampleImageStream(), ContentType: 'image/webp' });

    // Act
    const result = await handler(event);
    const expectedResult = {
      statusCode: StatusCodes.GONE,
      isBase64Encoded: false,
      headers: {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=31536000, immutable',
      },
      body: JSON.stringify({
        status: StatusCodes.GONE,
        code: 'Gone',
        message: `HTTP/410. The image test.webp has been removed.`,
      }),
    };

    // Assert
    expect(mockS3Client).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'source-bucket',
      Key: 'test.webp',
    });
    expect(result).toEqual(expectedResult);
  });

  it('should respond with http/400 BAD REQUEST when out of bounds', async () => {
    // Arrange
    const event = build_event({ rawPath: '/0x0:9999x9999/test.webp' });
    // Mock
    mockS3Client.on(GetObjectCommand).resolves({ Body: sampleImageStream(), ContentType: 'image/webp' });

    // Act
    const result = await handler(event);
    const expectedResult = {
      statusCode: StatusCodes.BAD_REQUEST,
      isBase64Encoded: false,
      headers: {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600, immutable',
      },
      body: JSON.stringify({
        message: `The cropping area you provided exceeds the boundaries of the original image. Please try choosing a correct cropping value.`,
        code: 'Crop::AreaOutOfBounds',
        status: StatusCodes.BAD_REQUEST,
      }),
    };

    // Assert
    expect(mockS3Client).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'source-bucket',
      Key: 'test.webp',
    });
    expect(result).toEqual(expectedResult);
  });
});
