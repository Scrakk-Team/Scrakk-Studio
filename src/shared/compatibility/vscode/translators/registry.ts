/**
 * Registry de traductores VSIX → SEF.
 *
 * Cada entrada traduce UN contribution point a UN kind SEF. Agregar soporte
 * (snippets, grammars, productIcons…) = nueva carpeta en
 * translators/types/<kind>/ + una línea acá. El pipeline itera el registry:
 * no conoce kinds concretos.
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../types'
import { detectIconThemes, translateIconThemes } from './types/icons/icons'
import { detectColorThemes, translateColorThemes } from './types/themes/themes'
import { detectProductIconThemes, translateProductIconThemes } from './types/product-icons/product-icons'
import { detectViews, translateViews } from './types/views/views'
import { detectLanguages, translateLanguages } from './types/languages/languages'

export interface TranslatorResult {
  /** Key SEF (ej 'fileIcons'). */
  sefKind: string
  contributions: Array<Record<string, unknown>>
  /**
   * path relativo en el SEF → contenido. Texto para lo declarativo (JSON) y
   * bytes para el paquete copiado tal cual (el caso de las extensiones con
   * código: assets binarios, `node_modules` empaquetados, etc.).
   */
  assets: Map<string, string | Uint8Array>
  mapped: MappedApi[]
  /**
   * Campos extra que el traductor necesita en el manifest SEF (ej. `runtime`
   * para las extensiones con código). El pipeline los fusiona tal cual.
   */
  manifestExtras?: Record<string, unknown>
}

interface TranslatorEntry {
  /** Key de contributes.* que detecta. */
  vsixKey: string
  sefKind: string
  detect: (manifest: VsixPackageJson) => boolean
  translate: (
    manifest: VsixPackageJson,
    files: VsixFileEntry[],
    opts: { extensionId: string }
  ) => TranslatorResult
}

function adapt(
  sefKind: string,
  out: {
    contributions: Array<Record<string, unknown>>
    assets: Map<string, string | Uint8Array>
    mapped: MappedApi[]
    manifestExtras?: Record<string, unknown>
  }
): TranslatorResult {
  return {
    sefKind,
    contributions: out.contributions,
    assets: out.assets,
    mapped: out.mapped,
    manifestExtras: out.manifestExtras
  }
}

export const TRANSLATORS: TranslatorEntry[] = [
  {
    vsixKey: 'iconThemes',
    sefKind: 'fileIcons',
    detect: detectIconThemes,
    translate: (manifest, files, opts) => {
      const out = translateIconThemes(manifest, files, opts)
      return adapt('fileIcons', {
        contributions: out.contributions as unknown as Array<Record<string, unknown>>,
        assets: out.assets,
        mapped: out.mapped
      })
    }
  },
  {
    vsixKey: 'themes',
    sefKind: 'themes',
    detect: detectColorThemes,
    translate: (manifest, files, opts) => {
      const out = translateColorThemes(manifest, files, opts)
      return adapt('themes', {
        contributions: out.contributions as unknown as Array<Record<string, unknown>>,
        assets: out.assets,
        mapped: out.mapped
      })
    }
  },
  {
    vsixKey: 'productIconThemes',
    sefKind: 'productIcons',
    detect: detectProductIconThemes,
    translate: (manifest, files, opts) => {
      const out = translateProductIconThemes(manifest, files, opts)
      return adapt('productIcons', {
        contributions: out.contributions as unknown as Array<Record<string, unknown>>,
        assets: out.assets,
        mapped: out.mapped
      })
    }
  },
  {
    // Paneles de la activity bar + el código que los produce. Un solo
    // traductor para `views` y `viewsContainers` a propósito: el pipeline
    // escribe UNA key del manifest por `sefKind`, así que dos traductores al
    // mismo kind se pisarían.
    vsixKey: 'views',
    sefKind: 'views',
    detect: detectViews,
    translate: (manifest, files, opts) => adapt('views', translateViews(manifest, files, opts))
  },
  {
    // Kit de lenguaje: UNA contribución SEF que junta `languages` + `grammars`
    // + `snippets` + `semanticTokenScopes` + `configurationDefaults`. Mismo
    // motivo que views: un solo traductor por `sefKind`, y estos cinco puntos
    // son una sola cosa conceptual (una extensión de lenguaje).
    vsixKey: 'languages',
    sefKind: 'languages',
    detect: detectLanguages,
    translate: (manifest, files, opts) => adapt('languages', translateLanguages(manifest, files, opts))
  }
]
