// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { S3 } from '@aws-sdk/client-s3';
import { ImageRequest } from '../../src/image-request';
import { RequestTypes, StatusCodes } from '../../src/lib';
import { consoleInfoSpy } from '../mock';
import { build_event } from '../helpers';

describe('parseRequestType', () => {
  const s3Client = new S3();
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('Should pass if the method detects a default request', () => {
    // Arrange
    const event = build_event({
      rawPath:
        '/eyJidWNrZXQiOiJteS1zYW1wbGUtYnVja2V0Iiwia2V5IjoibXktc2FtcGxlLWtleSIsImVkaXRzIjp7ImdyYXlzY2FsZSI6dHJ1ZX19',
    });
    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(event);

    // Assert
    const expectedResult = RequestTypes.DEFAULT;
    expect(result).toEqual(expectedResult);
  });

  it('Should pass if the method detects a thumbor request', () => {
    // Arrange
    const event = build_event({
      rawPath:
        '/unsafe/filters:brightness(10):contrast(30)/https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Coffee_berries_1.jpg/1200px-Coffee_berries_1.jpg',
    });
    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(event);

    // Assert
    expect(result).toEqual(RequestTypes.THUMBOR);
  });

  it('Should pass for a thumbor request with no extension', () => {
    // Arrange
    const event = build_event({
      rawPath: '/unsafe/filters:brightness(10):contrast(30)/image',
    });
    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(event);

    // Assert
    expect(result).toEqual(RequestTypes.THUMBOR);
  });

  test.each([
    { value: '.jpg' },
    { value: '.jpeg' },
    { value: '.png' },
    { value: '.webp' },
    { value: '.tiff' },
    { value: '.tif' },
    { value: '.svg' },
    { value: '.gif' },
    { value: '.avif' },
  ])('Should pass if get a request with supported image extension: $value', ({ value }) => {
    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(build_event({ rawPath: `image${value}` }));

    // Assert
    expect(result).toEqual(RequestTypes.THUMBOR);
  });

  it('Should pass if the method detects a custom request', () => {
    // Arrange
    const event = build_event({ rawPath: '/additionalImageRequestParameters/image.jpg' });
    process.env = {
      REWRITE_MATCH_PATTERN: 'matchPattern',
      REWRITE_SUBSTITUTION: 'substitutionString',
    };

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(event);

    // Assert
    const expectedResult = RequestTypes.CUSTOM;
    expect(result).toEqual(expectedResult);
  });

  it('Should throw an error if the method cannot determine the request type based on the three groups given', () => {
    // Arrange
    const event = build_event({ rawPath: '12x12e24d234r2ewxsad123d34r.bmp' });

    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);

    let parseError;
    // Assert
    try {
      imageRequest.parseRequestType(event);
    } catch (error) {
      parseError = error;
    }
    expect(parseError).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: 'RequestTypeError',
      message:
        'The type of request you are making could not be processed. Please ensure that your original image is of a supported file type (jpg/jpeg, png, tiff/tif, webp, svg, gif, avif) and that your image request is provided in the correct syntax. Refer to the documentation for additional guidance on forming image requests.',
    });
  });

  it('Should throw an error for a thumbor request with invalid extension', () => {
    // Arrange
    const event = build_event({
      rawPath: '/testImage.abc',
    });
    process.env = {};

    // Act
    const imageRequest = new ImageRequest(s3Client);
    let parseError;
    // Assert
    try {
      imageRequest.parseRequestType(event);
    } catch (error) {
      parseError = error;
    }
    expect(parseError).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: 'RequestTypeError',
      message:
        'The type of request you are making could not be processed. Please ensure that your original image is of a supported file type (jpg/jpeg, png, tiff/tif, webp, svg, gif, avif) and that your image request is provided in the correct syntax. Refer to the documentation for additional guidance on forming image requests.',
    });
  });

  it('Should pass if a path is provided without an extension', () => {
    // Arrange
    const event = build_event({ rawPath: '/image' });

    // Act
    const imageRequest = new ImageRequest(s3Client);
    const result = imageRequest.parseRequestType(event);

    // Assert
    const expectedResult = RequestTypes.THUMBOR;
    expect(result).toEqual(expectedResult);
  });
});
