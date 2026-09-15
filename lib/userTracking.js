'use strict';

/**
 * Suivi utilisateurs authentifiés (admin) — activité légère + passage multi-produits.
 * Pas d'IP / UA ici (réservés à security_events). Invités → usage_counters anonymes seulement.
 */

const { queryAll, queryOne, execute } = require('../database');
const { isProductId } = require('./products');
const { resolveCanonicalActorId } = require('./auditLog');
const logger = require('./logger');

/** Actions autorisées dans `user_activity_events` (liste blanche stricte). */
const ACTIVITY_ACTIONS = Object.freeze(['session_start', 'login', 'product_open']);

const SESSION_THROTTLE_MS = 60 * 60 * 1000;

/** @type {Map<string, number>} clé `action|product|userKey` → epoch ms */
const activityThrottle = new Map();

function normalizeProduct(raw) {
  const p = String(raw || '')
    .trim()
    .toLowerCase();
  return isProductId(p) ? p : null;
}

function normalizeAction(raw) {
  const a = String(raw || '')
    .trim()
    .toLowerCase();
  return ACTIVITY_ACTIONS.includes(a) ? a : null;
}

function normalizeKey(raw) {
  return String(raw ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 64);
}

function throttleKey(action, product, userKey) {
  return `${action}|${product}|${userKey}`;
}

/**
 * @returns {boolean} true si l'événement doit être ignoré (déjà vu dans la fenêtre)
 */
function isThrottled(action, product, userKey, nowMs = Date.now()) {
  if (action !== 'session_start' && action !== 'product_open') return false;
  const key = throttleKey(action, product, userKey);
  const prev = activityThrottle.get(key);
  return prev != null && nowMs - prev < SESSION_THROTTLE_MS;
}

function markThrottled(action, product, userKey, nowMs = Date.now()) {
  if (action !== 'session_start' && action !== 'product_open') return;
  activityThrottle.set(throttleKey(action, product, userKey), nowMs);
  if (activityThrottle.size > 5000) {
    for (const [k, ts] of activityThrottle) {
      if (nowMs - ts > SESSION_THROTTLE_MS) activityThrottle.delete(k);
    }
  }
}

/** Réinitialise le throttle (tests). */
function resetUserTrackingThrottleForTests() {
  activityThrottle.clear();
}

/**
 * Enregistre un événement d'activité légère (jamais bloquant pour l'appelant).
 * @returns {Promise<boolean>} true si une ligne a été écrite
 */
async function logActivityEvent({
  product,
  action,
  userType = null,
  userId = null,
  canonicalUserId = null,
  key = null,
  skipThrottle = false,
} = {}) {
  const prod = normalizeProduct(product);
  const act = normalizeAction(action);
  if (!prod || !act) return false;
  try {
    const canonical =
      canonicalUserId ||
      (userType && userId ? await resolveCanonicalActorId(userType, userId) : null);
    const userKey = String(canonical || userId || 'anon');
    if (!skipThrottle && isThrottled(act, prod, userKey)) return false;
    await execute(
      `INSERT INTO user_activity_events
        (user_id, user_type, product, action, key_norm, occurred_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [canonical || null, userType || null, prod, act, key ? normalizeKey(key) : null],
    );
    if (!skipThrottle) markThrottled(act, prod, userKey);
    return true;
  } catch (err) {
    logger.warn({ err, product: prod, action: act }, 'Écriture user_activity_events en échec');
    return false;
  }
}

/**
 * Upsert passage identifié (1 ligne / user / produit). Sans compte canonique → no-op.
 */
async function upsertProductVisit({
  product,
  userType = null,
  userId = null,
  canonicalUserId = null,
  incrementOpen = true,
} = {}) {
  const prod = normalizeProduct(product);
  if (!prod) return false;
  try {
    const canonical =
      canonicalUserId ||
      (userType && userId ? await resolveCanonicalActorId(userType, userId) : null);
    if (!canonical) return false;
    if (incrementOpen) {
      await execute(
        `INSERT INTO user_product_visits (user_id, product, first_seen_at, last_seen_at, open_count)
         VALUES (?, ?, NOW(), NOW(), 1)
         ON DUPLICATE KEY UPDATE
           last_seen_at = NOW(),
           open_count = open_count + 1`,
        [canonical, prod],
      );
    } else {
      await execute(
        `INSERT INTO user_product_visits (user_id, product, first_seen_at, last_seen_at, open_count)
         VALUES (?, ?, NOW(), NOW(), 1)
         ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
        [canonical, prod],
      );
    }
    return true;
  } catch (err) {
    logger.warn({ err, product: prod }, 'Upsert user_product_visits en échec');
    return false;
  }
}

/**
 * Point d'entrée unique : login ou première connexion socket (prev === 0).
 */
async function recordAuthenticatedTouch({
  product,
  userType,
  userId,
  action = 'session_start',
} = {}) {
  const prod = normalizeProduct(product) || 'foret';
  const act = normalizeAction(action) || 'session_start';
  try {
    const canonical = await resolveCanonicalActorId(userType, userId);
    const userKey = String(canonical || userId || 'anon');

    if (act === 'login') {
      await upsertProductVisit({
        product: prod,
        userType,
        userId,
        canonicalUserId: canonical,
        incrementOpen: true,
      });
      await logActivityEvent({
        product: prod,
        action: 'login',
        userType,
        userId,
        canonicalUserId: canonical,
        skipThrottle: true,
      });
      markThrottled('session_start', prod, userKey);
      return;
    }

    const throttled = isThrottled('session_start', prod, userKey);
    await upsertProductVisit({
      product: prod,
      userType,
      userId,
      canonicalUserId: canonical,
      incrementOpen: !throttled,
    });
    if (!throttled) {
      await logActivityEvent({
        product: prod,
        action: act,
        userType,
        userId,
        canonicalUserId: canonical,
        skipThrottle: true,
      });
      markThrottled('session_start', prod, userKey);
    }
  } catch (err) {
    logger.warn({ err, product: prod, action: act }, 'recordAuthenticatedTouch en échec');
  }
}

async function listActivityEvents({ from, to, product = null, userId = null, limit = 100 } = {}) {
  const params = [from, to];
  let where = 'WHERE occurred_at >= ? AND occurred_at < DATE_ADD(?, INTERVAL 1 DAY)';
  if (product) {
    where += ' AND product = ?';
    params.push(product);
  }
  if (userId) {
    where += ' AND user_id = ?';
    params.push(userId);
  }
  const lim = Math.max(1, Math.min(Number(limit) || 100, 200));
  params.push(String(lim));
  return queryAll(
    `SELECT id, user_id, user_type, product, action, key_norm, occurred_at
     FROM user_activity_events
     ${where}
     ORDER BY occurred_at DESC, id DESC
     LIMIT ?`,
    params,
  );
}

/**
 * Agrégats de passage identifié + croisement multi-produits.
 */
async function listUserPassageSummary({ from, to, product = null } = {}) {
  const rangeParams = [from, to];
  const productClause = product ? ' AND product = ?' : '';
  const visitProductClause = product ? ' AND v.product = ?' : '';
  if (product) rangeParams.push(product);

  const byProduct = await queryAll(
    `SELECT product,
            COUNT(*) AS users,
            COALESCE(SUM(open_count), 0) AS opens,
            SUM(
              CASE
                WHEN last_seen_at >= ? AND last_seen_at < DATE_ADD(?, INTERVAL 1 DAY) THEN 1
                ELSE 0
              END
            ) AS active_in_range
     FROM user_product_visits
     WHERE 1 = 1${productClause}
     GROUP BY product
     ORDER BY product ASC`,
    product ? [from, to, product] : [from, to],
  );

  const multi = await queryOne(
    `SELECT COUNT(*) AS n FROM (
       SELECT user_id
       FROM user_product_visits
       WHERE last_seen_at >= ? AND last_seen_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY user_id
       HAVING COUNT(DISTINCT product) >= 2
     ) t`,
    [from, to],
  );

  const recent = await queryAll(
    `SELECT v.user_id, v.product, v.first_seen_at, v.last_seen_at, v.open_count,
            u.user_type, u.display_name, u.pseudo, u.first_name, u.last_name
     FROM user_product_visits v
     LEFT JOIN users u ON u.id = v.user_id
     WHERE v.last_seen_at >= ? AND v.last_seen_at < DATE_ADD(?, INTERVAL 1 DAY)
     ${visitProductClause}
     ORDER BY v.last_seen_at DESC
     LIMIT 100`,
    rangeParams,
  );

  return {
    byProduct: byProduct.map((r) => ({
      product: r.product,
      users: Number(r.users) || 0,
      opens: Number(r.opens) || 0,
      activeInRange: Number(r.active_in_range) || 0,
    })),
    multiProductUsers: Number(multi?.n) || 0,
    recent,
  };
}

module.exports = {
  ACTIVITY_ACTIONS,
  SESSION_THROTTLE_MS,
  normalizeProduct,
  normalizeAction,
  logActivityEvent,
  upsertProductVisit,
  recordAuthenticatedTouch,
  listActivityEvents,
  listUserPassageSummary,
  resetUserTrackingThrottleForTests,
  isThrottled,
  markThrottled,
};
