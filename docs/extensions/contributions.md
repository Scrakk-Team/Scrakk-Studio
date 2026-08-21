# Contribuciones

Una extensión aporta hasta tres tipos de contribuciones. Cada una referencia
un **módulo del paquete por ruta**; el loader lo resuelve a un componente React.

| Contribución    | Clave          | Qué registra                  | Dónde se monta           |
| --------------- | -------------- | ----------------------------- | ------------------------ |
| Panel           | `panels`       | `PanelEntry`                  | Cualquier slot del layout |
| Botón activity  | `activityBar`  | `ActivityBarButton`           | Barra de actividades     |
| Tab central     | `centerTabs`   | `RegisteredCenterTab` + panel | Strip central            |

## Panels

```json
{
  "panels": [
    {
      "id": "clock.panel",
      "title": "Reloj",
      "closable": true,
      "component": "panels/clock/ClockPanel.tsx"
    }
  ]
}
```

Cada panel se registra con `React.lazy` y se monta en un slot del layout con
su ErrorBoundary + Suspense. Ver [panels/panel.md](panels/panel.md).

## Activity bar

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

El botón se fusiona con los built-in de la app y se ordena por `order`. Ver
[activitybar/button.md](activitybar/button.md).

## Tabs centrales

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

Un tab central se registra **también como panel** con el mismo id: así el
`PanelHost` del slot central lo monta con su ErrorBoundary + Suspense. El id
del tab es el id del panel. Ver [centerTabs/tab.md](centerTabs/tab.md).

## Rutas de módulos

- **Builtin**: relativas a la raíz de la carpeta de la extensión
  (`panels/clock/ClockPanel.tsx`). Se resuelven con `import.meta.glob` y quedan
  embebidas en el bundle.
- **Usuario (`.sef`)**: relativas a la raíz del paquete descomprimido. El
  bundle compilado exporta `modules` (mapa `ruta → Component`); el loader
  importa el bundle como data-URL y resuelve por esa clave.
- El componente de **ícono** (si se indica) exporta `default` como componente
  de React (ej. `@proicons/react`).