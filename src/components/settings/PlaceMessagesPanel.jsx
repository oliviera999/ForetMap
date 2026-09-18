import { useEffect } from 'react';

import { Button } from '../../shared/ui/Button.jsx';
import { usePlaceMessagesInbox } from '../../hooks/usePlaceMessagesInbox.js';
import { formatNotificationDateFr } from '../../shared/notifications/notificationCenterCore.js';

const KIND_LABELS = Object.freeze({ zone: 'Zone', marker: 'Repère' });

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
 * Le repère « déjà lu » est local à l'appareil (`src/utils/placeMessagesInbox.js`), comme
 * celui du centre de notifications.
 *
 * @param {{ onError?: ((msg: string) => void)|null }} props
 */
export function PlaceMessagesPanel({ onError = null }) {
  const { items, total, loading, error, lastSeenAt, unreadCount, reload, markAllRead } =
    usePlaceMessagesInbox({ enabled: true, limit: 50 });

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

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
          {unreadCount > 0 ? ` · ${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''}` : ''}
        </span>
        <span className="place-messages__actions">
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

      {error ? (
        <p className="forum-muted" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="forum-muted">Aucun message reçu sur un lieu pour l’instant.</p>
      ) : null}

      <ul className="place-messages__list">
        {items.map((item) => {
          const isNew = !!lastSeenAt && String(item.created_at) > lastSeenAt;
          const kindLabel = KIND_LABELS[item.context_type] || item.context_type;
          const placeLabel = item.place_label || 'Lieu supprimé';
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
