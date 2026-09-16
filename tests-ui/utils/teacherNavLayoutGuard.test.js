import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fous de style de l'onglet « Cartes, tâches et tuto » sur grand écran : ni la
 * navigation prof ni la colonne tâches ne doivent manger la hauteur réservée à la carte.
 *
 * 1. Le conteneur prof porte `main` ET `teacher-main` : la règle `.main > * { flex:1 }`
 *    s'applique donc aussi à `.teacher-nav`. La barre unique d'avant D-4 était immunisée par
 *    le `max-height` de `.top-tabs` ; le nouveau conteneur, lui, grandissait jusqu'à la moitié
 *    de la hauteur utile (mesuré : 398 px pour 114 px de contenu en 1440×900), d'où un vide
 *    énorme entre la rangée d'onglets et la carte / les tâches.
 * 2. Le volet carte du split doit s'étirer sur toute la ligne de grille : sorti du flux
 *    d'étirement, il retombe sur la hauteur de son contenu, qui est nulle.
 */
// Commentaires CSS retirés : les garde-fous vérifient aussi l'ABSENCE de certaines
// déclarations, et une note d'historique qui les cite ferait échouer l'assertion alors
// qu'aucune règle ne s'applique réellement.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Déclarations de la première règle (sans accolade imbriquée) contenant `needle`, que `needle`
 * soit un sélecteur ou une déclaration : on borne à la dernière accolade — ouvrante OU
 * fermante — qui précède, sans quoi le corps de la règle voisine serait inclus.
 */
function ruleBodyContaining(needle) {
  const hit = css.indexOf(needle);
  if (hit === -1) return null;
  const open = Math.max(css.lastIndexOf('{', hit), css.lastIndexOf('}', hit));
  const close = css.indexOf('}', hit);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

describe('index.css — hauteur de la navigation prof et calage du split', () => {
  test('`.teacher-nav` enfant direct de `.teacher-main` ne grandit pas', () => {
    const body = ruleBodyContaining('.teacher-main > .teacher-nav');
    expect(body).not.toBeNull();
    // `flex-shrink:0` seul laisserait le `flex-grow:1` hérité de `.main > *`.
    expect(body).toMatch(/flex:\s*0\s+0\s+auto\s*;/);
  });

  // Le volet carte du split doit occuper toute la hauteur de sa ligne de grille, comme la
  // colonne tâches. `align-self:start` (ancien volet sticky) annule l'étirement et renvoie le
  // volet à la hauteur de son contenu — or la scène n'a pas de hauteur intrinsèque et retombe
  // sur son plancher de 160 px, quelle que soit la taille d'écran (mesuré : 254 px de volet
  // carte contre 750 px de colonne tâches en 1600×900). Même effet avec un `max-height` en
  // `dvh` sous-estimé : la ligne `minmax(0, 1fr)` borne déjà la hauteur.
  test('le volet carte du split occupe toute la hauteur de la ligne', () => {
    const body = ruleBodyContaining('.main--maptasks-split .desktop-split-pane--map');
    expect(body).not.toBeNull();
    expect(body).toMatch(/align-self:\s*stretch\s*;/);
    expect(body).not.toMatch(/align-self:\s*(start|flex-start|baseline)/);
    expect(body).not.toMatch(/position:\s*sticky/);
    expect(body).not.toMatch(/max-height:\s*(?!none)/);
  });

  // La scène carte est en `height:100%` : tout ancêtre à hauteur `auto` la fait retomber sur
  // son plancher. La chaîne volet → racine → cadre → emplacement doit rester en flex étirable.
  test('la chaîne de hauteur sous le volet carte reste étirable', () => {
    expect(ruleBodyContaining('.map-view-root--embedded .map-view-canvas-outer')).toMatch(
      /flex:\s*1\s*;/,
    );
    expect(ruleBodyContaining('.map-view-root--embedded .map-view-canvas-slot')).toMatch(
      /flex:\s*1\s*;/,
    );
  });

  test('chrome compact iPhone : flou WebKit et cibles lock-btn ≥ 44px', () => {
    expect(css).toMatch(/\.bottom-nav[\s\S]*?-webkit-backdrop-filter:\s*blur\(8px\)/);
    expect(css).toMatch(/header \.lock-btn\s*\{[\s\S]*?min-height:\s*44px/);
  });
});
