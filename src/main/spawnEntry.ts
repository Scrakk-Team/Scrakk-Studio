/**
 * Ruta de un script que se lanza como PROCESO HIJO — y por qué no puede quedar
 * adentro del asar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL BUG QUE ESTO ARREGLA
 *
 * `utilityProcess.fork(join(__dirname, 'tree-sitter-worker.js'))` con el bundle
 * empaquetado da una ruta DENTRO del archivo: `…/app.asar/out/main/…js`. El
 * asar es un archivo, no un directorio: se puede LEER a través del parche de
 * `fs` de Electron, pero no es un archivo real que el sistema operativo pueda
 * tratar como tal. Alcanza con que el entorno sea un poco más estricto —SELinux
 * en Fedora/RHEL, un `noexec`, un antivirus, un sandbox de distro— para que el
 * arranque del worker falle.
 *
 * Cuando el worker de tree-sitter no arranca, la capa de gramática de las
 * extensiones (los `.wasm` y sus `.scm`) no corre NUNCA: el archivo se pinta con
 * lo que tenga el motor y el usuario ve "resaltado incompleto" — que es
 * exactamente lo que se reportó como "los .scm no cargan bien en prod en algunas
 * distro". El candado es el mismo para el host de extensiones.
 *
 * La solución de Electron es la de siempre: `asarUnpack` de esos scripts y
 * resolver la ruta a `app.asar.unpacked/…`, que es un archivo REAL en disco.
 * Aquí se busca el desempacado y, si no está (dev, o un asar sin desempacar), se
 * devuelve la ruta de siempre: nadie se queda sin arrancar por esto.
 */

import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

/** El tramo de ruta del archivo, con separadores de la plataforma. */
const ASAR_SEGMENT = `app.asar${sep}`
const ASAR_UNPACKED_SEGMENT = `app.asar.unpacked${sep}`

/**
 * Ruta ejecutable de un script bundleado (hermano del bundle del main).
 *
 * `baseDir` es inyectable para poder testear sin Electron.
 */
export function resolveSpawnEntry(fileName: string, baseDir: string = __dirname): string {
  const index = baseDir.indexOf(ASAR_SEGMENT)
  if (index !== -1) {
    const unpacked = `${baseDir.slice(0, index)}${ASAR_UNPACKED_SEGMENT}${baseDir.slice(index + ASAR_SEGMENT.length)}`
    const candidate = join(unpacked, fileName)
    if (existsSync(candidate)) return candidate
  }
  return join(baseDir, fileName)
}
