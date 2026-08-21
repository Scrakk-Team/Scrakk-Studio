/**
 * Módulo de chat: estado de sesiones + modal de confirmación de tools.
 * Los componentes de UI (ChatPanel, HistoryPanel) viven en
 * `features/layout/panels` y se montan vía el sistema de layouts.
 */
export { ChatsProvider, useChats } from './state'
export type { ChatSession } from './state'
export { ToolConfirmationModal } from './components/ToolConfirmationModal/ToolConfirmationModal'
export { ModeGlow } from './components/ModeGlow/ModeGlow'
export { ModeLabel } from './components/ModeLabel/ModeLabel'
export { ChatModeBar } from './components/ChatModeBar/ChatModeBar'
