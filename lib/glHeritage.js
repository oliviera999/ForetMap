'use strict';

/**
 * « Tenir à deux » v2 — Héritage (sort SL033, spec § 10) : au seuil, un élève lègue 2 unités
 * (ressource au choix) à un élève pour le chapitre suivant. La ligne attend dans
 * `gl_game_heritages` et se verse au passage `draft → live` de la prochaine partie de la
 * classe (`appliquerHeritagesTx`, appelée par routes/gl/games/status.js). Le coût du sort a
 * déjà été débité au lancement : l'héritage ne crée pas de ressource, il la déplace.
 */

const { insertGameEvent } = require('./glGameEvents');
const { applyPlayerVitalityDelta, resolveVitalityCaps } = require('./glVitality');

function fail(code, status = 400) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeRessource(v) {
  const s = String(v || '').toLowerCase();
  if (['health', 'coeurs', 'coeur', 'hearts'].includes(s)) return 'health';
  if (['power', 'gemmes', 'gemme', 'gems'].includes(s)) return 'power';
  return null;
}

async function enregistrerHeritageTx(
  tx,
  { gameId, classId, draft, legatairePlayerId, beneficiairePlayerId, ressource, montant = 2 },
) {
  const res = normalizeRessource(ressource);
  if (!res) throw fail('SPELL_PARAM_RESSOURCE', 400);
  if (!Number.isInteger(legatairePlayerId) || legatairePlayerId <= 0)
    throw fail('SPELL_PARAM_LEGATAIRE', 400);
  if (!Number.isInteger(beneficiairePlayerId) || beneficiairePlayerId <= 0)
    throw fail('SPELL_PARAM_BENEFICIAIRE', 400);
  const benef = await tx.queryOne(
    'SELECT id FROM gl_players WHERE id = ? AND class_id = ? LIMIT 1',
    [beneficiairePlayerId, classId],
  );
  if (!benef) throw fail('SPELL_PARAM_BENEFICIAIRE', 404);
  const r = await tx.execute(
    `INSERT INTO gl_game_heritages (game_id, class_id, legataire_player_id, beneficiaire_player_id, ressource, montant, draft_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      gameId,
      classId,
      legatairePlayerId,
      beneficiairePlayerId,
      res,
      Math.max(1, Number(montant) || 2),
      draft?.id || null,
    ],
  );
  return {
    id: r.insertId,
    ressource: res,
    montant: Math.max(1, Number(montant) || 2),
    beneficiairePlayerId,
  };
}

/** Verse les héritages en attente de la classe à l'ouverture d'une partie (idempotent). */
async function appliquerHeritagesTx(tx, { gameId, classId, settings }) {
  const rows = await tx.queryAll(
    `SELECT id, beneficiaire_player_id, ressource, montant FROM gl_game_heritages
      WHERE class_id = ? AND applique_at IS NULL AND game_id <> ? ORDER BY id ASC FOR UPDATE`,
    [classId, gameId],
  );
  const caps = resolveVitalityCaps(settings);
  const events = [];
  for (const h of rows) {
    const delta =
      h.ressource === 'power'
        ? { powerDelta: Number(h.montant) }
        : { healthDelta: Number(h.montant) };
    await applyPlayerVitalityDelta(tx, { playerId: h.beneficiaire_player_id, ...delta, caps });
    await tx.execute(
      'UPDATE gl_game_heritages SET applique_game_id = ?, applique_at = NOW() WHERE id = ?',
      [gameId, h.id],
    );
    events.push(
      await insertGameEvent(tx, {
        gameId,
        actorType: 'system',
        eventType: 'heritage_recu',
        payload: {
          heritageId: Number(h.id),
          playerId: Number(h.beneficiaire_player_id),
          ressource: h.ressource,
          montant: Number(h.montant),
          private: true,
          publicKeys: ['heritageId'],
        },
      }),
    );
  }
  return { applied: rows.length, events };
}

module.exports = { enregistrerHeritageTx, appliquerHeritagesTx, normalizeRessource };
