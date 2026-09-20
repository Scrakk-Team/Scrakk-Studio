/**
 * Menú por defecto de click derecho — fallback global.
 *
 * Cuando NINGÚN componente registró su propio menú (los propios hacen
 * `preventDefault`), el click derecho muestra Copiar / Pegar /
 * Seleccionar todo, todo funcional:
 * - Copiar: activa solo si hay algo seleccionado (campo o documento).
 * - Pegar: activa solo si hay un input ACTIVO en ese componente (el campo
 *   clickeado o el editable con foco dentro del mismo contenedor).
 * - Seleccionar todo: selecciona el texto del campo o del contenedor del
 *   componente (solo si tiene texto).
 *
 * Puro DOM (sin React): testeable y reusable desde el host genérico.
 */

import type { ContextMenuItem } from './ContextMenu'

/** Campos editables de texto (los que tienen selección programable). */
const TEXT_FIELD_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email'])

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TEXT_FIELD_TYPES.has(el.type)
  return false
}

function isEditable(el: Element | null): el is HTMLElement {
  if (isTextField(el)) return true
  return el instanceof HTMLElement && el.isContentEditable
}

/** Texto visible de un elemento (sin romper en SVGs sin innerText). */
function visibleText(el: Element): string {
  const text =
    el instanceof HTMLElement && typeof el.innerText === 'string' ? el.innerText : (el.textContent ?? '')
  return text.trim()
}

/**
 * Contenedor del "componente" bajo el cursor: el ancestro significativo más
 * cercano (panel, diálogo, bloque de texto…). Null si no hay.
 */
const SCOPE_SELECTOR = [
  'main',
  'section',
  'article',
  'aside',
  'nav',
  'form',
  'dialog',
  'pre',
  'blockquote',
  'li',
  'td',
  'th',
  'p',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'table',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]'
].join(',')

function resolveScope(target: Element): Element | null {
  return target.closest(SCOPE_SELECTOR)
}

export interface DefaultMenuContext {
  /** Campo clickeado (si el click fue dentro de uno). */
  field: HTMLInputElement | HTMLTextAreaElement | null
  /** Editable donde pega (campo clickeado o activo en el componente). */
  pasteTarget: HTMLElement | null
  /** Contenedor cuyo texto selecciona "Seleccionar todo". */
  scope: Element | null
  /** ¿Tiene texto el scope? */
  scopeHasText: boolean
  /** ¿Hay selección copiable? */
  hasSelection: boolean
}

/** Resuelve el contexto del menú desde el target del click derecho. */
export function resolveDefaultMenuContext(target: Element): DefaultMenuContext {
  const fieldEl = target.closest('input, textarea')
  const field = isTextField(fieldEl) ? fieldEl : null

  const scope = field ?? resolveScope(target) ?? target.ownerDocument.body
  const scopeHasText = scope !== null && visibleText(scope).length > 0

  // Pegar: el campo clickeado manda; si no, el editable con foco DENTRO del
  // mismo componente (no un input lejano de otro panel).
  const active = target.ownerDocument.activeElement
  const activeInScope =
    active instanceof HTMLElement && isEditable(active) && scope !== null && scope.contains(active)
      ? active
      : null
  const pasteTarget = field ?? activeInScope

  // Copiar: selección en campo (rango del input) o en documento.
  const fieldHasSelection =
    field !== null && field.selectionStart !== null && field.selectionEnd !== null
      ? field.selectionStart !== field.selectionEnd
      : false
  const docSelection = target.ownerDocument.getSelection()?.toString() ?? ''
  const hasSelection = fieldHasSelection || docSelection.length > 0

  return { field, pasteTarget, scope: scopeHasText ? scope : null, scopeHasText, hasSelection }
}

function copySelection(doc: Document): void {
  try {
    const active = doc.activeElement
    if (isTextField(active) && active.selectionStart !== active.selectionEnd) {
      active.focus()
      doc.execCommand('copy')
      return
    }
    const text = doc.getSelection()?.toString() ?? ''
    if (!text) return
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        doc.execCommand('copy')
      })
    } else {
      doc.execCommand('copy')
    }
  } catch {
    // Clipboard no disponible: no-op.
  }
}

function pasteInto(target: HTMLElement): void {
  try {
    target.focus()
    // Chromium pega el portapapeles en el editable con foco.
    if (document.execCommand('paste')) return
    // Fallback: leer y insertar a mano.
    if (!navigator.clipboard?.readText) return
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return
        if (target instanceof HTMLTextAreaElement) {
          target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end')
          target.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'file') {
          target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end')
          target.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (target.isContentEditable) {
          document.execCommand('insertText', false, text)
        }
      })
      .catch(() => {})
  } catch {
    // Sin permiso de clipboard: no-op.
  }
}

function selectScope(ctx: DefaultMenuContext): void {
  try {
    if (ctx.field) {
      ctx.field.focus()
      ctx.field.select()
      return
    }
    if (!ctx.scope || !(ctx.scope instanceof HTMLElement)) return
    // El scope vive bajo `user-select: none` global: habilitarlo
    // temporalmente o Chromium ignora el rango (no se ve ni se copia).
    disarmAllowSelect()
    primedScope = ctx.scope
    ctx.scope.setAttribute('data-allow-select', '')
    // Recalc de estilos sincrónico: el rango debe crearse ya seleccionable.
    void window.getComputedStyle(ctx.scope).userSelect
    const doc = ctx.scope.ownerDocument
    const range = doc.createRange()
    range.selectNodeContents(ctx.scope)
    const selection = doc.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    armAllowSelectRestore()
  } catch {
    // Selección no soportada aquí: no-op.
  }
}

/** Scope con selección temporal habilitada (null = ninguno). */
let primedScope: HTMLElement | null = null

function disarmAllowSelect(): void {
  primedScope?.removeAttribute('data-allow-select')
  primedScope = null
  window.removeEventListener('pointerdown', onAllowSelectPointerDown, true)
  window.removeEventListener('keydown', onAllowSelectKeyDown, true)
  window.removeEventListener('blur', onAllowSelectBlur)
}

/**
 * Restaura el `user-select` original en la próxima interacción que invalide
 * la selección (click izquierdo/medio, tecla, blur). El click DERECHO se
 * conserva a propósito: el segundo click derecho (Copiar) debe seguir
 * viendo la selección.
 */
function armAllowSelectRestore(): void {
  window.addEventListener('pointerdown', onAllowSelectPointerDown, true)
  window.addEventListener('keydown', onAllowSelectKeyDown, true)
  window.addEventListener('blur', onAllowSelectBlur)
}

function onAllowSelectPointerDown(event: PointerEvent): void {
  // Botón derecho (2): mantiene la selección para el menú Copiar.
  if (event.button === 2) return
  disarmAllowSelect()
}

function onAllowSelectKeyDown(): void {
  disarmAllowSelect()
}

function onAllowSelectBlur(): void {
  disarmAllowSelect()
}

/**
 * Construye los ítems del menú por defecto para un click derecho, o null
 * si nada aplica (todo deshabilitado → no se muestra menú).
 */
export function buildDefaultMenuItems(target: Element): ContextMenuItem[] | null {
  const ctx = resolveDefaultMenuContext(target)
  const doc = target.ownerDocument

  const copyDisabled = !ctx.hasSelection
  const pasteDisabled = ctx.pasteTarget === null
  const selectDisabled = !ctx.scopeHasText
  if (copyDisabled && pasteDisabled && selectDisabled) return null

  return [
    {
      label: 'Copiar',
      disabled: copyDisabled,
      onClick: () => copySelection(doc)
    },
    {
      label: 'Pegar',
      disabled: pasteDisabled,
      onClick: () => {
        if (ctx.pasteTarget) pasteInto(ctx.pasteTarget)
      }
    },
    {
      label: 'Seleccionar todo',
      disabled: selectDisabled,
      separatorBefore: true,
      onClick: () => selectScope(ctx)
    }
  ]
}
