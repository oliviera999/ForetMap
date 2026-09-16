import { describe, test, expect, beforeEach } from 'vitest';

import {
  clearBottomSheetInset,
  getBottomSheetInset,
  resetBottomSheetInsets,
  setBottomSheetInset,
  subscribeBottomSheetInset,
} from '../../src/shared/ui/bottomSheetInset.js';

/**
 * Hauteur couverte par les feuilles basses non bloquantes.
 *
 * Elle était **plafonnée à 60 %** de la fenêtre, et le Plan la replafonnait à 30 % : les
 * commandes de carte remontaient donc de 199 px sous une feuille de 365 px et restaient dans
 * la feuille (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B1). La valeur publiée doit dire
 * la vérité sur ce qui est couvert ; c'est au produit de décider quoi en faire.
 */
describe('bottomSheetInset', () => {
  beforeEach(() => {
    resetBottomSheetInsets();
  });

  test('publie la hauteur réelle, sans plafond, en px et en variable CSS', () => {
    const tall = Math.round(window.innerHeight * 0.95);
    setBottomSheetInset('sheet', tall);
    expect(getBottomSheetInset()).toBe(tall);
    expect(document.documentElement.style.getPropertyValue('--fm-bottom-sheet-inset')).toBe(
      `${tall}px`,
    );
  });

  test('plusieurs feuilles ouvertes : la plus haute gagne, et la variable disparaît à la fin', () => {
    setBottomSheetInset('resultats', 200);
    setBottomSheetInset('filtres', 420);
    expect(getBottomSheetInset()).toBe(420);

    clearBottomSheetInset('filtres');
    expect(getBottomSheetInset()).toBe(200);

    clearBottomSheetInset('resultats');
    expect(getBottomSheetInset()).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--fm-bottom-sheet-inset')).toBe('');
  });

  test('les abonnés sont prévenus à chaque changement, et plus après désabonnement', () => {
    const seen = [];
    const unsubscribe = subscribeBottomSheetInset((value) => seen.push(value));

    setBottomSheetInset('sheet', 300);
    setBottomSheetInset('sheet', 300); // identique : aucune notification de plus
    setBottomSheetInset('sheet', 120);
    clearBottomSheetInset('sheet');
    unsubscribe();
    setBottomSheetInset('autre', 500);

    expect(seen).toEqual([300, 120, 0]);
    expect(getBottomSheetInset()).toBe(500);
  });

  test('un abonné qui échoue ne prive pas les autres de la notification', () => {
    const seen = [];
    subscribeBottomSheetInset(() => {
      throw new Error('abonné fautif');
    });
    subscribeBottomSheetInset((value) => seen.push(value));
    setBottomSheetInset('sheet', 240);
    expect(seen).toEqual([240]);
  });
});
