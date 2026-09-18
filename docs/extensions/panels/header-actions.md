# Botones del header de un panel

El header de un panel (`PanelFrame`) muestra el título y, a la derecha, los
**botones de acción** que el panel declara. Esos botones se pueden **arrastrar
para reordenarlos**, con el mismo sistema de drag que la activity bar y el
ToolDock.

## La API: `HeaderActionButton`

Un panel monta sus acciones con `setActions` y cada botón se declara con
`HeaderActionButton` (no con un `IconButton` suelto):

```tsx
import { HeaderActionButton, usePanelTitle } from '@features/layout'

const { setActions } = usePanelTitle()

useEffect(() => {
  setActions(() => (
    <>
      <HeaderActionButton
        id="explorer.new-file"
        label="Nuevo archivo"
        icon="new-file"
        size="sm"
        shape="rounded"
        onClick={() => startCreate(root, false)}
      />
      <HeaderActionButton
        id="explorer.refresh"
        label="Actualizar explorador"
        icon="refresh"
        size="sm"
        shape="rounded"
        onClick={() => refresh()}
      />
    </>
  ))
  return () => setActions(null)
}, [setActions, …])
```

### Props

| Prop | Para qué |
| --- | --- |
| `id` | **Obligatoria.** Id global y namespaced (`<panel>.<accion>`). Es lo que se persiste como orden y lo que el drag usa como identidad. |
| `label` | Tooltip + `aria-label` (igual que `IconButton`). |
| `icon` | Ícono por id de productIcons. Atajo de `children`. |
| `iconRotation` | Grados de rotación del ícono (p. ej. `chevron-right` a 180° para "Volver"). |
| `order` | Orden declarado. Default: la posición en el JSX × 10. |
| `variant` `size` `shape` | Los mismos que `IconButton` (`accent`, `sm`, `rounded`…). |
| `children` | Para casos que el atajo `icon` no cubre (íconos de otro tamaño, contenido propio). |
| …resto | Cualquier prop de `<button>` se reenvía. |

El look es el del `IconButton` (mismos hover y variants), así que migrar un
botón es cambiar el componente y agregarle un `id`.

## El drag

Mismo mecanismo que `features/activitybar/ActivityBar.tsx`:

1. `pointerdown` arma el drag. Un click simple **no** dragea: hace falta
   moverse 6 px (umbral), así el botón sigue haciendo su acción.
2. `pointermove` reordena **en vivo**: se calcula el índice por mitades
   horizontales de cada botón y la fila se acomoda con el cursor. Un chip con
   el ícono sigue al puntero.
3. `pointerup` / `pointercancel` cierra el drag. El `click` que sigue se
   traga una vez (si no, soltar dispararía la acción del botón).
4. `Escape` **cancela**: restaura el orden anterior (snapshot).

El alcance es el propio header: el contenedor `.actions` del `PanelFrame`
lleva `data-header-actions` y el drag sólo reordena botones dentro de él. No
se puede mudar un botón a otro header.

El botón de **cerrar** (X) del `PanelFrame` no entra en el reorden: es
mobiliario del host, no una acción del panel.

## Dónde vive el orden

- Store: `features/layout/state/headerActions.ts` — `Record<id, {order}>`
  persistido en `localStorage` bajo `scrakk-studio:header-actions`, con
  `subscribeToHeaderActions`, `moveHeaderAction`, `snapshotHeaderActions` /
  `restoreHeaderActions` (cancelar) y `resetHeaderActions`.
- Aplicación: `PanelFrame` traduce sus hijos a `{id, order}` y los ordena con
  `orderHeaderActions` antes de pintarlos.
- Botón: `features/layout/components/HeaderActionButton/HeaderActionButton.tsx`.

Los ids son globales, así que el mismo panel montado en dos hosts (sidebar y
ToolDock) comparte el orden. Una acción **nueva** sin override cae en su
posición declarada, no al final; sólo después de un drag se renumera todo el
header (10, 20, 30…).

## Caso real: el historial de chats

El panel de **Chat** declara dos acciones y usa la segunda para algo más que
un click suelto:

```tsx
<HeaderActionButton id="chat.history" icon="history" label="Historial de chats" … />
<HeaderActionButton id="chat.new-session" icon="plus" label="Nuevo chat" … />
```

El historial **no es un panel aparte** (tenía botón propio en la activity bar y
abrió una tab): es una vista que ocupa el panel de chat mientras está abierta,
con su visibilidad en `HistoryPanel/viewState.ts` — así el comando/atajo
(`mod+alt+h`, ver `CommandsBridge`) puede abrir el chat y mostrar el historial
sin depender de un panel montado. Elegir una conversación cierra la vista y
vuelve al chat.

## En una línea

Declarás el botón con un `id`, el usuario lo arrastra, y el orden sobrevive
al reinicio — igual que los botones de la activity bar.
