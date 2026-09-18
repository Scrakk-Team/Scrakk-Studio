/**
 * Tests del servicio global de modales y del documentState de encodings.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  showModal,
  showOptionModal,
  closeModal,
  closeAllModals,
  isModalOpen,
  snapshotModals,
  subscribeToModals,
  resolveOptionModal
} from '../src/renderer/src/services/modals/registry'

import {
  setDetected,
  setEncoding,
  getDocumentEncoding,
  forget,
  subscribe,
  _resetForTests
} from '../src/renderer/src/services/encodings/documentState'

describe('modales — registry global', () => {
  beforeEach(() => {
    closeAllModals()
  })

  it('show/close cycle con subscribe', () => {
    const events: number[] = []
    const unsub = subscribeToModals(() => events.push(snapshotModals().length))
    const h = showModal({ title: 'T', render: () => null })
    expect(isModalOpen()).toBe(true)
    closeModal(h)
    expect(isModalOpen()).toBe(false)
    // sync inicial + open + close
    expect(events.length).toBeGreaterThanOrEqual(2)
    unsub()
  })

  it('option modal resuelve con el id elegido', async () => {
    const promise = showOptionModal({
      title: 'Elegir',
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' }
      ]
    })
    const [entry] = snapshotModals()
    resolveOptionModal(entry.id, 'b')
    await expect(promise).resolves.toBe('b')
    expect(isModalOpen()).toBe(false)
  })

  it('close sobre option modal resuelve null (cancelado)', async () => {
    const promise = showOptionModal({ title: 'X', items: [{ id: 'a', label: 'A' }] })
    const [entry] = snapshotModals()
    closeModal(entry.id)
    await expect(promise).resolves.toBeNull()
  })

  it('stack: múltiples modales ordenados por inserción', () => {
    showModal({ title: '1', render: () => null })
    showModal({ title: '2', render: () => null })
    const snap = snapshotModals()
    expect(snap.length).toBe(2)
    expect(snap[0].spec.title).toBe('1')
    expect(snap[1].spec.title).toBe('2')
    closeAllModals()
    expect(isModalOpen()).toBe(false)
  })
})

describe('encodings — documentState', () => {
  beforeEach(() => {
    _resetForTests()
  })

  it('setDetected registra encoding + BOM + EOL detectado', () => {
    setDetected('/p/a.txt', 'l1\r\nl2\r\n', {
      encoding: 'utf8-bom',
      hasBom: true,
      lossy: false,
      binary: false
    })
    const doc = getDocumentEncoding('/p/a.txt')
    expect(doc?.encoding).toBe('utf8-bom')
    expect(doc?.hasBom).toBe(true)
    expect(doc?.lineEnding).toBe('CRLF')
  })

  it('setEncoding cambia encoding y deriva hasBom del sufijo -bom', () => {
    setDetected('/p/b.txt', 'x\n', { encoding: 'utf8', hasBom: false, lossy: false, binary: false })
    setEncoding('/p/b.txt', 'utf16le-bom')
    const doc = getDocumentEncoding('/p/b.txt')
    expect(doc?.encoding).toBe('utf16le-bom')
    expect(doc?.hasBom).toBe(true)
  })

  it('forget limpia; subscribe notifica cambios', () => {
    let calls = 0
    const unsub = subscribe(() => calls++)
    setDetected('/p/c.txt', 'x\n', { encoding: 'utf8', hasBom: false, lossy: false, binary: false })
    forget('/p/c.txt')
    expect(getDocumentEncoding('/p/c.txt')).toBeUndefined()
    expect(calls).toBe(2)
    unsub()
  })
})
