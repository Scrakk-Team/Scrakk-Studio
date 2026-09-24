---
title: "Comandos con barra (`/comando`)"
group: chat
order: 20
summary: "API global para comandos iniciados con /. Cualquier input (chat con IA, chat social, un panel, una extensión) puede ejecutarlos y registrar los suyos. El registry no sabe de UI: los comandos recibe…"
---
# Comandos con barra (`/comando`)

API global para comandos iniciados con `/`. Cualquier input (chat con IA, chat
social, un panel, una extensión) puede **ejecutarlos** y **registrar los
suyos**. El registry no sabe de UI: los comandos reciben contexto y devuelven
un mensaje; cada input decide cómo mostrarlo.

## Ejecutar

```ts
import { slashCommands, isSlashInput } from '@services/slash-commands'

if (isSlashInput(texto)) {
  const result = await slashCommands.run(texto, { source: 'chat', sessionId })
  // result = { ok, message?, error? }
}
```

`source` identifica quién lo pidió (`'chat'`, `'social'`, …); `sessionId` es
opcional.

## Registrar un comando

Cada comando vive en su carpeta, con la funcionalidad en `logic.ts` (mismo
espíritu que las tools) y el contrato en `index.ts`:

```ts
import { slashCommands, type SlashCommand } from '@services/slash-commands'
import { miLogica } from './logic'

const miComando: SlashCommand = {
  name: 'mi-comando',
  description: 'Qué hace, en una línea.',
  usage: '/mi-comando [<algo>]',
  category: 'Chat',
  args: [{ name: 'algo', description: 'Qué recibe' }],
  run: (ctx) => miLogica(ctx.args)
}

slashCommands.register(miComando) // allowOverwrite:true para reintentos del mismo dueño
```

`run` puede devolver el resultado o una promesa. Se llama con
`{ source, sessionId, args, rawArgs }`.

## UI propia

Un comando puede mostrar su PROPIA interfaz y devolver `ui: true` para que el
input NO agregue un mensaje de texto con el resultado:

```ts
import { showOptionModal } from '@services/modals'

async function run() {
  const elegido = await showOptionModal({ title: 'Variantes', items })
  if (!elegido) return { ok: true, ui: true } // cancelado
  aplicar(elegido)
  return { ok: true, ui: true }
}
```

`showOptionModal` (modal de opciones) y `showModal` (modal custom) son las dos
herramientas para esto; cualquier comando puede usarlas.

## Comandos del chat con IA

Viven en `features/chat/commands/`, cada uno en su carpeta, y se registran con
`registerChatCommands()` (que se llama al abrir el editor).

Hoy:

| Comando | Qué hace |
| --- | --- |
| `/variants [<valor>\|auto]` | Sin argumento abre el **selector de variantes** del modelo activo (modal de opciones). Con argumento aplica directo. Las opciones salen del catálogo (models.dev). |

El chat ejecuta los comandos sin mandarlos al modelo: el texto `/…` se
intercepta en el panel. Si el comando pide `ui`, no se agrega nada al chat.
Mientras escribes `/`, el input autocompleta con los comandos registrados.

