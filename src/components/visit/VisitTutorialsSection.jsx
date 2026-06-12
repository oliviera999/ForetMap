import React, { useEffect, useState } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { TutorialReadAcknowledgeButton } from '../TutorialReadAcknowledge';
import { tutorialPreviewPayload, tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import { ContextComments } from '../context-comments';

/**
 * Section « Tutoriels de la visite » sous la carte (réservée prof en édition),
 * extraite de `VisitView` (O6) : sélection des tutoriels affichés en visite
 * (PUT `/api/visit/tutorials`) + grille de lecture (aperçu, PDF, accusé de lecture,
 * commentaires). Comportement inchangé (déplacement pur) — la sélection est
 * réalignée sur `tutorials` à chaque rechargement du contenu visite.
 */
export function VisitTutorialsSection({
  visitImmersion = false,
  title,
  emptyText,
  isTeacher = false,
  availableTutorials = [],
  /** Tutoriels actuellement sélectionnés pour la visite (`content.tutorials`). */
  tutorials = [],
  mapId,
  onSaved,
  onForceLogout,
  tutorialReadIds,
  onTutorialAcknowledged,
  onOpenTutorialPreview,
  contextCommentsEnabled = false,
  studentId = null,
  canParticipateContextComments = true,
}) {
  const [tutorialSelection, setTutorialSelection] = useState(() => (tutorials || []).map((t) => t.id));
  const [savingTutorials, setSavingTutorials] = useState(false);

  useEffect(() => {
    setTutorialSelection((tutorials || []).map((t) => t.id));
  }, [tutorials]);

  const saveTutorialSelection = async () => {
    setSavingTutorials(true);
    try {
      await api('/api/visit/tutorials', 'PUT', { map_id: mapId, tutorial_ids: tutorialSelection });
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur sauvegarde tutoriels');
    } finally {
      setSavingTutorials(false);
    }
  };

  const visitTutorialsBody = (
    <>
      {isTeacher && (
        <div className="visit-tutorial-picker">
          <p>Choisir les tutoriels affichés en visite (indépendamment des zones/repères) :</p>
          <div className="visit-tutorial-picker-list">
            {availableTutorials.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={tutorialSelection.includes(t.id)}
                  onChange={(e) => {
                    setTutorialSelection((prev) => (
                      e.target.checked
                        ? [...new Set([...prev, t.id])]
                        : prev.filter((id) => id !== t.id)
                    ));
                  }}
                />
                {' '}{t.title}
              </label>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={saveTutorialSelection} disabled={savingTutorials}>
            {savingTutorials ? 'Sauvegarde...' : '💾 Enregistrer la sélection des tutos'}
          </button>
        </div>
      )}
      {(tutorials || []).length === 0 ? (
        <p className="section-sub">{emptyText}</p>
      ) : (
        <div className="tuto-grid">
          {(tutorials || []).map((t) => (
            <article key={t.id} className="tuto-card">
              <div className="tuto-card-head">
                <h3>{t.title}</h3>
                <span className="task-chip">{String(t.type || 'html').toUpperCase()}</span>
              </div>
              {t.summary && <p>{t.summary}</p>}
              <div className="task-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!tutorialPreviewCanEmbed(t)}
                  title={!tutorialPreviewCanEmbed(t) ? 'Aperçu indisponible pour ce tutoriel' : undefined}
                  onClick={() => onOpenTutorialPreview(tutorialPreviewPayload(t))}
                >
                  👁️ Lire
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => window.open(`/api/tutorials/${t.id}/download/pdf`, '_blank', 'noopener,noreferrer')}>
                  ⬇️ PDF
                </button>
                <TutorialReadAcknowledgeButton
                  tutorialId={t.id}
                  tutorialTitle={t.title}
                  isRead={tutorialReadIds.has(Number(t.id))}
                  onAcknowledged={onTutorialAcknowledged}
                  onForceLogout={onForceLogout}
                />
              </div>
              {contextCommentsEnabled && studentId && (
                <ContextComments
                  contextType="tutorial"
                  contextId={String(t.id)}
                  title="Commentaires sur ce tutoriel"
                  placeholder="Question ou retour sur ce tutoriel…"
                  canParticipateContextComments={canParticipateContextComments}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );

  if (visitImmersion) {
    return (
      <details className="visit-tutorials-disclosure" data-testid="visit-map-tutorials-section">
        <summary className="visit-tutorials-disclosure__summary">{title}</summary>
        <div className="visit-tutorials-disclosure__body">
          <section className="visit-tutorials visit-tutorials--in-disclosure">
            {visitTutorialsBody}
          </section>
        </div>
      </details>
    );
  }
  return (
    <section className="visit-tutorials" data-testid="visit-map-tutorials-section">
      <h3>{title}</h3>
      {visitTutorialsBody}
    </section>
  );
}
