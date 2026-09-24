// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Entry del proceso Extension Host.
 *
 * Se lanza con `utilityProcess.fork(...)` desde el manager del main. Lo único
 * que hace es conectar el canal de Electron con el `RpcPeer`; toda la lógica
 * vive en `hostProcess.ts` (testeable sin proceso).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Este archivo es el que MÁS depende de Electron (`process.parentPort`). Si
 * Owear trae otro mecanismo de procesos, se reescribe aquí (o se borra) sin
 * tocar el shim, el `vscodeApi` ni los handlers.
 */

import type { HostMessage } from '@shared/extensionHost/protocol'
import { RpcPeer } from './rpc'
import { createHostRuntime } from './hostProcess'

interface ParentPortLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (event: { data: unknown }) => void): void
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort

if (!parentPort) {
  // Sin canal no hay nada que hacer: morir rápido y claro es mejor que
  // quedarse colgado sin poder recibir `init`.
  console.error('[extension-host] arrancado sin canal con el proceso main')
  process.exit(1)
}

const peer = new RpcPeer(
  { send: (message: HostMessage) => parentPort.postMessage(message) },
  { idSign: -1, label: 'extension-host' }
)

parentPort.on('message', (event) => {
  peer.receive(event.data as HostMessage)
})

// Errores no capturados de la EXTENSIÓN: se reportan al main (que los ve la
// UI) en vez de morir en silencio. Van aquí y no en el runtime porque son un
// asunto del proceso.
process.on('uncaughtException', (error) => {
  peer.emit('fatal', { message: error.message, stack: error.stack })
})

process.on('unhandledRejection', (reason) => {
  peer.emit('fatal', {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  })
})

createHostRuntime({ peer }).start()

// El main puede cortar el proceso (kill) cuando desinstala o apaga la app.
process.on('disconnect', () => {
  peer.dispose('el proceso main se desconectó')
  process.exit(0)
})
