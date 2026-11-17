'use strict';

/**
 * Relais (SL044) pendant que les tablettes jouent en parallèle.
 *
 * Le lancement d'un sort ouvre un instantané REPEATABLE READ (lecture des parts du pot)
 * avant d'exécuter l'effet. `loadTeams` renvoie cet instantané : sans lecture verrouillée,
 * un jet commité entre-temps reste invisible, et l'équipe est reposée sur la case du lanceur.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');
const { applySpellEffectTx } = require('../lib/glSpellEffectsApply');

let ctx;

async function poser(teamId, marker) {
  await db.execute(
    'UPDATE gl_teams SET position_marker_id = ?, position_x_pct = NULL, position_y_pct = NULL WHERE id = ?',
    [marker.id, teamId],
  );
}

async function caseDe(teamId) {
  const row = await db.queryOne('SELECT position_marker_id AS m FROM gl_teams WHERE id = ?', [
    teamId,
  ]);
  return ctx.markers.findIndex((m) => Number(m.id) === Number(row.m));
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: `relais-${Date.now()}`, plateau: 2 });
});

test('Relais : un jet commité après l’instantané n’est pas écrasé', async () => {
  const gnomes = ctx.teams[0];
  const secondes = ctx.teams[1];
  const retard = ctx.teams[2];
  const autres = ctx.teams[3];
  // 12 cases (0…11, la dernière est le camp). Le lanceur est en 4 ; une équipe est en 1
  // dans l'instantané, les deux autres devant lui.
  await poser(gnomes.id, ctx.markers[4]);
  await poser(retard.id, ctx.markers[1]);
  await poser(secondes.id, ctx.markers[6]);
  await poser(autres.id, ctx.markers[7]);

  let ouvert;
  const instantanePris = new Promise((resolve) => {
    ouvert = resolve;
  });
  let deplacee;
  const jetCommite = new Promise((resolve) => {
    deplacee = resolve;
  });

  const effet = db.withTransaction(async (tx) => {
    // Même naissance d'instantané que `finalizeCastTx` (lecture simple avant l'effet).
    await tx.queryOne('SELECT id FROM gl_games WHERE id = ?', [ctx.game.id]);
    ouvert();
    await jetCommite;
    return applySpellEffectTx(tx, {
      gameId: ctx.game.id,
      draft: { id: 1, team_id: gnomes.id, partner_team_id: null },
      spell: {
        spellCode: 'SL044',
        nom: 'Relais',
        execution: 'auto',
        effetCourt: 'l’équipe la plus en retard rejoint la case du lanceur',
      },
      params: {},
      roundNumber: 0,
      settings: null,
      actor: { actorType: 'mj', actorId: '1' },
    });
  });

  try {
    await instantanePris;
    // La tablette de l'équipe en retard jette et commite : elle passe devant tout le monde.
    await poser(retard.id, ctx.markers[9]);
    deplacee();
    await effet;
  } finally {
    deplacee();
  }

  assert.equal(await caseDe(retard.id), 9, 'le jet déjà commis reste sur le plateau');
  assert.equal(
    await caseDe(secondes.id),
    4,
    'le Relais emmène l’équipe qui est vraiment la plus en retard',
  );
  assert.equal(await caseDe(gnomes.id), 4);
  assert.equal(await caseDe(autres.id), 7);
});
