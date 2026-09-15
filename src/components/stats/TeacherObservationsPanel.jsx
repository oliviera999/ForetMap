import { useEffect, useMemo, useState } from 'react';
import { IconNotebook, IconWarning } from '../../shared/icons.jsx';
import { UserJournalReadModal } from '../journal/UserJournalReadModal.jsx';
import { renderMarkdownToSafeHtml } from '../../shared/platform/markdown.js';

/**
 * Panneau « Carnets des élèves » : fil d’articles récents regroupés par élève + lecture / livre.
 */
export function TeacherObservationsPanel({
  roleTerms,
  observations = [],
  obsLoading = false,
  obsError = '',
  onLoad,
  autoLoad = true,
}) {
  const [readUserId, setReadUserId] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!autoLoad || !onLoad || hasLoaded) return undefined;
    setHasLoaded(true);
    onLoad();
    return undefined;
  }, [autoLoad, onLoad, hasLoaded]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of observations) {
      const userId = entry.userId || entry.user_id || entry.student_id || `row-${entry.id}`;
      const studentName =
        `${entry.firstName || entry.first_name || ''} ${entry.lastName || entry.last_name || ''}`.trim() ||
        'n3beur';
      if (!map.has(userId)) {
        map.set(userId, { userId, studentName, entries: [] });
      }
      map.get(userId).entries.push(entry);
    }
    return [...map.values()];
  }, [observations]);

  return (
    <details className="plant-more teacher-observations-panel" open>
      <summary>
        <IconNotebook size={16} /> Carnets des {roleTerms.studentPlural} (max 100 articles)
      </summary>
      <div className="teacher-observations-panel__actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onLoad?.()}
          disabled={obsLoading}
        >
          {obsLoading ? 'Chargement…' : 'Rafraîchir les carnets'}
        </button>
      </div>
      {obsError ? (
        <div className="auth-error">
          <IconWarning size={14} /> {obsError}
        </div>
      ) : null}
      {!obsError && !obsLoading && observations.length === 0 ? (
        <p className="hint" style={{ marginTop: 8 }}>
          {hasLoaded
            ? 'Aucun article dans le périmètre pour le moment.'
            : 'Chargement des carnets…'}
        </p>
      ) : null}
      {groups.length > 0 ? (
        <div className="teacher-observations-panel__list" style={{ marginTop: 8 }}>
          {groups.map((group) => {
            const latest = group.entries[0];
            const zoneLabel = String(latest.zoneName || latest.zone_name || '').trim();
            const dateLabel =
              latest.createdAt || latest.created_at
                ? new Date(latest.createdAt || latest.created_at).toLocaleString('fr-FR')
                : '';
            const title = String(latest.title || '').trim();
            const body = String(latest.bodyMarkdown || latest.content || '').trim();
            const previewHtml = body
              ? renderMarkdownToSafeHtml(body.slice(0, 400), {
                  allowImages: false,
                  allowJournalEmbeds: false,
                })
              : '';
            return (
              <div key={String(group.userId)} className="teacher-observations-panel__group">
                <div style={{ fontSize: 'var(--text-sm)', color: '#374151' }}>
                  <strong>{group.studentName}</strong>
                  {title ? ` · ${title}` : ''}
                  {zoneLabel ? ` · ${zoneLabel}` : ''}
                  {dateLabel ? ` · ${dateLabel}` : ''}
                  {group.entries.length > 1 ? ` · ${group.entries.length} articles` : ''}
                </div>
                {previewHtml ? (
                  <div
                    className="fm-journal-markdown teacher-observations-panel__preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <div className="teacher-observations-panel__preview">—</div>
                )}
                {group.userId && String(group.userId).indexOf('row-') !== 0 ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => setReadUserId(group.userId)}
                  >
                    Lire le carnet
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <UserJournalReadModal
        userId={readUserId}
        open={!!readUserId}
        onClose={() => setReadUserId(null)}
      />
    </details>
  );
}
