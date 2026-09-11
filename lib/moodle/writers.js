'use strict';

/**
 * Écritures élémentaires de la synchronisation, partagées par `apply.js` (exécution) et
 * `pendingMatches.js` (décision d'un administrateur). Chacune reçoit `db` (une transaction
 * `tx` ou `database`) et journalise elle-même via `journal.record` quand un journal est fourni.
 *
 * Ce que la synchronisation a le droit d'écrire (section 8.2) tient ici, et nulle part ailleurs.
 */

const crypto = require('node:crypto');
const { PROVIDER } = require('./config');
const { sanitizePseudoBase } = require('../shared/pseudo');

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniquePseudo(
  db,
  base,
  { table = 'users', column = 'pseudo', excludeId = null, maxLength = 50 } = {},
) {
  // Conserve `.` `_` `-` `+` du username Moodle (ex. prenom.nom) ; ne pas passer par slugify.
  const root = (sanitizePseudoBase(base, maxLength - 6).toLowerCase() || 'eleve').slice(
    0,
    maxLength - 6,
  );
  let candidate = root;
  for (let i = 0; i < 50; i += 1) {
    const row = await db.queryOne(
      `SELECT id FROM ${table} WHERE LOWER(${column}) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1`,
      [candidate, excludeId, excludeId],
    );
    if (!row) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${crypto.randomBytes(2).toString('hex')}`;
}

function externalIdentityView(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    externalId: String(row.external_id),
    userId: String(row.user_id),
    origin: row.origin,
  };
}

/** Insère une identité externe ; renvoie la ligne créée (journalisée dans `user.create` / `user.link`). */
async function insertIdentity(db, { issuer, member, userId, origin }) {
  await db.execute(
    `INSERT INTO external_identities
       (provider, issuer, external_id, external_idnumber, external_username, user_id, origin, linked_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      PROVIDER,
      issuer,
      String(member.id),
      member.idnumber || null,
      member.username || null,
      String(userId),
      origin,
    ],
  );
  return db.queryOne(
    'SELECT * FROM external_identities WHERE provider = ? AND issuer = ? AND external_id = ? LIMIT 1',
    [PROVIDER, issuer, String(member.id)],
  );
}

/**
 * Crée un compte élève depuis un membre Moodle (Moodle fait foi pour prénom, nom, e-mail).
 * `auth_provider = 'moodle'`, aucun mot de passe (I-2). Identité `origin = 'created'`.
 */
async function createUserFromMember(db, { issuer, member, journal = null, cohort = null }) {
  const userId = crypto.randomUUID();
  const firstName = String(member.firstname || '').trim();
  const lastName = String(member.lastname || '').trim();
  const email =
    String(member.email || '')
      .trim()
      .toLowerCase() || null;
  const pseudo = await uniquePseudo(db, member.username || `${firstName}.${lastName}`);
  const displayName = `${firstName} ${lastName}`.trim() || pseudo;
  await db.execute(
    `INSERT INTO users
       (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description,
        avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, NULL, NULL, 'both', NULL, 'moodle', 1, NULL, NOW(), NOW())`,
    [userId, email, pseudo, firstName, lastName, displayName],
  );
  const identity = await insertIdentity(db, { issuer, member, userId, origin: 'created' });
  if (journal) {
    await journal.record(db, {
      kind: 'user.create',
      targetType: 'user',
      targetId: userId,
      before: null,
      after: {
        userId,
        externalId: String(member.id),
        email,
        firstName,
        lastName,
        pseudo,
        cohort,
        identity: externalIdentityView(identity),
      },
    });
  }
  return { userId, pseudo, identity };
}

/**
 * Rapproche un compte existant : identité `origin = 'linked'`, e-mail / prénom / nom **s'ils
 * étaient vides**, `gl_bridge` → `moodle` (section 5.2). Rien d'autre.
 */
async function linkUserToMember(
  db,
  { issuer, member, userId, rule, journal = null, cohort = null },
) {
  const before = await db.queryOne(
    'SELECT id, email, first_name, last_name, auth_provider FROM users WHERE id = ? LIMIT 1',
    [String(userId)],
  );
  if (!before) throw new Error(`Compte ${userId} introuvable pour le rapprochement`);
  const email =
    String(member.email || '')
      .trim()
      .toLowerCase() || null;
  const nextEmail = before.email ? before.email : email;
  const nextFirst = before.first_name ? before.first_name : String(member.firstname || '').trim();
  const nextLast = before.last_name ? before.last_name : String(member.lastname || '').trim();
  const nextProvider = before.auth_provider === 'gl_bridge' ? 'moodle' : before.auth_provider;
  if (
    nextEmail !== before.email ||
    nextFirst !== before.first_name ||
    nextLast !== before.last_name ||
    nextProvider !== before.auth_provider
  ) {
    await db.execute(
      `UPDATE users SET email = ?, first_name = ?, last_name = ?, auth_provider = ?, updated_at = NOW() WHERE id = ?`,
      [nextEmail, nextFirst, nextLast, nextProvider, String(userId)],
    );
  }
  const identity = await insertIdentity(db, { issuer, member, userId, origin: 'linked' });
  if (journal) {
    await journal.record(db, {
      kind: 'user.link',
      targetType: 'user',
      targetId: String(userId),
      before: {
        email: before.email,
        firstName: before.first_name,
        lastName: before.last_name,
        authProvider: before.auth_provider,
      },
      after: {
        externalId: String(member.id),
        rule,
        cohort,
        email: nextEmail,
        firstName: nextFirst,
        lastName: nextLast,
        authProvider: nextProvider,
        identity: externalIdentityView(identity),
      },
    });
  }
  return { userId: String(userId), identity };
}

module.exports = {
  slugify,
  uniquePseudo,
  insertIdentity,
  createUserFromMember,
  linkUserToMember,
  externalIdentityView,
};
