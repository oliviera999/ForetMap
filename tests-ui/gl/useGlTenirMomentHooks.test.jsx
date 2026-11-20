import { describe, test, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGlTenirRetour } from '../../src/gl/hooks/useGlTenirRetour.js';
import { useGlTenirTiroir } from '../../src/gl/hooks/useGlTenirTiroir.js';

describe('useGlTenirRetour', () => {
  test('un verdict qui arrive se montre, « Continuer » l’acquitte', () => {
    const { result, rerender } = renderHook((props) => useGlTenirRetour(props), {
      initialProps: { verdict: null, caseFeedback: '', tourCle: '1:jeu' },
    });
    expect(result.current.retour).toBeNull();

    rerender({ verdict: { verdict: 'froid', at: 100 }, caseFeedback: '', tourCle: '1:jeu' });
    expect(result.current.retour).toMatchObject({ origine: 'chasse', verdict: 'froid' });

    act(() => result.current.acquitter());
    expect(result.current.retour).toBeNull();

    // La fouille suivante rend un nouveau verdict : nouveau retour.
    rerender({ verdict: { verdict: 'chaud', at: 200 }, caseFeedback: '', tourCle: '1:jeu' });
    expect(result.current.retour).toMatchObject({ verdict: 'chaud' });
  });

  test('un verdict déjà là à l’ouverture de l’écran n’est pas rejoué', () => {
    const { result } = renderHook(() =>
      useGlTenirRetour({
        verdict: { verdict: 'tiede', at: 1 },
        caseFeedback: 'Bien vu.',
        tourCle: '1:jeu',
      }),
    );
    expect(result.current.retour).toBeNull();
  });

  test('le retour d’une question de case se montre, puis s’efface au changement de phase', () => {
    const { result, rerender } = renderHook((props) => useGlTenirRetour(props), {
      initialProps: { verdict: null, caseFeedback: '', tourCle: '2:jeu' },
    });
    rerender({ verdict: null, caseFeedback: 'Pas encore… Relisez la fiche.', tourCle: '2:jeu' });
    expect(result.current.retour).toMatchObject({
      origine: 'case',
      texte: 'Pas encore… Relisez la fiche.',
    });
    // Le prof passe à la phase suivante : aucun retour ne reste devant « Le voile avance ».
    rerender({
      verdict: null,
      caseFeedback: 'Pas encore… Relisez la fiche.',
      tourCle: '2:souffle',
    });
    expect(result.current.retour).toBeNull();
  });

  test('deux questions de suite au même retour : chacun se montre', () => {
    const { result, rerender } = renderHook((props) => useGlTenirRetour(props), {
      initialProps: { verdict: null, caseFeedback: '', tourCle: '1:jeu' },
    });
    rerender({ verdict: null, caseFeedback: 'Bien vu.', tourCle: '1:jeu' });
    const premiere = result.current.retour?.cle;
    expect(premiere).toBeTruthy();
    act(() => result.current.acquitter());
    // Nouvelle question présentée (le retour se vide), puis même texte.
    rerender({ verdict: null, caseFeedback: '', tourCle: '1:jeu' });
    expect(result.current.retour).toBeNull();
    rerender({ verdict: null, caseFeedback: 'Bien vu.', tourCle: '1:jeu' });
    expect(result.current.retour).toMatchObject({ origine: 'case', texte: 'Bien vu.' });
  });
});

describe('useGlTenirTiroir', () => {
  test('fermé par défaut ; le bouton l’ouvre et le referme', () => {
    const { result } = renderHook(() => useGlTenirTiroir({ empreinte: 'a' }));
    expect(result.current).toMatchObject({ ouvert: false, nouveau: false, section: 'equipe' });
    act(() => result.current.basculer());
    expect(result.current.ouvert).toBe(true);
    act(() => result.current.basculer());
    expect(result.current.ouvert).toBe(false);
  });

  test('« Lire » l’ouvre sur le carnet ; une section inconnue retombe sur l’équipe', () => {
    const { result } = renderHook(() => useGlTenirTiroir({ empreinte: 'a' }));
    act(() => result.current.ouvrir('carnet'));
    expect(result.current).toMatchObject({ ouvert: true, section: 'carnet' });
    act(() => result.current.fermer());
    act(() => result.current.ouvrir('ailleurs'));
    expect(result.current.section).toBe('equipe');
  });

  test('pastille de nouveauté : allumée quand le contenu change tiroir fermé, éteinte à l’ouverture', () => {
    const { result, rerender } = renderHook((props) => useGlTenirTiroir(props), {
      initialProps: { empreinte: 'a' },
    });
    rerender({ empreinte: 'b' });
    expect(result.current.nouveau).toBe(true);
    act(() => result.current.ouvrir());
    expect(result.current.nouveau).toBe(false);
    // Ce qui change tiroir ouvert est vu au fur et à mesure.
    rerender({ empreinte: 'c' });
    act(() => result.current.fermer());
    expect(result.current.nouveau).toBe(false);
    rerender({ empreinte: 'd' });
    expect(result.current.nouveau).toBe(true);
  });
});
