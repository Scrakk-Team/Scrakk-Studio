// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Extensiones" — gestor de extensiones SEF.
 *
 * Lista las extensiones del runtime (builtin + usuario), permite instalar un
 * `.sef` desde el disco (descomprime en userData vía IPC) y desinstalarlas en
 * vivo (desregistra sus contribuciones del ExtensionRegistry).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ToggleSwitch } from '@ui'
import {
  ExtensionRegistry,
  isExtensionEnabled,
  enableExtension,
  disableExtension,
  getDisabledExtensions,
  subscribeToEnabled,
  registerBuiltinExtensionById
} from '@services/extensions'
import type { RegisteredExtension } from '@services/extensions'
import {
  listFileIconThemes,
  getActiveFileIconThemeId,
  setActiveFileIconTheme,
  subscribeToFileIcons
} from '@services/fileIcons'
import {
  listProductIconThemes,
  getActiveProductIconThemeId,
  setActiveProductIconTheme,
  subscribeToProductIcons,
  SCRAKK_PRODUCT_ICON_THEME_ID
} from '@services/productIcons'
import {
  registerInstalledExtension,
  unregisterInstalledExtension
} from '@services/extensions/loader/installed'
import type { InstalledExtensionInfo } from '@shared/extensions'
import styles from './ExtensionsSection.module.css'

import { t } from '@core/i18n'
import { api } from '@services/api'
type Status = { kind: 'ok' | 'error'; text: string } | null

function contributionsText(extensionId: string, enabled: boolean): string {
  if (!enabled) return t('settings.desactivada.activala.para.aplicar.sus')
  const counts = ExtensionRegistry.getContributionCount(extensionId)
  const bits: string[] = []
  if (counts.panels > 0) bits.push(`${counts.panels} panel${counts.panels === 1 ? '' : 'es'}`)
  if (counts.activityBar > 0)
    bits.push(`${counts.activityBar} botón${counts.activityBar === 1 ? '' : 'es'}`)
  if (counts.centerTabs > 0)
    bits.push(`${counts.centerTabs} tab central${counts.centerTabs === 1 ? '' : 'es'}`)
  const icons = listFileIconThemes().filter((t) => t.extensionId === extensionId).length
  if (icons > 0) bits.push(`${icons} tema${icons === 1 ? '' : 's'} de iconos`)
  const productIcons = listProductIconThemes().filter((t) => t.extensionId === extensionId).length
  if (productIcons > 0) bits.push(`${productIcons} tema${productIcons === 1 ? '' : 's'} de iconos UI`)
  return bits.length > 0 ? bits.join(' · ') : t('settings.sin.contribuciones')
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Activa los temas de iconos que aporta una extensión recién instalada o
 * reactivada. Sin esto el registro queda poblado pero la UI sigue usando
 * el tema anterior (el picker apunta al default).
 */
function activateExtensionIconThemes(extensionId: string): string[] {
  const applied: string[] = []
  const fileTheme = listFileIconThemes().find((t) => t.extensionId === extensionId)
  if (fileTheme && setActiveFileIconTheme(fileTheme.id)) {
    applied.push(`iconos de archivos: ${fileTheme.name}`)
  }
  const productTheme = listProductIconThemes().find((t) => t.extensionId === extensionId)
  if (productTheme && setActiveProductIconTheme(productTheme.id)) {
    applied.push(`iconos UI: ${productTheme.name}`)
  }
  return applied
}

export function ExtensionsSection(): JSX.Element {
  const [extensions, setExtensions] = useState<RegisteredExtension[]>(() =>
    ExtensionRegistry.getExtensions()
  )
  const [installed, setInstalled] = useState<InstalledExtensionInfo[]>([])
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [iconThemes, setIconThemes] = useState(() => listFileIconThemes())
  const [activeIconTheme, setActiveIconTheme] = useState<string | null>(() =>
    getActiveFileIconThemeId()
  )
  const [productThemes, setProductThemes] = useState(() => listProductIconThemes())
  const [activeProductTheme, setActiveProductTheme] = useState<string>(() =>
    getActiveProductIconThemeId()
  )

  useEffect(
    () => ExtensionRegistry.subscribe(() => setExtensions(ExtensionRegistry.getExtensions())),
    []
  )
  // Las desactivadas se desregistran: se fusionan desde el store enabled
  // para seguir listándolas con su toggle.
  const [, setEnabledTick] = useState(0)
  useEffect(() => subscribeToEnabled(() => setEnabledTick((v) => v + 1)), [])
  // Solo extensiones del usuario: las builtin (integradas) no se listan.
  const allExtensions: RegisteredExtension[] = [
    ...extensions,
    ...getDisabledExtensions()
      .filter((meta) => !extensions.some((e) => e.id === meta.id))
      .map((meta) => ({
        id: meta.id,
        name: meta.name,
        version: meta.version,
        author: meta.author,
        isBuiltin: meta.isBuiltin,
        hidden: meta.hidden
      }))
  ].filter((meta) => !meta.isBuiltin && !meta.hidden)
  useEffect(
    () =>
      subscribeToFileIcons(() => {
        setIconThemes(listFileIconThemes())
        setActiveIconTheme(getActiveFileIconThemeId())
      }),
    []
  )
  useEffect(
    () =>
      subscribeToProductIcons(() => {
        setProductThemes(listProductIconThemes())
        setActiveProductTheme(getActiveProductIconThemeId())
      }),
    []
  )

  const refreshInstalled = useCallback(async () => {
    if (!api?.extensions) return
    try {
      setInstalled(await api.extensions.listInstalled())
    } catch {
      // Sin puente nativo: solo se listan las builtin.
    }
  }, [])

  useEffect(() => {
    void refreshInstalled()
  }, [refreshInstalled])

  const installedIds = new Set(installed.map((entry) => entry.id))

  const handleInstall = useCallback(async () => {
    if (!api?.extensions) {
      setStatus({ kind: 'error', text: t('settings.el.puente.nativo.no.esta') })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const picked = await api.extensions.pickSef()
      if (!picked.success || !picked.path) return

      const result = await api.extensions.installSef(picked.path)
      if (!result.success) {
        setStatus({ kind: 'error', text: result.error })
        return
      }

      await registerInstalledExtension(result.extension)
      // Reinstalación de un id desactivado: vuelve activada.
      enableExtension(result.extension.id)
      await refreshInstalled()
      const applied = activateExtensionIconThemes(result.extension.id)
      setStatus({
        kind: 'ok',
        text:
          `"${result.extension.name}" instalada.` +
          (applied.length > 0 ? ` Aplicados: ${applied.join(' + ')}.` : '')
      })
    } catch (error) {
      setStatus({ kind: 'error', text: errorText(error) })
    } finally {
      setBusy(false)
    }
  }, [refreshInstalled])

  const handleInstallVsix = useCallback(async () => {
    if (!api?.extensions) {
      setStatus({ kind: 'error', text: t('settings.el.puente.nativo.no.esta') })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const picked = await api.extensions.pickVsix()
      if (!picked.success || !picked.path) return

      const result = await api.extensions.installVsix(picked.path)
      if (!result.success) {
        setStatus({ kind: 'error', text: result.error })
        return
      }

      await registerInstalledExtension(result.extension)
      // Reinstalación de un id desactivado: vuelve activada.
      enableExtension(result.extension.id)
      await refreshInstalled()
      const pct = Math.round(result.compat.coverage * 100)
      const parts: string[] = []
      if (result.compat.translatedFileIcons > 0) {
        parts.push(`${result.compat.translatedFileIcons} tema(s) de iconos`)
      }
      if (result.compat.translatedThemes > 0) {
        parts.push(`${result.compat.translatedThemes} tema(s) de color`)
      }
      if (result.compat.translatedProductIcons > 0) {
        parts.push(`${result.compat.translatedProductIcons} tema(s) de iconos UI`)
      }
      const base = `"${result.extension.name}" convertida (${pct}% compatible, ${parts.join(' + ') || t('settings.sin.aportes')}).`
      const applied = activateExtensionIconThemes(result.extension.id)
      const appliedText = applied.length > 0 ? ` Aplicados: ${applied.join(' + ')}.` : ''
      setStatus({
        kind: result.compat.warning ? 'error' : 'ok',
        text: result.compat.warning ? `${base} ${result.compat.warning}${appliedText}` : `${base}${appliedText}`
      })
    } catch (error) {
      setStatus({ kind: 'error', text: errorText(error) })
    } finally {
      setBusy(false)
    }
  }, [refreshInstalled])

  const handleUninstall = useCallback(
    async (entry: InstalledExtensionInfo) => {
      if (!api?.extensions) return
      setBusy(true)
      setStatus(null)
      try {
        const result = await api.extensions.uninstall(entry.id)
        if (!result.success) {
          setStatus({ kind: 'error', text: result.error ?? t('settings.no.se.pudo.desinstalar') })
          return
        }
        unregisterInstalledExtension(entry.id)
        // Olvida el estado on/off (si estaba desactivada, no debe quedar fantasma).
        enableExtension(entry.id)
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

  const handleToggle = useCallback(
    async (extension: RegisteredExtension, next: boolean) => {
      setBusy(true)
      setStatus(null)
      try {
        if (!next) {
          const meta = ExtensionRegistry.getExtension(extension.id)
          disableExtension({
            id: extension.id,
            name: meta?.name ?? extension.name,
            version: meta?.version ?? extension.version,
            author: meta?.author ?? extension.author,
            isBuiltin: extension.isBuiltin,
            hidden: meta?.hidden ?? extension.hidden
          })
          unregisterInstalledExtension(extension.id)
          setStatus({ kind: 'ok', text: `"${extension.name}" desactivada.` })
          return
        }
        enableExtension(extension.id)
        if (extension.isBuiltin) {
          const ok = await registerBuiltinExtensionById(extension.id)
          if (!ok) {
            setStatus({ kind: 'error', text: `No se pudo reactivar "${extension.name}".` })
            return
          }
        } else {
          const entry = installed.find((item) => item.id === extension.id)
          if (!entry) {
            setStatus({ kind: 'error', text: `No se encontró "${extension.name}" en disco.` })
            return
          }
          await registerInstalledExtension(entry)
        }
        const applied = activateExtensionIconThemes(extension.id)
        setStatus({
          kind: 'ok',
          text:
            `"${extension.name}" activada.` +
            (applied.length > 0 ? ` Aplicados: ${applied.join(' + ')}.` : '')
        })
      } catch (error) {
        setStatus({ kind: 'error', text: errorText(error) })
      } finally {
        setBusy(false)
      }
    },
    [installed]
  )

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <ProductIcon id="extensions" size={16} />
        <div className={styles.headerText}>
          <h3>{t('settings.extensiones')}</h3>
          <p>
            {t('settings.extensiones.del.usuario.instaladas.desde')}
          </p>
        </div>
      </div>

      <ul className={styles.list}>
        {allExtensions.length === 0 && (
          <li className={styles.empty}>
            <ProductIcon id="box" size={16} />
            {t('settings.no.hay.extensiones.cargadas')}
          </li>
        )}
        {allExtensions.map((extension) => {
          const isUserInstalled = installedIds.has(extension.id)
          const info = installed.find((item) => item.id === extension.id)
          const enabled = isExtensionEnabled(extension.id)
          return (
            <li
              key={extension.id}
              className={[styles.row, enabled ? null : styles.rowDisabled]
                .filter(Boolean)
                .join(' ')}
            >
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
                  {!enabled && <span className={styles.badgeDisabled}>desactivada</span>}
                </span>
                <span className={styles.rowMeta}>
                  v{extension.version}
                  {extension.author ? ` · ${extension.author}` : ''}
                  {info?.source === 'vscode'
                    ? ` · vscode${typeof info.coverage === 'number' ? ` ${Math.round(info.coverage * 100)}%` : ''}`
                    : ''}
                </span>
                <span className={styles.rowContributions}>
                  {contributionsText(extension.id, enabled)}
                </span>
              </div>
              <div className={styles.rowActions}>
                <ToggleSwitch
                  checked={enabled}
                  disabled={busy}
                  label={enabled ? `Desactivar ${extension.name}` : `Activar ${extension.name}`}
                  onChange={(next) => void handleToggle(extension, next)}
                />
                {!extension.isBuiltin && isUserInstalled && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('settings.desinstalar')}
                    disabled={busy}
                    onClick={() => {
                      const entry = installed.find((item) => item.id === extension.id)
                      if (entry) void handleUninstall(entry)
                    }}
                  >
                    <ProductIcon id="trash" size={14} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className={styles.installBox}>
        <div className={styles.installCopy}>
          <span className={styles.installTitle}>{t('settings.instalar')}</span>
          <span className={styles.installHint}>{t('settings.instalar.ayuda')}</span>
        </div>
        <div className={styles.installActions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy}
            onClick={() => void handleInstall()}
          >
            <ProductIcon id="download" size={14} />
            {t('settings.instalar.sef')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void handleInstallVsix()}
          >
            <ProductIcon id="arrow-right" size={14} />
            {t('settings.instalar.vsix')}
          </button>
        </div>
        {status && (
          <span
            className={[
              styles.statusRow,
              status.kind === 'ok' ? styles.statusOk : styles.statusError
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <ProductIcon
              id={status.kind === 'ok' ? 'check' : 'alert'}
              size={12}
              aria-hidden="true"
            />
            {status.text}
          </span>
        )}
      </div>

      {iconThemes.length > 0 && (
        <div className={styles.header} style={{ marginTop: 16 }}>
          <div className={styles.headerText}>
            <h3>{t('settings.iconos.de.archivos')}</h3>
            <p>{t('settings.el.explorer.y.las.tabs')}</p>
          </div>
        </div>
      )}
      {iconThemes.length > 0 && (
        <ul className={styles.list}>
          {iconThemes.map((theme) => (
            <li key={theme.id} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>{theme.name}</span>
                <span className={styles.rowMeta}>{theme.id}</span>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || activeIconTheme === theme.id}
                onClick={() => setActiveFileIconTheme(theme.id)}
              >
                {activeIconTheme === theme.id ? t('settings.activo') : t('settings.activar')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.header} style={{ marginTop: 16 }}>
        <div className={styles.headerText}>
          <h3>{t('settings.iconos.de.la.interfaz')}</h3>
          <p>Botones, tabs y chevrons usan el tema activo (Scrakk = ProIcons).</p>
        </div>
      </div>
      <ul className={styles.list}>
        <li className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowName}>{t('settings.scrakk')}</span>
            <span className={styles.rowMeta}>{SCRAKK_PRODUCT_ICON_THEME_ID}</span>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || activeProductTheme === SCRAKK_PRODUCT_ICON_THEME_ID}
            onClick={() => setActiveProductIconTheme(SCRAKK_PRODUCT_ICON_THEME_ID)}
          >
            {activeProductTheme === SCRAKK_PRODUCT_ICON_THEME_ID ? t('settings.activo') : t('settings.activar')}
          </button>
        </li>
        {productThemes.map((theme) => (
          <li key={theme.id} className={styles.row}>
            <div className={styles.rowInfo}>
              <span className={styles.rowName}>{theme.name}</span>
              <span className={styles.rowMeta}>{theme.id}</span>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || activeProductTheme === theme.id}
              onClick={() => setActiveProductIconTheme(theme.id)}
            >
              {activeProductTheme === theme.id ? t('settings.activo') : t('settings.activar')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
