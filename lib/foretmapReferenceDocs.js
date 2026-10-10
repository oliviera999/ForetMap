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
  'guide-du-prof',
  'carte-et-zones',
  'plantes-et-biodiversite',
  'niveaux-pedagogiques-biodiversite',
  'taches-tutoriels-et-validation',
  'comptes-roles-et-groupes',
  'double-authentification',
  'visite-et-mascottes',
  'pedagogie-quiz-glossaire-reseau',
  'stats-forum-et-suivi',
  'rentree-moodle',
]);

const { compareReferenceSlugs, listReferenceDocFileSlugs, readReferenceDocFile } =
  createReferenceDocsFileReader({
    docsDir: REFERENCE_DOCS_DIR,
    readingOrder: READING_ORDER,
  });

/**
 * Documents ouverts au détenteur de `reference_docs.teacher_guide.read` seul. Écrits pour
 * les n3boss, sans les points d'attention d'exploitation des autres documents.
 */
const TEACHER_GUIDE_SLUGS = Object.freeze(['guide-du-prof']);

/**
 * Périmètre de lecture d'un compte : `'all'`, `'teacher'` (guide du prof seul) ou `null`.
 * @param {(permissionKey: string) => boolean} can
 */
function referenceDocsScopeFor(can) {
  if (can('admin.settings.read')) return 'all';
  if (can('reference_docs.teacher_guide.read')) return 'teacher';
  return null;
}

function isSlugInScope(slug, scope) {
  if (scope === 'all') return true;
  if (scope === 'teacher') return TEACHER_GUIDE_SLUGS.includes(slug);
  return false;
}

/** Sommaire : un descripteur par document, sans le corps Markdown. */
function listReferenceDocs({ scope = 'all' } = {}) {
  return listReferenceDocFileSlugs()
    .filter((slug) => isSlugInScope(slug, scope))
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
function getReferenceDoc(slug, { scope = 'all' } = {}) {
  if (!isValidReferenceSlug(slug)) return null;
  if (!isSlugInScope(slug, scope)) return null;
  return readReferenceDocFile(slug);
}

module.exports = {
  REFERENCE_DOCS_DIR,
  READING_ORDER,
  TEACHER_GUIDE_SLUGS,
  referenceDocsScopeFor,
  compareReferenceSlugs,
  listReferenceDocs,
  getReferenceDoc,
};
