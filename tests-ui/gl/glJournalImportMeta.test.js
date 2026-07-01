import { describe, test, expect } from 'vitest';
import { importTargetTab, importTargetNav } from '../../src/gl/utils/glJournalImportMeta.js';

describe('glJournalImportMeta — cibles de navigation « Voir »', () => {
  test('importTargetTab reste rétro-compatible (onglet plat)', () => {
    expect(importTargetTab('species', 'SP1')).toBe('biodiversite');
    expect(importTargetTab('content_page', 'rules')).toBe('rules');
    expect(importTargetTab('unknown', 'x')).toBe(null);
  });

  test('importTargetNav porte le type/ref de focus pour un deep-link', () => {
    expect(importTargetNav('ecosystem', 'savane')).toEqual({
      tab: 'ecosystemes',
      focusType: 'ecosystem',
      focusRef: 'savane',
    });
    expect(importTargetNav('feuillet', 'F001')).toEqual({
      tab: 'selene-carnet',
      focusType: 'feuillet',
      focusRef: 'F001',
    });
    expect(importTargetNav('tutorial', 12)).toEqual({
      tab: 'tutorials',
      focusType: 'tutorial',
      focusRef: '12',
    });
    expect(importTargetNav('glossary', 'GL1')).toEqual({
      tab: 'glossary',
      focusType: 'glossary',
      focusRef: 'GL1',
    });
  });

  test('content_page cible sa page (pas de focus intra-onglet)', () => {
    expect(importTargetNav('content_page', 'rules')).toEqual({
      tab: 'rules',
      focusType: null,
      focusRef: null,
    });
  });

  test('type inconnu → pas de cible', () => {
    expect(importTargetNav('nope', 'x')).toBe(null);
  });
});
