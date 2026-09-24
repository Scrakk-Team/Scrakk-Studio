// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Worker de tree-sitter DINÁMICO — proceso aparte, sólo transporte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN PROCESO APARTE
 *
 * El parser es un `.wasm` de terceros que se ejecuta la primera vez que el
 * usuario abre un archivo de ese lenguaje. Un parser con un bug de memoria (o
 * un `.wasm` de ABI incompatible) puede tirar el proceso entero. En el main eso
 * es la ventana; aquí se cae el worker, el manager lo reporta como error de
 * resaltado y el editor sigue andando con lo que tenía.
 *
 * Toda la lógica está en `tokenizer.ts` (probable sin levantar un proceso); aquí
 * sólo se conecta el canal de mensajes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Este archivo NO sabe de Electron: sólo habla por `parentPort`. Cuando Owear
 * reemplace el runtime se cambia el transporte de abajo, no el tokenizador.
 */

import type { DynamicTokenizeRequest, DynamicTokenizeResult } from '@shared/extensions'
import { createTreeSitterTokenizer } from './tokenizer'

/** Petición del manager. */
interface WorkerRequest {
  id: number
  type: 'tokenize'
  payload: DynamicTokenizeRequest
}

/** Respuesta al manager. */
type WorkerResponse =
  | { id: number; ok: true; result: DynamicTokenizeResult }
  | { id: number; ok: false; error: string }

interface ParentPortLike {
  on(event: 'message', listener: (event: { data: WorkerRequest }) => void): void
  postMessage(message: WorkerResponse): void
}

const parentPort = (process as unknown as { parentPort: ParentPortLike }).parentPort
const tokenizer = createTreeSitterTokenizer()

function send(message: WorkerResponse): void {
  try {
    parentPort.postMessage(message)
  } catch {
    // El manager ya no está (se cayó o cerró la ventana): no hay a quién
    // contestarle y el proceso termina solo.
  }
}

parentPort?.on('message', (event) => {
  const request = event.data
  if (!request || request.type !== 'tokenize') return
  void tokenizer
    .tokenize(request.payload)
    .then((result) => send({ id: request.id, ok: true, result }))
    .catch((error: unknown) => {
      send({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
})
