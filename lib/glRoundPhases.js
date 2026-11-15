'use strict';

/**
 * « Tenir à deux » — chronométrage des phases d'un tour (`gl_game_round_phases`, migration 346).
 *
 * Une ligne par phase jouée (`ouverture`, `jeu`, `souffle`) : `started_at` à l'entrée dans la
 * phase, `ended_at` à la sortie. La phase `clos` n'a pas de ligne : elle ferme la dernière.
 * Écritures (dans la transaction de l'appelant) : `ouvrirTourTx`, `changerPhaseTx`
 * (`lib/glTour.js`), clôture du Seuil (`lib/glSeuil.js`). Lectures : diagnostic
 * (`lib/glDiagnostic.js`, outil MCP `gl_game_diagnostic`) et ligne « Ce tour : … » de la
 * console du prof. Aucune donnée d'élève.
 *
 * Les heures sont celles de la base (`NOW()`), comme `gl_game_rounds.started_at` : on mesure la
 * séance réelle, pas l'horloge simulée du banc.
 */

const PHASES_CHRONOMETREES = Object.freeze(['ouverture', 'jeu', 'souffle']);

/** Ouvre le chronomètre d'un tour : repart de zéro (un tour rouvert efface ses anciennes phases). */
async function demarrerTourTx(tx, { gameId, roundNumber }) {
  await tx.execute('DELETE FROM gl_game_round_phases WHERE game_id = ? AND round_number = ?', [
    gameId,
    roundNumber,
  ]);
  await tx.execute(
    `INSERT INTO gl_game_round_phases (game_id, round_number, phase, started_at)
     VALUES (?, ?, 'ouverture', NOW())`,
    [gameId, roundNumber],
  );
}

/** Ferme toute phase encore ouverte du tour (sortie de phase, clôture du tour ou Seuil). */
async function fermerPhasesTx(tx, { gameId, roundNumber }) {
  await tx.execute(
    'UPDATE gl_game_round_phases SET ended_at = NOW() WHERE game_id = ? AND round_number = ? AND ended_at IS NULL',
    [gameId, roundNumber],
  );
}

/**
 * Passage de phase : ferme la phase en cours, ouvre la suivante si elle se chronomètre
 * (`clos` ne fait que fermer).
 */
async function changerPhaseTx(tx, { gameId, roundNumber, phase }) {
  await fermerPhasesTx(tx, { gameId, roundNumber });
  if (!PHASES_CHRONOMETREES.includes(String(phase))) return;
  await tx.execute(
    `INSERT INTO gl_game_round_phases (game_id, round_number, phase, started_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE started_at = NOW(), ended_at = NULL`,
    [gameId, roundNumber, phase],
  );
}

/** Phases chronométrées d'une partie (toutes), ou d'un tour. */
async function loadRoundPhases(db, gameId, roundNumber = null) {
  const params = [gameId];
  let where = 'game_id = ?';
  if (roundNumber != null) {
    where += ' AND round_number = ?';
    params.push(roundNumber);
  }
  return db.queryAll(
    `SELECT round_number, phase, started_at, ended_at FROM gl_game_round_phases
      WHERE ${where} ORDER BY round_number ASC, started_at ASC`,
    params,
  );
}

function toDate(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Secondes entre deux instants, `null` si l'un manque. Jamais négatif. */
function secondsBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 1000));
}

/**
 * Durées par phase, tour par tour (pur).
 * @param {Array<{ round_number, phase, started_at, ended_at }>} rows
 * @returns {Array<{ number: number, phases: Record<string, number|null>, totalSecondes: number|null, complet: boolean }>}
 *   `phases[p]` en secondes, `null` si la phase est encore ouverte ; `complet` quand les
 *   phases jouées sont toutes fermées.
 */
function dureesParTour(rows) {
  const byRound = new Map();
  for (const row of rows || []) {
    const number = Number(row.round_number ?? row.roundNumber) || 0;
    const phase = String(row.phase || '');
    if (!number || !PHASES_CHRONOMETREES.includes(phase)) continue;
    if (!byRound.has(number)) byRound.set(number, { number, phases: {}, ouverte: false });
    const item = byRound.get(number);
    const duree = secondsBetween(row.started_at ?? row.startedAt, row.ended_at ?? row.endedAt);
    item.phases[phase] = duree;
    if (duree == null) item.ouverte = true;
  }
  return [...byRound.values()]
    .sort((a, b) => a.number - b.number)
    .map(({ number, phases, ouverte }) => {
      const valeurs = Object.values(phases).filter((v) => v != null);
      return {
        number,
        phases,
        totalSecondes: valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null,
        complet: !ouverte && valeurs.length > 0,
      };
    });
}

/** « 1 min 10 », « 0 min 50 », « 12 min 05 » : minutes et secondes sur deux chiffres. */
function formatDuree(secondes) {
  const total = Math.max(0, Math.round(Number(secondes) || 0));
  const minutes = Math.floor(total / 60);
  const reste = String(total % 60).padStart(2, '0');
  return `${minutes} min ${reste}`;
}

/** « ouverture 1 min 10, jeu 6 min 40, souffle 0 min 50 » (phases jouées, dans l'ordre). */
function formatDureesTour(phases) {
  return PHASES_CHRONOMETREES.filter((p) => phases && phases[p] != null)
    .map((p) => `${p} ${formatDuree(phases[p])}`)
    .join(', ');
}

module.exports = {
  PHASES_CHRONOMETREES,
  demarrerTourTx,
  fermerPhasesTx,
  changerPhaseTx,
  loadRoundPhases,
  secondsBetween,
  dureesParTour,
  formatDuree,
  formatDureesTour,
};
