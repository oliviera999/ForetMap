'use strict';

/**
 * Documentation de référence fonctionnelle GL (`docs/reference/gl/*.md`) — lecture et
 * édition depuis l'onglet « Contenus » de l'application.
 *
 * Ces documents décrivent les composantes du jeu en français simple, sans jargon ; ils
 * s'adressent aux professeurs, MJ et administrateurs (cf. `docs/reference/README.md`).
 *
 * Stockage à deux étages, volontairement non destructif :
 *  - le **fichier Markdown versionné dans Git** reste la base de référence, et le seul
 *    contenu servi tant que personne n'a édité le document depuis l'application ;
 *  - la table **`gl_reference_docs`** porte une **surcouche** : les modifications faites
 *    dans l'application y atterrissent, et survivent donc aux déploiements (qui, eux,
 *    réécrivent les fichiers du dépôt).
 *
 * Conséquences voulues :
 *  - « Réinitialiser » supprime la surcouche et rend la main au fichier Git ;
 *  - le fichier n'est jamais réécrit par le serveur — pour reverser une modification dans
 *    Git, l'interface propose de télécharger le `.md` et de le commiter.
 */

const fs = require('fs');
const path = require('path');
const { queryAll, queryOne, execute } = require('../database');

/** Dossier des docs de référence GL. Absent d'un déploiement « runtime » sans `docs/` : toléré. */
const REFERENCE_DOCS_DIR = path.join(__dirname, '..', 'docs', 'reference', 'gl');

/** Slug = nom de fichier sans `.md`. Restreint pour interdire toute traversée de chemin. */

const MAX_BODY_LENGTH = 400000;

/**
 * Ordre de lecture conseillé (sommaire de `docs/reference/README.md`). Les documents
 * absents de cette liste suivent, par ordre alphabétique de slug.
 */
const READING_ORDER = Object.freeze([
  'presentation',
  'lore-deux-peuples',
  'roles-et-connexion',
  'chapitres-et-progression',
  'carte-du-royaume',
  'economie-marche-sorts',
  'qcm-et-pedagogie',
  'guide-du-mj',
]);

const {
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  isValidReferenceSlug,
  extractMarkdownTitle,
  extractMarkdownSummary,
  createReferenceDocsFileReader,
} = require('./shared/referenceDocsFiles');

// Couche fichiers déléguée au noyau partagé (identique côté ForetMap) ; seuls le
// répertoire et le sommaire de lecture sont propres à GL.
const { compareReferenceSlugs, listReferenceDocFileSlugs, readReferenceDocFile } =
  createReferenceDocsFileReader({
    docsDir: REFERENCE_DOCS_DIR,
    readingOrder: READING_ORDER,
  });

function mapOverrideRow(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title || '',
    bodyMarkdown: row.body_markdown || '',
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

async function readReferenceDocOverride(slug) {
  if (!isValidReferenceSlug(slug)) return null;
  const row = await queryOne(
    `SELECT slug, title, body_markdown, updated_by, updated_at
       FROM gl_reference_docs
      WHERE slug = ?
      LIMIT 1`,
    [slug],
  );
  return mapOverrideRow(row);
}

async function listReferenceDocOverrides() {
  const rows = await queryAll(
    `SELECT slug, title, body_markdown, updated_by, updated_at
       FROM gl_reference_docs`,
  );
  return (Array.isArray(rows) ? rows : []).map(mapOverrideRow).filter(Boolean);
}

/**
 * Fusionne fichier Git et surcouche base en une fiche unique.
 * Pure (testable sans base) : `fileDoc` et `override` peuvent chacun être `null`.
 */
function mergeReferenceDoc(slug, fileDoc, override) {
  const bodyMarkdown = override ? override.bodyMarkdown : fileDoc?.bodyMarkdown || '';
  return {
    slug,
    title: override?.title || fileDoc?.title || slug,
    bodyMarkdown,
    summary: extractMarkdownSummary(bodyMarkdown),
    charCount: bodyMarkdown.length,
    // `edited` : le document a été modifié depuis l'application, il ne reflète plus le fichier Git.
    edited: Boolean(override),
    source: override ? 'db' : 'file',
    fileAvailable: Boolean(fileDoc),
    updatedAt: override?.updatedAt || fileDoc?.updatedAt || null,
    updatedBy: override?.updatedBy || null,
  };
}

/** Fiche complète (avec Markdown) d'un document, ou `null` s'il n'existe ni en base ni sur disque. */
async function getReferenceDoc(slug) {
  if (!isValidReferenceSlug(slug)) return null;
  const [fileDoc, override] = [readReferenceDocFile(slug), await readReferenceDocOverride(slug)];
  if (!fileDoc && !override) return null;
  return mergeReferenceDoc(slug, fileDoc, override);
}

/** Liste allégée (sans Markdown) pour l'index de l'onglet. */
async function listReferenceDocs() {
  const overrides = await listReferenceDocOverrides();
  const overrideBySlug = new Map(overrides.map((item) => [item.slug, item]));
  const slugs = new Set(listReferenceDocFileSlugs());
  // Un document édité puis retiré du dépôt reste listé : la surcouche fait foi.
  for (const slug of overrideBySlug.keys()) slugs.add(slug);
  return [...slugs].sort(compareReferenceSlugs).map((slug) => {
    const doc = mergeReferenceDoc(slug, readReferenceDocFile(slug), overrideBySlug.get(slug));
    const { bodyMarkdown: _body, ...listItem } = doc;
    return listItem;
  });
}

/** Enregistre la surcouche. Renvoie la fiche fusionnée à jour. */
async function saveReferenceDocOverride(slug, { title, bodyMarkdown }, updatedBy) {
  await execute(
    `INSERT INTO gl_reference_docs (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body_markdown = VALUES(body_markdown),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [slug, title, bodyMarkdown, updatedBy == null ? null : String(updatedBy)],
  );
  return getReferenceDoc(slug);
}

/** Supprime la surcouche : le document revient au fichier versionné. */
async function deleteReferenceDocOverride(slug) {
  await execute('DELETE FROM gl_reference_docs WHERE slug = ?', [slug]);
  return getReferenceDoc(slug);
}

module.exports = {
  REFERENCE_DOCS_DIR,
  READING_ORDER,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  isValidReferenceSlug,
  extractMarkdownTitle,
  extractMarkdownSummary,
  compareReferenceSlugs,
  listReferenceDocFileSlugs,
  readReferenceDocFile,
  mergeReferenceDoc,
  getReferenceDoc,
  listReferenceDocs,
  saveReferenceDocOverride,
  deleteReferenceDocOverride,
};
