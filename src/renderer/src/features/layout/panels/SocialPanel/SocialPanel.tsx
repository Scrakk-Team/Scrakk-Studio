import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { HeaderActionButton, usePanelTitleOptional } from '@features/layout'
import {
  AccountSwitcher,
  AddFriend,
  AuthGate,
  ChatHeader,
  FriendList,
  MessageComposer,
  MessageList,
  ProfileCard,
  ProfileEditor,
  RequestsList,
  SocialProvider,
  UserAvatar,
  useSocial
} from '@features/social'
import styles from './SocialPanel.module.css'

/**
 * Panel Social. Cada instancia tiene su PROPIO estado y SU propia cuenta
 * (multi-cuenta por panel): cambiar de cuenta aquí no afecta a otros paneles.
 *
 * Vistas: onboarding (email + código) → completar perfil → home (perfil +
 * solicitudes + amigos + buscar) → chat / perfil / cuentas.
 */
function SocialPanelInner(): JSX.Element {
  const {
    accountId,
    me,
    needsProfile,
    friends,
    requests,
    accounts,
    activeAccount,
    activePeer,
    messages,
    unread,
    friendsPresence,
    ideContext,
    replyTo,
    typingByPeer,
    hasMore,
    loadingMore,
    view,
    requestCode,
    verifyCode,
    updateProfile,
    updateActivity,
    setPresence,
    signOut,
    setView,
    searchUsers,
    sendRequest,
    respondRequest,
    switchAccount,
    removeAccount,
    addAccount,
    openChat,
    closeChat,
    sendMessage,
    editMessage,
    deleteMessage,
    setReplyTo,
    sendTyping,
    loadMore
  } = useSocial()

  const [editingProfile, setEditingProfile] = useState(false)

  const panelHeader = usePanelTitleOptional()
  useEffect(() => {
    if (!panelHeader) return undefined
    panelHeader.setActions(() => {
      if (view === 'accounts' || view === 'addAccount' || view === 'profile') {
        return (
          <HeaderActionButton
            id="social.back"
            label="Volver"
            size="sm"
            shape="rounded"
            onClick={() => setView('home')}
          >
            <ProductIcon id="chevron-right" size={15} style={{ transform: 'rotate(180deg)' }} />
          </HeaderActionButton>
        )
      }
      if (!me) return null
      return (
        <>
          <HeaderActionButton
            id="social.accounts"
            label="Cuentas"
            size="sm"
            shape="rounded"
            onClick={() => setView('accounts')}
          >
            <ProductIcon id="people" size={15} />
          </HeaderActionButton>
          <HeaderActionButton
            id="social.profile"
            label="Mi perfil"
            size="sm"
            shape="rounded"
            onClick={() => setView('profile')}
          >
            <ProductIcon id="person" size={15} />
          </HeaderActionButton>
        </>
      )
    })
    return () => panelHeader.setActions(null)
  }, [panelHeader, view, me, setView])

  // Sin sesión (o cuenta vencida) → email + código (mismo login que el CLI).
  if (!me) {
    return (
      <main className={styles.screen}>
        <AuthGate onRequestCode={requestCode} onVerifyCode={verifyCode} />
      </main>
    )
  }

  // Sumar otra cuenta (estando logueado).
  if (view === 'addAccount') {
    return (
      <main className={styles.screen}>
        <AuthGate
          onRequestCode={requestCode}
          onVerifyCode={verifyCode}
          onCancel={() => setView('home')}
        />
      </main>
    )
  }

  // Con sesión pero sin perfil público.
  if (needsProfile) {
    return (
      <main className={styles.screen}>
        <ProfileEditor
          mode="setup"
          accountId={accountId}
          onSubmit={async (draft) =>
            updateProfile({
              name: draft.name,
              handle: draft.handle,
              description: draft.description,
              avatarUrl: draft.avatarUrl,
              gender: draft.gender,
              customStatus: draft.customStatus,
              customStatusEmoji: draft.customStatusEmoji,
              customStatusDuration: draft.customStatusDuration
            })
          }
        />
      </main>
    )
  }

  // Cambiador de cuentas (solo de este panel).
  if (view === 'accounts') {
    return (
      <main className={styles.screen}>
        <AccountSwitcher
          accounts={accounts}
          activeId={accountId}
          onSwitch={switchAccount}
          onRemove={removeAccount}
          onAdd={addAccount}
          onClose={() => setView('home')}
        />
      </main>
    )
  }

  // Perfil (ver/editar).
  if (view === 'profile') {
    return (
      <main className={styles.screen}>
        {editingProfile ? (
          <ProfileEditor
            mode="edit"
            dni={me.dni}
            accountId={accountId}
            initial={{
              name: me.name,
              handle: me.handle,
              description: me.description,
              avatarUrl: me.avatarUrl,
              gender: me.gender ?? undefined,
              customStatus: me.customStatus ?? undefined,
              customStatusEmoji: me.customStatusEmoji ?? undefined
            }}
            onSubmit={async (draft) => {
              const result = await updateProfile({
                name: draft.name,
                handle: draft.handle,
                description: draft.description,
                avatarUrl: draft.avatarUrl,
                gender: draft.gender,
                customStatus: draft.customStatus,
                customStatusEmoji: draft.customStatusEmoji,
                customStatusDuration: draft.customStatusDuration
              })
              if (result.ok) setEditingProfile(false)
              return result
            }}
            onCancel={() => setEditingProfile(false)}
          />
        ) : (
          <div className={styles.scroll}>
            <ProfileCard
              profile={me}
              projectName={ideContext.project}
              fileName={ideContext.file}
              onEdit={() => setEditingProfile(true)}
              onSignOut={() => void signOut()}
              onChangePresence={setPresence}
              onChangeActivity={updateActivity}
            />
          </div>
        )}
      </main>
    )
  }

  // Chat directo.
  if (view === 'chat' && activePeer) {
    const isTyping = !!typingByPeer[activePeer.id]
    const typingName = activePeer.displayName ?? activePeer.handle ?? 'Alguien'
    const replySender = replyTo ? (replyTo.senderId === me.dni ? me.name : friends.find((f) => f.id === replyTo.senderId)?.displayName ?? 'Usuario') : undefined
    return (
      <main className={styles.screen}>
        <ChatHeader peer={activePeer} status={friendsPresence[activePeer.id]?.status} onBack={closeChat} />
        <div className={styles.messages}>
          <MessageList
            key={activePeer.id}
            conversationId={activePeer.id}
            messages={messages}
            meId={me.dni}
            friends={friends}
            meName={me.name}
            meAvatar={me.avatarUrl}
            meProfile={me}
            friendsPresence={friendsPresence}
            onReply={setReplyTo}
            onEdit={editMessage}
            onDelete={deleteMessage}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        </div>
        {isTyping ? (
          <div className={styles.typing}>
            <span>{typingName} está escribiendo</span>
            <span className={styles.typingDots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}
        <div className={styles.composer}>
          <MessageComposer
            onSend={sendMessage}
            placeholder={`Escribe a ${activePeer.displayName ?? activePeer.handle ?? ''}…`}
            replyTo={replyTo}
            replySenderName={replySender}
            onCancelReply={() => setReplyTo(null)}
            friends={friends}
            onTyping={sendTyping}
          />
        </div>
      </main>
    )
  }

  // Home: yo + solicitudes + amigos + buscar.
  return (
    <main className={styles.screen}>
      <div className={styles.scroll}>
        <button type="button" className={styles.me} onClick={() => setView('accounts')}>
          <UserAvatar name={me.name} src={me.avatarUrl} size={36} />
          <span className={styles.meText}>
            <span className={styles.meName}>{me.name}</span>
            <span className={styles.meSub}>
              {me.handle ? `${me.handle} · ` : ''}
              {activeAccount?.email ?? me.dni}
            </span>
          </span>
          <span className={styles.switchHint}>
            <ProductIcon id="people" size={13} />
            {accounts.accounts.length > 1 ? `${accounts.accounts.length} cuentas` : 'Cuentas'}
          </span>
        </button>

        {requests.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Solicitudes</h3>
            <RequestsList requests={requests} onRespond={respondRequest} />
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Amigos</h3>
          <FriendList
            friends={friends}
            activeId={activePeer?.id ?? null}
            unread={unread}
            presence={friendsPresence}
            onSelect={(f) => void openChat(f)}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Agregar amigo</h3>
          <AddFriend search={searchUsers} onSend={sendRequest} />
        </section>
      </div>
    </main>
  )
}

/** El panel se registra en el layout y envuelve su provider (estado por panel). */
export function SocialPanel(): JSX.Element {
  return (
    <SocialProvider>
      <SocialPanelInner />
    </SocialProvider>
  )
}
