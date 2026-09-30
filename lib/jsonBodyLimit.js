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
 *
 * Audit sécurité du 30/09/2026 (AP10) : le niveau `import` analysait un corps de 25 Mo
 * **avant** le 401 de la route, donc pour n'importe quel anonyme. Il n'est plus appliqué qu'à
 * une requête porteuse d'un jeton Bearer **valide** (signature et expiration vérifiées par le
 * pipeline JWT existant, sans accès base). Sans jeton valide, la requête retombe sur le niveau
 * suivant (`content` ou défaut) : un gros corps anonyme reçoit 413 sans être bufferisé en
 * entier, un petit corps anonyme atteint la route comme avant (qui répond 401/403).
 */

const express = require('express');
const logger = require('./logger');
const { parseBearerToken, verifyJwtToken } = require('./auth/jwtPipeline');

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
  // Observations d'espèces (migration 307) : `POST …/:id/photos { imageData }`. L'ancien
  // `/api/observations` est retiré (410) et n'accepte plus de corps.
  '/api/species-observations',
  '/api/zones',
  '/api/map',
  '/api/plants',
  '/api/visit',
  '/api/students',
  '/api/settings',
  '/api/tutorials',
  '/api/gl',
  // Image de tâche (4 Mo décodés ≈ 5,4 Mo en base64) et photo de rapport ; au niveau par
  // défaut (2 Mo), une image acceptée par la règle métier était refusée en 413 générique.
  '/api/tasks',
  // Avatar (2 Mo décodés ≈ 2,7 Mo en base64) : même incohérence.
  '/api/auth/me/profile',
  // Images du carnet.
  '/api/user-journal',
];

/**
 * Contrôle léger d'authentification : un jeton Bearer bien signé et non expiré (tout produit).
 * Aucune lecture en base : la révocation éventuelle est vérifiée ensuite par la route.
 * @param {import('express').Request} req
 */
function hasValidBearerToken(req) {
  const token = parseBearerToken(req);
  if (!token) return false;
  // Chargement tardif : `requireTeacher` lit `JWT_SECRET` à son import (après dotenv).
  const { JWT_SECRET } = require('../middleware/requireTeacher');
  if (!JWT_SECRET) return false;
  try {
    verifyJwtToken(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

/** N'applique `middleware` qu'aux requêtes authentifiées ; les autres passent au suivant. */
function authenticatedOnly(middleware) {
  return function authenticatedBodyParser(req, res, next) {
    if (!hasValidBearerToken(req)) return next();
    return middleware(req, res, next);
  };
}

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
    app.use(
      prefix,
      authenticatedOnly(jsonParser(large)),
      authenticatedOnly(urlencodedParser(large)),
    );
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
  hasValidBearerToken,
  authenticatedOnly,
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
