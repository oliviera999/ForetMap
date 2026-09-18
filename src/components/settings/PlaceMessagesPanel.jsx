import { useEffect, useMemo, useState } from 'react';

import { Button } from '../../shared/ui/Button.jsx';
import { usePlaceMessagesInbox } from '../../hooks/usePlaceMessagesInbox.js';
import { formatNotificationDateFr } from '../../shared/notifications/notificationCenterCore.js';
import {
  SETTABLE_PLACE_STATUSES,
  placeStatusClass,
  placeStatusLabel,
} from '../../shared/place-messages/placeStatus.js';

const KIND_LABELS = Object.freeze({ zone: 'Zone', marker: 'Repère' });

/** Libellé du bouton qui pose un statut — un verbe, pas l'état. */
const STATUS_ACTION_LABELS = Object.freeze({
  pris_en_compte: 'Prendre en compte',
  traite: 'Marquer traité',
  sans_suite: 'Sans suite',
});

/**
 * « Messages reçus sur les lieux » — les commentaires déposés sur une zone ou un repère,
 * tous lieux confondus, du plus récent au plus ancien.
 *
 * Cet écran répond à une question que la fiche d'un lieu ne sait pas poser : *qu'avons-nous
 * reçu ?*. Jusqu'ici, un signalement déposé depuis le plan des personnels n'était découvert
 * qu'en rouvrant par hasard le repère concerné — aucun écran, aucun compteur, aucun message
 * ne le signalait. Le contenu, lui, n'est pas dupliqué : il vit toujours sous son lieu, où on
 * peut y répondre, le modérer ou le supprimer.
 *
 * On y **clôt** en revanche les messages : « pris en compte », « traité », « sans suite ». Le
 * statut est la seule alternative à la suppression, qui efface l'information au lieu de la
 * clore, et c'est lui que l'auteur lit sur sa fiche de lieu. Les boutons n'apparaissent qu'aux
 * comptes portant `place_messages.manage` (le seul `admin` à la livraison) : le serveur le dit
 * dans la réponse, le front ne le devine pas.
 *
 * Le repère « déjà lu » est local à l'appareil (`src/utils/placeMessagesInbox.js`), comme
 * celui du centre de notifications — il ne dit pas aux collègues que vous avez lu. Le statut,
 * lui, est partagé : c'est la différence entre « j'ai vu » et « on s'en occupe ».
 *
 * @param {{ onError?: ((msg: string) => void)|null }} props
 */
export function PlaceMessagesPanel({ onError = null }) {
  const {
    items,
    total,
    openTotal,
    canSetStatus,
    loading,
    error,
    lastSeenAt,
    unreadCount,
    reload,
    markAllRead,
    setStatus,
  } = usePlaceMessagesInbox({ enabled: true, limit: 50 });
  const [openOnly, setOpenOnly] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  const shownItems = useMemo(
    () => (openOnly ? items.filter((item) => !item.place_status) : items),
    [items, openOnly],
  );

  const applyStatus = async (commentId, status) => {
    setPendingId(commentId);
    setStatusError('');
    try {
      await setStatus(commentId, status);
    } catch (err) {
      const message = err?.message || 'Changement de statut impossible.';
      setStatusError(message);
      onError?.(message);
    } finally {
      setPendingId('');
    }
  };

  return (
    <div className="place-messages">
      <p className="section-sub">
        Ce que les utilisateurs écrivent <strong>sur un lieu</strong> : commentaires déposés sur une
        zone ou un repère depuis la carte, et signalements envoyés depuis le plan des personnels («
        Signaler un problème ou proposer une correction »). Pour répondre, modérer ou supprimer,
        ouvrez le lieu concerné — le message y vit.
      </p>

      <div className="place-messages__bar">
        <span className="forum-muted">
          {total} message{total > 1 ? 's' : ''}
          {openTotal > 0 ? ` · ${openTotal} à traiter` : ''}
          {unreadCount > 0 ? ` · ${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''}` : ''}
        </span>
        <span className="place-messages__actions">
          <label className="place-messages__filter">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(event) => setOpenOnly(event.target.checked)}
            />
            À traiter seulement
          </label>
          <Button variant="secondary" size="sm" loading={loading} onClick={reload}>
            Actualiser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={markAllRead}
            title="Ne marque comme lus que les messages affichés ici"
          >
            Tout marquer comme lu
          </Button>
        </span>
      </div>

      {error || statusError ? (
        <p className="forum-muted" role="alert">
          {error || statusError}
        </p>
      ) : null}

      {!loading && shownItems.length === 0 ? (
        <p className="forum-muted">
          {openOnly
            ? 'Rien à traiter : tous les messages reçus sont classés.'
            : 'Aucun message reçu sur un lieu pour l’instant.'}
        </p>
      ) : null}

      <ul className="place-messages__list">
        {shownItems.map((item) => {
          const isNew = !!lastSeenAt && String(item.created_at) > lastSeenAt;
          const kindLabel = KIND_LABELS[item.context_type] || item.context_type;
          const placeLabel = item.place_label || 'Lieu supprimé';
          const status = item.place_status || '';
          return (
            <li
              key={item.id}
              className={`context-comment-item place-messages__item${isNew ? ' is-unread' : ''}`}
            >
              <div className="context-comment-head">
                <strong>
                  {item.place_emoji ? `${item.place_emoji} ` : ''}
                  {placeLabel}
                </strong>
                <span className="forum-muted">
                  {kindLabel} · {formatNotificationDateFr(item.created_at)}
                  {isNew ? ' · nouveau' : ''}
                </span>
              </div>
              <p className="place-messages__body">{item.body}</p>
              <p className="forum-meta-line">
                {item.author_display_name || 'Auteur inconnu'}
                {item.image_urls?.length
                  ? ` · ${item.image_urls.length} photo${item.image_urls.length > 1 ? 's' : ''}`
                  : ''}
              </p>
              <div className="place-messages__status-row">
                <span className={placeStatusClass(status)}>{placeStatusLabel(status)}</span>
                {canSetStatus ? (
                  <span className="place-messages__status-actions">
                    {SETTABLE_PLACE_STATUSES.filter((value) => value !== status).map((value) => (
                      <Button
                        key={value}
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === item.id}
                        onClick={() => applyStatus(item.id, value)}
                      >
                        {STATUS_ACTION_LABELS[value]}
                      </Button>
                    ))}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
