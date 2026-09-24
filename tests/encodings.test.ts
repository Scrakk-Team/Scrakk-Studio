// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del sistema de codificaciones (main): codecs, detección, servicio.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { utf8Codec, utf8BomCodec } from '../src/main/encodings/codecs/utf8'
import {
  utf16LeCodec,
  utf16LeBomCodec,
  utf16BeCodec,
  utf16BeBomCodec
} from '../src/main/encodings/codecs/utf16'
import { latin1Codec } from '../src/main/encodings/codecs/latin1'
import { BUILTIN_CODECS } from '../src/main/encodings/codecs'
import { detectEncoding, looksBinary } from '../src/main/encodings/detect'
import {
  registerDynamic,
  removeDynamic,
  listEncodings,
  hasEncoding,
  isRendererDelegated
} from '../src/main/encodings/registry'
import { readFileEncoded, writeFileEncoded } from '../src/main/encodings/service'
import { detectLineEnding, convertLineEndings } from '../src/shared/encodings'

const ALL = [utf8Codec, utf8BomCodec, utf16LeCodec, utf16LeBomCodec, utf16BeCodec, utf16BeBomCodec, latin1Codec]

describe('codecs builtin', () => {
  it('hay un archivo por familia y todos están en el index', () => {
    expect(BUILTIN_CODECS.length).toBe(7)
    const ids = BUILTIN_CODECS.map((c) => c.id)
    expect(new Set(ids).size).toBe(7)
  })

  it.each(ALL.map((c) => [c.id, c] as const))('roundtrip %s', (_id, codec) => {
    const text = 'hola áéíóú 🎉 中文 \r\nmundo\nlínea3\r\n'
    const decoded = codec.decode(codec.encode(text))
    // Latin-1 no representa emoji ni CJK → se espera pérdida conocida.
    if (codec.id === 'latin1') return
    expect(decoded).toBe(text)
  })

  it('utf8-bom escribe EF BB BF y lo quita al decodificar', () => {
    const bytes = utf8BomCodec.encode('hola')
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    expect(utf8BomCodec.decode(bytes)).toBe('hola')
  })

  it('utf16le-bom escribe FF FE; utf16be-bom escribe FE FF', () => {
    expect([...utf16LeBomCodec.encode('a').slice(0, 2)]).toEqual([0xff, 0xfe])
    expect([...utf16BeBomCodec.encode('a').slice(0, 2)]).toEqual([0xfe, 0xff])
  })

  it('latin1 decodifica acentos Windows-1252 (0xE1 → á)', () => {
    expect(latin1Codec.decode(new Uint8Array([0xe1, 0xe9, 0xed]))).toBe('áéí')
    // € (0x80 en cp1252) va y viene.
    expect(latin1Codec.encode('€')[0]).toBe(0x80)
  })

  it('latin1 reemplaza no-representables con "?" sin tirar (surrogate = 2 units)', () => {
    const out = latin1Codec.encode('a🎉b')
    // 🎉 es surrogate pair → 2 code units → 2 bytes '?'
    expect(out.length).toBe(4)
    expect(out[1]).toBe(0x3f)
    expect(out[2]).toBe(0x3f)
  })
})

describe('detectEncoding', () => {
  it('detecta los tres BOMs', () => {
    expect(detectEncoding(utf8BomCodec.encode('x')).encoding).toBe('utf8-bom')
    expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x61, 0x00])).encoding).toBe('utf16le-bom')
    expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x61])).encoding).toBe('utf16be-bom')
  })

  it('UTF-8 válido sin BOM → utf8 limpio', () => {
    const d = detectEncoding(utf8Codec.encode('hola mundo\n'))
    expect(d.encoding).toBe('utf8')
    expect(d.lossy).toBe(false)
  })

  it('Latin-1 con acentos → latin1 lossy=false (1252 no usa U+FFFD)', () => {
    const d = detectEncoding(new Uint8Array([0x68, 0x6f, 0xe1])) // "hoá"
    expect(d.encoding).toBe('latin1')
    expect(d.binary).toBe(false)
  })

  it('binario con NULs → binary=true', () => {
    expect(looksBinary(new Uint8Array([0x00, 0x00, 0x01, 0x02]))).toBe(true)
    expect(detectEncoding(new Uint8Array(64)).binary).toBe(true)
  })
})

describe('line endings', () => {
  it('detecta LF y CRLF dominantes', () => {
    expect(detectLineEnding('a\nb\nc')).toBe('LF')
    expect(detectLineEnding('a\r\nb\r\nc')).toBe('CRLF')
    expect(detectLineEnding('')).toBe('LF')
  })

  it('convierte entre EOLs idempotentemente', () => {
    expect(convertLineEndings('a\r\nb\rc\nd', 'LF')).toBe('a\nb\nc\nd')
    expect(convertLineEndings(convertLineEndings('a\nb', 'CRLF'), 'CRLF')).toBe('a\r\nb')
  })
})

describe('registry dinámico', () => {
  it('registra/elimina codecs de extensión sin pisar builtins', () => {
    const before = listEncodings().length
    const ids = registerDynamic({
      extensionId: 'ext-test',
      codecs: [{ id: 'koi8-r', label: 'KOI8-R' }, { id: 'utf8', label: 'FAKE' }]
    })
    expect(ids).toEqual(['koi8-r'])
    expect(listEncodings().length).toBe(before + 1)
    expect(hasEncoding('koi8-r')).toBe(true)
    expect(isRendererDelegated('koi8-r')).toBe(true)

    removeDynamic('ext-test')
    expect(hasEncoding('koi8-r')).toBe(false)
  })
})

describe('service I/O con tmpdir', () => {
  const dirs: string[] = []

  beforeEach(async () => {
    dirs.push(await mkdtemp(join(tmpdir(), 'scrakk-enc-')))
  })

  afterAll(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {})
    }
  })

  function lastDir(): string {
    return dirs[dirs.length - 1]
  }

  it('write+read roundtrip UTF-8 conserva texto y detecta encoding', async () => {
    const p = join(lastDir(), 'a.txt')
    const w = await writeFileEncoded(p, 'hola áéíóú\n', { encoding: 'utf8' })
    expect(w.success).toBe(true)
    const r = await readFileEncoded(p)
    expect(r.success).toBe(true)
    expect(r.text).toBe('hola áéíóú\n')
    expect(r.detected?.encoding).toBe('utf8')
    expect(r.detected?.hasBom).toBe(false)
  })

  it('write con BOM → read detecta utf8-bom y el texto viene SIN \\uFEFF', async () => {
    const p = join(lastDir(), 'b.txt')
    await writeFileEncoded(p, 'contenido', { encoding: 'utf8-bom' })
    const raw = await readFile(p)
    expect(raw[0]).toBe(0xef)
    const r = await readFileEncoded(p)
    expect(r.detected?.encoding).toBe('utf8-bom')
    expect(r.text?.startsWith('\uFEFF')).toBe(false)
    expect(r.text).toBe('contenido')
  })

  it('preserveBom=false sobre utf8-bom escribe SIN BOM', async () => {
    const p = join(lastDir(), 'c.txt')
    await writeFileEncoded(p, 'x', { encoding: 'utf8-bom', preserveBom: false })
    const raw = await readFile(p)
    expect(raw[0]).not.toBe(0xef)
  })

  it('convierte CRLF al escribir si lineEnding=CRLF', async () => {
    const p = join(lastDir(), 'd.txt')
    await writeFileEncoded(p, 'l1\nl2\n', { encoding: 'utf8', lineEnding: 'CRLF' })
    const r = await readFileEncoded(p)
    expect(r.text).toBe('l1\r\nl2\r\n')
  })

  it('rechaza binarios con mensaje claro', async () => {
    const p = join(lastDir(), 'e.bin')
    await writeFile(p, new Uint8Array([0x4c, 0x00, 0x00, 0x01]))
    const r = await readFileEncoded(p)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/binario/i)
  })

  it('roundtrip UTF-16 LE con BOM en disco real', async () => {
    const p = join(lastDir(), 'f.txt')
    const w = await writeFileEncoded(p, 'unicode ✓ 日本', { encoding: 'utf16le-bom' })
    expect(w.success).toBe(true)
    const r = await readFileEncoded(p)
    expect(r.detected?.encoding).toBe('utf16le-bom')
    expect(r.text).toBe('unicode ✓ 日本')
  })
})
