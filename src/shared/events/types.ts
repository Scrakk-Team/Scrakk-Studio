// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Eventos SEF — el CONTRATO de datos.
 *
 * Un EVENTO es una experiencia TEMPORAL que un paquete `.sef` declara: cuándo
 * puede estar activo, qué recursos usa y una coreografía (timeline) de ops.
 *
 * Este archivo es SÓLO tipos (sin lógica) para que lo compartan el renderer y
 * los tests. La resolución de la ventana vive en `schedule.ts`.
 *
 * NADA de acá conoce a un evento concreto: el motor no sabe qué es un
 * murciélago, sabe "emitir una forma por un camino". La forma viaja en el pack.
 */

/**
 * Ventana de activación. El evento vive SÓLO dentro de `[from, until]`.
 *
 * Es una VENTANA, no un día: `{ from: '2026-10-20', until: '2026-10-31' }` está
 * activo del 20 a las 00:00 hasta el 31 a las 23:59 (inclusive) y después se
 * apaga solo. Sin ventana no hay activación automática: queda sólo el comando.
 */
export interface EventSchedule {
  /** Desde. `YYYY-MM-DD` (día local, 00:00) o ISO completo. Inclusive. */
  from?: string
  /** Hasta. `YYYY-MM-DD` (fin del día local) o ISO completo. Inclusive. */
  until?: string
  /** Versión mínima del IDE (ej. `>=0.1.6`). Opcional. */
  minEngine?: string
}

/** Cómo se ofrece el evento al usuario. */
export type EventActivationMode = 'auto' | 'notify' | 'manual'

export interface EventActivation {
  /**
   * `auto`   — se activa solo al entrar en la ventana.
   * `notify` — entra en la ventana y AVISA, con acción para activarlo.
   * `manual` — nunca solo: sólo por el comando de paleta.
   * Default: `notify`.
   */
  mode?: EventActivationMode
  /** Una sola vez en la vida (persistido). Default: `true`. */
  once?: boolean
  /** Si dos eventos coinciden en la ventana, gana el mayor. Default: 0. */
  priority?: number
}

/**
 * Overrides TEMPORALES mientras el evento vive. Se toman en un snapshot y se
 * restauran EXACTOS al desactivar. Nunca se persisten: si la app se cierra a
 * mitad de evento, el próximo arranque está limpio.
 */
export interface EventOverride {
  /** Id de un tema YA registrado (builtin o de la misma extensión). */
  theme?: string
}

/**
 * Un sonido del pack. Dos formas, excluyentes:
 *
 *  - `file`: un archivo de audio DENTRO del paquete (`assets/…`), en loop o
 *    one-shot. Es lo que querés para cualquier cosa que tenga que sonar de
 *    verdad (una tormenta, un trueno, un cuervo). El motor lo lee con el mime
 *    real y lo decodifica al activar el evento.
 *  - `zzfx`: parámetros numéricos de ZzFX. **Es un sintetizador de chiptune**
 *    (8 bits, sin archivos): sirve para un pack retro, no para ambiente.
 */
export interface EventSound {
  /** Ruta relativa al paquete, ej. `assets/trueno.ogg`. */
  file?: string
  /** Parámetros de ZzFX (8 bits, sin archivos). */
  zzfx?: number[]
  /** 0..1. Default 1. */
  gain?: number
  /** Loop (ambiente). Default false. */
  loop?: boolean
}

/**
 * Geometría a dibujar: el `path` es el CUERPO y, si hay `wing`, un ala que se
 * dibuja DOS veces (derecha y su espejo) y es la ÚNICA parte que se mueve al
 * aletear. Sin `wing`, la forma entera es rígida.
 */
export interface EventShape {
  /** `d` de un `<path>` SVG — el cuerpo. */
  path: string
  /** `d` de UN ala (la derecha). El motor dibuja su espejo para la izquierda. */
  wing?: string
  /** [x, y] del hombro: el ala rota acá. Default [w/2, h/2]. */
  wingAnchor?: [number, number]
  /** [ancho, alto] del sistema de coordenadas. Default [1, 1]. */
  viewBox?: [number, number]
  /** Color del tema (`accent`, `text`, `textMuted`…) o un color CSS. */
  fill?: string
  stroke?: string
  /** Grosor del trazo. Default 1. */
  width?: number
}

/**
 * Camino de una partícula. `from`/`to` son puntos en **viewport units**: un
 * número absoluto es px, un string admite `vw`/`vh`/`%`.
 */
export interface EventMotion {
  from?: [number | string, number | string]
  to?: [number | string, number | string]
  /**
   * Punto por el que PASA el camino (curva cuadrática). Es lo que convierte una
   * recta en un vuelo: sin esto todos los bichos viajan en línea y se ve falso.
   */
  through?: [number | string, number | string]
  /** Deriva continua por segundo, en px. */
  drift?: [number, number]
  /** Amplitud del vaivén vertical en px (el "vuelo" del bicho). Default 0. */
  bob?: number
  /** Hz del vaivén. Default 1.5. */
  bobHz?: number
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out'
}

/** Nombres de op que el motor sabe ejecutar. */
export type EventOpName =
  | 'stage.fog'
  | 'stage.tint'
  | 'stage.vignette'
  | 'stage.shake'
  | 'emit'
  | 'audio.play'
  | 'audio.ambience'
  | 'audio.stop'
  | 'notify'
  | 'status.add'
  | 'theme.set'

/**
 * Un paso de la coreografía. Los parámetros se validan POR OP en el schema (el
 * formato es tolerante: lo inválido se descarta con warning, el resto sigue),
 * así que acá viven todos los campos opcionales con su op dueña anotada.
 */
export interface EventOp {
  op: EventOpName
  /** ms desde la activación. Default 0. */
  at?: number

  // ── stage.* ──
  /** `stage.fog` / `stage.vignette` / `stage.tint`: 0..1. */
  amount?: number
  /** `stage.fog` / `stage.tint`: token del tema o color CSS. */
  tint?: string
  /** `stage.*`: ms de fade (in y out). Default 1200. */
  fade?: number

  // ── stage.shake ──
  /** `stage.shake`: px de amplitud. Default 3. */
  intensity?: number
  /** `stage.shake`: ms. Default 400. */
  duration?: number

  // ── emit ──
  draw?: EventShape
  /** Cuántas instancias. Default 1. */
  count?: number
  motion?: EventMotion
  /** 0..1: desvío aleatorio del punto de salida. Default 0. */
  jitter?: number
  /**
   * 0..1: dispersión del punto de LLEGADA. Con un grupo, cada bicho termina en
   * un lugar distinto (se abren) en vez de pisarse en el mismo punto.
   */
  spread?: number
  /**
   * Grados de inclinación hacia donde viaja (banqueo). Default 0.
   */
  bank?: number
  /** Escala del dibujo. Default 1. */
  size?: number
  /** Rotación inicial en grados (aleatoria ±). Default 0. */
  rotate?: number
  /** Aleteo por segundo: pliega y despliega el ala (0 = sin aleteo). */
  flapHz?: number
  /** ms de vida de cada instancia. Default 6000. */
  life?: number
  /** ms entre instancias (para hacer un río). Default 0. */
  every?: number

  // ── audio.* ──
  /** Clave en `sounds`. */
  sound?: string

  // ── notify ──
  title?: string
  message?: string
  severity?: 'info' | 'success' | 'warn' | 'error'

  // ── status.add ──
  text?: string
  icon?: string
  /** `status.add`: ms hasta desaparecer (0 = hasta desactivar). Default 0. */
  ttl?: number

  // ── theme.set ──
  theme?: string
}

/** La escena: todo lo que un evento aporta (sin id/name, que van en el manifest). */
export interface EventScene {
  /** Versión del formato. Hoy: 1. */
  specVersion: number
  schedule?: EventSchedule
  activation?: EventActivation
  /** Escala global 0..1 (los packs la usan para un ajuste fino). Default 1. */
  intensity?: number
  /** Cuánto dura el evento (ms). Default: hasta que cierre la ventana. */
  durationMs?: number
  override?: EventOverride
  sounds?: Record<string, EventSound>
  /** Strings del pack. En las ops se referencian como `@clave`. */
  strings?: Record<string, string>
  timeline: EventOp[]
  /** Ops que corren al desactivar (fade out, etc.). */
  onStop?: EventOp[]
}

/** Un evento registrado: la contribution + la escena ya normalizada. */
export interface EventDefinition extends EventScene {
  id: string
  name: string
}

/** Reglas de la ventana mínima del formato que el IDE entiende. */
export const EVENT_SPEC_VERSION = 1
