import { useState } from 'react';
import { IconNotebook, IconWarning } from '../../shared/icons.jsx';
import { UserJournalReadModal } from '../journal/UserJournalReadModal.jsx';
import { renderMarkdownToSafeHtml } from '../../shared/platform/markdown.js';

/**
 * Panneau « Carnets des élèves » : fil d’articles récents + lecture complète / export.
 */
export function TeacherObservationsPanel({
  roleTerms,
  observations = [],
  obsLoading = false,
  obsError = '',
  onLoad,
}) {
  const [readUserId, setReadUserId] = useState(null);

  return (
    <details className="plant-more" style={{ marginBottom: 14 }}>
      <summary>
        <IconNotebook size={16} /> Carnets des {roleTerms.studentPlural} (max 100 articles)
      </summary>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onLoad}
            disabled={obsLoading}
          >
            {obsLoading ? 'Chargement…' : 'Charger les carnets'}
          </button>
        </div>
        {obsError && (
          <div className="auth-error">
            <IconWarning size={14} /> {obsError}
          </div>
        )}
        {!obsError && !obsLoading && observations.length === 0 && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            Aucun article chargé (clique sur le bouton pour rafraîchir).
          </p>
        )}
        {observations.length > 0 && (
          <div
            style={{
              maxHeight: 320,
              overflow: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 8,
              background: '#f8fafc',
            }}
          >
            {observations.map((entry) => {
              const studentName =
                `${entry.firstName || entry.first_name || ''} ${entry.lastName || entry.last_name || ''}`.trim() ||
                'n3beur';
              const zoneLabel = String(entry.zoneName || entry.zone_name || '').trim();
              const dateLabel =
                entry.createdAt || entry.created_at
                  ? new Date(entry.createdAt || entry.created_at).toLocaleString('fr-FR')
                  : '';
              const title = String(entry.title || '').trim();
              const body = String(entry.bodyMarkdown || entry.content || '').trim();
              const previewHtml = body
                ? renderMarkdownToSafeHtml(body.slice(0, 400), {
                    allowImages: false,
                    allowJournalEmbeds: false,
                  })
                : '';
              const userId = entry.userId || entry.user_id || entry.student_id;
              return (
                <div
                  key={entry.id}
                  style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', color: '#374151' }}>
                    <strong>{studentName}</strong>
                    {title ? ` · ${title}` : ''}
                    {zoneLabel ? ` · ${zoneLabel}` : ''}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                  </div>
                  {previewHtml ? (
                    <div
                      className="fm-journal-markdown"
                      style={{ fontSize: 'var(--text-sm)', color: '#4b5563', marginTop: 4 }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  ) : (
                    <div style={{ fontSize: 'var(--text-sm)', color: '#4b5563', marginTop: 4 }}>
                      —
                    </div>
                  )}
                  {userId ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 6 }}
                      onClick={() => setReadUserId(userId)}
                    >
                      Lire le carnet
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <UserJournalReadModal
        userId={readUserId}
        open={!!readUserId}
        onClose={() => setReadUserId(null)}
      />
    </details>
  );
}
