'use strict';

/**
 * Lecture filtrée et enrichie des deux journaux (`audit_log`, `security_events`).
 *
 * Les deux tables partagent l'essentiel de leurs colonnes (action, acteur, cible, résultat,
 * charge JSON) ; elles diffèrent par leur horodatage de référence et quelques colonnes
 * propres. Une « source » décrit ces différences pour qu'un seul constructeur de requête
 * serve l'historique, le journal de sécurité et l'onglet « Utilisateurs » :
 *
 * - `audit`    : `audit_log`, horodatage `created_at` (UTC, indexé), colonne `details` ;
 * - `security` : `security_events`, horodatage `occurred_at` (heure locale serveur, indexé),
 *   colonnes `reason`, `ip_address`, `user_agent`. Réservé à `audit.security.read`.
 *
 * Chaque ligne est enrichie : libellé, catégorie et niveau « principal » de l'action
 * (`./catalog`), nom lisible de l'acteur et de la cible (lookup groupé, jamais une requête
 * par ligne), charge JSON décodée, canal (`via`) et compte contrôlé (`on_behalf_of`).
 * Toutes les requêtes sont paramétrées ; les seuls fragments interpolés sont des noms de
 * colonnes/tables issus de listes fermées ci-dessous.
 */

const { queryAll, queryOne } = require('../../database');
const {
  describeAction,
  isMajorAction,
  categoryOf,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  reasonLabel,
} = require('./catalog');

const SOURCES = Object.freeze({
  audit: Object.freeze({
    table: 'audit_log',
    timeCol: 'created_at',
    // `created_at` est de l'UTC : les bornes jour sont comparées telles quelles.
    columns:
      'id, created_at AS occurred_at, action, target_type, target_id, details, ' +
      'actor_user_type, actor_user_id, result, payload_json',
    searchCols: ['details', 'target_id', 'action'],
    hasIp: false,
  }),
  security: Object.freeze({
    table: 'security_events',
    timeCol: 'occurred_at',
    columns:
      'id, occurred_at, action, target_type, target_id, actor_user_type, actor_user_id, ' +
      'result, reason, ip_address, user_agent, payload_json',
    searchCols: ['reason', 'target_id', 'action', 'user_agent'],
    hasIp: true,
  }),
});

const USER_TARGET_TYPES = Object.freeze(['user', 'student', 'teacher', 'admin', 'auth', 'staff']);

/**
 * Résolution du nom d'une cible : table + colonne libellé. `CAST(id AS CHAR)` évite qu'un
 * identifiant UUID comparé à une clé entière (`'13c1…' = 13`) ne désigne une mauvaise ligne.
 */
const TARGET_RESOLVERS = Object.freeze({
  task: { table: 'tasks', label: 'title' },
  task_project: { table: 'task_projects', label: 'title' },
  zone: { table: 'zones', label: 'name' },
  plant: { table: 'plants', label: 'name' },
  marker: { table: 'map_markers', label: 'label' },
  map: { table: 'maps', label: 'label' },
  location_category: { table: 'location_categories', label: 'label' },
  role: { table: 'roles', label: 'display_name' },
  group: { table: 'groups', label: 'name' },
  tutorial: { table: 'tutorials', label: 'title' },
  forum_thread: { table: 'forum_threads', label: 'title' },
  map_route: { table: 'map_routes', label: 'title' },
});

/** `?, ?, ?` pour une liste (les requêtes préparées n'étendent pas un tableau dans `IN (?)`). */
function marks(list) {
  return list.map(() => '?').join(', ');
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

function parsePayload(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

function getSource(name) {
  return SOURCES[name] || SOURCES.audit;
}

/** Actions distinctes présentes sur la période (sert aux filtres catégorie / principaux). */
async function distinctActions(src, from, to) {
  const rows = await queryAll(
    `SELECT DISTINCT action FROM ${src.table}
      WHERE ${src.timeCol} >= ? AND ${src.timeCol} < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
  return rows.map((r) => String(r.action));
}

/**
 * Clause WHERE paramétrée commune.
 * @param {object} src source (`SOURCES.*`)
 * @param {object} f filtres normalisés
 * @param {string[]|null} actions actions distinctes de la période (requis si catégorie / mode)
 */
function buildWhere(src, f, actions) {
  const clauses = [`${src.timeCol} >= ?`, `${src.timeCol} < DATE_ADD(?, INTERVAL 1 DAY)`];
  const params = [f.from, f.to];
  if (f.actorUserId) {
    clauses.push('actor_user_id = ?');
    params.push(f.actorUserId);
  }
  if (f.actorType) {
    clauses.push('actor_user_type = ?');
    params.push(f.actorType);
  }
  if (f.actorQuery) {
    const like = `%${escapeLike(f.actorQuery)}%`;
    clauses.push(
      `actor_user_id IN (SELECT id FROM users
         WHERE display_name LIKE ? OR pseudo LIKE ? OR first_name LIKE ? OR last_name LIKE ?
            OR CONCAT_WS(' ', first_name, last_name) LIKE ?)`,
    );
    params.push(like, like, like, like, like);
  }
  if (f.targetId) {
    clauses.push('target_id = ?');
    params.push(f.targetId);
  }
  if (f.targetType) {
    clauses.push('target_type = ?');
    params.push(f.targetType);
  }
  if (f.action) {
    clauses.push('action LIKE ?');
    params.push(`${escapeLike(f.action)}%`);
  }
  if (f.result) {
    if (f.result === 'failure') {
      clauses.push("COALESCE(result, 'success') <> 'success'");
    } else {
      clauses.push('result = ?');
      params.push(f.result);
    }
  }
  if (f.ip && src.hasIp) {
    clauses.push('ip_address LIKE ?');
    params.push(`${escapeLike(f.ip)}%`);
  }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    clauses.push(`(${src.searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (let i = 0; i < src.searchCols.length; i += 1) params.push(like);
  }
  if (f.category && actions) {
    const inCat = actions.filter((a) => categoryOf(a) === f.category);
    if (!inCat.length) clauses.push('1 = 0');
    else {
      clauses.push(`action IN (${marks(inCat)})`);
      params.push(...inCat);
    }
  }
  if (f.mode === 'main' && actions) {
    const major = actions.filter((a) => isMajorAction(a));
    if (major.length) {
      clauses.push(`(action IN (${marks(major)}) OR COALESCE(result, 'success') <> 'success')`);
      params.push(...major);
    } else {
      clauses.push("COALESCE(result, 'success') <> 'success'");
    }
  }
  return { whereSql: clauses.join(' AND '), params };
}

/** Nom affichable d'un compte `users`. */
function userDisplayName(u) {
  if (!u) return null;
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return (u.display_name && String(u.display_name).trim()) || full || u.pseudo || null;
}

async function loadUsers(ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!list.length) return new Map();
  const rows = await queryAll(
    `SELECT id, user_type, display_name, first_name, last_name, pseudo, is_active
       FROM users WHERE id IN (${marks(list)})`,
    list,
  );
  return new Map(rows.map((u) => [String(u.id), u]));
}

function publicUser(u, fallbackType = null) {
  if (!u) return null;
  return {
    id: String(u.id),
    name: userDisplayName(u),
    pseudo: u.pseudo || null,
    user_type: u.user_type || fallbackType || null,
    is_active: u.is_active == null ? null : Number(u.is_active) === 1,
  };
}

/**
 * Enrichit des lignes brutes (acteur, cible, description d'action, charge décodée).
 * @param {object[]} rows
 */
async function enrichRows(rows) {
  if (!rows.length) return [];
  const payloads = rows.map((r) => parsePayload(r.payload_json));
  const userIds = [];
  const targetIdsByType = new Map();
  rows.forEach((r, i) => {
    if (r.actor_user_id) userIds.push(r.actor_user_id);
    const p = payloads[i];
    if (p && typeof p === 'object' && p.on_behalf_of?.userId) userIds.push(p.on_behalf_of.userId);
    if (p && typeof p === 'object' && p.target_user_id) userIds.push(p.target_user_id);
    if (!r.target_id) return;
    const type = String(r.target_type || '');
    if (USER_TARGET_TYPES.includes(type)) userIds.push(r.target_id);
    else if (TARGET_RESOLVERS[type]) {
      if (!targetIdsByType.has(type)) targetIdsByType.set(type, new Set());
      targetIdsByType.get(type).add(String(r.target_id));
    }
  });

  const users = await loadUsers(userIds);
  const targetLabels = new Map();
  for (const [type, idSet] of targetIdsByType) {
    const resolver = TARGET_RESOLVERS[type];
    const idList = [...idSet];
    try {
      const found = await queryAll(
        `SELECT CAST(id AS CHAR) AS id, ${resolver.label} AS label
           FROM \`${resolver.table}\` WHERE CAST(id AS CHAR) IN (${marks(idList)})`,
        idList,
      );
      for (const row of found) targetLabels.set(`${type}:${row.id}`, row.label || null);
    } catch {
      // Table absente sur une base ancienne : la cible reste sans libellé.
    }
  }

  return rows.map((r, i) => {
    const payload = payloads[i];
    const desc = describeAction(r.action, r.result);
    const actorUser = r.actor_user_id ? users.get(String(r.actor_user_id)) : null;
    const type = String(r.target_type || '');
    let targetLabel = null;
    if (r.target_id) {
      if (USER_TARGET_TYPES.includes(type)) {
        targetLabel = userDisplayName(users.get(String(r.target_id)));
      } else {
        targetLabel = targetLabels.get(`${type}:${r.target_id}`) || null;
      }
    }
    // Cible portée par la charge (prise de contrôle : la cible journalisée est l'acteur
    // lui-même ou `auth`, le compte contrôlé est dans `target_user_id`).
    const payloadTargetId =
      payload && typeof payload === 'object' && payload.target_user_id
        ? String(payload.target_user_id)
        : null;
    if (
      payloadTargetId &&
      (!targetLabel || String(r.target_id || '') === String(r.actor_user_id || ''))
    ) {
      targetLabel = userDisplayName(users.get(payloadTargetId)) || targetLabel;
    }
    const behalf =
      payload && typeof payload === 'object' && payload.on_behalf_of?.userId
        ? payload.on_behalf_of
        : null;
    const behalfUser = behalf ? users.get(String(behalf.userId)) : null;
    return {
      ...r,
      ...desc,
      result: r.result || 'success',
      reason_label: reasonLabel(r.reason),
      payload,
      actor: r.actor_user_id
        ? publicUser(actorUser, r.actor_user_type) || {
            id: String(r.actor_user_id),
            name: null,
            pseudo: null,
            user_type: r.actor_user_type || null,
            is_active: null,
            deleted: true,
          }
        : null,
      target_label: targetLabel,
      via: payload && typeof payload === 'object' ? payload.via || null : null,
      on_behalf_of: behalf
        ? {
            id: String(behalf.userId),
            user_type: behalf.userType || null,
            name: userDisplayName(behalfUser),
          }
        : null,
    };
  });
}

/**
 * Liste paginée d'événements enrichis.
 * @param {'audit'|'security'} sourceName
 * @param {object} f filtres normalisés (`from`, `to` requis)
 */
async function listJournalEvents(sourceName, f) {
  const src = getSource(sourceName);
  const needsActions = !!(f.category || f.mode === 'main');
  const actions = needsActions ? await distinctActions(src, f.from, f.to) : null;
  const { whereSql, params } = buildWhere(src, f, actions);
  const limit = Math.max(1, Math.min(Number(f.limit) || 100, 5000));
  const offset = Math.max(0, Number(f.offset) || 0);
  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM ${src.table} WHERE ${whereSql}`,
    params,
  );
  const rows = await queryAll(
    `SELECT ${src.columns} FROM ${src.table}
      WHERE ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)],
  );
  return {
    from: f.from,
    to: f.to,
    total: Number(countRow?.total) || 0,
    rows: await enrichRows(rows),
  };
}

const ACTOR_SORTS = Object.freeze({
  recent: 'last_at DESC',
  count: 'total DESC, last_at DESC',
  failures: 'failures DESC, last_at DESC',
});

/**
 * Agrégat par acteur (onglet « Utilisateurs ») : volume, échecs, événements principaux,
 * première / dernière activité, dernière connexion réussie et actions les plus fréquentes.
 */
async function listJournalActors(sourceName, f) {
  const src = getSource(sourceName);
  const actions = await distinctActions(src, f.from, f.to);
  const { whereSql, params } = buildWhere(src, f, actions);
  const major = actions.filter((a) => isMajorAction(a));
  const majorExpr = major.length
    ? `(action IN (${marks(major)}) OR COALESCE(result, 'success') <> 'success')`
    : "COALESCE(result, 'success') <> 'success'";
  const limit = Math.max(1, Math.min(Number(f.limit) || 50, 200));
  const offset = Math.max(0, Number(f.offset) || 0);
  const order = ACTOR_SORTS[f.sort] || ACTOR_SORTS.recent;
  const baseWhere = `${whereSql} AND actor_user_id IS NOT NULL`;

  const countRow = await queryOne(
    `SELECT COUNT(DISTINCT actor_user_id) AS total FROM ${src.table} WHERE ${baseWhere}`,
    params,
  );
  const rows = await queryAll(
    `SELECT actor_user_id, MAX(actor_user_type) AS actor_user_type, COUNT(*) AS total,
            SUM(COALESCE(result, 'success') <> 'success') AS failures,
            SUM(${majorExpr}) AS major_count,
            MIN(${src.timeCol}) AS first_at, MAX(${src.timeCol}) AS last_at,
            MAX(CASE WHEN action LIKE 'auth.login%' AND COALESCE(result, 'success') = 'success'
                     THEN ${src.timeCol} END) AS last_login_at
       FROM ${src.table}
      WHERE ${baseWhere}
      GROUP BY actor_user_id
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    [...major, ...params, String(limit), String(offset)],
  );
  const ids = rows.map((r) => String(r.actor_user_id));
  const topByActor = new Map();
  if (ids.length) {
    const counts = await queryAll(
      `SELECT actor_user_id, action, COUNT(*) AS n FROM ${src.table}
        WHERE ${baseWhere} AND actor_user_id IN (${marks(ids)})
        GROUP BY actor_user_id, action`,
      [...params, ...ids],
    );
    for (const c of counts) {
      const key = String(c.actor_user_id);
      if (!topByActor.has(key)) topByActor.set(key, []);
      topByActor.get(key).push({ action: c.action, count: Number(c.n) || 0 });
    }
  }
  const users = await loadUsers(ids);
  return {
    from: f.from,
    to: f.to,
    total: Number(countRow?.total) || 0,
    rows: rows.map((r) => {
      const id = String(r.actor_user_id);
      const top = (topByActor.get(id) || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((t) => ({ ...t, ...describeAction(t.action, 'success') }));
      return {
        actor: publicUser(users.get(id), r.actor_user_type) || {
          id,
          name: null,
          pseudo: null,
          user_type: r.actor_user_type || null,
          is_active: null,
          deleted: true,
        },
        total: Number(r.total) || 0,
        failures: Number(r.failures) || 0,
        major_count: Number(r.major_count) || 0,
        first_at: r.first_at,
        last_at: r.last_at,
        last_login_at: r.last_login_at || null,
        top_actions: top,
      };
    }),
  };
}

/**
 * Fiche d'un utilisateur sur la période : identité, totaux, répartition par catégorie,
 * actions les plus fréquentes, événements le concernant et (source sécurité) adresses IP.
 */
async function getJournalActorSummary(sourceName, userId, f) {
  const src = getSource(sourceName);
  const id = String(userId);
  const user = await queryOne(
    `SELECT id, user_type, display_name, first_name, last_name, pseudo, is_active,
            last_seen, created_at
       FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  const range = [f.from, f.to];
  const timeWhere = `${src.timeCol} >= ? AND ${src.timeCol} < DATE_ADD(?, INTERVAL 1 DAY)`;
  const byAction = await queryAll(
    `SELECT action, COUNT(*) AS n,
            SUM(COALESCE(result, 'success') <> 'success') AS failures,
            MAX(${src.timeCol}) AS last_at
       FROM ${src.table}
      WHERE ${timeWhere} AND actor_user_id = ?
      GROUP BY action`,
    [...range, id],
  );
  const targeted = await queryOne(
    `SELECT COUNT(*) AS n FROM ${src.table}
      WHERE ${timeWhere} AND target_id = ? AND (actor_user_id IS NULL OR actor_user_id <> ?)`,
    [...range, id, id],
  );
  const categories = new Map(CATEGORY_IDS.map((c) => [c, { count: 0, failures: 0 }]));
  let total = 0;
  let failures = 0;
  let majorCount = 0;
  let lastAt = null;
  const actions = byAction.map((r) => {
    const n = Number(r.n) || 0;
    const fails = Number(r.failures) || 0;
    const desc = describeAction(r.action, 'success');
    total += n;
    failures += fails;
    majorCount += desc.major ? n : fails;
    const bucket = categories.get(desc.category) || categories.get('other');
    bucket.count += n;
    bucket.failures += fails;
    if (r.last_at && (!lastAt || new Date(r.last_at) > new Date(lastAt))) lastAt = r.last_at;
    return { action: r.action, count: n, failures: fails, last_at: r.last_at, ...desc };
  });
  actions.sort((a, b) => b.count - a.count);

  let ips = [];
  if (src.hasIp) {
    ips = await queryAll(
      `SELECT ip_address, COUNT(*) AS n, MAX(occurred_at) AS last_at,
              MAX(user_agent) AS user_agent
         FROM security_events
        WHERE ${timeWhere} AND actor_user_id = ? AND ip_address IS NOT NULL
        GROUP BY ip_address
        ORDER BY last_at DESC
        LIMIT 10`,
      [...range, id],
    );
    ips = ips.map((r) => ({
      ip_address: r.ip_address,
      count: Number(r.n) || 0,
      last_at: r.last_at,
      user_agent: r.user_agent || null,
    }));
  }

  return {
    from: f.from,
    to: f.to,
    source: sourceName,
    user: user
      ? {
          ...publicUser(user),
          last_seen: user.last_seen || null,
          created_at: user.created_at || null,
        }
      : { id, name: null, pseudo: null, user_type: null, is_active: null, deleted: true },
    totals: {
      total,
      failures,
      major: majorCount,
      targeted: Number(targeted?.n) || 0,
      last_at: lastAt,
    },
    by_category: [...categories.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([category, v]) => ({ category, category_label: CATEGORY_LABELS[category], ...v }))
      .sort((a, b) => b.count - a.count),
    top_actions: actions.slice(0, 12),
    ips,
  };
}

module.exports = {
  SOURCES,
  marks,
  TARGET_RESOLVERS,
  USER_TARGET_TYPES,
  escapeLike,
  parsePayload,
  userDisplayName,
  buildWhere,
  enrichRows,
  listJournalEvents,
  listJournalActors,
  getJournalActorSummary,
};
