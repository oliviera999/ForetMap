import { describe, test, expect } from 'vitest';
import {
  locationMainDescription,
  sameLocationText,
  visitAsideShortDescription,
} from '../../src/utils/locationInfoTexts.js';

describe('locationInfoTexts', () => {
  test('locationMainDescription : description côté zone, note côté repère', () => {
    expect(locationMainDescription({ description: 'Verger', note: 'Autre' }, 'zone')).toBe(
      'Verger',
    );
    expect(locationMainDescription({ description: 'Verger', note: 'Autre' }, 'marker')).toBe(
      'Autre',
    );
    expect(locationMainDescription({}, 'zone')).toBe('');
  });

  test('sameLocationText : espaces et casse ignorés, texte vide jamais égal', () => {
    expect(sameLocationText('Le  verger\ncommun', 'le verger commun')).toBe(true);
    expect(sameLocationText('Le verger', 'Le verger nord')).toBe(false);
    expect(sameLocationText('', '')).toBe(false);
  });

  test('accroche visite identique à la description : masquée (doublon de la bascule carte → visite)', () => {
    const zone = { description: 'Le verger commun.', visit_short_description: 'Le verger commun.' };
    expect(visitAsideShortDescription(zone, 'zone')).toBe('');
    const marker = { note: 'Composteur.', visit_short_description: 'Composteur.' };
    expect(visitAsideShortDescription(marker, 'marker')).toBe('');
  });

  test('accroche visite distincte : conservée ; description absente : conservée', () => {
    expect(
      visitAsideShortDescription(
        { description: 'Notes d’entretien.', visit_short_description: 'Bienvenue au verger !' },
        'zone',
      ),
    ).toBe('Bienvenue au verger !');
    expect(visitAsideShortDescription({ visit_short_description: 'Accroche.' }, 'zone')).toBe(
      'Accroche.',
    );
    expect(visitAsideShortDescription({ description: 'Texte.' }, 'zone')).toBe('');
  });
});
