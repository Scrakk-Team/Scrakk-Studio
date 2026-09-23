/**
 * Autocompletado — API pública.
 *
 * El input del editor (`innertaInput`) dispara `scheduleCompletion` al tipear y
 * consulta `handleCompletionKey` antes de entregar la tecla al motor.
 * `CompletionHost` (montado en AppShell) dibuja la lista.
 */

export { CompletionHost } from './CompletionHost'
export {
  acceptCompletion,
  closeCompletionPopup,
  handleCompletionKey,
  isCompletionOpen,
  requestCompletion,
  scheduleCompletion,
  type CompletionRequest
} from './controller'
export {
  getCompletionState,
  subscribeToCompletion,
  type CaretRect,
  type CompletionItem,
  type CompletionState
} from './state'
