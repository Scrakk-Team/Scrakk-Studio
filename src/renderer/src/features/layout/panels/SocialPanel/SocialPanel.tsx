// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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

import { t } from '@core/i18n'
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
    ready,
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
  /**
   * `setActions` es estable (useCallback con deps vacías), pero el OBJETO del
   * contexto cambia de identidad cada vez que las acciones cambian. Depender
   * del objeto entero hacía que este efecto se auto-reactivara en bucle:
   * setActions → contexto nuevo → cleanup (setActions(null)) → contexto nuevo
   * → efecto → ... ("Maximum update depth exceeded"). El bucle saturaba el
   * hilo principal, y de ahí el "fetch failed" al enviar mensajes.
   */
  const setHeaderActions = panelHeader?.setActions ?? null
  useEffect(() => {
    if (!setHeaderActions) return undefined
    setHeaderActions(() => {
      if (
        view === 'accounts' ||
        view === 'addAccount' ||
        view === 'profile' ||
        view === 'addFriend'
      ) {
        return (
          <HeaderActionButton
            id="social.back"
            label={t('layout.volver')}
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
            id="social.add-friend"
            label={t('layout.agregar.amigo')}
            size="sm"
            shape="rounded"
            onClick={() => setView('addFriend')}
          >
            <ProductIcon id="person-add" size={15} />
          </HeaderActionButton>
          <HeaderActionButton
            id="social.accounts"
            label={t('layout.cuentas')}
            size="sm"
            shape="rounded"
            onClick={() => setView('accounts')}
          >
            <ProductIcon id="people" size={15} />
          </HeaderActionButton>
          <HeaderActionButton
            id="social.profile"
            label={t('layout.mi.perfil')}
            size="sm"
            shape="rounded"
            onClick={() => setView('profile')}
          >
            <ProductIcon id="person" size={15} />
          </HeaderActionButton>
        </>
      )
    })
    return () => setHeaderActions(null)
  }, [setHeaderActions, view, me, setView])

  // Todavía no sabemos si hay sesión: NO se muestra el login (antes aparecía
  // por unos segundos al abrir el panel y después daba paso a los amigos).
  if (!ready) {
    return (
      <main className={styles.screen}>
        <p className={styles.booting}>{t('social.cargando')}</p>
      </main>
    )
  }

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
          onOpenProfile={() => setView('profile')}
          onRemove={removeAccount}
          onAdd={addAccount}
          onClose={() => setView('home')}
        />
      </main>
    )
  }

  // Agregar amigo: apartado propio (botón en el header).
  if (view === 'addFriend') {
    return (
      <main className={styles.screen}>
        <div className={styles.scroll}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('layout.agregar.amigo')}</h3>
            <AddFriend search={searchUsers} onSend={sendRequest} />
          </section>
        </div>
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
    const typingName = activePeer.displayName ?? activePeer.handle ?? t('layout.alguien')
    const replySender = replyTo ? (replyTo.senderId === me.dni ? me.name : friends.find((f) => f.id === replyTo.senderId)?.displayName ?? t('layout.usuario')) : undefined
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
            <span>{typingName} {t('layout.esta.escribiendo')}</span>
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
            placeholder={t('social.escribe.a', {
              name: activePeer.displayName ?? activePeer.handle ?? ''
            })}
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
            {accounts.accounts.length > 1
              ? t('social.n.cuentas', { count: String(accounts.accounts.length) })
              : t('layout.cuentas')}
          </span>
        </button>

        {requests.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('layout.solicitudes')}</h3>
            <RequestsList requests={requests} onRespond={respondRequest} />
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('layout.amigos')}</h3>
          <FriendList
            friends={friends}
            activeId={activePeer?.id ?? null}
            unread={unread}
            presence={friendsPresence}
            onSelect={(f) => void openChat(f)}
          />
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
