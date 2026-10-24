#!/usr/bin/env node
'use strict';

/**
 * Administration **serveur** de la double authentification (TOTP).
 *
 * Pensé pour le cas où plus personne ne peut agir depuis l'application : le dernier
 * administrateur a perdu son téléphone et ses codes de secours, ou la clé de chiffrement
 * `TOTP_ENCRYPTION_KEY` a été perdue. Il faut un accès shell au serveur et son `.env` —
 * c'est-à-dire être déjà maître de l'installation : le script n'ouvre aucun droit nouveau.
 * Chaque action est inscrite aux journaux d'audit et de sécurité avec l'auteur `cli`
 * (nom d'hôte et utilisateur système dans le détail).
 *
 * Usage :
 *   node scripts/totp-admin.js status
 *   node scripts/totp-admin.js reset --user <email|pseudo|identifiant> --yes
 *   node scripts/totp-admin.js enforcement <off|enroll|required> --yes
 *   node scripts/totp-admin.js rotate-key --yes
 *
 * Sans `--yes`, une commande qui écrit décrit ce qu'elle ferait et s'arrête (code 2).
 * Un changement de réglage est pris en compte par le serveur en marche sous 15 secondes
 * (durée du cache des réglages).
 */

require('dotenv').config({ quiet: true });
const os = require('node:os');
const { queryOne, queryAll, execute } = require('../database');
const { logSecurityEvent } = require('../lib/auditLog');
const { setSetting, getSettingValue } = require('../lib/settings');
const {
  MFA_ENFORCEMENT_KEY,
  MFA_ENFORCEMENT_VALUES,
  DEFAULT_MFA_ENFORCEMENT,
} = require('../lib/auth/mfaPolicy');
const {
  describeTotpKeyStatus,
  isTotpKeyConfigured,
  needsReencryption,
  reencryptTotpSecret,
} = require('../lib/auth/totpCrypto');
const { resetUserSecondFactor } = require('../lib/auth/totpReset');

const USAGE = [
  'Usage :',
  '  node scripts/totp-admin.js status',
  '  node scripts/totp-admin.js reset --user <email|pseudo|identifiant> --yes',
  '  node scripts/totp-admin.js enforcement <off|enroll|required> --yes',
  '  node scripts/totp-admin.js rotate-key --yes',
].join('\n');

function parseArgs(argv) {
  const args = { _: [], yes: false, user: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--user' || arg === '-u') {
      args.user = argv[i + 1] ?? null;
      i += 1;
    } else args._.push(arg);
  }
  return args;
}

function cliContext() {
  let osUser = null;
  try {
    osUser = os.userInfo().username;
  } catch (_) {
    osUser = process.env.USER || null;
  }
  return { via: 'cli', host: os.hostname(), os_user: osUser };
}

async function findUser(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return queryOne(
    `SELECT id, user_type, email, pseudo, display_name FROM users
      WHERE id = ? OR LOWER(email) = LOWER(?) OR pseudo = ?
      ORDER BY (id = ?) DESC LIMIT 1`,
    [value, value, value, value],
  );
}

async function commandStatus({ log }) {
  const key = describeTotpKeyStatus();
  const enforcement = await getSettingValue(MFA_ENFORCEMENT_KEY, DEFAULT_MFA_ENFORCEMENT);
  log(`Réglage security.totp.enforcement : ${enforcement}`);
  log(
    `Clé TOTP_ENCRYPTION_KEY : ${key.status}${key.keyId ? ` (identifiant ${key.keyId})` : ''}` +
      `${key.previousKeys ? `, ${key.previousKeys} clé(s) précédente(s)` : ''}`,
  );
  if (key.sameAsJwtSecret) log('ATTENTION : la clé est identique à JWT_SECRET ; changez-la.');
  const admins = await queryAll(
    `SELECT u.email, u.pseudo, u.is_active, (t.enabled_at IS NOT NULL) AS enrolled
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       JOIN roles r ON r.id = ur.role_id
  LEFT JOIN user_totp t ON t.user_id = u.id
      WHERE r.slug = 'admin'
      ORDER BY u.email`,
  );
  log(`Administrateurs (${admins.length}) :`);
  for (const a of admins) {
    log(
      `  - ${a.email || a.pseudo || '?'}${Number(a.is_active) ? '' : ' (inactif)'} : ` +
        `${Number(a.enrolled) ? 'double authentification active' : 'non enrôlé'}`,
    );
  }
  const enrolled = await queryOne(
    'SELECT COUNT(*) AS c FROM user_totp WHERE enabled_at IS NOT NULL',
  );
  log(`Comptes enrôlés au total : ${Number(enrolled?.c || 0)}`);
  return 0;
}

async function commandReset(args, { log, error }) {
  if (!args.user) {
    error('Compte manquant : --user <email|pseudo|identifiant>');
    return 1;
  }
  const user = await findUser(args.user);
  if (!user) {
    error(`Aucun compte ne correspond à « ${args.user} ».`);
    return 1;
  }
  const label = user.email || user.pseudo || user.display_name || user.id;
  if (!args.yes) {
    log(
      `Réinitialiserait la double authentification de ${label} (${user.user_type}) : secret et ` +
        'codes de secours supprimés, toutes les sessions du compte révoquées. Relancez avec --yes.',
    );
    return 2;
  }
  const result = await resetUserSecondFactor({
    userId: user.id,
    actor: { userType: 'cli', userId: null },
    via: 'cli',
    payload: cliContext(),
  });
  await result.notice;
  log(
    `Double authentification réinitialisée pour ${label}` +
      `${result.wasEnabled ? '' : ' (elle n’était pas active)'} ; sessions révoquées.`,
  );
  log('Au prochain login, le compte configurera de nouveau son application.');
  return 0;
}

async function commandEnforcement(args, { log, error }) {
  const value = String(args._[1] || '')
    .trim()
    .toLowerCase();
  if (!MFA_ENFORCEMENT_VALUES.includes(value)) {
    error(`Valeur attendue : ${MFA_ENFORCEMENT_VALUES.join(' | ')}`);
    return 1;
  }
  if (value === 'required' && !isTotpKeyConfigured()) {
    error('Refusé : TOTP_ENCRYPTION_KEY absente ou invalide — personne ne pourrait s’enrôler.');
    return 1;
  }
  const previous = await getSettingValue(MFA_ENFORCEMENT_KEY, DEFAULT_MFA_ENFORCEMENT);
  if (!args.yes) {
    log(
      `Passerait security.totp.enforcement de « ${previous} » à « ${value} ». Relancez avec --yes.`,
    );
    return 2;
  }
  await setSetting(MFA_ENFORCEMENT_KEY, value, { userType: 'cli', userId: null });
  await logSecurityEvent('auth.totp.enforcement_change', {
    actorUserType: 'cli',
    payload: { from: previous, to: value, ...cliContext() },
  });
  log(`security.totp.enforcement : « ${previous} » → « ${value} » (effectif sous 15 s).`);
  return 0;
}

async function commandRotateKey(args, { log, error }) {
  if (!isTotpKeyConfigured()) {
    error('TOTP_ENCRYPTION_KEY absente ou invalide : rien à faire.');
    return 1;
  }
  const rows = await queryAll(
    `SELECT user_id, secret_enc, secret_key_id, pending_secret_enc, pending_key_id
       FROM user_totp WHERE secret_enc IS NOT NULL OR pending_secret_enc IS NOT NULL`,
  );
  const todo = rows.filter(
    (r) =>
      (r.secret_enc && needsReencryption({ keyId: r.secret_key_id })) ||
      (r.pending_secret_enc && needsReencryption({ keyId: r.pending_key_id })),
  );
  if (!args.yes) {
    log(`${todo.length} compte(s) à rechiffrer avec la clé courante. Relancez avec --yes.`);
    return 2;
  }
  let done = 0;
  let failed = 0;
  for (const row of todo) {
    try {
      const active =
        row.secret_enc && needsReencryption({ keyId: row.secret_key_id })
          ? reencryptTotpSecret(
              { ciphertext: row.secret_enc, keyId: row.secret_key_id },
              row.user_id,
            )
          : null;
      const pending =
        row.pending_secret_enc && needsReencryption({ keyId: row.pending_key_id })
          ? reencryptTotpSecret(
              { ciphertext: row.pending_secret_enc, keyId: row.pending_key_id },
              row.user_id,
            )
          : null;
      if (active) {
        await execute(
          'UPDATE user_totp SET secret_enc = ?, secret_key_id = ? WHERE user_id = ? AND secret_enc = ?',
          [active.ciphertext, active.keyId, row.user_id, row.secret_enc],
        );
      }
      if (pending) {
        await execute(
          'UPDATE user_totp SET pending_secret_enc = ?, pending_key_id = ? WHERE user_id = ? AND pending_secret_enc = ?',
          [pending.ciphertext, pending.keyId, row.user_id, row.pending_secret_enc],
        );
      }
      done += 1;
    } catch (err) {
      failed += 1;
      error(`Compte ${row.user_id} : ${err.code || err.message}`);
    }
  }
  await logSecurityEvent('auth.totp.key_rotation', {
    actorUserType: 'cli',
    result: failed ? 'failure' : 'success',
    payload: { reencrypted: done, failed, ...cliContext() },
  });
  log(`${done} compte(s) rechiffré(s), ${failed} échec(s).`);
  if (!failed) log('Vous pouvez retirer l’ancienne clé de TOTP_ENCRYPTION_KEY_PREVIOUS.');
  return failed ? 1 : 0;
}

/**
 * @param {string[]} argv arguments (sans `node` ni le chemin du script)
 * @param {{ log?: (line: string) => void, error?: (line: string) => void }} [io]
 * @returns {Promise<number>} code de sortie
 */
async function main(argv, io = {}) {
  const log = io.log || ((line) => console.log(line));
  const error = io.error || io.log || ((line) => console.error(line));
  const args = parseArgs(argv);
  const command = args._[0];
  if (command === 'status') return commandStatus({ log });
  if (command === 'reset') return commandReset(args, { log, error });
  if (command === 'enforcement') return commandEnforcement(args, { log, error });
  if (command === 'rotate-key') return commandRotateKey(args, { log, error });
  error(USAGE);
  return 1;
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    });
}
