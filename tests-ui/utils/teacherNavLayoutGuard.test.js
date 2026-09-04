import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fou de style : la navigation prof (`.teacher-nav`, deux rangées depuis D-4) ne doit
 * jamais s'étirer pour occuper la hauteur libre du conteneur.
 *
 * Le conteneur prof porte `main` ET `teacher-main` : la règle `.main > * { flex:1 }`
 * s'applique donc aussi à `.teacher-nav`. La barre unique d'avant D-4 était immunisée par le
 * `max-height` de `.top-tabs` ; le nouveau conteneur, lui, grandissait jusqu'à la moitié de la
 * hauteur utile (mesuré : 398 px pour 114 px de contenu en 1440×900), d'où un vide énorme
 * entre la rangée d'onglets et la carte / les tâches de l'onglet « Cartes, tâches et tuto ».
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

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

  // `.desktop-split-view` est en overflow:hidden → c'est lui le conteneur de défilement du
  // volet sticky : un `top` non nul y pousse la carte vers le bas sans rien dégager.
  test.each([
    ['prof', '--fm-maptasks-teacher-tabs-h:'],
    [
      'élève',
      '--fm-maptasks-map-max-h:calc(100dvh - 56px - var(--safe-top) - var(--bottom-nav-height)',
    ],
  ])('la carte du split %s ne se décale pas sous un en-tête inexistant', (_branche, ancre) => {
    const body = ruleBodyContaining(ancre);
    expect(body).not.toBeNull();
    expect(body).toMatch(/--fm-maptasks-sticky-top:\s*0px\s*;/);
  });
});
