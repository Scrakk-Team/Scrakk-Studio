/**
 * Tests del registro de headers de tabs y del extractor automático de
 * opciones (botón ⋯ del strip).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement, Fragment, isValidElement } from 'react'
import {
  tabHeaderKey,
  setTabHeader,
  getTabHeader,
  subscribeTabHeaders,
  extractHeaderMenuItems,
  _resetTabHeadersForTests
} from '../src/renderer/src/features/tabs/tabHeaders'

describe('tabHeaders — registro', () => {
  beforeEach(() => {
    _resetTabHeadersForTests()
  })

  it('key estable por strip+tab', () => {
    expect(tabHeaderKey('left', 'panel:explorer')).toBe('left:panel:explorer')
  })

  it('set/get + cleanup con null + subscribe', () => {
    let calls = 0
    const unsub = subscribeTabHeaders(() => calls++)
    const actions = (): null => null
    setTabHeader('left:a', { title: 'A', actions })
    expect(getTabHeader('left:a')?.title).toBe('A')
    expect(calls).toBe(1)
    // Sin cambios: no emite.
    setTabHeader('left:a', { title: 'A', actions })
    expect(calls).toBe(1)
    setTabHeader('left:a', null)
    expect(getTabHeader('left:a')).toBeNull()
    expect(calls).toBe(2)
    unsub()
  })
})

describe('extractHeaderMenuItems — detección automática', () => {
  it('null → vacío; acciones que truenan → vacío', () => {
    expect(extractHeaderMenuItems(null)).toEqual([])
    expect(
      extractHeaderMenuItems({
        title: 'X',
        actions: () => {
          throw new Error('boom')
        }
      })
    ).toEqual([])
  })

  it('detecta botón nativo con aria-label + click', () => {
    const onClick = vi.fn()
    const items = extractHeaderMenuItems({
      title: 'T',
      actions: () => createElement('button', { 'aria-label': 'Nuevo', onClick })
    })
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Nuevo')
    items[0].onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('detecta componente tipo IconButton (label + children icono + danger + disabled)', () => {
    const FakeIconButton = (_props: object): null => null
    const onClick = vi.fn()
    const icon = createElement('span', null, 'svg')
    const items = extractHeaderMenuItems({
      title: 'T',
      actions: () =>
        createElement(FakeIconButton, { label: 'Borrar', variant: 'danger', disabled: true, onClick }, icon)
    })
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Borrar')
    expect(items[0].danger).toBe(true)
    expect(items[0].disabled).toBe(true)
    expect(items[0].icon).toBe(icon)
  })

  it('un `icon` por ID (HeaderActionButton) se resuelve a ícono', () => {
    const FakeHeaderAction = (_props: object): null => null
    const items = extractHeaderMenuItems({
      title: 'T',
      actions: () =>
        createElement(FakeHeaderAction, { id: 'explorer.refresh', label: 'Actualizar', icon: 'refresh', onClick: vi.fn() })
    })
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Actualizar')
    expect(isValidElement(items[0].icon)).toBe(true)
    expect((items[0].icon as { props: { id: string } }).props.id).toBe('refresh')
  })

  it('camina fragmentos y contenedores; ignora nodos sin acción ni etiqueta', () => {
    const ok = vi.fn()
    const items = extractHeaderMenuItems({
      title: 'T',
      actions: () =>
        createElement(
          Fragment,
          null,
          createElement('div', { className: 'actions' }, createElement('button', { title: 'Uno', onClick: ok })),
          createElement('span', null, 'texto suelto'),
          createElement('button', { onClick: ok })
        )
    })
    expect(items.map((i) => i.label)).toEqual(['Uno'])
  })
})
