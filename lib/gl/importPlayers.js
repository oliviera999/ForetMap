'use strict';

/**
 * Import de joueurs Gnomes & Licornes depuis des lignes CSV/XLSX déjà parsées.
 *
 * Extrait de `routes/gl/admin.js` (POST /players/import). Depuis l'unification des identités
 * (migration 211, `docs/AUDIT_COMPTES_2026-09.md`) :
 *
 *  - le mot de passe et l'e-mail vivent sur le compte `users` créé ou RAPPROCHÉ par le pont
 *    (`upsertForetmapUserForGlPlayer` : même e-mail, ou même pseudo + prénom/nom) — importer
 *    dans le jeu un élève déjà inscrit à ForetMap ne crée plus de compte en doublon ;
 *  - les mots de passe générés sont RESTITUÉS dans le rapport (`credentials`), une seule fois :
 *    sans cela, un fichier sans colonne « Mot de passe » produisait des comptes inutilisables ;
 *  - les hachages bcrypt sont calculés en parallèle borné avant les insertions (E2).
 *
 * L'unicité pseudo (`gl_players`) et e-mail (`users`) est vérifiée par `WHERE … IN (…)` sur les
 * valeurs du fichier, jamais en chargeant toute la table.
 */

const bcrypt = require('bcryptjs');
const { queryAll, execute } = require('../../database');
const {
  PSEUDO_RE,
  buildPlayerImportPayload,
  validatePlayerImportPayload,
} = require('../glPlayersImport');
const { PSEUDO_INVALID_MSG } = require('../shared/pseudo');
const { getDefaultVitalityFromSettings } = require('../glVitality');
const { getGameplaySettings } = require('../glSettings');
const { upsertForetmapUserForGlPlayer } = require('../glGroupBridge');
const { buildGeneratedPassword, PLAYER_EMAIL_RE } = require('./adminRouteHelpers');
const { mapWithConcurrency } = require('../shared/mapWithConcurrency');

const BCRYPT_CONCURRENCY = 4;

function normalizeLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/** Pseudos déjà pris parmi les pseudos candidats (minuscules) du fichier importé. */
async function loadKnownPseudos(candidates) {
  if (candidates.length === 0) return new Set();
  const rows = await queryAll(
    `SELECT pseudo FROM gl_players WHERE LOWER(TRIM(pseudo)) IN (${candidates.map(() => '?').join(', ')})`,
    candidates,
  );
  return new Set(rows.map((row) => normalizeLower(row.pseudo)));
}

/**
 * E-mails candidats déjà portés par un compte `users` qui ne peut PAS être rapproché : un
 * compte non-élève, ou un élève déjà lié à un autre joueur. Un élève ForetMap libre portant
 * cet e-mail sera au contraire réutilisé par le pont (rapprochement), donc n'est pas une erreur.
 */
async function loadBlockedEmails(candidates) {
  if (candidates.length === 0) return new Set();
  const placeholders = candidates.map(() => '?').join(', ');
  const rows = await queryAll(
    `SELECT u.email
       FROM users u
       LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      WHERE u.email IS NOT NULL
        AND LOWER(TRIM(u.email)) IN (${placeholders})
        AND (u.user_type <> 'student' OR p.id IS NOT NULL)`,
    candidates,
  );
  return new Set(rows.map((row) => normalizeLower(row.email)));
}

/**
 * Valide puis (hors dryRun) crée les joueurs GL décrits par les lignes importées.
 *
 * @param {Array<object>} parsedRows — lignes brutes issues de `resolveImportRows`
 *   (déjà bornées par MAX_IMPORT_ROWS côté route).
 * @param {{ dryRun?: boolean }} options
 * @returns {Promise<{totals: {received: number, valid: number, skipped_invalid: number, created: number, reused_existing: number}, errors: Array, credentials: Array}>}
 *   `credentials` : identifiants des comptes créés (mot de passe en clair, généré ou fourni),
 *   à distribuer aux élèves — jamais renvoyé ailleurs.
 */
async function importPlayersFromRows(parsedRows, { dryRun = false } = {}) {
  const classRows = await queryAll('SELECT id, name FROM gl_classes');
  const classIdByName = new Map(classRows.map((row) => [normalizeLower(row.name), Number(row.id)]));

  const payloads = parsedRows.map((row) => buildPlayerImportPayload(row));
  const pseudoCandidates = [
    ...new Set(payloads.filter((p) => p.pseudo).map((p) => p.pseudo.toLowerCase())),
  ];
  const emailCandidates = [
    ...new Set(payloads.filter((p) => p.email).map((p) => p.email.toLowerCase())),
  ];
  const knownPseudos = await loadKnownPseudos(pseudoCandidates);
  const blockedEmails = await loadBlockedEmails(emailCandidates);
  const seenEmails = new Set();

  const errors = [];
  const validRows = [];
  for (let i = 0; i < payloads.length; i += 1) {
    const rowNumber = i + 2;
    const payload = payloads[i];
    const rowErrors = validatePlayerImportPayload(payload, rowNumber, { passwordMinLength: 4 });
    const normalizedPseudo = payload.pseudo ? payload.pseudo.toLowerCase() : null;
    const normalizedClass = payload.className ? payload.className.toLowerCase() : null;

    if (normalizedPseudo && !PSEUDO_RE.test(normalizedPseudo)) {
      rowErrors.push({
        row: rowNumber,
        field: 'pseudo',
        error: PSEUDO_INVALID_MSG,
      });
    }
    if (normalizedPseudo && knownPseudos.has(normalizedPseudo)) {
      rowErrors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
    }
    const normalizedEmail = payload.email ? payload.email.toLowerCase() : null;
    if (normalizedEmail && !PLAYER_EMAIL_RE.test(normalizedEmail)) {
      rowErrors.push({ row: rowNumber, field: 'email', error: 'Email invalide' });
    }
    if (
      normalizedEmail &&
      (blockedEmails.has(normalizedEmail) || seenEmails.has(normalizedEmail))
    ) {
      rowErrors.push({ row: rowNumber, field: 'email', error: 'Email déjà utilisé' });
    }
    const classId = normalizedClass ? classIdByName.get(normalizedClass) : null;
    if (!classId) {
      rowErrors.push({ row: rowNumber, field: 'className', error: 'Classe introuvable' });
    }
    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }
    knownPseudos.add(normalizedPseudo);
    if (normalizedEmail) seenEmails.add(normalizedEmail);
    validRows.push({
      rowNumber,
      firstName: payload.firstName,
      lastName: payload.lastName,
      pseudo: normalizedPseudo,
      email: normalizedEmail,
      classId,
      className: payload.className,
      password: payload.password || null,
    });
  }

  let created = 0;
  let reusedExisting = 0;
  const credentials = [];
  if (!dryRun && validRows.length > 0) {
    const gameplayDefaults = getDefaultVitalityFromSettings(await getGameplaySettings());
    // Hachages en amont, en parallèle borné : le coût bcrypt domine l'import.
    const hashed = await mapWithConcurrency(validRows, BCRYPT_CONCURRENCY, async (row) => {
      const generated = !row.password;
      const effectivePassword = row.password || buildGeneratedPassword();
      return {
        ...row,
        effectivePassword,
        generated,
        passwordHash: await bcrypt.hash(effectivePassword, 10),
      };
    });
    for (const row of hashed) {
      try {
        const foretmapLink = await upsertForetmapUserForGlPlayer({
          classId: row.classId,
          firstName: row.firstName,
          lastName: row.lastName,
          pseudo: row.pseudo,
          email: row.email,
          passwordHash: row.passwordHash,
          passwordMustReset: row.generated,
        });
        if (!foretmapLink.ok) {
          errors.push({
            row: row.rowNumber,
            field: 'pseudo',
            error: foretmapLink.error || 'Liaison ForetMap impossible',
          });
          continue;
        }
        await execute(
          `INSERT INTO gl_players
          (class_id, team_id, first_name, last_name, pseudo,
           linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [
            row.classId,
            row.firstName,
            row.lastName,
            row.pseudo,
            foretmapLink.user.id,
            gameplayDefaults.health,
            gameplayDefaults.power,
          ],
        );
        created += 1;
        if (foretmapLink.reusedExisting) reusedExisting += 1;
        credentials.push({
          row: row.rowNumber,
          pseudo: row.pseudo,
          firstName: row.firstName,
          lastName: row.lastName,
          className: row.className,
          // Compte ForetMap existant rapproché : son mot de passe est conservé, celui du
          // fichier (ou généré) n'a PAS été appliqué — l'élève garde ses identifiants.
          password: foretmapLink.reusedExisting ? null : row.effectivePassword,
          generated: foretmapLink.reusedExisting ? false : row.generated,
          reusedExisting: !!foretmapLink.reusedExisting,
          emailConflict: !!foretmapLink.emailConflict,
        });
      } catch (err) {
        const code = String(err?.code || '');
        if (code === 'ER_DUP_ENTRY') {
          errors.push({
            row: row.rowNumber,
            field: 'pseudo',
            error: 'Pseudo déjà utilisé',
          });
          continue;
        }
        throw err;
      }
    }
  }

  return {
    totals: {
      received: parsedRows.length,
      valid: validRows.length,
      skipped_invalid: errors.length > 0 ? parsedRows.length - validRows.length : 0,
      created,
      reused_existing: reusedExisting,
    },
    errors,
    credentials,
  };
}

module.exports = { importPlayersFromRows };
