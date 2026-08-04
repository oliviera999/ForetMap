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
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LENGTH = 80;
const MAX_TITLE_LENGTH = 180;
const MAX_BODY_LENGTH = 400000;
const MAX_SUMMARY_LENGTH = 200;

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

function isValidReferenceSlug(value) {
  const slug = String(value || '');
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Titre affiché : premier titre de niveau 1 du Markdown, sinon le slug. */
function extractMarkdownTitle(markdown, fallback = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1].slice(0, MAX_TITLE_LENGTH);
  }
  return String(fallback || '').slice(0, MAX_TITLE_LENGTH);
}

/** Résumé de liste : premier paragraphe utile (ni titre, ni citation, ni séparateur). */
function extractMarkdownSummary(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('>') || line.startsWith('---')) continue;
    if (line.startsWith('|') || line.startsWith('```')) continue;
    const plain = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    if (!plain) continue;
    return plain.length > MAX_SUMMARY_LENGTH
      ? `${plain.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`
      : plain;
  }
  return '';
}

function compareReferenceSlugs(a, b) {
  const rankA = READING_ORDER.indexOf(a);
  const rankB = READING_ORDER.indexOf(b);
  if (rankA !== -1 && rankB !== -1) return rankA - rankB;
  if (rankA !== -1) return -1;
  if (rankB !== -1) return 1;
  return a.localeCompare(b, 'fr');
}

/** Slugs des fichiers présents sur disque. Tableau vide si `docs/reference/gl` n'est pas déployé. */
function listReferenceDocFileSlugs() {
  let entries;
  try {
    entries = fs.readdirSync(REFERENCE_DOCS_DIR);
  } catch (_err) {
    return [];
  }
  return entries
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .map((name) => name.slice(0, -3))
    .filter(isValidReferenceSlug)
    .sort(compareReferenceSlugs);
}

/** Contenu du fichier Git, ou `null` s'il n'existe pas (ou n'est pas déployé). */
function readReferenceDocFile(slug) {
  if (!isValidReferenceSlug(slug)) return null;
  const filePath = path.join(REFERENCE_DOCS_DIR, `${slug}.md`);
  let bodyMarkdown;
  let stats;
  try {
    bodyMarkdown = fs.readFileSync(filePath, 'utf8');
    stats = fs.statSync(filePath);
  } catch (_err) {
    return null;
  }
  return {
    slug,
    title: extractMarkdownTitle(bodyMarkdown, slug),
    bodyMarkdown,
    updatedAt: stats ? new Date(stats.mtimeMs).toISOString() : null,
  };
}

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
