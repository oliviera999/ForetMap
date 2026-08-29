'use strict';

/**
 * Limites de corps JSON / urlencoded (pression mémoire LVE).
 * Défaut bas global ; préfixes « médias / imports » relevés via middleware montés
 * **avant** le parser global (body-parser pose `req._body` et saute le second parse).
 */

const express = require('express');

function normalizeLimit(raw, fallback) {
  const s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  return s || fallback;
}

/** Défaut global (polling, auth, etc.) — surcharge `FORETMAP_JSON_BODY_LIMIT`. */
function defaultJsonBodyLimit() {
  return normalizeLimit(process.env.FORETMAP_JSON_BODY_LIMIT, '2mb');
}

/** Préfixes médias / imports — surcharge `FORETMAP_JSON_BODY_LIMIT_LARGE`. */
function largeJsonBodyLimit() {
  return normalizeLimit(process.env.FORETMAP_JSON_BODY_LIMIT_LARGE, '25mb');
}

/**
 * Préfixes montés avec la limite haute (photos base64, imports, packs mascotte…).
 * Doivent être enregistrés **avant** `app.use(express.json({ limit: default }))`.
 */
const LARGE_JSON_PATH_PREFIXES = [
  '/api/visit',
  '/api/forum',
  '/api/context-comments',
  '/api/plants',
  '/api/students',
  '/api/observations',
  '/api/quiz',
  '/api/media-library',
  '/api/zones',
  '/api/map',
  '/api/tasks',
  '/api/settings',
  '/api/gl',
];

function jsonParser(limit) {
  return express.json({ limit });
}

function urlencodedParser(limit) {
  return express.urlencoded({ extended: true, limit });
}

/**
 * Monte les parsers haute limite sur les préfixes, puis le défaut global.
 * @param {import('express').Express} app
 */
function mountJsonBodyParsers(app) {
  const large = largeJsonBodyLimit();
  const def = defaultJsonBodyLimit();
  for (const prefix of LARGE_JSON_PATH_PREFIXES) {
    app.use(prefix, jsonParser(large), urlencodedParser(large));
  }
  app.use(jsonParser(def));
  app.use(urlencodedParser(def));
  return { defaultLimit: def, largeLimit: large };
}

module.exports = {
  defaultJsonBodyLimit,
  largeJsonBodyLimit,
  LARGE_JSON_PATH_PREFIXES,
  jsonParser,
  urlencodedParser,
  mountJsonBodyParsers,
};
