'use strict';

/**
 * Cœur pur des défis de la Trame (`src/gl/defis/trameCore.js`, miroir `lib/shared/glTrameCore.js`).
 * Test de référence : les **24 cascades** du cahier des charges (§ 8.3), retrouvées exactement
 * sur les réseaux réels de `data/gl/tenir/trame-reseaux.json`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/glTrameCore');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const DIR = path.join(__dirname, '..', 'data', 'gl', 'tenir');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(DIR, `${nom}.json`), 'utf8'));
const RESEAUX = lire('trame-reseaux').reseaux;
const reseau = (biome) => RESEAUX.find((r) => r.biome === biome);
const SYMBOLES = { augmente: '↑', diminue: '↓', disparait: '✕' };

/** Les 24 cascades de référence : ↑ augmente, ↓ diminue, ✕ disparaît (cartes non citées : rien). */
const CASCADES = [
  ['jungle_afc', 'Léopard', 'Bongo ↑, Okapi ↑'],
  ['jungle_afc', 'Moabi', 'Gorille ↓, Calao ✕, Éléphant de forêt ✕'],
  ['jungle_afc', 'Décomposeurs du sol', 'Marantacée ↓, Moabi ↓'],
  ['savane', 'Lion', 'Zèbre ↑, Gnou ↑, Girafe ↑, Vautour ↓'],
  ['savane', 'Themeda', 'Zèbre ✕, Gnou ✕, Lion ↓, Hyène ✕, Vautour ↓'],
  ['savane', 'Zèbre', 'Themeda ↑, Lion ↓, Hyène ↓, Vautour ↓'],
  ['sahara', 'Gerboise', 'Drinn ↑, Fennec ✕, Vipère à cornes ✕'],
  ['sahara', 'Acacia gommier', 'Gazelle dorcas ✕, Addax ↓, Dromadaire ↓'],
  ['sahara', 'Décomposeurs du sol', 'Drinn ↓, Acacia gommier ↓'],
  [
    'foret_mediterraneenne',
    'Chêne vert',
    'Sanglier ✕, Cerf ✕, Vautour fauve ✕, Cigale ✕, Caméléon ✕, Magot ↓',
  ],
  ['foret_mediterraneenne', 'Sanglier', 'Chêne vert ↑, Vautour fauve ↓'],
  ['foret_mediterraneenne', 'Cigale', 'Chêne vert ↑, Caméléon ✕'],
  [
    'foret_caducifoliee',
    'Chêne pédonculé',
    'Chevreuil ✕, Lynx ✕, Lombric ✕, Merle ✕, Geai ✕, Écureuil ✕, Hérisson ✕, Escargot ✕',
  ],
  ['foret_caducifoliee', 'Lombric', 'Chêne ↓, Merle ✕, Hérisson ↓'],
  ['foret_caducifoliee', 'Lynx', 'Chevreuil ↑'],
  ['landes', 'Lézard vivipare', 'Damier ↑, Vipère péliade ✕'],
  ['landes', 'Callune', 'Grouse ↓, Damier ✕, Fauvette ✕, Lézard ✕, Vipère ✕'],
  ['landes', 'Grouse rouge', 'Callune ↑, Bruyère cendrée ↑, Busard ✕'],
  ['taiga', 'Lièvre variable', 'Bouleau ↑, Tremble ↑, Loup ↓, Lynx ✕'],
  ['taiga', 'Castor', 'Bouleau ↑, Tremble ↑, Loup ↓'],
  ['taiga', 'Bouleau', 'Élan ↓, Lièvre ↓, Castor ↓'],
  ['toundra', 'Lemming', 'Mousse polaire ↑, Harfang ✕, Renard polaire ✕'],
  ['toundra', 'Lichen des rennes', 'Renne ✕, Loup arctique ↓, Bœuf musqué ↓'],
  ['toundra', 'Loup arctique', 'Renne ↑, Bœuf musqué ↑'],
];

/** Carte d'un modèle dont le nom commence par `debut` (les noms du tableau sont abrégés). */
function carte(model, debut) {
  const trouvees = model.cartes.filter((c) => c.nom.startsWith(debut));
  assert.equal(trouvees.length, 1, `« ${debut} » désigne une seule carte`);
  return trouvees[0];
}

test('les 24 cascades de référence sont retrouvées exactement, avec une explication par effet', () => {
  assert.equal(CASCADES.length, 24);
  for (const [biome, retiree, attendu] of CASCADES) {
    const model = core.buildReseau(reseau(biome), core.TRAME_NIVEAU_ALTEREE);
    const c = core.cascade(model, carte(model, retiree).code);
    const voulu = {};
    for (const morceau of attendu.split(', ')) {
      const symbole = morceau.slice(-1);
      voulu[carte(model, morceau.slice(0, -2)).code] = Object.keys(SYMBOLES).find(
        (k) => SYMBOLES[k] === symbole,
      );
    }
    assert.deepEqual(c.effets, voulu, `${biome} sans ${retiree}`);
    for (const code of Object.keys(c.effets)) {
      assert.ok(c.explications[code], `${biome} sans ${retiree} : explication de ${code}`);
      assert.equal(findForbiddenString(c.explications[code]), null);
    }
    assert.ok(c.pourAllerPlusLoin && c.pourAllerPlusLoin.endsWith('?'), 'une question ouverte');
    assert.equal(findForbiddenString(c.pourAllerPlusLoin), null);
    const decomposeur = model.cartes.find((x) => x.code === c.retiree).role === 'decomposeur';
    assert.equal(
      c.message != null,
      decomposeur,
      'la matière morte ne se dit que pour un décomposeur',
    );
  }
  // Les trois scénarios de chaque réseau sont bien ceux du tableau.
  for (const r of RESEAUX) {
    const model = core.buildReseau(r, 9);
    const duTableau = CASCADES.filter(([b]) => b === r.biome).map(([, n]) => carte(model, n).code);
    assert.deepEqual([...duTableau].sort(), [...r.scenarios_trame_alteree].sort(), r.biome);
  }
});

test('cascade : carte inconnue → rien ; « pour aller plus loin » selon l’étage touché', () => {
  const savane = core.buildReseau(reseau('savane'), 9);
  assert.deepEqual(core.cascade(savane, 'INCONNUE'), {
    retiree: 'INCONNUE',
    effets: {},
    explications: {},
    message: null,
    pourAllerPlusLoin: null,
  });
  const lion = core.cascade(savane, carte(savane, 'Lion').code);
  // Deux plantes à suivre : le verbe s'accorde.
  assert.match(lion.pourAllerPlusLoin, /^Avec plus de .*, que deviendraient .* et .* \?$/);
  const jungle = core.buildReseau(reseau('jungle_afc'), 9);
  assert.match(core.cascade(jungle, 'DEC').pourAllerPlusLoin, /animaux qui mangent ces plantes/);
  assert.equal(core.cascade(jungle, 'DEC').message, core.TRAME_MESSAGES.matiereMorte);
  const themeda = core.cascade(savane, carte(savane, 'Themeda').code);
  // Un producteur en moins et des cartes qui disparaissent : la question porte sur son rôle.
  assert.match(
    themeda.pourAllerPlusLoin,
    /^« Themeda \(herbe rouge\) » en moins, et tant de cartes/,
  );
  // Réseaux d'école : une proie sans ressource en jeu, puis une carte sans aucun effet.
  const mini = core.buildReseau(
    {
      cartes: [
        { code: 'P', nom: 'Herbe', role: 'producteur' },
        { code: 'H', nom: 'Lapin', role: 'consommateur' },
        { code: 'C', nom: 'Renard', role: 'consommateur' },
        { code: 'X', nom: 'Papillon', role: 'consommateur' },
      ],
      liens: [['H', 'C'], { de: 'P', vers: 'X' }],
    },
    4,
  );
  const sansRenard = core.cascade(mini, 'C');
  assert.deepEqual(sansRenard.effets, { H: 'augmente' });
  assert.match(sansRenard.pourAllerPlusLoin, /qu’est-ce qui changerait encore/);
  const sansPapillon = core.cascade(mini, 'X');
  assert.deepEqual(sansPapillon.effets, { P: 'augmente' });
  const isole = core.buildReseau(
    {
      cartes: [
        { code: 'A', nom: 'Aigle', role: 'consommateur' },
        { code: 'B', nom: 'Buse', role: 'consommateur' },
      ],
    },
    2,
  );
  assert.match(core.cascade(isole, 'A').pourAllerPlusLoin, /^Si « Aigle » revenait/);
  // Une proie sans ressource en jeu disparaît : son seul mangeur la suit.
  const chaine = core.buildReseau(
    {
      cartes: [
        { code: 'A', nom: 'Mulot', role: 'consommateur' },
        { code: 'B', nom: 'Buse', role: 'consommateur' },
      ],
      liens: [['A', 'B']],
    },
    2,
  );
  const sansMulot = core.cascade(chaine, 'A');
  assert.deepEqual(sansMulot.effets, { B: 'disparait' });
  assert.equal(
    sansMulot.explications.B,
    'Dans ce réseau, il ne reste plus rien à manger pour « Buse » : « Mulot » a disparu.',
  );
  assert.equal(
    sansMulot.pourAllerPlusLoin,
    'Sans « Buse », qui profiterait de la place laissée libre ?',
  );
  // Les phrases citent les noms entre guillemets : aucun accord à deviner.
  assert.equal(
    lion.explications[carte(savane, 'Girafe').code],
    "« Lion d'Afrique » ne mange plus « Girafe » : il y en a davantage.",
  );
  assert.match(themeda.explications[carte(savane, 'Hyène').code], / et « .* » ont disparu\.$/);
  assert.match(
    core.cascade(jungle, 'DEC').explications[carte(jungle, 'Moabi').code],
    /sans les décomposeurs, la matière morte n’est plus transformée/,
  );
});

test('prédictions : la bonne reçoit l’explication, les autres « Pas encore », jamais la réponse', () => {
  const model = core.buildReseau(reseau('savane'), 9);
  const lion = carte(model, 'Lion').code;
  const attendu = core.cascade(model, lion).effets;
  const vide = core.verifierPredictions(model, lion, {});
  assert.equal(vide.complet, false);
  assert.equal(vide.cartes.length, 8);
  for (const c of vide.cartes) {
    // Une carte sans effet attendu et sans prédiction n'est pas « juste » pour autant.
    assert.equal(c.juste, false);
    assert.equal(c.message, 'Pas encore.');
  }
  const tout = Object.fromEntries(
    model.cartes.filter((c) => c.code !== lion).map((c) => [c.code, attendu[c.code] || 'rien']),
  );
  const juste = core.verifierPredictions(model, lion, tout);
  assert.equal(juste.complet, true);
  assert.ok(juste.cartes.every((c) => c.juste && c.message && c.message !== 'Pas encore.'));
  assert.ok(juste.cartes.some((c) => c.message === core.TRAME_MESSAGES.sansChangement));
  // Les décomposeurs du sol ne manquent jamais de matière morte.
  assert.equal(
    juste.cartes.find((c) => c.code === 'DEC').message,
    'Il reste toujours de la matière morte à décomposer.',
  );
  const zebre = carte(model, 'Zèbre').code;
  const presque = core.verifierPredictions(model, lion, { ...tout, [zebre]: 'diminue' });
  assert.equal(presque.complet, false);
  const ligne = presque.cartes.find((c) => c.code === zebre);
  assert.equal(ligne.message, 'Pas encore.');
  assert.ok(!JSON.stringify(ligne).includes('augmente'), 'la bonne prédiction ne fuit pas');
});

test('classement d’une flèche : boucle, doublon, trouvée, inversée, à discuter — dans cet ordre', () => {
  const m = core.buildReseau(reseau('jungle_afc'), 5);
  assert.deepEqual(
    m.cartes.map((c) => c.code),
    ['SP0045', 'SP0023', 'SP0032', 'SP0031', 'DEC'],
  );
  assert.deepEqual(m.decomposeurs, ['DEC']);
  assert.equal(m.liens.length, 3, 'seuls les liens entre cartes du niveau');
  assert.equal(core.classifyLink(m, 'SP0045', 'SP0045').classement, 'boucle');
  assert.equal(core.classifyLink(m, 'DEC', 'DEC').classement, 'boucle');
  assert.equal(
    core.classifyLink(m, 'SP0045', 'SP0023', [{ de: 'SP0045', vers: 'SP0023' }]).classement,
    'doublon',
  );
  assert.deepEqual(core.classifyLink(m, 'SP0045', 'SP0023'), {
    classement: 'trouvee',
    message: 'Lien trouvé.',
  });
  // Toute carte vers un décomposeur : trouvée, même sans lien écrit.
  const versDec = core.classifyLink(m, 'SP0031', 'DEC');
  assert.equal(versDec.classement, 'trouvee');
  assert.equal(versDec.viaDecomposeur, true);
  const inverse = core.classifyLink(m, 'SP0023', 'SP0045');
  assert.equal(inverse.classement, 'inversee');
  assert.match(inverse.message, /de celui qui est mangé vers celui qui mange/);
  // Prévu « à discuter » : son pourquoi ; non prévu : la phrase commune ; jamais un refus.
  const discute = core.classifyLink(m, 'SP0023', 'SP0031');
  assert.equal(discute.classement, 'a_discuter');
  assert.match(discute.message, /léopard chasse très rarement/);
  const nonPrevu = core.classifyLink(m, 'DEC', 'SP0045');
  assert.deepEqual(nonPrevu, {
    classement: 'a_discuter',
    message: 'À discuter avec ton équipe ou avec ton professeur.',
  });
  assert.equal(core.classifyLink(m, 'SP0045', 'HORS').classement, 'a_discuter');
  assert.equal(core.classifyLink(m, 'SP0045', 'SP0023', null).classement, 'trouvee');
  for (const message of Object.values(core.TRAME_MESSAGES)) {
    assert.equal(findForbiddenString(message), null, message);
    assert.ok(!/^Non\b/.test(message));
  }
  // `classifyAll` dédoublonne et ignore les flèches sans extrémité.
  const toutes = core.classifyAll(m, [
    { de: 'SP0045', vers: 'SP0023' },
    { de: 'SP0045', vers: 'SP0023' },
    { de: '', vers: 'SP0023' },
    null,
  ]);
  assert.deepEqual(
    toutes.map((f) => f.classement),
    ['trouvee', 'doublon'],
  );
  assert.equal(core.compterTrouvees(m, toutes), 1);
  assert.deepEqual(core.classifyAll(m, null), []);
});

test('fin d’un niveau de Retisser : chaque animal nourri, chaque plante suivie, une flèche vers les décomposeurs, aucune inversée', () => {
  const m = core.buildReseau(reseau('jungle_afc'), 5);
  const liens = [
    { de: 'SP0045', vers: 'SP0023' },
    { de: 'SP0045', vers: 'SP0032' },
    { de: 'SP0032', vers: 'SP0031' },
  ];
  const sansDec = core.etatRetisser(m, liens);
  assert.equal(sansDec.complet, false);
  assert.deepEqual(sansDec.manques, {
    sansRessource: [],
    sansSuite: [],
    versDecomposeur: false,
    inversees: 0,
  });
  // L'ancien critère (tout relier aux décomposeurs) ne suffit plus.
  const toutVersDec = m.cartes
    .filter((c) => c.code !== 'DEC')
    .map((c) => ({ de: c.code, vers: 'DEC' }));
  const ancien = core.etatRetisser(m, toutVersDec);
  assert.equal(ancien.complet, false);
  assert.deepEqual(ancien.manques.sansRessource, ['SP0023', 'SP0032', 'SP0031']);
  assert.deepEqual(ancien.manques.sansSuite, [], 'la plante a une suite, vers les décomposeurs');
  assert.equal(core.isRetisserComplet(m, [...liens, { de: 'SP0031', vers: 'DEC' }]), true);
  assert.equal(
    core.isRetisserComplet(m, [
      ...liens,
      { de: 'SP0031', vers: 'DEC' },
      { de: 'SP0031', vers: 'SP0032' },
    ]),
    false,
    'une flèche inversée reste',
  );
  // Un lien « à discuter » ne gêne pas la fin ; une plante sans suite la retient.
  assert.equal(
    core.isRetisserComplet(m, [
      ...liens,
      { de: 'SP0031', vers: 'DEC' },
      { de: 'SP0023', vers: 'SP0031' },
    ]),
    true,
  );
  assert.deepEqual(core.etatRetisser(m, []).manques.sansSuite, ['SP0045']);
  // Chaque niveau de chaque réseau a une fin : ses liens acceptés, une flèche vers un
  // décomposeur, et la même pour une plante que personne ne mange à ce niveau (le drosera des
  // landes : sa suite, ce sont les décomposeurs).
  for (const r of RESEAUX) {
    for (const niveau of core.TRAME_NIVEAUX) {
      const model = core.buildReseau(r, niveau);
      const dec = model.decomposeurs[0];
      const sansMangeur = model.cartes.filter(
        (c) => c.role === 'producteur' && !model.liens.some((l) => l.de === c.code),
      );
      const solution = [
        ...model.liens,
        { de: model.cartes[0].code, vers: dec },
        ...sansMangeur.map((c) => ({ de: c.code, vers: dec })),
      ];
      assert.equal(core.isRetisserComplet(model, solution), true, `${r.biome} niveau ${niveau}`);
    }
  }
});

test('fils cachés : mêmes gestes ; fini quand chaque lien est trouvé et qu’aucune flèche n’est inversée', () => {
  const chapitres = lire('trame-fils').chapitres;
  for (const ch of chapitres) {
    const m = core.buildFils(ch);
    assert.equal(m.type, 'fils');
    assert.equal(m.cartes.length, 9);
    assert.equal(core.isFilsComplet(m, m.liens), true, `plateau ${ch.plateau}`);
    assert.equal(core.isFilsComplet(m, m.liens.slice(1)), false);
  }
  const m = core.buildFils(chapitres[0]);
  const [premier] = m.liens;
  const inverse = core.classifyLink(m, premier.vers, premier.de);
  assert.equal(inverse.classement, 'inversee');
  assert.match(inverse.message, /de la cause vers son effet/);
  assert.equal(
    core.isFilsComplet(m, [...m.liens, { de: 'B', vers: 'A' }]),
    false,
    'une flèche inversée reste',
  );
  assert.equal(core.classifyLink(m, 'A', 'I').classement, 'a_discuter');
  // Un raccourci (la cause mène à l'effet par une étape) : vrai, mais il manque une étape.
  const directs = new Set(m.liens.map((l) => `${l.de}>${l.vers}`));
  const [l1, l2] = m.liens
    .flatMap((a) => m.liens.filter((b) => b.de === a.vers).map((b) => [a, b]))
    .find(([a, b]) => !directs.has(`${a.de}>${b.vers}`) && !directs.has(`${b.vers}>${a.de}`));
  assert.deepEqual(core.classifyLink(m, l1.de, l2.vers), {
    classement: 'a_discuter',
    message: 'C’est vrai, mais il manque une étape entre les deux.',
  });
  // Plateau 4 : la boucle F → A est voulue. A → F n'est pas « à l'envers » : A mène bien à F.
  const boucle = core.buildFils(chapitres[3]);
  assert.equal(core.classifyLink(boucle, 'F', 'A').classement, 'trouvee');
  assert.deepEqual(core.classifyLink(boucle, 'A', 'F'), {
    classement: 'a_discuter',
    message: 'C’est vrai, mais il manque une étape entre les deux.',
  });
  assert.equal(core.isFilsComplet(boucle, [...boucle.liens, { de: 'A', vers: 'F' }]), true);
  // Forme objet des cartes et des liens, cartes inconnues écartées.
  const objet = core.buildFils({
    plateau: 9,
    titre: 'Essai',
    cartes: [
      { code: 'A', texte: 'Il pleut' },
      { code: 'B', nom: 'L’herbe pousse' },
    ],
    liens: [{ de: 'A', vers: 'B' }, ['A', 'Z']],
  });
  assert.deepEqual(objet.liens, [{ de: 'A', vers: 'B', pourquoi: null }]);
  assert.equal(objet.cartes[1].nom, 'L’herbe pousse');
  assert.deepEqual(core.buildFils(null).cartes, []);
});

test('réparer : ranger six espèces (essais illimités), lire la leçon, une mesure acceptée pour deux espèces', () => {
  const ch = lire('trame-reparer').chapitres[0];
  const model = { aClasser: ch.a_classer, especes: ch.especes };
  const rangement = Object.fromEntries(ch.a_classer.map((e) => [e.code, e.categorie]));
  assert.equal(core.verifierRangement(model, {}).complet, false);
  const faux = core.verifierRangement(model, { ...rangement, SP0023: 'pas_menace' });
  assert.equal(faux.complet, false);
  const ligne = faux.cartes.find((c) => c.code === 'SP0023');
  assert.equal(ligne.message, 'Pas encore.');
  assert.ok(!JSON.stringify(faux).includes('en_danger'), 'la bonne catégorie ne fuit pas');
  assert.equal(core.verifierRangement(model, rangement).complet, true);
  assert.equal(core.verifierRangement({}, rangement).complet, false);

  const mesures = core.verifierMesures(model, { SP0023: ['M5'], SP0029: ['M10', 'M5'] });
  assert.equal(mesures.reparees, 1);
  assert.match(mesures.especes.find((e) => e.code === 'SP0023').message, /^Pas encore\./);
  assert.equal(mesures.especes.find((e) => e.code === 'SP0027').message, null);
  assert.equal(core.especesRequises(model), 2);
  assert.equal(core.especesRequises({ especes: [{ code: 'A', mesures: ['M1'] }] }), 1);
  assert.equal(core.verifierMesures({}, {}).reparees, 0);
  assert.equal(core.verifierMesures({ especes: [{ code: 'A' }] }, { A: ['M1'] }).reparees, 0);
  assert.equal(core.especesRequises(null), 0);

  const etat = { rangement, leconLue: true, mesures: { SP0023: ['M1'], SP0029: ['M10'] } };
  assert.equal(core.isReparerComplet(model, etat), true);
  assert.equal(core.isReparerComplet(model, { ...etat, leconLue: false }), false);
  assert.equal(core.isReparerComplet(model, { ...etat, mesures: { SP0023: ['M1'] } }), false);
  assert.equal(core.isReparerComplet(model, { ...etat, rangement: {} }), false);
  assert.equal(core.isReparerComplet({ aClasser: ch.a_classer, especes: [] }, etat), false);
  assert.equal(core.isReparerComplet(model, null), false);
});

test('indices : déterministes, en échelle — consigne, structure, piste sur une carte isolée, révélation', () => {
  const m = core.buildReseau(reseau('jungle_afc'), 5);
  const genres = (etat) => core.nextHint(m, etat);
  assert.equal(genres({}).genre, 'consigne');
  assert.equal(genres({ indices: 1 }).genre, 'structure');
  assert.match(genres({ indices: 1 }).message, /Commence par une plante/);
  const piste = genres({ indices: 2, fleches: [{ de: 'SP0045', vers: 'SP0023' }] });
  assert.equal(piste.genre, 'piste');
  assert.equal(piste.carte, 'SP0032', 'la première carte encore isolée');
  const revelation = genres({ indices: 3, fleches: [{ de: 'SP0045', vers: 'SP0023' }] });
  assert.equal(revelation.genre, 'revelation');
  assert.deepEqual(revelation.lien, { de: 'SP0032', vers: 'SP0031' });
  assert.equal(
    revelation.message,
    '« Léopard » se nourrit de « Bongo » : trace la flèche de « Bongo » vers « Léopard ».',
  );
  // La piste s'adapte à la carte : un animal mange et est mangé, une plante nourrit.
  assert.match(piste.message, /^La carte « Bongo » n’est reliée à rien : de quoi se nourrit-elle/);
  const pistePlante = genres({ indices: 2, fleches: [{ de: 'SP0032', vers: 'SP0031' }] });
  assert.equal(pistePlante.carte, 'SP0045');
  assert.equal(
    pistePlante.message,
    'La carte « Marantacée » n’est reliée à rien : qui s’en nourrit ?',
  );
  assert.deepEqual(genres({ indices: 3, fleches: [{ de: 'SP0045', vers: 'SP0023' }] }), revelation);
  // Toutes les cartes sont reliées mais un lien manque : on révèle, sans piste.
  const tousRelies = [
    { de: 'SP0045', vers: 'SP0023' },
    { de: 'SP0032', vers: 'SP0031' },
  ];
  assert.equal(genres({ indices: 2, fleches: tousRelies }).genre, 'revelation');
  // Plus rien à révéler : on renvoie au sens des flèches et aux décomposeurs.
  const fini = genres({ indices: 7, fleches: m.liens });
  assert.equal(fini.genre, 'structure');
  assert.match(fini.message, /décomposeurs/);
  const fils = core.buildFils(lire('trame-fils').chapitres[0]);
  assert.match(core.nextHint(fils, {}).message, /d’une cause vers son effet/);
  assert.match(core.nextHint(fils, { indices: 1 }).message, /peut servir de départ/);
  assert.match(core.nextHint(fils, { indices: 2 }).message, /n’est reliée à rien/);
  assert.match(core.nextHint(fils, { indices: 3 }).message, /^Un fil à tracer/);
  assert.match(
    core.nextHint(fils, { indices: 9, fleches: fils.liens }).message,
    /Tous les fils prévus/,
  );
  for (let i = 0; i < 6; i += 1) {
    assert.equal(findForbiddenString(core.nextHint(m, { indices: i }).message), null);
  }
});

test('bornes d’un état : 60 flèches entre cartes connues, textes de 280 caractères, coordonnées de 0 à 100', () => {
  const codes = Array.from({ length: 12 }, (_, i) => `C${i}`);
  const fleches = [];
  for (const de of codes) for (const vers of codes) fleches.push({ de, vers });
  const etat = core.normaliserEtat(
    'retisser',
    {
      indices: 3.7,
      fleches: [...fleches, { de: 'C0', vers: 'INCONNUE' }, null],
      positions: {
        C0: { x: 150, y: -4 },
        C1: { x: 'a', y: 2 },
        HORS: { x: 1, y: 1 },
        C2: { x: 33.333, y: 50 },
      },
      intrus: 'écarté',
    },
    codes,
  );
  assert.equal(etat.fleches.length, core.TRAME_MAX_FLECHES);
  assert.ok(etat.fleches.every((f) => f.de !== f.vers));
  assert.equal(etat.indices, 3);
  assert.deepEqual(etat.positions, { C0: { x: 100, y: 0 }, C2: { x: 33.3, y: 50 } });
  assert.equal(etat.intrus, undefined);
  assert.deepEqual(core.normaliserEtat('fils', null, codes), {
    indices: 0,
    fleches: [],
    positions: {},
  });
  assert.deepEqual(core.normaliserEtat('fils', [], codes).fleches, []);
  const alteree = core.normaliserEtat(
    'alteree',
    { predictions: { C0: 'augmente', C1: 'explose', HORS: 'rien' }, verifie: true },
    codes,
  );
  assert.deepEqual(alteree, { indices: 0, predictions: { C0: 'augmente' }, verifie: true });
  const reparer = core.normaliserEtat(
    'reparer',
    {
      rangement: { C0: 'fragile', C1: 'ailleurs' },
      mesures: { C0: ['M1', 'M1', '', 'M2'], C1: 'M1' },
      leconLue: true,
      pourquoi: 'x'.repeat(400),
    },
    codes,
  );
  assert.deepEqual(reparer.rangement, { C0: 'fragile' });
  assert.deepEqual(reparer.mesures, { C0: ['M1', 'M2'] });
  assert.equal(reparer.leconLue, true);
  assert.equal(reparer.pourquoi.length, core.TRAME_MAX_TEXTE);
  assert.equal(core.normaliserEtat('reparer', {}, codes).pourquoi, undefined);
  assert.deepEqual(core.normaliserEtat('inconnu', { fleches: [1] }), { indices: 0 });
  assert.deepEqual(core.normaliserEtat('alteree', { predictions: { C0: 'rien' } }, null), {
    indices: 0,
    predictions: {},
    verifie: false,
  });
});

test('modèle : forme du fichier ou forme normalisée, niveau borné, précision des cartes', () => {
  const brut = reseau('jungle_afc');
  const a = core.buildReseau(brut, 12);
  const b = core.buildReseau(
    {
      biome: brut.biome,
      cartes: brut.especes.map((e) => ({
        ...e,
        generique: e.generique ? 1 : 0,
        precision_texte: e.precision,
      })),
      liens: brut.liens_acceptes,
      aDiscuter: brut.a_discuter,
    },
    12,
  );
  assert.deepEqual(a, b);
  assert.equal(a.cartes.find((c) => c.code === 'DEC').generique, true);
  assert.ok(a.cartes.find((c) => c.code === 'DEC').precision);
  assert.equal(a.aDiscuter.length, 1);
  assert.equal(core.buildReseau(brut).niveau, 5, 'niveau par défaut');
  assert.equal(core.buildReseau(brut, 0).cartes.length, 1, 'au moins une carte');
  assert.deepEqual(core.buildReseau(null).cartes, []);
  assert.deepEqual(core.TRAME_TYPES, [
    'retisser',
    'reparer',
    'alteree',
    'fils',
    'ranger',
    'adaptation',
  ]);
});

// ---------------------------------------------------------------------
// Ensemble unifié (M21) : ranger (« Le bon rôle », « Le bon pays »), fils de l'adaptation
// ---------------------------------------------------------------------

const RANGER = lire('trame-ranger');
const jeu = (code) => RANGER.jeux.find((j) => j.code === code);
const PAYS = (codes) => codes.map((code) => ({ code, nom: `Pays ${code}` }));

test('ranger : bien rangée → son pourquoi ; ailleurs → « Pas encore. », jamais la réponse ; pas posée → rien', () => {
  const role = core.buildRanger(jeu('role-savane'), RANGER.familles.role.categories);
  assert.equal(role.type, 'ranger');
  assert.equal(role.famille, 'role');
  assert.equal(role.biome, 'savane');
  assert.equal(role.cartes.length, 8);
  assert.deepEqual(
    role.categories.map((c) => c.code),
    ['producteur', 'consommateur', 'decomposeur'],
  );
  assert.ok(role.categories[0].aide, 'l’aide de la catégorie suit');
  const [a, b] = role.cartes;
  const autre = role.categories.find((c) => c.code !== b.categorie).code;
  const essai = core.verifierRanger(role, { [a.code]: a.categorie, [b.code]: autre });
  assert.equal(essai.complet, false);
  assert.deepEqual(essai.cartes[0], {
    code: a.code,
    rangee: true,
    juste: true,
    message: a.pourquoi,
  });
  assert.deepEqual(essai.cartes[1], {
    code: b.code,
    rangee: true,
    juste: false,
    message: 'Pas encore.',
  });
  assert.deepEqual(essai.cartes[2], {
    code: role.cartes[2].code,
    rangee: false,
    juste: false,
    message: null,
  });
  // Rien de ce qui est servi pour une carte mal rangée ne porte sa catégorie ni son pourquoi.
  assert.ok(!JSON.stringify(essai.cartes[1]).includes(b.categorie));
  const tout = Object.fromEntries(role.cartes.map((c) => [c.code, c.categorie]));
  assert.equal(core.verifierRanger(role, tout).complet, true);
  assert.equal(core.isRangerComplet(role, { rangement: tout }), true);
  assert.equal(core.isRangerComplet(role, { rangement: { ...tout, [a.code]: autre } }), false);
  assert.equal(core.isRangerComplet(role, null), false);
  // Aucun message ne gronde.
  for (const c of core.verifierRanger(role, tout).cartes) {
    assert.equal(findForbiddenString(c.message), null, c.code);
  }
});

test('ranger : « Le bon pays » porte un indice par carte ; modèle tolérant aux formes incomplètes', () => {
  const brut = jeu('pays-p2');
  const pays = core.buildRanger(brut, PAYS(brut.categories));
  assert.equal(pays.famille, 'pays');
  assert.equal(pays.plateau, 2);
  assert.equal(pays.biome, null);
  assert.ok(
    pays.cartes.every((c) => c.indice),
    'un indice par carte',
  );
  assert.ok(pays.bilan);
  // Une carte dont la catégorie n'est pas proposée sort du modèle ; une carte sans « pourquoi »
  // reçoit le message de repli ; `generique` accepte 1 ; une catégorie sans nom prend son code.
  const m = core.buildRanger(
    {
      cartes: [
        { code: 'A', nom: 'Herbe', categorie: 'x', generique: 1 },
        { code: 'B', nom: 'Zèbre', categorie: 'ailleurs', pourquoi: 'jamais vu' },
        { code: '', nom: 'sans code', categorie: 'x' },
      ],
    },
    [{ code: 'x' }, { code: '' }, null],
  );
  assert.deepEqual(m.categories, [{ code: 'x', nom: 'x', aide: null }]);
  assert.deepEqual(
    m.cartes.map((c) => c.code),
    ['A'],
  );
  assert.equal(m.cartes[0].generique, true);
  assert.equal(m.famille, null);
  assert.equal(m.titre, null);
  assert.equal(core.verifierRanger(m, { A: 'x' }).cartes[0].message, 'C’est la bonne colonne.');
  // Sans carte, rien n'est « complet ».
  assert.equal(core.verifierRanger(core.buildRanger(null), {}).complet, false);
  assert.equal(core.verifierRanger(null, {}).complet, false);
  assert.deepEqual(core.buildRanger({ cartes: 'x' }, 'y').cartes, []);
});

test('ranger : bornes d’un état — seules les cartes du jeu, seules ses catégories', () => {
  const role = core.buildRanger(jeu('role-savane'), RANGER.familles.role.categories);
  const codes = role.cartes.map((c) => c.code);
  const categories = role.categories.map((c) => c.code);
  const [a, b] = codes;
  assert.deepEqual(
    core.normaliserEtat(
      'ranger',
      { indices: 2, rangement: { [a]: 'producteur', [b]: 'ailleurs', HORS: 'producteur' } },
      codes,
      { categories },
    ),
    { indices: 2, rangement: { [a]: 'producteur' } },
  );
  assert.deepEqual(core.normaliserEtat('ranger', { rangement: { [a]: 'producteur' } }, codes), {
    indices: 0,
    rangement: {},
  });
  assert.deepEqual(core.normaliserEtat('ranger', null, codes, null), { indices: 0, rangement: {} });
});

test('fils de l’adaptation : le moteur des fils cachés, du milieu vers l’espèce', () => {
  const biomes = lire('trame-adaptations').biomes;
  assert.equal(biomes.length, 8);
  for (const b of biomes) {
    const m = core.buildAdaptation(b);
    assert.equal(m.type, 'adaptation');
    assert.equal(m.biome, b.biome);
    assert.equal(m.cartes.length, 9);
    assert.equal(core.isFilsComplet(m, m.liens), true, b.biome);
    assert.equal(core.isFilsComplet(m, m.liens.slice(1)), false, b.biome);
  }
  const m = core.buildAdaptation(biomes[0]);
  const [premier] = m.liens;
  assert.equal(core.classifyLink(m, premier.de, premier.vers).classement, 'trouvee');
  const inverse = core.classifyLink(m, premier.vers, premier.de);
  assert.equal(inverse.classement, 'inversee');
  assert.match(inverse.message, /part du milieu, passe par le problème, et arrive à l’espèce/);
  // Un raccourci (du milieu à l'espèce sans le problème) : vrai, mais il manque une étape.
  const suite = m.liens.find((l) => l.de === premier.vers);
  assert.deepEqual(core.classifyLink(m, premier.de, suite.vers), {
    classement: 'a_discuter',
    message: 'C’est vrai, mais il manque une étape entre les deux.',
  });
  // Indices : la même échelle, avec les mots du milieu et de l'espèce.
  assert.match(core.nextHint(m, {}).message, /part du milieu/);
  assert.match(core.nextHint(m, { indices: 1 }).message, /décrit le milieu/);
  const piste = core.nextHint(m, { indices: 2 });
  assert.equal(piste.genre, 'piste');
  assert.match(piste.message, /quel problème pose-t-elle, ou à quel problème répond-elle/);
  const revelation = core.nextHint(m, { indices: 3 });
  assert.equal(revelation.genre, 'revelation');
  assert.match(revelation.message, /^Un fil à tracer : « .+ » mène à « .+ »\.$/);
  assert.match(core.nextHint(m, { indices: 9, fleches: m.liens }).message, /Tous les fils prévus/);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(findForbiddenString(core.nextHint(m, { indices: i }).message), null);
  }
  assert.equal(core.buildAdaptation(null).biome, null);
  // Bornes : les flèches d'un état d'adaptation se bornent comme celles des fils cachés.
  assert.deepEqual(
    core.normaliserEtat(
      'adaptation',
      {
        fleches: [
          { de: 'A', vers: 'B' },
          { de: 'A', vers: 'Z' },
        ],
      },
      ['A', 'B'],
    ),
    { indices: 0, fleches: [{ de: 'A', vers: 'B' }], positions: {} },
  );
});
