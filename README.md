# Scrakk Studio

Chat modular — React + TypeScript + Vite (hot reload) + Electron.

## Stack

- **electron-vite 5** — bundling + hot reload (renderer) / hot restart (main)
- **React 19 + TypeScript** (strict)
- **@proicons/react** — iconos
- **titleBarOverlay** — `titleBarStyle: 'hidden'` + `titleBarOverlay`: el OS dibuja
  los botones nativos de ventana (min/max/close) sobre la titlebar custom.
  Soportado en Windows y en Linux con GTK (Electron 43+, `setTitleBarOverlay`
  tiene `@platform win32,linux`). El CSS reserva el área con `env(titlebar-area-*)`.

## Arquitectura (modularización extrema)

```
src/
├── shared/                 # Contrato compartido entre procesos (IPC, tipos)
├── main/                   # Proceso principal (Electron)
│   ├── ipc/                #   handlers IPC (controles de ventana)
│   └── windows/            #   factory de ventanas
├── preload/                # Puente seguro renderer ↔ main (contextBridge)
└── renderer/src/
    ├── app/                # Composición raíz de módulos
    ├── core/               # Infra sin features: tema, tokens, estilos
    ├── components/         # Primitivas compartidas (ui, layout)
    ├── features/           # Módulos de feature autocontenidos
    │   ├── titlebar/       #   titlebar custom + controles de ventana
    │   ├── chat/           #   pantalla de chat (input, burbujas, lista)
    │   └── providers/      #   estado de proveedores + modal + menú
    └── services/           # Capa de servicios
        ├── chat/           #   ChatService real vía IPC (LLM)
        └── providers/      #   Registro de proveedores auto-detectado
            └── openrouter/ #   Config de OpenRouter (OpenAI-compatible)
```

Cada feature es un módulo aislado: componentes, estilos y hooks propios.
Los imports entre módulos usan alias (`@core`, `@ui`, `@features`,
`@services`, `@shared`) en vez de rutas relativas.

## Proveedores de LLM

La app usa **endpoints OpenAI-compatible**: `POST {baseUrl}/chat/completions`
con `Authorization: Bearer <key>`. Cualquier proveedor que hable ese formato
se registra creando una carpeta `services/providers/<id>/index.ts` con un
`ProviderConfig` por defecto — el `registry` lo detecta solo con
`import.meta.glob` (sin tocar la UI).

El fetch corre en el **proceso main** (IPC `llm:chat-completion`): el renderer
no tiene CORS y la API key nunca viaja por la red de la página.

- El modal de **Proveedores** se abre desde el menú flotante abajo del panel
  derecho (botón con ícono). Pide la API key y el **id del modelo** (se escribe
  a mano, como espera el endpoint: `"model": "<id>"`), lo guarda en
  localStorage y lo deja activo.
- Keys por proveedor: `localStorage['scrakk-studio:providers']` (migrable a
  `safeStorage` del OS cuando haya persistencia en disco).

## Comandos

```bash
npm install     # instalar dependencias
npm run dev     # dev con hot reload (abre la ventana de Electron)
npm run build   # build de producción en out/
npm run preview # previsualizar el build
npm run typecheck
```

> Nota: si `npm run dev` falla por binario de Electron faltante (npm 11 puede
> bloquear scripts de instalación), corré `node node_modules/electron/install.js`.
> El `postinstall` del proyecto ya lo intenta automáticamente.

## Diseño

Plano: sin glow, sin gradientes, sin sombras. Todo redondeado en cápsula.
Temas dark/light vía tokens CSS (`core/theme`).
