import { describe, test, expect } from 'vitest';

import {
  SHARED_TOUR_KEY,
  applyTourOverridesFrom,
  createTourRegistryApi,
  resolveDiscoveryBodyFrom,
  resolveDiscoveryExpressionFrom,
  tourOverrideKeyFrom,
} from '../../src/shared/tour/tourRegistryCore.js';

const RELAUNCH = { key: 'relaunch', title: 'Relance', body: 'Je reviens quand tu veux.' };

const REGISTRY = {
  cartes: {
    steps: [
      { key: 'intro', title: 'Les cartes', body: 'Voilà la carte.', target: '#carte' },
      { key: 'mj', title: 'Pilotage', body: 'Réservé', role: 'teacher', target: '#mj' },
      RELAUNCH,
    ],
  },
  vide: { steps: [] },
};

const api = createTourRegistryApi(REGISTRY, { sharedStepKeys: [RELAUNCH.key] });

describe('noyau de registre de parcours', () => {
  test('filtre les étapes par rôle', () => {
    expect(api.getSteps('cartes', false).map((s) => s.key)).toEqual(['intro', 'relaunch']);
    expect(api.getSteps('cartes', true).map((s) => s.key)).toEqual(['intro', 'mj', 'relaunch']);
  });

  test('un parcours inconnu ou vide ne casse rien', () => {
    expect(api.getSteps('inexistant')).toEqual([]);
    expect(api.hasTour('vide')).toBe(false);
    expect(api.hasTour('cartes')).toBe(true);
  });

  test('les étapes partagées sont rangées sous une clé commune', () => {
    expect(api.overrideKey('cartes', RELAUNCH, 'body')).toBe(`${SHARED_TOUR_KEY}.relaunch.body`);
    expect(api.overrideKey('cartes', REGISTRY.cartes.steps[0], 'body')).toBe('cartes.intro.body');
  });

  test('une surcharge remplace le texte sans toucher à la structure', () => {
    const [step] = api.getSteps('cartes', false, { 'cartes.intro.body': 'Texte maison' });
    expect(step.body).toBe('Texte maison');
    expect(step.target).toBe('#carte');
  });

  test('une surcharge vide revient au défaut', () => {
    const [step] = api.getSteps('cartes', false, { 'cartes.intro.body': '   ' });
    expect(step.body).toBe('Voilà la carte.');
  });

  test('un bodyTeacher absent du défaut ne peut pas être créé par surcharge', () => {
    const [step] = api.getSteps('cartes', false, { 'cartes.intro.bodyTeacher': 'Ajouté' });
    expect(step.bodyTeacher).toBeUndefined();
  });

  test('les étapes ne sont jamais mutées — l’étape partagée reste intacte', () => {
    api.getSteps('cartes', false, { [`${SHARED_TOUR_KEY}.relaunch.body`]: 'Autre' });
    expect(RELAUNCH.body).toBe('Je reviens quand tu veux.');
  });

  test('resolveDiscoveryBodyFrom prend la variante de service si elle existe', () => {
    const step = { body: 'élève', bodyTeacher: 'prof' };
    expect(resolveDiscoveryBodyFrom(step, false)).toBe('élève');
    expect(resolveDiscoveryBodyFrom(step, true)).toBe('prof');
    expect(resolveDiscoveryBodyFrom({ body: 'seul' }, true)).toBe('seul');
    expect(resolveDiscoveryBodyFrom(null, true)).toBe('');
  });

  test('une expression inconnue retombe sur neutre', () => {
    expect(resolveDiscoveryExpressionFrom({ expression: 'montre' })).toBe('montre');
    expect(resolveDiscoveryExpressionFrom({ expression: 'zzz' })).toBe('neutre');
    expect(resolveDiscoveryExpressionFrom(null)).toBe('neutre');
  });

  test('sans surcharge, la liste d’étapes est renvoyée telle quelle', () => {
    const steps = REGISTRY.cartes.steps;
    expect(applyTourOverridesFrom(steps, 'cartes', null)).toBe(steps);
    expect(tourOverrideKeyFrom('cartes', { key: 'x' }, 'title')).toBe('cartes.x.title');
  });
});
