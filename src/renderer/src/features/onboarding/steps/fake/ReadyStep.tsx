/**
 * Paso 6 — Listo. FAKE: solo UI (lee las elecciones del wizard; no toca
 * servicios).
 *
 * Reúne lo elegido y deja volver a cualquier paso con "Cambiar" (usa
 * `openStep`, no un índice hardcodeado). Separa lo que YA se aplicó de lo
 * que es vista previa, para no vender humo.
 */

import type { JSX } from 'react'
import type { StepContext } from '../../types'
import { PreviewNote, SectionLabel, Stack, SummaryRow } from '../kit'

/** Pasos revisables desde el resumen (id + etiqueta + qué mostrar si no eligió). */
const REVIEW: { stepId: string; label: string; fallback: string }[] = [
  { stepId: 'theme', label: 'Apariencia', fallback: 'Sin cambios' },
  { stepId: 'privacy', label: 'Privacidad', fallback: 'Sin responder' },
  { stepId: 'keymap', label: 'Atajos', fallback: 'Sin elegir' }
]

/** Ids de los pasos que aplican de verdad (el resto es vista previa). */
const REAL_STEP_IDS = new Set(['theme', 'privacy'])

export function ReadyStep({ choices, openStep }: StepContext): JSX.Element {
  const applied = REVIEW.filter((item) => REAL_STEP_IDS.has(item.stepId))

  return (
    <Stack gap={4}>
      <Stack gap={3}>
        <SectionLabel>Lo que elegiste</SectionLabel>
        <Stack gap={2}>
          {REVIEW.map((item) => (
            <SummaryRow
              key={item.stepId}
              label={item.label}
              value={choices[item.stepId] ?? item.fallback}
              onAction={() => openStep(item.stepId)}
            />
          ))}
        </Stack>
      </Stack>

      <PreviewNote>
        {applied.length > 0
          ? 'Apariencia y privacidad ya quedaron aplicadas y se cambian cuando quieras desde Ajustes. Los atajos son una vista previa: todavía no se aplican.'
          : 'Todo lo de arriba es una vista previa: nada se aplicó todavía.'}
      </PreviewNote>
    </Stack>
  )
}
