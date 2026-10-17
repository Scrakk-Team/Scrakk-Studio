// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Desinstalación real de la app (Windows y Linux).
 *
 * No hay un "uninstall" universal: depende de cómo se instaló. Se detecta y se
 * usa el mecanismo NATIVO de cada formato, sin reimplementar borrados a mano
 * (que dejarían restos de menú, registro, metadatos del paquete…):
 *
 *   - **Windows (NSIS)**: electron-builder registra el desinstalador en
 *     `…\CurrentVersion\Uninstall`; se lee su `QuietUninstallString` del registro
 *     y se lanza en silencio. El uninstaller espera a que la app cierre y borra
 *     la carpeta de instalación + el registro.
 *   - **Linux AppImage**: no hay instalador; se borra el propio `.AppImage`
 *     (`$APPIMAGE`) y las entradas de menú que apuntan a él.
 *   - **Linux deb**: se quita el paquete con `dpkg -r` (vía `pkexec` para el
 *     prompt gráfico de polkit; si el usuario cancela, NO se cierra la app).
 *   - **Linux tar.gz (portable)**: se borra la carpeta desde la que corre
 *     (`resources/` de por medio, para no borrar una carpeta ajena).
 *
 * Los datos del usuario (`~/.config/Scrakk Studio`, `~/.scrakk`, …) NO se
 * tocan: desinstalar el programa no es borrar la cuenta/ajustes.
 */

import { app, ipcMain } from 'electron'
import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { APP_IPC, type UninstallResult } from '@shared/app'
import { resolveExecutable } from './binaries'
import { t } from '@shared/i18n'

/** Nombre visible (el que usa el registro de Windows y el .desktop). */
const DISPLAY_NAME = 'Scrakk Studio'

/** Nombre del paquete deb (deriva del `name` de package.json). */
const DEB_PACKAGE = 'scrakk-studio'

/** Lanza un proceso suelto (sobrevive a nuestra salida) y no espera. */
function spawnDetached(cmd: string, args: string[], shell = false): void {
  try {
    spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell
    }).unref()
  } catch {
    // El proceso no arrancó: el resultado de la acción se reporta aparte.
  }
}

/** Corre y espera el código de salida (para acciones que pueden cancelarse). */
function runToExit(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true })
      child.on('error', () => resolve(-1))
      child.on('exit', (code) => resolve(code ?? -1))
    } catch {
      resolve(-1)
    }
  })
}

/**
 * Cierra la app dejando que el desinstalador termine. El desinstalador necesita
 * que el proceso muera para poder borrar sus archivos.
 */
function quitForUninstall(): void {
  setTimeout(() => app.exit(0), 400)
}

// ── Windows (NSIS) ──────────────────────────────────────────────────────────

/** Busca en el registro el comando del desinstalador de Scrakk Studio. */
function findWindowsUninstallCommand(): string | null {
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
  for (const root of roots) {
    let out = ''
    try {
      const res = spawnSync('reg', ['query', root, '/s', '/f', DISPLAY_NAME], {
        encoding: 'utf-8',
        windowsHide: true
      })
      out = res.stdout ?? ''
    } catch {
      continue
    }
    if (!out) continue
    // QuietUninstallString ya trae el `/S` (silencioso); UninstallString no.
    const quiet = out.match(/QuietUninstallString\s+REG_SZ\s+(.+)/i)?.[1]?.trim()
    if (quiet) return quiet
    const plain = out.match(/UninstallString\s+REG_SZ\s+(.+)/i)?.[1]?.trim()
    if (plain) return `${plain} /S`
  }
  return null
}

/**
 * Parte un comando del registro (`"C:\…\x.exe" /S` o `C:\…\x.exe /S`) en
 * ejecutable + argumentos, para poder spawnearlo SIN shell (evita el infierno
 * de comillas de cmd.exe con rutas que tienen espacios).
 */
function parseWindowsCommand(command: string): { file: string; args: string[] } {
  const trimmed = command.trim()
  let file = trimmed
  let rest = ''
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    if (end !== -1) {
      file = trimmed.slice(1, end)
      rest = trimmed.slice(end + 1)
    }
  } else {
    const space = trimmed.indexOf(' ')
    if (space !== -1) {
      file = trimmed.slice(0, space)
      rest = trimmed.slice(space + 1)
    }
  }
  return { file, args: rest.trim().length > 0 ? rest.trim().split(/\s+/) : [] }
}

function uninstallWindows(): UninstallResult {
  const command = findWindowsUninstallCommand()
  if (!command) {
    return { ok: false, method: 'nsis', error: t('main.desinstalar.sin.desinstalador') }
  }
  const { file, args } = parseWindowsCommand(command)
  spawnDetached(file, args)
  quitForUninstall()
  return { ok: true, method: 'nsis' }
}

// ── Linux ───────────────────────────────────────────────────────────────────

/** Cita un valor para `sh` (comillas simples seguras). */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function uninstallAppImage(): UninstallResult {
  const appimage = process.env.APPIMAGE
  if (!appimage) {
    return { ok: false, method: 'appimage', error: t('main.desinstalar.no.disponible') }
  }
  // Se espera a que la app cierre (borrar el binario en uso es válido en Linux,
  // pero el mount FUSE del AppImage se libera al salir) y luego se borra el
  // fichero + las entradas de menú que lo referencian.
  const script = [
    'sleep 1',
    `rm -f ${shellQuote(appimage)}`,
    'for d in "$HOME/.local/share/applications" "$HOME/.local/share/icons"; do',
    '  [ -d "$d" ] || continue',
    `  grep -rlF ${shellQuote(appimage)} "$d" 2>/dev/null | while IFS= read -r f; do rm -f "$f"; done`,
    'done'
  ].join('\n')
  spawnDetached('/bin/sh', ['-c', script])
  quitForUninstall()
  return { ok: true, method: 'appimage' }
}

/** ¿El paquete deb está instalado? (así distinguimos deb de tar.gz portable). */
function debInstalled(): boolean {
  const dpkgQuery = resolveExecutable('dpkg-query')
  if (!dpkgQuery) return false
  try {
    const res = spawnSync(dpkgQuery, ['-W', '-f=${Status}', DEB_PACKAGE], { encoding: 'utf-8' })
    return (res.stdout ?? '').includes('install ok installed')
  } catch {
    return false
  }
}

/** Quita el paquete deb. Necesita root: `pkexec` da el prompt gráfico. */
async function uninstallDeb(): Promise<UninstallResult> {
  const pkexec = resolveExecutable('pkexec')
  const dpkg = resolveExecutable('dpkg')
  if (!pkexec || !dpkg) {
    return { ok: false, method: 'deb', error: t('main.desinstalar.ejecuta.manual') }
  }
  // Se ESPERA el resultado: si el usuario cancela el prompt de polkit, no
  // cerramos la app a ciegas — se le dice qué comando correr.
  const code = await runToExit(pkexec, [dpkg, '-r', DEB_PACKAGE])
  if (code !== 0) {
    return { ok: false, method: 'deb', error: t('main.desinstalar.ejecuta.manual') }
  }
  quitForUninstall()
  return { ok: true, method: 'deb' }
}

/** Borra la carpeta de una instalación portable (tar.gz / linux-unpacked). */
async function uninstallPortable(): Promise<UninstallResult> {
  const dir = path.dirname(app.getPath('exe'))
  // Guarda: solo si parece la carpeta de la app (tiene `resources/`), para no
  // borrar una carpeta que contenga más cosas (p. ej. ~/Descargas).
  if (!(await exists(path.join(dir, 'resources')))) {
    return { ok: false, method: 'portable', error: t('main.desinstalar.no.disponible') }
  }
  const script = [
    'sleep 1',
    `for i in 1 2 3 4 5; do rm -rf ${shellQuote(dir)} && break; sleep 1; done`
  ].join('\n')
  spawnDetached('/bin/sh', ['-c', script])
  quitForUninstall()
  return { ok: true, method: 'portable' }
}

// ── API ─────────────────────────────────────────────────────────────────────

export async function uninstallApp(): Promise<UninstallResult> {
  if (!app.isPackaged) {
    return { ok: false, method: 'dev', error: t('main.desinstalar.no.disponible') }
  }

  if (process.platform === 'win32') return uninstallWindows()

  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return uninstallAppImage()
    if (debInstalled()) return uninstallDeb()
    return uninstallPortable()
  }

  return { ok: false, method: 'unsupported', error: t('main.desinstalar.no.disponible') }
}

export function registerUninstallIpc(): void {
  ipcMain.handle(APP_IPC.uninstall, () => uninstallApp())
}
