import { GLButton } from '../ui/GLButton.jsx';
import { GLQcmFeedbackBlock } from '../GLQcmFeedbackBlock.jsx';
import { QcmPreviewModal } from '../../../shared/qcm/QcmPreviewModal.jsx';
import { GL_QCM_PREVIEW_GLOSSARY_UI } from './glQcmPreviewGlossaryUi.js';

/**
 * Modale d'aperçu QCM GL — wrapper autour du composant partagé.
 */
export function GLQcmPreviewModal(props) {
  return (
    <QcmPreviewModal
      {...props}
      FeedbackBlock={GLQcmFeedbackBlock}
      Button={GLButton}
      glossaryUi={GL_QCM_PREVIEW_GLOSSARY_UI}
    />
  );
}
