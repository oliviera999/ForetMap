'use strict';

/**
 * Compteur d'usage anonyme, commun aux produits (lot 1 du plan de convergence).
 *
 * Principe (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.9) : le client envoie des événements
 * NOMMÉS (`navigator.sendBeacon`), sans identifiant, sans cookie ; le serveur agrège par
 * jour dans `usage_counters (day, product, event, key, count)`. Les noms d'événements sont
 * en liste blanche PAR PRODUIT (sinon rejet), la clé est bornée et normalisée. Ce compteur
 * est volontairement plus pauvre que `GET /api/visit/stats` (sessions, parcours complets,
 * identité élève) : c'est ce qui le rend acceptable partout sans consentement.
 */

const { queryAll, execute } = require('../database');
const { isProductId } = require('./products');

const KEY_MAX_LENGTH = 64;
const BATCH_MAX_EVENTS = 20;

/** Événements autorisés, par produit. Une clé inconnue est rejetée (400), jamais devinée. */
const USAGE_EVENTS = Object.freeze({
  foret: Object.freeze(['open', 'tab_open', 'place_open', 'help_open', 'search_empty']),
  gl: Object.freeze(['open', 'tab_open', 'chapter_open', 'spell_cast', 'help_open']),
  plan: Object.freeze([
    'open',
    'search',
    'search_empty',
    'place_open',
    'locate',
    'go',
    'route_start',
    'route_step',
    'offline_view',
    'help_open',
    // Changement de plan depuis les réglages : dit lesquels des plans publiés servent
    // vraiment, et lequel devrait être celui d'accueil.
    'map_switch',
  ]),
});

/**
 * Clé normalisée : minuscules, espaces réduits, bornée à 64 caractères, sans caractères de
 * contrôle. Vide si absente — une clé n'est jamais obligatoire.
 */
function normalizeUsageKey(raw) {
  return String(raw ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, KEY_MAX_LENGTH);
}

/**
 * Valide et normalise un événement brut.
 * @returns {{ ok: true, value: { product: string, event: string, key: string } } | { ok: false, error: string }}
 */
function normalizeUsageEvent(raw) {
  const product = String(raw?.product || '')
    .trim()
    .toLowerCase();
  if (!isProductId(product) || !USAGE_EVENTS[product]) {
    return { ok: false, error: 'Produit inconnu' };
  }
  const event = String(raw?.event || '')
    .trim()
    .toLowerCase();
  if (!USAGE_EVENTS[product].includes(event)) {
    return { ok: false, error: `Événement inconnu pour ${product}` };
  }
  return { ok: true, value: { product, event, key: normalizeUsageKey(raw?.key) } };
}

/** Jour UTC au format `YYYY-MM-DD`. */
function usageDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Incrémente les compteurs (un INSERT … ON DUPLICATE KEY UPDATE par événement normalisé).
 * @param {Array<{ product: string, event: string, key: string }>} events Déjà normalisés.
 * @param {{ now?: Date }} [options]
 */
async function recordUsageEvents(events, options = {}) {
  const day = usageDay(options.now);
  // Agrégation locale : le même (produit, événement, clé) répété dans un lot ne coûte
  // qu'une requête.
  const totals = new Map();
  for (const ev of events) {
    const id = `${ev.product}\u0000${ev.event}\u0000${ev.key}`;
    totals.set(id, { ...ev, count: (totals.get(id)?.count || 0) + 1 });
  }
  for (const ev of totals.values()) {
    await execute(
      `INSERT INTO usage_counters (day, product, event, \`key\`, count)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
      [day, ev.product, ev.event, ev.key, ev.count],
    );
  }
  return totals.size;
}

/**
 * Compteurs sur une plage de jours (bornes incluses), optionnellement filtrés par produit.
 * @param {{ from: string, to: string, product?: string|null }} params Jours `YYYY-MM-DD`.
 */
async function listUsageCounters({ from, to, product = null }) {
  const params = [from, to];
  let where = 'WHERE day BETWEEN ? AND ?';
  if (product) {
    where += ' AND product = ?';
    params.push(product);
  }
  return queryAll(
    `SELECT day, product, event, \`key\`, count
     FROM usage_counters ${where}
     ORDER BY day DESC, product ASC, event ASC, count DESC, \`key\` ASC`,
    params,
  );
}

module.exports = {
  USAGE_EVENTS,
  KEY_MAX_LENGTH,
  BATCH_MAX_EVENTS,
  normalizeUsageKey,
  normalizeUsageEvent,
  usageDay,
  recordUsageEvents,
  listUsageCounters,
};
