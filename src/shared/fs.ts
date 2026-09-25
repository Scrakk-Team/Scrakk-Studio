// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer) — contrato IPC del filesystem.
 *
 * El renderer no tiene acceso directo a Node.js. Todas las operaciones de
 * archivo, proceso y búsqueda corren en el proceso main vía IPC.
 */

export const FS_IPC = {
  readFile: 'fs:read-file',
  writeFile: 'fs:write-file',
  deleteFile: 'fs:delete-file',
  moveFile: 'fs:move-file',
  scanDirectory: 'fs:scan-directory',
  readdir: 'fs:readdir',
  mkdir: 'fs:mkdir',
  openInFolder: 'fs:open-in-folder',
  pickFolder: 'fs:pick-folder',
  pickFile: 'fs:pick-file',
  homeDir: 'fs:home-dir',
  execCommand: 'fs:exec-command',
  searchFiles: 'fs:search-files',
  searchInFiles: 'fs:search-in-files',
  exists: 'fs:exists',
  stat: 'fs:stat',
  watchDir: 'fs:watch-dir',
  unwatchDir: 'fs:unwatch-dir',
  /** Evento main → renderer: un directorio vigilado cambió. */
  watchChanged: 'fs:watch-changed'
} as const

// ── Read File ──────────────────────────────────────────────────────────────

export interface ReadFileRequest {
  path: string
}

export interface ReadFileResponse {
  success: boolean
  content?: string
  error?: string
}

// ── Write File ─────────────────────────────────────────────────────────────

export interface WriteFileRequest {
  path: string
  content: string
}

export interface WriteFileResponse {
  success: boolean
  error?: string
}

// ── Delete File ────────────────────────────────────────────────────────────

export interface DeleteFileRequest {
  path: string
}

export interface DeleteFileResponse {
  success: boolean
  error?: string
}

// ── Move File ──────────────────────────────────────────────────────────────

export interface MoveFileRequest {
  source: string
  destination: string
}

export interface MoveFileResponse {
  success: boolean
  error?: string
}

// ── Scan Directory ─────────────────────────────────────────────────────────

export interface ScanDirectoryRequest {
  path: string
  depth?: number
}

export interface DirectoryEntry {
  path: string
  is_directory: boolean
}

export type ScanDirectoryResponse =
  | { success: true; entries: DirectoryEntry[] }
  | { success: false; error: string }

// ── Readdir (una carpeta, incluye ocultos, metadata mínima) ──────────────
// Técnica del Explorer GTK: solo name + tipo (sin stat por entrada) para
// que leer un directorio grande sea una sola llamada barata.

export interface ReaddirRequest {
  path: string
}

export interface ReaddirEntry {
  name: string
  is_directory: boolean
}

export type ReaddirResponse =
  | { success: true; entries: ReaddirEntry[] }
  | { success: false; error: string }

// ── Directory watcher ────────────────────────────────────────────────────
// Vigila un directorio en el proceso main (fs.watch) y avisa al renderer
// cuando cambia, con debounce. El renderer refresca solo esa carpeta.

export interface WatchDirRequest {
  path: string
}

export interface WatchChangedEvent {
  path: string
}

// ── Mkdir ─────────────────────────────────────────────────────────────────

export interface MkdirRequest {
  path: string
}

export interface MkdirResponse {
  success: boolean
  error?: string
}

// ── Open In Folder (revelar en el explorador del SO) ─────────────────────

export interface OpenInFolderRequest {
  path: string
}

export interface OpenInFolderResponse {
  success: boolean
  error?: string
}

// ── Pick Folder & Home ─────────────────────────────────────────────────────

export interface PickFolderResponse {
  success: boolean
  path?: string
  error?: string
}

// ── Pick File ──────────────────────────────────────────────────────────────

export interface PickFileResponse {
  success: boolean
  paths?: string[]
  error?: string
}

// ── Exec Command ───────────────────────────────────────────────────────────

export interface ExecCommandRequest {
  command: string
  cwd?: string
  timeoutMs?: number
}

export interface ExecCommandResponse {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  timedOut?: boolean
}

// ── Search Files ───────────────────────────────────────────────────────────

export interface SearchFilesRequest {
  root: string
  query: string
  excludePattern?: string
  maxResults?: number
}

export interface SearchResult {
  path: string
  name: string
  isDirectory: boolean
}

export interface SearchFilesResponse {
  success: boolean
  results?: SearchResult[]
  error?: string
}

// ── Search In Files (grep) ────────────────────────────────────────────────

export interface SearchInFilesRequest {
  root: string
  query: string
  includePattern?: string
  caseSensitive?: boolean
  maxResults?: number
  maxFileSize?: number
}

export interface GrepMatch {
  file: string
  line: number
  column?: number
  content: string
  preview?: string
  /**
   * Columnas (1-based) de cada match en la línea y sus rangos [start,end] en
   * bytes. Los devuelve el sidecar `kolargrep serve` (`detail` + `positions`).
   */
  columns?: number[]
  spans?: Array<[number, number]>
}

export interface SearchInFilesResponse {
  success: boolean
  matches?: GrepMatch[]
  error?: string
}

// ── Exists ─────────────────────────────────────────────────────────────────

export interface ExistsRequest {
  path: string
}

export interface ExistsResponse {
  exists: boolean
  isDirectory?: boolean
}

// ── Stat ───────────────────────────────────────────────────────────────────

export interface StatRequest {
  path: string
}

export interface StatResponse {
  exists: boolean
  isFile?: boolean
  isDirectory?: boolean
  size?: number
  modifiedMs?: number
  error?: string
}

// ── API type for preload ───────────────────────────────────────────────────

export interface FsApi {
  readFile: (path: string) => Promise<ReadFileResponse>
  writeFile: (path: string, content: string) => Promise<WriteFileResponse>
  deleteFile: (path: string) => Promise<DeleteFileResponse>
  moveFile: (source: string, destination: string) => Promise<MoveFileResponse>
  scanDirectory: (path: string, depth?: number) => Promise<ScanDirectoryResponse>
  /** Lista una sola carpeta (incluye archivos ocultos, sin stat por entrada). */
  readdir: (path: string) => Promise<ReaddirResponse>
  /** Crea una carpeta (recursivo). */
  mkdir: (path: string) => Promise<MkdirResponse>
  /** Revela un archivo/carpeta en el explorador del SO. */
  openInFolder: (path: string) => Promise<OpenInFolderResponse>
  /** Empieza a vigilar un directorio (los cambios llegan por onWatchChanged). */
  watchDir: (path: string) => void
  /** Deja de vigilar un directorio. */
  unwatchDir: (path: string) => void
  /** Suscribirse a cambios de directorios vigilados. Devuelve unsubscriber. */
  onWatchChanged: (callback: (event: WatchChangedEvent) => void) => () => void
  /** Abre el diálogo nativo para elegir una carpeta. */
  pickFolder: () => Promise<PickFolderResponse>
  /** Abre el diálogo nativo para elegir uno o más archivos. */
  pickFile: () => Promise<PickFileResponse>
  /** Devuelve el directorio home del usuario (para abrir el explorador). */
  homeDir: () => Promise<string>
  execCommand: (command: string, cwd?: string, timeoutMs?: number) => Promise<ExecCommandResponse>
  searchFiles: (root: string, query: string, excludePattern?: string, maxResults?: number) => Promise<SearchFilesResponse>
  searchInFiles: (root: string, query: string, includePattern?: string, caseSensitive?: boolean, maxResults?: number) => Promise<SearchInFilesResponse>
  exists: (path: string) => Promise<ExistsResponse>
  stat: (path: string) => Promise<StatResponse>
}
