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

test('Trame : +1 ressource du peuple quels que soient les deltas écrits ; le texte le dit', () => {
  const gnome = resolveTenirCaseEffet(trameP4, 'gnome');
  assert.deepEqual(
    { h: gnome.healthDelta, p: gnome.powerDelta, t: gnome.tonalite, a: gnome.applique },
    { h: 1, p: 0, t: 'trame', a: true },
  );
  const licorne = resolveTenirCaseEffet(trameP4, 'unicorn');
  assert.deepEqual({ h: licorne.healthDelta, p: licorne.powerDelta }, { h: 0, p: 1 });
  assert.equal(formatTenirCaseEffet(gnome), 'Case Trame : +1 cœur pour chaque membre de l’équipe.');
  assert.equal(
    formatTenirCaseEffet(licorne),
    'Case Trame : +1 gemme pour chaque membre de l’équipe.',
  );
  // Sans bloc `effects`, une case Trame donne quand même +1.
  const nue = resolveTenirCaseEffet(
    { event_type: 'trame', event_config_json: cfg(null, { tonalite: 'trame' }) },
    'gnome',
  );
  assert.equal(nue.healthDelta, 1);
});

test('Souffle : effet du plateau tel quel par peuple, tour passé compris ; Sentier neutralise', () => {
  const gnome = resolveTenirCaseEffet(souffle, 'gnome');
  assert.deepEqual({ m: gnome.moveDelta, pt: gnome.passTurn }, { m: -1, pt: false });
  assert.equal(formatTenirCaseEffet(gnome), 'Case Souffle : l’équipe recule de 1 case.');
  const licorne = resolveTenirCaseEffet(souffle, 'unicorn');
  assert.deepEqual({ m: licorne.moveDelta, pt: licorne.passTurn }, { m: 0, pt: true });
  assert.equal(formatTenirCaseEffet(licorne), 'Case Souffle : l’équipe passe son tour.');
  const sentier = resolveTenirCaseEffet(souffle, 'unicorn', { sentierActif: true });
  assert.deepEqual(
    { s: sentier.sentier, pt: sentier.passTurn, m: sentier.moveDelta, a: sentier.applique },
    { s: true, pt: false, m: 0, a: true },
  );
  assert.equal(
    formatTenirCaseEffet(sentier),
    'Sentier : la case Souffle n’a aucun effet sur l’équipe.',
  );
});

test('C4 : case positive → +1 ressource du peuple ; neutre → rien ; brut → plateau ; perte neutre neutralisée', () => {
  const gnome = resolveTenirCaseEffet(positive, 'gnome');
  assert.deepEqual({ h: gnome.healthDelta, t: gnome.tonalite }, { h: 1, t: 'positif' });
  assert.equal(formatTenirCaseEffet(gnome), '+1 cœur pour chaque membre de l’équipe.');
  const licorne = resolveTenirCaseEffet(positive, 'unicorn');
  assert.equal(formatTenirCaseEffet(licorne), '+1 gemme pour chaque membre de l’équipe.');
  const neutre = resolveTenirCaseEffet(positive, 'gnome', { casesPositives: 'neutre' });
  assert.deepEqual({ h: neutre.healthDelta, n: neutre.neutralise }, { h: 0, n: 'gain' });
  assert.equal(formatTenirCaseEffet(neutre), 'Une case favorable : on repart, sans gain.');
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
    '+1 cœur pour chaque membre de l’équipe.',
  );
  assert.equal(formatMarkerEffectSummary(positive, 'gnome'), '+2 cœurs');
  assert.equal(
    formatMarkerEffectSummary(souffle, 'unicorn', { tenir: true, sentierActif: true }),
    'Sentier : la case Souffle n’a aucun effet sur l’équipe.',
  );
});

test('buildMarkerArrivalPayload : en mode tenir, effetMecanique est nul et les deltas sont ceux appliqués', () => {
  const tenir = buildMarkerArrivalPayload(positive, { type: 'unicorn' }, { tenir: true });
  assert.equal(tenir.effetMecanique, null);
  assert.equal(tenir.effectSummary, '+1 gemme pour chaque membre de l’équipe.');
  assert.deepEqual(
    { pv: tenir.resolvedEffect.deltaPv, g: tenir.resolvedEffect.deltaGems, h: tenir.hasEffects },
    { pv: 0, g: 1, h: true },
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
        { h: moteur.healthDelta, p: moteur.powerDelta, m: moteur.moveDelta, t: moteur.tonalite },
        { h: noyau.healthDelta, p: noyau.powerDelta, m: noyau.moveDelta, t: noyau.tonalite },
        `${marker.label} / ${teamType}`,
      );
    }
  }
  assert.equal(markerTonaliteCore(souffle), 'souffle');
  assert.equal(markerTonaliteCore({ event_type: 'trame' }), 'trame');
});
