// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SocialCodeCard — visual de un mensaje `codefile` (archivo compartido).
 *
 * El mensaje trae un SOBRE (metadatos + key de R2); el contenido se baja bajo
 * demanda con URL firmada y se verifica por sha256. El header muestra el
 * ícono según el tema de fileIcons activo (nada hardcodeado) + nombre + líneas
 * + vencimiento.
 *
 * El body monta una SESIÓN de Innerta real: se instancia el motor aislado
 * (WASM + canvas propios, uno por mensaje) y se abre el archivo con
 * `loadFile(path, content)`. Al colapsar/desmontar se `destroy()` para liberar
 * el módulo.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { useFileIconUrl } from '@services/fileIcons'
import { createIsolatedEditorEngine, type EditorEngine } from '@features/editor/engine'
import type { DirectMessage, SocialResult } from '@shared/social'
import {
  codeFileDaysLeft,
  decodeCodeFile,
  formatFileSize,
  isCodeFileExpired,
  type SocialCodeFile
} from '@shared/socialCodeFile'
import { useSocial } from '../../state/SocialContext'
import styles from './SocialCodeCard.module.css'

import { t } from '@core/i18n'
import { api } from '@services/api'
interface SocialCodeCardProps {
  message: DirectMessage
  isOwn: boolean
}

export function SocialCodeCard({ message, isOwn }: SocialCodeCardProps): JSX.Element {
  const { accountId } = useSocial()
  const meta = useMemo(() => decodeCodeFile(message.body), [message.body])
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<EditorEngine | null>(null)

  const iconUrl = useFileIconUrl(meta?.name ?? '', false, undefined, {
    path: meta?.name,
    languageId: meta?.lang
  })

  const load = useCallback(async (): Promise<void> => {
    if (!meta || content !== null || busy) return
    if (!accountId) return
    setBusy(true)
    setError(null)
    try {
      const result = (await api.social.codeFileContent(
        accountId,
        message.id
      )) as SocialResult<{ content: string; meta: SocialCodeFile }>
      if (!result.ok) {
        setError(result.error ?? t('social.no.se.pudo.abrir.el.archivo'))
        return
      }
      setContent(result.data.content)
    } finally {
      setBusy(false)
    }
  }, [accountId, message.id, meta, content, busy])

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  const remove = useCallback(async (): Promise<void> => {
    if (!accountId || !isOwn) return
    const result = (await api.social.deleteCodeFile(
      accountId,
      message.id
    )) as SocialResult<boolean>
    if (!result.ok) setError(result.error ?? t('social.no.se.pudo.borrar.el.archivo'))
    else setGone(true)
  }, [accountId, isOwn, message.id])

  // Sesión de Innerta: un motor AISLADO por mensaje (su WASM + canvas) que se
  // abre con el archivo y se destruye al colapsar/desmontar (libera memoria).
  useEffect(() => {
    if (!open || content === null) return undefined
    const host = hostRef.current
    if (!host) return undefined
    const name = meta?.name ?? 'archivo'

    const engine = createIsolatedEditorEngine()
    engineRef.current = engine
    engine.attach(host)
    engine.loadFile(name, content)
    // loadFile() enfoca el canvas; en la card no queremos robarle el foco al
    // compositor del chat. Se puede clickear igual para interactuar.
    const raf = requestAnimationFrame(() => {
      host.querySelector<HTMLCanvasElement>('canvas')?.blur()
    })

    return () => {
      cancelAnimationFrame(raf)
      engine.destroy?.()
      engineRef.current = null
    }
  }, [open, content, meta?.name])

  if (!meta) {
    return <div className={styles.card}>{t('social.archivo.compartido.danado')}</div>
  }

  const expired = isCodeFileExpired(meta)
  const daysLeft = codeFileDaysLeft(meta)
  const showEmbed = open && !gone && !error && content !== null

  return (
    <div className={styles.card} data-open={open ? '' : undefined}>
      <button type="button" className={styles.header} onClick={toggle} aria-expanded={open}>
        <span className={styles.icon} aria-hidden="true">
          {iconUrl ? (
            <img src={iconUrl} alt="" width={15} height={15} />
          ) : (
            <ProductIcon id="file" size={14} />
          )}
        </span>
        <span className={styles.name}>{meta.name}</span>
        <span className={styles.meta}>
          {meta.lines.toLocaleString()} {t('social.lineas')} · {formatFileSize(meta.size)}
        </span>
        <span className={styles.spacer} />
        {expired ? (
          <span className={styles.expired}>{t('social.expirado')}</span>
        ) : (
          <span className={styles.expires}>
            {t('social.se.borra.en.dias', { days: String(daysLeft) })}
          </span>
        )}
        <span className={styles.chevron} data-open={open ? '' : undefined} aria-hidden="true">
          <ProductIcon id="chevron-down" size={12} />
        </span>
      </button>

      {open ? (
        <div className={styles.body}>
          {busy ? <div className={styles.hint}>{t('social.descargando')}</div> : null}
          {gone ? <div className={styles.hint}>{t('social.archivo.borrado')}</div> : null}
          {!gone && error ? <div className={styles.error}>{error}</div> : null}
          {showEmbed ? <div ref={hostRef} className={styles.embed} /> : null}
          {!gone && isOwn ? (
            <div className={styles.actions}>
              <button type="button" className={styles.action} onClick={() => void remove()}>
                <ProductIcon id="trash" size={12} />
                {t('social.borrar.archivo')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
