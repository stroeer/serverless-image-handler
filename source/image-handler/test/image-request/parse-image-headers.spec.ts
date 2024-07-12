// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { S3 } from '@aws-sdk/client-s3';
import { ImageRequest } from '../../src/image-request';
import { RequestTypes } from '../../src/lib';
import { build_event } from './helpers';

describe('parseImageHeaders', () => {
  const s3Client = new S3();

  it('001/Should return headers if headers are provided for a sample base64-encoded image request', () => {
    // Arrange
    const event = build_event({
      rawPath:
        '/eyJidWNrZXQiOiJ2YWxpZEJ1Y2tldCIsImtleSI6InZhbGlkS2V5IiwiaGVhZGVycyI6eyJDYWNoZS1Db250cm9sIjoibWF4LWFnZT0zMTUzNjAwMCxwdWJsaWMifSwib3V0cHV0Rm9ybWF0IjoianBlZyJ9',
    });

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseImageHeaders(event, RequestTypes.DEFAULT);

    // Assert
    const expectedResult = {
      'Cache-Control': 'max-age=31536000',
    };
    expect(result).toEqual(expectedResult);
  });

  it('001/Should return undefined if headers are not provided for a base64-encoded image request', () => {
    // Arrange
    const event = build_event({
      rawPath: '/eyJidWNrZXQiOiJ2YWxpZEJ1Y2tldCIsImtleSI6InZhbGlkS2V5In0=',
    });

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseImageHeaders(event, RequestTypes.DEFAULT);

    // Assert
    expect(result).toEqual(undefined);
  });

  it('001/Should return undefined for Thumbor or Custom requests', () => {
    // Arrange
    const event = build_event({ rawPath: '/test.jpg' });

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseImageHeaders(event, RequestTypes.THUMBOR);

    // Assert
    expect(result).toEqual(undefined);
  });
});
