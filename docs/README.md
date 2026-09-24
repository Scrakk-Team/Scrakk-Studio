---
title: "Scrakk Studio — Documentación"
group: start
order: 0
summary: "Punto de entrada a toda la documentación de Scrakk Studio: qué es, cómo arrancar, y el mapa completo de cada área."
---

# Scrakk Studio — Documentación

**Scrakk Studio** es un IDE agéntico: un editor (Innerta) con chat de IA,
subagentes, extensiones (`.sef`), LSP y un editor de código pensado para que un
agente trabaje *dentro* del editor, no al lado. Este archivo es el **punto de
entrada**: explica qué hay y en qué orden leerlo.

> Si sos una IA que va a consumir estos docs: el índice máquina-legible está en
> `index.json` (nav + metadata), el corpus completo en `llms.txt` y `docs.json`,
> y cada doc se sirve crudo en `md/<slug>.md`. Todo bajo
> [`docs.scrakk.art`](https://docs.scrakk.art) y
> `api.scrakk.art/api/docs`.

## Empezar rápido

1. **Instalar** la app (release de GitHub: AppImage/deb en Linux, instalador en
   Windows).
2. **Abrir un proyecto**: *Archivo → Abrir carpeta*.
3. **Conectar un modelo**: Ajustes → Modelos (local o API). Sin modelo, el chat
   no tiene a quién preguntarle.
4. **Primer chat**: escribí en el panel de chat; el agente puede leer/editar
   archivos y correr comandos según los **permisos** ([Modos y permisos](chat/permissions.md)).
5. **Extensiones**: Ajustes → Extensiones para instalar un `.sef`, o leé
   [el sistema de extensiones](extensions/README.md) para crear uno.

## Mapa de la documentación

### Empezar
| Documento | Qué cubre |
| --- | --- |
| [Actualizaciones](updates.md) | Cómo el IDE detecta, descarga e instala una versión nueva (release → Supabase → Realtime). |

### Chat con IA
| Documento | Qué cubre |
| --- | --- |
| [Modos y permisos](chat/permissions.md) | Modos (primary/subagent), permisos deny-by-default y aprobaciones. |
| [Comandos con barra](chat/slash-commands.md) | Comandos `/comando` del chat. |

### Editor (Innerta)
| Documento | Qué cubre |
| --- | --- |
| [Decoraciones del editor](editor/decorations.md) | Subrayado por rango y decoraciones que pinta el editor. |
| [Innerta como superficie](editor/innerta-bridge.md) | Contrato Innerta ↔ Scrakk: quién es dueño de la UI. |
| [Lenguajes](editor/languages.md) | Cómo una extensión agrega sintaxis (VS Code → SEF → Innerta). |
| [Capturas del editor](editor/screenshots.md) | Cómo se verifica que el editor pinta. |

### Extensiones (SEF)
| Documento | Qué cubre |
| --- | --- |
| [Sistema de extensiones](extensions/README.md) | Los dos sabores (declarativa / con código) y el índice del área. |
| [Manifest](extensions/manifest.md) | El `manifest.json`: campos y `contributes`. |
| [Contribuciones](extensions/contributions.md) | Los trece tipos de contribución, con ejemplo. |
| [Estructura](extensions/structure.md) | Dónde vive cada pieza del sistema. |
| [Empaquetado `.sef`](extensions/sef.md) | Cómo armar un paquete instalable. |
| [Builtin](extensions/builtin.md) | Extensiones compiladas dentro del bundle. |
| [Paneles](extensions/panels/panel.md) | Paneles React de un slot. |
| [Header de paneles](extensions/panels/header-actions.md) | Botones del header de un panel. |
| [Botones de la activity bar](extensions/activitybar/button.md) | Botón que abre un panel. |
| [Tabs centrales](extensions/centerTabs/tab.md) | Tabs del strip central. |
| [Vistas con código](extensions/views/view.md) | Paneles servidos por el Extension Host. |
| [VSCode → SEF](extensions/vscode.md) | Pipeline VSIX → SEF y compatibilidad. |
| [Skills](extensions/skills.md) | Paquetes de skills (estándar Agent Skills). |
| [Tools](extensions/tools.md) | Herramientas de IA que aporta una extensión. |

### Language Server (LSP)
| Documento | Qué cubre |
| --- | --- |
| [Sistema LSP](lsp/README.md) | Índice del área y visión general. |
| [Arquitectura](lsp/architecture.md) | Cómo se orquesta el cliente LSP en el main. |
| [API](lsp/api.md) | Superficie completa para frontend/editor/agente. |
| [Configuración](lsp/configuration.md) | `.scrakk/lsp.json`. |
| [Servidores](lsp/servers.md) | Builtin, detección y auto-instalación. |
| [Proveedores](lsp/providers.md) | Proveedores de lenguaje (host ⇄ IDE). |
| [Protocolo](lsp/protocol.md) | Protocolo soportado y límites. |
| [Extensión `lspServers`](lsp/extensions.md) | Declarar un server desde una extensión. |
| [vscode-languageclient](lsp/vscode-languageclient.md) | Extensiones VS Code con su server. |
| [Testing](lsp/testing.md) | Tests del sistema LSP. |

### Novedades
| Documento | Qué cubre |
| --- | --- |
| [Changelog 0.1.2](changelog/changelog-0.1.2.md) | Cambios de la última versión (también alimenta los Anuncios de la bienvenida). |
| [Changelog 0.1.1](changelog/changelog-0.1.1.md) | Cambios de la versión anterior. |

## Rutas de lectura

- **Usuario nuevo** → *Empezar rápido* (arriba) → [Modos y permisos](chat/permissions.md) → [Actualizaciones](updates.md).
- **Autora de extensiones** → [Sistema de extensiones](extensions/README.md) → [Manifest](extensions/manifest.md) → [Contribuciones](extensions/contributions.md) → [Empaquetado `.sef`](extensions/sef.md). Si venís de VS Code: [VSCode → SEF](extensions/vscode.md).
- **Autor de un lenguaje** → [Lenguajes](editor/languages.md) → [LSP](lsp/README.md) → [Extensión `lspServers`](lsp/extensions.md).
- **Dev del IDE** → [Arquitectura LSP](lsp/architecture.md) → [Innerta](editor/innerta-bridge.md) → [Estructura de extensiones](extensions/structure.md).

## Cómo se publican estos docs

Estos `.md` son la **fuente de verdad** (GitHub, rama `master`). No se editan en
la web. En cada release, un workflow:

1. construye el bundle (`tools/docs/build.mjs` → `index.json`, `docs.json`,
   `llms.txt`, `doc/<slug>.json`);
2. lo sube a **Cloudflare R2** (bucket `scrakk-docs`), versionado (`latest` + `vX.Y.Z`);
3. la **web** lo renderiza en [scrakk.art/docs](https://scrakk.art/docs) con el
   estilo del sitio; `docs.scrakk.art` es el host de datos (JSON / markdown /
   `llms.txt`) y `api.scrakk.art/api/docs` el acceso programático.

El front-matter de cada doc manda sobre la navegación:

```yaml
---
title: "..."
group: extensions     # start | chat | editor | extensions | lsp | changelog
order: 30
summary: "Una línea para la nav y la búsqueda."
---
```

Agregar un `.md` con front-matter = aparece solo en la web, el índice y
`llms.txt`. No hay que registrar nada a mano.
