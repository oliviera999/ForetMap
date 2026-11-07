'use strict';
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { presentJournalEvent, buildTeamsById } = require('../lib/glJournalPresent');
const { presentTenirJournalEvent, TENIR_EVENT_TYPES } = require('../lib/glJournalPresentTenir');

const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|krâ|kraa|grise|\bfaux\b|raté|perdu|classement/i;
const teams = [
  { id: 1, name: 'Gnomes A' },
  { id: 2, name: 'Licornes B' },
];
const teamsById = buildTeamsById(teams);

function present(eventType, payload, teamId = 1, forPlayer = true) {
  return presentJournalEvent(
    { eventType, payload, teamId, actorType: 'mj', actorId: '1' },
    { teamsById, forPlayer },
  );
}

test('tous les évènements tenir ont un libellé propre (élève et MJ), sans chaîne interdite', () => {
  for (const type of TENIR_EVENT_TYPES) {
    for (const forPlayer of [true, false]) {
      const out = present(type, { roundNumber: 2 }, 1, forPlayer);
      assert.equal(out.kind, type, type);
      assert.notEqual(out.title, 'Évènement', `${type} : titre générique`);
      assert.ok(
        !/s’est produit dans la partie|concerne l’équipe/.test(out.body),
        `${type} : corps générique`,
      );
      assert.ok(!FORBIDDEN.test(`${out.title} ${out.body}`), `${type} : chaîne interdite`);
    }
  }
});

test('un évènement inconnu garde le repli générique', () => {
  assert.equal(presentTenirJournalEvent('inconnu_xyz', {}), null);
  assert.equal(present('inconnu_xyz', {}).title, 'Évènement');
});

test('page tenue à deux : nomme les deux équipes et la page', () => {
  const out = present('page_tenue', {
    titre: 'Là où dort la page',
    decouvreuseTeamId: 1,
    tenanteTeamId: 2,
  });
  assert.equal(out.title, 'Page tenue à deux');
  assert.match(out.body, /« Là où dort la page »/);
  assert.match(out.body, /« Gnomes A »/);
  assert.match(out.body, /« Licornes B »/);
});

test('voile : avance, recul et sommeil sans personnification ; mauvaise réponse → « Pas encore »', () => {
  const avance = present(
    'voile_avance',
    { from: 3, to: 7, teamsUnderVoile: [1, 2], pagesPalies: ['cz-1'] },
    null,
  );
  // `to` est un rang (0-based) : affiché en numéro humain (rang + 1), comme le bandeau.
  assert.match(avance.body, /jusqu’à la case 8/);
  assert.match(avance.body, /2 équipes sous le voile/);
  assert.match(avance.body, /1 page pâlit/);
  const recul = present('voile_recul', { cases: 5, reason: 'lumiere' }, null);
  assert.match(recul.body, /recule de 5 cases grâce à la Lumière/);
  assert.equal(present('voile_dort', {}, null).title, 'Le voile dort');
  assert.match(present('page_revelee', { zoneKey: 'cz-1', via: 'fouille' }, 1).body, /Pas encore/);
});

test('évènements privés expurgés : seules les clés publiques sont lues', () => {
  assert.match(
    present('chapardeur', { roundNumber: 3, redacted: true }).body,
    /chapardeur est passé/,
  );
  assert.match(present('badge', { badgeCode: 'x', nom: 'Veilleur' }).body, /« Veilleur »/);
  assert.match(present('absences', { roundNumber: 1, count: 2 }, null).body, /2 absences/);
  assert.match(present('retrait', { entree: true }).body, /se met en retrait/);
  assert.match(present('retrait', { entree: false }).body, /revient/);
});

test('jet de dés : bénéficiaire au camp nommé ; côté MJ préfixé par l’équipe', () => {
  const joueur = present(
    'dice_roll',
    { faces: [3, 4], total: 7, beneficiaryTeamId: 2, roundNumber: 2 },
    1,
  );
  assert.match(joueur.body, /7 cases \(3 \+ 4\)/);
  assert.match(joueur.body, /profite à l’équipe « Licornes B »/);
  const mj = present('tour_phase', { phase: 'souffle', roundNumber: 2 }, 1, false);
  assert.match(mj.body, /^L’équipe « Gnomes A » — /);
  assert.match(mj.body, /Le voile peut avancer/);
});
