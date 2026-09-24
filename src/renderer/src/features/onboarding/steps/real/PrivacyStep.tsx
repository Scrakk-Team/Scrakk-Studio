// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Paso 3 — Privacidad. REAL: la preferencia se persiste de verdad.
 *
 * Decisión de producto (cerrada):
 *  - Default APAGADA.
 *  - Se pregunta UNA sola vez (aquí y en Ajustes → Privacidad).
 *  - Alcance global, con excepción por extensión más adelante.
 *
 * Honestidad por delante: hoy Scrakk no envía telemetría propia. El valor
 * existe para que las extensiones lean el estado REAL del IDE
 * (`env.isTelemetryEnabled`) y no un `false` hardcodeado. Scrakk no
 * intercepta, no reenvía ni bloquea lo que una extensión mande a su
 * servidor: eso es consentimiento de la extensión.
 */

import { useEffect, useState, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import { getPersistedTelemetryEnabled, markTelemetryAsked } from '@services/storage'
import { applyTelemetryEnabled } from '@services/extensions/telemetry'
import type { StepContext } from '../../types'
import { PreviewNote, SectionLabel, Stack, SwitchRow } from '../kit'

/** Texto de la elección tal como lo muestra el resumen final. */
function labelFor(enabled: boolean): string {
  return enabled ? 'Telemetría activada' : 'Telemetría desactivada'
}

export function PrivacyStep({ setChoice }: StepContext): JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(() => getPersistedTelemetryEnabled())

  // El resumen final refleja la preferencia REAL (la persistida), no una copia.
  useEffect(() => {
    setChoice(labelFor(enabled))
  }, [enabled, setChoice])

  const toggle = (next: boolean): void => {
    setEnabled(next)
    // Persiste Y lo publica a los hosts vivos: la extensión ve el cambio en
    // `env.onDidChangeTelemetryEnabled` en vez de quedar con el valor viejo.
    applyTelemetryEnabled(next)
    // Preguntado una vez: el wizard no vuelve a insistir.
    markTelemetryAsked()
  }

  return (
    <Stack gap={4}>
      <Stack gap={3}>
        <SectionLabel>Datos de uso</SectionLabel>
        <SwitchRow
          title="Compartir datos de uso del editor"
          description="Permite que las extensiones detecten si el IDE tiene la telemetría activada. Scrakk no envía nada por su cuenta."
        >
          <ToggleSwitch checked={enabled} onChange={toggle} label="Compartir datos de uso" />
        </SwitchRow>
      </Stack>

      <PreviewNote>
        La excepción por extensión (apagar la telemetría solo para algunas) todavía no está: llega
        junto con la capa de compatibilidad. Mientras tanto, este interruptor es global y ya se
        guarda.
      </PreviewNote>
    </Stack>
  )
}
