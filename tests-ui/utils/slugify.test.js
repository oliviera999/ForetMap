import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/utils/slugify';

describe('slugify', () => {
  it('translittère les accents au lieu de les supprimer', () => {
    // Le défaut historique : `[^a-z0-9]` mangeait le « é » et laissait `el_ve_expert`
    // / `n3beur_b_b` dans roles.slug (audit docs/AUDIT_BDD_2026-08.md §5.5).
    expect(slugify('élève expert', { separator: '_' })).toBe('eleve_expert');
    expect(slugify('n3beur bébé', { separator: '_' })).toBe('n3beur_bebe');
    expect(slugify('Forêt comestible')).toBe('foret-comestible');
    expect(slugify('Élèves — çà et là')).toBe('eleves-ca-et-la');
  });

  it('utilise le tiret par défaut et accepte le souligné', () => {
    expect(slugify('2nde A')).toBe('2nde-a');
    expect(slugify('2nde A', { separator: '_' })).toBe('2nde_a');
    expect(slugify('2nde A', { separator: '?' })).toBe('2nde-a');
  });

  it('supprime les séparateurs de bord, y compris après troncature', () => {
    expect(slugify('  --- Jardin ---  ')).toBe('jardin');
    expect(slugify('abc def', { maxLength: 4 })).toBe('abc');
  });

  it('renvoie une chaîne vide sur une entrée inutilisable', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
    expect(slugify('—— ¿?')).toBe('');
  });

  it('borne la longueur', () => {
    expect(slugify('a'.repeat(300))).toHaveLength(180);
    expect(slugify('a'.repeat(300), { maxLength: 10 })).toHaveLength(10);
  });
});
