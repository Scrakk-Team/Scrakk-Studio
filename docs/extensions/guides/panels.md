---
title: "Panels"
group: extensions
order: 40
summary: "A React component from the package mounted in any layout slot, with a title and header actions."
---
# Panels

A **panel** is a React component from your package that the layout mounts in a
slot (left, center, right or bottom). It is the most direct contribution.

```json
{
  "panels": [
    {
      "id": "acme-board",
      "title": "Board",
      "closable": true,
      "component": "panels/Board.tsx"
    }
  ]
}
```

| Field | Type | Required | Note |
|---|---|---|---|
| `id` | string (global) | yes | Also used by the activity bar button (`panelId`) |
| `title` | string | yes | Header title |
| `closable` | boolean | no | Whether the user can close the tab |
| `component` | path inside the package | yes | `export default` = the component |

The component is registered as a `PanelEntry` with a **dynamic import**. The
layout mounts it inside its own `ErrorBoundary`: if your panel crashes, **only**
that panel shows the error, the rest of the app keeps running.

## The component

The panel **receives no props**: `PanelHost` mounts it with no arguments. Use the
layout system hooks instead.

```tsx
import { useEffect } from 'react'
import { usePanelTitle } from '@features/layout'

export default function Board() {
  const { setTitle } = usePanelTitle()

  useEffect(() => {
    setTitle('Board') // the title can be dynamic
  }, [setTitle])

  return <div style={{ padding: 16 }}>Board content</div>
}
```

Available hooks: `usePanelTitle()` (`{ setTitle, setActions }`) and
`usePanelId()` (the id of the mounted panel).

The app provides the imports a bundle can use: `react`, `react-dom` (and
`react-dom/client`), `react/jsx-runtime` and `@features/layout`. Do **not** bundle
your own React — the hooks and the tree have to share the app's copy. Anything
else the IDE exposes goes through `window.scrakk` (see
[Scrakk API](../reference/api.md)) — including adding entries to the **command
palette** from your panel's own code.

## Header actions

`setActions` registers buttons to the right of the title. Every button you want
the user to be able to **reorder by dragging** is declared with
`HeaderActionButton` (the same API the internal panels use):

```tsx
import { useEffect } from 'react'
import { HeaderActionButton, usePanelTitle } from '@features/layout'

export default function Board() {
  const { setActions } = usePanelTitle()

  useEffect(() => {
    setActions(() => (
      <HeaderActionButton
        id="acme-board.refresh"
        label="Refresh"
        icon="refresh"
        shape="rounded"
        onClick={() => refresh()}
      />
    ))
    return () => setActions(null)
  }, [setActions])

  return <div />
}
```

- `id` is **global and namespaced** (`<panel>.<action>`): it is what is persisted
  to remember the order.
- `icon` is a productIcons id (`refresh`, `plus`, `trash`…).
- If your panel lives as **one more tab** in a strip (not as a single panel), its
  actions still show in the tab's `⋯` menu.

## Rules

- The `component` must exist in the **bundle** (`dist/modules.js`): `sef build`
  guarantees it from the manifest.
- `closable: false` for permanent panels (no X).
- The `id` is global: it cannot clash with another panel (builtin or from another
  extension).

## Next steps

- [Activity bar](activity-bar.md) — the button that opens this panel.
- [Packaging](packaging.md) — how the component gets into the `.sef`.
