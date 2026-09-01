import { useCallback, useMemo } from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { TutorialReadAcknowledgeButton } from './TutorialReadAcknowledge';
import { DialogShell } from './DialogShell';
import { useGatingSummary } from '../hooks/useGatingSummary';

/**
 * Vrai si la source de l'aperçu est servie par NOTRE origine (chemin relatif ou URL
 * absolue de même origine). C'est le critère du bac à sable (C5, audit 2026-09) : le
 * contenu de notre origine est assaini côté serveur et affiché SANS `allow-scripts` —
 * la combinaison `allow-same-origin` + `allow-scripts` annulait le sandbox et donnait
 * à une fiche importée l'origine de l'application (jeton en localStorage). Un site
 * externe (`type = 'link'`), lui, garde ses scripts : le navigateur l'isole déjà par
 * son origine propre.
 */
export function isAppOriginPreviewSource(source, appOrigin) {
  const s = String(source || '').trim();
  if (!s) return false;
  try {
    return new URL(s, appOrigin).origin === String(appOrigin || '');
  } catch (_) {
    return false;
  }
}

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

  // Fiche de notre origine : les scripts sont désactivés dans l'iframe (cf.
  // `isAppOriginPreviewSource`), c'est donc le PARENT qui intercepte les clics —
  // auto-liens de glossaire (même message `foretmap:glossary` que l'ancien script
  // injecté : le récepteur d'App.jsx ne change pas) et liens `target="_blank"` ramenés
  // dans l'iframe (comportement historique de la modale).
  const handleAppOriginFrameLoad = useCallback((event) => {
    const frame = event.currentTarget;
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch (_) {
      return; // Origine inattendue : rien à câbler.
    }
    if (!doc) return;
    doc.addEventListener('click', (ev) => {
      const anchor = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!anchor) return;
      const glossaryCode = anchor.classList.contains('fm-glossary-inline-link')
        ? anchor.getAttribute('data-glossary-code')
        : null;
      if (glossaryCode) {
        ev.preventDefault();
        window.postMessage(
          { type: 'foretmap:glossary', code: glossaryCode },
          window.location.origin,
        );
        return;
      }
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href || href.toLowerCase().startsWith('javascript:')) return;
      const target = (anchor.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' || target === '_top') {
        ev.preventDefault();
        frame.contentWindow.location.href = anchor.href;
      }
    });
  }, []);

  if (!tutorial) return null;
  const source =
    (tutorial.preview_url && String(tutorial.preview_url).trim()) ||
    tutorial.source_file_path ||
    (tutorial.type === 'link' ? String(tutorial.source_url || '').trim() : '') ||
    '';
  const canEmbed = !!source;
  const appOriginSource = isAppOriginPreviewSource(source, window.location.origin);
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
            sandbox={
              appOriginSource
                ? 'allow-same-origin allow-popups'
                : 'allow-same-origin allow-scripts allow-popups allow-forms'
            }
            onLoad={appOriginSource ? handleAppOriginFrameLoad : undefined}
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
