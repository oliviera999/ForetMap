'use strict';

/**
 * Contrat de la zone flottante bas-droite — `src/shared/styles/floating-dock.css`.
 *
 * Ces cas ferment la classe de défaut relevée à l'audit : des commandes qui choisissaient
 * chacune leur `bottom` et leur `z-index` sans connaître les autres, jusqu'à ce que deux
 * d'entre elles se posent **dans** une barre de navigation — l'une par-dessus, l'autre
 * par-dessous, donc invisible.
 *
 * Aucune base de données requise : ce sont des lectures de feuilles de style.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

/** Corps d'une règle CSS, par sélecteur exact en début de ligne. */
function ruleBody(css, selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) return null;
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

test('l’empilement flottant se pose par calcul, jamais sur un nombre en dur', () => {
  const body = ruleBody(read('src/shared/styles/floating-dock.css'), '.fm-floating-dock');
  assert.ok(body, '.fm-floating-dock introuvable');
  assert.match(body, /bottom:\s*calc\(var\(--fm-safe-bottom-nav\)/);
  assert.match(body, /z-index:\s*var\(--fm-z-dock\)/);
  // Le conteneur couvre une colonne entière : s'il captait le pointeur, il volerait les
  // clics du contenu situé derrière.
  assert.match(body, /pointer-events:\s*none/);
});

test('chaque produit déclare ce que sa barre basse occupe', () => {
  // Sans cette déclaration, le repli `:root` vaut 0 et les commandes retombent dans la barre.
  assert.match(read('src/gl/styles/gl-theme.css'), /--fm-safe-bottom-nav:\s*calc\(/);
  assert.match(read('src/index.css'), /--fm-safe-bottom-nav:\s*calc\(/);
});

test('aucune commande flottante ne se repositionne dans son coin', () => {
  /*
   * Le point du test : c'est la reprise d'un `bottom` en dur qui ramènerait le chevauchement.
   * On vérifie que les trois commandes concernées n'en portent plus.
   */
  const gl = read('src/gl/styles/gl-theme.css');
  const fm = read('src/index.css');

  const bell = ruleBody(gl, '.gl-notifications');
  assert.ok(bell, '.gl-notifications introuvable');
  assert.doesNotMatch(bell, /position:\s*fixed/, 'la cloche se repositionne elle-même');
  // Elle garde `relative` : son panneau s'ancre dessus.
  assert.match(bell, /position:\s*relative/);

  assert.ok(
    !gl.includes('.gl-zone-music-global-dock {'),
    'le dock musique ad hoc est revenu — son bouton appartient à l’empilement partagé',
  );

  const toast = ruleBody(fm, '.app-inline-toast');
  assert.ok(toast, '.app-inline-toast introuvable');
  assert.doesNotMatch(
    toast,
    /bottom:\s*\d/,
    'le bandeau ForetMap reprend un `bottom` en dur : il retomberait sous la barre basse',
  );
  assert.match(toast, /z-index:\s*var\(--fm-z-toast\)/);
});

test('l’empilement nommé garde le bandeau au-dessus du dock, et le dock au-dessus de la barre', () => {
  // Les paliers étaient déclarés dans `floating-dock.css` : ils vivent désormais dans
  // l'échelle commune aux deux produits (`z-layers.css`), qui a remplacé les deux
  // échelles parallèles. Le contrat vérifié ici est inchangé — seule sa source l'est.
  const root = read('src/shared/styles/z-layers.css');
  const num = (name) => {
    const m = new RegExp(`--fm-z-${name}:\\s*(\\d+)`).exec(root);
    assert.ok(m, `--fm-z-${name} non déclaré`);
    return Number(m[1]);
  };
  assert.ok(num('dock') > num('nav'), 'le dock passerait sous la barre de navigation');
  assert.ok(num('toast') > num('dock'), 'le bandeau passerait sous le dock');
});

test('les commandes en icône seule atteignent 44 px de zone cliquable', () => {
  // Règle projet (CLAUDE.md) et lot 4 de l'audit général. Le visuel ne bouge pas : c'est un
  // pseudo-élément centré qui porte la cible.
  for (const rel of ['src/gl/styles/gl-theme.css', 'src/index.css']) {
    const css = read(rel);
    assert.match(css, /width:\s*max\(100%,\s*44px\)/, `${rel} : gabarit de cible absent`);
    assert.match(css, /height:\s*max\(100%,\s*44px\)/, `${rel} : gabarit de cible absent`);
  }
});
