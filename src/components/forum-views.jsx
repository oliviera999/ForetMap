import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { MarkdownContent } from './MarkdownContent.jsx';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { createForumAdapter } from '../shared/forum/forumAdapter.js';
import { SharedForumView } from '../shared/forum/SharedForumView.jsx';
import {
  forumThreadReadStorageKey,
  isForumModerator,
  parseReactionEmojiList,
} from '../shared/forum/forumHelpers.js';

const FORETMAP_LIMITS = Object.freeze({ titleMin: 4, titleMax: 180, bodyMax: 4000 });

/**
 * Forum ForetMap : enveloppe mince du forum partagé (`src/shared/forum/`). Elle fournit le
 * client `api`, les emojis et l'interrupteur des signalements lus dans les réglages publics
 * déjà en mémoire, les groupes, l'éditeur visuel et le rendu Markdown avec glossaire, et
 * relaie les événements temps réel `forum:changed`.
 */
function ForumView({
  authClaims,
  canParticipateForum = true,
  threadRequest = null,
  onThreadRequestHandled = null,
}) {
  const adapter = useMemo(
    () =>
      createForumAdapter({ request: api, basePath: '/api/forum', capabilities: { groups: true } }),
    [],
  );
  const canModerate = useMemo(() => isForumModerator(authClaims), [authClaims]);
  const publicSettings = usePublicSettings();
  const reportsEnabled = publicSettings?.modules?.reports_enabled !== false;
  // Emojis de réaction : lus dans les réglages publics déjà fournis par le contexte (le forum
  // allait sinon les rechercher à chaque ouverture — docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, T3).
  const reactionEmojis = useMemo(
    () =>
      parseReactionEmojiList(
        publicSettings?.ui?.reactions?.allowed_emojis ||
          publicSettings?.reactions?.allowed_emojis ||
          '',
      ),
    [publicSettings],
  );
  const currentUser = useMemo(
    () => ({
      userType: String(authClaims?.userType || '').toLowerCase(),
      userId: String(authClaims?.canonicalUserId || authClaims?.userId || ''),
    }),
    [authClaims],
  );
  const [groupOptions, setGroupOptions] = useState([]);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    api('/api/groups/options')
      .then((payload) => setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroupOptions([]));
  }, []);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e?.detail?.domain === 'forum') setRefreshSignal((n) => n + 1);
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, []);

  return (
    <SharedForumView
      adapter={adapter}
      currentUser={currentUser}
      unreadStorageKey={forumThreadReadStorageKey(
        'foret',
        currentUser.userType,
        currentUser.userId,
      )}
      canModerate={canModerate}
      canParticipate={canParticipateForum}
      reportsEnabled={reportsEnabled}
      reactionEmojis={reactionEmojis}
      limits={FORETMAP_LIMITS}
      groupOptions={groupOptions}
      Markdown={MarkdownContent}
      Editor={MarkdownTextarea}
      refreshSignal={refreshSignal}
      threadRequest={threadRequest}
      onThreadRequestHandled={onThreadRequestHandled}
      readOnlyNote={
        <p className="forum-muted">
          Tu consultes le forum en <strong>lecture seule</strong>. La participation (nouveaux
          sujets, réponses, réactions, signalements) n’est pas activée sur ton compte — contacte un
          n3boss si besoin.
        </p>
      }
    />
  );
}

export { ForumView };
