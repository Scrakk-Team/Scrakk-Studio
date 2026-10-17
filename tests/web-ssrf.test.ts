// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * SSRF de `web_fetch`. Los casos que importan son loopback (paneles locales,
 * Docker API), metadata de cloud y las formas IPv6 mapeadas en hexadecimal,
 * que la versión anterior no reconocía.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { isBlockedIp } from '../src/main/web/ssrf'
import { htmlToMarkdown } from '../src/main/web/html'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isBlockedIp', () => {
  it('bloquea loopback por defecto (IPv4 e IPv6)', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true)
    expect(isBlockedIp('127.8.9.10')).toBe(true)
    expect(isBlockedIp('::1')).toBe(true)
    expect(isBlockedIp('[::1]')).toBe(true)
  })

  it('permite loopback solo con el opt-in explícito', () => {
    vi.stubEnv('SCRAKK_ALLOW_LOOPBACK_FETCH', '1')
    expect(isBlockedIp('127.0.0.1')).toBe(false)
    expect(isBlockedIp('::1')).toBe(false)
  })

  it('bloquea metadata y rangos privados', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true)
    expect(isBlockedIp('10.0.0.1')).toBe(true)
    expect(isBlockedIp('172.16.0.1')).toBe(true)
    expect(isBlockedIp('192.168.1.1')).toBe(true)
    expect(isBlockedIp('100.64.0.1')).toBe(true)
    expect(isBlockedIp('0.0.0.0')).toBe(true)
  })

  it('bloquea IPv4 mapeada en IPv6, punteada y hexadecimal', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedIp('::ffff:7f00:1')).toBe(true)
    expect(isBlockedIp('::ffff:a9fe:a9fe')).toBe(true)
    expect(isBlockedIp('::ffff:0a00:1')).toBe(true)
  })

  it('bloquea link-local y unique-local IPv6', () => {
    expect(isBlockedIp('fe80::1')).toBe(true)
    expect(isBlockedIp('fd00::1')).toBe(true)
    expect(isBlockedIp('::')).toBe(true)
  })

  it('deja pasar direcciones públicas', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp('1.1.1.1')).toBe(false)
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false)
  })

  it('falla cerrado con entradas inválidas', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true)
    expect(isBlockedIp('')).toBe(true)
  })
})

describe('htmlToMarkdown — entidades inválidas', () => {
  it('descarta code points fuera de rango sin lanzar', () => {
    expect(() => htmlToMarkdown('<p>&#99999999; &#x110000; ok</p>')).not.toThrow()
    expect(htmlToMarkdown('<p>&#99999999; &#x110000; ok</p>').content).toContain('ok')
  })

  it('descarta surrogates', () => {
    expect(htmlToMarkdown('<p>&#xD800; ok</p>').content).toContain('ok')
  })
})
