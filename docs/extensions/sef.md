# Empaguetado `.sef`

Un `.sef` (Scrakk Extension Format) es un archivo ZIP con un `manifest.json`
en la raíz (o en una carpeta de la extensión) y el código compilado.

## Layout del paquete

```
mi-ext.sef (ZIP)
├── manifest.json
└── dist/
    └── index.js        # Bundle ESM autocontenido (export default { modules })
```

El bundle exporta un mapa `modules` de **ruta del manifest → Component**:

```js
export default {
  modules: {
    'panels/clock/ClockPanel.tsx': ClockPanel,
    'activitybar/clock/index.ts': Clock,
    'centerTabs/dashboard/DashboardTab.tsx': DashboardTab
  }
}
```

Las rutas del `manifest.json` deben coincidir con las claves de `modules`.

## Instalación

- El main descomprime el zip en `userData/extensions/<id>/` (valida el id y
  evita path traversal).
- En el renderer, el bundle se lee por IPC y se importa como data-URL:
  `data:text/javascript;base64,...`.
- Al boot (o al instalar desde Ajustes → Extensiones) el loader lee
  `manifest.json`, importa el bundle y registra las contribuciones.

## Empaquetar

Desde la raíz de la extensión (con el bundle ya compilado):

```sh
zip -r mi-ext.sef manifest.json dist
```

## Notas

- Una contribución cuyo módulo no existe en `modules` se **saltea con un
  warning**, sin romper el resto de la extensión.
- `manifest.entry` permite cambiar el punto de entrada del bundle (default:
  `dist/index.js`).