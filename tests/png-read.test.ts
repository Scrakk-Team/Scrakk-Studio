import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodePng, diffNeutralToVivid, diffStrong, isNeutral, isVivid } from '../tools/lib/png-read.mjs'

/**
 * El decodificador y el diff A/B son las herramientas con las que se verifica que
 * el editor PINTA. Un bug acá no rompe la app: hace que un probe diga "todo ok"
 * cuando no lo está (o al revés). Eso ya pasó una vez — el conteo de "píxeles con
 * tinte" contaba el wallpaper — así que la herramienta tiene su propio test.
 */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  let pos = 0
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0 // filtro None: el caso que produce Electron
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      raw[pos++] = r
      raw[pos++] = g
      raw[pos++] = b
      raw[pos++] = 255
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4) // CRC ignorado por el lector
    return Buffer.concat([length, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

describe('decodificador PNG', () => {
  it('decodifica píxeles y dimensiones (RGBA, filtro None)', () => {
    const image = decodePng(png(3, 2, (x, y) => [x * 10, y * 20, 5]))
    expect(image.width).toBe(3)
    expect(image.height).toBe(2)
    // (2,1) → r=20, g=20, b=5
    const i = (1 * 3 + 2) * 4
    expect([image.data[i], image.data[i + 1], image.data[i + 2]]).toEqual([20, 20, 5])
  })

  it('rechaza algo que no es PNG', () => {
    expect(() => decodePng(Buffer.from('no soy un png'))).toThrow()
  })

  it('normaliza a RGBA un PNG RGB (3 canales)', () => {
    // `capturePage()` de Electron produce PNG SIN alfa. Si el decodificador
    // devolviera 3 canales, todo consumidor que recorre con paso 4 leería bytes
    // corridos: los conteos de color saldrían mal sin fallar. El test fija el
    // contrato: SIEMPRE 4 canales, con alfa opaco.
    const width = 3
    const height = 1
    const stride = width * 3
    const raw = Buffer.alloc(height * (stride + 1))
    raw[0] = 0
    raw[1] = 10; raw[2] = 20; raw[3] = 30
    raw[4] = 40; raw[5] = 50; raw[6] = 60
    raw[7] = 70; raw[8] = 80; raw[9] = 90
    const chunk = (type: string, data: Buffer): Buffer => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(data.length)
      return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 2 // truecolor SIN alfa
    const image = decodePng(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0))
      ])
    )
    expect(image.channels).toBe(4)
    expect(image.data.length).toBe(width * height * 4)
    expect([image.data[4], image.data[5], image.data[6], image.data[7]]).toEqual([40, 50, 60, 255])
    expect([image.data[8], image.data[9], image.data[10], image.data[11]]).toEqual([70, 80, 90, 255])
  })

  it('aplica los filtros por fila (Sub/Up)', () => {
    // Fila 0 con filtro Sub y fila 1 con filtro Up: si el unfilter estuviera
    // mal, los píxeles saldrían desplazados y el mapa de color mentiría.
    const width = 2
    const height = 2
    const rows = Buffer.from([
      1, 100, 0, 0, 255, 10, 0, 0, 255, // fila 0: Sub (100, 110)
      2, 5, 0, 0, 255, 5, 0, 0, 255 // fila 1: Up (+ fila anterior)
    ])
    const chunk = (type: string, data: Buffer): Buffer => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(data.length)
      return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    const image = decodePng(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(rows)),
        chunk('IEND', Buffer.alloc(0))
      ])
    )
    expect(image.data[(0 * width + 0) * 4]).toBe(100)
    expect(image.data[(0 * width + 1) * 4]).toBe(110)
    expect(image.data[(1 * width + 0) * 4]).toBe(105)
    expect(image.data[(1 * width + 1) * 4]).toBe(115)
  })
})

describe('clasificación de color', () => {
  it('separa texto sin color (gris) de color de token', () => {
    expect(isNeutral(200, 200, 200)).toBe(true)
    expect(isVivid(200, 200, 200)).toBe(false)
    expect(isVivid(249, 115, 22)).toBe(true)
    expect(isVivid(20, 25, 22)).toBe(false)
  })
})

describe('diff A/B de capturas', () => {
  it('cuenta los píxeles que pasan de gris a color', () => {
    const before = decodePng(png(4, 1, () => [200, 200, 200]))
    const after = decodePng(
      png(4, 1, (x) => (x < 2 ? [249, 115, 22] : [200, 200, 200]))
    )
    const diff = diffNeutralToVivid(before, after)
    expect(diff.vivid).toBe(2)
    expect(diff.samples[0]).toBe('200,200,200 → 249,115,22')
  })

  it('no cuenta el color que ya estaba (fondo con degradado)', () => {
    // Las dos capturas son el mismo wallpaper: mismo color vívido en ambas. Un
    // chequeo que mire "hay color" daría verde; el diff tiene que dar 0.
    const before = decodePng(png(4, 1, () => [40, 145, 87]))
    const after = decodePng(png(4, 1, () => [40, 145, 87]))
    expect(diffNeutralToVivid(before, after).vivid).toBe(0)
  })
})

/**
 * `diffStrong` es el diff de los cambios que NO son gris → color: el pintado de
 * una SELECCIÓN (oscurece un fondo que ya tenía color) y el PLEGADO (el texto
 * desaparece). Con `diffNeutralToVivid` esos dos dan 0 y el probe parecería
 * decir que la feature no funciona.
 */
describe('diff A/B de cambios fuertes', () => {
  it('cuenta los píxeles que cambiaron, sin importar de qué color a qué color', () => {
    const before = decodePng(png(6, 1, () => [40, 145, 87]))
    const after = decodePng(png(6, 1, (x) => (x < 3 ? [20, 80, 50] : [40, 145, 87])))
    const diff = diffStrong(before, after)
    expect(diff.changed).toBe(3)
    expect(diff.samples[0]).toBe('40,145,87 → 20,80,50')
  })

  it('recorta a la región pedida (p. ej. sólo el gutter)', () => {
    // El texto entero cambió, pero la región es la columna 0..1: sólo esos dos
    // píxeles cuentan. Es lo que permite decir "cambió el chevron" sin que el
    // texto del costado ensucie el número.
    const before = decodePng(png(6, 1, () => [40, 145, 87]))
    const after = decodePng(png(6, 1, () => [250, 250, 250]))
    const diff = diffStrong(before, after, { x: 0, y: 0, width: 2, height: 1 })
    expect(diff.changed).toBe(2)
    expect(diff.width).toBe(2)
    expect(diff.height).toBe(1)
  })

  it('dos capturas iguales no cuentan nada', () => {
    const before = decodePng(png(4, 2, (x, y) => [x * 20, y * 30, 7]))
    const after = decodePng(png(4, 2, (x, y) => [x * 20, y * 30, 7]))
    expect(diffStrong(before, after).changed).toBe(0)
  })

  it('un cambio chico (dithering del canvas) no cuenta', () => {
    const before = decodePng(png(4, 1, () => [40, 145, 87]))
    const after = decodePng(png(4, 1, () => [44, 150, 90]))
    expect(diffStrong(before, after).changed).toBe(0)
  })

  it('el umbral se puede subir explícitamente', () => {
    // El cambio de una selección mueve el fondo ~120 de delta total: con el
    // umbral por defecto cuenta, con uno alto (como el del tokenizado) no.
    const before = decodePng(png(4, 1, () => [40, 145, 87]))
    const after = decodePng(png(4, 1, () => [20, 80, 50]))
    expect(diffStrong(before, after).changed).toBe(4)
    expect(diffStrong(before, after, undefined, 150).changed).toBe(0)
  })
})
