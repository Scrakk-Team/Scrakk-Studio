// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Feature Social — amigos + mensajes directos en tiempo real.
 *
 * El estado vive en SocialProvider (state/) y los componentes son de
 * presentación. Todo el I/O pasa por el main vía `@services/social`
 * (Supabase + Realtime). El panel que los orquesta está en
 * `features/layout/panels/SocialPanel`.
 */

export { SocialProvider, useSocial } from './state'
export type { CreateProfileInput, AccountActionResult } from './state'
export * from './state/types'

export { UserAvatar } from './components/UserAvatar/UserAvatar'
export { FriendList } from './components/FriendList/FriendList'
export { AddFriend } from './components/AddFriend/AddFriend'
export { RequestsList } from './components/RequestsList/RequestsList'
export { ChatHeader } from './components/ChatHeader/ChatHeader'
export { MessageList } from './components/MessageList/MessageList'
export { MessageComposer } from './components/MessageComposer/MessageComposer'
export { ProfileCard } from './components/ProfileCard/ProfileCard'
export { ProfileEditor } from './components/ProfileEditor/ProfileEditor'
export type { ProfileDraft, ProfileEditorSubmitResult } from './components/ProfileEditor/ProfileEditor'
export { EmailCodeForm } from './components/EmailCodeForm/EmailCodeForm'
export { AuthGate } from './components/AuthGate/AuthGate'
export { AccountSwitcher } from './components/AccountSwitcher/AccountSwitcher'
export { AvatarPicker } from './components/AvatarPicker/AvatarPicker'
