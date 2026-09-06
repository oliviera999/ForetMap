'use strict';

/**
 * Réconciliation des identités Gnomes & Licornes ↔ ForetMap (audit comptes 2026-09, C7/E3).
 *
 * Le pont n'était rejoué qu'au démarrage, sans rapport : rien ne signalait un joueur sans
 * compte, un compte miroir orphelin (joueur supprimé) ou un reliquat de mot de passe hérité.
 * `buildGlIdentityReport` décrit l'état ; `applyGlIdentityReconciliation` corrige ce qui l'est
 * sans décision humaine (liens manquants, appartenances de groupe) et, sur demande explicite,
 * supprime les comptes miroirs orphelins.
 */

const { queryAll, queryOne } = require('../database');
const {
  backfillGlPlayersForetmapLinks,
  countPendingGlPlayersForetmapSync,
} = require('./glGroupBridge');
const { deleteStudentById } = require('./studentDeletion');

const SAMPLE_LIMIT = 50;

async function listUnlinkedPlayers() {
  return queryAll(
    `SELECT p.id, p.pseudo, p.class_id, c.name AS class_name
       FROM gl_players p
       LEFT JOIN gl_classes c ON c.id = p.class_id
      WHERE p.linked_foretmap_user_id IS NULL
      ORDER BY p.id ASC
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

async function listPlayersNotInClassGroup() {
  return queryAll(
    `SELECT p.id, p.pseudo, p.class_id, c.name AS class_name
       FROM gl_players p
       INNER JOIN gl_classes c ON c.id = p.class_id
      WHERE p.linked_foretmap_user_id IS NOT NULL
        AND (
          c.foretmap_group_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.user_id = p.linked_foretmap_user_id AND gm.group_id = c.foretmap_group_id
          )
        )
      ORDER BY p.id ASC
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

/** Comptes miroirs (`gl_bridge`) que plus aucun joueur ne référence. */
async function listOrphanBridgeAccounts() {
  return queryAll(
    `SELECT u.id, u.pseudo, u.email, u.display_name, u.created_at
       FROM users u
       LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      WHERE u.user_type = 'student' AND u.auth_provider = 'gl_bridge' AND p.id IS NULL
      ORDER BY u.created_at ASC
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

async function countOrphanBridgeAccounts() {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM users u
       LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      WHERE u.user_type = 'student' AND u.auth_provider = 'gl_bridge' AND p.id IS NULL`,
  );
  return Number(row?.c || 0);
}

async function listLegacyPasswordPending() {
  return queryAll(
    `SELECT p.id, p.pseudo, p.linked_foretmap_user_id
       FROM gl_players p
      WHERE p.legacy_password_hash IS NOT NULL
      ORDER BY p.id ASC
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

async function listLegacyEmailPending() {
  return queryAll(
    `SELECT p.id, p.pseudo, p.legacy_email, u.email AS user_email
       FROM gl_players p
       LEFT JOIN users u ON u.id = p.linked_foretmap_user_id
      WHERE p.legacy_email IS NOT NULL
      ORDER BY p.id ASC
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

/** Deux comptes élèves de même prénom/nom dont l'un est un miroir : doublon probable (C1 historique). */
async function listProbableDuplicates() {
  return queryAll(
    `SELECT b.id AS bridge_user_id, b.pseudo AS bridge_pseudo, o.id AS other_user_id,
            o.pseudo AS other_pseudo, o.email AS other_email, b.first_name, b.last_name,
            p.id AS player_id, p.pseudo AS player_pseudo
       FROM users b
       INNER JOIN users o
               ON o.user_type = 'student' AND o.id <> b.id AND o.auth_provider <> 'gl_bridge'
              AND LOWER(o.first_name) = LOWER(b.first_name)
              AND LOWER(o.last_name) = LOWER(b.last_name)
       LEFT JOIN gl_players p ON p.linked_foretmap_user_id = b.id
      WHERE b.user_type = 'student' AND b.auth_provider = 'gl_bridge'
        AND b.first_name IS NOT NULL AND b.first_name <> ''
        AND b.last_name IS NOT NULL AND b.last_name <> ''
      ORDER BY b.last_name, b.first_name
      LIMIT ${SAMPLE_LIMIT}`,
  );
}

async function countRows(sql, params = []) {
  const row = await queryOne(sql, params);
  return Number(row?.c || 0);
}

/**
 * État des identités GL ↔ ForetMap.
 * @returns {Promise<object>} `{ totals, samples }` — totaux exacts, échantillons bornés à 50.
 */
async function buildGlIdentityReport() {
  const [
    players,
    linkedPlayers,
    pendingSync,
    orphanBridge,
    legacyPassword,
    legacyEmail,
    duplicates,
  ] = await Promise.all([
    countRows('SELECT COUNT(*) AS c FROM gl_players'),
    countRows('SELECT COUNT(*) AS c FROM gl_players WHERE linked_foretmap_user_id IS NOT NULL'),
    countPendingGlPlayersForetmapSync(),
    countOrphanBridgeAccounts(),
    countRows('SELECT COUNT(*) AS c FROM gl_players WHERE legacy_password_hash IS NOT NULL'),
    countRows('SELECT COUNT(*) AS c FROM gl_players WHERE legacy_email IS NOT NULL'),
    countRows(
      `SELECT COUNT(*) AS c
         FROM users b
         INNER JOIN users o
                 ON o.user_type = 'student' AND o.id <> b.id AND o.auth_provider <> 'gl_bridge'
                AND LOWER(o.first_name) = LOWER(b.first_name)
                AND LOWER(o.last_name) = LOWER(b.last_name)
        WHERE b.user_type = 'student' AND b.auth_provider = 'gl_bridge'
          AND b.first_name IS NOT NULL AND b.first_name <> ''
          AND b.last_name IS NOT NULL AND b.last_name <> ''`,
    ),
  ]);
  const [unlinked, notInGroup, orphans, legacyPwd, legacyMail, dupes] = await Promise.all([
    listUnlinkedPlayers(),
    listPlayersNotInClassGroup(),
    listOrphanBridgeAccounts(),
    listLegacyPasswordPending(),
    listLegacyEmailPending(),
    listProbableDuplicates(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      players,
      linked_players: linkedPlayers,
      unlinked_players: players - linkedPlayers,
      pending_sync: pendingSync,
      orphan_bridge_accounts: orphanBridge,
      legacy_password_pending: legacyPassword,
      legacy_email_unmigrated: legacyEmail,
      probable_duplicates: duplicates,
    },
    samples: {
      unlinked_players: unlinked,
      players_not_in_class_group: notInGroup,
      orphan_bridge_accounts: orphans,
      legacy_password_pending: legacyPwd,
      legacy_email_unmigrated: legacyMail,
      probable_duplicates: dupes,
    },
  };
}

/**
 * Corrige l'état : relance le pont (liens + groupes) et, si `deleteOrphanBridgeAccounts`,
 * supprime les comptes miroirs orphelins (irréversible — uniquement sur demande explicite).
 */
async function applyGlIdentityReconciliation({ deleteOrphanBridgeAccounts = false } = {}) {
  const backfill = await backfillGlPlayersForetmapLinks();
  let orphansDeleted = 0;
  let orphansFailed = 0;
  if (deleteOrphanBridgeAccounts) {
    const orphans = await queryAll(
      `SELECT u.id
         FROM users u
         LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
        WHERE u.user_type = 'student' AND u.auth_provider = 'gl_bridge' AND p.id IS NULL`,
    );
    for (const orphan of orphans) {
      try {
        const result = await deleteStudentById(orphan.id, { skipLinkedGlPlayer: true });
        if (result.ok) orphansDeleted += 1;
        else orphansFailed += 1;
      } catch {
        orphansFailed += 1;
      }
    }
  }
  return {
    backfill,
    orphans: { deleted: orphansDeleted, failed: orphansFailed },
    report: await buildGlIdentityReport(),
  };
}

module.exports = { buildGlIdentityReport, applyGlIdentityReconciliation };
