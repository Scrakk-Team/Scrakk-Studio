// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API renderer de codificaciones — wrapper tipado sobre window.api.encodings.
 */

import type {
  ListEncodingsResponse,
  ReadEncodedResponse,
  RegisterDynamicCodecsResponse,
  WriteEncodedRequest,
  WriteEncodedResult
} from '@shared/encodings'

export function readEncoded(path: string): Promise<ReadEncodedResponse> {
  return window.api.encodings.readEncoded(path)
}

export function writeEncoded(request: WriteEncodedRequest): Promise<WriteEncodedResult> {
  return window.api.encodings.writeEncoded(request)
}

export async function listEncodings(): Promise<ListEncodingsResponse['encodings']> {
  const res = await window.api.encodings.list()
  return res.success ? (res.encodings ?? []) : []
}

export function registerDynamicCodecs(
  extensionId: string,
  codecs: import('@shared/encodings').DynamicCodecPayload['codecs']
): Promise<RegisterDynamicCodecsResponse> {
  return window.api.encodings.registerDynamic(extensionId, codecs)
}

export function removeDynamicCodecs(
  extensionId: string
): Promise<{ success: boolean; removed?: string[] }> {
  return window.api.encodings.removeDynamic(extensionId)
}
