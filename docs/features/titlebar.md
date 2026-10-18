---
title: "Titlebar & menus"
group: features
order: 170
summary: "The custom 38px titlebar: the application menu, the widget container, and the native window controls drawn by the OS overlay."
---
# Titlebar & menus

Scrakk Studio draws its own **titlebar** (`features/titlebar/Titlebar.tsx`)
instead of using the OS frame. It is 38px tall: the application menu on the
left, a modular widget container in the centre, and the native minimise /
maximise / close buttons that the operating system paints on top via Electron's
`titleBarOverlay`.

## Window controls

The buttons are **not** React components. The window is created with
`titleBarStyle: 'hidden'` and a `titleBarOverlay` whose height is
`TITLEBAR_HEIGHT`, so Electron/GTK draws the native controls over the custom
bar. The renderer keeps the overlay colours in sync with the active theme:

```ts
// Titlebar.tsx
const cs = getComputedStyle(document.documentElement)
color: cs.getPropertyValue('--titlebar-bg').trim() || '#101010'
symbolColor: cs.getPropertyValue('--color-text-secondary').trim() || '#b8b8b8'
api?.windowControls.setTitleBarOverlay({ color, symbolColor })
```

That read runs on mount and again on every `subscribeToThemes` event, so
switching or uninstalling a theme repaints the overlay. The main process
handles `window-controls` IPC (`minimize`, `toggleMaximize`, `close`,
`isMaximized`, `setTitleBarOverlay`); on a platform without Window Controls
Overlay the setter is a silent no-op.

Double-clicking the bar toggles maximise, but only outside interactive areas:

```ts
if ((event.target as HTMLElement).closest('button')) return
toggleMaximize()
```

`useWindowControls()` exposes `minimize`, `toggleMaximize`, `close` and the
`maximized` flag, and degrades to no-ops when there is no `api` (browser
dev).

## The application menu

`MenuBar` (`features/titlebar/components/MenuBar/MenuBar.tsx`) renders four
dropdown menus plus a Terminal button. Menus are built in code from i18n keys
(`menu.file`, `menu.edit`, `menu.view`, `menu.help`) and opened with the shared
`ContextMenu` portal, anchored under the button.

| Menu | Items |
|---|---|
| File | Open File (`Ctrl+O`), Open Folder (`Ctrl+Shift+O`), Close File (`Ctrl+W`), Close Window (`Alt+F4`) |
| Edit | Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Cut (`Ctrl+X`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), Select All (`Ctrl+A`) |
| View | Light/Dark mode toggle, Chat panel, Chat history, Explorer panel |
| Help | About (opens `SCRAKK_WEBSITE`) |
| — | Terminal (button, opens the `innerta-terminal` panel) |

### How menu actions run

Each item carries an `onClick` that calls a **feature function directly**. The
menu is a thin UI over feature APIs, not a command-registry front end:

- File → `openFilesViaDialog()`, `openFolderViaDialog()`, `requestCloseFile()`,
  `api.windowControls.close()`.
- Edit → `performEditorEdit(action)` when focus was not in a text field, else
  `document.execCommand(...)` (the `DOM_COMMAND` fallback). The focus is sampled
  on `pointerdown` capture so opening the menu does not steal Copy/Paste from a
  focused chat/search input.
- View → `toggleTheme()`, `toggleSlotPanel('right', 'chat')`,
  `openPanelTab('right', 'chat')` + `toggleHistoryView()` (+
  `setSkillsViewOpen(false)`), `toggleSlotPanel('left', 'explorer')`.
- Terminal → `toggleSlotPanel('bottom', 'innerta-terminal')`.

Commands registered in `@services/commands` are reachable from the
[command palette](command-palette.md) and from VS Code compatibility, not from
these menu items. There is no menu contribution point for extensions.

## Menu keyboard behaviour

The bar is a `role="menubar"`. With a button focused: `ArrowDown`, `Enter` or
`Space` opens its menu; `ArrowLeft`/`ArrowRight` move focus between menu titles
and, if a menu is already open, switch the open dropdown; `Escape` closes.
Hovering another title while a menu is open switches to it.

## Titlebar widgets

The centre is `WidgetContainer`, fed by `TITLEBAR_WIDGET_REGISTRY`
(`features/titlebar/widgets/registry.ts`). An entry is `{ id, title, order,
component }` where `component` is a `React.lazy` import. The only built-in
widget today is `workspaces` (`order: 10`). See [Workspaces](workspaces.md).

`WidgetContainer` mounts each widget inside a `PanelErrorBoundary` and a
`Suspense` fallback, so a crashing widget shows only its own fallback. The
widget contract reserves a 24px height, uses ellipsis for long labels and lives
outside the drag region.

## Limits

- Only File / Edit / View / Help plus Terminal exist; extensions cannot add menu
  items through this UI.
- Menu items do not dispatch command ids, so an action that is only registered
  as a command will not appear here automatically.
- The window buttons belong to the OS overlay; there is no custom React control
  to style beyond `color`/`symbolColor`.
- No title text or breadcrumb is rendered in the titlebar; the active file is
  shown by [breadcrumbs](breadcrumbs.md) above the editor.

## Next steps

- [Command palette](command-palette.md) — where registered commands are run.
- [Layout & panels](layout.md) — what the View menu toggles.
- [Workspaces](workspaces.md) — the titlebar widget.
- [Shortcuts & commands](shortcuts.md) — keybindings and the registry.
