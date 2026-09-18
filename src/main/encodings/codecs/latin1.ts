/**
 * Codec Latin-1 / Windows-1252.
 *
 * Windows-1252 es el superset display de ISO-8859-1 que trae Chromium/Node;
 * cae a un mapeo manual si el entorno no tiene la tabla.
 */

import type { IEncodingCodec } from '@shared/encodings'

export const latin1Codec: IEncodingCodec = {
  id: 'latin1',
  label: 'Western (Windows 1252)',
  decode(bytes) {
    try {
      return new TextDecoder('windows-1252').decode(bytes)
    } catch {
      // Fallback manual (latin1 puro): cada byte = code point igual.
      return Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    }
  },
  encode(text) {
    // Bytes no representables en 1252 → '?' (0x3F), convención universal.
    const CP1252_HIGH: Array<number | null> = [
      0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
      0x0152, null, 0x017d, null, null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
      0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x0178
    ]
    const reverse = new Map<number, number>()
    CP1252_HIGH.forEach((cp, i) => {
      if (cp !== null) reverse.set(cp, 0x80 + i)
    })

    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code <= 0xff) {
        out[i] = code
      } else if (reverse.has(code)) {
        out[i] = reverse.get(code) as number
      } else {
        out[i] = 0x3f
      }
    }
    return out
  }
}
