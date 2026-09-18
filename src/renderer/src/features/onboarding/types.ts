/**
 * Pantalla de configuración inicial (onboarding) — tipos públicos.
 *
 * El wizard NO conoce ningún paso concreto: los pasos se registran en el
 * registry (mismo patrón que el ToolDock) y cada uno declara su `kind`.
 *
 * ┌─ REAL vs FAKE ────────────────────────────────────────────────────────┐
 * │ 'real'  — el paso toca un servicio REAL del IDE (activar tema,        │
 * │           persistir una preferencia). Lo que el usuario elige, pasa.  │
 * │ 'fake'  — SOLO UI, con datos de mentira. Es una maqueta: no puede     │
 * │           importar NINGÚN servicio real (lo verifica                 │
 * │           tests/onboarding.test.ts, que lee los imports de steps/fake)│
 * │           y el wizard lo rotula "Vista previa" en el encabezado.      │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Esa separación es la que permite maquetar rápido sin mentirle al usuario
 * ni mezclar la maqueta con la app real.
 */

import type { ComponentType } from 'react'

/** De dónde salen los datos de un paso (ver cabecera). */
export type StepKind = 'real' | 'fake'

/**
 * Props que el wizard inyecta al componente de cada paso. Todo lo que un
 * paso necesita para navegar y para guardar su elección, sin acoplarse al
 * contexto ni a servicios.
 */
export interface StepContext {
  /** Avanza al siguiente paso (o cierra si es el último). */
  next: () => void
  /** Retrocede un paso (no-op en el primero). */
  back: () => void
  /** Cierra el wizard marcándolo como completado. */
  finish: () => void
  /** Salta a otro paso por id (el resumen vuelve a ajustar algo). */
  openStep: (stepId: string) => void
  /**
   * Elecciones registradas por id de paso. El valor es TEXTO listo para
   * mostrar en el resumen final (nombre del tema, "Activada", etc.): el
   * wizard no interpreta lo elegido, solo lo lista.
   */
  choices: Readonly<Record<string, string | null>>
  /** Elección de ESTE paso (atajo de choices[stepId]). */
  choice: string | null
  /** Registra la elección de ESTE paso (texto para el resumen). */
  setChoice: (value: string | null) => void
}

/** Un paso de la configuración inicial. */
export interface OnboardingStep {
  /** Id único y estable (lo que se persiste). */
  id: string
  /** Etiqueta corta del nav lateral. */
  label: string
  /** Título grande del paso. */
  title: string
  /** Bajada de una línea. */
  subtitle: string
  /** Id del ProductIcon (cero SVG hardcodeado). */
  icon: string
  /** 'real' (se aplica ya) o 'fake' (vista previa, solo UI). */
  kind: StepKind
  /** Orden en el wizard (ascendente; default 100). */
  order?: number
  /**
   * Se puede omitir con "Omitir configuración" (default true). `false` deja
   * el botón de omitir igual, pero el paso se marca como obligatorio en el
   * nav — reservado para pasos de seguridad/licencia.
   */
  skippable?: boolean
  /** Contenido del paso. */
  component: ComponentType<StepContext>
}
