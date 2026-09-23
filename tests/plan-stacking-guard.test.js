'use strict';

/**
 * Empilement du Plan : une commande n'est jamais recouverte par un message passif.
 *
 * Régression observée sur la CI (runs 2972 à 2976, `main` comme toutes les branches
 * ouvertes) : le bouton d'un parcours répondait « visible, enabled and stable » à Playwright,
 * puis le clic n'atteignait jamais sa cible —
 * `<p class="plan-welcome__text"> … intercepts pointer events`. Le test expirait à 120 s, son
 * nettoyage ne survivait pas au démontage des fixtures, le parcours de test restait en base,
 * et la reprise butait sur un `strict mode violation … resolved to 2 elements`. Trois
 * symptômes, une seule cause.
 *
 * La cause : `.plan-filters` (la rangée qui porte la puce Parcours et sa liste déroulante) et
 * `.plan-welcome` portaient **le même `z-index`**. À égalité, c'est l'ordre du document qui
 * tranche ; le bandeau vivant dans `.plan-main`, donc plus bas, passait devant. Et comme
 * `.plan-routes` ouvre son propre contexte d'empilement, le `z-index` élevé de la liste
 * déroulante ne pouvait pas l'en sortir — un `z-index` ne vaut qu'entre frères.
 *
 * Ce n'était pas un défaut de test : sur un téléphone, le doigt du visiteur tapait dans le
 * vide pendant toute sa première visite, c'est-à-dire exactement quand le bandeau s'affiche.
 *
 * Pourquoi une assertion statique en plus de l'e2e : `e2e/plan-routes-mode.spec.js` couvre
 * déjà le geste, mais il coûte deux minutes et ne parle que d'un parcours. Ici le contrat est
 * lu en quelques millisecondes, et il porte sur la règle elle-même.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLAN_CSS = path.join(__dirname, '..', 'src', 'plan', 'styles', 'plan.css');

/**
 * `z-index` déclaré par un sélecteur de premier niveau, ou `null`.
 *
 * Lecture volontairement littérale (pas de moteur CSS) : on cherche le bloc `\n<sélecteur> {`
 * et le premier `z-index:` qu'il contient. Suffisant pour une feuille écrite à plat, et sans
 * dépendance.
 */
function zIndexOf(css, selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) return null;
  const end = css.indexOf('\n}', start);
  if (end === -1) return null;
  const match = /z-index:\s*(-?\d+)\s*;/.exec(css.slice(start, end));
  return match ? Number(match[1]) : null;
}

test('Plan : la rangée de commandes passe devant le bandeau d’accueil', () => {
  const css = fs.readFileSync(PLAN_CSS, 'utf8');

  const filters = zIndexOf(css, '.plan-filters');
  const welcome = zIndexOf(css, '.plan-welcome');

  assert.ok(Number.isInteger(filters), '.plan-filters doit déclarer un z-index explicite');
  assert.ok(Number.isInteger(welcome), '.plan-welcome doit déclarer un z-index explicite');

  assert.ok(
    filters > welcome,
    `.plan-filters (${filters}) doit être STRICTEMENT au-dessus de .plan-welcome (${welcome}). ` +
      'À égalité, l’ordre du document donne la main au bandeau, qui intercepte alors le clic ' +
      'sur la liste Parcours — bouton visible mais inerte.',
  );
});

/**
 * Le contexte d'empilement de `.plan-routes` est le piège qui rend le défaut précédent
 * invisible à la lecture : on y voit un `z-index: 5` sur la liste et on en conclut, à tort,
 * qu'elle est au-dessus de tout. Elle ne l'est qu'à l'intérieur de son parent.
 */
test('Plan : la liste Parcours reste bornée par le z-index de la rangée', () => {
  const css = fs.readFileSync(PLAN_CSS, 'utf8');

  const filters = zIndexOf(css, '.plan-filters');
  const routes = zIndexOf(css, '.plan-routes');
  const welcome = zIndexOf(css, '.plan-welcome');

  assert.ok(Number.isInteger(routes), '.plan-routes doit déclarer un z-index explicite');
  // `.plan-routes` est positionné avec un z-index : il ouvre un contexte d'empilement, et
  // tout ce qu'il contient y est enfermé. C'est donc `.plan-filters` qui doit gagner.
  assert.ok(
    filters > welcome && routes <= filters,
    'La liste Parcours est enfermée dans le contexte de .plan-routes ; c’est .plan-filters ' +
      'qui doit dominer .plan-welcome, pas un z-index posé sur la liste elle-même.',
  );
});
