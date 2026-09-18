/**
 * Constantes inyectadas por electron-vite (build/electron-vite.*.ts).
 * Deben declararse como globales (el archivo es un módulo por el `export {}`).
 */
declare global {
  /** Versión del IDE (package.json). */
  const __APP_VERSION__: string
  /** Marca de build / watermark (env SCRAKK_BUILD_ID en prod). */
  const __BUILD_ID__: string
}

export {}
