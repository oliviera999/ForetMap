'use strict';

/**
 * « Tenir à deux », lot 2, § 7 — défi de case. Léger et non bloquant.
 *
 * Une équipe qui s'arrête sur une case « Défi d'équipe » (ou la franchit, réglage
 * `defi_declenchement = passage`) reçoit un défi du plateau, tiré sans répétition dans la partie
 * (on recommence la liste épuisée). **Le tour continue sans attendre.** L'équipe le prépare
 * pendant la semaine ; le prof juge « Relevé » ou « Pas encore », à la séance suivante ou tout de
 * suite. Relevé : le voile recule de `defi_recul` cases. Pas encore : rien. Jamais de ressource.
 * Au Seuil, un défi encore à préparer est annulé, sans effet.
 *
 * Le `critere` n'est servi qu'au prof : ni élève, ni tablette, ni projection.
 */

const { insertGameEvent } = require('./glGameEvents');
const { isDefiMarker } = require('./shared/glMarkerEventConfigCore');
const { creerDemandeTx, resoudreDemandeTx } = require('./glDemandes');
const glRandom = require('./glRandom');

const STATUTS = Object.freeze(['a_preparer', 'releve', 'pas_encore', 'annule']);

function fail(code, status) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

/** Les défis de case sont-ils actifs pour ces réglages résolus ? */
function defisActifs(resolved) {
  return resolved?.defis_case !== false;
}

function formatDefi(row, { avecCritere = false } = {}) {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    markerId: row.marker_id != null ? Number(row.marker_id) : null,
    code: String(row.defi_code),
    roundNumber: Number(row.round_number) || 0,
    statut: String(row.statut),
    titre: row.titre != null ? String(row.titre) : String(row.defi_code),
    consigne: row.consigne != null ? String(row.consigne) : '',
    preparation: row.preparation != null ? String(row.preparation) : null,
    notion: row.notion != null ? String(row.notion) : null,
    dureeS: Number(row.duree_s) || 60,
    createdAt: row.created_at,
    decidedAt: row.decided_at || null,
    ...(avecCritere ? { critere: row.critere != null ? String(row.critere) : null } : {}),
  };
}

/**
 * Tire un défi du plateau, sans répétition dans la partie : les codes déjà tirés depuis la
 * dernière remise à zéro sont écartés ; la liste épuisée recommence. Tirage reproductible sur le
 * banc (`lib/glRandom.js`).
 * @returns {Promise<object|null>} ligne du catalogue, ou `null` si le plateau n'a aucun défi
 */
async function tirerDefiTx(tx, { gameId, plateau }) {
  const catalogue = await tx.queryAll(
    `SELECT code, titre, consigne, preparation, critere, notion, duree_s FROM gl_tenir_defis_cases
      WHERE plateau = ? AND actif = 1 ORDER BY ordre ASC, code ASC`,
    [Number(plateau) || 0],
  );
  if (!catalogue.length) return null;
  const codes = new Set(catalogue.map((d) => String(d.code)));
  const tires = (
    await tx.queryAll(
      'SELECT defi_code FROM gl_game_defis_case WHERE game_id = ? ORDER BY id ASC',
      [gameId],
    )
  )
    .map((r) => String(r.defi_code))
    .filter((code) => codes.has(code));
  // Tirages du cycle en cours : ce qui reste après les cycles complets déjà épuisés.
  const cycle = new Set(tires.slice(tires.length - (tires.length % catalogue.length)));
  const restants = catalogue.filter((d) => !cycle.has(String(d.code)));
  const choix = restants.length ? restants : catalogue;
  return choix[glRandom.forGame(gameId).randomInt(choix.length)];
}

/**
 * Cases « Défi d'équipe » qu'une arrivée déclenche. `arret` : la case d'arrivée. `passage` :
 * toutes celles franchies depuis la case de départ (quand elle est connue), arrivée comprise.
 */
function casesDeclenchees({ markers, marker, fromMarkerId = null, declenchement = 'arret' }) {
  const index = (id) => markers.findIndex((m) => Number(m.id) === Number(id));
  const to = index(marker?.id);
  if (to < 0) return [];
  if (declenchement !== 'passage' || fromMarkerId == null) {
    return isDefiMarker(marker) ? [marker] : [];
  }
  const from = index(fromMarkerId);
  if (from < 0 || from >= to) return isDefiMarker(marker) ? [marker] : [];
  return markers.slice(from + 1, to + 1).filter(isDefiMarker);
}

/**
 * Réception d'un défi par une équipe. Une fois par équipe et par case (par tour en `arret`,
 * pour toute la partie en `passage`). Évènement `defi_case_recu`, ligne dans la file du prof.
 * @returns {Promise<Array>} évènements insérés
 */
async function recevoirDefisTx(
  tx,
  { gameId, teamId, game, resolved, markers, marker, fromMarkerId = null, roundNumber = 0 },
) {
  if (!defisActifs(resolved)) return [];
  const declenchement = resolved?.defi_declenchement === 'passage' ? 'passage' : 'arret';
  const cases = casesDeclenchees({ markers, marker, fromMarkerId, declenchement });
  const events = [];
  for (const c of cases) {
    const deja = await tx.queryOne(
      `SELECT id FROM gl_game_defis_case
        WHERE game_id = ? AND team_id = ? AND marker_id = ?
          ${declenchement === 'passage' ? '' : 'AND round_number = ?'}
        LIMIT 1`,
      declenchement === 'passage'
        ? [gameId, teamId, c.id]
        : [gameId, teamId, c.id, Number(roundNumber) || 0],
    );
    if (deja) continue;
    const defi = await tirerDefiTx(tx, { gameId, plateau: game?.plateau_number });
    if (!defi) continue;
    const insert = await tx.execute(
      `INSERT INTO gl_game_defis_case (game_id, team_id, marker_id, defi_code, round_number, statut, created_at)
       VALUES (?, ?, ?, ?, ?, 'a_preparer', NOW())`,
      [gameId, teamId, c.id, defi.code, Number(roundNumber) || 0],
    );
    const defiId = Number(insert.insertId);
    await creerDemandeTx(tx, {
      gameId,
      roundNumber,
      teamId,
      kind: 'defi_case',
      refId: defiId,
      // Le critère reste au prof : la file est la sienne.
      payload: { code: defi.code, titre: defi.titre, dureeS: Number(defi.duree_s) || 60 },
    });
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType: 'system',
        eventType: 'defi_case_recu',
        payload: {
          defiId,
          code: String(defi.code),
          titre: String(defi.titre),
          markerId: Number(c.id),
          markerLabel: c.label || null,
          roundNumber: Number(roundNumber) || 0,
        },
      }),
    );
  }
  return events;
}

/**
 * Jugement du prof : une seule décision. Relevé → le voile recule de `defi_recul` cases (même
 * fonction que le recul du carnet complet) ; pas encore → rien. Aucune ressource.
 * @throws 404 `DEFI_INTROUVABLE`, 409 `DEFI_DEJA_JUGE`
 */
async function deciderDefiTx(tx, { gameId, defiId, releve, actorId, resolved }) {
  const row = await tx.queryOne(
    `SELECT d.*, c.titre FROM gl_game_defis_case d
       LEFT JOIN gl_tenir_defis_cases c ON c.code = d.defi_code
      WHERE d.id = ? AND d.game_id = ? LIMIT 1 FOR UPDATE`,
    [defiId, gameId],
  );
  if (!row) throw fail('DEFI_INTROUVABLE', 404);
  if (String(row.statut) !== 'a_preparer') throw fail('DEFI_DEJA_JUGE', 409);
  const statut = releve ? 'releve' : 'pas_encore';
  await tx.execute(
    'UPDATE gl_game_defis_case SET statut = ?, decided_at = NOW(), decided_by = ? WHERE id = ?',
    [statut, String(actorId), defiId],
  );
  await resoudreDemandeTx(tx, { gameId, kind: 'defi_case', refId: Number(defiId) });
  const recul = releve ? Math.max(0, Math.min(10, Number(resolved?.defi_recul ?? 2) || 0)) : 0;
  const events = [
    await insertGameEvent(tx, {
      gameId,
      teamId: Number(row.team_id),
      actorType: 'mj',
      actorId: String(actorId),
      eventType: releve ? 'defi_case_releve' : 'defi_case_pas_encore',
      payload: {
        defiId: Number(defiId),
        code: String(row.defi_code),
        titre: row.titre != null ? String(row.titre) : String(row.defi_code),
        ...(releve ? { recul } : {}),
      },
    }),
  ];
  if (releve && recul > 0) {
    const { retreatVoileTx } = require('./glVoile');
    events.push(
      ...(await retreatVoileTx(tx, { gameId, cases: recul, reason: 'defi_case', actorId })),
    );
  }
  return { defiId: Number(defiId), teamId: Number(row.team_id), statut, recul, events };
}

/** Sortie automatique (Seuil) : un défi encore à préparer est annulé, sans effet. */
async function annulerDefisEnCoursTx(tx, { gameId }) {
  try {
    const result = await tx.execute(
      `UPDATE gl_game_defis_case SET statut = 'annule', decided_at = NOW(), decided_by = 'seuil'
        WHERE game_id = ? AND statut = 'a_preparer'`,
      [gameId],
    );
    return Number(result?.affectedRows || 0);
  } catch (err) {
    if (err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return 0;
    throw err;
  }
}

/**
 * Défis d'une partie pour un spectateur : le prof les voit tous, avec le critère ; une équipe
 * (élève, tablette) voit les siens, sans critère ; la projection voit ceux à préparer de toutes
 * les équipes, sans critère (à la clôture du tour).
 */
async function listDefis(db, { gameId, viewer = 'projection', teamId = null }) {
  const where = ['d.game_id = ?'];
  const params = [gameId];
  if (viewer === 'team') {
    where.push('d.team_id = ?');
    params.push(Number(teamId) || 0);
  } else if (viewer !== 'mj') {
    where.push("d.statut = 'a_preparer'");
  }
  let rows = [];
  try {
    rows = await db.queryAll(
      `SELECT d.id, d.team_id, d.marker_id, d.defi_code, d.round_number, d.statut, d.created_at,
              d.decided_at, c.titre, c.consigne, c.preparation, c.critere, c.notion, c.duree_s
         FROM gl_game_defis_case d
         LEFT JOIN gl_tenir_defis_cases c ON c.code = d.defi_code
        WHERE ${where.join(' AND ')}
        ORDER BY d.id ASC`,
      params,
    );
  } catch (err) {
    if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  return rows.map((r) => formatDefi(r, { avecCritere: viewer === 'mj' }));
}

module.exports = {
  STATUTS,
  defisActifs,
  tirerDefiTx,
  casesDeclenchees,
  recevoirDefisTx,
  deciderDefiTx,
  annulerDefisEnCoursTx,
  listDefis,
};
