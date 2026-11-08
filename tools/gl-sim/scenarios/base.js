'use strict';

/**
 * Scénarios élémentaires. Tous jouent au plus `seances` séances (6 par défaut, le prof clôt à
 * la sixième), 20 élèves de classe moyenne sur le plateau 1 en surface hybride sauf mention.
 */

function scenario(def) {
  return Object.freeze({
    classe: 'moyenne',
    effectif: 20,
    surface: 'hybride',
    plateaux: [1],
    seances: 6,
    reglages: {},
    profil: 'complet',
    composition: 'explicite',
    parallele: false,
    personas: {},
    prof: {},
    ...def,
  });
}

/** Absences posées par le prof : deux élèves tirés au sort manquent les séances 2 et 4. */
function absencesPosees(seance, joueurs, rng) {
  if (seance !== 2 && seance !== 4) return [];
  const ids = joueurs.map((j) => j.id);
  return rng.shuffle(ids).slice(0, 2);
}

/** Retraits posés par le prof : un élève en retrait aux séances 2 et 3, un autre à la 5. */
function retraitsPoses(joueurs) {
  const ids = joueurs.map((j) => j.id);
  if (ids.length < 2) return [];
  return [
    { seance: 2, playerId: ids[0] },
    { seance: 3, playerId: ids[0] },
    { seance: 5, playerId: ids[1] },
  ];
}

const SCENARIOS = [
  scenario({
    id: 'hybride-reference',
    description:
      'Référence : surface hybride, 20 élèves, classe moyenne, plateau 1, 6 séances au plus.',
  }),
  scenario({
    id: 'tablette-reference',
    description:
      'Référence tablette : les élèves lancent (dés serveur), répondent, fouillent, lisent.',
    surface: 'tablette',
  }),
  scenario({
    id: 'tableau-pur',
    description:
      'Tout tableau : le prof porte les cinq gestes pour l’équipe active, Marché en veillée seulement.',
    surface: 'tableau',
  }),
  scenario({
    id: 'classe-en-difficulte',
    description: 'Classe en difficulté : justesse ~ N(0,45 ; 0,12).',
    classe: 'difficulte',
  }),
  scenario({
    id: 'classe-experte',
    description: 'Classe experte : justesse ~ N(0,8 ; 0,1).',
    classe: 'experte',
  }),
  scenario({
    id: 'effectif-24',
    description: '24 élèves : équipes de 6.',
    effectif: 24,
  }),
  scenario({
    id: 'effectif-17',
    description: '17 élèves : équipes de 4 et 5.',
    effectif: 17,
  }),
  scenario({
    id: 'absences-retraits',
    description:
      'Absences cochées et retraits posés par le prof ; les absents gardent les gains d’équipe.',
    prof: { absences: absencesPosees, retraits: retraitsPoses },
  }),
  scenario({
    id: 'economie-agressive',
    description: 'Penchants sorts et Marché très élevés : l’économie sous pression.',
    personas: { penchants: { sorts: 0.95, marche: 0.9, dons: 0.6 } },
  }),
  scenario({
    id: 'chasse-aveugle',
    description: 'Toutes les équipes fouillent au hasard (clics uniformes).',
    personas: { strategieFouille: 'aveugle' },
  }),
  scenario({
    id: 'chasse-futee',
    description:
      'Toutes les équipes suivent empreintes et contours ; les Gnomes réparent les pages pâlies.',
    personas: { strategieFouille: 'futee' },
  }),
  scenario({
    id: 'voile-max',
    description: 'Bonus du dé gris +2 sur chaque plateau : {6,6,7,8}.',
    reglages: { 'gameplay.tenir_voile_bonus_par_plateau': { 1: 6, 2: 6, 3: 7, 4: 8 } },
  }),
  scenario({
    id: 'voile-dort',
    description: 'Le prof ne lance pas le dé gris une séance sur deux.',
    prof: { voileDort: (seance) => seance % 2 === 0 },
  }),
  scenario({
    id: 'prologue',
    description: 'Profil prologue : sans voile, sans Marché, sans chapardeur, 8 zones.',
    profil: 'prologue',
  }),
  scenario({
    id: 'plateau-2',
    description: 'Plateau 2 (Aride chaud), classe moyenne.',
    plateaux: [2],
  }),
  scenario({
    id: 'plateau-3',
    description: 'Plateau 3 (Tempéré atlantique), 10 zones.',
    plateaux: [3],
  }),
  scenario({
    id: 'plateau-4',
    description: 'Plateau 4 (Eurasie continentale), 10 zones, Passeur.',
    plateaux: [4],
  }),
  scenario({
    id: 'annee-complete',
    description:
      'Quatre chapitres enchaînés, mêmes élèves, équipes rebrassées et peuples inversés par la composition automatique.',
    plateaux: [1, 2, 3, 4],
    composition: 'auto',
  }),
  scenario({
    id: 'concurrence',
    description: 'Actions simultanées d’équipes différentes (Promise.all) sur tablette.',
    surface: 'tablette',
    parallele: true,
  }),
  scenario({
    id: 'veillee-semaine',
    description:
      'Veillée appuyée : horloge avancée jour par jour, forte propension aux actions de veillée.',
    personas: {},
    veillee: { mu: 0.8, sigma: 0.1 },
  }),
];

module.exports = { scenario, absencesPosees, retraitsPoses, SCENARIOS };
