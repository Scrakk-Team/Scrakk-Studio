# Paneles

Un panel es una unidad de UI montable en un slot del layout. Las extensiones
los aportan vía `contributes.panels`.

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

1. El loader registra `PanelEntry` con `React.lazy(resolver.resolveComponent(path))`.
2. El layout lo monta dentro de un `PanelHost` (ErrorBoundary + Suspense).
3. Al desinstalar la extensión, `ExtensionRegistry.unregister(id)` lo remueve
   y los slots que lo usaban caen al contenido por defecto.

## Reglas

- El componente exporta `default`.
- El panel recibe las props estándar del host (si las necesita).
- Usa tokens de la app (`--color-*`, `--space-*`, `--text-*`) para integrarse
  con los temas.