'use strict';

// Cliquet d'accessibilité en navigateur réel — stratégie détaillée dans
// `docs/AUDIT_VISITE_UI_UX_2026-09.md` §6.
//
// Complément indispensable au cliquet statique (`tests/a11y-static-guard.test.js`) : ESLint
// lit le source, il ne voit ni contraste, ni cible tactile, ni focus réellement visible.
// Ici c'est Chromium qui rend la page, donc `axe-core` mesure pour de vrai.
//
// Même contrat que le cliquet statique — l'inventaire ne peut que rétrécir :
//   - violation NOUVELLE (règle absente de l'écran, ou compte supérieur) → échec ;
//   - dette corrigée mais toujours inventoriée → échec, avec la commande pour resserrer ;
//   - écran inconnu de l'inventaire → échec (pas de bootstrap silencieux : un écran qui
//     n'a jamais été mesuré passerait sinon indéfiniment pour conforme).
//
// Régénérer après correction :
//   A11Y_BASELINE_UPDATE=1 npx playwright test e2e/a11y.spec.js
//
// ⚠️ Ce que cet outil NE trouve PAS : `axe-core` couvre de façon fiable environ un tiers
// des critères WCAG — ceux qui se décident sur le DOM. Un inventaire vide n'est pas une
// preuve d'accessibilité : l'ordre de tabulation, la pertinence d'un `alt`, le retour du
// focus et le sens porté par la seule couleur demandent une relecture humaine.

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const INVENTAIRE = path.join(__dirname, 'a11y-baseline.json');

/** Normes visées : WCAG 2.1 niveaux A et AA, plus les bonnes pratiques d'`axe`. */
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Règles écartées, avec la raison. Toute exclusion est une dette assumée : la justifier
 * ici plutôt que de la laisser disparaître dans un inventaire.
 */
const REGLES_ECARTEES = {
  // Les polices Google et les avatars Dicebear sont injoignables depuis l'environnement de
  // test : les repli de police faussent la mesure de contraste sur du texte qui, en
  // production, est rendu avec DM Sans. Mesure à refaire dans un environnement en ligne.
  'color-contrast': 'polices externes injoignables en environnement de test',
};

function lireInventaire() {
  if (!fs.existsSync(INVENTAIRE)) return {};
  return JSON.parse(fs.readFileSync(INVENTAIRE, 'utf8'));
}

function ecrireInventaire(inventaire) {
  const trie = {};
  for (const ecran of Object.keys(inventaire).sort()) {
    trie[ecran] = {};
    for (const regle of Object.keys(inventaire[ecran]).sort()) {
      trie[ecran][regle] = inventaire[ecran][regle];
    }
  }
  fs.writeFileSync(INVENTAIRE, `${JSON.stringify(trie, null, 2)}\n`, 'utf8');
}

/**
 * Analyse la page et confronte le résultat à l'inventaire de l'écran.
 *
 * @param {import('@playwright/test').Page} page page Playwright, sur l'écran à mesurer.
 * @param {string} ecran clé stable dans l'inventaire (ex. `visite-eleve`).
 * @param {{ include?: string }} [options] `include` restreint l'analyse à un sélecteur.
 */
async function verifierA11y(page, ecran, options = {}) {
  let constructeur = new AxeBuilder({ page }).withTags(NORMES);
  for (const regle of Object.keys(REGLES_ECARTEES)) constructeur = constructeur.disableRules(regle);
  if (options.include) constructeur = constructeur.include(options.include);

  const resultat = await constructeur.analyze();

  /** Compte de nœuds fautifs par règle : plus stable qu'une liste de sélecteurs, qui bouge au moindre remaniement. */
  const courant = {};
  for (const violation of resultat.violations) {
    courant[violation.id] = violation.nodes.length;
  }

  const inventaire = lireInventaire();

  if (process.env.A11Y_BASELINE_UPDATE === '1') {
    inventaire[ecran] = courant;
    ecrireInventaire(inventaire);
    const total = Object.values(courant).reduce((s, n) => s + n, 0);
    console.log(
      `[a11y] « ${ecran} » inventorié : ${total} nœuds sur ${resultat.violations.length} règles.`,
    );
    return resultat;
  }

  expect(
    inventaire[ecran],
    `Écran « ${ecran} » absent de l'inventaire d'accessibilité. Le mesurer avec :\n` +
      '  A11Y_BASELINE_UPDATE=1 npx playwright test e2e/a11y.spec.js',
  ).toBeDefined();
  const reference = inventaire[ecran];

  /** Détail lisible pour la personne qui lira l'échec : la règle seule ne dit pas quoi corriger. */
  const detail = (id) => {
    const v = resultat.violations.find((x) => x.id === id);
    if (!v) return id;
    const cibles = v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(' '))
      .join(' | ');
    return `${id} (${v.impact}) — ${v.help}\n      ${cibles}`;
  };

  const nouvelles = [];
  for (const [regle, compte] of Object.entries(courant)) {
    const attendu = reference[regle] || 0;
    if (compte > attendu)
      nouvelles.push(`    ${detail(regle)}\n      ${compte} nœuds (inventaire : ${attendu})`);
  }
  expect(
    nouvelles,
    `Violations d'accessibilité NOUVELLES sur « ${ecran} » :\n${nouvelles.join('\n')}`,
  ).toEqual([]);

  const perimees = [];
  for (const [regle, compte] of Object.entries(reference)) {
    const reel = courant[regle] || 0;
    if (reel < compte) perimees.push(`    ${regle} : ${reel} réelles pour ${compte} inventoriées`);
  }
  expect(
    perimees,
    `Dette corrigée sur « ${ecran} » — bravo. Resserrer le cliquet :\n${perimees.join('\n')}\n` +
      '  A11Y_BASELINE_UPDATE=1 npx playwright test e2e/a11y.spec.js',
  ).toEqual([]);

  return resultat;
}

module.exports = { verifierA11y, NORMES, REGLES_ECARTEES };
