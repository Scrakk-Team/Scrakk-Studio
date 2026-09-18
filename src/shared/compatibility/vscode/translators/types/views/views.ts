/**
 * Traductor de PANELES: vsix (viewsContainers.activitybar + views + main)
 * → SEF contributes.views + `runtime` para el Extension Host.
 *
 * Es la pieza que convierte "una extensión con un panel en la activity bar"
 * en algo instalable en Scrakk Studio. A diferencia de un tema, el contenido
 * del panel NO es declarativo: lo produce la extensión en runtime. Por eso el
 * traductor hace DOS cosas a la vez:
 *
 *  1. Declara el contenedor (botón de la activity bar) y sus vistas, para que
 *     el IDE sepa que existen ANTES de ejecutar nada. * 2. Copia el paquete COMPLETO con sus rutas originales y marca `runtime` en
 *     el manifest, para que el Extension Host pueda cargar el entry y producir
 *     el contenido.
 *
 * ── POR QUÉ SE COPIA TODO (y con las rutas intactas) ──────────────────────
 * Copiar sólo el archivo del entry parece suficiente (muchas extensiones vienen
 * empaquetadas en un único archivo) pero rompe el caso igual de común de las
 * extensiones multi-archivo: el entry hace `require('./anchorIndex')` y esos
 * módulos, los assets de `media/` y los `node_modules` empaquetados tienen que
 * estar EN LA MISMA ubicación relativa que en el vsix.
 *
 * Además las rutas tienen que quedar en la RAÍZ del paquete SEF, porque el
 * host le da a la extensión `context.extensionPath` = raíz del SEF: si los
 * archivos vivieran en `runtime/`, `context.asAbsolutePath('media/x.css')` y
 * los `asWebviewUri` apuntarían a la nada.
 */

import type { MappedApi, VsixFileEntry, VsixPackageJson } from '../../../../types'
import { decodeText, resolveVsixFile, toBase64Binary } from '../../../extract'

export interface ViewsTranslation {
  contributions: Array<Record<string, unknown>>
  /** `ruta en el SEF` → contenido (bytes: el paquete trae binarios). */
  assets: Map<string, Uint8Array>
  mapped: MappedApi[]
  /** Campos extra del manifest SEF (acá: `runtime`). */
  manifestExtras: Record<string, unknown>
}

/** Archivos que el paquete SEF escribe y que la extensión no puede pisar. */
const RESERVED_FILES = new Set(['manifest.json', '.source.json'])

/** Saca el prefijo `extension/` (o la carpeta raíz que traiga el zip). */
function stripRoot(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  const match = /^(?:extension|package)\/(.+)$/.exec(normalized)
  return match ? match[1] : normalized
}

interface RawContainer {
  id?: string
  title?: string
  icon?: string
}

interface RawView {
  id?: string
  name?: string
  type?: string
  /** Cláusula `when` de VS Code (claves de contexto). */
  when?: string
  /** Visibilidad inicial: 'visible' | 'collapsed' | 'hidden'. */
  visibility?: string
}

/**
 * `contributes.viewsWelcome[]`: el contenido que la extensión declara para
 * cuando su vista NO tiene nodos (texto + botones de comando).
 */
interface RawViewWelcome {
  view?: string
  contents?: string
  when?: string
  group?: string
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

/** ¿El manifest aporta vistas con contenido? */
export function detectViews(manifest: VsixPackageJson): boolean {
  const views = manifest.contributes?.views as Record<string, unknown> | undefined
  if (!views || typeof views !== 'object') return false
  return Object.values(views).some((list) => Array.isArray(list) && list.length > 0)
}

/**
 * Icono del contenedor listo para pintar en la activity bar.
 * Un `.svg` va inline (hereda `currentColor` del tema); un raster va como
 * `<img>` con data URI.
 */
function readContainerIcon(
  iconPath: string,
  files: VsixFileEntry[]
): { svg: string; note: string } | null {
  const file = resolveVsixFile(iconPath, files)
  if (!file || file.data.length === 0) return null
  const lower = iconPath.toLowerCase()
  if (lower.endsWith('.svg')) {
    return { svg: decodeText(file.data), note: 'icono SVG inline' }
  }
  const dot = lower.lastIndexOf('.')
  const mime = dot >= 0 ? IMAGE_MIME[lower.slice(dot)] : undefined
  if (!mime) return null
  const source = `data:${mime};base64,${toBase64Binary(file.data)}`
  return {
    svg: `<img src="${source}" alt="" width="100%" height="100%" />`,
    note: 'icono raster como data URI'
  }
}

export function translateViews(
  manifest: VsixPackageJson,
  files: VsixFileEntry[],
  opts: { extensionId: string }
): ViewsTranslation {
  void opts
  const contributions: ViewsTranslation['contributions'] = []
  const assets = new Map<string, Uint8Array>()
  const mapped: MappedApi[] = []
  const manifestExtras: Record<string, unknown> = {}

  const contributes = manifest.contributes ?? {}

  // 0) `viewsWelcome` por vista: es DATA y se resuelve ANTES de armar las
  //    vistas, porque el contenido viaja pegado a la vista que lo usa.
  const welcomeByView = new Map<string, Array<{ contents: string; when?: string }>>()
  const rawWelcome = contributes.viewsWelcome
  if (Array.isArray(rawWelcome)) {
    for (const item of rawWelcome as RawViewWelcome[]) {
      if (!item || typeof item.view !== 'string' || typeof item.contents !== 'string') continue
      if (item.contents.trim().length === 0) continue
      const list = welcomeByView.get(item.view) ?? []
      list.push({
        contents: item.contents,
        when: typeof item.when === 'string' && item.when.trim().length > 0 ? item.when.trim() : undefined
      })
      welcomeByView.set(item.view, list)
    }
  }

  // 1) Contenedores de la activity bar (id → título + icono).
  const containers = new Map<string, RawContainer>()
  const rawContainers = (contributes.viewsContainers as Record<string, unknown> | undefined)
    ?.activitybar
  if (Array.isArray(rawContainers)) {
    for (const item of rawContainers as RawContainer[]) {
      if (item && typeof item.id === 'string') containers.set(item.id, item)
    }
  }

  // 2) Vistas por contenedor.
  const viewsMap = (contributes.views ?? {}) as Record<string, unknown>
  let order = 10
  let translatedViews = 0
  let translatedWelcome = 0

  for (const [containerId, rawList] of Object.entries(viewsMap)) {
    if (!Array.isArray(rawList) || rawList.length === 0) continue
    const container = containers.get(containerId)

    let iconSvg: string | undefined
    let iconNote = 'sin icono: se usa el genérico del IDE'
    if (container?.icon) {
      const icon = readContainerIcon(container.icon, files)
      if (icon) {
        iconSvg = icon.svg
        iconNote = icon.note
      } else {
        iconNote = `no se pudo leer el icono ${container.icon}`
      }
    }

    let count = 0
    for (const rawView of rawList as RawView[]) {
      if (!rawView || typeof rawView.id !== 'string' || typeof rawView.name !== 'string') continue
      const contribution: Record<string, unknown> = {
        id: rawView.id,
        name: rawView.name,
        container: containerId,
        containerTitle: container?.title ?? rawView.name,
        iconSvg,
        order: order++
      }
      // `when` se traduce tal cual: la cláusula es data, no código. El IDE la
      // evalúa contra las claves que la extensión publica con `setContext`.
      if (typeof rawView.when === 'string' && rawView.when.trim().length > 0) {
        contribution.when = rawView.when.trim()
      }
      // `visibility` de VS Code:
      //  - 'collapsed' → la sección arranca plegada (como en VS Code).
      //  - 'hidden'    → la vista arranca oculta (no se muestra su sección).
      // Se traduce tal cual; el panel decide qué hacer con eso.
      const visibility = typeof rawView.visibility === 'string' ? rawView.visibility : undefined
      if (visibility === 'collapsed') contribution.collapsed = true
      if (visibility === 'hidden') contribution.hidden = true

      // El contenido de la vista vacía viaja con la vista (y sale del mapa:
      // lo que sobra al final es `viewsWelcome` de vistas que no existen acá).
      const welcome = welcomeByView.get(rawView.id)
      if (welcome) {
        contribution.welcome = welcome
        translatedWelcome += welcome.length
        welcomeByView.delete(rawView.id)
      }
      contributions.push(contribution)
      count++
    }
    if (count === 0) continue
    translatedViews += count

    mapped.push({
      source: `viewsContainers.activitybar:${containerId}`,
      target: 'SEF contributes.views',
      support: container ? 'full' : 'partial',
      note:
        `${count} vista(s) → botón + panel en la activity bar (${iconNote})` +
        (container ? '' : '; el contenedor no está declarado: se usan datos de la vista')
    })
  }

  if (translatedWelcome > 0) {
    mapped.push({
      source: 'viewsWelcome',
      target: 'SEF contributes.views[].welcome',
      support: 'full',
      note: `${translatedWelcome} contenido(s) de vista vacía traducidos (texto + botones de comando)`
    })
  }

  // 2.1) `viewsWelcome` que quedó sin destino: la vista no está entre las
  //      traducidas (vistas built-in del IDE, o un id mal escrito). Se dice,
  //      en vez de desaparecer sin dejar rastro.
  if (welcomeByView.size > 0) {
    const views = [...welcomeByView.keys()]
    mapped.push({
      source: `viewsWelcome:${views.join(',')}`,
      target: null,
      support: 'none',
      note:
        `el contenido de vista vacía de ${views.length} vista(s) no se pudo ubicar: ` +
        'la vista no está declarada en `contributes.views`'
    })
  }

  // 3) Entry Node → paquete SEF (todo el paquete, rutas intactas) + `runtime`.
  const entry = typeof manifest.main === 'string' && manifest.main.length > 0 ? manifest.main : undefined
  if (entry) {
    const file = resolveVsixFile(entry, files)
    if (file && file.data.length > 0) {
      let copied = 0
      let skipped = 0
      for (const vsixFile of files) {
        const relative = stripRoot(vsixFile.path)
        if (relative.length === 0 || relative.endsWith('/')) continue
        if (RESERVED_FILES.has(relative) || RESERVED_FILES.has(relative.split('/').pop() ?? '')) {
          skipped++
          continue
        }
        // Los MISMOS bytes y la MISMA ruta relativa que en el vsix: así los
        // `require('./x')`, los assets de `media/` y `context.asAbsolutePath`
        // resuelven igual que en VS Code.
        assets.set(relative, vsixFile.data)
        copied++
      }
      // La ruta del entry tal cual la declaró la extensión. Node resuelve
      // `./out/extension` → `out/extension.js` igual que en VS Code.
      manifestExtras.runtime = { kind: 'node', entry: stripRoot(entry) }
      mapped.push({
        source: `main:${entry}`,
        target: 'Extension Host (proceso Node aparte)',
        support: 'partial',
        note:
          `paquete copiado (${copied} archivo(s)` +
          (skipped > 0 ? `, ${skipped} omitido(s) por colisión` : '') +
          '); las dependencias nativas (.node) y las APIs que el host aún no ' +
          'implementa fallan con error visible'
      })
    } else {
      mapped.push({
        source: `main:${entry}`,
        target: null,
        support: 'none',
        note: `no se encontró ${entry} en el paquete`
      })
    }
  } else if (typeof manifest.browser === 'string') {
    mapped.push({
      source: `browser:${manifest.browser}`,
      target: null,
      support: 'none',
      note: 'web extensions (`browser`) todavía no tienen host: no se ejecuta código'
    })
  }

  return { contributions, assets, mapped, manifestExtras }
}

/** Cantidad de vistas traducidas (para el resumen de instalación). */
export function countViews(translation: ViewsTranslation): number {
  return translation.contributions.length
}
