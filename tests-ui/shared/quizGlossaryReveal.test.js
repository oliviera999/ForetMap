import { describe, it, expect, vi } from 'vitest';
import {
  glossaryPropsWhileAnswering,
  showLinkedGlossaryTerms,
} from '../../src/shared/qcm/quizGlossaryReveal.js';

describe('glossaryPropsWhileAnswering', () => {
  it('neutralise l’auto-liaison tant que l’élève n’a pas répondu', () => {
    // C'est le fond du problème : sur « Comment appelle-t-on le processus par lequel… ? »,
    // ouvrir le terme lié donne la réponse.
    const onOpenGlossaryTerm = vi.fn();
    const props = glossaryPropsWhileAnswering(
      { glossaryItems: [{ glossary_code: 'FM1', terme: 'Photosynthèse' }], onOpenGlossaryTerm },
      false,
    );
    expect(props.glossaryItems).toEqual([]);
    expect(props.onOpenGlossaryTerm).toBeNull();
  });

  it('rend l’auto-liaison une fois la réponse donnée', () => {
    // Après la réponse, aller lire la définition est exactement ce qu'on veut encourager.
    const items = [{ glossary_code: 'FM1', terme: 'Photosynthèse' }];
    const onOpenGlossaryTerm = () => {};
    const props = glossaryPropsWhileAnswering({ glossaryItems: items, onOpenGlossaryTerm }, true);
    expect(props.glossaryItems).toBe(items);
    expect(props.onOpenGlossaryTerm).toBe(onOpenGlossaryTerm);
  });

  it('traite de la même façon le glossaire lore de G&L', () => {
    // La règle ne connaît pas les noms de champs : elle vide les tableaux et retire les
    // gestionnaires, quel que soit le jeu de propriétés.
    const props = glossaryPropsWhileAnswering(
      { loreGlossaryItems: [{ code: 'L1' }], onOpenLoreTerm: () => {} },
      false,
    );
    expect(props.loreGlossaryItems).toEqual([]);
    expect(props.onOpenLoreTerm).toBeNull();
  });

  it('laisse passer les valeurs qui ne sont ni liste ni gestionnaire', () => {
    const props = glossaryPropsWhileAnswering({ glossaryItems: [], variante: 'lore' }, false);
    expect(props.variante).toBe('lore');
  });

  it('rend une référence de tableau stable, pour ne pas re-rendre pour rien', () => {
    const a = glossaryPropsWhileAnswering({ glossaryItems: [{ a: 1 }] }, false);
    const b = glossaryPropsWhileAnswering({ glossaryItems: [{ b: 2 }] }, false);
    expect(a.glossaryItems).toBe(b.glossaryItems);
  });

  it('supporte l’absence de propriétés', () => {
    expect(glossaryPropsWhileAnswering(null, false)).toEqual({});
    expect(glossaryPropsWhileAnswering(undefined, true)).toEqual({});
  });
});

describe('showLinkedGlossaryTerms', () => {
  it('cache la liste des termes utiles avant la réponse', () => {
    // Une liste de termes sous l'énoncé désigne le sujet aussi sûrement qu'un lien.
    expect(showLinkedGlossaryTerms(false)).toBe(false);
    expect(showLinkedGlossaryTerms(true)).toBe(true);
  });
});
