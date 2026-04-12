import React from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { TutorialReadAcknowledgeButton } from './TutorialReadAcknowledge';

/**
 * Objet tutoriel enrichi pour l’iframe (même logique que l’aperçu liste Tutoriels).
 * @param {object} t
 * @returns {object|null}
 */
export function tutorialPreviewPayload(t) {
  if (!t || t.id == null) return null;
  let preview_url = '';
  if (t.type === 'html') {
    preview_url = `/api/tutorials/${t.id}/view`;
  } else if (t.type === 'link') {
    preview_url = String(t.source_url || '').trim();
  } else {
    const fp = t.source_file_path && String(t.source_file_path).trim();
    preview_url = fp || `/api/tutorials/${t.id}/view`;
  }
  return { ...t, preview_url };
}

/** Indique si la modale peut afficher un document (iframe non vide). */
export function tutorialPreviewCanEmbed(t) {
  const p = tutorialPreviewPayload(t);
  if (!p) return false;
  const source =
    (p.preview_url && String(p.preview_url).trim()) ||
    (p.source_file_path && String(p.source_file_path).trim()) ||
    (p.type === 'link' ? String(p.source_url || '').trim() : '');
  return !!source;
}

/**
 * @param {object} props
 * @param {object|null} props.tutorial
 * @param {() => void} props.onClose
 * @param {{ isRead: boolean, onAcknowledged: (id: number) => void, onForceLogout?: () => void }|null} [props.readAcknowledge] — pied de modale : marquage « lu » avec confirmation (même flux que l’onglet Tutoriels).
 */
export function TutorialPreviewModal({ tutorial, onClose, readAcknowledge = null }) {
  useOverlayHistoryBack(!!tutorial, onClose);
  if (!tutorial) return null;
  const source =
    (tutorial.preview_url && String(tutorial.preview_url).trim()) ||
    tutorial.source_file_path ||
    (tutorial.type === 'link' ? String(tutorial.source_url || '').trim() : '') ||
    '';
  const canEmbed = !!source;
  const tutoIdNum = Number(tutorial.id);
  const showReadFooter =
    readAcknowledge &&
    Number.isFinite(tutoIdNum) &&
    tutoIdNum > 0;
  return (
    <div className="modal-overlay modal-overlay--tuto-preview" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="log-modal tuto-preview-modal" role="dialog" aria-modal="true" aria-labelledby="tuto-preview-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="tuto-preview-modal__head">
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer l’aperçu">✕</button>
          <h3 id="tuto-preview-title">📘 {tutorial.title}</h3>
        </div>
        {canEmbed ? (
          <div className="tuto-preview-modal__body">
            <iframe
              title={`Aperçu : ${tutorial.title}`}
              src={source}
              className="tuto-preview-frame"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        ) : (
          <div className="tuto-preview-modal__body tuto-preview-modal__body--empty">
            <div className="empty" style={{ padding: 18 }}>
              <p>Aperçu non disponible pour ce tutoriel.</p>
            </div>
          </div>
        )}
        {showReadFooter ? (
          <div className="tuto-preview-modal__foot">
            <TutorialReadAcknowledgeButton
              tutorialId={tutoIdNum}
              tutorialTitle={tutorial.title}
              isRead={readAcknowledge.isRead}
              onAcknowledged={readAcknowledge.onAcknowledged}
              onForceLogout={readAcknowledge.onForceLogout}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
