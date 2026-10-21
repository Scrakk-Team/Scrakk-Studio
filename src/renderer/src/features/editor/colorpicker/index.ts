// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Color picker del editor — la UI la dibuja el frontend, el motor los datos. */

export { ColorPickerPanel } from './ColorPickerPanel'
export { ColorSwatchLayer } from './ColorSwatchLayer'
export { COLOR_TOKENS_EVENT, PICKER, PICKER_H, PICKER_W, parseColorTokens } from './types'
export type { ColorTokenInfo, Hsva, Rgba } from './types'
export { hsvaToRgba, parseHex, rgbaToCss, rgbaToHex, rgbaToHsva } from './colorMath'
