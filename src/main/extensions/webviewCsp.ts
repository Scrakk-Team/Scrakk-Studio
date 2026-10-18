// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * CSP de los webviews de extensión (puro, testeable).
 *
 * Los valores son literales a propósito: antes se armaban con `t(...)` y una
 * traducción rota (o un catálogo manipulado) podía dejar la política vacía o
 * inválida, deshabilitando el aislamiento del webview.
 */
export function webviewCsp(extensionId: string, scheme = 'scrakk-ext'): string {
  const source = `${scheme}://${extensionId}`
  return [
    "default-src 'none'",
    `img-src ${source} https: data:`,
    `media-src ${source} https: data:`,
    `script-src ${source} 'unsafe-inline' https:`,
    `style-src ${source} 'unsafe-inline' https:`,
    `font-src ${source} https: data:`,
    `connect-src ${source} https: wss:`,
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

/**
 * CSP del documento que hospeda el bundle React aislado.
 *
 * El bundle y el runtime se sirven desde el MISMO origen `scrakk-ext://<id>`;
 * el inline script solo arma el import map y monta el componente. No hay
 * `window.api` ni acceso al DOM del IDE.
 */
export function bundleHostCsp(extensionId: string, scheme = 'scrakk-ext'): string {
  const source = `${scheme}://${extensionId}`
  return [
    "default-src 'none'",
    `script-src ${source} 'unsafe-inline'`,
    "style-src 'unsafe-inline'",
    `img-src ${source} https: data:`,
    `media-src ${source} https: data:`,
    `font-src ${source} https: data:`,
    `connect-src ${source} https: wss:`,
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}
