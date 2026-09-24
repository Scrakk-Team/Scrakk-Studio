// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, it, expect } from 'vitest'
import {
  evaluatePermissionRules,
  parseModeRules,
  parsePermissionRule,
  parsePermissionLists,
  type AccessKind
} from '../src/renderer/src/services/ai/policy/permissionRules'

const rules = (allow: string[] = [], ask: string[] = [], deny: string[] = []) =>
  parsePermissionLists({ allow, ask, deny }).rules

describe('permission rules', () => {
  it('parsea los prefijos de tool del CLI', () => {
    expect(parsePermissionRule('Bash', 'allow')).toMatchObject({ tool: 'bash', pattern: null })
    expect(parsePermissionRule('Read(src/*.rs)', 'allow')).toMatchObject({ tool: 'read', pattern: 'src/*.rs' })
    expect(parsePermissionRule('Edit(src/**)', 'deny')).toMatchObject({ tool: 'edit', pattern: 'src/**' })
    expect(parsePermissionRule('WebFetch(domain:example.com)', 'allow')).toMatchObject({
      tool: 'web_fetch',
      pattern: 'example.com',
      patternMode: 'domain'
    })
    // `Bash(cmd:*)` = prefijo `cmd`.
    expect(parsePermissionRule('Bash(git push:*)', 'ask')).toMatchObject({ tool: 'bash', pattern: 'git push' })
    // Prefijo desconocido → null (tolerante).
    expect(parsePermissionRule('EnterWorktree(x)', 'allow')).toBeNull()
    expect(parsePermissionRule('Nope(x)', 'allow')).toBeNull()
  })

  it('deny gana sobre ask y allow', () => {
    const r = rules(['Bash(*)'], ['Bash(git push*)'], ['Bash(git push --force)'])
    const access: AccessKind = { kind: 'bash', command: 'git push --force origin main' }
    expect(evaluatePermissionRules(access, r)).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push origin main' }, r)).toBe('ask')
    expect(evaluatePermissionRules({ kind: 'bash', command: 'ls' }, r)).toBe('allow')
  })

  it('ask gana sobre allow cuando no hay deny', () => {
    const r = rules(['Bash(*)'], ['Bash(git push*)'])
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push origin' }, r)).toBe('ask')
  })

  it('no es evadible con espacios al inicio del comando', () => {
    const r = rules([], [], ['Bash(rm*)'])
    expect(evaluatePermissionRules({ kind: 'bash', command: '   rm -rf /' }, r)).toBe('deny')
  })

  it('una regla de Read también gobierna Grep', () => {
    const r = rules([], [], ['Read(**/.env)'])
    expect(evaluatePermissionRules({ kind: 'read', path: '.env' }, r)).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'grep', path: '.env' }, r)).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'grep', path: 'src/main.ts' }, r)).toBeNull()
  })

  it('los patrones de path distinguen * (no cruza /) de **', () => {
    const r = rules(['Edit(src/**)'])
    expect(evaluatePermissionRules({ kind: 'edit', path: 'src/a/b.ts' }, r)).toBe('allow')
    const shallow = rules(['Edit(src/*)'])
    expect(evaluatePermissionRules({ kind: 'edit', path: 'src/a/b.ts' }, shallow)).toBeNull()
    expect(evaluatePermissionRules({ kind: 'edit', path: 'src/a.ts' }, shallow)).toBe('allow')
  })

  it('WebFetch(domain:) matchea el host y sus subdominios', () => {
    const r = rules(['WebFetch(domain:example.com)'])
    expect(evaluatePermissionRules({ kind: 'web_fetch', url: 'https://api.example.com/x' }, r)).toBe('allow')
    expect(evaluatePermissionRules({ kind: 'web_fetch', url: 'https://www.example.com' }, r)).toBe('allow')
    expect(evaluatePermissionRules({ kind: 'web_fetch', url: 'https://other.com' }, r)).toBeNull()
  })

  it('sin reglas que matcheen devuelve null (decide el modo)', () => {
    expect(evaluatePermissionRules({ kind: 'bash', command: 'ls' }, rules(['Bash(npm run *)']))).toBeNull()
  })

  it('una regla acotada a modos solo aplica en esos modos', () => {
    const r = parsePermissionLists({
      deny: [{ rule: 'Bash(git push:*)', modes: ['plan'] }]
    }).rules
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, r, 'plan')).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, r, 'default')).toBeNull()
    // Sin modo explícito tampoco aplica (no hay contexto).
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, r)).toBeNull()
  })

  it('parseModeRules acota cada regla a su modo', () => {
    const { rules: scoped } = parseModeRules({
      plan: { deny: ['Bash(git push:*)'] },
      acceptEdits: { allow: ['Edit(src/**)'] }
    })
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, scoped, 'plan')).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, scoped, 'acceptEdits')).toBeNull()
    expect(evaluatePermissionRules({ kind: 'edit', path: 'src/a.ts' }, scoped, 'acceptEdits')).toBe('allow')
    expect(evaluatePermissionRules({ kind: 'edit', path: 'src/a.ts' }, scoped, 'plan')).toBeNull()
  })

  it('las reglas globales y las del modo se combinan con deny > ask > allow', () => {
    const global = parsePermissionLists({ allow: ['Bash(*)'] }).rules
    const scoped = parseModeRules({ plan: { deny: ['Bash(git push:*)'] } }).rules
    const merged = [...global, ...scoped]
    expect(evaluatePermissionRules({ kind: 'bash', command: 'git push' }, merged, 'plan')).toBe('deny')
    expect(evaluatePermissionRules({ kind: 'bash', command: 'ls' }, merged, 'plan')).toBe('allow')
  })
})
