import { dialog, ipcMain, shell, type WebContents } from 'electron'
import * as fs from 'fs/promises'
import { watch as fsWatch, type FSWatcher } from 'node:fs'
import * as path from 'path'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import * as os from 'node:os'
import { tryNativeSearchFiles, tryNativeGrep, ensureWatch } from '../search/nativeSearch'
import {
  FS_IPC,
  type ReadFileRequest,
  type ReadFileResponse,
  type WriteFileRequest,
  type WriteFileResponse,
  type DeleteFileRequest,
  type DeleteFileResponse,
  type MoveFileRequest,
  type MoveFileResponse,
  type ScanDirectoryRequest,
  type ScanDirectoryResponse,
  type DirectoryEntry,
  type ReaddirRequest,
  type ReaddirResponse,
  type ReaddirEntry,
  type MkdirRequest,
  type MkdirResponse,
  type OpenInFolderRequest,
  type OpenInFolderResponse,
  type WatchDirRequest,
  type PickFolderResponse,
  type PickFileResponse,
  type ExecCommandRequest,
  type ExecCommandResponse,
  type SearchFilesRequest,
  type SearchFilesResponse,
  type SearchInFilesRequest,
  type SearchInFilesResponse,
  type GrepMatch,
  type ExistsRequest,
  type ExistsResponse,
  type StatRequest,
  type StatResponse
} from '@shared/fs'

const execAsync = promisify(execCb)

// ── Directory watchers ───────────────────────────────────────────────────
// Un watcher por (webContents, path). El debounce agrupa ráfagas de eventos
// del filesystem (create+rename, etc.) en un solo aviso al renderer.

interface WatchEntry {
  watcher: FSWatcher
  sender: WebContents
  timer?: NodeJS.Timeout
}

const watchers = new Map<string, WatchEntry>()

function watchKey(senderId: number, path: string): string {
  return `${senderId}:${path}`
}

function closeWatcher(key: string, entry: WatchEntry): void {
  if (entry.timer) clearTimeout(entry.timer)
  try {
    entry.watcher.close()
  } catch {
    // Ya cerrado.
  }
  watchers.delete(key)
}

/** Registra todos los handlers IPC del filesystem. */
export function registerFsIpc(): void {
  // ── Read File ──────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.readFile, async (_event, request: unknown): Promise<ReadFileResponse> => {
    const req = request as ReadFileRequest
    try {
      const content = await fs.readFile(req.path, 'utf-8')
      return { success: true, content }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Write File ─────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.writeFile, async (_event, request: unknown): Promise<WriteFileResponse> => {
    const req = request as WriteFileRequest
    try {
      // Crear directorios padre si no existen
      await fs.mkdir(path.dirname(req.path), { recursive: true })
      await fs.writeFile(req.path, req.content, 'utf-8')
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Delete File ────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.deleteFile, async (_event, request: unknown): Promise<DeleteFileResponse> => {
    const req = request as DeleteFileRequest
    try {
      await fs.rm(req.path, { recursive: true, force: true })
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Move File ──────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.moveFile, async (_event, request: unknown): Promise<MoveFileResponse> => {
    const req = request as MoveFileRequest
    try {
      // Crear directorios padre del destino si no existen
      await fs.mkdir(path.dirname(req.destination), { recursive: true })
      await fs.rename(req.source, req.destination)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Scan Directory ─────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.scanDirectory, async (_event, request: unknown): Promise<ScanDirectoryResponse> => {
    const req = request as ScanDirectoryRequest
    try {
      const maxDepth = req.depth ?? 1
      const entries: DirectoryEntry[] = []

      async function scan(dirPath: string, currentDepth: number): Promise<void> {
        if (currentDepth > maxDepth) return
        const items = await fs.readdir(dirPath, { withFileTypes: true })
        for (const item of items) {
          // Skip hidden files/dirs
          if (item.name.startsWith('.')) continue
          const fullPath = path.join(dirPath, item.name)
          const relPath = path.relative(req.path, fullPath)
          entries.push({
            path: relPath,
            is_directory: item.isDirectory()
          })
          if (item.isDirectory() && currentDepth < maxDepth) {
            await scan(fullPath, currentDepth + 1)
          }
        }
      }

      await scan(req.path, 1)
      return { success: true, entries }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Readdir (una carpeta, incluye ocultos) ──────────────────────────────
  ipcMain.handle(FS_IPC.readdir, async (_event, request: unknown): Promise<ReaddirResponse> => {
    const req = request as ReaddirRequest
    try {
      const items = await fs.readdir(req.path, { withFileTypes: true })
      const entries: ReaddirEntry[] = []
      for (const item of items) {
        entries.push({
          name: item.name,
          is_directory: item.isDirectory()
        })
      }
      return { success: true, entries }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Directory watcher ──────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.watchDir, (event, request: unknown): void => {
    const { path: dirPath } = request as WatchDirRequest
    if (!dirPath) return
    const key = watchKey(event.sender.id, dirPath)
    if (watchers.has(key)) return

    let watcher: FSWatcher
    try {
      watcher = fsWatch(dirPath, (_eventType, _filename) => {
        const entry = watchers.get(key)
        if (!entry) return
        // Debounce: varias ráfagas de eventos → un solo aviso.
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = setTimeout(() => {
          if (!entry.sender.isDestroyed()) {
            entry.sender.send(FS_IPC.watchChanged, { path: dirPath } satisfies WatchDirRequest)
          }
        }, 120)
      })
    } catch {
      // Directorio no vigilable (permisos, eliminado): sin watcher.
      return
    }

    watchers.set(key, { watcher, sender: event.sender })
    // Limpieza automática si la ventana muere con watchers activos.
    event.sender.once('destroyed', () => {
      const entry = watchers.get(key)
      if (entry) closeWatcher(key, entry)
    })
  })

  ipcMain.handle(FS_IPC.unwatchDir, (event, request: unknown): void => {
    const { path: dirPath } = request as WatchDirRequest
    if (!dirPath) return
    const key = watchKey(event.sender.id, dirPath)
    const entry = watchers.get(key)
    if (entry) closeWatcher(key, entry)
  })

  // ── Mkdir (recursivo) ───────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.mkdir, async (_event, request: unknown): Promise<MkdirResponse> => {
    const req = request as MkdirRequest
    try {
      await fs.mkdir(req.path, { recursive: true })
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Open In Folder (revelar en el explorador del SO) ────────────────────
  ipcMain.handle(FS_IPC.openInFolder, async (_event, request: unknown): Promise<OpenInFolderResponse> => {
    const req = request as OpenInFolderRequest
    try {
      shell.showItemInFolder(req.path)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Pick Folder (diálogo nativo) ────────────────────────────────────────
  ipcMain.handle(FS_IPC.pickFolder, async (): Promise<PickFolderResponse> => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir carpeta',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Operación cancelada' }
    }
    return { success: true, path: result.filePaths[0] }
  })

  // ── Pick File (diálogo nativo, selección múltiple) ──────────────────────
  ipcMain.handle(FS_IPC.pickFile, async (): Promise<PickFileResponse> => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir archivo',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Operación cancelada' }
    }
    return { success: true, paths: result.filePaths }
  })

  // ── Home Directory ─────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.homeDir, (): string => os.homedir())

  // ── Exec Command ───────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.execCommand, async (_event, request: unknown): Promise<ExecCommandResponse> => {
    const req = request as ExecCommandRequest
    try {
      const timeoutMs = req.timeoutMs ?? 60_000
      const { stdout, stderr } = await execAsync(req.command, {
        cwd: req.cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 5, // 5MB
        encoding: 'utf-8'
      })
      return {
        success: true,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: 0
      }
    } catch (error: any) {
      // execAsync throws on non-zero exit code
      if (error.code !== undefined) {
        return {
          success: false,
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? '',
          exitCode: error.code ?? 1,
          timedOut: error.killed === true && error.signal === 'SIGTERM'
        }
      }
      const msg = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        stdout: '',
        stderr: msg,
        exitCode: 1
      }
    }
  })

  // ── Search Files ───────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.searchFiles, async (_event, request: unknown): Promise<SearchFilesResponse> => {
    const req = request as SearchFilesRequest
    ensureWatch(req.root)
    // Vía nativa (Rust ignore-walk) si disponible; fallback al scan TS.
    try {
      const native = tryNativeSearchFiles(req.root, req.query, req.maxResults ?? 20)
      if (native) return { success: true, results: native }
    } catch {
      // Fallback abajo.
    }
    try {
      const maxResults = req.maxResults ?? 20
      const results: Array<{ path: string; name: string; isDirectory: boolean }> = []
      const excludePatterns = req.excludePattern
        ? req.excludePattern.split(',').map(s => s.trim().toLowerCase())
        : []

      const EXCLUDED_DIRS = new Set([
        'node_modules', '.git', 'dist', '.next', '.nuxt', '.output',
        '__pycache__', '.venv', 'venv', '.cache', '.turbo', 'coverage'
      ])

      async function search(dir: string, relativeBase: string): Promise<void> {
        if (results.length >= maxResults) return
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          if (results.length >= maxResults) return
          if (item.name.startsWith('.')) continue
          if (EXCLUDED_DIRS.has(item.name)) continue

          const fullPath = path.join(dir, item.name)
          const relPath = relativeBase ? `${relativeBase}/${item.name}` : item.name

          if (item.name.toLowerCase().includes(req.query.toLowerCase())) {
            // Check exclude patterns
            const excluded = excludePatterns.some(p => relPath.toLowerCase().includes(p))
            if (!excluded) {
              results.push({
                path: relPath,
                name: item.name,
                isDirectory: item.isDirectory()
              })
            }
          }

          if (item.isDirectory()) {
            await search(fullPath, relPath)
          }
        }
      }

      await search(req.root, '')
      return { success: true, results }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Search In Files (grep) ────────────────────────────────────────────
  ipcMain.handle(FS_IPC.searchInFiles, async (_event, request: unknown): Promise<SearchInFilesResponse> => {
    const req = request as SearchInFilesRequest
    ensureWatch(req.root)
    // Vía nativa (tgrep trigram + rayon) si disponible; fallback al scan TS.
    try {
      const native = tryNativeGrep(req.root, req.query, req.caseSensitive ?? false, req.maxResults ?? 50)
      if (native) return { success: true, matches: native }
    } catch {
      // Fallback abajo.
    }
    try {
      const maxResults = req.maxResults ?? 50
      const matches: GrepMatch[] = []
      const query = req.caseSensitive ? req.query : req.query.toLowerCase()
      const includePattern = req.includePattern?.toLowerCase()
      const maxFileSize = req.maxFileSize ?? 1024 * 1024 // 1MB default

      const EXCLUDED_DIRS = new Set([
        'node_modules', '.git', 'dist', '.next', '.nuxt', '.output',
        '__pycache__', '.venv', 'venv', '.cache', '.turbo', 'coverage'
      ])

      const TEXT_EXTENSIONS = new Set([
        '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.scss',
        '.html', '.vue', '.svelte', '.py', '.rb', '.go', '.rs', '.java',
        '.c', '.cpp', '.h', '.hpp', '.sh', '.bash', '.zsh', '.fish',
        '.yaml', '.yml', '.toml', '.xml', '.sql', '.graphql', '.prisma',
        '.env', '.gitignore', '.dockerignore', '.editorconfig'
      ])

      async function grep(dir: string): Promise<void> {
        if (matches.length >= maxResults) return
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          if (matches.length >= maxResults) return
          if (item.name.startsWith('.')) continue
          if (EXCLUDED_DIRS.has(item.name)) continue

          const fullPath = path.join(dir, item.name)

          if (item.isDirectory()) {
            await grep(fullPath)
            continue
          }

          // Check include pattern
          if (includePattern && !item.name.toLowerCase().includes(includePattern)) continue

          // Check extension
          const ext = path.extname(item.name).toLowerCase()
          if (ext && !TEXT_EXTENSIONS.has(ext)) continue

          // Check file size
          try {
            const stat = await fs.stat(fullPath)
            if (stat.size > maxFileSize) continue
          } catch {
            continue
          }

          // Read and search
          try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) return
              const line = lines[i]
              const lineContent = req.caseSensitive ? line : line.toLowerCase()
              if (lineContent.includes(query)) {
                matches.push({
                  file: fullPath,
                  line: i + 1,
                  content: line.trimEnd(),
                  preview: line.trimEnd().substring(0, 200)
                })
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }

      await grep(req.root)
      return { success: true, matches }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // ── Exists ─────────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.exists, async (_event, request: unknown): Promise<ExistsResponse> => {
    const req = request as ExistsRequest
    try {
      const stat = await fs.stat(req.path)
      return { exists: true, isDirectory: stat.isDirectory() }
    } catch {
      return { exists: false }
    }
  })

  // ── Stat ───────────────────────────────────────────────────────────────
  ipcMain.handle(FS_IPC.stat, async (_event, request: unknown): Promise<StatResponse> => {
    const req = request as StatRequest
    try {
      const stat = await fs.stat(req.path)
      return {
        exists: true,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modifiedMs: stat.mtimeMs
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { exists: false, error: msg }
    }
  })
}
