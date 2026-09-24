import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { acquireGlSocket } from '../realtime/glSocketClient.js';
import { jitteredRefreshDelay } from '../../utils/realtimeRefreshDelay';
import { createForumAdapter } from '../../shared/forum/forumAdapter.js';
import { SharedForumView } from '../../shared/forum/SharedForumView.jsx';
import { SharedForumMarkdown } from '../../shared/forum/SharedForumMarkdown.jsx';
import {
  forumThreadReadStorageKey,
  parseReactionEmojiList,
} from '../../shared/forum/forumHelpers.js';

const GL_LIMITS = Object.freeze({ titleMin: 3, titleMax: 200, bodyMax: 4000 });
const GL_THREAD_LIST_ATTRS = Object.freeze({ 'data-gl-tour': 'forum-threads' });

function GLForumMarkdown({ children, className = '' }) {
  return (
    <SharedForumMarkdown className={`${className} gl-markdown`}>{children}</SharedForumMarkdown>
  );
}

/**
 * Forum G&L : enveloppe mince du forum partagé (`src/shared/forum/`). Elle fournit le client
 * `apiGL`, la configuration du forum (emojis de réaction, signalements — réglages partagés
 * qu'un jeton G&L ne lit qu'ici) et le temps réel `gl:forum:changed`.
 */
export function GLForumView({ canModerate, auth, token }) {
  const adapter = useMemo(
    () =>
      createForumAdapter({
        request: apiGL,
        basePath: '/api/gl/forum',
        capabilities: { moderatorCanReplyLocked: true, hasConfig: true },
      }),
    [],
  );
  const [config, setConfig] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    adapter
      .fetchConfig()
      .then((data) => {
        if (!cancelled) setConfig(data || {});
      })
      .catch(() => {
        if (!cancelled) setConfig({});
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // `gl:forum:changed` part à tout le royaume : délai aléatoire pour que tous les postes ne
  // rechargent pas le forum dans la même seconde (même remède que le marché).
  useEffect(() => {
    if (!token) return undefined;
    const { socket, release } = acquireGlSocket(token);
    if (!socket) return undefined;
    const onForumChanged = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        setRefreshSignal((n) => n + 1);
      }, jitteredRefreshDelay(0));
    };
    socket.on('gl:forum:changed', onForumChanged);
    return () => {
      socket.off('gl:forum:changed', onForumChanged);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      release();
    };
  }, [token]);

  const reactionEmojis = useMemo(
    () => parseReactionEmojiList(config?.reaction_emojis || ''),
    [config],
  );
  const isGuest = String(auth?.userType || '').toLowerCase() === 'gl_guest';
  const currentUser = useMemo(
    () => ({ userType: String(auth?.userType || ''), userId: String(auth?.userId ?? '') }),
    [auth?.userType, auth?.userId],
  );

  return (
    <section className="gl-panel fade-in gl-forum">
      <h2>Forum GL</h2>
      <SharedForumView
        adapter={adapter}
        currentUser={currentUser}
        unreadStorageKey={forumThreadReadStorageKey('gl', currentUser.userType, currentUser.userId)}
        canModerate={!!canModerate}
        canParticipate={!isGuest && config?.can_participate !== false}
        reportsEnabled={config?.reports_enabled !== false}
        reactionEmojis={reactionEmojis}
        limits={GL_LIMITS}
        Markdown={GLForumMarkdown}
        refreshSignal={refreshSignal}
        threadListAttrs={GL_THREAD_LIST_ATTRS}
        readOnlyNote={
          <p className="forum-muted">Mode invité : tu peux lire le forum, mais pas y écrire.</p>
        }
      />
    </section>
  );
}
