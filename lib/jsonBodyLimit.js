'use strict';

/**
 * Limites de corps JSON / urlencoded (pression mémoire LVE).
 *
 * `express.json` **bufferise tout le corps avant de parser** : une requête de 25 Mo coûte
 * le Buffer, sa conversion en chaîne, puis les objets construits par `JSON.parse` — soit un
 * pic transitoire de l'ordre de 75 à 100 Mo, sur un process dont la RSS de repos tourne
 * autour de 120 Mo. Sur mutualisé (CloudLinux LVE), la mémoire est le premier critère
 * d'arrêt forcé : deux requêtes concurrentes suffisent à provoquer le kill, et donc la
 * fenêtre d'indisponibilité qui va avec.
 *
 * La limite haute était montée sur des **préfixes entiers** (`/api/tasks`, `/api/zones`,
 * `/api/settings`…), si bien que valider une tâche ou poster un message ouvrait la porte à
 * 25 Mo. Trois niveaux la remplacent, du plus large au plus étroit :
 *
 * | Niveau      | Défaut | Pour quoi                                                        |
 * | ----------- | ------ | ---------------------------------------------------------------- |
 * | `import`    | 25 Mo  | imports tableur, packs mascotte, bibliothèque média, image de carte |
 * | `content`   | 8 Mo   | contenu utilisateur avec photos (forum, commentaires, observations, photos de zones/repères) |
 * | défaut      | 2 Mo   | tout le reste — polling, auth, mutations ordinaires              |
 *
 * L'ordre de montage compte : le préfixe le plus spécifique d'abord, car `body-parser`
 * pose `req._body` et le parser suivant n'intervient plus.
 */

const express = require('express');
const logger = require('./logger');

function normalizeLimit(raw, fallback) {
  const s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  return s || fallback;
}

/** Défaut global (polling, auth, mutations ordinaires) — `FORETMAP_JSON_BODY_LIMIT`. */
function defaultJsonBodyLimit() {
  return normalizeLimit(process.env.FORETMAP_JSON_BODY_LIMIT, '2mb');
}

/** Imports et packs — `FORETMAP_JSON_BODY_LIMIT_LARGE`. */
function largeJsonBodyLimit() {
  return normalizeLimit(process.env.FORETMAP_JSON_BODY_LIMIT_LARGE, '25mb');
}

/** Contenu utilisateur illustré — `FORETMAP_JSON_BODY_LIMIT_CONTENT`. */
function contentJsonBodyLimit() {
  return normalizeLimit(process.env.FORETMAP_JSON_BODY_LIMIT_CONTENT, '8mb');
}

/**
 * Chemins qui portent réellement des lots volumineux. Montés **avant** les préfixes de
 * contenu : `/api/students/import` doit gagner sur `/api/students`.
 */
const IMPORT_JSON_PATH_PREFIXES = [
  '/api/students/import',
  '/api/tasks/import',
  '/api/plants/import',
  '/api/tutorials/import',
  '/api/media-library',
  '/api/quiz',
  '/api/visit/mascot-packs',
  '/api/settings/admin/maps',
  '/api/gl/mascots',
  '/api/gl/chapters',
];

/**
 * Chemins où l'utilisateur joint des photos : jusqu'à trois images par message
 * (`lib/userContentImages.js`), plus les photos de zones et de repères.
 */
const CONTENT_JSON_PATH_PREFIXES = [
  '/api/forum',
  '/api/context-comments',
  '/api/observations',
  '/api/zones',
  '/api/map',
  '/api/plants',
  '/api/visit',
  '/api/students',
  '/api/settings',
  '/api/tutorials',
  '/api/gl',
];

function jsonParser(limit) {
  return express.json({ limit });
}

function urlencodedParser(limit) {
  return express.urlencoded({ extended: true, limit });
}

/**
 * Niveau applicable à un chemin — exposé pour les tests et pour diagnostiquer un 413.
 * @param {string} pathname
 * @returns {'import'|'content'|'default'}
 */
function resolveJsonBodyTier(pathname) {
  const p = String(pathname || '').split('?')[0];
  const matches = (prefix) => p === prefix || p.startsWith(`${prefix}/`);
  if (IMPORT_JSON_PATH_PREFIXES.some(matches)) return 'import';
  if (CONTENT_JSON_PATH_PREFIXES.some(matches)) return 'content';
  return 'default';
}

/**
 * Monte les parsers du plus spécifique au plus général, puis le défaut global.
 * @param {import('express').Express} app
 */
function mountJsonBodyParsers(app) {
  const large = largeJsonBodyLimit();
  const content = contentJsonBodyLimit();
  const def = defaultJsonBodyLimit();
  for (const prefix of IMPORT_JSON_PATH_PREFIXES) {
    app.use(prefix, jsonParser(large), urlencodedParser(large));
  }
  for (const prefix of CONTENT_JSON_PATH_PREFIXES) {
    app.use(prefix, jsonParser(content), urlencodedParser(content));
  }
  app.use(jsonParser(def));
  app.use(urlencodedParser(def));
  logger.debug(
    { defaultLimit: def, contentLimit: content, importLimit: large },
    'Limites de corps JSON montées',
  );
  return { defaultLimit: def, contentLimit: content, largeLimit: large };
}

module.exports = {
  defaultJsonBodyLimit,
  contentJsonBodyLimit,
  largeJsonBodyLimit,
  IMPORT_JSON_PATH_PREFIXES,
  CONTENT_JSON_PATH_PREFIXES,
  resolveJsonBodyTier,
  jsonParser,
  urlencodedParser,
  mountJsonBodyParsers,
};
