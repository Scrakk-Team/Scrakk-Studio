---
title: "Empaquetado `.sef`"
group: extensions
order: 90
summary: "Un .sef (Scrakk Extension Format) es un archivo ZIP con un manifest.json en la raíz (o en una carpeta de la extensión) y los archivos que la extensión necesite."
---
# Empaquetado `.sef`

Un `.sef` (Scrakk Extension Format) es simplemente un **ZIP** con el
`manifest.json` de tu extensión en la raíz —o dentro de una sola carpeta— junto
con los archivos que necesita.

## Dos sabores

### 1. Declarativa (el caso normal)

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

Las rutas del `manifest.json` deben coincidir con las claves de `modules`. Una
contribución cuyo módulo no exista se saltea con un warning, sin romper el
resto. `manifest.entry` permite cambiar el punto de entrada (default
`dist/index.js`).

### 2. Con código (extensión convertida desde VS Code)

```
mi-ext.sef (ZIP)
├── manifest.json         # incluye "runtime": { "kind": "node", "entry": "extension.js" }
├── .source.json           # procedencia (vsix original, versión, licencia)
└── <paquete tal cual>     # entry, módulos, media/, node_modules empaquetados…
```

El traductor **copia el paquete completo con sus rutas originales** (no solo el
entry): las extensiones multi-archivo hacen `require('./otro')` y
`context.asAbsolutePath('media/x.css')`, así que todo tiene que quedar en la
misma ubicación relativa que tenía en el `.vsix`. `manifest.json` y
`.source.json` son archivos reservados que la extensión no puede pisar.

Con `runtime` presente, el Extension Host carga el entry y le inyecta el API;
las contribuciones declarativas (`views`) ya están registradas antes de que
corra una línea de código. Ver [vscode.md](vscode.md).

## Cómo se instala

- El main descomprime el zip en `userData/extensions/<id>/` (valida el id y
  evita path traversal, límites anti-zip-bomb).
- En el renderer, el bundle declarativo se lee por IPC e se importa como
  data-URL: `data:text/javascript;base64,...`.
- Al boot (o al instalar desde Ajustes → Extensiones) el loader lee el
  `manifest.json`, registra las contribuciones y deja la extensión lista.

## Empaquetar a mano

Desde la raíz de la extensión (con el bundle ya compilado):

```sh
zip -r mi-ext.sef manifest.json dist
```

## Notas

- Un `.sef` instalado queda marcado como `isBuiltin: false` y se puede
  activar/desactivar sin desinstalar.
- El sistema de herramientas (`tools/sef`) hace create/build/pack/validate del
  paquete; el instalador real del IDE usa el mismo código de validación.
- Los `.sef` de VSIX viejos se pueden **re-traducir** cuando mejora el
  traductor, siempre que el `.vsix` original siga guardado.
