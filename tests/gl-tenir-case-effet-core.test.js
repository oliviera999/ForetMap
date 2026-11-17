'use strict';

/**
 * Noyau partagé « vérité des cases » (`src/shared/glTenirCaseEffetCore.js`, miroir
 * `lib/shared/`) : l'effet résolu en mode tenir est celui que le moteur applique
 * (`lib/glMarkerVitalityEffects.js` délègue au même noyau), et sa mise en mots ne promet jamais
 * autre chose. Hors mode tenir, `formatMarkerEffectSummary` et `buildMarkerArrivalPayload` sont
 * inchangés.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTenirCaseEffet,
  formatTenirCaseEffet,
  tenirCaseEffetSummary,
  markerTonaliteCore,
} = require('../lib/shared/glTenirCaseEffetCore');
const { formatMarkerEffectSummary, buildMarkerArrivalPayload } = require('../lib/glMarkerEffects');
const { resolveTenirMarkerDeltas } = require('../lib/glMarkerVitalityEffects');
const { findForbiddenString } = require('../lib/glTenirImport');
const { parsePromisedEffects } = require('../lib/glMarkerPromiseAudit');

const cfg = (effects, eventMeta = null) =>
  JSON.stringify({
    version: 2,
    ...(effects ? { effects } : {}),
    ...(eventMeta ? { eventMeta } : {}),
  });

const trameP4 = {
  id: 124,
  label: 'Renouer le nœud',
  event_type: 'behavior',
  effet_mecanique: null,
  event_config_json: cfg(
    {
      gnome: { label: 'Gnome : tu réintroduis l’espèce manquante → +1 cœur.', deltaPv: 2 },
      unicorn: { label: 'Licorne : tu cartographies le réseau → +1 gemme.', deltaGems: 2 },
    },
    { tonalite: 'trame', rarete: null },
  ),
};
const souffle = {
  id: 11,
  label: 'Tiédeur étrange',
  event_type: 'behavior',
  event_config_json: cfg(
    {
      gnome: { label: 'Gnome : la moiteur t’épuise → recule de 1 case.', deltaMove: -1 },
      unicorn: { label: 'Licorne : un signe → passe ton tour.', passTurn: true },
    },
    { tonalite: 'souffle', rarete: null },
  ),
};
const positive = {
  id: 48,
  label: 'Coup de chance',
  event_type: 'behavior',
  effet_mecanique: '+2 cœurs',
  event_config_json: cfg(
    { neutral: { label: null, deltaPv: 2 } },
    { tonalite: 'positif', rarete: 'commun' },
  ),
};
const perteNeutre = {
  id: 52,
  label: 'Déshydratation',
  event_type: 'behavior',
  effet_mecanique: 'Le biome éprouve la caravane : on s’abrite, puis on repart.',
  event_config_json: cfg(
    { neutral: { label: null, deltaPv: -1 } },
    { tonalite: 'negatif', rarete: 'commun' },
  ),
};
const defi = {
  id: 23,
  label: 'Défi d’équipe',
  event_type: 'behavior',
  effet_mecanique: 'Mini-défi proposé par le professeur. Ni gain ni perte.',
  event_config_json: null,
};

test('Trame (M3) : +1 gemme pour les deux peuples, quels que soient les deltas écrits ; le texte le dit', () => {
  for (const teamType of ['gnome', 'unicorn']) {
    const effet = resolveTenirCaseEffet(trameP4, teamType);
    assert.deepEqual(
      { h: effet.healthDelta, p: effet.powerDelta, t: effet.tonalite, a: effet.applique },
      { h: 0, p: 1, t: 'trame', a: true },
      teamType,
    );
    assert.equal(
      formatTenirCaseEffet(effet),
      'Case Trame : +1 gemme pour chaque membre de l’équipe.',
    );
  }
  // Sans bloc `effects`, une case Trame donne quand même +1 gemme.
  const nue = resolveTenirCaseEffet(
    { event_type: 'trame', event_config_json: cfg(null, { tonalite: 'trame' }) },
    'gnome',
  );
  assert.deepEqual({ h: nue.healthDelta, p: nue.powerDelta }, { h: 0, p: 1 });
});

test('Souffle (M3) : au prochain tour, un seul dé, pour les deux peuples ; ni recul ni tour passé ; Sentier l’empêche', () => {
  for (const teamType of ['gnome', 'unicorn']) {
    const effet = resolveTenirCaseEffet(souffle, teamType);
    assert.deepEqual(
      {
        m: effet.moveDelta,
        pt: effet.passTurn,
        h: effet.healthDelta,
        p: effet.powerDelta,
        u: effet.unDe,
        a: effet.applique,
      },
      { m: 0, pt: false, h: 0, p: 0, u: true, a: true },
      teamType,
    );
    assert.equal(
      formatTenirCaseEffet(effet),
      'Case Souffle : au prochain tour, l’équipe ne lance qu’un dé.',
    );
  }
  // Une case Souffle sans bloc `effects` agit aussi.
  const nue = resolveTenirCaseEffet(
    { event_type: 'souffle', event_config_json: cfg(null, { tonalite: 'souffle' }) },
    'unicorn',
  );
  assert.equal(nue.unDe, true);
  const sentier = resolveTenirCaseEffet(souffle, 'unicorn', { sentierActif: true });
  assert.deepEqual(
    { s: sentier.sentier, u: sentier.unDe, pt: sentier.passTurn, m: sentier.moveDelta },
    { s: true, u: false, pt: false, m: 0 },
  );
  assert.equal(
    formatTenirCaseEffet(sentier),
    'Sentier : la case Souffle n’a aucun effet sur l’équipe.',
  );
});

test('cases positives (M3) : leur mouvement, sans ressource ; brut → plateau ; pertes et reculs neutralisés', () => {
  const avance = {
    ...positive,
    event_config_json: cfg(
      { neutral: { label: null, deltaPv: 2, deltaMove: 2 } },
      { tonalite: 'positif' },
    ),
  };
  for (const teamType of ['gnome', 'unicorn']) {
    const effet = resolveTenirCaseEffet(positive, teamType);
    assert.deepEqual(
      { h: effet.healthDelta, p: effet.powerDelta, n: effet.neutralise, t: effet.tonalite },
      { h: 0, p: 0, n: 'gain', t: 'positif' },
    );
    assert.equal(formatTenirCaseEffet(effet), 'Une case favorable : on repart, sans gain.');
    const mouvement = resolveTenirCaseEffet(avance, teamType);
    assert.deepEqual({ h: mouvement.healthDelta, m: mouvement.moveDelta }, { h: 0, m: 2 });
    assert.equal(formatTenirCaseEffet(mouvement), 'L’équipe avance de 2 cases.');
  }
  // Ancienne valeur du réglage : lue `neutre`.
  const ancien = resolveTenirCaseEffet(positive, 'gnome', { casesPositives: 'ressource_peuple' });
  assert.equal(ancien.healthDelta, 0);
  const brut = resolveTenirCaseEffet(positive, 'gnome', { casesPositives: 'brut' });
  assert.equal(brut.healthDelta, 2);
  const perte = resolveTenirCaseEffet(perteNeutre, 'gnome');
  assert.deepEqual(
    { h: perte.healthDelta, n: perte.neutralise, a: perte.applique },
    { h: 0, n: 'perte', a: false },
  );
  assert.equal(
    formatTenirCaseEffet(perte),
    'Le biome éprouve la caravane : rien n’est retiré, on s’abrite puis on repart.',
  );
  const recul = resolveTenirCaseEffet(
    {
      event_type: 'behavior',
      event_config_json: cfg(
        { neutral: { label: null, deltaMove: -3, passTurn: true } },
        { tonalite: 'negatif' },
      ),
    },
    'unicorn',
  );
  assert.deepEqual(
    { m: recul.moveDelta, pt: recul.passTurn, n: recul.neutralise },
    { m: 0, pt: false, n: 'perte' },
  );
});

test('sans effet : texte vide ; péripétie annoncée ; jamais de chaîne interdite', () => {
  const rien = resolveTenirCaseEffet(defi, 'gnome');
  assert.equal(rien.applique, false);
  assert.equal(formatTenirCaseEffet(rien), '');
  assert.equal(
    formatTenirCaseEffet(rien, { peripetie: true }),
    'Une péripétie à relever ensemble.',
  );
  for (const marker of [trameP4, souffle, positive, perteNeutre, defi]) {
    for (const teamType of ['gnome', 'unicorn']) {
      const text = tenirCaseEffetSummary(marker, teamType, { peripetie: true });
      assert.equal(findForbiddenString(text), null, text);
      const effet = resolveTenirCaseEffet(marker, teamType);
      const promised = parsePromisedEffects(text);
      assert.equal(promised.deltaPv ?? null, effet.healthDelta || null, text);
      assert.equal(promised.deltaGems ?? null, effet.powerDelta || null, text);
      assert.equal(promised.deltaMove ?? null, effet.moveDelta || null, text);
    }
  }
});

test('formatMarkerEffectSummary : calculé en mode tenir, texte d’auteur hors tenir', () => {
  assert.equal(
    formatMarkerEffectSummary(positive, 'gnome', { tenir: true }),
    'Une case favorable : on repart, sans gain.',
  );
  assert.equal(formatMarkerEffectSummary(positive, 'gnome'), '+2 cœurs');
  assert.equal(
    formatMarkerEffectSummary(souffle, 'unicorn', { tenir: true, sentierActif: true }),
    'Sentier : la case Souffle n’a aucun effet sur l’équipe.',
  );
});

test('buildMarkerArrivalPayload : en mode tenir, effetMecanique est nul et les deltas sont ceux appliqués', () => {
  const tenir = buildMarkerArrivalPayload(trameP4, { type: 'gnome' }, { tenir: true });
  assert.equal(tenir.effetMecanique, null);
  assert.equal(tenir.effectSummary, 'Case Trame : +1 gemme pour chaque membre de l’équipe.');
  assert.deepEqual(
    { pv: tenir.resolvedEffect.deltaPv, g: tenir.resolvedEffect.deltaGems, h: tenir.hasEffects },
    { pv: 0, g: 1, h: true },
  );
  const souffleTenir = buildMarkerArrivalPayload(souffle, { type: 'unicorn' }, { tenir: true });
  assert.deepEqual(
    { u: souffleTenir.unDe, pt: souffleTenir.passTurn, h: souffleTenir.hasEffects },
    { u: true, pt: false, h: true },
  );
  const classique = buildMarkerArrivalPayload(positive, { type: 'unicorn' });
  assert.equal(classique.effetMecanique, '+2 cœurs');
  assert.equal(classique.resolvedEffect.deltaPv, 2);
  const defiTenir = buildMarkerArrivalPayload(defi, { type: 'gnome' }, { tenir: true });
  assert.deepEqual(
    { s: defiTenir.effectSummary, h: defiTenir.hasEffects, pt: defiTenir.passTurn },
    { s: '', h: false, pt: false },
  );
});

test('resolveTenirMarkerDeltas (moteur) et le noyau donnent les mêmes deltas', () => {
  for (const marker of [trameP4, souffle, positive, perteNeutre]) {
    for (const teamType of ['gnome', 'unicorn']) {
      const resolved = require('../lib/glMarkerEffects').resolveMarkerEffects(marker, teamType);
      const moteur = resolveTenirMarkerDeltas(marker, teamType, resolved);
      const noyau = resolveTenirCaseEffet(marker, teamType);
      assert.deepEqual(
        {
          h: moteur.healthDelta,
          p: moteur.powerDelta,
          m: moteur.moveDelta,
          t: moteur.tonalite,
          u: moteur.unDe,
        },
        {
          h: noyau.healthDelta,
          p: noyau.powerDelta,
          m: noyau.moveDelta,
          t: noyau.tonalite,
          u: noyau.unDe,
        },
        `${marker.label} / ${teamType}`,
      );
    }
  }
  assert.equal(markerTonaliteCore(souffle), 'souffle');
  assert.equal(markerTonaliteCore({ event_type: 'trame' }), 'trame');
});

test('toutes les branches du noyau : peuples, branches de repli, brut, textes', () => {
  const {
    peopleKeyOf,
    resourceOfPeopleCore,
    resolveMarkerBranchCore,
    normalizeCasesPositives,
  } = require('../lib/shared/glTenirCaseEffetCore');
  assert.equal(peopleKeyOf('Licorne'), 'unicorn');
  assert.equal(peopleKeyOf(null), null);
  assert.equal(resourceOfPeopleCore('unicorn'), 'power');
  assert.equal(resourceOfPeopleCore(undefined), 'health');
  assert.equal(normalizeCasesPositives(undefined), 'neutre');
  assert.equal(normalizeCasesPositives('brut'), 'brut');
  const marqueeVide = { event_type: 'behavior', event_config_json: null };
  // Branches de repli : sans effets, peuple seul, première clé.
  assert.equal(resolveMarkerBranchCore({ event_config_json: null }, 'gnome'), null);
  const gnomeSeul = { event_config_json: cfg({ gnome: { label: 'g', deltaMove: 1 } }) };
  assert.equal(resolveMarkerBranchCore(gnomeSeul, 'gnome').branch, 'gnome');
  assert.equal(resolveMarkerBranchCore(gnomeSeul, 'unicorn').branch, 'gnome');
  assert.equal(resolveMarkerBranchCore(gnomeSeul, null).branch, 'gnome');
  const mixte = {
    event_type: 'trame',
    event_config_json: cfg({
      neutral: { label: 'n', deltaMove: 1 },
      gnome: { label: 'g', deltaMove: 2 },
    }),
  };
  assert.equal(resolveMarkerBranchCore(mixte, 'unicorn').branch, 'neutral');
  assert.equal(resolveMarkerBranchCore(mixte, null).branch, 'neutral');
  // Un delta illisible (branche passée telle quelle) compte pour 0.
  const illisible = resolveTenirCaseEffet(marqueeVide, 'gnome', {
    resolved: { branch: 'neutral', deltaPv: 'abc', deltaMove: 2 },
  });
  assert.deepEqual({ h: illisible.healthDelta, m: illisible.moveDelta }, { h: 0, m: 2 });
  // Tonalité lue sur le type de case.
  assert.equal(markerTonaliteCore({ eventType: 'Souffle' }), 'souffle');
  assert.equal(
    markerTonaliteCore({ event_config_json: cfg(null, { tonalite: 'positif' }) }),
    'positif',
  );
  // Une case non Souffle qui porte la clé « un seul dé » la tient aussi.
  const marquee = {
    event_type: 'behavior',
    event_config_json: cfg({ neutral: { label: 'x', unDeAuProchainTour: true, deltaPv: 1 } }),
  };
  const m1 = resolveTenirCaseEffet(marquee, 'gnome');
  assert.deepEqual(
    { u: m1.unDe, n: m1.neutralise, h: m1.healthDelta },
    { u: true, n: 'gain', h: 0 },
  );
  const marqueeSeule = {
    event_type: 'behavior',
    event_config_json: cfg({ neutral: { label: 'x', unDeAuProchainTour: true } }),
  };
  assert.equal(
    formatTenirCaseEffet(resolveTenirCaseEffet(marqueeSeule, 'unicorn')),
    'Au prochain tour, l’équipe ne lance qu’un dé.',
  );
  // Brut : valeurs du plateau (recul et tour passé compris), mises en mots.
  const brut = resolveTenirCaseEffet(
    {
      event_type: 'behavior',
      event_config_json: cfg({
        neutral: { label: null, deltaPv: -2, deltaMove: -1, passTurn: true },
      }),
    },
    'gnome',
    { casesPositives: 'brut' },
  );
  assert.equal(
    formatTenirCaseEffet(brut),
    '−2 cœurs pour chaque membre de l’équipe, l’équipe recule de 1 case, l’équipe passe son tour.',
  );
  assert.equal(
    formatTenirCaseEffet({ healthDelta: 1, moveDelta: 3 }, { peripetie: true }),
    '+1 cœur pour chaque membre de l’équipe, l’équipe avance de 3 cases. Une péripétie à relever ensemble.',
  );
  assert.equal(formatTenirCaseEffet(null), '');
});
