import type { EditorEngine, EditorEngineId } from '../../engine'
import { getInnertaModule, createIsolatedInnertaModule } from './innertaLoader'
import { wireInnertaInput, type InnertaInputHandle } from './innertaInput'
import { applyInnertaTheme, listenThemeChanges } from './innertaTheme'
import { attachHostBridge, type InnertaBridge } from './hostBridge'
import { refreshSemanticTokens } from './semanticTokensBridge'
import { clearLanguageHighlight, refreshLanguageHighlight } from './languageHighlightBridge'
import { clearDynamicHighlight, refreshDynamicHighlight } from './treeSitterHighlightBridge'
import { applyInnertaFolds } from './hostBridge'
import { GRAMMAR_ENGINE_EVENT } from './grammarSelection'
import { autoPairsForPath, indentUnitFor } from './languageConfig'
import { detectLanguageFromPath } from '@features/editor/languages'
import { resetHostTokens } from './hostTokens'
import { getBookmarksForPath, subscribeToBookmarks } from '@services/bookmarks'
import { getDecorations, packDecorations, subscribeToDecorations } from '@services/decorations'

/** Contrato del engine Innerta (ITE) expuesto al puente del renderer. */
export interface InnertaModule {
  /** Inicializa el engine sobre el canvas del host (ya creado por el puente). */
  init(x: number, y: number, w: number, h: number): void
  shutdown(): void
  frame(): void
  setContent(text: string): void
  /** Abre un archivo: nombre para el chrome (breadcrumb) + contenido. */
  openFile(path: string, content: string): void
  setLanguage?(language: string): void
  setBounds(x: number, y: number, w: number, h: number): void
  setFocus(focused: boolean): void
  setTheme(theme: string): void
   /** Input desde el host (ver innertaInput.ts). */
  mouseMove(x: number, y: number): void
  mouseLeave(): void
  mouseButton(button: number, action: number, mods: number): void
  scroll(x: number, y: number): void
  key(key: number, action: number, mods: number): void
  char(codepoint: number): void
  /** WASM: hit-test para hover → { line, col } (0-based). */
  hitTest?(x: number, y: number): { line: number; col: number }
  /**
   * WASM: X donde arranca el texto (= ancho del gutter). El host lo usa para
   * saber cuándo el puntero está sobre el gutter y no pintar el I-beam ahí.
   * Opcional: si el WASM no lo expone, devuelve `null`.
   */
  getTextXOffset?(): number | null
  /**
   * WASM: posición actual del cursor del editor → { line, col } (0-based).
   * Opcional: si el engine no lo expone (versiones viejas del WASM) devuelve
   * null. Es la contraparte de lectura de `SetInnertaCursor` (C++).
   */
  getCursor?(): { line: number; col: number } | null
  /** WASM: precarga el clipboard del navegador para que Ctrl+V pegue. */
  setWasmClipboard?(text: string): void
  /** WASM: muestra/oculta el minimap del editor (columna derecha). */
  setMinimapVisible?(visible: boolean): void
  /** Bookmarks del archivo (líneas 0-based): el gutter dibuja el proicon. */
  setBookmarks?(lines: number[]): void
  /**
   * Mueve el cursor del editor (0-based). Es lo que usa “ir a la línea” del
   * outline y “ir a la definición” resuelto con el árbol (sin LSP).
   */
  setCursor?(line: number, col: number): void
  /**
   * Rangos plegables del host, como TRIPLETES `(startLine, endLine, kind)`.
   *
   * El motor sabe plegar por indentación; esto le agrega los rangos del ÁRBOL
   * (`folds.scm`), que es la única forma de plegar un lenguaje con llaves o de
   * plegar comentarios y regiones. `kind` sigue la convención de VS Code
   * (0 = región, 1 = comentario, 2 = imports).
   */
  setFoldingRanges?(ranges: number[]): void
  /**
   * Cuántos rangos plegables tiene el motor AHORA (`-1` si el build no expone
   * el getter).
   *
   * `setFoldingRanges` no devuelve nada: sin este getter el host sólo puede
   * afirmar "mandé los rangos", no "el motor los tiene". El puente lo usa para
   * que su línea de diagnóstico diga el estado REAL del plegado.
   */
  getFoldingCount?(): number
  /** Si los rangos plegables vigentes son los del host (y no por indentación). */
  foldingIsHost?(): boolean
  /** Si los rangos plegables los calculó el MOTOR con su `folds.scm` embebido. */
  foldingFromEngine?(): boolean
  /**
   * Subrayados del host, como SEXTUPLETES `(startLine, startCol, endLine,
   * endCol, rgba, style)` — columnas 0-based, `rgba` 0xRRGGBBAA y `style`
   * 0 ondulada / 1 recta / 2 punteada / 3 doble.
   *
   * Es el canal por el que el IDE pinta lo que vive DENTRO del texto: los
   * diagnósticos (LSP y de extensión) y cualquier decoración por rango que
   * agregue una extensión. Un array vacío limpia (es lo que se manda al abrir
   * otro archivo: sin eso quedan los subrayados del anterior).
   */
  setUnderlines?(data: number[]): void
  /**
   * Cuántos subrayados tiene el motor AHORA (`-1` si el build no expone el
   * getter). Es la contraparte de lectura de `setUnderlines`, que es `void`.
   */
  getUnderlineCount?(): number
  /**
   * Selecciona un RANGO exacto (ancla + extremo activo, 0-based).
   *
   * Es el canal del host para “expandir selección”: el árbol sabe que el objeto
   * es la función entera (`textobjects.scm`) y el motor no tiene por qué
   * adivinarlo con movimientos de teclado. Con ancla == activo se limpia.
   */
  setSelection?(anchorLine: number, anchorCol: number, activeLine: number, activeCol: number): void
  /** WASM: texto seleccionado actual ("" si no hay selección). */
  getSelectedText?(): string
  /** WASM: contenido completo del buffer (para guardar desde el host). */
  getText?(): string
  /**
   * WASM: contador monótono de mutaciones del buffer (fuente de verdad del
   * dirty del flujo de guardado). undefined en builds viejos del WASM.
   */
  getRevision?(): number
  /** WASM: marca la revisión como persistida en disco (dirty = false). */
  setCleanRevision?(revision: number): void
  // ── Sesiones (multi-archivo en UN módulo, patrón Zed) ──────────────────
  // Cada archivo abierto es una sesión con su estado COMPLETO (texto, undo,
  // cursor, scroll, folds). Cambiar de archivo es activar otra sesión.
  createSession?(id: string): void
  activateSession?(id: string): void
  destroySession?(id: string): void
  /** Texto de una sesión (funciona con la sesión inactiva). */
  getSessionText?(id: string): string
  /** Revisión del buffer de una sesión. */
  getSessionRevision?(id: string): number
  /** ¿La sesión tiene cambios sin guardar? (sin activarla). */
  isSessionDirty?(id: string): boolean
  /** Marca la revisión de una sesión como persistida. */
  setSessionCleanRevision?(id: string, revision: number): void
  /**
   * Pares de auto-cierre del LENGUAJE (`openers`/`closers` alineados). Sin
   * pares, el motor no auto-cierra nada.
   */
  setAutoPairs?(openers: string, closers: string): void
  /** Unidad de indentación del lenguaje (`\t` o N espacios). */
  setIndentUnit?(unit: string): void
  /** Nivel de indentación por línea (calculado de `indents.scm`). */
  setIndentLevels?(levels: number[]): void
  /**
   * WASM: bytes del heap lineal (HEAP8). 0 si el build no lo expone.
   * Sirve para medir RAM real del editor sin estimaciones.
   */
  heapBytes?(): number
  /** Theme de Scrakk → colores base del editor. */
  setBgColor(color: number): void
  setTerminalFont(fontPath: string): void
  getCharWidth(): number
  getLineHeight(): number
  resize(cols: number, rows: number): void
  // ── Terminal mouse protocol ──
  terminalMouseButton(button: number, pressed: boolean, row: number, col: number, mods: number): void
  terminalMouseMove(row: number, col: number, mods: number): void
  terminalReadOutput(): string
  isAltScreen(): boolean
  // ── Terminal selection (ES la selección del editor: m_selection) ──
  terminalHasSelection(): boolean
  terminalGetSelectionText(): string
  terminalClearSelection(): void
  terminalGetCursorRow(): number
  terminalGetCursorCol(): number
  setAccentColor(color: number): void
  setTextColor(color: number): void
  setBorderColor(color: number): void
  setTextMutedColor(color: number): void
  setIndentGuideColor(color: number): void
  setTokenColor(tokenTypeId: number, color: number): void
  /**
   * Tokens de color resueltos por el host (delta LSP) y fuente de resaltado
   * (0 = sólo tree-sitter embebido, 1 = sólo host, 2 = mixto).
   *
   * Es el ÚNICO canal de color para un lenguaje que el motor no tiene
   * compilado: la gramática de una extensión y los semantic tokens del LSP
   * entran por aquí.
   */
  setHostTokens?(data: number[], source: number): void
}

type PendingRequest = { text?: string; path?: string; content?: string }

// ── Minimap: setting global persistente + broadcast a los engines vivos ────
const MINIMAP_EVENT = 'innerta-minimap-changed'
export const MINIMAP_SETTING_KEY = 'scrakk-editor-minimap'

/** ¿El minimap está visible? (default: sí). */
export function getMinimapVisible(): boolean {
  try {
    return (localStorage.getItem(MINIMAP_SETTING_KEY) ?? 'true') !== 'false'
  } catch {
    return true
  }
}

/** Cambia el minimap en TODOS los engines vivos (editor + sesiones) y persiste. */
export function setMinimapVisibleEverywhere(visible: boolean): void {
  try {
    localStorage.setItem(MINIMAP_SETTING_KEY, visible ? 'true' : 'false')
  } catch {
    // Sin storage: solo aplica en runtime.
  }
  window.dispatchEvent(new CustomEvent(MINIMAP_EVENT, { detail: visible }))
}

/**
 * Puente hacia InnertaEngine compilado a WASM.
 *
 * El engine NO se reescribe: este puente solo envuelve la API C que ya
 * exporta (InitInnerta / SetInnertaBounds / SetInnertaContent / InnertaFrame /
 * SetInnertaFocus / SetInnertaTheme …) expuesta por la glue de emscripten.
 * La carga del artefacto (public/innerta/innerta.js + .wasm) es asíncrona;
 * cualquier petición previa al ready se encola y se aplica al conectarse.
 */
/** Contador para ids de canvas únicos (multi-sesión). */
let canvasSeq = 0

export class InnertaEngine implements EditorEngine {
  readonly id: EditorEngineId = 'InnertaEngine'

  /**
   * True = instancia AISLADA (cada una con su módulo WASM + canvas + loop).
   * La usa cada tab de archivo (multi-editor): así cada archivo conserva su
   * buffer/undo/scroll aunque haya otros editores visibles a la vez. El modo
   * default (compartido) queda para el engine singleton legacy.
   */
  private readonly isolated: boolean
  private host: HTMLElement | null = null

  constructor(opts?: { isolated?: boolean }) {
    this.isolated = opts?.isolated ?? false
  }
  private module: InnertaModule | null = null
  /** Bridge host↔engine de ESTA instancia (hooks C++ + menú + cursor). */
  private bridge: InnertaBridge | null = null
  /**
   * UNA sola promesa de módulo por engine. Re-attaches mientras el módulo
   * carga (StrictMode monta/desmonta/remonta en dev, o la tab se mueve a
   * otro slot antes de cargar) NO deben instanciar un segundo módulo WASM:
   * dos módulos sobre el mismo canvas → cada init() resetea el buffer y el
   * init del módulo tardío borra el contenido recién aplicado (archivos que
   * abren VACÍOS). Con una promesa única el .then resuelve UNA vez contra el
   * host ACTUAL al terminar de cargar.
   */
  private modulePromise: Promise<InnertaModule> | null = null
  private raf = 0
  private onResize: (() => void) | null = null
  private resizeObserver: ResizeObserver | null = null
  private inputHandle: InnertaInputHandle | null = null
  /** Unsubscribe del listener de tema (evita retener el engine tras destroy). */
  private themeUnsubscribe: (() => void) | null = null
  /** Unsubscribe del broadcast de minimap (mismo patrón que el tema). */
  private minimapUnsubscribe: (() => void) | null = null
  /** Unsubscribe del cambio de MOTOR de gramática (Ajustes → Resaltado). */
  private grammarUnsubscribe: (() => void) | null = null
  /** Unsubscribe de la store de bookmarks (empuja la lista al engine). */
  private bookmarksUnsubscribe: (() => void) | null = null
  /** Unsubscribe de la store de decoraciones (empuja los subrayados). */
  private decorationsUnsubscribe: (() => void) | null = null
  /** Path de ESTE engine (setPath del bridge lo espeja). */
  private currentPath: string | null = null
  private ready = false
  private pending: PendingRequest[] = []
  /** Sesiones de archivo que viven en ESTE módulo (ids = paths). */
  private fileSessions = new Set<string>()
  /** Esperas por "módulo listo" (la primera activación puede llegar antes). */
  private sessionReadyWaiters: Array<() => void> = []
  /** Canvas persistente entre remounts (tabs Welcome ↔ archivos). */
  private persistentCanvas: HTMLCanvasElement | null = null

  // ── Revisión / dirty (fuente: canal único de eventos del engine) ─────────
  /** Última revisión conocida del buffer (evento RevisionChanged). */
  private latestRevision = 0
  /** Revisión que el host confirmó en disco (save). ≤ latestRevision. */
  private cleanRevision = 0
  private lastDirty = false
  private revisionListeners = new Set<(revision: number) => void>()
  private dirtyListeners = new Set<(dirty: boolean) => void>()

  get statusText(): string | undefined {
    if (this.module) return 'InnertaEngine (ITE · WASM)'
    return 'Cargando InnertaEngine (ITE)…'
  }

  attach(host: HTMLElement): void {
    this.host = host

    // Canvas PERSISTENTE: sobrevive a remounts del panel (tabs Welcome ↔
    // archivos). Recrear el canvas mataba listeners/captura → clicks
    // fantasma. Re-parentar el mismo nodo conserva input y contexto.
    if (!this.persistentCanvas) {
      const canvas = document.createElement('canvas')
      canvas.className = 'scrakk-innerta-canvas'
      canvas.id = `scrakk-innerta-surface-${++canvasSeq}`
      canvas.tabIndex = 0
      this.persistentCanvas = canvas
    }

    const canvas = this.persistentCanvas
    host.appendChild(canvas)
    // dispose() lo esconde al desmontar; SIEMPRE restaurar visibilidad aquí.
    canvas.style.display = ''

    // Input del host → engine: una sola vez por canvas (los listeners viven
    // en el nodo persistente).
    if (!this.inputHandle) {
      this.inputHandle = wireInnertaInput(canvas, () => this.module)
    }

    const applyBounds = (): void => {
      if (this.module && this.host) {
        this.module.setBounds(0, 0, this.host.clientWidth, this.host.clientHeight)
      }
    }

    // RE-ATTACH rápido: módulo vivo de un montaje previo → re-parent hecho,
    // solo reanudar render + bounds. Sin doble init ni doble rAF.
    if (this.ready && this.module) {
      canvas.style.display = ''
      this.onResize = (): void => applyBounds()
      window.addEventListener('resize', this.onResize)
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(this.onResize)
        this.resizeObserver.observe(host)
      }
      applyBounds()
      if (this.raf === 0) {
        const loop = (): void => {
          if (!this.module) return
          this.module.frame()
          this.raf = requestAnimationFrame(loop)
        }
        this.raf = requestAnimationFrame(loop)
      }
      // La tab volvió a estar activa: el Ln/Col debe seguir a ESTE engine.
      requestAnimationFrame(() => this.bridge?.syncCursor())
      return
    }

    const onResize = (): void => applyBounds()
    this.onResize = onResize
    window.addEventListener('resize', onResize)

    // El host puede cambiar de tamaño sin resize de ventana (split, sidebar,
    // activity bar…): observa el layout real del host.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(onResize)
      this.resizeObserver.observe(host)
    }

    // ══ PRIMERA carga / módulo aún cargando ═══════════════════════════════
    // Sin promesa viva: se instancia el módulo UNA sola vez por engine.
    // Los re-attach que lleguen mientras carga (StrictMode monta/desmonta/
    // remonta en dev, tab movida a otro slot antes de cargar) NO crean un
    // segundo módulo: dos módulos aislados sobre el mismo canvas → cada
    // init() resetea el buffer y el init del módulo tardío borra el contenido
    // recién aplicado (los archivos abrían VACÍOS). El .then único resuelve
    // contra el host ACTUAL (this.host) y aplica el flush UNA sola vez.
    if (!this.modulePromise) {
      const moduleLoader = this.isolated
        ? createIsolatedInnertaModule(canvas)
        : getInnertaModule(canvas)
      this.modulePromise = moduleLoader
      moduleLoader
        .then((module) => {
          // destroy() (cerrar la tab) corrió mientras cargaba: apagar el
          // módulo huérfano; el próximo attach crea uno nuevo.
          if (this.modulePromise !== moduleLoader) {
            module.shutdown()
            this.settleReadyWaiters()
            return
          }
          // Sin host al resolver (cleanup de StrictMode antes de terminar la
          // carga): apagar y permitir reintento limpio en el próximo attach.
          if (!this.host) {
            this.modulePromise = null
            module.shutdown()
            // Despertar a quien esperaba: al re-attach se reintenta.
            this.settleReadyWaiters()
            return
          }
          this.module = module
          this.ready = true

          module.init(0, 0, this.host.clientWidth, this.host.clientHeight)
          module.setFocus(true)
          module.setTheme(document.documentElement.dataset.theme ?? 'dark')
          applyBounds()

          // RO + window resize contra el host ACTUAL: la resolución del módulo
          // puede llegar MUCHO después del primer attach (StrictMode), así que
          // el RO se arma aquí al quedar ready (un solo armado). El fast path
          // de un re-attach posterior lo re-crea si el host cambió.
          this.onResize = (): void => applyBounds()
          window.addEventListener('resize', this.onResize)
          if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver?.disconnect()
            this.resizeObserver = new ResizeObserver(this.onResize)
            this.resizeObserver.observe(this.host)
          }

          // Theme de Scrakk → Innerta (colores base + tokenColors).
          applyInnertaTheme(module)
          // Minimap: setting global al conectar el módulo.
          module.setMinimapVisible?.(getMinimapVisible())
          // Un solo listener por engine (el .then puede correr dos veces en
          // StrictMode): el anterior se suelta para no acumular observers.
          this.themeUnsubscribe?.()
          this.themeUnsubscribe = listenThemeChanges(() => {
            if (!this.module) return
            applyInnertaTheme(this.module)
            // El tema cambió: sus `tokenColors` también son REGLAS del resolutor
            // de scopes de las gramáticas de extensión. Sin re-tokenizar, el
            // archivo abierto seguiría con los slots del tema anterior.
            this.refreshHighlightFromBuffer(this.module.getText?.())
          })
          // Broadcast del toggle de minimap: aplica a este engine en vivo.
          this.minimapUnsubscribe?.()
          const onMinimapChanged = (): void => {
            if (this.module) this.module.setMinimapVisible?.(getMinimapVisible())
          }
          window.addEventListener(MINIMAP_EVENT, onMinimapChanged)
          this.minimapUnsubscribe = () => {
            window.removeEventListener(MINIMAP_EVENT, onMinimapChanged)
          }

          // Cambio de motor de gramática (TextMate ↔ árbol del paquete): se
          // re-tokeniza el archivo ABIERTO. Sin esto el ajuste recién se vería
          // al reabrir el archivo, que es exactamente lo que hace inútil una
          // opción de Ajustes.
          this.grammarUnsubscribe?.()
          const onGrammarEngineChanged = (): void => {
            // `immediate`: el usuario acaba de elegir en Ajustes y está mirando
            // el archivo. Con debounce se vería el color viejo ~250 ms más, y
            // es justo el momento en que está comparando los dos motores.
            this.refreshHighlightFromBuffer(this.module?.getText?.(), true)
          }
          window.addEventListener(GRAMMAR_ENGINE_EVENT, onGrammarEngineChanged)
          this.grammarUnsubscribe = () => {
            window.removeEventListener(GRAMMAR_ENGINE_EVENT, onGrammarEngineChanged)
          }

          // Bookmarks: push inicial + re-push cuando la store cambia
          // (toggle desde el menú contextual o el panel del ToolDock).
          this.pushBookmarks()
          this.bookmarksUnsubscribe?.()
          this.bookmarksUnsubscribe = subscribeToBookmarks(() => this.pushBookmarks())

          // Subrayados (diagnósticos LSP, extensiones, búsqueda): push inicial
          // —los diagnósticos suelen llegar ANTES que el módulo termine de
          // cargar— y re-push en cada cambio de la store.
          this.pushUnderlines()
          this.decorationsUnsubscribe?.()
          this.decorationsUnsubscribe = subscribeToDecorations(() => this.pushUnderlines())

          // Puente al IDE de ESTA instancia: hover LSP + menú contextual
          // atados a este module/canvas/path (con N engines vivos no puede
          // haber un solo bridge global — los hooks viven por instancia).
          this.bridge?.dispose()
          this.bridge = attachHostBridge(() => this.module, () => this.host, (rev) =>
            this.handleRevision(rev)
          )

          const loop = (): void => {
            if (!this.module) return
            this.module.frame()
            this.raf = requestAnimationFrame(loop)
          }
          // StrictMode puede correr este .then dos veces: un solo loop vivo.
          if (this.raf === 0) {
            this.raf = requestAnimationFrame(loop)
          }

          // Flush requests encolados mientras cargaba el módulo.
          const flush = this.pending
          this.pending = []
          for (const req of flush) this.apply(req)

          // Quien esperaba el módulo para activar una sesión, sigue ahora.
          this.settleReadyWaiters()

          // Refrescar el Ln/Col al conectar (abrir archivo = cursor en
          // 1:1 antes del primer click) y al quedar listo.
          requestAnimationFrame(() => this.bridge?.syncCursor())
        })
        .catch((err: unknown) => {
          // Sin artefacto: placeholder visual + aviso (solo si la sesión
          // sigue viva — un catch stale tras destroy no debe dibujar nada).
          if (this.modulePromise !== moduleLoader || !this.host) {
            this.settleReadyWaiters()
            return
          }
          this.modulePromise = null
          // Despertar a quien esperaba el módulo: sin esto `whenReady()`
          // quedaba pendiente para siempre y el archivo nunca cargaba.
          this.settleReadyWaiters()
          const msg = document.createElement('div')
          msg.className = 'scrakk-innerta-missing'
          msg.textContent = 'InnertaEngine (ITE): ' + String(err)
          this.host.appendChild(msg)
        })
    }
  }

  private apply(req: PendingRequest): void {
    if (!this.module) return
    if (req.path !== undefined && req.content !== undefined) {
      this.currentPath = req.path
      this.bridge?.setPath(req.path)
      this.module.openFile(req.path, req.content)
      applyInnertaTheme(this.module)
      this.pushBookmarks()
      // Recién Aquí el engine sabe su archivo. El push de la carga del módulo
      // corre antes (con `currentPath` todavía nulo → manda limpiar), y en ese
      // hueco caen los diagnósticos que llegaron mientras el WASM cargaba: sin
      // este push quedaban guardados en la store y sin pintar hasta que
      // pasara cualquier otra cosa (otro publish, un guardado, un undo).
      this.pushUnderlines()
      // Recién aquí existe el módulo: es LA llamada que hace que el primer
      // archivo abierto se pinte con la gramática de su extensión.
      this.startHighlightPipelines(req.path, req.content)
    } else if (req.text !== undefined) {
      this.module.setContent(req.text)
      // El contenido llegó sin path (restauración de sesión): el archivo ya
      // estaba abierto, así que sólo hay que re-tokenizar con la gramática.
      this.refreshHighlightFromBuffer(req.text)
    }
  }

  /** Empuja los bookmarks de ESTE archivo al engine (gutter). */
  private pushBookmarks(): void {
    if (this.currentPath && this.module) {
      this.module.setBookmarks?.(getBookmarksForPath(this.currentPath))
    }
  }

  /**
   * Empuja los subrayados del archivo de ESTE engine.
   *
   * Las decoraciones viven por ARCHIVO en la store (diagnósticos de N archivos
   * abiertos), pero cada módulo WASM es UNA vista: aquí se filtran las de este
   * archivo. Sin el filtro, los errores de `a.ts` se subrayarían sobre `b.ts`
   * (el mismo bug que ya tuvo el plegado con los rangos del archivo anterior).
   *
   * Un array VACÍO es la orden de limpiar: es lo que se manda al abrir otro
   * archivo y al cerrar la tab. Omitir la llamada dejaría pegados los
   * subrayados del archivo anterior.
   */
  private pushUnderlines(): void {
    const module = this.module
    if (!module || typeof module.setUnderlines !== 'function') return
    if (!this.currentPath) {
      module.setUnderlines([])
      return
    }
    module.setUnderlines(packDecorations(getDecorations(this.currentPath)))
  }

  setContent(text: string): void {
    if (this.ready && this.module) {
      this.module.setContent(text)
      this.refreshHighlightFromBuffer(text)
    } else {
      this.pending.push({ text })
    }
  }

  /**
   * Re-tokeniza con la gramática de la extensión tras un cambio de contenido.
   *
   * Se llama desde los dos caminos que mutan el buffer (el host empujando
   * `setContent` y el engine reportando `RevisionChanged`), siempre debounced
   * en el puente: tipear no puede tokenizar por tecla.
   */
  private refreshHighlightFromBuffer(text: string | undefined, immediate = false): void {
    const { module, currentPath } = this
    if (!module || !currentPath || text === undefined) return
    refreshLanguageHighlight(module, currentPath, text, { immediate })
    refreshDynamicHighlight(module, currentPath, text, { immediate })
  }

  loadFile(path: string, content: string): void {
    this.currentPath = path
    this.bridge?.setPath(path)
    if (this.ready && this.module) {
      this.module.openFile(path, content)
      applyInnertaTheme(this.module)
      this.pushBookmarks()
      requestAnimationFrame(() => this.bridge?.syncCursor())
    } else {
      this.pending.push({ path, content })
    }
    this.startHighlightPipelines(path, content)

    // El canvas gana foco al abrir un archivo: se puede escribir sin un click previo.
    this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')?.focus()
  }

  // ── Sesiones de archivo (un módulo, N archivos) ─────────────────────────

  /** Resuelve cuando el módulo está listo (activar sesiones puede llegar antes). */
  whenReady(): Promise<void> {
    if (this.module) return Promise.resolve()
    return new Promise((resolve) => {
      this.sessionReadyWaiters.push(resolve)
    })
  }

  /** ¿Este módulo ya tiene la sesión de ese archivo? */
  hasFileSession(id: string): boolean {
    return this.fileSessions.has(id)
  }

  /** ¿Queda alguna sesión viva en este módulo? */
  hasFileSessions(): boolean {
    return this.fileSessions.size > 0
  }

  /** Resuelve a los que esperaban el módulo (listo, falló o se destruyó). */
  private settleReadyWaiters(): void {
    const waiters = this.sessionReadyWaiters
    this.sessionReadyWaiters = []
    for (const resolve of waiters) resolve()
  }

  /** Id (path) del archivo activo en este módulo, o null. */
  currentFileSessionId(): string | null {
    return this.currentPath
  }

  /**
   * Crea la sesión del archivo y la activa. `content` es el texto a cargar;
   * `cleanRevision` la revisión ya persistida (si se conoce).
   */
  createFileSession(id: string, content: string, cleanRevision?: number): void {
    const module = this.module
    if (!module?.createSession) return
    module.createSession(id)
    this.fileSessions.add(id)
    module.activateSession?.(id)
    // openFile setea contenido + lenguaje + breadcrumb en la sesión ACTIVA.
    module.openFile(id, content)
    this.activatePath(id, content)
    if (typeof cleanRevision === 'number') module.setSessionCleanRevision?.(id, cleanRevision)
    this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')?.focus()
  }

  /** Activa una sesión existente (cambio de tab, sin recargar nada). */
  activateFileSession(id: string): void {
    const module = this.module
    if (!module?.activateSession) return
    if (this.currentPath === id) return
    module.activateSession(id)
    this.activatePath(id, module.getSessionText?.(id) ?? '')
    this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')?.focus()
  }

  /** Destruye la sesión del archivo (cerrar la tab). */
  dropFileSession(id: string): void {
    this.module?.destroySession?.(id)
    this.fileSessions.delete(id)
    if (this.currentPath === id) this.currentPath = null
  }

  /** Texto de una sesión (funciona con la sesión inactiva). */
  fileSessionText(id: string): string | undefined {
    try {
      return this.module?.getSessionText?.(id)
    } catch {
      return undefined
    }
  }

  /** Revisión del buffer de una sesión (inactiva incluida). */
  fileSessionRevision(id: string): number | undefined {
    const rev = this.module?.getSessionRevision?.(id)
    return typeof rev === 'number' ? rev : undefined
  }

  /** ¿La sesión tiene cambios sin guardar? (sin activarla) */
  fileSessionDirty(id: string): boolean | undefined {
    const dirty = this.module?.isSessionDirty?.(id)
    return typeof dirty === 'boolean' ? dirty : undefined
  }

  /** Marca la revisión de una sesión como persistida en disco. */
  markFileSessionClean(id: string, revision: number): void {
    this.module?.setSessionCleanRevision?.(id, revision)
  }

  /** Chrome de un archivo recién activado: tema, bookmarks, resaltado, cursor. */
  private activatePath(id: string, text: string): void {
    const module = this.module
    if (!module) return
    this.currentPath = id
    this.bridge?.setPath(id)
    applyInnertaTheme(module)
    this.pushBookmarks()
    // startHighlightPipelines limpia tokens/folds/subrayados del archivo
    // anterior y arranca los canales del nuevo.
    this.startHighlightPipelines(id, text)
    requestAnimationFrame(() => this.bridge?.syncCursor())
    this.applyAutoPairs(id)
  }

  /**
   * Config del LENGUAJE → motor: pares de auto-cierre e indentación (unidad y,
   * cuando el tokenizador responde, los niveles de `indents.scm`).
   */
  private applyAutoPairs(path: string): void {
    const languageId = detectLanguageFromPath(path)
    if (this.module) {
      // La unidad es del lenguaje; los niveles llegan con el tokenizado (hasta
      // entonces se conserva la sangría actual, no se adivina).
      this.module.setIndentUnit?.(indentUnitFor(languageId))
      this.module.setIndentLevels?.([])
    }
    void autoPairsForPath(path).then((pairs) => {
      if (this.currentPath !== path || !this.module) return
      this.module.setAutoPairs?.(pairs?.openers ?? '', pairs?.closers ?? '')
    })
  }

  /**
   * Arranca los dos canales de color del host para un archivo.
   *
   * Se llama desde `loadFile` Y desde `apply` (el camino de la petición
   * encolada). Ese segundo camino es el que importa: la PRIMERA vez que se abre
   * un archivo el módulo WASM todavía está cargando, así que `loadFile` encola
   * la petición y no hay `module` con quien hablar — si los canales se
   * arrancaran sólo en `loadFile`, el archivo se pintaba sin extensión y sin
   * LSP hasta el primer cambio de buffer (o sea: casi nunca).
   */
  private startHighlightPipelines(path: string, content?: string): void {
    const module = this.module
    if (!module) return
    // Archivo nuevo: se tira lo del anterior antes de publicar nada. Si no,
    // los tokens del archivo A quedan pintados sobre el B (y el LSP tarda
    // cientos de ms en responder, así que se verían un rato largo).
    resetHostTokens(module, path)
    // Los rangos plegables del archivo ANTERIOR no valen para éste: si el
    // lenguaje nuevo no trae `folds.scm`, el motor tiene que volver a su
    // plegado por indentación en vez de quedarse con los fold del árbol viejo.
    applyInnertaFolds(path, [])
    // Los subrayados del archivo anterior tampoco: el motor recibe los de ESTE
    // (que pueden ser cero). Es la misma trampa que el plegado.
    this.pushUnderlines()
    // Canal 1: semantic tokens del LSP (según editor.highlightSource).
    refreshSemanticTokens(module, path, true)
    // Canal 2: gramática de la extensión que cubre este lenguaje. Si no hay, no
    // toca nada (el motor y el LSP siguen como estaban).
    const text = content ?? module.getText?.()
    if (text !== undefined) refreshLanguageHighlight(module, path, text, { immediate: true })
    // Canal 3: parser tree-sitter del paquete (`.wasm`), en un proceso aparte.
    // Sólo corre si el lenguaje NO tiene gramática TextMate (ver el puente).
    if (text !== undefined) refreshDynamicHighlight(module, path, text, { immediate: true })
  }

  focus(): void {
    if (this.module) this.module.setFocus(true)
    const canvas = this.host?.querySelector<HTMLCanvasElement>('.scrakk-innerta-canvas')
    canvas?.focus()
  }

  /** Posición del cursor (0-based). `null` si el engine no la expone. */
  getCursor(): { line: number; col: number } | null {
    if (!this.module || typeof this.module.getCursor !== 'function') return null
    return this.module.getCursor()
  }

  /**
   * Texto completo del buffer (guardar / snapshots LRU de sesiones).
   * `undefined` si el módulo aún no cargó o ya se destruyó.
   */
  getText(): string | undefined {
    try {
      return this.module?.getText?.()
    } catch {
      return undefined
    }
  }

  /** Bytes del heap WASM (0 si el módulo no está vivo). */
  heapBytes(): number {
    try {
      return this.module?.heapBytes?.() ?? 0
    } catch {
      return 0
    }
  }

  // ── Revisión / dirty (flujo de guardado) ────────────────────────────────

  /** Última revisión conocida del buffer. undefined si el WASM es viejo. */
  getRevision(): number | undefined {
    const fromModule = this.module?.getRevision?.()
    if (typeof fromModule === 'number') {
      this.latestRevision = fromModule
      return fromModule
    }
    return this.ready ? this.latestRevision : undefined
  }

  /** Revisión confirmada en disco: dirty = revision > cleanRevision. */
  setCleanRevision(revision: number): void {
    this.cleanRevision = revision
    try {
      this.module?.setCleanRevision?.(revision)
    } catch {
      // WASM viejo sin el export: el estado local manda.
    }
    this.emitDirty()
  }

  isDirty(): boolean {
    return this.latestRevision !== this.cleanRevision
  }

  /** Evento de mutación del buffer (coalescido por frame desde el engine). */
  onRevision(cb: (revision: number) => void): () => void {
    this.revisionListeners.add(cb)
    return () => {
      this.revisionListeners.delete(cb)
    }
  }

  /** Evento de cambio dirty (para punto en tab / guardia de cierre). */
  onDirty(cb: (dirty: boolean) => void): () => void {
    this.dirtyListeners.add(cb)
    return () => {
      this.dirtyListeners.delete(cb)
    }
  }

  private handleRevision(revision: number): void {
    this.latestRevision = revision
    // El buffer cambió por dentro del engine (el usuario está escribiendo):
    // hay que re-tokenizar con la gramática de la extensión. El texto se pide
    // al engine (es la única copia fresca) y el puente hace el debounce.
    if (this.currentPath) this.refreshHighlightFromBuffer(this.module?.getText?.())
    for (const cb of this.revisionListeners) {
      try {
        cb(revision)
      } catch {
        // Un listener roto no tumba el canal.
      }
    }
    this.emitDirty()
  }

  private emitDirty(): void {
    const dirty = this.latestRevision !== this.cleanRevision
    if (dirty === this.lastDirty) return
    this.lastDirty = dirty
    for (const cb of this.dirtyListeners) {
      try {
        cb(dirty)
      } catch {
        // Igual que arriba: aislamiento por listener.
      }
    }
  }

  dispose(): void {
    // Remount-friendly: el canvas y el módulo PERSISTEN (mover una tab de
    // archivo entre slots no debe matar el engine). Solo se pausa el loop.
    cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.persistentCanvas) {
      this.persistentCanvas.style.display = 'none'
    }
    this.onResize = null
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.host = null
  }

  /**
   * Destrucción TOTAL (cerrar la tab del archivo): apaga el módulo WASM,
   * libera el canvas y deja la instancia reutilizable para otra sesión.
   * No confundir con dispose(): esto SÍ libera memoria del engine.
   */
  destroy(): void {
    this.bridge?.dispose()
    this.bridge = null
    // Soltar el tokenizado pendiente ANTES de apagar el módulo: si llega la
    // respuesta con el WASM ya bajado, el push escribiría en un heap muerto.
    if (this.module && this.currentPath) {
      clearLanguageHighlight(this.module, this.currentPath)
      clearDynamicHighlight(this.module, this.currentPath)
    }
    // Reset del estado de revisión: la instancia puede reutilizarse para
    // otra sesión (LRU) — no heredar dirty de la sesión anterior.
    this.latestRevision = 0
    this.cleanRevision = 0
    this.lastDirty = false
    // Soltar los listeners de tema y minimap: retenían engine+WASM tras
    // cerrar la tab.
    this.themeUnsubscribe?.()
    this.themeUnsubscribe = null
    this.minimapUnsubscribe?.()
    this.minimapUnsubscribe = null
    this.grammarUnsubscribe?.()
    this.grammarUnsubscribe = null
    this.bookmarksUnsubscribe?.()
    this.bookmarksUnsubscribe = null
    this.decorationsUnsubscribe?.()
    this.decorationsUnsubscribe = null
    // La tab se cierra: los subrayados de ESTE archivo no pueden quedar en el
    // motor (el módulo se apaga y el canvas se libera; un rango fantasma en el
    // próximo archivo del mismo módulo reutilizado sería peor que nada).
    this.module?.setUnderlines?.([])
    const hadModule = this.module !== null
    this.dispose()
    if (this.module) {
      try {
        this.module.shutdown()
      } catch {
        // Módulo ya apagado.
      }
      this.module = null
      this.ready = false
    }
    // Liberar el contexto GL: sin esto cada módulo visitado retiene su
    // contexto (límite del browser ~8-16) + backing store de GPU.
    // Solo si hubo módulo (getContext CREARÍA uno si no existe).
    if (hadModule && this.persistentCanvas) {
      try {
        const gl = this.persistentCanvas.getContext('webgl2')
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
      } catch {
        // Sin GL que liberar.
      }
    }
    // Invalidar la promesa viva: si el módulo resuelve después (StrictMode /
    // carga lenta), el .then ve el mismatch y apaga el módulo huérfano.
    this.modulePromise = null
    // Nadie puede quedar esperando un módulo que ya no va a llegar.
    this.settleReadyWaiters()
    if (this.inputHandle) {
      try {
        this.inputHandle.dispose()
      } catch {
        // Sin listeners.
      }
      this.inputHandle = null
    }
    if (this.persistentCanvas) {
      this.persistentCanvas.remove()
      this.persistentCanvas = null
    }
    this.pending = []
  }
}