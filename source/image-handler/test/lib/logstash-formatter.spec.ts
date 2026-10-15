// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { LogStashFormatter } from '../../src/lib/LogstashFormatter';
import { ImageHandlerError, StatusCodes } from '../../src/lib';

describe('LogStashFormatter.formatError', () => {
  const formatter = new LogStashFormatter();

  it('Should normalize an AWS SDK error `Code` (capital) to lowercase `code`', () => {
    // Arrange — shape of a deserialized AWS SDK v3 S3 error (e.g. NoSuchKey)
    const error = Object.assign(new Error('The specified key does not exist.'), {
      name: 'NoSuchKey',
      Code: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });

    // Act
    const formatted = formatter.formatError(error);

    // Assert
    expect(formatted.code).toEqual('NoSuchKey');
    expect(formatted).not.toHaveProperty('Code');
    // unrelated AWS attributes are still preserved
    expect(formatted.$metadata).toEqual({ httpStatusCode: 404 });
  });

  it('Should keep the lowercase `code` of an ImageHandlerError unchanged', () => {
    // Arrange
    const error = new ImageHandlerError(StatusCodes.BAD_REQUEST, 'RequestTypeError', 'bad request');

    // Act
    const formatted = formatter.formatError(error);

    // Assert
    expect(formatted.code).toEqual('RequestTypeError');
    expect(formatted.status).toEqual(StatusCodes.BAD_REQUEST);
    expect(formatted).not.toHaveProperty('Code');
  });

  it('Should not overwrite an existing lowercase `code` when both are present', () => {
    // Arrange
    const error = Object.assign(new Error('boom'), { code: 'lowercase-wins', Code: 'CapitalIgnored' });

    // Act
    const formatted = formatter.formatError(error);

    // Assert
    expect(formatted.code).toEqual('lowercase-wins');
    expect(formatted).not.toHaveProperty('Code');
  });

  it('Should leave errors without a code untouched', () => {
    // Arrange
    const error = new Error('plain error');

    // Act
    const formatted = formatter.formatError(error);

    // Assert
    expect(formatted).not.toHaveProperty('code');
    expect(formatted).not.toHaveProperty('Code');
    expect(formatted.message).toEqual('plain error');
  });
});
