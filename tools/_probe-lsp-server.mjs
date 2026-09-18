/**
 * Server LSP mínimo (node IPC) para validar el cliente real.
 *
 * Responde `initialize` con capacidades vacías, acepta `initialized`,
 * `didOpen`… y contesta un request propio (`probe/ping`) para probar el
 * camino de ida y vuelta. Sin librerías: JSON-RPC a mano sobre el canal IPC
 * de Node (`process.send`), que es lo que usa `TransportKind.ipc`.
 */

function send(message) {
  process.send?.(message)
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { hoverProvider: true } } })
    return
  }
  if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: null })
    return
  }
  if (message.method === 'exit') {
    process.exit(0)
    return
  }
  if (message.method === 'probe/ping') {
    send({ jsonrpc: '2.0', id: message.id, result: 'pong' })
    return
  }
  // Notificación desconocida: se ignora (como un server real).
})
