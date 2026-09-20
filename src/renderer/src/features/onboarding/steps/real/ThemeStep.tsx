/**
 * Paso 2 — Apariencia. REAL: activa el tema del IDE de verdad.
 *
 * No hay lista propia: los temas salen del ecosistema de extensiones
 * (`@services/extensions`), el mismo stream que alimenta Ajustes → Apariencia.
 * Elegir aquí es exactamente lo mismo que elegir ahí: `activateTheme(id)`
 * aplica y persiste; el tema sobrevive al reinicio.
 *
 * Vista previa honesta: cada tarjeta muestra la paleta REAL del tema, y el
 * tema se aplica al instante, así que lo que se ve es lo que queda.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  activateTheme,
  getActiveThemeId,
  listRegisteredThemes,
  subscribeToThemes,
  type RegisteredThemeEntry
} from '@services/extensions'
import type { StepContext } from '../../types'
import { CardGrid, Chip, ChipRow, OptionCard, SectionLabel, Stack, Swatches, TextInput } from '../kit'

type TypeFilter = 'all' | 'dark' | 'light'

const FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'dark', label: 'Oscuros' },
  { id: 'light', label: 'Claros' }
]

/** Paleta de la tarjeta: acento, fondo de editor, fondo de ventana. */
function themeSwatches(theme: RegisteredThemeEntry): Array<string | undefined> {
  const colors = theme.definition.colors
  return [colors.accent, colors.editorBg ?? colors.surface, colors.bg]
}

export function ThemeStep({ choice, setChoice }: StepContext): JSX.Element {
  const [themes, setThemes] = useState<RegisteredThemeEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TypeFilter>('all')

  const refresh = useCallback((): void => {
    setThemes(listRegisteredThemes())
    setActiveId(getActiveThemeId())
  }, [])

  // Stream de temas: builtin, .sef instaladas y activación (todo llega aquí).
  useEffect(() => {
    refresh()
    return subscribeToThemes(refresh)
  }, [refresh])

  const activeTheme = themes.find((theme) => theme.id === activeId) ?? null

  // El resumen final parte del tema que YA estaba activo, no de vacío.
  useEffect(() => {
    if (choice === null && activeTheme) setChoice(activeTheme.name)
  }, [choice, activeTheme, setChoice])

  const handleActivate = useCallback(
    (theme: RegisteredThemeEntry): void => {
      if (!activateTheme(theme.id)) return
      setActiveId(getActiveThemeId())
      setChoice(theme.name)
    },
    [setChoice]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return themes
      .filter((theme) => (filter === 'all' ? true : theme.type === filter))
      .filter((theme) => (q ? theme.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [themes, filter, query])

  return (
    <Stack gap={4}>
      <ChipRow>
        {FILTERS.map((entry) => (
          <Chip key={entry.id} active={filter === entry.id} onSelect={() => setFilter(entry.id)}>
            {entry.label}
          </Chip>
        ))}
        <TextInput
          label="Buscar tema"
          placeholder="Buscar tema…"
          value={query}
          onChange={setQuery}
        />
      </ChipRow>

      <Stack gap={3}>
        <SectionLabel>
          {activeTheme ? `Activo ahora: ${activeTheme.name}` : 'Sin tema activo'}
          {visible.length < themes.length ? ` · ${visible.length} de ${themes.length}` : ''}
        </SectionLabel>
        {visible.length === 0 ? (
          <OptionCard title="No hay temas que coincidan" description="Prueba con otro nombre o quitá el filtro." />
        ) : (
          <CardGrid columns={3}>
            {visible.map((theme) => (
              <OptionCard
                key={theme.id}
                title={theme.name}
                meta={theme.type === 'light' ? 'Claro' : 'Oscuro'}
                badge={theme.id === activeId ? 'Activo' : undefined}
                selected={theme.id === activeId}
                onSelect={() => handleActivate(theme)}
              >
                <Swatches colors={themeSwatches(theme)} />
              </OptionCard>
            ))}
          </CardGrid>
        )}
      </Stack>
    </Stack>
  )
}
