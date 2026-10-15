// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Acciones del mensaje (copiar / editar) en los DOS roles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA Y POR QUÉ
 *
 * La barra de acciones existía sólo para la IA y sin editar, así que lo que se
 * rompe en silencio es:
 *
 *   1. el rol — la barra tiene que salir en el mensaje del usuario TAMBIÉN, y
 *      basta con dejar un `!isUser` en la condición para que desaparezca,
 *   2. la edición del usuario — si guarda pero no REENVÍA, el chat queda con
 *      una pregunta editada y una respuesta que contesta a la anterior, y
 *   3. los textos — una clave i18n sin traducir sale como la clave cruda.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const BUBBLE = 'src/renderer/src/features/chat/components/MessageBubble/MessageBubble.tsx'
const ACTIONS = 'src/renderer/src/features/chat/components/MessageActions/MessageActions.tsx'
const LIST = 'src/renderer/src/features/chat/components/MessageList/MessageList.tsx'
const PANEL = 'src/renderer/src/features/layout/panels/ChatPanel/ChatPanel.tsx'

describe('la barra de acciones sale en los dos roles', () => {
  it('la condición no distingue usuario de IA', () => {
    const src = read(BUBBLE)
    // Un `!isUser` acá es exactamente el bug que esto fija.
    expect(src).toContain('const showActions = !editing && !pending && !hasToolCalls && hasText')
  })

  it('copiar y editar van juntos en la barra', () => {
    const src = read(ACTIONS)
    expect(src).toContain('onEdit?: () => void')
    expect(src).toMatch(/\{onEdit \? \(/)
    // El botón usa un ícono del pack, no un glifo suelto.
    expect(src).toContain('id="pencil"')
  })
})

describe('editar es funcional, no decorativo', () => {
  it('el mensaje se edita en el lugar (textarea + guardar/cancelar)', () => {
    const src = read(BUBBLE)
    expect(src).toContain('styles.editArea')
    expect(src).toMatch(/<textarea/)
    expect(src).toContain('onEditSave?.(message.id, next)')
    // Vacío no se guarda (el editor queda abierto para corregirlo).
    expect(src).toMatch(/if \(!next\) return/)
  })

  it('editar es SÓLO del mensaje del usuario', () => {
    const src = read(BUBBLE)
    // La respuesta de la IA se lee y se copia; no se reescribe.
    expect(src).toContain('onEdit={isUser && canEdit && onEditSave ? startEdit : undefined}')
  })

  it('la ÚLTIMA pregunta se puede editar aunque el modelo esté respondiendo', () => {
    // Es la que estás mirando: el panel corta el stream antes de reenviar.
    expect(read(LIST)).toContain('canEdit={!isStreaming || message.id === lastUserId}')
    // Y hay que ESPERAR al stream abortado antes de reenviar: si no, su finally
    // apaga el isBusy del stream nuevo y los dos escriben la misma sesión.
    const panel = read(PANEL)
    // El stream en curso vive en un registro por SESIÓN (sobrevive al remonte del
    // panel): se publica (`setRunPromise`) y se lee (`getRunPromise`) para abortarlo
    // y ESPERARLO antes de reenviar; si no, su `finally` apaga el run del stream
    // nuevo y los dos escriben la misma sesión.
    expect(panel).toContain('setRunPromise')
    expect(panel).toContain('getRunPromise')
    expect(panel).toContain('stopRun')
    expect(panel).toMatch(/inFlight\.catch\([\s\S]*?\.then\(apply\)/)
  })

  it('"volver al mensaje" sólo en el ancla', () => {
    expect(read(BUBBLE)).toContain('onJumpTo={onJumpTo}')
    expect(read(LIST)).toContain('onJumpTo={message.id === lastUserId ? jumpToAnchor : undefined}')
    // Se mide SIN el sticky (su rect ya no es su lugar real) y se restaura.
    expect(read(LIST)).toContain("target.style.position = 'static'")
  })

  it('el textarea no tiene borde propio ni resize; el marco lo lleva el contenedor', () => {
    const css = read('src/renderer/src/features/chat/components/MessageBubble/MessageBubble.module.css')
    const area = css.slice(css.indexOf('.editArea {'), css.indexOf('}', css.indexOf('.editArea {')))
    // El handle nativo del resize pintaba un grip en la esquina.
    expect(area).toContain('resize: none')
    // Un borde permanente en el textarea era el "contorno de más".
    expect(area).not.toMatch(/border:\s*1px/)
    // El marco vive en el contenedor y SÓLO al enfocar (como el composer).
    const field = css.slice(css.indexOf('.editField {'), css.indexOf('}', css.indexOf('.editField {')))
    expect(field).toContain('border: 1px solid transparent')
    expect(css).toMatch(/\.editField:focus-within[^}]*border-color: var\(--color-border-strong\)/)
  })

  it('la burbuja del usuario es OPACA (--color-active es un tinte, no un fondo)', () => {
    const css = read(
      'src/renderer/src/features/chat/components/MessageBubble/MessageBubble.module.css'
    )
    const block = css.slice(
      css.indexOf('.bubbleUser {'),
      css.indexOf('}', css.indexOf('.bubbleUser {'))
    )
    // En scrakk-night (el tema por defecto) `--color-active` es
    // `rgba(255, 255, 255, 0.12)`: un `background: var(--color-active)` dejaba
    // ver el chat a través de la burbuja.
    // Mismo fondo que el input: opaco y siguiendo al tema (el tinte
    // `--color-active` de scrakk-night es rgba(255,255,255,0.12) y dejaba ver
    // el chat a través).
    expect(block).toContain('background: var(--activitybar-bg, var(--color-surface))')
    // Y una sombra hacia abajo con el peso de la del popover del input, con
    // spread negativo para que el recorte lateral de la lista no la corte.
    expect(block).toMatch(/box-shadow:\s*0 8px 24px -8px rgba\(0, 0, 0,/)
  })

  it('editar un mensaje del USUARIO reenvía (lo de después ya no responde a ese texto)', () => {
    const src = read(PANEL)
    const start = src.indexOf('const handleEditMessage')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('\n  )', start)
    const body = src.slice(start, end === -1 ? undefined : end)

    expect(body).toContain('updateMessage(sid, messageId')
    // Sólo el usuario reenvía; la respuesta de la IA únicamente se actualiza.
    expect(body).toContain("if (edited.role !== 'user') return")
    expect(body).toContain('removeMessagesAfter(sid, index + 1)')
    expect(body).toContain('streamReply(sid, content, current.slice(0, index))')
  })

  it('el callback no depende de `messages`: rompería el memo de TODAS las burbujas', () => {
    // `messages` cambia en cada token del stream. Si el handler (que se pasa a
    // cada mensaje) dependiera de él, su identidad cambiaría por token y cada
    // burbuja re-parsearía su markdown: justo lo que el memo evita.
    const src = read(PANEL)
    const start = src.indexOf('const handleEditMessage')
    const end = src.indexOf('\n  )', start)
    const body = src.slice(start, end === -1 ? undefined : end)
    expect(body).toContain('messagesRef.current')
    expect(body).not.toMatch(/\[sessionId, isBusy, messages/)
  })

  it('el panel le pasa el handler a la lista', () => {
    expect(read(PANEL)).toContain('onEditMessage={handleEditMessage}')
  })
})

describe('los textos existen en los dos idiomas', () => {
  const keys = ['chat.editar', 'chat.editar.mensaje', 'chat.guardar.cambios', 'chat.cancelar.edicion']

  it.each(keys)('%s está en es y en en', (key) => {
    for (const locale of ['es', 'en']) {
      const catalog = JSON.parse(
        read(`src/shared/i18n/catalogs/${locale}/chat.json`)
      ) as Record<string, string>
      expect(catalog[key]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
