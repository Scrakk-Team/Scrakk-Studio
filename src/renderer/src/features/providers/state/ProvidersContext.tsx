import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { ThinkingMode } from '@shared/thinking'
import { getProvider, providers, type ProviderConfig } from '@services/providers'

const STORAGE_KEY = 'scrakk-studio:providers'

interface StoredProvidersState {
  activeProviderId: string | null
  apiKeys: Record<string, string>
  /** Modelo elegido por proveedor (id exacto). Vacío = defaultModel del config. */
  models: Record<string, string>
  /** Modo de pensamiento elegido por proveedor ('auto' si no está). */
  thinkingModes: Record<string, string>
}

const EMPTY_STORED: StoredProvidersState = {
  activeProviderId: null,
  apiKeys: {},
  models: {},
  thinkingModes: {}
}

function loadStoredState(): StoredProvidersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STORED
    const parsed = JSON.parse(raw) as Partial<StoredProvidersState>
    return {
      activeProviderId: typeof parsed.activeProviderId === 'string' ? parsed.activeProviderId : null,
      apiKeys:
        typeof parsed.apiKeys === 'object' && parsed.apiKeys !== null ? parsed.apiKeys : {},
      models:
        typeof parsed.models === 'object' && parsed.models !== null ? parsed.models : {},
      thinkingModes:
        typeof parsed.thinkingModes === 'object' && parsed.thinkingModes !== null
          ? parsed.thinkingModes
          : {}
    }
  } catch {
    return EMPTY_STORED
  }
}

interface ProvidersContextValue {
  /** Proveedores detectados automáticamente (registry). */
  providers: ProviderConfig[]
  activeProviderId: string | null
  /** Proveedor activo resuelto (null si no hay ninguno seleccionado). */
  activeProvider: ProviderConfig | null
  /** API key guardada de un proveedor ('' si no tiene). */
  getApiKey: (providerId: string) => string
  /** Modelo elegido de un proveedor (fallback: defaultModel del config). */
  getModel: (providerId: string) => string
  /** Modo de pensamiento elegido de un proveedor (fallback: 'auto'). */
  getThinkingMode: (providerId: string) => ThinkingMode
  /** Selecciona el proveedor activo (debe tener key para poder chatear). */
  selectProvider: (providerId: string) => void
  /** Guarda la key del proveedor (persistida en localStorage). */
  setApiKey: (providerId: string, apiKey: string) => void
  /** Elimina la key guardada. */
  removeApiKey: (providerId: string) => void
  /** Guarda el modelo elegido del proveedor (persistido en localStorage). */
  setModel: (providerId: string, modelId: string) => void
  /** Guarda el modo de pensamiento del proveedor (persistido en localStorage). */
  setThinkingMode: (providerId: string, mode: ThinkingMode) => void
  /** Estado del modal de proveedores (se abre desde el menú o el picker). */
  isProvidersModalOpen: boolean
  openProvidersModal: () => void
  closeProvidersModal: () => void
}

const ProvidersContext = createContext<ProvidersContextValue | null>(null)

/**
 * Estado real de los proveedores de LLM: el proveedor activo y sus API keys.
 * Se detectan solos desde `services/providers` (import.meta.glob); acá solo
 * se elige cuál usar y se guardan las keys localmente.
 */
export function ProvidersProvider({ children }: { children: ReactNode }) {
  // Una sola lectura de localStorage (el lazy init corre una única vez).
  const [stored] = useState(loadStoredState)
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() =>
    // Si el proveedor guardado ya no existe en el registro, arranca sin activo.
    stored.activeProviderId && getProvider(stored.activeProviderId) ? stored.activeProviderId : null
  )
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(stored.apiKeys)
  const [models, setModels] = useState<Record<string, string>>(stored.models)
  const [thinkingModes, setThinkingModes] = useState<Record<string, string>>(stored.thinkingModes)
  const [isProvidersModalOpen, setIsProvidersModalOpen] = useState(false)

  // Persistencia: cada cambio se guarda solo.
  useEffect(() => {
    const stored: StoredProvidersState = { activeProviderId, apiKeys, models, thinkingModes }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // Almacenamiento no disponible: se sigue en memoria nomás.
    }
  }, [activeProviderId, apiKeys, models, thinkingModes])

  const activeProvider = useMemo(
    () => (activeProviderId ? getProvider(activeProviderId) : null),
    [activeProviderId]
  )

  const getApiKey = useCallback((providerId: string): string => apiKeys[providerId] ?? '', [apiKeys])

  const getModel = useCallback(
    (providerId: string): string => models[providerId] ?? getProvider(providerId)?.defaultModel ?? '',
    [models]
  )

  const getThinkingMode = useCallback(
    (providerId: string): ThinkingMode => {
      const mode = thinkingModes[providerId]
      return mode === 'auto' || mode === 'off' || mode === 'low' || mode === 'medium' ||
        mode === 'high' || mode === 'on'
        ? mode
        : 'auto'
    },
    [thinkingModes]
  )

  const selectProvider = useCallback((providerId: string) => {
    setActiveProviderId(providerId)
  }, [])

  const setApiKey = useCallback((providerId: string, apiKey: string) => {
    const key = apiKey.trim()
    setApiKeys((prev) => ({ ...prev, [providerId]: key }))
    if (key) setActiveProviderId(providerId)
  }, [])

  const removeApiKey = useCallback((providerId: string) => {
    setApiKeys((prev) => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    // Si era el proveedor activo, sin key no puede chatear → se desactiva.
    setActiveProviderId((prev) => (prev === providerId ? null : prev))
  }, [])

  const setModel = useCallback((providerId: string, modelId: string) => {
    setModels((prev) => ({ ...prev, [providerId]: modelId }))
  }, [])

  const setThinkingMode = useCallback((providerId: string, mode: ThinkingMode) => {
    setThinkingModes((prev) => ({ ...prev, [providerId]: mode }))
  }, [])

  const openProvidersModal = useCallback(() => setIsProvidersModalOpen(true), [])
  const closeProvidersModal = useCallback(() => setIsProvidersModalOpen(false), [])

  const value = useMemo(
    () => ({
      providers,
      activeProviderId,
      activeProvider,
      getApiKey,
      getModel,
      getThinkingMode,
      selectProvider,
      setApiKey,
      removeApiKey,
      setModel,
      setThinkingMode,
      isProvidersModalOpen,
      openProvidersModal,
      closeProvidersModal
    }),
    [
      providers,
      activeProviderId,
      activeProvider,
      getApiKey,
      getModel,
      getThinkingMode,
      selectProvider,
      setApiKey,
      removeApiKey,
      setModel,
      setThinkingMode,
      isProvidersModalOpen,
      openProvidersModal,
      closeProvidersModal
    ]
  )

  return <ProvidersContext.Provider value={value}>{children}</ProvidersContext.Provider>
}

export function useProviders(): ProvidersContextValue {
  const context = useContext(ProvidersContext)
  if (!context) {
    throw new Error('useProviders debe usarse dentro de <ProvidersProvider>')
  }
  return context
}
