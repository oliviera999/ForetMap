'use strict';

/**
 * Import de joueurs Gnomes & Licornes depuis des lignes CSV/XLSX déjà parsées.
 *
 * Extrait de `routes/gl/admin.js` (POST /players/import) — rapport d'import et
 * messages strictement inchangés. Correction du N+1 relevé à l'audit : l'unicité
 * pseudo/email n'est plus vérifiée en chargeant TOUTE la table `gl_players`
 * (`SELECT pseudo FROM gl_players` / `SELECT email …` sans LIMIT) mais via
 * `WHERE … IN (…)` restreint aux valeurs présentes dans le fichier importé
 * (bornées par MAX_IMPORT_ROWS côté route). `LOWER(TRIM(…))` reproduit la
 * normalisation `trim().toLowerCase()` que l'ancien code appliquait en JS.
 */

const bcrypt = require('bcryptjs');
const { queryAll, execute } = require('../../database');
const {
  PSEUDO_RE,
  buildPlayerImportPayload,
  validatePlayerImportPayload,
} = require('../glPlayersImport');
const { getDefaultVitalityFromSettings } = require('../glVitality');
const { getGameplaySettings } = require('../glSettings');
const { upsertForetmapUserForGlPlayer } = require('../glGroupBridge');
const { buildGeneratedPassword, PLAYER_EMAIL_RE } = require('./adminRouteHelpers');

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

/** Emails déjà pris parmi les emails candidats (minuscules) du fichier importé. */
async function loadKnownEmails(candidates) {
  if (candidates.length === 0) return new Set();
  const rows = await queryAll(
    `SELECT email FROM gl_players WHERE email IS NOT NULL AND LOWER(TRIM(email)) IN (${candidates.map(() => '?').join(', ')})`,
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
 * @returns {Promise<{totals: {received: number, valid: number, skipped_invalid: number, created: number}, errors: Array}>}
 *   le rapport d'import (contrat identique à l'ancien handler inline).
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
  const knownEmails = await loadKnownEmails(emailCandidates);

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
        error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)',
      });
    }
    if (normalizedPseudo && knownPseudos.has(normalizedPseudo)) {
      rowErrors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
    }
    const normalizedEmail = payload.email ? payload.email.toLowerCase() : null;
    if (normalizedEmail && !PLAYER_EMAIL_RE.test(normalizedEmail)) {
      rowErrors.push({ row: rowNumber, field: 'email', error: 'Email invalide' });
    }
    if (normalizedEmail && knownEmails.has(normalizedEmail)) {
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
    if (normalizedEmail) knownEmails.add(normalizedEmail);
    validRows.push({
      rowNumber,
      firstName: payload.firstName,
      lastName: payload.lastName,
      pseudo: normalizedPseudo,
      email: normalizedEmail,
      classId,
      password: payload.password || null,
    });
  }

  let created = 0;
  if (!dryRun) {
    for (const row of validRows) {
      const effectivePassword = row.password || buildGeneratedPassword();
      const passwordHash = await bcrypt.hash(effectivePassword, 10);
      const passwordMustReset = row.password ? 0 : 1;
      try {
        const gameplayDefaults = getDefaultVitalityFromSettings(await getGameplaySettings());
        const foretmapLink = await upsertForetmapUserForGlPlayer({
          classId: row.classId,
          firstName: row.firstName,
          lastName: row.lastName,
          pseudo: row.pseudo,
          email: row.email,
          passwordHash,
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
          (class_id, team_id, first_name, last_name, email, pseudo, password_must_reset, password_hash,
           linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [
            row.classId,
            row.firstName,
            row.lastName,
            row.email,
            row.pseudo,
            passwordMustReset,
            passwordHash,
            foretmapLink.user.id,
            gameplayDefaults.health,
            gameplayDefaults.power,
          ],
        );
        created += 1;
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
    },
    errors,
  };
}

module.exports = { importPlayersFromRows };
