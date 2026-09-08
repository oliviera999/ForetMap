'use strict';

/**
 * Empreinte des tables « sensibles » pour prouver qu'une opération n'y a **rien** changé
 * (garde-fous I-4 / section 11 : un groupe, un compte ou une équipe locaux restent intacts).
 *
 * L'empreinte est un SHA-256 des lignes triées ; on la compare avant / après. Un filtre SQL
 * optionnel permet de cibler un sous-ensemble (ex. un seul compte).
 */

const crypto = require('node:crypto');
const { queryAll } = require('../../database');

const DEFAULT_TABLES = Object.freeze({
  users:
    'SELECT id, user_type, email, pseudo, first_name, last_name, auth_provider, is_active, sync_exempt FROM users ORDER BY id',
  groups:
    'SELECT id, slug, name, kind, default_role_id, grants_n3beur_access, is_active, sync_exempt FROM `groups` ORDER BY id',
  group_members:
    'SELECT group_id, user_id, role_in_group FROM group_members ORDER BY group_id, user_id',
  gl_classes: 'SELECT id, name, foretmap_group_id, is_active FROM gl_classes ORDER BY id',
  gl_players:
    'SELECT id, class_id, team_id, linked_foretmap_user_id, is_active FROM gl_players ORDER BY id',
  gl_teams: 'SELECT id, game_id, name, type FROM gl_teams ORDER BY id',
  gl_team_members: 'SELECT team_id, player_id FROM gl_team_members ORDER BY team_id, player_id',
});

async function fingerprintTable(sql, params = []) {
  const rows = await queryAll(sql, params);
  const hash = crypto.createHash('sha256');
  for (const row of rows) hash.update(JSON.stringify(row));
  return { hash: hash.digest('hex'), rows: rows.length };
}

/**
 * @param {Record<string, string|{ sql: string, params?: any[] }>} [tables]
 */
async function dbFingerprint(tables = DEFAULT_TABLES) {
  const out = {};
  for (const [name, spec] of Object.entries(tables)) {
    const sql = typeof spec === 'string' ? spec : spec.sql;
    const params = typeof spec === 'string' ? [] : spec.params || [];
    out[name] = await fingerprintTable(sql, params);
  }
  return out;
}

/** Noms des tables dont l'empreinte a changé entre deux relevés. */
function diffFingerprints(before, after) {
  return Object.keys(before).filter((k) => before[k].hash !== after[k]?.hash);
}

/** Empreinte des lignes qui concernent un compte donné (users, appartenances, joueur). */
function userScopedTables(userId) {
  return {
    user: {
      sql: 'SELECT id, email, pseudo, first_name, last_name, auth_provider, is_active, sync_exempt FROM users WHERE id = ?',
      params: [userId],
    },
    memberships: {
      sql: 'SELECT group_id, role_in_group FROM group_members WHERE user_id = ? ORDER BY group_id',
      params: [userId],
    },
    player: {
      sql: 'SELECT id, class_id, team_id, is_active FROM gl_players WHERE linked_foretmap_user_id = ?',
      params: [userId],
    },
    roles: {
      sql: "SELECT role_id, is_primary FROM user_roles WHERE user_type = 'student' AND user_id = ? ORDER BY role_id",
      params: [userId],
    },
  };
}

function groupScopedTables(groupId) {
  return {
    group: {
      sql: 'SELECT id, slug, name, kind, default_role_id, grants_n3beur_access, is_active, sync_exempt FROM `groups` WHERE id = ?',
      params: [groupId],
    },
    members: {
      sql: 'SELECT user_id, role_in_group FROM group_members WHERE group_id = ? ORDER BY user_id',
      params: [groupId],
    },
  };
}

module.exports = {
  DEFAULT_TABLES,
  dbFingerprint,
  diffFingerprints,
  userScopedTables,
  groupScopedTables,
};
