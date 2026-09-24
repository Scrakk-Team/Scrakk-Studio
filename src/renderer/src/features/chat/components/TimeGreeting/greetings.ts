// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Saludos horarios del estado vacío.
 * 152 frases reales, naturales y coloquiales, repartidas en 4 franjas:
 * madrugada (0-6), mañana (6-12), tarde (12-18) y noche (18-24).
 * Español neutro (tuteo), sin regionalismos.
 * El marcador `{name}` se reemplaza por un nombre (hoy: "amigo").
 */

export type TimeSlot = 'madrugada' | 'manana' | 'tarde' | 'noche'

const NAME_FALLBACK = 'amigo'

const MADRUGADA: string[] = [
  '¿Transnochando, {name}?',
  'A esta hora y con la cabeza llena de ideas.',
  '¿Dormiste algo o seguimos de largo?',
  'La noche es joven y tú también.',
  '¿Vino el insomnio de visita otra vez?',
  'Silencio total: solo tú y la pantalla.',
  '¿Café a esta hora? Valiente.',
  'El mundo duerme. Tú, claramente no.',
  '¿Qué haces despierto a esta hora?',
  'Las mejores ideas llegan cuando nadie molesta.',
  '¿Otra vez dando vueltas en la cabeza?',
  'La madrugada tiene eso: se piensa mejor.',
  '¿Terminas algo o recién arrancas?',
  'El sol no tarda. Aprovecha la paz.',
  '¿Esto es trasnoche o ya arrancaste el día?',
  'Tranquilo, el sueño puede esperar.',
  '¿Qué te tiene despierto a esta hora?',
  'Los pájaros todavía no se enteraron.',
  '¿Mucha vuelta en la cabeza, {name}?',
  'A las tres de la mañana todo parece más importante.',
  '¿Cafeína o pura voluntad?',
  'La ciudad duerme, las ideas no.',
  '¿Seguro que no quieres intentar dormir un poco?',
  'El silencio de la madrugada es oro.',
  '¿Se te ocurrió algo o estás mirando el techo?',
  'Hora de trasnoche, hora de crear.',
  '¿Quién necesita sueño cuando hay algo que pensar?',
  'La noche es larga y el café acompaña.',
  '¿Qué te trae por aquí a esta hora?',
  'Mañana te vas a acordar de esta noche.',
  'El resto duerme. Nosotros pensamos.',
  '¿Empezaste algo o sigues con la duda?',
  'La madrugada premia a los que se quedan.',
  '¿Te quedaste con algo dando vueltas?',
  'A esta hora hasta los pensamientos suenan más fuerte.',
  '¿Café o té para aguantar?',
  'Tarde o temprano sale el sol. Mientras tanto, aquí estamos.',
  '¿Noche de insomnio o de ideas, {name}?'
]

const MANANA: string[] = [
  'Buen día, {name}. ¿Arrancamos?',
  '¿Ya tomaste el café o lo estamos pensando?',
  'Mañana fresca, cabeza despejada.',
  '¿Qué se viene hoy?',
  'Bien temprano y ya en movimiento.',
  '¿Dormiste bien o el café manda?',
  'Arrancó el día. ¿Por dónde lo agarramos?',
  'Mañana de esas que invitan a hacer cosas.',
  '¿Desayunaste o directo a la pantalla?',
  'El día es nuevo y las pilas están cargadas.',
  '¿Planes para hoy o lo vamos viendo?',
  'Luz de mañana, energía fresca.',
  '¿En qué piensas desde que te levantaste?',
  'Buen día. El mundo recién arranca.',
  '¿Café cargado o descafeinado?',
  'Hora de arrancar con todo.',
  '¿Qué tal arrancó la mañana?',
  'El sol salió y las ideas también.',
  '¿Listo para el día o todavía con el primer café?',
  'Mañana promete.',
  '¿Ya armaste el plan o lo inventamos sobre la marcha?',
  'Día nuevo, pantalla lista.',
  '¿Con qué le ganamos a la mañana?',
  'Temprano y ya pensando. Me gusta.',
  '¿El despertador o la costumbre?',
  'Vamos a ver qué rinde este día.',
  'Mañana con aroma a café recién hecho.',
  '¿En qué andamos hoy?',
  'El día arranca y hay un montón por hacer.',
  '¿Soñaste con algo interesante?',
  'Buen día, buenas ideas.',
  '¿Café o té? Elige tu bando.',
  'La mañana es para las grandes decisiones.',
  '¿Rutina de siempre o algo nuevo hoy?',
  'Tempranito y con la cabeza a full.',
  '¿Qué le vamos a hacer hoy a la vida?',
  'Mañana despejada, sin vueltas.',
  'Arrancamos. ¿Por dónde, {name}?'
]

const TARDE: string[] = [
  'Tarde de esas para cerrar pendientes.',
  '¿Almorzaste bien o andas con hambre?',
  'La tarde da para todo.',
  '¿Cómo va la jornada, {name}?',
  'Tarde, café y cosas por hacer.',
  '¿Seguimos con lo de esta mañana?',
  'Sobremesa larga, el mejor momento.',
  '¿En qué te enganchas esta tarde?',
  'La tarde es ideal para lo que falta.',
  '¿Mucha calor o tranqui?',
  'Tarde de producción.',
  '¿Horario de siesta o de trabajo?',
  '¿Ya se cumplió algo del plan de hoy?',
  'La tarde invita a meterle.',
  '¿Sigues a full o ya bajó un cambio?',
  'Tarde de esas que rinden.',
  '¿Qué queda por hacer hoy?',
  'Vamos cerrando el día con todo.',
  '¿Café de la tarde? Siempre.',
  'La tarde pasa rápido cuando hay ideas.',
  '¿Hiciste una pausa o sigues de largo?',
  'Tarde tranquila, cabeza ordenada.',
  '¿En qué andas metido?',
  'Queda tarde por delante.',
  '¿Algo dulce para acompañar la tarde?',
  'La tarde es buena para pensar despacio.',
  '¿Cómo viene el día hasta aquí?',
  'Tarde productiva, se nota.',
  '¿Terminamos algo o empezamos otra cosa?',
  'La luz de la tarde es la mejor compañía.',
  '¿Listo para la segunda parte del día?',
  'Tarde de café o de té, tú decides.',
  '¿En qué avanzamos?',
  'La tarde premia a los constantes.',
  '¿Plan para rato o pausa?',
  'Tarde con ritmo propio.',
  '¿Se te complicó algo o todo en orden?',
  'Último tramo del día: vamos, {name}.'
]

const NOCHE: string[] = [
  'Buenas noches, {name}. ¿Cómo cierras el día?',
  'Cayó la noche, bajó el ruido.',
  '¿Cena lista o seguimos aquí?',
  'La noche es para lo que quedó pendiente.',
  '¿Qué tal te trató el día?',
  'Noche tranquila, pantalla encendida.',
  '¿Ya cerraste el día o lo estás estirando?',
  'La noche invita a pensar en lo que viene.',
  '¿Merienda nocturna o directo a la cama?',
  'Noche de resumen: ¿qué quedó?',
  '¿Descansamos o le damos una vuelta más?',
  'La noche es buena para planear.',
  '¿Se apagó el sol pero no las ideas?',
  'Noche, café y pantalla.',
  '¿Cómo cerramos el día?',
  'La noche cae y las pilas bajan.',
  '¿Último empujón o hasta mañana?',
  'Noche de esas que dan para hablar.',
  '¿El día dio lo que esperabas?',
  'Noche fresca, ideas claras.',
  '¿Ya cenaste o lo dejamos para después?',
  'La noche es el resumen del día.',
  '¿Con qué nos quedamos hoy?',
  'Noche de repasar y planear.',
  '¿Calor en casa o noche fresca?',
  'La noche premia a los que no se rinden.',
  '¿Seguimos un rato más?',
  'Noche tranquila para pensar.',
  '¿Qué dejaste para mañana?',
  'La noche esconde las mejores charlas.',
  '¿Bajamos la persiana o sigue la función?',
  'Noche, silencio y buena compañía.',
  '¿Cómo estuvo el día en una palabra?',
  'La noche cae despacio, como las ideas buenas.',
  '¿Último café o ya está?',
  'Noche de balance.',
  '¿Mañana es otro día o seguimos hoy?',
  'Buenas noches. Cuando quieras, aquí estoy.'
]

interface TimeSlotConfig {
  slot: TimeSlot
  from: number
  to: number
  greetings: string[]
}

const SLOTS: TimeSlotConfig[] = [
  { slot: 'madrugada', from: 0, to: 6, greetings: MADRUGADA },
  { slot: 'manana', from: 6, to: 12, greetings: MANANA },
  { slot: 'tarde', from: 12, to: 18, greetings: TARDE },
  { slot: 'noche', from: 18, to: 24, greetings: NOCHE }
]

/** Franja horaria según la hora del sistema (0-23). */
export function getTimeSlot(hour: number): TimeSlot {
  const config = SLOTS.find((item) => hour >= item.from && hour < item.to)
  return (config ?? SLOTS[0]).slot
}

/** Elige una frase al azar de la franja correspondiente a la hora. */
export function pickGreeting(hour: number): string {
  const config = SLOTS.find((item) => hour >= item.from && hour < item.to) ?? SLOTS[0]
  const greetings = config.greetings
  const phrase = greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0]
  return phrase.replace('{name}', NAME_FALLBACK)
}
