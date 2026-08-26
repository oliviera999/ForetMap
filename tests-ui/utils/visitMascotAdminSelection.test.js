import { describe, test, expect } from 'vitest';
import {
  registryMascotIds,
  findOrphanMascotIds,
} from '../../src/utils/visitMascotAdminSelection.js';

const REGISTRY = [
  { id: 'renard2-cut-spritesheet', label: 'Renard 2', source: 'catalog' },
  { id: 'gnome1', label: 'Gnome 1', source: 'catalog' },
  { id: 'srv-abeille', label: 'Abeille du verger', source: 'pack' },
];

describe('visitMascotAdminSelection', () => {
  test('le registre se lit dans l’ordre d’affichage, entrées vides écartées', () => {
    expect(registryMascotIds(REGISTRY)).toEqual([
      'renard2-cut-spritesheet',
      'gnome1',
      'srv-abeille',
    ]);
    expect(registryMascotIds([{ id: '  ' }, null, { id: ' gnome1 ' }])).toEqual(['gnome1']);
    expect(registryMascotIds(null)).toEqual([]);
  });

  test('une mascotte par défaut retirée de la visite est signalée', () => {
    // Le cas réel depuis l'étape 3 : un administrateur retire au studio la mascotte qu'il avait
    // désignée par défaut. Les visiteurs retombent alors sur la livrée par défaut ; sans ce
    // repérage, rien à l'écran ne l'expliquerait.
    const ids = registryMascotIds(REGISTRY);
    expect(findOrphanMascotIds(ids, [], 'srv-disparue')).toEqual(['srv-disparue']);
    expect(findOrphanMascotIds(ids, [], 'gnome1')).toEqual([]);
    expect(findOrphanMascotIds(ids, [], '')).toEqual([]);
  });
});
