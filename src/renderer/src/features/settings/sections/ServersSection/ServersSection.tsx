// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Servidores — estado REAL en vivo.
 *
 * Fuente: lspStatus() + stream onLspServerEvent (crashed/retrying/ready
 * actualizan sin poll agresivo; hay un refresco suave de respaldo).
 * Acciones: Reiniciar · Instalar (cuando falla por binario).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  lspStatus,
  lspRestartServer,
  lspInstallServer,
  aggregateServerState,
  onLspServerEvent,
  onLspInstallProgress,
  type AggregateLspState,
  type LspInstallProgressPayload
} from '@services/lsp'
import { setServerDisabled, subscribeToDisabledServers } from '@services/lsp'
import type { LspServerStatus } from '@shared/lsp'
import { notifyInstallResult } from '@features/lsp/LspNotificationsBridge'
import { withMinLoading } from '@core/feedback'
import { LoadingBar, LoadingButton } from '@ui'
import styles from './ServersSection.module.css'

interface ServersSectionProps {
  /** Solo refrescar en vivo cuando el modal está visible. El Modal
      desmonta al cerrarse, así que el default true cubre el caso normal. */
  visible?: boolean
}

function stateLabel(server: LspServerStatus): string {
  // Apagado primero: decir "Detenido" de algo que el usuario apagó a propósito
  // sugiere que se cayó (y manda al usuario a buscar un bug que no existe).
  if (server.disabled) return 'Apagado'
  if (server.state === 'stopped' && !server.available) return 'No instalado'
  return (
    ({
      ready: 'Activo',
      starting: 'Iniciando',
      retrying: 'Reintentando',
      crashed: 'Crashed',
      failed: 'Fallando',
      stopped: 'Detenido'
    })[server.state] ?? server.state
  )
}

const SOURCE_LABELS: Record<string, string> = {
  builtin: 'Builtin',
  user: 'Usuario',
  project: 'Proyecto',
  dynamic: 'Extensión'
}

/** Texto de fase de una instalación (sin %: eso lo pinta la barra). */
function installProgressText(progress: LspInstallProgressPayload): string {
  switch (progress.stage) {
    case 'resolving':
      return 'Preparando…'
    case 'downloading':
      return progress.percentage !== undefined
        ? `Descargando… ${progress.percentage}%`
        : 'Descargando…'
    case 'installing':
      return progress.message ? `Instalando · ${progress.message}` : 'Instalando…'
    case 'extracting':
      return progress.message ? `Extrayendo · ${progress.message}` : 'Extrayendo…'
    case 'done':
      return 'Finalizando…'
  }
}

function StateBadge({ state, label }: { state: LspServerStatus['state']; label: string }): JSX.Element {
  return (
    <span className={[styles.stateBadge, styles[`state_${state}`] ?? null]
      .filter(Boolean)
      .join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}

interface ServerRowProps {
  server: LspServerStatus
  /** Refresca el estado del main y espera: lo usan las acciones para no
      limpiar su barra de carga hasta que el resultado REAL llegó. */
  onRefresh: () => Promise<void>
}

function ServerRow({ server, onRefresh }: ServerRowProps): JSX.Element {
  const [busy, setBusy] = useState<'restart' | 'install' | 'toggle' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LspInstallProgressPayload | null>(null)
  const disabled = server.disabled === true

  // Progreso de instalación empujado por el main, filtrado por server: cada
  // fila sólo pinta lo suyo (varias instalaciones en paralelo no se pisan).
  useEffect(() => {
    return onLspInstallProgress((payload) => {
      if (payload.serverName !== server.name) return
      setProgress(payload)
    })
  }, [server.name])

  const handleRestart = useCallback(async () => {
    setBusy('restart')
    setError(null)
    // `withMinLoading`: el borde del botón dura al menos MIN_LOADING_MS aunque
    // el server responda al instante (si no, parpadea).
    const res = await withMinLoading(lspRestartServer(server.name))
    if (!res.ok) {
      setError(res.error ?? 'error al reiniciar')
      notifyInstallResult(server.name, res)
    }
    await onRefresh()
    setBusy(null)
  }, [server.name, onRefresh])

  const handleInstall = useCallback(async () => {
    setBusy('install')
    setError(null)
    setProgress(null)
    // El aviso sale DESPUÉS del mínimo: nunca adelanta al loader que lo anuncia.
    const res = await withMinLoading(lspInstallServer(server.name))
    notifyInstallResult(server.name, res)
    if (!res.ok) setError(res.error ?? 'error al instalar')
    await onRefresh()
    setBusy(null)
    setProgress(null)
  }, [server.name, onRefresh])

  const handleToggle = useCallback(async () => {
    setBusy('toggle')
    setError(null)
    setServerDisabled(server.name, !disabled)
    // El push al main es fire-and-forget: el borde dura hasta que el estado
    // REAL (status) refleje el cambio, no hasta que termine el set local.
    await withMinLoading(onRefresh())
    setBusy(null)
  }, [server.name, disabled, onRefresh])

  const installable = !server.available || server.state === 'failed'

  // Fase a mostrar como tooltip del botón que carga (el % sólo existe en la
  // descarga real; el resto es texto de fase).
  const installLabel = progress ? installProgressText(progress) : 'Instalando…'

  return (
    <div className={[styles.row, disabled ? styles.rowDisabled : null].filter(Boolean).join(' ')}>
      <div className={styles.rowMain}>
        <div className={styles.rowTop}>
          <span className={styles.serverName}>{server.name}</span>
          <StateBadge state={server.state} label={stateLabel(server)} />
          <span
            className={styles.sourceBadge}
            title={
              server.extensionId
                ? `Lo aporta la extensión ${server.extensionId}`
                : `Configuración: ${SOURCE_LABELS[server.source] ?? server.source}`
            }
          >
            {SOURCE_LABELS[server.source] ?? server.source}
            {server.extensionId ? ` · ${server.extensionId}` : ''}
          </span>
        </div>
        {server.extensions.length > 0 ? (
          <div className={styles.extChips}>
            {server.extensions.slice(0, 6).map((ext) => (
              <code key={ext} className={styles.extChip}>{ext}</code>
            ))}
            {server.extensions.length > 6 ? (
              <span className={styles.more}>+{server.extensions.length - 6}</span>
            ) : null}
          </div>
        ) : null}
        {server.error ? <p className={styles.rowError}>{server.error}</p> : null}
        {error ? <p className={styles.rowError}>{error}</p> : null}
      </div>
      <div className={styles.rowActions}>
        {/*
          Encender/apagar: la decisión se persiste y se empuja al main, que es
          quien la aplica al arrancar (un server apagado no corre EN REALIDAD,
          no sólo se ve gris aquí).
        */}
        <LoadingButton
          loading={busy === 'toggle'}
          loadingLabel={disabled ? 'Apagando…' : 'Encendiendo…'}
          disabled={busy !== null}
          onClick={() => void handleToggle()}
          title={
            disabled
              ? 'Volver a arrancar este server cuando haga falta'
              : 'No arrancar este server (ni sus diagnósticos)'
          }
        >
          {disabled ? 'Encender' : 'Apagar'}
        </LoadingButton>
        {disabled ? null : (
          <LoadingButton
            loading={busy === 'restart'}
            loadingLabel="Reiniciando…"
            disabled={busy !== null}
            onClick={() => void handleRestart()}
          >
            Reiniciar
          </LoadingButton>
        )}
        {installable && !disabled ? (
          <LoadingButton
            loading={busy === 'install'}
            loadingLabel={installLabel}
            disabled={busy !== null}
            onClick={() => void handleInstall()}
            title="Instalar receta del servidor"
          >
            Instalar
          </LoadingButton>
        ) : null}
      </div>
    </div>
  )
}

export function ServersSection({ visible = true }: ServersSectionProps): JSX.Element {
  const [servers, setServers] = useState<LspServerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [aggregate, setAggregate] = useState<AggregateLspState>({
    state: 'idle',
    counts: {},
    total: 0
  })

  const refresh = useCallback(async (): Promise<void> => {
    const list = await lspStatus()
    setServers(list)
    setAggregate(aggregateServerState(list))
  }, [])

  useEffect(() => {
    // Carga inicial: la barra de la zona dura lo que tarda el primer status.
    // El poll de respaldo y los refrescos por evento NO la encienden (serían
    // parpadeos cada 2 s); las acciones de fila tienen su propia barra.
    void (async () => {
      setLoading(true)
      await refresh()
      setLoading(false)
    })()
    // Stream en vivo: crashed/retrying/ready llegan al instante.
    const unsubEvents = onLspServerEvent(() => void refresh())
    // Apagar/encender un server cambia el estado REAL en el main: se refresca
    // cuando la preferencia cambia (y no sólo con el poll de respaldo).
    const unsubDisabled = subscribeToDisabledServers(() => void refresh())
    // Respaldo suave mientras el modal está abierto.
    let timer: ReturnType<typeof setInterval> | undefined
    if (visible) timer = setInterval(() => void refresh(), 2000)
    return () => {
      unsubEvents()
      unsubDisabled()
      if (timer) clearInterval(timer)
    }
  }, [refresh, visible])

  return (
    <div className={styles.section}>
      <p className={styles.summary}>
        {aggregate.total === 0 ? (
          'No hay servers registrados para este workspace.'
        ) : (
          <>
            <strong>{aggregate.total}</strong> servers ·{' '}
            {aggregate.counts['ready'] ?? 0} activos
            {(aggregate.counts['failed'] ?? 0) > 0
              ? ` · ${aggregate.counts['failed']} con error`
              : ''}
          </>
        )}
      </p>

      {loading ? <LoadingBar label="Cargando servidores…" /> : null}

      {!loading && servers.length === 0 ? (
        <p className={styles.empty}>
          Abre una carpeta con código o instala una extensión con{" "}
          <code>lspServers</code>.
        </p>
      ) : (
        <div className={styles.list}>
          {servers.map((server) => (
            <ServerRow key={server.id} server={server} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}
