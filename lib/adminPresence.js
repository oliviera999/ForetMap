'use strict';

/**
 * Snapshot admin « qui est connecté » — charge légère : refcounts Socket + last_seen SQL.
 * Aucun heartbeat HTTP.
 */

const { queryAll } = require('../database');
const {
  RECENT_WINDOW_MS,
  PRESENCE_STATUS,
  resolvePresenceStatus,
  presenceLabelFr,
} = require('./shared/presenceCore');
const { isProductId } = require('./products');

function displayLabel(row) {
  const name =
    String(row.display_name || '').trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    String(row.pseudo || '').trim() ||
    String(row.email || '').trim();
  return name || String(row.id || row.userId || '?');
}

function buildPresenceRow({ product, userId, userType, status, lastSeen, label, displayName }) {
  return {
    product,
    userId: String(userId),
    userType: userType || null,
    status,
    presence_label: presenceLabelFr(status),
    lastSeen: lastSeen || null,
    label: label || displayName || String(userId),
  };
}

/**
 * @param {{ listOnlineEntries: () => Array<{product: string, userId: string}>, product?: string|null }} opts
 */
async function buildAdminPresenceSnapshot(opts = {}) {
  const listOnlineEntries =
    typeof opts.listOnlineEntries === 'function' ? opts.listOnlineEntries : () => [];
  const productFilter =
    opts.product && isProductId(opts.product) ? String(opts.product).toLowerCase() : null;
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  // Borne passée en `Date` : `users.last_seen` est un DATETIME(3) depuis la migration 254,
  // une chaîne ISO y serait comparée comme du texte et ne filtrerait plus rien.
  const recentCutoff = new Date(nowMs - RECENT_WINDOW_MS);

  /** @type {Map<string, object>} */
  const byKey = new Map();

  const onlineEntries = listOnlineEntries().filter(
    (e) => !productFilter || e.product === productFilter,
  );

  for (const e of onlineEntries) {
    const key = `${e.product}:${e.userId}`;
    byKey.set(
      key,
      buildPresenceRow({
        product: e.product,
        userId: e.userId,
        userType: null,
        status: PRESENCE_STATUS.ONLINE,
        lastSeen: null,
        label: e.userId,
      }),
    );
  }

  // Comptes ForetMap (last_seen : DATETIME(3) UTC depuis la migration 254)
  if (!productFilter || productFilter === 'foret' || productFilter === 'plan') {
    const users = await queryAll(
      `SELECT id, user_type, display_name, pseudo, first_name, last_name, email, last_seen
       FROM users
       WHERE last_seen IS NOT NULL AND last_seen >= ?
       ORDER BY last_seen DESC
       LIMIT 500`,
      [recentCutoff],
    );
    for (const u of users) {
      // Compte canonique : présence socket ForetMap = produit foret (plan n'a pas de socket dédié)
      const product = 'foret';
      if (productFilter && productFilter !== 'foret') continue;
      const key = `${product}:${u.id}`;
      const online = byKey.get(key)?.status === PRESENCE_STATUS.ONLINE;
      const status = resolvePresenceStatus({
        socketConnected: online,
        lastSeen: u.last_seen,
        nowMs,
      });
      if (status === PRESENCE_STATUS.OFFLINE) continue;
      byKey.set(
        key,
        buildPresenceRow({
          product,
          userId: u.id,
          userType: u.user_type,
          status,
          lastSeen: u.last_seen,
          displayName: displayLabel(u),
        }),
      );
    }
  }

  // Joueurs / admins GL (DATETIME last_seen)
  if (!productFilter || productFilter === 'gl') {
    const players = await queryAll(
      `SELECT id, 'gl_player' AS user_type, NULL AS display_name, pseudo,
              NULL AS first_name, NULL AS last_name, NULL AS email, last_seen
       FROM gl_players
       WHERE last_seen IS NOT NULL AND last_seen >= (NOW() - INTERVAL ? SECOND)
       ORDER BY last_seen DESC
       LIMIT 500`,
      [String(Math.ceil(RECENT_WINDOW_MS / 1000))],
    );
    for (const p of players) {
      const product = 'gl';
      const key = `${product}:${p.id}`;
      const online = byKey.get(key)?.status === PRESENCE_STATUS.ONLINE;
      const status = resolvePresenceStatus({
        socketConnected: online,
        lastSeen: p.last_seen,
        nowMs,
      });
      if (status === PRESENCE_STATUS.OFFLINE) continue;
      byKey.set(
        key,
        buildPresenceRow({
          product,
          userId: p.id,
          userType: 'gl_player',
          status,
          lastSeen: p.last_seen,
          displayName: displayLabel(p),
        }),
      );
    }

    try {
      const admins = await queryAll(
        `SELECT id, 'gl_admin' AS user_type, display_name, NULL AS pseudo,
                NULL AS first_name, NULL AS last_name, email, last_seen
         FROM gl_admins
         WHERE last_seen IS NOT NULL AND last_seen >= (NOW() - INTERVAL ? SECOND)
         ORDER BY last_seen DESC
         LIMIT 100`,
        [String(Math.ceil(RECENT_WINDOW_MS / 1000))],
      );
      for (const a of admins) {
        const product = 'gl';
        const key = `${product}:${a.id}`;
        const online = byKey.get(key)?.status === PRESENCE_STATUS.ONLINE;
        const status = resolvePresenceStatus({
          socketConnected: online,
          lastSeen: a.last_seen,
          nowMs,
        });
        if (status === PRESENCE_STATUS.OFFLINE) continue;
        byKey.set(
          key,
          buildPresenceRow({
            product,
            userId: a.id,
            userType: 'gl_admin',
            status,
            lastSeen: a.last_seen,
            displayName: displayLabel(a),
          }),
        );
      }
    } catch (_) {
      // Table gl_admins absente sur certaines bases de test minimalistes.
    }
  }

  // Enrichir les online purs (socket sans ligne SQL récente) avec un libellé minimal
  const users = [...byKey.values()].sort((a, b) => {
    const rank = { online: 0, recent: 1, offline: 2 };
    const d = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (d !== 0) return d;
    return String(a.label).localeCompare(String(b.label), 'fr');
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    recentWindowMs: RECENT_WINDOW_MS,
    counts: {
      online: users.filter((u) => u.status === PRESENCE_STATUS.ONLINE).length,
      recent: users.filter((u) => u.status === PRESENCE_STATUS.RECENT).length,
      total: users.length,
    },
    users,
  };
}

module.exports = {
  buildAdminPresenceSnapshot,
  displayLabel,
};
