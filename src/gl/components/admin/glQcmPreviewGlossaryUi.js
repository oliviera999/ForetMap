import { GLGlossaryInlineText } from '../GLGlossaryMarkdown.jsx';
import { GLLoreGlossaryInlineText } from '../GLLoreGlossaryMarkdown.jsx';
import { mergeGlossaryLinkItems } from '../../../utils/glGlossaryAutolink.js';
import { mergeLoreGlossaryLinkItems } from '../../../utils/glLoreGlossaryAutolink.js';

/**
 * Adaptateur glossaire G&L pour la modale d'aperçu QCM partagée (`QcmPreviewModal`) :
 * autoliens glossaire biome / lexique lore et fusion dédoublonnée des termes liés.
 * Injecté par `GLQcmPreviewModal` et `GLQcmCatalogPanel` — le module partagé n'importe
 * ainsi aucun code G&L.
 * @type {import('../../../shared/qcm/QcmPreviewModal.jsx').QcmPreviewGlossaryUi}
 */
export const GL_QCM_PREVIEW_GLOSSARY_UI = Object.freeze({
  GlossaryInlineText: GLGlossaryInlineText,
  LoreGlossaryInlineText: GLLoreGlossaryInlineText,
  mergeGlossaryLinkItems,
  mergeLoreGlossaryLinkItems,
});
