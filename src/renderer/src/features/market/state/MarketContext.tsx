// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado de la tienda de extensiones (por panel).
 *
 * Mismo patrón que el panel Social: un provider por instancia + hook. Mantiene
 * búsqueda full-text, categorías (del server, sin lista hardcodeada), el detalle
 * con sus valoraciones, "mis extensiones" y las instaladas.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import type { InstalledExtensionInfo } from '@shared/extensions'
import { enableExtension, registerInstalledExtension } from '@services/extensions'
import type {
  MarketExtension,
  MarketRating,
  MarketRelease,
  MarketReportRequest,
  MarketResult,
  MarketUpsertRequest
} from '@shared/market'
import { t } from '@core/i18n'
import { api } from '@services/api'

export type MarketTab = 'store' | 'installed' | 'mine'

interface MarketContextValue {
  accountId: string | null
  tab: MarketTab
  query: string
  category: string | null
  categories: string[]
  results: MarketExtension[]
  loading: boolean
  error: string | null
  detail: MarketExtension | null
  detailRatings: MarketRating[]
  detailRelease: MarketRelease | null
  mine: MarketExtension[]
  installed: InstalledExtensionInfo[]
  busy: string | null
  setTab: (tab: MarketTab) => void
  setQuery: (query: string) => void
  setCategory: (category: string | null) => void
  refresh: () => Promise<void>
  openDetail: (extension: MarketExtension) => Promise<void>
  closeDetail: () => void
  refreshMine: () => Promise<void>
  refreshInstalled: () => Promise<void>
  install: (extension: MarketExtension) => Promise<MarketResult<unknown>>
  uninstall: (id: string) => Promise<void>
  rate: (slug: string, stars: number, comment?: string) => Promise<MarketResult<null>>
  report: (req: MarketReportRequest) => Promise<MarketResult<null>>
  save: (req: MarketUpsertRequest) => Promise<MarketResult<MarketExtension>>
  removeExtension: (slug: string) => Promise<MarketResult<null>>
  uploadImage: (file: File) => Promise<MarketResult<string>>
}

const MarketContext = createContext<MarketContextValue | null>(null)

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function MarketProvider({ children }: { children: ReactNode }): JSX.Element {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [tab, setTab] = useState<MarketTab>('store')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [results, setResults] = useState<MarketExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MarketExtension | null>(null)
  const [detailRatings, setDetailRatings] = useState<MarketRating[]>([])
  const [detailRelease, setDetailRelease] = useState<MarketRelease | null>(null)
  const [mine, setMine] = useState<MarketExtension[]>([])
  const [installed, setInstalled] = useState<InstalledExtensionInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // Cuenta activa (para subir / ratear / mis extensiones).
  useEffect(() => {
    void (async () => {
      const list = await api.account.listAccounts()
      if (list.ok) setAccountId(list.data.activeId)
    })()
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [extensions, cats] = await Promise.all([
        api.market.search({ query, category, limit: 60 }),
        api.market.categories()
      ])
      // `search` es una LECTURA: devuelve el array pelado (igual que
      // `categories`/`mine`/`get`). Los `MarketResult` son para las escrituras.
      setResults(extensions)
      setCategories(cats)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [query, category])

  useEffect(() => {
    if (tab === 'store') void refresh()
  }, [tab, refresh])

  const refreshMine = useCallback(async (): Promise<void> => {
    if (!accountId) {
      setMine([])
      return
    }
    // Job: refresca la última release de mis extensiones (cache) antes de listar.
    await api.market.refresh(accountId).catch(() => undefined)
    setMine(await api.market.mine(accountId))
  }, [accountId])

  const refreshInstalled = useCallback(async (): Promise<void> => {
    const list = await api.extensions.listInstalled()
    setInstalled(list.filter((e) => !e.id.startsWith('scrakk.')))
  }, [])

  useEffect(() => {
    if (tab === 'mine') void refreshMine()
    // La TIENDA también necesita la lista de instaladas: el detalle decide
    // "Instalar" vs "Actualizar" con ella. Si solo se cargara en "Instaladas",
    // un desinstalado por otro lado (Ajustes) dejaría el estado viejo y el
    // detalle ofrecería "Actualizar" (y con el botón deshabilitado).
    if (tab === 'store' || tab === 'installed') void refreshInstalled()
  }, [tab, refreshMine, refreshInstalled])

  const openDetail = useCallback(
    async (extension: MarketExtension): Promise<void> => {
      setDetail(extension)
      setDetailRatings([])
      setDetailRelease(null)
      const [ratings, release] = await Promise.all([
        api.market.ratings(accountId, extension.slug),
        api.market.resolveRelease({
          repoProvider: extension.repoProvider,
          repoUrl: extension.repoUrl,
          assetName: extension.assetName
        })
      ])
      setDetailRatings(ratings)
      if (release.ok) setDetailRelease(release.data)
    },
    [accountId]
  )

  const closeDetail = useCallback((): void => setDetail(null), [])

  const install = useCallback(
    async (extension: MarketExtension): Promise<MarketResult<unknown>> => {
      setBusy(`install:${extension.slug}`)
      const result = await api.market.install(accountId, extension.slug)
      setBusy(null)
      if (result.ok) {
        // El paquete ya quedó en disco (lo escribe el main), pero el RUNTIME no
        // lo conoce: hay que registrarlo igual que "Install .sef" en Ajustes, o
        // sus contribuciones (temas, paneles, iconos) no aparecen hasta
        // reiniciar la app.
        const list = await api.extensions.listInstalled()
        const entry = list.find((item) => item.id === result.data.id)
        if (entry) {
          await registerInstalledExtension(entry)
          // Si estaba desactivada, instalarla la deja activa.
          enableExtension(entry.id)
        }
        await refreshInstalled()
      }
      return result
    },
    [accountId, refreshInstalled]
  )

  const uninstall = useCallback(
    async (id: string): Promise<void> => {
      await api.extensions.uninstall(id)
      await refreshInstalled()
    },
    [refreshInstalled]
  )

  const rate = useCallback(
    async (slug: string, stars: number, comment?: string): Promise<MarketResult<null>> => {
      if (!accountId) return { ok: false, error: t('market.cargando') }
      const result = await api.market.rate(accountId, { slug, stars, comment })
      if (result.ok) setDetailRatings(await api.market.ratings(accountId, slug))
      return result
    },
    [accountId]
  )

  const report = useCallback(
    async (req: MarketReportRequest): Promise<MarketResult<null>> => {
      if (!accountId) return { ok: false, error: t('market.cargando') }
      return api.market.report(accountId, req)
    },
    [accountId]
  )

  const save = useCallback(
    async (req: MarketUpsertRequest): Promise<MarketResult<MarketExtension>> => {
      if (!accountId) return { ok: false, error: t('market.cargando') }
      const result = await api.market.upsert(accountId, req)
      if (result.ok) await refreshMine()
      return result
    },
    [accountId, refreshMine]
  )

  const removeExtension = useCallback(
    async (slug: string): Promise<MarketResult<null>> => {
      if (!accountId) return { ok: false, error: t('market.cargando') }
      const result = await api.market.remove(accountId, slug)
      if (result.ok) await refreshMine()
      return result
    },
    [accountId, refreshMine]
  )

  const uploadImage = useCallback(
    async (file: File): Promise<MarketResult<string>> => {
      if (!accountId) return { ok: false, error: t('market.cargando') }
      const base64 = await fileToBase64(file)
      return api.market.uploadImage(accountId, { base64, mime: file.type, name: file.name })
    },
    [accountId]
  )

  const value = useMemo<MarketContextValue>(
    () => ({
      accountId,
      tab,
      query,
      category,
      categories,
      results,
      loading,
      error,
      detail,
      detailRatings,
      detailRelease,
      mine,
      installed,
      busy,
      setTab,
      setQuery,
      setCategory,
      refresh,
      openDetail,
      closeDetail,
      refreshMine,
      refreshInstalled,
      install,
      uninstall,
      rate,
      report,
      save,
      removeExtension,
      uploadImage
    }),
    [
      accountId,
      tab,
      query,
      category,
      categories,
      results,
      loading,
      error,
      detail,
      detailRatings,
      detailRelease,
      mine,
      installed,
      busy,
      refresh,
      openDetail,
      closeDetail,
      refreshMine,
      refreshInstalled,
      install,
      uninstall,
      rate,
      report,
      save,
      removeExtension,
      uploadImage
    ]
  )

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket fuera de <MarketProvider>')
  return ctx
}
