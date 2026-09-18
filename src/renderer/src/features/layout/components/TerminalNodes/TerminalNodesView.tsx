import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { tabsStore, type TabSpec } from '@features/tabs'
import { LiveSessionHost } from '@features/sessions'
import { getTerminalSession } from '@services/innerta/terminalSession'
import { ProductIcon } from '@services/productIcons/components'
import { closeTabSmart, openNewTerminalTab } from '../../actions'
import {
  connectedGroups,
  groupCentroid,
  portPositions,
  type Link
} from './terminalNodesModel'
import styles from './TerminalNodesView.module.css'

interface NodePos { x: number; y: number }
interface NodeSize { w: number; h: number }
interface Cam { x: number; y: number; k: number }

const POS_KEY = 'scrakk:term-nodes-pos'
const CAM_KEY = 'scrakk:term-nodes-cam'
const LINKS_KEY = 'scrakk:term-nodes-links'
const FALLBACK_SIZE: NodeSize = { w: 560, h: 340 }
/** Umbral px para distinguir clic (seleccionar puerto) de arrastre (crear enlace). */
const CLICK_SLOP = 5

function loadPos(): Record<string, NodePos> {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, NodePos>
  } catch { /* sin persistencia */ }
  return {}
}

function loadCam(): Cam {
  try {
    const raw = localStorage.getItem(CAM_KEY)
    if (raw) return JSON.parse(raw) as Cam
  } catch { /* default */ }
  return { x: 24, y: 24, k: 1 }
}

function loadLinks(): Link[] {
  try {
    const raw = localStorage.getItem(LINKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<{ a: string; b: string; ap: number; bp: number }>
    return parsed
      .filter((l) => typeof l.a === 'string' && typeof l.b === 'string' && l.a !== l.b)
      .map((l) => ({ id: [l.a, l.b].sort().join('~'), a: l.a, b: l.b, ap: l.ap ?? 0, bp: l.bp ?? 0 }))
  } catch { return [] }
}

/** Todas las tabs de terminal vivas (cualquier strip): son las transportables al lienzo. */
function collectTerminalTabs(): TabSpec[] {
  const all = tabsStore.getAll()
  const out: TabSpec[] = []
  for (const strip of Object.values(all)) {
    for (const tab of strip.tabs) {
      if (tab.kind === 'terminal' && tab.sessionId) out.push(tab)
    }
  }
  return out
}

/** Clave estable de un grupo (la usa el agarrador y el loop físico). */
function groupKey(members: string[]): string {
  return [...members].sort().join('+')
}

export function TerminalNodesView({ onBack }: { onBack: () => void }): JSX.Element {
  const [version, setVersion] = useState(0)
  useEffect(() => tabsStore.subscribe(() => setVersion((v) => v + 1)), [])
  void version

  const [positions, setPositions] = useState<Record<string, NodePos>>(loadPos)
  const [sizes, setSizes] = useState<Record<string, NodeSize>>({})
  const [cam, setCam] = useState<Cam>(loadCam)
  const [links, setLinks] = useState<Link[]>(loadLinks)
  const [pending, setPending] = useState<{ node: string; port: number } | null>(null)
  const [linkDrag, setLinkDrag] = useState<{ from: { node: string; port: number }; x: number; y: number } | null>(null)
  const [front, setFront] = useState<string | null>(null)

  const viewRef = useRef<HTMLDivElement>(null)
  const nodeEls = useRef(new Map<string, HTMLDivElement>())
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const grabRef = useRef<{ members: string[]; startX: number; startY: number; k: number; orig: Record<string, NodePos> } | null>(null)
  const linkStartRef = useRef<{ x: number; y: number } | null>(null)
  // Espejo para los listeners de ventana (el gesto del grupo no depende del
  // ciclo de render: lee/escribe refs y solo usa setState para pintar).
  const positionsRef = useRef(positions)
  useEffect(() => { positionsRef.current = positions }, [positions])
  const sizesRef = useRef(sizes)
  useEffect(() => { sizesRef.current = sizes }, [sizes])
  const linksRef = useRef(new Map(links.map((l) => [l.id, l])))
  useEffect(() => { linksRef.current = new Map(links.map((l) => [l.id, l])) }, [links])

  const tabs = useMemo(() => collectTerminalTabs(), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])

  // Posición inicial en cascada para nodos nuevos.
  useEffect(() => {
    setPositions((prev) => {
      let changed = false
      const next = { ...prev }
      tabs.forEach((tab, i) => {
        if (!next[tab.id]) {
          next[tab.id] = { x: 40 + i * 48, y: 40 + i * 48 }
          changed = true
        }
      })
      if (changed) {
        try { localStorage.setItem(POS_KEY, JSON.stringify(next)) } catch { /* noop */ }
        return next
      }
      return prev
    })
  }, [tabs])

  // Podar enlaces (y tamaños) de terminales ya cerradas + persistir.
  useEffect(() => {
    const known = new Set(tabIds)
    setLinks((prev) => prev.filter((l) => known.has(l.a) && known.has(l.b)))
    setSizes((prev) => {
      const next: Record<string, NodeSize> = {}
      let changed = false
      for (const [id, size] of Object.entries(prev)) {
        if (known.has(id)) next[id] = size
        else changed = true
      }
      return changed ? next : prev
    })
    setPending((prev) => (prev && known.has(prev.node) ? prev : null))
  }, [tabIds])

  useEffect(() => {
    try { localStorage.setItem(LINKS_KEY, JSON.stringify(links.map(({ a, b, ap, bp }) => ({ a, b, ap, bp })))) } catch { /* noop */ }
  }, [links])

  useEffect(() => {
    try { localStorage.setItem(CAM_KEY, JSON.stringify(cam)) } catch { /* noop */ }
  }, [cam])

  // Medir cada nodo (son redimensionables: los puertos se recalculan con el tamaño real).
  const onSize = useCallback((id: string, w: number, h: number): void => {
    setSizes((prev) => {
      const cur = prev[id]
      if (cur && cur.w === w && cur.h === h) return prev
      return { ...prev, [id]: { w, h } }
    })
  }, [])

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const id = el.dataset.nodeId
        if (!id) continue
        onSize(id, Math.round(el.offsetWidth), Math.round(el.offsetHeight))
      }
    })
    for (const el of nodeEls.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [tabs, onSize])

  const setNodeEl = (id: string) => (el: HTMLDivElement | null): void => {
    if (el) {
      el.dataset.nodeId = id
      nodeEls.current.set(id, el)
    } else {
      nodeEls.current.delete(id)
    }
  }

  // ── Física del grupo: persecución elástica ──────────────────────────────
  // `cur` = posición/velocidad ANIMADAS (lo visible); `target` = a dónde van.
  // Cada nodo tiene rigidez levemente distinta → micro-retrasos y overshoot:
  // el grupo "respira" en vez de trasladarse rígido. Todo corre en rAF con
  // escritura DOM directa (cero React durante el arrastre); al asentarse se
  // commitea UNA vez al estado + localStorage.
  interface GroupAnim {
    members: string[]
    cur: Record<string, { x: number; y: number; vx: number; vy: number }>
    target: Record<string, NodePos>
    raf: number | null
    last: number | null
  }
  const groupAnim = useRef<GroupAnim | null>(null)
  const edgeLines = useRef(new Map<string, { hit: SVGLineElement | null; line: SVGLineElement | null }>())
  const grabberEls = useRef(new Map<string, HTMLDivElement>())

  const setGrabberEl = (key: string) => (el: HTMLDivElement | null): void => {
    if (el) grabberEls.current.set(key, el)
    else grabberEls.current.delete(key)
  }

  const setEdgeLineEl = (id: string, which: 0 | 1) => (el: SVGLineElement | null): void => {
    const entry = edgeLines.current.get(id) ?? { hit: null, line: null }
    if (which === 0) entry.hit = el
    else entry.line = el
    if (!entry.hit && !entry.line) edgeLines.current.delete(id)
    else edgeLines.current.set(id, entry)
  }

  const groupTick = useCallback((): void => {
    const anim = groupAnim.current
    if (!anim) return
    const now = performance.now()
    const dt = Math.min(0.033, Math.max(0.001, (now - (anim.last ?? now)) / 1000))
    anim.last = now

    const posOf = (id: string): { x: number; y: number } => {
      const c = anim.cur[id]
      if (c) return c
      return positionsRef.current[id] ?? { x: 40, y: 40 }
    }
    const anchorLive = (node: string, port: number): { x: number; y: number } => {
      const p = posOf(node)
      const s = sizesRef.current[node] ?? FALLBACK_SIZE
      const pts = portPositions(s.w, s.h)
      const pt = pts[Math.min(Math.max(0, port), pts.length - 1)] ?? { x: s.w / 2, y: 0 }
      return { x: p.x + pt.x, y: p.y + pt.y }
    }

    let settled = true
    anim.members.forEach((id, i) => {
      const t = anim.target[id]
      const c = anim.cur[id]
      const el = nodeEls.current.get(id)
      if (!t || !c || !el) return
      const K = 150 - (i % 4) * 22
      const D = 2 * Math.sqrt(K) * 0.55
      c.vx += (K * (t.x - c.x) - D * c.vx) * dt
      c.vy += (K * (t.y - c.y) - D * c.vy) * dt
      const sp = Math.hypot(c.vx, c.vy)
      if (sp > 6000) {
        c.vx *= 6000 / sp
        c.vy *= 6000 / sp
      }
      c.x += c.vx * dt
      c.y += c.vy * dt
      if (Math.abs(t.x - c.x) > 0.4 || Math.abs(t.y - c.y) > 0.4 || Math.abs(c.vx) > 4 || Math.abs(c.vy) > 4) settled = false
      el.style.left = `${c.x}px`
      el.style.top = `${c.y}px`
    })

    // Aristas + agarrador siguen las posiciones ANIMADAS.
    for (const [linkId, entry] of edgeLines.current) {
      const link = linksRef.current.get(linkId)
      if (!link) continue
      const a = anchorLive(link.a, link.ap)
      const b = anchorLive(link.b, link.bp)
      for (const line of [entry.hit, entry.line]) {
        if (!line) continue
        line.setAttribute('x1', `${a.x}`)
        line.setAttribute('y1', `${a.y}`)
        line.setAttribute('x2', `${b.x}`)
        line.setAttribute('y2', `${b.y}`)
      }
    }
    const gel = grabberEls.current.get(groupKey(anim.members))
    if (gel) {
      let sx = 0
      let sy = 0
      let n = 0
      for (const id of anim.members) {
        const p = posOf(id)
        const s = sizesRef.current[id] ?? FALLBACK_SIZE
        sx += p.x + s.w / 2
        sy += p.y + s.h / 2
        n++
      }
      if (n > 0) {
        gel.style.left = `${sx / n}px`
        gel.style.top = `${sy / n}px`
      }
    }

    if (settled && !grabRef.current) {
      // Asentado y soltado: commit ÚNICO (el DOM ya coincide, sin salto).
      const final: Record<string, NodePos> = {}
      for (const id of anim.members) {
        const c = anim.cur[id]
        if (c) final[id] = { x: Math.round(c.x), y: Math.round(c.y) }
      }
      const next = { ...positionsRef.current, ...final }
      positionsRef.current = next
      setPositions(next)
      try { localStorage.setItem(POS_KEY, JSON.stringify(next)) } catch { /* noop */ }
      groupAnim.current = null
      return
    }
    anim.raf = requestAnimationFrame(groupTick)
  }, [])

  const persistPos = (next: Record<string, NodePos>): void => {
    setPositions(next)
    try { localStorage.setItem(POS_KEY, JSON.stringify(next)) } catch { /* noop */ }
  }

  /** Rects en coords de mundo (tamaño medido o fallback). */
  const rects = useMemo(() => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
    for (const id of tabIds) {
      const p = positions[id] ?? { x: 40, y: 40 }
      const s = sizes[id] ?? FALLBACK_SIZE
      out[id] = { x: p.x, y: p.y, w: s.w, h: s.h }
    }
    return out
  }, [tabIds, positions, sizes])

  const anchorOf = (node: string, port: number): { x: number; y: number } => {
    const r = rects[node]
    if (!r) return { x: 0, y: 0 }
    const pts = portPositions(r.w, r.h)
    const p = pts[Math.min(Math.max(0, port), pts.length - 1)] ?? { x: r.w / 2, y: 0 }
    return { x: r.x + p.x, y: r.y + p.y }
  }

  const addLink = (a: string, ap: number, b: string, bp: number): void => {
    if (a === b) return
    setLinks((prev) => {
      const dupe = prev.some(
        (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
      )
      if (dupe) return prev
      return [...prev, { id: [a, b].sort().join('~'), a, b, ap, bp }]
    })
  }

  const removeLink = (id: string): void => {
    setLinks((prev) => prev.filter((l) => l.id !== id))
  }

  const screenToWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = viewRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - cam.x) / cam.k, y: (clientY - rect.top - cam.y) / cam.k }
  }

  // ── Pan del lienzo ──────────────────────────────────────────────────────
  const onBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    if (target.closest?.('[data-nopan]') || target.closest?.(`.${styles.node}`)) return
    panRef.current = { startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBackgroundPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    if (pan) {
      setCam((c) => ({ ...c, x: pan.camX + (e.clientX - pan.startX), y: pan.camY + (e.clientY - pan.startY) }))
    }
    if (linkDrag) {
      const w = screenToWorld(e.clientX, e.clientY)
      setLinkDrag({ ...linkDrag, x: w.x, y: w.y })
    }
  }
  const onBackgroundPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    panRef.current = null
    if (!linkDrag) return
    const drag = linkDrag
    setLinkDrag(null)
    const start = linkStartRef.current
    linkStartRef.current = null
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : Infinity
    const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-port-node]')
    const tNode = portEl?.getAttribute('data-port-node')
    const tPort = Number(portEl?.getAttribute('data-port-index'))
    if (tNode && tNode !== drag.from.node && Number.isFinite(tPort)) {
      // Soltado sobre un puerto ajeno → enlazar.
      addLink(drag.from.node, drag.from.port, tNode, tPort)
      setPending(null)
    } else if (moved <= CLICK_SLOP) {
      // Clic (sin arrastre): completar el pendiente o (des)seleccionar este.
      const from = drag.from
      if (pending && pending.node !== from.node) {
        addLink(pending.node, pending.port, from.node, from.port)
        setPending(null)
      } else if (pending && pending.node === from.node && pending.port === from.port) {
        setPending(null)
      } else {
        setPending({ ...from })
      }
    }
    // Arrastre a la nada: se cancela sin tocar el pendiente.
  }

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom centrado en el cursor.
      const rect = viewRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setCam((c) => {
        const k = Math.min(2, Math.max(0.4, c.k * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))
        const s = k / c.k
        return { k, x: mx - (mx - c.x) * s, y: my - (my - c.y) * s }
      })
    } else {
      setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
  }

  // ── Puertos de unión ────────────────────────────────────────────────────
  const onPortPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, node: string, port: number): void => {
    e.stopPropagation()
    const w = screenToWorld(e.clientX, e.clientY)
    linkStartRef.current = { x: e.clientX, y: e.clientY }
    setLinkDrag({ from: { node, port }, x: w.x, y: w.y })
    setFront(node)
  }

  const onPortKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, node: string, port: number): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    if (pending && pending.node !== node) {
      addLink(pending.node, pending.port, node, port)
      setPending(null)
    } else if (pending && pending.node === node && pending.port === port) {
      setPending(null)
    } else {
      setPending({ node, port })
    }
  }

  // ── Arrastre de un nodo por su cabecera ─────────────────────────────────
  const onNodeHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>, tabId: string): void => {
    const pos = positions[tabId]
    if (!pos) return
    setFront(tabId)
    // dx/dy en coords de mundo (dividir por zoom).
    const rect = (e.currentTarget.closest(`.${styles.node}`) as HTMLElement)?.getBoundingClientRect()
    const originX = rect ? e.clientX - rect.left : 0
    const originY = rect ? e.clientY - rect.top : 0
    // Estado del gesto ANTES de la captura (si esta falla, el ref ya existe).
    dragRef.current = { id: tabId, dx: originX / cam.k, dy: originY / cam.k }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Sin captura: los moves siguen llegando por bubbling al header.
    }
    e.stopPropagation()
  }
  const onNodeHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    const view = viewRef.current
    if (!drag || !view) return
    const rect = view.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const x = Math.round((mx - cam.x) / cam.k - drag.dx)
    const y = Math.round((my - cam.y) / cam.k - drag.dy)
    persistPos({ ...positions, [drag.id]: { x, y } })
  }
  const onNodeHeaderPointerUp = (): void => { dragRef.current = null }

  // ── Agarrador grupal: mueve TODOS los miembros del grupo unido ──────────
  // Gesto sobre listeners de VENTANA (no sobre el elemento): el movimiento
  // llega aunque el cursor salga del mando, el zoom cambie o la captura del
  // puntero falle. Movimiento ABSOLUTO desde el snapshot inicial: cada evento
  // repinta al momento (setState) y persiste.
  const onGrabWindowMove = useCallback((e: PointerEvent): void => {
    const grab = grabRef.current
    const anim = groupAnim.current
    if (!grab || !anim) return
    // Solo se mueven los TARGETS: el rAF acerca cada nodo con su muelle.
    const dx = (e.clientX - grab.startX) / grab.k
    const dy = (e.clientY - grab.startY) / grab.k
    for (const id of grab.members) {
      const o = grab.orig[id] ?? { x: 40, y: 40 }
      anim.target[id] = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
    }
    if (anim.raf === null) anim.raf = requestAnimationFrame(groupTick)
  }, [groupTick])

  const endGrab = useCallback((): void => {
    grabRef.current = null
    window.removeEventListener('pointermove', onGrabWindowMove)
    document.body.style.cursor = ''
    // El rAF sigue hasta asentar (con overshoot) y commitea solo.
  }, [onGrabWindowMove])

  // Limpieza si el lienzo se desmonta en pleno arrastre grupal.
  useEffect(
    () => () => {
      if (grabRef.current) {
        grabRef.current = null
        window.removeEventListener('pointermove', onGrabWindowMove)
        document.body.style.cursor = ''
      }
      if (groupAnim.current?.raf !== null && groupAnim.current?.raf !== undefined) {
        cancelAnimationFrame(groupAnim.current.raf)
      }
      groupAnim.current = null
    },
    [onGrabWindowMove]
  )

  const onGrabberPointerDown = (e: ReactPointerEvent<HTMLDivElement>, members: string[]): void => {
    e.stopPropagation()
    e.preventDefault()
    // Estado del gesto PRIMERO: si la captura del puntero falla, el arrastre
    // sigue vivo gracias a los listeners de ventana.
    const orig: Record<string, NodePos> = {}
    for (const id of members) orig[id] = positionsRef.current[id] ?? { x: 40, y: 40 }
    grabRef.current = { members, startX: e.clientX, startY: e.clientY, k: cam.k, orig }
    // Semilla física desde lo VISIBLE (puede haber un settle en curso de un
    // arrastre anterior: se hereda posición/velocidad, sin saltos).
    const prev = groupAnim.current
    if (prev?.raf !== null && prev?.raf !== undefined) cancelAnimationFrame(prev.raf)
    const cur: GroupAnim['cur'] = {}
    for (const id of members) {
      const live = prev?.cur[id]
      const fallback = positionsRef.current[id] ?? { x: 40, y: 40 }
      cur[id] = live ? { ...live } : { x: fallback.x, y: fallback.y, vx: 0, vy: 0 }
    }
    groupAnim.current = { members: [...members], cur, target: { ...orig }, raf: null, last: null }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Sin captura: los listeners de ventana cubren el gesto igual.
    }
    document.body.style.cursor = 'grabbing'
    window.addEventListener('pointermove', onGrabWindowMove)
    window.addEventListener('pointerup', endGrab, { once: true })
    window.addEventListener('pointercancel', endGrab, { once: true })
  }

  const closeNode = (tab: TabSpec): void => {
    const found = tabsStore.findTab(tab.id)
    if (found) closeTabSmart(found.stripId as never, tab)
  }

  const zoomBy = (factor: number): void => {
    setCam((c) => ({ ...c, k: Math.min(2, Math.max(0.4, c.k * factor)) }))
  }
  const resetView = (): void => setCam({ x: 24, y: 24, k: 1 })

  const ordered = useMemo(() => {
    const arr = [...tabs]
    arr.sort((a, b) => {
      if (a.id === front) return 1
      if (b.id === front) return -1
      return 0
    })
    return arr
  }, [tabs, front])

  const groups = useMemo(
    () => connectedGroups(tabIds, links).filter((g) => g.length >= 2),
    [tabIds, links]
  )

  return (
    <div
      ref={viewRef}
      className={styles.viewport}
      data-linking={linkDrag ? 'true' : undefined}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onBackgroundPointerMove}
      onPointerUp={onBackgroundPointerUp}
      onWheel={onWheel}
    >
      <div
        className={styles.world}
        data-world="1"
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}
      >
        <svg className={styles.edges} data-nopan="1" aria-hidden="true">
          {links.map((link) => {
            const a = anchorOf(link.a, link.ap)
            const b = anchorOf(link.b, link.bp)
            return (
              <g key={link.id}>
                <line
                  ref={setEdgeLineEl(link.id, 0)}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  className={styles.edgeHit}
                  onClick={(e) => { e.stopPropagation(); removeLink(link.id) }}
                >
                  <title>Clic para desenlazar</title>
                </line>
                <line ref={setEdgeLineEl(link.id, 1)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.edgeLine} />
              </g>
            )
          })}
          {linkDrag ? (
            <line
              x1={anchorOf(linkDrag.from.node, linkDrag.from.port).x}
              y1={anchorOf(linkDrag.from.node, linkDrag.from.port).y}
              x2={linkDrag.x}
              y2={linkDrag.y}
              className={styles.edgeDraft}
            />
          ) : null}
        </svg>

        {ordered.map((tab) => {
          const pos = positions[tab.id] ?? { x: 40, y: 40 }
          const r = rects[tab.id] ?? { x: pos.x, y: pos.y, ...FALLBACK_SIZE }
          const ports = portPositions(r.w, r.h)
          return (
            <div
              key={tab.id}
              ref={setNodeEl(tab.id)}
              className={styles.node}
              style={{ left: pos.x, top: pos.y, zIndex: tab.id === front ? 10 : 1 }}
              onPointerDown={() => setFront(tab.id)}
            >
              <div
                className={styles.nodeHeader}
                onPointerDown={(e) => onNodeHeaderPointerDown(e, tab.id)}
                onPointerMove={onNodeHeaderPointerMove}
                onPointerUp={onNodeHeaderPointerUp}
                title="Arrastrar para mover"
              >
                <ProductIcon id="terminal" size={14} aria-hidden="true" />
                <span className={styles.nodeTitle}>{tab.label ?? 'Terminal'}</span>
                <button
                  type="button"
                  className={styles.nodeClose}
                  aria-label={`Cerrar ${tab.label ?? 'terminal'}`}
                  title="Cerrar terminal"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => closeNode(tab)}
                >
                  <ProductIcon id="close" size={14} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.nodeBody}>
                {tab.sessionId ? <LiveSessionHost key={tab.sessionId} session={getTerminalSession(tab.sessionId)} /> : null}
              </div>
              <div className={styles.ports} data-nopan="1">
                {ports.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    data-port-node={tab.id}
                    data-port-index={i}
                    data-pending={pending?.node === tab.id && pending?.port === i ? 'true' : undefined}
                    className={styles.port}
                    style={{ left: p.x, top: p.y }}
                    aria-label={`Unir ${tab.label ?? 'terminal'} (punto ${i + 1} de ${ports.length})`}
                    title="Arrastra hasta otra terminal para unir · o clic aquí y luego en la otra"
                    onPointerDown={(e) => onPortPointerDown(e, tab.id, i)}
                    onKeyDown={(e) => onPortKeyDown(e, tab.id, i)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {groups.map((members) => {
          const c = groupCentroid(members, rects)
          if (!c) return null
          const key = groupKey(members)
          return (
            <div
              key={key}
              ref={setGrabberEl(key)}
              data-nopan="1"
              className={styles.grabber}
              style={{ left: c.x, top: c.y, transform: `translate(-50%, -50%) scale(${1 / cam.k})` }}
              title={`Arrastrar el grupo (${members.length} terminales)`}
              aria-label={`Mover grupo de ${members.length} terminales`}
              onPointerDown={(e) => onGrabberPointerDown(e, members)}
            >
              <ProductIcon id="link" size={14} aria-hidden="true" />
              <span className={styles.grabberCount}>{members.length}</span>
            </div>
          )
        })}
      </div>

      {tabs.length === 0 ? (
        <div className={styles.empty} data-nopan="1">
          <ProductIcon id="share" size={28} aria-hidden="true" />
          <p>Sin terminales en el lienzo</p>
          <button type="button" className={styles.emptyAction} onClick={() => openNewTerminalTab('bottom')}>
            Crear terminal
          </button>
        </div>
      ) : null}

      <div className={styles.toolbar} data-nopan="1" role="toolbar" aria-label="Controles del lienzo">
        <button type="button" className={styles.toolButton} title="Volver a las tabs" aria-label="Volver a las tabs" onClick={onBack}>
          <ProductIcon id="chevron-down" size={15} aria-hidden="true" />
        </button>
        <span className={styles.toolDivider} aria-hidden="true" />
        <button type="button" className={styles.toolButton} title="Nueva terminal en el lienzo" aria-label="Nueva terminal en el lienzo" onClick={() => openNewTerminalTab('bottom')}>
          <ProductIcon id="plus" size={15} aria-hidden="true" />
        </button>
        <button type="button" className={styles.toolButton} title="Restablecer vista" aria-label="Restablecer vista" onClick={resetView}>
          <ProductIcon id="history" size={14} aria-hidden="true" />
        </button>
        <span className={styles.toolDivider} aria-hidden="true" />
        <button type="button" className={styles.toolButton} title="Reducir zoom" aria-label="Reducir zoom" onClick={() => zoomBy(1 / 1.15)}>
          <ProductIcon id="minus" size={14} aria-hidden="true" />
        </button>
        <span className={styles.zoomLabel}>{Math.round(cam.k * 100)}%</span>
        <button type="button" className={styles.toolButton} title="Ampliar zoom" aria-label="Ampliar zoom" onClick={() => zoomBy(1.15)}>
          <ProductIcon id="plus" size={14} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.hint}>Arrastra el fondo para mover · Ctrl+rueda para zoom · une terminales desde los puntos del borde · clic en un enlace para borrarlo · el mando central mueve el grupo</div>
    </div>
  )
}
