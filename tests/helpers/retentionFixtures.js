'use strict';

/**
 * Fixtures des tests de la purge planifiée (`lib/retention/`) : comptes datés, sorties
 * capturées, recherche de données nominatives dans une sortie.
 */

const crypto = require('node:crypto');
const { execute, queryOne } = require('../../database');

const STAMP = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;

/**
 * Compte daté (élève par défaut). Les dates sont exprimées en jours avant maintenant ; `null`
 * laisse la colonne vide.
 * @returns {Promise<{ id: string, firstName: string, lastName: string, email: string }>}
 */
async function createDatedAccount({
  userType = 'student',
  label = 'Compte',
  isActive = 1,
  createdDaysAgo = 900,
  lastSeenDaysAgo = null,
  deactivatedDaysAgo = null,
  avatarPath = null,
} = {}) {
  const id = crypto.randomUUID();
  const suffix = `${STAMP}${Math.random().toString(36).slice(2, 6)}`;
  const firstName = `${label}Prenom${suffix}`;
  const lastName = `${label}Nom${suffix}`;
  const email = `${label.toLowerCase()}.${suffix}@exemple.test`;
  await execute(
    `INSERT INTO users
       (id, user_type, email, pseudo, first_name, last_name, display_name, auth_provider,
        is_active, deactivated_at, last_seen, avatar_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'local', ?,
        IF(? IS NULL, NULL, NOW() - INTERVAL ? DAY),
        IF(? IS NULL, NULL, NOW() - INTERVAL ? DAY),
        ?, NOW() - INTERVAL ? DAY, NOW() - INTERVAL ? DAY)`,
    [
      id,
      userType,
      email,
      `p${suffix}`.slice(0, 50),
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      isActive ? 1 : 0,
      deactivatedDaysAgo,
      deactivatedDaysAgo ?? 0,
      lastSeenDaysAgo,
      lastSeenDaysAgo ?? 0,
      avatarPath,
      createdDaysAgo,
      createdDaysAgo,
    ],
  );
  return { id, firstName, lastName, email };
}

/** Donne le profil `slug` au compte (profil principal). */
async function grantRole(userId, userType, slug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  if (!role) throw new Error(`profil ${slug} absent`);
  await execute('DELETE FROM user_roles WHERE user_id = ? AND user_type = ? AND is_primary = 1', [
    userId,
    userType,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    [userType, userId, role.id],
  );
  return role.id;
}

async function userExists(id) {
  return Boolean(await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [id]));
}

/** Collecteur de lignes de sortie. */
function captureLog() {
  const lines = [];
  const log = (line) => lines.push(String(line));
  return { lines, log, text: () => lines.join('\n') };
}

/** Données d'une personne trouvées dans un texte (nom, prénom, e-mail, identifiant). */
function leakedPersonalData(text, accounts) {
  const found = [];
  for (const account of accounts) {
    for (const value of [account.id, account.firstName, account.lastName, account.email]) {
      if (value && String(text).includes(String(value))) found.push(value);
    }
  }
  return found;
}

module.exports = {
  STAMP,
  createDatedAccount,
  grantRole,
  userExists,
  captureLog,
  leakedPersonalData,
};
