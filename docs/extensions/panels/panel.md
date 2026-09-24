---
title: "Paneles"
group: extensions
order: 80
summary: "Un panel es una unidad de UI montable en un slot del layout. Las extensiones los aportan vía contributes.panels."
---
# Paneles

Un panel es una unidad de UI montable en un slot del layout. Las extensiones
los aportan vía `contributes.panels`:

```json
{
  "panels": [
    { "id": "clock", "title": "Reloj", "closable": true, "component": "panels/clock/ClockPanel.tsx" }
  ]
}
```

## Estructura de un panel

```
panels/clock/
├── ClockPanel.tsx            # El componente (export default)
├── ClockPanel.module.css     # Estilos (CSS modules, tokens de la app)
└── index.ts                  # Re-export del componente
```

```tsx
export default function ClockPanel() {
  return <div className={styles.panel}>…</div>
}
```

## Ciclo de vida

1. El loader registra el `PanelEntry` con **`load`**
   (`panelComponentLoader(resolver, path)`), que es un `import()` dinámico del
   módulo del panel — **nunca un `React.lazy`**: el `PanelHost` del layout no
   tiene `Suspense` y un `lazy` sin boundary no monta cuando el módulo llega
   (el panel recién aparecía al abrirlo por segunda vez).
2. El layout lo monta dentro de un `PanelHost` (ErrorBoundary, sin Suspense):
   el host espera el módulo con `useState`, lo cachea y lo precarga en el
   hover del botón, así que abrir un panel ya visitado es instantáneo.
3. Al desinstalar la extensión, `ExtensionRegistry.unregister(id)` lo remueve
   y los slots que lo usaban caen al contenido por defecto.

## Cómo carga el host (y por qué se siente instantáneo)

`features/layout/components/PanelHost/` es el host genérico. Tres piezas:

- **`panelModules.ts`**: `import()` dinámico + cache por id. Un panel ya
  abierto se pinta en el PRIMER render al volver a él (el estado inicial del
  `useState` sale del cache: ni fallback ni frame en blanco). Un fallo NO se
  cachea, y hay botón **Reintentar** en el error del panel.
- **Precarga**: el hover/click del botón de la activity bar arranca el import
  YA (hay intención). En el arranque, `preloadAllPanels()` calienta el resto
  **de a un panel por vez** (cola serial): lanzarlos todos en paralelo
  saturaba el server de módulos de dev y el panel que el usuario abría quedaba
  en cola detrás de esa avalancha — el famoso "se queda en Cargando panel…".
- **Sin `Suspense`**: el host espera la promesa con `useState`.

## El título del header lo manda el host

Un panel puede renombrar su header (`usePanelTitle().setTitle(...)`), pero
cuando el slot cambia de panel el host re-sincroniza el título y limpia las
acciones del panel anterior: el `PanelFrame` de un slot de UNA tab no se
remonta al cambiar de panel, así que sin eso el header se quedaba con el
título y los botones del primero que se abrió (mientras el contenido sí
cambiaba). Ver `features/layout/state/PanelTitleContext.tsx`.

## Reglas

- El componente exporta `default`.
- El panel recibe las props estándar del host (si las necesita).
- Usa tokens de la app (`--color-*`, `--space-*`, `--text-*`) para integrarse
  con los temas.