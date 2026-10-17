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

/**
 * Loopback: bloqueado por defecto. `web_fetch` lo alcanzaba con una URL
 * pública que redirige a `https://127.0.0.1:<puerto>` (Docker API, paneles,
 * kube-apiserver…). Para desarrollo local se habilita explícitamente.
 */
function loopbackAllowed(): boolean {
  return process.env.SCRAKK_ALLOW_LOOPBACK_FETCH === '1'
}

/** IPv4 bloqueada (mismos rangos que scrakk-cli + loopback por defecto). */
function isBlockedV4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 127) return !loopbackAllowed()
  if (a === 10) return true // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
  if (a === 192 && b === 168) return true // RFC 1918
  if (a === 169 && b === 254) return true // link-local + metadata
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 0) return true // unspecified / este segmento
  return false
}

/** Expande una IPv6 a 8 grupos de 16 bits (o null si no es válida). */
function expandV6(input: string): number[] | null {
  let ip = input.replace(/^\[|\]$/g, '').toLowerCase()
  if (!ip.includes(':')) return null
  // IPv4 embebida al final (::ffff:127.0.0.1).
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
  if (v4Tail) {
    const octets = v4Tail[1].split('.').map(Number)
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    ip = ip.slice(0, -v4Tail[1].length) + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 && missing !== 0) return null
  if (missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const parsed = groups.map((group) => Number.parseInt(group || '0', 16))
  if (parsed.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null
  return parsed
}

/** IPv6 bloqueada (loopback sujeto a `SCRAKK_ALLOW_LOOPBACK_FETCH`). */
function isBlockedV6(ipRaw: string): boolean {
  const groups = expandV6(ipRaw)
  if (!groups) return true
  const [g0, , , , , g5, g6, g7] = groups

  const isZero = groups.every((group) => group === 0)
  if (isZero) return true // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) {
    return !loopbackAllowed() // ::1
  }

  // IPv4 mapeada, en forma punteada o hexadecimal (::ffff:7f00:1).
  if (groups.slice(0, 5).every((group) => group === 0) && g5 === 0xffff) {
    const v4 = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`
    return isBlockedV4(v4)
  }

  if ((g0 & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  return false
}

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, '')
  const version = isIP(normalized)
  if (version === 4) return isBlockedV4(normalized)
  if (version === 6) return isBlockedV6(normalized)
  return true
}

/** Resuelve el host y verifica que ninguna dirección esté bloqueada. */
export async function assertPublicHost(host: string): Promise<void> {
  const normalized = host.replace(/^\[|\]$/g, '')
  if (isIP(normalized)) {
    if (isBlockedIp(normalized)) throw new Error(`Dirección bloqueada (SSRF): ${normalized}`)
    return
  }
  const addrs = await lookup(normalized, { all: true, verbatim: true }).catch(() => [])
  if (addrs.length === 0) throw new Error(`No se pudo resolver el host: ${normalized}`)
  const blocked = addrs.find((entry) => isBlockedIp(entry.address))
  if (blocked) throw new Error(`Host bloqueado (SSRF): ${normalized} → ${blocked.address}`)
}
