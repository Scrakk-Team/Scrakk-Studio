# Changelog

Cambios relevantes de Scrakk Studio. La **bienvenida** muestra la primera
entrada (la más nueva) en el apartado **Anuncios**, así que lo nuevo va arriba.

Formato: `## <versión> — <título>` y bullets por área. Las entradas ya
publicadas no se editan. El archivo va por versión:
`docs/changelog/changelog-<x.y.z>.md`.

---

## 0.1.2 — Memoria, terminal y chat

### Rendimiento (memoria del editor)
- El renderer estaba **capeado a 256 MB** (`--js-flags` del perfil de
  producción, que se propaga a **todos** los procesos). Al abrir varios archivos
  V8 moría con *"Ineffective mark-compacts near heap limit"*. El tope queda
  **opt-in** y apagado por defecto (`SCRAKK_PERF_CAP_MAIN_HEAP=1` lo activa).
- Cada archivo evictado **guardaba su texto completo** en memoria. Ahora solo se
  retiene si el archivo tiene **cambios sin guardar**; los limpios se re-leen de
  disco al reabrir.
- Los cachés por archivo (símbolos del LSP, resaltado, encoding) ahora tienen
  **tope y descarte del más viejo**: antes crecían con cada archivo abierto
  hasta cerrar la tab.

### Terminal
- Al **cambiar de workspace**, las terminales abiertas se reubican en el
  proyecto nuevo (`cd`) y las nuevas nacen en la carpeta correcta. Antes
  quedaban en la carpeta del proyecto anterior.

### Chat de IA
- Se quitó el **tope de rondas de tools** por turno (era 12): el ciclo se cortaba
  en silencio después de varias herramientas. Ahora solo lo corta el usuario con
  **Detener**.
