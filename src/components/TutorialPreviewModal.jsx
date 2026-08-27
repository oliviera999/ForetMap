import { useMemo } from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { TutorialReadAcknowledgeButton } from './TutorialReadAcknowledge';
import { DialogShell } from './DialogShell';
import { useGatingSummary } from '../hooks/useGatingSummary';

/**
 * Vrai si le chemin de fichier local pointe vers un document que `/api/tutorials/:id/view`
 * ne sait pas rendre (PDF, image, archive…) : ces fichiers restent servis tels quels par le
 * statique `/tutos/`. Une extension absente ou `.html` / `.htm` passe par `/view`.
 * @param {string} filePath
 * @returns {boolean}
 */
function isNonHtmlLocalFilePath(filePath) {
  const clean = String(filePath || '')
    .trim()
    .split(/[?#]/)[0];
  const lastSegment = clean.split('/').pop() || '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) return false; // pas d’extension exploitable : on laisse `/view` tenter le rendu
  return !/\.html?$/i.test(lastSegment);
}

/**
 * Objet tutoriel enrichi pour l’iframe (même logique que l’aperçu liste Tutoriels).
 *
 * Règle d’aiguillage (identique quel que soit `type`, qui n’est qu’un `VARCHAR` libre) :
 * - `type === 'link'` → `source_url` (site externe) ;
 * - contenu local pointant un fichier non-HTML (`/tutos/fiche.pdf`…) → ce fichier statique ;
 * - tout autre contenu local (`html_content` en base ou fichier `.html` / `.htm`)
 *   → `/api/tutorials/:id/view`, seul chemin qui pose les auto-liens de glossaire.
 *
 * `html_content` n’étant pas exposé par la charge utile de liste (`toPublicTutorialRow`),
 * la décision ne repose que sur `type`, `source_file_path` et son extension.
 *
 * @param {object} t
 * @returns {object|null}
 */
export function tutorialPreviewPayload(t) {
  if (!t || t.id == null) return null;
  const filePath = String(t.source_file_path || '').trim();
  let preview_url = '';
  if (t.type === 'link') {
    preview_url = String(t.source_url || '').trim();
  } else if (filePath && isNonHtmlLocalFilePath(filePath)) {
    preview_url = filePath;
  } else {
    preview_url = `/api/tutorials/${t.id}/view`;
  }
  return { ...t, preview_url };
}

/**
 * Indique si la modale peut afficher un document (iframe non vide).
 * Cohérent par construction avec `tutorialPreviewPayload` : hors `type === 'link'`,
 * un tutoriel a toujours une URL d’aperçu (`/view` ou fichier statique non-HTML).
 */
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
  // L'aperçu ne disait rien du contrôle de compréhension : l'élève cliquait
  // « Marquer comme lu » sans savoir qu'une question l'attendait.
  const previewTutorialIds = useMemo(() => {
    const n = Number(tutorial?.id);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  }, [tutorial?.id]);
  const { summaries: gatingSummaries } = useGatingSummary('tutorial', previewTutorialIds);
  useOverlayHistoryBack(!!tutorial, onClose);
  if (!tutorial) return null;
  const source =
    (tutorial.preview_url && String(tutorial.preview_url).trim()) ||
    tutorial.source_file_path ||
    (tutorial.type === 'link' ? String(tutorial.source_url || '').trim() : '') ||
    '';
  const canEmbed = !!source;
  const tutoIdNum = Number(tutorial.id);
  const showReadFooter = readAcknowledge && Number.isFinite(tutoIdNum) && tutoIdNum > 0;
  return (
    <DialogShell
      open={!!tutorial}
      onClose={onClose}
      overlayClassName="modal-overlay modal-overlay--tuto-preview"
      dialogClassName="log-modal tuto-preview-modal"
      ariaLabelledBy="tuto-preview-title"
      closeOnOverlay
    >
      <div className="tuto-preview-modal__head">
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Fermer l’aperçu"
        >
          ✕
        </button>
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
            gatingSummary={gatingSummaries.get(String(tutoIdNum)) || null}
            onAcknowledged={readAcknowledge.onAcknowledged}
            onForceLogout={readAcknowledge.onForceLogout}
          />
        </div>
      ) : null}
    </DialogShell>
  );
}
