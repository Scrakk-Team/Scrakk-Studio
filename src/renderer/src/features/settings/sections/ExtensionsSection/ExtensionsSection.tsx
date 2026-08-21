/**
 * Sección "Extensiones" — gestor de extensiones SEF.
 *
 * Lista las extensiones del runtime (builtin + usuario), permite instalar un
 * `.sef` desde el disco (descomprime en userData vía IPC) y desinstalarlas en
 * vivo (desregistra sus contribuciones del ExtensionRegistry).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ArrowDownloadIcon, DeleteIcon, ExtensionIcon, BoxIcon } from '@proicons/react'
import { ExtensionRegistry } from '@services/extensions'
import type { RegisteredExtension } from '@services/extensions'
import {
  registerInstalledExtension,
  unregisterInstalledExtension
} from '@services/extensions/loader/installed'
import type { InstalledExtensionInfo } from '@shared/extensions'
import styles from './ExtensionsSection.module.css'

type Status = { kind: 'ok' | 'error'; text: string } | null

function contributionsText(extensionId: string): string {
  const counts = ExtensionRegistry.getContributionCount(extensionId)
  const bits: string[] = []
  if (counts.panels > 0) bits.push(`${counts.panels} panel${counts.panels === 1 ? '' : 'es'}`)
  if (counts.activityBar > 0)
    bits.push(`${counts.activityBar} botón${counts.activityBar === 1 ? '' : 'es'}`)
  if (counts.centerTabs > 0)
    bits.push(`${counts.centerTabs} tab central${counts.centerTabs === 1 ? '' : 'es'}`)
  return bits.length > 0 ? bits.join(' · ') : 'sin contribuciones'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ExtensionsSection(): JSX.Element {
  const [extensions, setExtensions] = useState<RegisteredExtension[]>(() =>
    ExtensionRegistry.getExtensions()
  )
  const [installed, setInstalled] = useState<InstalledExtensionInfo[]>([])
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)

  useEffect(
    () => ExtensionRegistry.subscribe(() => setExtensions(ExtensionRegistry.getExtensions())),
    []
  )

  const refreshInstalled = useCallback(async () => {
    if (!window.api?.extensions) return
    try {
      setInstalled(await window.api.extensions.listInstalled())
    } catch {
      // Sin puente nativo: solo se listan las builtin.
    }
  }, [])

  useEffect(() => {
    void refreshInstalled()
  }, [refreshInstalled])

  const installedIds = new Set(installed.map((entry) => entry.id))

  const handleInstall = useCallback(async () => {
    if (!window.api?.extensions) {
      setStatus({ kind: 'error', text: 'El puente nativo no está disponible.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const picked = await window.api.extensions.pickSef()
      if (!picked.success || !picked.path) return

      const result = await window.api.extensions.installSef(picked.path)
      if (!result.success) {
        setStatus({ kind: 'error', text: result.error })
        return
      }

      await registerInstalledExtension(result.extension)
      await refreshInstalled()
      setStatus({ kind: 'ok', text: `"${result.extension.name}" instalada.` })
    } catch (error) {
      setStatus({ kind: 'error', text: errorText(error) })
    } finally {
      setBusy(false)
    }
  }, [refreshInstalled])

  const handleUninstall = useCallback(
    async (entry: InstalledExtensionInfo) => {
      if (!window.api?.extensions) return
      setBusy(true)
      setStatus(null)
      try {
        const result = await window.api.extensions.uninstall(entry.id)
        if (!result.success) {
          setStatus({ kind: 'error', text: result.error ?? 'No se pudo desinstalar.' })
          return
        }
        unregisterInstalledExtension(entry.id)
        await refreshInstalled()
        setStatus({ kind: 'ok', text: `"${entry.name}" desinstalada.` })
      } catch (error) {
        setStatus({ kind: 'error', text: errorText(error) })
      } finally {
        setBusy(false)
      }
    },
    [refreshInstalled]
  )

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <ExtensionIcon size={16} />
        <div className={styles.headerText}>
          <h3>Extensiones</h3>
          <p>
            Paquetes .sef que aportan paneles, botones y tabs. Las integradas vienen con la app;
            las del usuario se instalan desde disco.
          </p>
        </div>
      </div>

      <ul className={styles.list}>
        {extensions.length === 0 && (
          <li className={styles.empty}>
            <BoxIcon size={16} />
            No hay extensiones cargadas.
          </li>
        )}
        {extensions.map((extension) => {
          const isUserInstalled = installedIds.has(extension.id)
          return (
            <li key={extension.id} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>
                  {extension.name}
                  <span
                    className={
                      extension.isBuiltin ? styles.badgeBuiltin : styles.badgeUser
                    }
                  >
                    {extension.isBuiltin ? 'integrada' : isUserInstalled ? 'usuario' : 'builtin'}
                  </span>
                </span>
                <span className={styles.rowMeta}>
                  v{extension.version}
                  {extension.author ? ` · ${extension.author}` : ''}
                </span>
                <span className={styles.rowContributions}>
                  {contributionsText(extension.id)}
                </span>
              </div>
              {!extension.isBuiltin && isUserInstalled && (
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Desinstalar"
                  disabled={busy}
                  onClick={() => {
                    const entry = installed.find((item) => item.id === extension.id)
                    if (entry) void handleUninstall(entry)
                  }}
                >
                  <DeleteIcon size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy}
          onClick={() => void handleInstall()}
        >
          <ArrowDownloadIcon size={14} />
          Instalar .sef
        </button>
        {status && (
          <span className={status.kind === 'ok' ? styles.statusOk : styles.statusError}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  )
}