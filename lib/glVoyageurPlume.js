'use strict';

/**
 * « Tenir à deux » — pages écrites par un élève et relues par le prof (`gl_voyageur_plumes`).
 * Ensemble unifié (M23) : la Plume est sortie du grimoire du voyageur ; la seule source vivante
 * est la **Lettre** (sort SL048, `lib/glLettreMentorat.js`). Les anciennes lignes `plume`
 * restent lisibles et relisables.
 *
 * Validée, la page entre au carnet de la classe comme page `vierge` de l'élève
 * (`gl_lore_feuillets` type `vierge`, code `plume-<id>`), visible de toutes les équipes de la
 * partie (`discovered`), et au carnet personnel de l'auteur. L7 : c'est une page **en marge**,
 * elle ne compte pas pour le carnet complet. Un « pas encore » rend la Lettre à son auteur,
 * avec une piste : il la réécrit sans repayer.
 */

const { insertGameEvent } = require('./glGameEvents');
const { upsertFeuilletState, upsertPlayerFeuilletState } = require('./glLoreFeuillets');

function fail(code, status = 400) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

function cleanText(v, max) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function proposerPlumeTx(tx, { playerId, gameId = null, source = 'plume', titre, texte }) {
  const t = cleanText(titre, 160);
  const body = String(texte || '').trim();
  if (t.length < 3) throw fail('PLUME_TITRE', 400);
  if (body.length < 20 || body.length > 4000) throw fail('PLUME_TEXTE', 400);
  const r = await tx.execute(
    `INSERT INTO gl_voyageur_plumes (player_id, game_id, source, titre, texte, statut, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'proposee', NOW(), NOW())`,
    [playerId, gameId, source === 'lettre' ? 'lettre' : 'plume', t, body],
  );
  // File unique du prof (lot 2) : la page attend sa relecture (aucun texte d'élève ici).
  if (gameId != null) {
    try {
      await require('./glDemandes').creerDemandeSiPartieEnCoursTx(tx, {
        gameId,
        kind: 'plume',
        refId: Number(r.insertId),
      });
    } catch (err) {
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  return { id: r.insertId, titre: t, statut: 'proposee' };
}

async function listPlumes(db, { gameId = null, playerId = null, statut = null } = {}) {
  const where = [];
  const params = [];
  if (gameId != null) {
    where.push('p.game_id = ?');
    params.push(gameId);
  }
  if (playerId != null) {
    where.push('p.player_id = ?');
    params.push(playerId);
  }
  if (statut) {
    where.push('p.statut = ?');
    params.push(statut);
  }
  return db.queryAll(
    `SELECT p.id, p.player_id AS playerId, p.game_id AS gameId, p.source, p.amorce, p.titre, p.texte,
            p.statut, p.piste, p.valide_at AS valideAt, p.created_at AS createdAt, pl.pseudo
       FROM gl_voyageur_plumes p INNER JOIN gl_players pl ON pl.id = p.player_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.id DESC LIMIT 200`,
    params,
  );
}

/**
 * Relecture du prof : `valider` → page au carnet de la classe ; `pas_encore` (avec une piste) →
 * la Lettre retourne à son auteur, qui la réécrit sans repayer. `refuser` ne vaut que pour une
 * ancienne Plume : une Lettre refusée devient un « pas encore » (elle est payée, jamais perdue).
 */
async function validerPlumeTx(tx, { plumeId, gameId, decision, actorId, piste = null }) {
  const plume = await tx.queryOne(
    'SELECT * FROM gl_voyageur_plumes WHERE id = ? LIMIT 1 FOR UPDATE',
    [plumeId],
  );
  if (!plume) throw fail('PLUME_INTROUVABLE', 404);
  if (plume.game_id != null && Number(plume.game_id) !== Number(gameId))
    throw fail('PLUME_AUTRE_PARTIE', 409);
  if (String(plume.statut) !== 'proposee') throw fail('PLUME_DEJA_RELUE', 409);
  await require('./glDemandes').resoudreDemandeTx(tx, {
    gameId,
    kind: 'plume',
    refId: Number(plumeId),
  });
  const lettre = String(plume.source) === 'lettre';
  const statut =
    decision === 'pas_encore' || (lettre && decision === 'refuser')
      ? 'pas_encore'
      : decision === 'refuser'
        ? 'refusee'
        : 'validee';
  if (statut === 'pas_encore') {
    await tx.execute(
      'UPDATE gl_voyageur_plumes SET statut = ?, piste = ?, valide_par = ?, updated_at = NOW() WHERE id = ?',
      [statut, cleanText(piste, 400) || null, String(actorId), plumeId],
    );
    return { id: Number(plumeId), statut, events: [] };
  }
  await tx.execute(
    'UPDATE gl_voyageur_plumes SET statut = ?, valide_par = ?, valide_at = NOW(), updated_at = NOW() WHERE id = ?',
    [statut, String(actorId), plumeId],
  );
  if (statut === 'refusee') return { id: Number(plumeId), statut, events: [] };
  const game = await tx.queryOne(
    `SELECT g.id, g.chapter_id, ch.plateau_number, ch.biome FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  const code = `plume-${plumeId}`;
  const auteur = await tx.queryOne('SELECT pseudo FROM gl_players WHERE id = ? LIMIT 1', [
    plume.player_id,
  ]);
  await tx.execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, incipit, texte, texte_accessible, biome_slug, plateau_number,
        vierge, statut, created_at, updated_at)
     VALUES (?, 'vierge', ?, ?, ?, ?, ?, ?, 1, 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE titre = VALUES(titre), texte = VALUES(texte), texte_accessible = VALUES(texte_accessible), statut = 'actif', updated_at = NOW()`,
    [
      code,
      plume.titre,
      String(plume.texte).slice(0, 160),
      plume.texte,
      plume.texte,
      game?.biome || null,
      game?.plateau_number != null ? Number(game.plateau_number) : null,
    ],
  );
  const teams = await tx.queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [gameId]);
  for (const t of teams) {
    await upsertFeuilletState(tx, {
      gameId,
      teamId: t.id,
      feuilletCode: code,
      status: 'discovered',
      effacementPct: 0,
      unlockedVia: 'manual',
      discoveredByPlayerId: String(plume.player_id),
      discoveredByName: auteur?.pseudo || null,
      discoveredSource: plume.source,
    });
  }
  await upsertPlayerFeuilletState(tx, {
    playerId: Number(plume.player_id),
    feuilletCode: code,
    status: 'read',
    effacementPct: 0,
    acquiredVia: 'decouverte',
  });
  const event = await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'plume_validee',
    payload: {
      plumeId: Number(plumeId),
      feuilletCode: code,
      titre: plume.titre,
      source: plume.source,
    },
  });
  return { id: Number(plumeId), statut, feuilletCode: code, events: [event] };
}

module.exports = { proposerPlumeTx, listPlumes, validerPlumeTx, cleanText };
