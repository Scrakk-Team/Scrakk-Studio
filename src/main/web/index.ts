/**
 * API web (search/fetch) — barrel del proceso main.
 */

export { registerWebIpc } from './ipc'
export { searchWeb } from './search'
export { fetchUrl } from './fetch'
export { isBlockedIp, assertPublicHost } from './ssrf'
export { htmlToMarkdown } from './html'
