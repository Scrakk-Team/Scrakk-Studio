---
title: "Botones de la activity bar"
group: extensions
order: 20
summary: "Una extensión puede agregar botones a la barra de actividades con contributes.activityBar. Se fusionan con los botones built-in y se ordenan por order."
---
# Botones de la activity bar

Una extensión puede agregar botones a la barra de actividades con
`contributes.activityBar`. Se fusionan con los botones built-in y se ordenan
por `order`.

```json
{
  "activityBar": [
    {
      "id": "clock.toggle",
      "label": "Mostrar reloj",
      "icon": "activitybar/clock/index.ts",
      "side": "left",
      "target": "sidePanel",
      "panelId": "clock.panel",
      "order": 10
    }
  ]
}
```

## Módulo del ícono

El módulo de ícono exporta un componente React por defecto (p. ej. de
`@proicons/react`):

```tsx
import { Clock } from '@proicons/react'

export default Clock
```

## Comportamiento

- Al hacer clic, la app abre el panel `panelId` en el slot `target` (mismo
  mecanismo que los botones built-in).
- Si el panel ya está abierto, se cierra (toggle).
- `side`: `'left'` o `'right'` — la barra donde aparece el botón.
- Los botones de extensión se ordenan junto a los built-in por `order`
  (ascendente).