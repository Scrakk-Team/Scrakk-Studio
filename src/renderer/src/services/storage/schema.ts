/**
 * Schema del almacenamiento persistente de Scrakk Studio.
 *
 * Cada interfaz describe la forma de los datos asociados a una clave.
 * Añadir una nueva clave persistida = agregar aquí su tipo y la constante
 * STORAGE_KEYS correspondiente.
 *
 * Versión: si una clave cambia su forma en el futuro, incrementar su versión
 * aquí y manejar la migración en storageService.ts.
 */

import type { PanelId, SlotId } from '@features/layout'
import type { EditorFileTab } from '@features/editor'
import type { ChatMessage } from '@services/chat'

// ── Claves del storage ──────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Distribución de paneles por slot. */
  LAYOUT_SLOTS: 'layout.slots',

  /** Lista de archivos abiertos en el editor. */
  EDITOR_OPEN_FILES: 'editor.openFiles',

  /** Ruta del archivo activo. */
  EDITOR_ACTIVE_PATH: 'editor.activePath',

  /** Fuente de resaltado del editor Innerta (elección del usuario). */
  EDITOR_HIGHLIGHT_SOURCE: 'editor.highlightSource',

  /** Qué motor de gramática manda cuando un lenguaje trae los DOS. */
  EDITOR_GRAMMAR_ENGINE: 'editor.grammarEngine',

  /** Encoding default para abrir archivos sin BOM (override del usuario). */
  ENCODINGS_DEFAULT: 'encodings.default',

  /** Sesiones de chat (historial de conversaciones). */
  CHAT_SESSIONS: 'chat.sessions',

  /** Sesión de chat activa (la que se reabre al arrancar). */
  CHAT_ACTIVE_SESSION: 'chat.activeSession',

  /** Estado de la pantalla de configuración inicial ('running' | 'done'). */
  ONBOARDING_STATUS: 'onboarding.status',

  /** Paso donde quedó la configuración inicial (se reanuda al arrancar). */
  ONBOARDING_STEP: 'onboarding.step',

  /** Telemetría del IDE (global). Default: apagada. */
  TELEMETRY_ENABLED: 'telemetry.enabled',

  /** Epoch ms de la primera vez que se preguntó por telemetría (null = nunca). */
  TELEMETRY_ASKED_AT: 'telemetry.askedAt'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// ── Formas de cada clave ────────────────────────────────────────────────────

/** Tab persistida de un slot (solo lo serializable; icon/label por kind se re-resuelven). */
export interface PersistedTabData {
  id: string
  kind: 'panel' | 'file' | 'terminal' | 'explorer'
  panelId?: string
  filePath?: string
  sessionId?: string
  /** kind 'explorer': carpeta raíz de la instancia. */
  rootPath?: string
  label?: string
}

/** Estado persistido de un slot: lista de tabs + activa. */
export interface PersistedSlotData {
  tabs: PersistedTabData[]
  activeId: string | null
  /**
   * Contenido DIVIDIDO (estilo split) del slot: la barra de tabs es UNA
   * (compartida, dueña + cadena ⇄) y el contenido muestra un panel por tab.
   * undefined = contenido clásico (solo la tab activa).
   */
  splitDir?: 'row' | 'column'
}

/**
 * Layout v2: cada slot es un ARRAY de tabs (varias por slot) + activa.
 * v1 (Record<SlotId, PanelId | null>) se migra en features/layout/persistence.
 */
export interface PersistedLayoutData {
  v: 2
  slots: Record<SlotId, PersistedSlotData | null>
}

/** Nodo de split persistido del árbol v3. */
export interface PersistedSplitData {
  type: 'split'
  id: string
  dir: 'row' | 'column'
  ratio: number
  children: [PersistedSplitTree, PersistedSplitTree]
}

/** Árbol de splits persistido: split recursivo o leaf (strip del tabsStore). */
export type PersistedSplitTree = PersistedSplitData | { type: 'leaf'; stripId: string }

/**
 * Layout v3: árbol de splits (estilo VS Code) por slot + TODAS las strips
 * vivas (las 4 raíces y las hojas de los splits). `slots` deja de ser solo
 * los 4 slots con nombre: es un mapa stripId → estado.
 */
export interface PersistedLayoutV3Data {
  v: 3
  slots: Record<string, PersistedSlotData | null>
  tree: Record<SlotId, PersistedSplitTree | null>
  /** Anchos px de slots externos (los resizes ghost los commitean). Opcional por compat. */
  slotSizes?: { left?: number; right?: number; bottom?: number }
}

/** Formato v1 (legacy): un panel por slot. */
export type LegacyLayoutSlotsData = Record<SlotId, PanelId | null>

/** Alias de compatibilidad con el nombre histórico. */
export type LayoutSlotsData = PersistedLayoutData | PersistedLayoutV3Data

export interface EditorSessionData {
  openFiles: EditorFileTab[]
  activePath: string | null
}

/**
 * Elección del usuario para el resaltado del editor:
 *  - 'treesitter': resaltado local por gramáticas (default).
 *  - 'lsp': SOLO semantic tokens del language server (más preciso).
 *  - 'mixed': base Tree-sitter + overlay de semantic tokens donde cubre.
 */
export type EditorHighlightSource = 'treesitter' | 'lsp' | 'mixed'

/**
 * Qué motor produce la capa de GRAMÁTICA (la que colorea palabras y strings).
 *
 * Existe porque un paquete SEF puede declarar las dos cosas para el mismo
 * lenguaje: un `.tmLanguage` (TextMate, viene de VS Code) y un parser
 * tree-sitter con sus `.scm`. Son dos formas de resolver el mismo color y
 * correr las dos publica dos veces por el mismo rango sin poder decidir quién
 * manda. La elección es del usuario, no del código:
 *
 *  - 'auto' (default): TextMate si existe (es el camino de las extensiones de
 *    VS Code), si no el parser del paquete.
 *  - 'treeSitter': el parser del paquete SIEMPRE que haya uno usable. Un árbol
 *    de sintaxis distingue cosas que una gramática de expresiones regulares no
 *    puede (un `*` de multiplicación de uno de puntero).
 *  - 'textMate': nunca el parser dinámico (ni el proceso aparte).
 *
 * Es ajuste aparte de `EditorHighlightSource` (que decide el overlay del LSP).
 */
export type EditorGrammarEngine = 'auto' | 'treeSitter' | 'textMate'

/** Sesión de chat persistida — misma forma que ChatSession del feature chat. */
export interface StoredChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type ChatSessionsData = StoredChatSession[]

/**
 * Estado de la configuración inicial: 'running' mientras se muestra,
 * 'done' cuando el usuario la terminó (o la omitió). Ausente = primer
 * arranque, la app la abre sola en el paso 0.
 */
export type OnboardingStatus = 'running' | 'done'

/**
 * Preferencia de telemetría del IDE (global, con excepción por extensión
 * en un futuro). Default: apagada. Scrakk informa el estado REAL a las
 * extensiones; nunca lo hardcodea ni las intercepta.
 */
export interface TelemetryPreference {
  enabled: boolean
  /** Epoch ms de la primera vez que se preguntó; null = nunca se preguntó. */
  askedAt: number | null
}

// ── Mapa tipado de clave → tipo de valor ────────────────────────────────────

export interface StorageSchema {
  [STORAGE_KEYS.LAYOUT_SLOTS]: LayoutSlotsData
  [STORAGE_KEYS.EDITOR_OPEN_FILES]: EditorFileTab[]
  [STORAGE_KEYS.EDITOR_ACTIVE_PATH]: string | null
  [STORAGE_KEYS.EDITOR_HIGHLIGHT_SOURCE]: EditorHighlightSource
  [STORAGE_KEYS.ENCODINGS_DEFAULT]: import('@shared/encodings').EncodingId
  [STORAGE_KEYS.CHAT_SESSIONS]: ChatSessionsData
  [STORAGE_KEYS.CHAT_ACTIVE_SESSION]: string | null
  [STORAGE_KEYS.ONBOARDING_STATUS]: OnboardingStatus
  [STORAGE_KEYS.ONBOARDING_STEP]: number
  [STORAGE_KEYS.TELEMETRY_ENABLED]: boolean
  [STORAGE_KEYS.TELEMETRY_ASKED_AT]: number | null
}
