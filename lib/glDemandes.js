'use strict';

/**
 * « Tenir à deux » — demandes au prof (`gl_game_demandes`, migration 348).
 *
 * Tout flux qui attend un geste du prof écrit ici une ligne : la console les lit en **file
 * unique**, la plus ancienne en haut. Garde-fou 11 : aucune demande ne reste en attente sans
 * sortie automatique — `annulerDemandesTx` les ferme au changement de phase, à la clôture du
 * tour et au Seuil (`lib/glTour.js`, `lib/glSeuil.js`).
 *
 * Une demande pointe sa source par (`kind`, `ref_id`) : l'identifiant de la saisie de dés, du
 * brouillon de sort, du défi… Créer deux fois la même demande en attente ne fait rien. Aucune
 * donnée d'élève dans `payload_json` (équipes, codes, libellés seulement).
 */

/** Familles de demandes, dans l'ordre de leur libellé à l'écran. */
const DEMANDE_KINDS = Object.freeze([
  'des_a_valider',
  'jet_en_suspens',
  'sort_a_appliquer',
  'nommer',
  'plume',
  'chimere',
  'presence_a_confirmer',
  'defi_case',
]);

/** Demandes qui ne survivent pas à la sortie de la phase `jeu` (elles n'ont plus d'objet). */
const KINDS_DE_LA_PHASE_JEU = Object.freeze([
  'des_a_valider',
  'jet_en_suspens',
  'presence_a_confirmer',
]);

function parsePayload(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function formatDemande(row) {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    roundNumber: Number(row.round_number) || 0,
    teamId: row.team_id != null ? Number(row.team_id) : null,
    kind: String(row.kind),
    refId: row.ref_id != null ? String(row.ref_id) : null,
    payload: parsePayload(row.payload_json),
    statut: String(row.statut),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  };
}

/**
 * Crée une demande en attente (idempotent sur `kind` + `refId` tant qu'elle attend).
 * @returns {Promise<number>} identifiant de la demande
 */
async function creerDemandeTx(
  tx,
  { gameId, roundNumber = 0, teamId = null, kind, refId = null, payload = null },
) {
  if (!DEMANDE_KINDS.includes(String(kind))) throw new Error(`Demande inconnue : ${kind}`);
  const ref = refId != null ? String(refId) : null;
  if (ref != null) {
    const existing = await tx.queryOne(
      `SELECT id FROM gl_game_demandes
        WHERE game_id = ? AND kind = ? AND ref_id = ? AND statut = 'en_attente' LIMIT 1`,
      [gameId, kind, ref],
    );
    if (existing) return Number(existing.id);
  }
  const result = await tx.execute(
    `INSERT INTO gl_game_demandes (game_id, round_number, team_id, kind, ref_id, payload_json, statut, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'en_attente', NOW())`,
    [gameId, Number(roundNumber) || 0, teamId, kind, ref, payload ? JSON.stringify(payload) : null],
  );
  return Number(result.insertId);
}

/** Ferme la demande d'une source (`traitee` par défaut). Renvoie le nombre de lignes fermées. */
async function resoudreDemandeTx(tx, { gameId, kind, refId, statut = 'traitee' }) {
  const result = await tx.execute(
    `UPDATE gl_game_demandes SET statut = ?, resolved_at = NOW()
      WHERE game_id = ? AND kind = ? AND ref_id = ? AND statut = 'en_attente'`,
    [statut === 'annulee' ? 'annulee' : 'traitee', gameId, kind, String(refId)],
  );
  return Number(result?.affectedRows || 0);
}

/**
 * Sortie automatique : annule les demandes en attente d'une partie (toutes, ou celles des
 * familles données ; `roundNumber` borne à un tour).
 * @returns {Promise<number>} nombre de demandes annulées
 */
async function annulerDemandesTx(tx, { gameId, kinds = null, roundNumber = null }) {
  const where = ['game_id = ?', "statut = 'en_attente'"];
  const params = [gameId];
  if (Array.isArray(kinds) && kinds.length) {
    where.push(`kind IN (${kinds.map(() => '?').join(', ')})`);
    params.push(...kinds);
  }
  if (roundNumber != null) {
    where.push('round_number = ?');
    params.push(Number(roundNumber) || 0);
  }
  const result = await tx.execute(
    `UPDATE gl_game_demandes SET statut = 'annulee', resolved_at = NOW() WHERE ${where.join(' AND ')}`,
    params,
  );
  return Number(result?.affectedRows || 0);
}

/** Demandes d'une partie, la plus ancienne en haut (`statut` : `en_attente` par défaut). */
async function listDemandes(db, gameId, { statut = 'en_attente' } = {}) {
  const rows = await db.queryAll(
    `SELECT id, game_id, round_number, team_id, kind, ref_id, payload_json, statut, created_at, resolved_at
       FROM gl_game_demandes
      WHERE game_id = ? ${statut ? 'AND statut = ?' : ''}
      ORDER BY created_at ASC, id ASC`,
    statut ? [gameId, statut] : [gameId],
  );
  return rows.map(formatDemande);
}

async function compterDemandesEnAttente(db, gameId) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente'",
    [gameId],
  );
  return Number(row?.n) || 0;
}

module.exports = {
  DEMANDE_KINDS,
  KINDS_DE_LA_PHASE_JEU,
  formatDemande,
  creerDemandeTx,
  resoudreDemandeTx,
  annulerDemandesTx,
  listDemandes,
  compterDemandesEnAttente,
};
