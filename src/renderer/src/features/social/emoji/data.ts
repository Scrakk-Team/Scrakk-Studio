/**
 * Emojis del chat — set curado, sin dependencias ni imágenes (Unicode puro).
 *
 * Se guarda compacto (`emoji:nombre|emoji:nombre`) y se parsea al cargar. La
 * búsqueda matchea por nombre; los recientes los maneja el picker.
 */

export interface EmojiEntry {
  char: string
  name: string
}

export interface EmojiCategory {
  id: string
  label: string
  emojis: EmojiEntry[]
}

const RAW: Array<{ id: string; label: string; raw: string }> = [
  {
    id: 'caras',
    label: 'Caras',
    raw: '😀:sonrisa|😃:sonrisa abierta|😄:sonrisa feliz|😁:sonrisa pícara|😆:risa|😅:risa nerviosa|🤣:risa a carcajadas|😂:llanto de risa|🙂:leve sonrisa|🙃:sonrisa invertida|😉:guiño|😊:sonrojado|😇:angelito|🥰:enamorado|😍:ojos de corazón|🤩:fascinado|😘:beso|😗:beso suave|😚:beso con ojitos|😙:beso sonriente|😋:rico|😛:lengua afuera|😜:guiño con lengua|🤪:loco|😝:lengua y ojos|🤑:dinero|🤗:abrazo|🤭:risita tapada|🤫:silencio|🤔:pensando|🤐:boca cerrada|🤨:ceja alzada|😐:neutral|😑:sin expresión|😶:sin boca|😏:pícara|😒:fastidio|🙄:ojos en blanco|😬:mueca|🤥:mentiroso|😌:aliviado|😔:desanimado|😪:somnoliento|🤤:babeando|😴:durmiendo|😷:barbijo|🤒:fiebre|🤕:lastimado|🤢:asco|🤮:vómito|🤧:estornudo|🥵:calor|🥶:frío|🥴:mareado|😵:aturdido|🤯:cabeza explotando|🤠:vaquero|🥳:fiesta|🥺:ojitos tiernos|😎:anteojos|🤓:nerd|🧐:monóculo|😕:confundido|😟:preocupado|🙁:triste leve|😮:sorpresa|😯:asombro|😲:atónito|😳:sonrojado fuerte|🥱:bostezo|😤:resoplido|😡:enojado|😠:furioso|🤬:insultos|😈:diablito|👿:diablo|💀:calavera|💩:caca|🤡:payaso|👻:fantasma|👽:alien|🤖:robot|😺:gato feliz|😹:gato riendo|😻:gato enamorado|😼:gato pícaro|🙈:mono tapado|🙉:mono sordo|🙊:mono mudo'
  },
  {
    id: 'gestos',
    label: 'Gestos',
    raw: '👋:hola|🤚:mano alzada|✋:mano|🖖:saludo vulcano|👌:ok|🤌:dedos juntos|🤏:poquito|✌️:victoria|🤞:dedos cruzados|🤟:te quiero|🤘:cuernos|🤙:llamame|👈:izquierda|👉:derecha|👆:arriba|👇:abajo|☝️:índice arriba|👍:pulgar arriba|👎:pulgar abajo|✊:puño|👊:puño cerrado|🤛:puño izquierda|🤜:puño derecha|👏:aplauso|🙌:manos arriba|👐:manos abiertas|🤲:palmas juntas|🤝:apretón|🙏:por favor|✍️:escribiendo|💅:uñas|🤳:selfie|💪:fuerza|🦾:brazo robot|🦵:pierna|🦶:pie|👂:oreja|👃:nariz|🧠:cerebro|🫀:corazón anatómico|👀:ojos|👁️:ojo|👅:lengua|👄:boca'
  },
  {
    id: 'personas',
    label: 'Personas',
    raw: '👶:bebé|🧒:niño|👦:chico|👧:chica|🧑:persona|👨:hombre|👩:mujer|🧓:persona mayor|👴:abuelo|👵:abuela|🙍:frunciendo|🙎:puchero|🙅:no|🙆:ok|💁:informando|🙋:levantando mano|🧏:oyente|🙇:reverencia|🤦:facepalm|🤷:no sé|👮:policía|🕵️:detective|💂:guardia|👷:obrero|🤴:príncipe|👸:princesa|👳:turbante|👲:gorro|🧕:pañuelo|🤵:esmoquin|👰:velo|🤰:embarazada|🤱:amamantando|👼:angelito|🎅:papá noel|🤶:mamá noel|🦸:superhéroe|🦹:supervillano|🧙:mago|🧚:hada|🧛:vampiro|🧜:sirena|🧝:elfo|🧞:genio|🧟:zombi|💆:masaje|💇:corte de pelo|🚶:caminando|🧍:de pie|🧎:de rodillas|🏃:corriendo|💃:bailando|🕺:bailarín'
  },
  {
    id: 'animales',
    label: 'Animales',
    raw: '🐶:perro|🐱:gato|🐭:ratón|🐹:hámster|🐰:conejo|🦊:zorro|🐻:oso|🐼:panda|🐨:koala|🐯:tigre|🦁:león|🐮:vaca|🐷:chancho|🐸:rana|🐵:mono|🐔:gallina|🐧:pingüino|🐦:pájaro|🐤:pollito|🦆:pato|🦅:águila|🦉:búho|🦇:murciélago|🐺:lobo|🐗:jabalí|🐴:caballo|🦄:unicornio|🐝:abeja|🐛:oruga|🦋:mariposa|🐌:caracol|🐞:vaquita|🐜:hormiga|🕷️:araña|🦂:escorpión|🐢:tortuga|🐍:serpiente|🦎:lagarto|🐙:pulpo|🦑:calamar|🦐:camarón|🦀:cangrejo|🐡:pez globo|🐠:pez tropical|🐟:pez|🐬:delfín|🐳:ballena|🦈:tiburón|🐊:cocodrilo|🐘:elefante|🦒:jirafa|🌵:cactus|🌲:árbol|🌸:flor|🌻:girasol|🌹:rosa|🍀:trébol|🍁:hoja'
  },
  {
    id: 'comida',
    label: 'Comida',
    raw: '🍏:manzana verde|🍎:manzana|🍐:pera|🍊:naranja|🍋:limón|🍌:banana|🍉:sandía|🍇:uvas|🍓:frutilla|🫐:arándanos|🍒:cerezas|🍑:durazno|🥭:mango|🍍:piña|🥥:coco|🥝:kiwi|🍅:tomate|🥑:palta|🥦:brócoli|🥕:zanahoria|🌽:choclo|🌶️:picante|🥒:pepino|🥬:lechuga|🧄:ajo|🧅:cebolla|🍄:hongo|🥜:maní|🍞:pan|🥐:medialuna|🥖:baguette|🥨:pretzel|🧇:waffle|🥞:panqueques|🧈:manteca|🍳:huevo frito|🥚:huevo|🧀:queso|🥓:panceta|🍔:hamburguesa|🍟:papas fritas|🍕:pizza|🌭:pancho|🥪:sándwich|🌮:taco|🌯:burrito|🥗:ensalada|🍝:pasta|🍜:ramen|🍲:guiso|🍣:sushi|🍤:camarón frito|🍚:arroz|🍦:helado|🍩:dona|🍪:galleta|🎂:torta|🍫:chocolate|🍬:caramelo|🍭:chupetín|🍿:pochoclo|☕:café|🍵:té|🧉:mate|🍺:cerveza|🍷:vino|🥤:gaseosa|🧊:hielo'
  },
  {
    id: 'actividades',
    label: 'Actividades',
    raw: '⚽:fútbol|🏀:básquet|🏈:fútbol americano|⚾:béisbol|🎾:tenis|🏐:vóley|🏓:ping pong|🏸:bádminton|🥊:boxeo|🥋:artes marciales|⛳:golf|🎯:diana|🎮:joystick|🕹️:arcade|🎲:dado|🧩:rompecabezas|♟️:ajedrez|🎨:paleta|🎬:claqueta|🎤:micrófono|🎧:auriculares|🎸:guitarra|🎹:piano|🥁:batería|🎺:trompeta|🎻:violín|🎪:circo|🎭:teatro|🎟️:entrada|🏆:trofeo|🏅:medalla|🥇:oro|🥈:plata|🥉:bronce|🎁:regalo|🎈:globo|🎉:fiesta|🎊:confeti|✨:destellos|🔥:fuego|💥:explosión|⭐:estrella|🌟:estrella brillante|💫:mareo|🌈:arcoíris|☀️:sol|🌙:luna|⛅:parcialmente nublado|🌧️:lluvia|⛈️:tormenta|❄️:nieve|🌊:ola'
  },
  {
    id: 'viajes',
    label: 'Viajes',
    raw: '🚗:auto|🚕:taxi|🚙:camioneta|🚌:colectivo|🚎:trole|🏎️:auto de carrera|🚓:patrullero|🚑:ambulancia|🚒:bomberos|🚚:camión|🚜:tractor|🛵:moto|🏍️:moto|🚲:bicicleta|🛴:monopatín|✈️:avión|🚀:cohete|🛸:ovni|🚁:helicóptero|⛵:velero|🚤:lancha|🚢:barco|⚓:ancla|🚂:tren|🚆:tren|🚇:subte|🚉:estación|🗺️:mapa|🧭:brújula|🏔️:montaña|🌋:volcán|🏝️:isla|🏖️:playa|🏕️:camping|🏠:casa|🏢:edificio|🏥:hospital|🏦:banco|🏨:hotel|🏫:escuela|⛪:iglesia|🕌:mezquita|🗼:torre|🗽:estatua de la libertad|🌉:puente|🌃:noche urbana|🗿:moái'
  },
  {
    id: 'objetos',
    label: 'Objetos',
    raw: '⌚:reloj|📱:celular|💻:notebook|⌨️:teclado|🖥️:monitor|🖨️:impresora|🖱️:mouse|💽:disco|💾:disquete|💿:cd|📀:dvd|📷:cámara|📹:filmadora|🎥:cámara de video|📞:teléfono|📟:buscapersonas|📠:fax|📺:televisor|📻:radio|🧭:brújula|⏰:alarma|⏳:reloj de arena|⌛:reloj de arena|🔋:batería|🔌:enchufe|💡:bombita|🔦:linterna|🕯️:vela|🧯:extintor|🛒:changuito|💰:bolsa de plata|💵:billete|💳:tarjeta|✉️:sobre|📦:paquete|📫:buzón|📝:nota|📚:libros|📖:libro abierto|🔖:marcador|🔑:llave|🔒:candado|🔓:candado abierto|🔨:martillo|🔧:llave inglesa|🔩:tornillo|⚙️:engranaje|🧲:imán|🧪:tubo de ensayo|🔬:microscopio|🔭:telescopio|📎:clip|✂️:tijeras|📌:chincheta|📍:ubicación|🖊️:lapicera|🖌️:nota|🖍️:crayón|🎓:birrete|📅:calendario|📊:gráfico|📈:sube|📉:baja|🗑️:basura'
  },
  {
    id: 'simbolos',
    label: 'Símbolos',
    raw: '❤️:corazón rojo|🧡:corazón naranja|💛:corazón amarillo|💚:corazón verde|💙:corazón azul|💜:corazón violeta|🖤:corazón negro|🤍:corazón blanco|🤎:corazón marrón|💔:corazón roto|❣️:corazón exclamación|💕:dos corazones|💞:corazones girando|💓:latido|💗:corazón creciendo|💖:corazón brillante|💘:flecha y corazón|💝:corazón con moño|💟:corazón decorado|☮️:paz|✝️:cruz|☪️:islam|🕉️:om|✡️:estrella de david|☯️:yin yang|♈:aries|♉:tauro|♊:géminis|♋:cáncer|♌:leo|♍:virgo|♎:libra|♏:escorpio|♐:sagitario|♑:capricornio|♒:acuario|♓:piscis|⛎:ofíuco|✅:check|☑️:check en caja|✔️:tilde|❌:cruz|❎:cruz en caja|⭕:círculo|🚫:prohibido|⚠️:advertencia|❗:exclamación|❓:pregunta|💯:cien|🔴:círculo rojo|🟠:círculo naranja|🟡:círculo amarillo|🟢:círculo verde|🔵:círculo azul|🟣:círculo violeta|⚫:círculo negro|⚪:círculo blanco|🟥:cuadrado rojo|🟧:cuadrado naranja|🟨:cuadrado amarillo|🟩:cuadrado verde|🟦:cuadrado azul|🟪:cuadrado violeta|⬛:cuadrado negro|⬜:cuadrado blanco'
  }
]

function parse(raw: string): EmojiEntry[] {
  const out: EmojiEntry[] = []
  for (const chunk of raw.split('|')) {
    const idx = chunk.indexOf(':')
    if (idx <= 0) continue
    out.push({ char: chunk.slice(0, idx), name: chunk.slice(idx + 1) })
  }
  return out
}

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map((category) => ({
  id: category.id,
  label: category.label,
  emojis: parse(category.raw)
}))

/** Todos los emojis (para buscar sin importar categoría). */
export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((category) => category.emojis)
