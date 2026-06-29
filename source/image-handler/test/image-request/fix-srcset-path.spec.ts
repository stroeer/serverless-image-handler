// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ImageRequest } from '../../src/image-request';

describe('fixSrcSetPath', () => {
  it('Should recover the first candidate from a srcset with width descriptors (the reported failing request)', () => {
    // Arrange
    const rawPath =
      '/2022/10/673obCnS14wB/175x0:450x450/fit-in/90x0/rachel-holmes-quelle-gamedistribution.jpg%2090w,%20https://images.t-online.de/2022/10/673obCnS14wB/175x0:450x450/fit-in/180x0/rachel-holmes-quelle-gamedistribution.jpg%20180w';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual('/2022/10/673obCnS14wB/175x0:450x450/fit-in/90x0/rachel-holmes-quelle-gamedistribution.jpg');
  });

  it('Should recover the first candidate from a srcset with pixel-density descriptors', () => {
    // Arrange
    const rawPath =
      '/2026/06/1Ff18x3yYonF/0x222:4283x2409/fit-in/168x0/joshua-kimmich.jpg%201x,%20https://images.t-online.de/2026/06/1Ff18x3yYonF/0x222:4283x2409/fit-in/336x0/joshua-kimmich.jpg%202x';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual('/2026/06/1Ff18x3yYonF/0x222:4283x2409/fit-in/168x0/joshua-kimmich.jpg');
  });

  it('Should handle fractional pixel-density descriptors', () => {
    // Arrange
    const rawPath =
      '/2024/07/abc/fit-in/400x0/image.jpg%201.5x,%20https://images.t-online.de/2024/07/abc/fit-in/800x0/image.jpg%203x';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual('/2024/07/abc/fit-in/400x0/image.jpg');
  });

  it('Should strip a trailing descriptor even when there is only a single candidate', () => {
    // Arrange
    const rawPath = '/2024/07/abc/fit-in/90x0/image.jpg%2090w';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual('/2024/07/abc/fit-in/90x0/image.jpg');
  });

  it('Should also handle literal (non URL-encoded) spaces', () => {
    // Arrange
    const rawPath =
      '/2024/07/abc/fit-in/90x0/image.jpg 90w, https://images.t-online.de/2024/07/abc/fit-in/180x0/image.jpg 180w';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual('/2024/07/abc/fit-in/90x0/image.jpg');
  });

  it.each([
    '/2022/10/673obCnS14wB/175x0:450x450/fit-in/90x0/rachel-holmes-quelle-gamedistribution.jpg',
    '/filters:rotate(90)/filters:grayscale()/thumbor-image.jpg',
    '/fit-in/400x400/filters:watermark(bucket,folder/key.png,0,0)/image.jpg',
    '/filters:rotate(90)/filters:grayscale()/thumbor-image (1) suffix.jpg',
    '/eyJidWNrZXQiOiJteS1zYW1wbGUtYnVja2V0Iiwia2V5Ijoic2FtcGxlLWltYWdlLTAwMS5qcGcifQ==',
  ])('Should leave a valid request path unchanged: %s', rawPath => {
    expect(ImageRequest.fixSrcSetPath(rawPath)).toEqual(rawPath);
  });

  it('Should not be confused by commas inside a watermark filter', () => {
    // Arrange — a comma exists, but there is no "<extension> <descriptor>" signature
    const rawPath = '/fit-in/400x400/filters:watermark(bucket,key.png,0,0)/image.jpg';

    // Act
    const result = ImageRequest.fixSrcSetPath(rawPath);

    // Assert
    expect(result).toEqual(rawPath);
  });

  it('Should handle an empty path gracefully', () => {
    expect(ImageRequest.fixSrcSetPath('')).toEqual('');
  });
});
