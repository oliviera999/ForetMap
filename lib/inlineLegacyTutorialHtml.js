'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { nowIsoUtc } = require('./shared/isoTimestamp');

const ROOT_DIR = path.resolve(__dirname, '..');

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Chemins relatifs site autorisés pour les sources HTML fichier (dossier `tutos/` à la racine du dépôt). */
function isAllowedSourceFilePath(value) {
  const v = normalizeString(value);
  if (!v) return false;
  if (!v.startsWith('/tutos/')) return false;
  if (v.includes('..')) return false;
  return true;
}

/**
 * Vrai si le chemin autorisé pointe vers un fichier HTML (`.html` / `.htm`), seul format
 * incorporable dans `html_content` : un PDF ou une image doit rester servi comme fichier.
 */
function isInlinableHtmlSourceFilePath(value) {
  const v = normalizeString(value);
  if (!isAllowedSourceFilePath(v)) return false;
  const lastSegment = v.split(/[?#]/)[0].split('/').pop() || '';
  return /\.html?$/i.test(lastSegment);
}

function resolveLocalTutorialFile(publicPath) {
  const normalized = normalizeString(publicPath);
  if (!isAllowedSourceFilePath(normalized)) return null;
  const rel = normalized.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT_DIR, rel);
  const allowedRoot = path.resolve(ROOT_DIR, 'tutos');
  if (!absolute.startsWith(allowedRoot)) return null;
  return absolute;
}

/**
 * Pour chaque tutoriel encore référencé par un fichier HTML sous `/tutos/` sans `html_content`,
 * lit le fichier, remplit `html_content` et met `source_file_path` à NULL (même modèle que l’édition « code en base »).
 * Le `type` (simple `VARCHAR` libre) n’est pas filtré — hors `link`, dont l’aperçu pointe le site
 * externe — ni modifié : seul le contenu est rapatrié, pour que tous les tutoriels locaux passent
 * par `/api/tutorials/:id/view` et reçoivent les auto-liens de glossaire.
 * Les fichiers non-HTML (PDF, images…) sont ignorés (comptés dans `skipped`).
 * Idempotent : ignore les lignes qui ont déjà du HTML en base.
 *
 * @param {{ queryAll: Function, execute: Function }} db
 * @returns {Promise<{ applied: number, skipped: number, errors: number }>}
 */
async function inlineLegacyTutorialHtmlToDb(db) {
  const { queryAll, execute } = db || {};
  if (typeof queryAll !== 'function' || typeof execute !== 'function') {
    throw new Error('inlineLegacyTutorialHtmlToDb: queryAll et execute sont requis');
  }
  let rows;
  try {
    rows = await queryAll(
      `SELECT id, title, type, source_file_path FROM tutorials
        WHERE COALESCE(type, '') <> 'link'
          AND source_file_path IS NOT NULL AND CHAR_LENGTH(TRIM(source_file_path)) > 0
          AND (html_content IS NULL OR CHAR_LENGTH(TRIM(COALESCE(html_content, ''))) = 0)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Incorporation tutoriels legacy : table absente ou requête impossible');
    return { applied: 0, skipped: 0, errors: 0 };
  }
  const now = nowIsoUtc();
  let applied = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of rows) {
    const id = Number(row.id);
    const filePath = row.source_file_path;
    if (!isInlinableHtmlSourceFilePath(filePath)) {
      logger.debug(
        { id, filePath, type: row.type },
        'Source tutoriel non HTML — laissée en fichier servi tel quel',
      );
      skipped += 1;
      continue;
    }
    const abs = resolveLocalTutorialFile(filePath);
    if (!abs || !fs.existsSync(abs)) {
      logger.warn(
        { id, filePath, title: row.title },
        'Fichier tutoriel introuvable — source_file_path conservé',
      );
      skipped += 1;
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      logger.warn({ err, id, filePath }, 'Lecture fichier tutoriel en échec');
      errors += 1;
      continue;
    }
    if (!content || !String(content).trim()) {
      skipped += 1;
      continue;
    }
    try {
      await execute(
        'UPDATE tutorials SET html_content = ?, source_file_path = NULL, updated_at = ? WHERE id = ?',
        [content, now, id],
      );
      applied += 1;
    } catch (err) {
      logger.warn({ err, id }, 'Mise à jour html_content tutoriel en échec');
      errors += 1;
    }
  }
  if (applied > 0) {
    logger.info(
      { applied, skipped, errors },
      'Tutoriels HTML : contenu fichier legacy intégré en base',
    );
  }
  return { applied, skipped, errors };
}

module.exports = {
  inlineLegacyTutorialHtmlToDb,
  resolveLocalTutorialFile,
  isAllowedSourceFilePath,
  isInlinableHtmlSourceFilePath,
};
