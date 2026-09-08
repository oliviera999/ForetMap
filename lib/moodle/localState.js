'use strict';

/**
 * État local lu en base pour une exécution (section 11, règle 1 : toute écriture de la
 * synchronisation part des tables `external_*` ; ici on lit aussi `users` pour le
 * rapprochement — c'est la seule lecture « large », et elle ne sert qu'à trouver des
 * correspondances, jamais à décider d'une écriture).
 *
 * Tout est chargé une fois, en mémoire, indexé pour `matching.js` et `plan.js`.
 */

const { queryAll, queryOne } = require('../../database');
const { normalizePersonName, normalizeEmail } = require('./matching');

function pushMap(map, key, value) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function parseJsonArray(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * @param {{ provider: string, issuer: string }} args
 */
async function loadLocalState({ provider, issuer }) {
  const users = await queryAll(
    `SELECT id, user_type, email, pseudo, first_name, last_name, display_name, is_active,
            sync_exempt, auth_provider
       FROM users`,
  );
  const usersById = new Map();
  const usersByEmail = new Map();
  const studentsByName = new Map();
  let activeStudentCount = 0;
  for (const user of users) {
    usersById.set(String(user.id), user);
    pushMap(usersByEmail, normalizeEmail(user.email), user);
    if (user.user_type === 'student') {
      pushMap(studentsByName, normalizePersonName(user.first_name, user.last_name), user);
      if (Number(user.is_active) === 1) activeStudentCount += 1;
    }
  }

  const identityRows = await queryAll(
    `SELECT id, external_id, external_idnumber, external_username, user_id, origin, linked_at, last_seen_at
       FROM external_identities
      WHERE provider = ? AND issuer = ?`,
    [provider, issuer],
  );
  const identitiesByExternalId = new Map();
  const identitiesByUserId = new Map();
  for (const row of identityRows) {
    const identity = { ...row, user: usersById.get(String(row.user_id)) || null };
    identitiesByExternalId.set(String(row.external_id), identity);
    identitiesByUserId.set(String(row.user_id), identity);
  }

  const externalGroups = await queryAll(
    `SELECT eg.*, g.name AS group_name, g.kind AS group_kind, g.is_active AS group_is_active,
            g.sync_exempt AS group_sync_exempt, g.default_role_id AS group_default_role_id,
            g.grants_n3beur_access AS group_grants_n3beur_access
       FROM external_groups eg
       LEFT JOIN \`groups\` g ON g.id = eg.group_id
      WHERE eg.provider = ? AND eg.issuer = ?`,
    [provider, issuer],
  );
  const externalGroupsById = new Map();
  const externalGroupsByKey = new Map();
  for (const row of externalGroups) {
    row.syncMembers = new Map();
    row.lastMembers = parseJsonArray(row.members_json);
    externalGroupsById.set(Number(row.id), row);
    externalGroupsByKey.set(`${row.kind}:${row.external_id}`, row);
  }
  if (externalGroups.length) {
    const memberRows = await queryAll(
      `SELECT egm.external_group_id, egm.user_id, egm.source
         FROM external_group_members egm
         INNER JOIN external_groups eg ON eg.id = egm.external_group_id
        WHERE eg.provider = ? AND eg.issuer = ?`,
      [provider, issuer],
    );
    for (const row of memberRows) {
      const group = externalGroupsById.get(Number(row.external_group_id));
      if (group) group.syncMembers.set(String(row.user_id), row.source);
    }
  }

  // Appartenances réelles des groupes ForetMap synchronisés (pour distinguer un ajout manuel).
  const groupIds = externalGroups.map((g) => g.group_id).filter(Boolean);
  const groupMembersByGroupId = new Map();
  if (groupIds.length) {
    const placeholders = groupIds.map(() => '?').join(', ');
    const rows = await queryAll(
      `SELECT group_id, user_id FROM group_members WHERE group_id IN (${placeholders})`,
      groupIds,
    );
    for (const row of rows) {
      const set = groupMembersByGroupId.get(String(row.group_id)) || new Set();
      set.add(String(row.user_id));
      groupMembersByGroupId.set(String(row.group_id), set);
    }
  }

  // Joueurs G&L liés à un compte : classe courante, et présence dans une partie non terminée
  // (I-10 : une partie en cours n'est pas touchée).
  const players = await queryAll(
    `SELECT p.id, p.class_id, p.linked_foretmap_user_id, p.is_active,
            EXISTS (
              SELECT 1 FROM gl_team_members tm
              INNER JOIN gl_games g ON g.id = tm.game_id
              WHERE tm.player_id = p.id AND g.status IN ('live', 'paused')
            ) AS in_live_game
       FROM gl_players p
      WHERE p.linked_foretmap_user_id IS NOT NULL`,
  );
  const playersByUserId = new Map(players.map((p) => [String(p.linked_foretmap_user_id), p]));
  const glClasses = await queryAll('SELECT id, name, foretmap_group_id, is_active FROM gl_classes');
  const glClassesById = new Map(glClasses.map((c) => [Number(c.id), c]));
  const glClassesByGroupId = new Map(
    glClasses.filter((c) => c.foretmap_group_id).map((c) => [String(c.foretmap_group_id), c]),
  );

  const roles = await queryAll('SELECT id, slug FROM roles');
  const roleIdBySlug = new Map(roles.map((r) => [String(r.slug), Number(r.id)]));

  const groupSlugRow = await queryOne('SELECT COUNT(*) AS c FROM `groups`');

  return {
    provider,
    issuer,
    users,
    usersById,
    usersByEmail,
    studentsByName,
    activeStudentCount,
    identitiesByExternalId,
    identitiesByUserId,
    externalGroups,
    externalGroupsById,
    externalGroupsByKey,
    groupMembersByGroupId,
    playersByUserId,
    glClassesById,
    glClassesByGroupId,
    roleIdBySlug,
    groupCount: Number(groupSlugRow?.c || 0),
  };
}

module.exports = { loadLocalState };
