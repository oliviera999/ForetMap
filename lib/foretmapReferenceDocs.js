'use strict';

// Documents de référence fonctionnels ForetMap (`docs/reference/foretmap/*.md`),
// en **lecture seule**.
//
// Contrairement au pendant GL (`lib/glReferenceDocs.js`), il n'existe ici aucune
// surcouche en base : les fichiers versionnés dans Git font foi. Consulter la
// documentation depuis l'application évite aux professeurs d'aller la chercher
// dans le dépôt ; l'amender reste un acte de développement.
//
// La couche fichiers est mutualisée avec GL dans `lib/shared/referenceDocsFiles.js`.

const path = require('path');
const {
  isValidReferenceSlug,
  extractMarkdownSummary,
  createReferenceDocsFileReader,
} = require('./shared/referenceDocsFiles');

const REFERENCE_DOCS_DIR = path.join(__dirname, '..', 'docs', 'reference', 'foretmap');

/**
 * Ordre de lecture conseillé, aligné sur le sommaire de `docs/reference/README.md`.
 * Les documents absents de cette liste suivent, par ordre alphabétique de slug.
 */
const READING_ORDER = Object.freeze([
  'presentation',
  'carte-et-zones',
  'plantes-et-biodiversite',
  'taches-tutoriels-et-validation',
  'comptes-roles-et-groupes',
  'visite-et-mascottes',
  'pedagogie-quiz-glossaire-reseau',
  'stats-forum-et-suivi',
]);

const { compareReferenceSlugs, listReferenceDocFileSlugs, readReferenceDocFile } =
  createReferenceDocsFileReader({
    docsDir: REFERENCE_DOCS_DIR,
    readingOrder: READING_ORDER,
  });

/** Sommaire : un descripteur par document, sans le corps Markdown. */
function listReferenceDocs() {
  return listReferenceDocFileSlugs()
    .map((slug) => readReferenceDocFile(slug))
    .filter(Boolean)
    .map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      summary: extractMarkdownSummary(doc.bodyMarkdown),
      updatedAt: doc.updatedAt,
    }));
}

/** Document complet, ou `null` si le slug est invalide ou le fichier absent. */
function getReferenceDoc(slug) {
  if (!isValidReferenceSlug(slug)) return null;
  return readReferenceDocFile(slug);
}

module.exports = {
  REFERENCE_DOCS_DIR,
  READING_ORDER,
  compareReferenceSlugs,
  listReferenceDocs,
  getReferenceDoc,
};
