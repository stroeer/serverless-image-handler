// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';
import { createReadStream } from 'fs';

export function sdkStreamFromString(body: any): any {
  // create Stream from string
  const stream = new Readable();
  stream.push(body);
  stream.push(null); // end of stream

  // wrap the Stream with SDK mixin
  return sdkStreamMixin(stream);
}

export function sdkStreamFromFile(file: string): any {
  const stream = createReadStream(file);
  return sdkStreamMixin(stream);
}

export const consoleInfoSpy = jest.spyOn(console, 'info');
