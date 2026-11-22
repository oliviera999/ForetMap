import { describe, it, expect } from 'vitest';
import {
  buildGraphModel,
  elsewhereText,
  readElsewhere,
  readInScope,
} from '../../../src/components/pedago/foodWebGraphModel.js';
import { describeRow } from '../../../src/components/pedago/foodWebRows.js';

/**
 * Chantier collège du 22/11/2026, lot 1 : périmètre lu une seule fois (`readInScope`) et
 * mention « vit ailleurs : … » des espèces hors carte (graphe et liste).
 */

const SABLETTES = { id: 'sablettes', label: 'Sablettes' };
const DAYA = { id: 'dayat', label: 'Daya' };

const row = (extra = {}) => ({
  id: 1,
  interaction_type: 'predation',
  from_id: 10,
  from_name: 'Renard',
  to_id: 20,
  to_name: 'Poule',
  from_in_scope: 1,
  to_in_scope: 0,
  from_elsewhere: [],
  to_elsewhere: [SABLETTES, DAYA],
  ...extra,
});

describe('readInScope / readElsewhere', () => {
  it('1/0 de MySQL ; colonne absente = dans le périmètre', () => {
    expect(readInScope(1)).toBe(true);
    expect(readInScope('0')).toBe(false);
    expect(readInScope(undefined)).toBe(true);
    expect(readInScope(null)).toBe(true);
  });
  it('liste normalisée, `null` sans information', () => {
    expect(readElsewhere(undefined)).toBeNull();
    expect(readElsewhere([{ id: 'n3' }])).toEqual([{ id: 'n3', label: 'n3' }]);
  });
});

describe('elsewhereText', () => {
  it('cartes nommées, aucune carte, pas d’information', () => {
    expect(elsewhereText([SABLETTES, DAYA])).toBe('vit ailleurs : Sablettes, Daya');
    expect(elsewhereText([])).toBe('n’est rattachée à aucune carte');
    expect(elsewhereText(null)).toBeNull();
  });
});

describe('buildGraphModel — nœud hors périmètre', () => {
  it('porte les cartes où il vit ; une espèce vue dans le périmètre les perd', () => {
    const { nodes } = buildGraphModel([row()]);
    const poule = nodes.find((n) => n.id === 20);
    expect(poule.outOfScope).toBe(true);
    expect(elsewhereText(poule.elsewhere)).toBe('vit ailleurs : Sablettes, Daya');
    const renard = nodes.find((n) => n.id === 10);
    expect(renard.outOfScope).toBe(false);
    expect(renard.elsewhere).toBeNull();

    const both = buildGraphModel([
      row(),
      row({ id: 2, from_id: 20, from_name: 'Poule', to_id: 30, from_in_scope: 1 }),
    ]);
    const poule2 = both.nodes.find((n) => n.id === 20);
    expect(poule2.outOfScope).toBe(false);
    expect(poule2.elsewhere).toBeNull();
  });
  it('G&L (sans colonnes de périmètre) : comportement inchangé', () => {
    const { nodes } = buildGraphModel([
      { id: 1, interaction_type: 'predation', from_id: 1, to_id: 2 },
    ]);
    expect(nodes.every((n) => n.outOfScope === false && n.elsewhere === null)).toBe(true);
  });
});

describe('describeRow — extrémités marquées', () => {
  it('l’extrémité hors carte porte sa mention, l’environnement jamais', () => {
    const d = describeRow(row());
    const poule = [d.tail, d.head].find((n) => Number(n.id) === 20);
    expect(poule.outOfScope).toBe(true);
    expect(poule.elsewhere).toEqual([SABLETTES, DAYA]);
    const env = describeRow(row({ to_id: null, interaction_type: 'decomposition' }));
    const envNode = [env.tail, env.head].find((n) => n.id == null);
    expect(envNode.outOfScope).toBe(false);
  });
});
