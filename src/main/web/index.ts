// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API web (search/fetch) — barrel del proceso main.
 */

export { registerWebIpc } from './ipc'
export { searchWeb } from './search'
export { fetchUrl } from './fetch'
export { isBlockedIp, assertPublicHost } from './ssrf'
export { htmlToMarkdown } from './html'
