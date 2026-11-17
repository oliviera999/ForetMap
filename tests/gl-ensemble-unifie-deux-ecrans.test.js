'use strict';

/**
 * Ensemble unifié, PR 2, étape 2.3 (M8, M10) — les deux écrans.
 * - « Maintenant, vous pouvez… » : les gestes possibles à cet instant, chacun avec l'appel du
 *   rôle (cinq rôles, conseillés, jamais bloquants) — calcul pur partagé ;
 * - « Ce qui change » : au camp, trois lignes pour le chapitre suivant (ton peuple, tes nouveaux
 *   sorts, le plateau), calculées depuis les sorts des chapitres et les réglages.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');
const moments = require('../lib/shared/glSortMomentsCore');
const change = require('../lib/glCeQuiChange');
const { resolveTenirSettings } = require('../lib/glTenir');
const { DEFAULT_GAMEPLAY } = require('../lib/glSettings');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const TOUT = { lancer: true, repondre: true, fouiller: true, lire: true, tenir: true, jeter: true };
const dire = (input) =>
  moments.maintenantVousPouvez(input).map((m) => `${m.role || 'Toute l’équipe'} : ${m.texte}`);
const auth = (t) => ({ Authorization: `Bearer ${t}` });

test('cinq rôles (M10), à parité, en conseil : Gestionnaire, Éclaireuse ou Éclaireur, Opératrice ou Opérateur, Secrétaire, Assistante ou Assistant', () => {
  assert.deepEqual(moments.ROLES_TENIR, {
    lancer: 'Gestionnaire',
    repondre: 'Éclaireuse ou Éclaireur',
    fouiller: 'Opératrice ou Opérateur',
    lire: 'Secrétaire',
    jeter: 'Assistante ou Assistant',
  });
  assert.equal(moments.roleDuGeste('fouiller'), 'Opératrice ou Opérateur');
  // À quatre, l'Assistante ou l'Assistant fait aussi l'Éclaireur.
  assert.equal(moments.roleDuGeste('repondre', 5), 'Éclaireuse ou Éclaireur');
  assert.equal(moments.roleDuGeste('repondre', 4), 'Assistante ou Assistant');
  assert.equal(moments.roleDuGeste('repondre', 0), 'Éclaireuse ou Éclaireur');
  assert.equal(moments.roleDuGeste('lancer', 4), 'Gestionnaire');
  assert.equal(moments.roleDuGeste('trame'), null);
  for (const [geste, phrase] of Object.entries(moments.ROLES_EN_CONSEIL)) {
    assert.match(phrase, /^C’est le moment d/, geste);
    assert.equal(findForbiddenString(phrase), null, geste);
  }
  assert.match(moments.ROLES_EN_CONSEIL.fouiller, /Opératrice ou de l’Opérateur/);
  assert.match(moments.ROLES_EN_CONSEIL.jeter, /Assistante ou de l’Assistant/);
});

test('« Maintenant, vous pouvez… » : seulement ce qui est possible à cet instant, avec l’appel du rôle', () => {
  assert.deepEqual(
    dire({
      perms: TOUT,
      phase: 'jeu',
      questionDue: true,
      fouillesRestantes: 2,
      pagesATenir: 1,
    }),
    [
      'Gestionnaire : lancer les dés',
      'Éclaireuse ou Éclaireur : la question de la case',
      'Opératrice ou Opérateur : 2 fouilles',
      'Secrétaire : 1 page à lire et à faire tenir',
      'Assistante ou Assistant : les sorts',
    ],
  );
  // Dés lancés, une fouille de moins, plus de question : la liste suit.
  assert.deepEqual(dire({ perms: TOUT, phase: 'jeu', aLance: true, fouillesRestantes: 1 }), [
    'Opératrice ou Opérateur : 1 fouille',
    'Assistante ou Assistant : les sorts',
  ]);
  // Après une case Souffle : un seul dé, dit sans drame.
  assert.deepEqual(dire({ perms: { lancer: true }, phase: 'jeu', des: 1 }), [
    'Gestionnaire : lancer le dé (un seul ce tour-ci)',
  ]);
  // Au camp, on ne lance plus ; sans fouille restante, on n'en propose pas ; compte inconnu : le geste seul.
  assert.deepEqual(dire({ perms: TOUT, phase: 'jeu', auCamp: true, fouillesRestantes: 0 }), [
    'Assistante ou Assistant : les sorts',
  ]);
  assert.deepEqual(dire({ perms: { fouiller: true }, phase: 'jeu' }), [
    'Opératrice ou Opérateur : fouiller',
  ]);
  assert.deepEqual(dire({ perms: { tenir: true }, phase: 'jeu', pagesATenir: 3 }), [
    'Secrétaire : 3 pages à lire et à faire tenir',
  ]);
  // Escalier du chapitre 1 : pas de sorts avant la séance 3, pas de « tenir » avant la séance 2.
  assert.deepEqual(
    dire({
      perms: { ...TOUT, tenir: false },
      phase: 'jeu',
      aLance: true,
      fouillesRestantes: 2,
      pagesATenir: 2,
      sortsOuverts: false,
    }),
    ['Opératrice ou Opérateur : 2 fouilles'],
  );
  // À quatre, la question revient à l'Assistante ou à l'Assistant.
  assert.deepEqual(
    dire({ perms: { repondre: true }, phase: 'jeu', questionDue: true, effectif: 4 }),
    ['Assistante ou Assistant : la question de la case'],
  );
  // Hors tour : les défis de la Trame (et une page à tenir en veillée) ; fermés, rien.
  assert.deepEqual(dire({ perms: { tenir: true }, phase: null, pagesATenir: 1 }), [
    'Secrétaire : 1 page à lire et à faire tenir',
    'Toute l’équipe : les défis de la Trame',
  ]);
  assert.deepEqual(dire({ perms: {}, phase: 'clos' }), ['Toute l’équipe : les défis de la Trame']);
  assert.deepEqual(dire({ perms: {}, phase: 'clos', defis: false }), []);
  // Phase d'ouverture ou de souffle : rien à faire pour l'équipe, rien d'affiché.
  assert.deepEqual(dire({ perms: TOUT, phase: 'ouverture', fouillesRestantes: 2 }), []);
  assert.deepEqual(dire({ perms: TOUT, phase: 'souffle', fouillesRestantes: 2 }), []);
  assert.deepEqual(dire(), ['Toute l’équipe : les défis de la Trame']);
  for (const ligne of dire({ perms: TOUT, phase: 'jeu', questionDue: true, pagesATenir: 2 })) {
    assert.equal(findForbiddenString(ligne), null, ligne);
  }
});

test('« Ce qui change » (pur) : ton peuple, tes nouveaux sorts, le plateau', () => {
  // Chaque élève change de peuple entre les chapitres 1 et 2, puis 3 et 4.
  assert.equal(change.peupleSuivant(1, 'gnome'), 'unicorn');
  assert.equal(change.peupleSuivant(3, 'unicorn'), 'gnome');
  assert.equal(change.peupleSuivant(2, 'gnome'), null);
  assert.equal(change.peupleSuivant(1, null), null);
  assert.deepEqual(change.lignePeuple(1, 'gnome'), {
    cle: 'peuple',
    titre: 'Ton peuple',
    texte: 'Tu passes chez les Licornes.',
  });
  assert.equal(change.lignePeuple(3, 'licorne').texte, 'Tu passes chez les Gnomes.');
  assert.match(change.lignePeuple(2, 'gnome').texte, /tu le découvriras au départ/);
  // Pour la classe (projection, prof) : sans « tu ».
  assert.deepEqual(change.lignePeuple(1, null), {
    cle: 'peuple',
    titre: 'Votre peuple',
    texte: 'Tout le monde passe dans l’autre peuple.',
  });
  assert.match(change.lignePeuple(2, null).texte, /vous le découvrirez au départ/);

  const actuels = [{ code: 'A', nom: 'Progression', peuple: 'any' }];
  const suivants = [
    ...actuels,
    { code: 'B', nom: 'Grand Regard', peuple: 'unicorn' },
    { code: 'C', nom: 'Abri', peuple: 'gnome' },
    { code: 'D', nom: 'Cordée', peuple: 'pacte' },
    { code: 'E', nom: 'Lumière', peuple: 'classe' },
  ];
  // Peuple connu : ses sorts, et ceux de tous.
  const licorne = change.ligneSorts(actuels, suivants, 'unicorn');
  // Qui change de peuple découvre aussi les sorts de son nouveau peuple déjà ouverts : un Gnome
  // qui devient Licorne n'a jamais lancé Lanterne.
  const dejaOuverts = [...actuels, { code: 'L', nom: 'Lanterne', peuple: 'unicorn' }];
  assert.equal(
    change.ligneSorts(dejaOuverts, [...dejaOuverts, ...suivants.slice(1)], 'unicorn', 'gnome')
      .texte,
    'Lanterne, Grand Regard, Cordée.',
  );
  // Sans changement de peuple, Lanterne est déjà connue.
  assert.equal(
    change.ligneSorts(dejaOuverts, [...dejaOuverts, ...suivants.slice(1)], 'unicorn', 'unicorn')
      .texte,
    'Grand Regard, Cordée.',
  );
  assert.equal(licorne.titre, 'Tes nouveaux sorts');
  assert.equal(licorne.texte, 'Grand Regard, Cordée.');
  assert.deepEqual(licorne.sorts, ['B', 'D']);
  assert.equal(change.ligneSorts(actuels, suivants, 'gnome').texte, 'Abri, Cordée.');
  // Peuple inconnu : tout est dit, avec le peuple de chaque sort réservé.
  const classe = change.ligneSorts(actuels, suivants, null);
  assert.equal(classe.titre, 'Les nouveaux sorts');
  assert.equal(classe.texte, 'Grand Regard (Licornes), Abri (Gnomes), Cordée.');
  assert.match(change.ligneSorts(actuels, actuels, 'gnome').texte, /Pas de nouveau sort/);

  // Le plateau : ce que les réglages changent, rien d'autre.
  const resolu = (overrides) =>
    resolveTenirSettings(DEFAULT_GAMEPLAY, {
      tenir_profil: 'complet',
      tenir_overrides_json: overrides ? JSON.stringify(overrides) : null,
    });
  // 1 → 2 après l'escalier : tout est ouvert d'emblée, et le voile avance un peu plus vite.
  assert.equal(
    change.lignePlateau(resolu({ escalier: true, escalier_pas: 4 }), 1).texte,
    'Tout est ouvert dès la première séance ; le voile avance un peu plus vite.',
  );
  assert.equal(change.lignePlateau(resolu(null), 1).texte, 'Le voile avance un peu plus vite.');
  // 2 → 3 : dix pages au lieu de huit.
  assert.equal(
    change.lignePlateau(resolu(null), 2).texte,
    '10 pages à retrouver ; le voile avance un peu plus vite.',
  );
  // 3 → 4 : la Cordée offerte.
  assert.equal(
    change.lignePlateau(resolu(null), 3, { cordeeOfferte: true }).texte,
    'Le voile avance un peu plus vite ; une Cordée offerte à chaque équipe.',
  );
  // Voile coupé pour la partie, réglages égaux : la phrase de repli.
  const egal = resolu({
    voile: false,
    zones_par_plateau: { 1: 8, 2: 8, 3: 8, 4: 8 },
  });
  assert.deepEqual(change.lignePlateau(egal, 2), {
    cle: 'plateau',
    titre: 'Le plateau',
    texte: 'Les mêmes règles, un nouveau chemin.',
  });
  for (const l of [change.lignePeuple(1, 'gnome'), licorne, change.lignePlateau(resolu(null), 2)]) {
    assert.equal(findForbiddenString(`${l.titre} ${l.texte}`), null);
  }
});

let p1;
let p4;
before(async () => {
  await db.initSchema();
  p1 = await createTenirGame({
    stamp: Date.now(),
    plateau: 1,
    overrides: { escalier: true, escalier_pas: 4 },
  });
  // Le chapitre du plateau 2 doit exister avec ses sorts pour être annoncé.
  await createTenirGame({ stamp: Date.now() + 1, plateau: 2, status: 'draft' });
  p4 = await createTenirGame({ stamp: Date.now() + 2, plateau: 4, status: 'draft' });
});

test('GET /tenir/ce-qui-change : trois lignes pour l’équipe de l’élève, pour la classe au prof ; rien au dernier plateau', async () => {
  const gnomes = p1.teams.find((t) => t.type === 'gnome');
  const gnome = p1.players.find((p) => Number(p.teamId) === Number(gnomes.id));
  const chemin = (game) => `/api/gl/games/${game.id}/tenir/ce-qui-change`;
  const eleve = await request(app).get(chemin(p1.game)).set(auth(gnome.token));
  assert.equal(eleve.status, 200, JSON.stringify(eleve.body));
  assert.equal(eleve.body.auCamp, false);
  assert.equal(eleve.body.ceQuiChange.plateau, 2);
  assert.deepEqual(
    eleve.body.ceQuiChange.lignes.map((l) => l.cle),
    ['peuple', 'sorts', 'plateau'],
  );
  const [peuple, sorts, plateau] = eleve.body.ceQuiChange.lignes;
  assert.equal(peuple.texte, 'Tu passes chez les Licornes.');
  // Les sorts du chapitre 2 pour une future Licorne : Grand Regard oui, Abri (gnome) non.
  assert.equal(sorts.titre, 'Tes nouveaux sorts');
  assert.match(sorts.texte, /Grand Regard/);
  assert.match(sorts.texte, /Cordée/);
  assert.match(sorts.texte, /Lanterne/, 'les sorts de son nouveau peuple, nouveaux pour lui');
  assert.doesNotMatch(
    sorts.texte,
    /Sentier/,
    'les sorts du peuple qu’il quitte ne sont pas redits',
  );
  assert.doesNotMatch(sorts.texte, /Abri/);
  assert.doesNotMatch(sorts.texte, /Progression/, 'un sort déjà connu n’est pas annoncé');
  assert.equal(sorts.sorts, undefined, 'les codes restent au serveur');
  assert.match(plateau.texte, /^Tout est ouvert dès la première séance/);
  for (const l of eleve.body.ceQuiChange.lignes) {
    assert.equal(findForbiddenString(`${l.titre} ${l.texte}`), null, l.cle);
  }
  // Le prof (et la projection) : les lignes de la classe.
  const prof = await request(app).get(chemin(p1.game)).set(auth(p1.adminToken));
  assert.equal(prof.body.ceQuiChange.lignes[0].titre, 'Votre peuple');
  assert.match(prof.body.ceQuiChange.lignes[1].texte, /Grand Regard \(Licornes\)/);
  assert.match(prof.body.ceQuiChange.lignes[1].texte, /Abri \(Gnomes\)/);
  // Au camp, l'écran le sait.
  await db.execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [p1.game.id]);
  assert.equal((await request(app).get(chemin(p1.game)).set(auth(gnome.token))).body.auCamp, true);
  // Dernier plateau : pas de chapitre suivant.
  const dernier = await request(app).get(chemin(p4.game)).set(auth(p4.adminToken));
  assert.equal(dernier.status, 200, JSON.stringify(dernier.body));
  assert.equal(dernier.body.ceQuiChange, null);
  // Un élève d'une autre classe n'y a pas accès.
  const etranger = await request(app).get(chemin(p4.game)).set(auth(gnome.token));
  assert.equal(etranger.status, 403);
});
