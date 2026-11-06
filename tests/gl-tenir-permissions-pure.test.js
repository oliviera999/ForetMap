'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTenirPermissions,
  isTenirGesteAllowed,
  TENIR_GESTES,
} = require('../lib/shared/glTenirPermissionsCore');

const gestesEquipe = ['jeter', 'lancer', 'repondre', 'fouiller', 'lire'];
const gestesProf = ['souffle', 'retrait', 'avanceLibre', 'absences', 'validerDes'];

test('le prof peut toujours tout faire, sur toute surface et toute phase', () => {
  for (const surface of ['tableau', 'hybride', 'tablette']) {
    for (const phase of [null, 'ouverture', 'jeu', 'souffle', 'clos']) {
      const perms = resolveTenirPermissions({ surface, phase, actorKind: 'mj' });
      for (const geste of TENIR_GESTES)
        assert.equal(perms[geste], true, `${surface}/${phase}/${geste}`);
    }
  }
});

test('une projection ne peut rien faire', () => {
  const perms = resolveTenirPermissions({
    surface: 'tablette',
    phase: 'jeu',
    actorKind: 'projection',
  });
  for (const geste of TENIR_GESTES) assert.equal(perms[geste], false);
});

test('tableau : aucun geste pour un élève, Marché en veillée seulement', () => {
  const enJeu = resolveTenirPermissions({ surface: 'tableau', phase: 'jeu', actorKind: 'player' });
  for (const geste of [...gestesEquipe, ...gestesProf]) assert.equal(enJeu[geste], false);
  assert.equal(enJeu.marche, false);
  const veillee = resolveTenirPermissions({ surface: 'tableau', phase: null, actorKind: 'player' });
  assert.equal(veillee.marche, true);
  const clos = resolveTenirPermissions({ surface: 'tableau', phase: 'clos', actorKind: 'player' });
  assert.equal(clos.marche, true);
});

test('hybride : jeter pendant jeu, fouiller pendant la fenêtre du prof, lire toujours ; lancer/répondre au prof', () => {
  const sansFenetre = resolveTenirPermissions({
    surface: 'hybride',
    phase: 'jeu',
    actorKind: 'player',
  });
  assert.equal(sansFenetre.jeter, true);
  assert.equal(sansFenetre.fouiller, false);
  assert.equal(sansFenetre.lire, true);
  assert.equal(sansFenetre.lancer, false);
  assert.equal(sansFenetre.repondre, false);
  assert.equal(sansFenetre.marche, true);
  const avecFenetre = resolveTenirPermissions({
    surface: 'hybride',
    phase: 'jeu',
    actorKind: 'player',
    fouilleFenetreOuverte: true,
  });
  assert.equal(avecFenetre.fouiller, true);
  const ouverture = resolveTenirPermissions({
    surface: 'hybride',
    phase: 'ouverture',
    actorKind: 'player',
  });
  assert.equal(ouverture.jeter, false);
  assert.equal(ouverture.lire, true);
  for (const geste of gestesProf) assert.equal(avecFenetre[geste], false);
});

test('tablette : les cinq gestes pendant jeu, rien hors jeu sauf lire ; jamais les gestes du prof', () => {
  const enJeu = resolveTenirPermissions({ surface: 'tablette', phase: 'jeu', actorKind: 'player' });
  for (const geste of gestesEquipe) assert.equal(enJeu[geste], true, geste);
  for (const geste of gestesProf) assert.equal(enJeu[geste], false, geste);
  const souffle = resolveTenirPermissions({
    surface: 'tablette',
    phase: 'souffle',
    actorKind: 'player',
  });
  assert.equal(souffle.jeter, false);
  assert.equal(souffle.lancer, false);
  assert.equal(souffle.lire, true);
});

test('Marché : jamais en retrait, fermé par le profil, pas pendant le tour si le réglage le coupe', () => {
  const retrait = resolveTenirPermissions({
    surface: 'tablette',
    phase: 'jeu',
    actorKind: 'player',
    enRetrait: true,
  });
  assert.equal(retrait.marche, false);
  const ferme = resolveTenirPermissions({
    surface: 'tablette',
    phase: null,
    actorKind: 'player',
    settings: { marche: false },
  });
  assert.equal(ferme.marche, false);
  const horsTour = resolveTenirPermissions({
    surface: 'tablette',
    phase: 'jeu',
    actorKind: 'player',
    settings: { marche_pendant_tour: false },
  });
  assert.equal(horsTour.marche, false);
  const profFerme = resolveTenirPermissions({
    surface: 'tableau',
    actorKind: 'mj',
    settings: { marche: false },
  });
  assert.equal(profFerme.marche, false);
  assert.equal(profFerme.souffle, true);
});

test('un non-membre de l’équipe ne porte aucun geste d’équipe', () => {
  const perms = resolveTenirPermissions({
    surface: 'tablette',
    phase: 'jeu',
    actorKind: 'player',
    isMember: false,
  });
  for (const geste of gestesEquipe) assert.equal(perms[geste], false, geste);
  assert.equal(
    isTenirGesteAllowed('fouiller', { surface: 'tablette', phase: 'jeu', actorKind: 'player' }),
    true,
  );
});
