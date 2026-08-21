# Plan: Limpieza total de modularización — código muerto, duplicados y excludes

## Diagnóstico (verificado con grafo de imports BFS desde main.tsx/index.ts/preload + greps)

**569 archivos TS/TSX en renderer → 504 vivos → ~121 huérfanos** (~15k líneas),
más `files-otherapps/` y basura no-código. Cero referencias en código vivo,
cero referencias en docs. Todo el detalle abajo.

### A. Duplicados de carpetas (patrón "carpeta anidada con mismo nombre")
La app usa las primitivas de **`@ui`** (`components/ui/`) — estas copias
completas están muertas por ambos lados del anidamiento:
- `components/ContextMenu/` (raíz + subfolder `ContextMenu/`) — la viva es `ui/ContextMenu`
- `components/Modal/` (raíz + `Modal/`) — la viva es `ui/Modal`
- `components/Search/` (raíz + `Search/`)
- `components/Icons/` (raíz + `Icons/`, incluye README) — el explorer usa su propio FileTypeIcon

### B. Sistema de notificaciones completo — MUERTO (28 archivos)
`src/renderer/src/notifications/` entero, incluida la doble copia
`notifications/notifications/`. Ni una sola importación desde features/app.
(El StatusBar vivo nunca tuvo campana.)

### C. Servicios legacy del app viejo (excluidos de tsconfig, cero imports)
- `services/compatibility/` — **41 archivos**: toda la capa VS Code/VSIX
  (converter, install, textmate, themes, snippets, product-icon-themes, runtime)
- `services/search/`, `commandRegistry/`, `workspaceTrust/`,
  `panelBrowser/`, `editorBridge/`, `contextMenu/`, `vsix/`, `nativeOverlay.ts`
- `services/extensions/core/` — resto del core viejo (themeBuilder, theme,
  panels, api/{editor,browser,search,languages,lsp,ste,events,ui}, builtin,
  service.ts, ui)
- `hooks/useContextMenu.ts`

### D. Muertos dentro de zonas VIVAS (falsos seguros)
- `services/ai/chatEngineService.ts` — nadie lo importa (el loop real vive en
  ChatSessionsContext/chatContextBuilder)
- `services/ai/workState.ts`, `services/ai/types.ts` (los tools usan
  `tools/types.ts`; policy/commandProcessor tienen sus propios types)
- `services/ai/tools/read_file/visual/` (ReadFileCard sin importer;
  WriteFileCard/TerminalCard SÍ viven)

### E. Barrels index.ts nunca importados (17) — DECISIÓN PENDIENTE
Barrels de componentes que todos importan directo al archivo:
features/chat/components/*/index.ts (6), features/layout/components/*/index.ts
(7), panels/*/index.ts (3), providers/components/*/index.ts (3),
titlebar/components/MenuBar/index.ts. No son peligrosos: son API surface.
→ Pregunta al usuario: ¿borrarlos o dejarlos?

### F. Basura no-código
- `files-otherapps/settings-original/` (copias viejas)
- `out/` ya está gitignoreado; opcional `rm -rf out`

### G. tsconfig.web.json — bloque exclude obsoleto
Tras borrar A–D, TODAS las entradas del exclude apuntan a carpetas que ya no
existen → eliminar el bloque completo ⇒ **todo el renderer queda bajo typecheck**
(hoy ~90 archivos escapan de tsc).

## Ejecución (sin reescribir nada: puros rm + un edit de tsconfig)

### Fase 0 — Punto de seguridad (OBLIGATORIO antes de tocar)
El repo tiene git init pero CERO commits.
```bash
git add -A && git commit -m "chore: baseline pre-limpieza"
```
Si algo rompe, bisect trivial.

### Fase 1 — Duplicados de componentes
```bash
git rm -r src/renderer/src/components/ContextMenu \
          src/renderer/src/components/Modal \
          src/renderer/src/components/Search \
          src/renderer/src/components/Icons
npm run typecheck   # verde esperado
```

### Fase 2 — Notificaciones
```bash
git rm -r src/renderer/src/notifications
npm run typecheck
```

### Fase 3 — Servicios legacy
```bash
git rm -r src/renderer/src/services/compatibility \
          src/renderer/src/services/search \
          src/renderer/src/services/commandRegistry \
          src/renderer/src/services/workspaceTrust \
          src/renderer/src/services/panelBrowser \
          src/renderer/src/services/editorBridge \
          src/renderer/src/services/contextMenu \
          src/renderer/src/services/vsix \
          src/renderer/src/services/extensions/core
git rm src/renderer/src/services/nativeOverlay.ts src/renderer/src/hooks/useContextMenu.ts
npm run typecheck
```

### Fase 4 — Muertos en zonas vivas
```bash
git rm src/renderer/src/services/ai/chatEngineService.ts \
       src/renderer/src/services/ai/workState.ts \
       src/renderer/src/services/ai/types.ts
git rm -r src/renderer/src/services/ai/tools/read_file/visual
npm run typecheck && npm test
```

### Fase 5 — Basura no-código
```bash
git rm -r files-otherapps
rm -rf out   # ya gitignoreado
```

### Fase 6 — tsconfig.web.json
Eliminar el bloque `"exclude": [...]` completo (todas sus entradas quedaron
vacías). Resultado: 100% del renderer bajo tsc strict.

### Fase 7 — Verificación final
```bash
npm run typecheck
npm test                       # 59 tests LSP deben seguir verdes
npm run build                  # bundling completo electron-vite
# manual: npm run dev y smoke-test (explorer, chat, settings, editor Innerta)
```

### Fase 8 — Commit
```bash
git add -A && git commit -m "chore: remove dead code and duplicate trees (~150 files)"
```

## Riesgos y mitigaciones
1. **Falso positivo del BFS** (import dinámico no detectado): mitigado porque
   cada fase corre typecheck inmediato; si una fase rompe, se revierte solo esa
   (`git checkout -- <paths>`).
2. **Imports por string** (`'@services/layout'` construido dinámicamente):
   grep previo mostró cero ocurrencias en código vivo.
3. **Vite glob**: los globs activos apuntan a extensions/builtin y themes —
   ninguno toca carpetas borradas.

## Pendiente de decisión del usuario
1. ¿Commit baseline en Fase 0? (recomendado: sí)
2. ¿Los 17 barrels index.ts huérfanos: borrar o dejar? (recomendado: dejar —
   son API surface válida para imports futuros; costo cero)

## Resultado esperado
- ~150 archivos menos (~15k líneas), cero carpetas duplicadas
- 100% del código bajo typecheck strict (hoy ~90 archivos escapaban)
- Estructura final limpia: components/{ui,layout}, features/*, services/* sin
  cadáveres, notifications desaparece, compatibility/vscode fuera
