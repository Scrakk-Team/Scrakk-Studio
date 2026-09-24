// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
export { registerChatCommands } from './commands'
