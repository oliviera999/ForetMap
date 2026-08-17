import { describe, test, expect } from 'vitest';
import {
  registryMascotIds,
  isMascotProposed,
  toggleProposedMascotId,
  chooseDefaultMascotId,
  findOrphanMascotIds,
} from '../../src/utils/visitMascotAdminSelection.js';

const REGISTRY = [
  { id: 'renard2-cut-spritesheet', label: 'Renard 2', source: 'catalog' },
  { id: 'gnome1', label: 'Gnome 1', source: 'catalog' },
  { id: 'srv-abeille', label: 'Abeille du verger', source: 'pack' },
];
const IDS = registryMascotIds(REGISTRY);

describe('visitMascotAdminSelection', () => {
  test('liste vide = toutes les mascottes proposées', () => {
    expect(IDS).toEqual(['renard2-cut-spritesheet', 'gnome1', 'srv-abeille']);
    for (const id of IDS) expect(isMascotProposed([], id)).toBe(true);
    expect(isMascotProposed(['gnome1'], 'srv-abeille')).toBe(false);
  });

  test('première décoche : la liste complète est matérialisée moins la mascotte', () => {
    expect(toggleProposedMascotId([], IDS, 'gnome1')).toEqual([
      'renard2-cut-spritesheet',
      'srv-abeille',
    ]);
  });

  test('recocher ajoute, décocher la dernière revient à « toutes proposées »', () => {
    expect(toggleProposedMascotId(['gnome1'], IDS, 'srv-abeille')).toEqual([
      'gnome1',
      'srv-abeille',
    ]);
    expect(toggleProposedMascotId(['gnome1'], IDS, 'gnome1')).toEqual([]);
  });

  test('un pack se coche et se décoche comme une mascotte livrée', () => {
    const withoutPack = toggleProposedMascotId([], IDS, 'srv-abeille');
    expect(withoutPack).toEqual(['renard2-cut-spritesheet', 'gnome1']);
    expect(toggleProposedMascotId(withoutPack, IDS, 'srv-abeille')).toContain('srv-abeille');
  });

  test('la mascotte par défaut est toujours proposée', () => {
    expect(chooseDefaultMascotId(['gnome1'], 'srv-abeille')).toEqual({
      defaultId: 'srv-abeille',
      allowedIds: ['gnome1', 'srv-abeille'],
    });
    // Liste vide : aucune restriction, rien à ajouter.
    expect(chooseDefaultMascotId([], 'srv-abeille')).toEqual({
      defaultId: 'srv-abeille',
      allowedIds: [],
    });
  });

  test('ids orphelins : réglés mais absents du registre', () => {
    expect(findOrphanMascotIds(IDS, ['gnome1', 'srv-supprime'], 'srv-parti')).toEqual([
      'srv-supprime',
      'srv-parti',
    ]);
    expect(findOrphanMascotIds(IDS, [], 'gnome1')).toEqual([]);
  });
});
