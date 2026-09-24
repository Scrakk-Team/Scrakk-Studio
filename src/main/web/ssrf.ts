// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Protección SSRF para `web_fetch` (port de `web_fetch/ssrf.rs` de scrakk-cli).
 *
 * Bloquea direcciones privadas, link-local, CGNAT y metadata de cloud antes de
 * hacer la request. Loopback (127.x / ::1) SÍ se permite para dev local.
 */

import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/** IPv4 bloqueada (mismos rangos que scrakk-cli). */
function isBlockedV4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 127) return false // loopback (dev)
  if (a === 10) return true // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
  if (a === 192 && b === 168) return true // RFC 1918
  if (a === 169 && b === 254) return true // link-local + metadata
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 0) return true // unspecified / este segmento
  return false
}

/** IPv6 bloqueada (loopback permitido). */
function isBlockedV6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase()
  if (ip === '::1') return false
  if (ip === '::') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
  if (mapped) return isBlockedV4(mapped[1])
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true // fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true // fc00::/7
  return false
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isBlockedV4(ip)
  if (version === 6) return isBlockedV6(ip)
  return true
}

/** Resuelve el host y verifica que ninguna dirección esté bloqueada. */
export async function assertPublicHost(host: string): Promise<void> {
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`Dirección bloqueada (SSRF): ${host}`)
    return
  }
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (addrs.length === 0) throw new Error(`No se pudo resolver el host: ${host}`)
  const blocked = addrs.find((entry) => isBlockedIp(entry.address))
  if (blocked) throw new Error(`Host bloqueado (SSRF): ${host} → ${blocked.address}`)
}
