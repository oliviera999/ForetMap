import { formatDateTimeFr } from '../platform/datetime-fr';
import { forumBtn } from './forumUi.js';

/**
 * Panneau « Signalements » des modérateurs : motif, extrait du message signalé, sujet, auteur
 * et personne qui a signalé. Actions : voir le sujet, supprimer le message (le signalement
 * est alors classé « traité » par le serveur), marquer traité, classer sans suite.
 */
export function ForumReportsPanel({
  reports,
  loading,
  busyId,
  onOpenThread,
  onDeletePost,
  onResolve,
  onClose,
}) {
  const list = Array.isArray(reports) ? reports : [];
  return (
    <section className="fm-panel forum-panel forum-reports" aria-labelledby="forum-reports-title">
      <div className="forum-head">
        <h3 id="forum-reports-title">Signalements à traiter ({list.length})</h3>
        <button type="button" className={forumBtn('ghost')} onClick={onClose}>
          Fermer
        </button>
      </div>
      {loading && <p className="forum-muted">Chargement…</p>}
      {!loading && list.length === 0 && (
        <p className="forum-empty">Aucun signalement en attente.</p>
      )}
      {list.length > 0 && (
        <ul className="forum-reports__list">
          {list.map((r) => {
            const busy = busyId != null && String(busyId) === String(r.id);
            const postDeleted = !!Number(r.post_is_deleted);
            return (
              <li key={r.id} className="forum-report-item">
                <p className="forum-report-item__reason">« {r.reason} »</p>
                <p className="forum-meta-line">
                  Signalé par {r.reporter_display_name || '—'} le {formatDateTimeFr(r.created_at)}
                  {' · '}sujet « {r.thread_title} »
                </p>
                <blockquote className="forum-report-item__excerpt">
                  {postDeleted ? '[message supprimé]' : r.post_excerpt}
                </blockquote>
                <p className="forum-meta-line">Message de {r.post_author_display_name || '—'}</p>
                <div className="forum-report-item__actions">
                  <button
                    type="button"
                    className={forumBtn('secondary')}
                    onClick={() => onOpenThread(r.thread_id)}
                  >
                    Voir le sujet
                  </button>
                  {!postDeleted && (
                    <button
                      type="button"
                      className={forumBtn('danger')}
                      disabled={busy}
                      onClick={() => onDeletePost(r)}
                    >
                      Supprimer le message
                    </button>
                  )}
                  <button
                    type="button"
                    className={forumBtn('ghost')}
                    disabled={busy}
                    onClick={() => onResolve(r, 'resolved')}
                  >
                    Marquer comme traité
                  </button>
                  <button
                    type="button"
                    className={forumBtn('ghost')}
                    disabled={busy}
                    onClick={() => onResolve(r, 'dismissed')}
                  >
                    Classer sans suite
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
