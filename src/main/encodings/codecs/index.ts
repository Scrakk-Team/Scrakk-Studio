/**
 * Index de codecs builtin.
 *
 * AGREGAR UN ENCODING BUILTIN:
 *   1. Crear `codecs/<familia>.ts` exportando sus IEncodingCodec.
 *   2. Sumarlos al array de acá. Nada más: detect.ts, registry y service
 *      los toman por id sin cambios.
 */

import type { IEncodingCodec } from '@shared/encodings'
import { utf8Codec, utf8BomCodec } from './utf8'
import { utf16LeCodec, utf16LeBomCodec, utf16BeCodec, utf16BeBomCodec } from './utf16'
import { latin1Codec } from './latin1'

/** Orden del array = orden en el picker UI. */
export const BUILTIN_CODECS: IEncodingCodec[] = [
  utf8Codec,
  utf8BomCodec,
  utf16LeCodec,
  utf16LeBomCodec,
  utf16BeCodec,
  utf16BeBomCodec,
  latin1Codec
]
