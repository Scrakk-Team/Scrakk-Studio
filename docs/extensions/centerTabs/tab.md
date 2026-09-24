---
title: "Tabs centrales"
group: extensions
order: 40
summary: "Una extensión puede agregar pestañas al strip central con contributes.centerTabs. Aparecen junto a \"Bienvenida\", a la izquierda de los archivos abiertos."
---
# Tabs centrales

Una extensión puede agregar pestañas al strip central con
`contributes.centerTabs`. Aparecen junto a "Bienvenida", a la izquierda de los
archivos abiertos.

```json
{
  "centerTabs": [
    {
      "id": "clock.dashboard",
      "label": "Dashboard",
      "icon": "centerTabs/dashboard/index.ts",
      "component": "centerTabs/dashboard/DashboardTab.tsx"
    }
  ]
}
```

## Cómo funciona

1. El loader registra el contenido del tab **también como panel** con el mismo
   id (`panelId === id`): el `PanelHost` del slot central lo monta con su
   ErrorBoundary, igual que cualquier otro panel. Igual que en `panels`, la
   entrada lleva `load` (import dinámico) y no un `React.lazy`: sin `Suspense`
   en el host, un `lazy` no monta cuando el módulo llega.
2. La integración en `Tabs.tsx` arma el array
   `[bienvenida, ...tabsDeExtension, ...archivos]`.
3. Al seleccionar una tab de extensión, se setea `slots.center = panelId`.
4. Las tabs de extensión **no se pueden cerrar ni arrastrar** (solo los
   archivos se reordenan); quedan fijas tras "Bienvenida".

## Reglas

- El componente exporta `default`.
- El ícono es opcional; exporta `default` como componente React.
- El `id` debe ser único entre todas las contribuciones de la app (es también
  un `PanelId`).