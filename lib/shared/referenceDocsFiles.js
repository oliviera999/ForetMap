'use strict';

// Noyau partagé ForetMap / GL : lecture des documents de référence fonctionnels
// (`docs/reference/<produit>/*.md`) depuis le dépôt.
//
// Cette couche ne connaît que le **système de fichiers** : lister les slugs
// disponibles, lire un document, en extraire titre et résumé, et les ordonner
// selon un sommaire de lecture. Elle est identique pour les deux produits —
// seuls le répertoire et l'ordre de lecture varient, et sont donc injectés.
//
// Ce qui reste **hors** de ce noyau, délibérément : la couche de surcouche en
// base (édition dans l'application). GL la possède, ForetMap la consulte en
// lecture seule — on factorise le noyau, pas la plomberie.
//
// Consommateurs : `lib/glReferenceDocs.js`, `lib/foretmapReferenceDocs.js`.

const fs = require('fs');
const path = require('path');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;
const MAX_TITLE_LENGTH = 180;
const MAX_SUMMARY_LENGTH = 200;

/** Un slug est un nom de fichier sûr : kebab-case, borné, sans séparateur de chemin. */
function isValidReferenceSlug(value) {
  const slug = String(value || '');
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Titre affiché : premier titre de niveau 1 du Markdown, sinon le repli fourni. */
function extractMarkdownTitle(markdown, fallback = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1].slice(0, MAX_TITLE_LENGTH);
  }
  return String(fallback || '').slice(0, MAX_TITLE_LENGTH);
}

/** Résumé de liste : premier paragraphe utile (ni titre, ni citation, ni tableau, ni code). */
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

/**
 * Construit un lecteur de documents de référence pour un produit.
 *
 * @param {object} options
 * @param {string} options.docsDir répertoire absolu des `.md`
 * @param {string[]} [options.readingOrder] sommaire conseillé ; les documents absents
 *   de cette liste suivent, par ordre alphabétique de slug (locale `fr`)
 */
function createReferenceDocsFileReader({ docsDir, readingOrder = [] }) {
  const order = Array.isArray(readingOrder) ? readingOrder : [];

  function compareReferenceSlugs(a, b) {
    const rankA = order.indexOf(a);
    const rankB = order.indexOf(b);
    if (rankA !== -1 && rankB !== -1) return rankA - rankB;
    if (rankA !== -1) return -1;
    if (rankB !== -1) return 1;
    return a.localeCompare(b, 'fr');
  }

  /** Slugs présents sur disque. Tableau vide si le répertoire n'est pas déployé. */
  function listReferenceDocFileSlugs() {
    let entries;
    try {
      entries = fs.readdirSync(docsDir);
    } catch (_err) {
      return [];
    }
    return entries
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => name.slice(0, -3))
      .filter(isValidReferenceSlug)
      .sort(compareReferenceSlugs);
  }

  /** Contenu du fichier versionné, ou `null` s'il n'existe pas (ou n'est pas déployé). */
  function readReferenceDocFile(slug) {
    if (!isValidReferenceSlug(slug)) return null;
    const filePath = path.join(docsDir, `${slug}.md`);
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

  return { compareReferenceSlugs, listReferenceDocFileSlugs, readReferenceDocFile };
}

module.exports = {
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  isValidReferenceSlug,
  extractMarkdownTitle,
  extractMarkdownSummary,
  createReferenceDocsFileReader,
};
