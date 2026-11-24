// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ThumborMapper } from '../../src/thumbor-mapper';

describe('edits', () => {
  it('Should pass if filters are chained', () => {
    const path = '/filters:rotate(90):grayscale()/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        rotate: 90,
        grayscale: true,
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should pass if filters are not chained', () => {
    const path = '/filters:rotate(90)/filters:grayscale()/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        rotate: 90,
        grayscale: true,
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should pass if filters are both chained and individual', () => {
    const path = '/filters:rotate(90):grayscale()/filters:blur(20)/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        rotate: 90,
        grayscale: true,
        blur: 10,
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should pass if negate options are parsed correctly', () => {
    const path = '/filters:negate()/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        negate: null,
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should pass if negate(true) options are parsed correctly', () => {
    const path = '/filters:negate(true)/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        negate: { alpha: true },
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should pass if negate(false) options are parsed correctly', () => {
    const path = '/filters:negate(false)/thumbor-image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {
        negate: { alpha: false },
      },
    };
    expect(edits).toEqual(expectedResult.edits);
  });

  it('Should ignore watermark even if there are slashes in it', () => {
    const path = '/filters:watermark(bucket,folder/key.png,0,0)/image.jpg';

    // Act
    const thumborMapper = new ThumborMapper();
    const edits = thumborMapper.mapPathToEdits(path);

    // Assert
    const expectedResult = {
      edits: {},
    };
    expect(edits).toEqual(expectedResult.edits);
  });
});
