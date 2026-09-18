/**
 * Versión del API de VS Code que Scrakk declara implementar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES LA VERSIÓN DE LA APP
 *
 * `vscode.version` significa, en VS Code, la versión del API — y las
 * extensiones y librerías la USAN como gate:
 *
 * ```js
 * // vscode-languageclient (main.js)
 * if (semver.lt(vsCodeVersion, requirement)) {
 *   throw new Error(`requires VS Code version ^1.82.0 but received version ${vsCodeVersion}`)
 * }
 * ```
 *
 * Reportar acá la versión de Scrakk (`0.x`) hacía que **toda extensión que use
 * la lib real del protocolo muriera al construir su cliente**, con un mensaje
 * que habla de VS Code y no dice nada del host. Se reporta la versión del API
 * que replicamos, que es el dato que el campo promete.
 *
 * Lo que NO cambia: una API que no implementamos sigue fallando con
 * `unsupported(...)` y el motivo de la tabla de superficie. Declarar una
 * versión de API más nueva no finge cobertura — sólo evita que una librería
 * nos rechace ANTES de intentar la parte que sí funciona.
 *
 * La versión de la APP se sigue reportando en `env.version`.
 */

/** Versión del API de VS Code presentada a las extensiones. */
export const VSCODE_API_VERSION = '1.99.0'
