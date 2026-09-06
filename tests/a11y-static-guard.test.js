'use strict';

// Cliquet d'accessibilité statique — stratégie détaillée dans
// `docs/AUDIT_VISITE_UI_UX_2026-09.md` §6.
//
// Les règles `jsx-a11y` qui portent de la dette sont en `warn` dans `eslint.config.cjs` :
// elles n'échouent donc pas `npm run lint`. C'est CE test qui les verrouille, et il ne
// tolère que la décroissance :
//
//   - toute violation NOUVELLE (fichier + règle absent de l'inventaire, ou compte
//     supérieur à celui enregistré) fait échouer le test ;
//   - toute entrée de l'inventaire qui n'a plus lieu d'être fait aussi échouer le test,
//     avec la commande pour la retirer. L'inventaire ne peut donc que rétrécir.
//
// C'est le mécanisme de `tests/typography-tokens-guard.test.js`, appliqué à
// l'accessibilité : on ne bloque pas la CI sur le legacy, mais on rend la régression
// impossible et on rend la dette visible et chiffrée.
//
// Régénérer après avoir corrigé des violations :
//   A11Y_BASELINE_UPDATE=1 node --test --test-force-exit tests/a11y-static-guard.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'fixtures', 'a11y-static-baseline.json');
const CIBLE = 'src/**/*.{js,jsx}';
const PREFIXE = 'jsx-a11y/';

/**
 * Violations `jsx-a11y` du code source, agrégées par fichier puis par règle.
 *
 * Volontairement **sans numéro de ligne** : un inventaire ligne à ligne devient faux au
 * premier ajout de commentaire et transforme le cliquet en générateur de faux positifs.
 * Le couple (fichier, règle) suffit à détecter une régression réelle.
 *
 * @returns {Promise<Record<string, Record<string, number>>>}
 */
async function releverViolations() {
  const eslint = new ESLint({ cwd: ROOT });
  const resultats = await eslint.lintFiles([CIBLE]);
  const inventaire = {};
  for (const resultat of resultats) {
    const relatif = path.relative(ROOT, resultat.filePath).split(path.sep).join('/');
    for (const message of resultat.messages) {
      if (!message.ruleId || !message.ruleId.startsWith(PREFIXE)) continue;
      inventaire[relatif] = inventaire[relatif] || {};
      inventaire[relatif][message.ruleId] = (inventaire[relatif][message.ruleId] || 0) + 1;
    }
  }
  return inventaire;
}

/** Écrit l'inventaire avec des clés triées : un diff Git lisible, pas un remaniement complet. */
function ecrireInventaire(inventaire) {
  const trie = {};
  for (const fichier of Object.keys(inventaire).sort()) {
    trie[fichier] = {};
    for (const regle of Object.keys(inventaire[fichier]).sort()) {
      trie[fichier][regle] = inventaire[fichier][regle];
    }
  }
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, `${JSON.stringify(trie, null, 2)}\n`, 'utf8');
}

/** Total de violations d'un inventaire. */
function total(inventaire) {
  return Object.values(inventaire).reduce(
    (somme, regles) => somme + Object.values(regles).reduce((s, n) => s + n, 0),
    0,
  );
}

test('accessibilité statique : aucune violation jsx-a11y nouvelle', async () => {
  const courant = await releverViolations();

  if (process.env.A11Y_BASELINE_UPDATE === '1') {
    ecrireInventaire(courant);
    console.log(`Inventaire a11y régénéré : ${total(courant)} violations.`);
    return;
  }

  assert.ok(
    fs.existsSync(BASELINE),
    `Inventaire absent (${path.relative(ROOT, BASELINE)}). Le créer avec :\n` +
      '  A11Y_BASELINE_UPDATE=1 node --test --test-force-exit tests/a11y-static-guard.test.js',
  );
  const reference = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

  const nouvelles = [];
  for (const [fichier, regles] of Object.entries(courant)) {
    for (const [regle, compte] of Object.entries(regles)) {
      const attendu = reference[fichier]?.[regle] || 0;
      if (compte > attendu) {
        nouvelles.push(`${fichier} → ${regle} : ${compte} (inventaire : ${attendu})`);
      }
    }
  }

  assert.deepStrictEqual(
    nouvelles,
    [],
    'Violations d’accessibilité NOUVELLES (cf. docs/AUDIT_VISITE_UI_UX_2026-09.md §6) :\n' +
      `${nouvelles.join('\n')}\n\n` +
      'Corriger le code plutôt que l’inventaire : ces règles sont celles qui rendent une ' +
      'commande inutilisable au clavier ou muette pour un lecteur d’écran.',
  );
});

test('accessibilité statique : l’inventaire ne contient plus de dette éteinte', async () => {
  if (process.env.A11Y_BASELINE_UPDATE === '1') return;
  assert.ok(fs.existsSync(BASELINE), 'Inventaire absent — voir le test précédent.');
  const reference = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const courant = await releverViolations();

  // Le cliquet : une dette corrigée doit SORTIR de l'inventaire, sinon il ne rétrécit
  // jamais et la prochaine régression au même endroit repasserait inaperçue.
  const perimees = [];
  for (const [fichier, regles] of Object.entries(reference)) {
    for (const [regle, compte] of Object.entries(regles)) {
      const reel = courant[fichier]?.[regle] || 0;
      if (reel < compte) {
        perimees.push(`${fichier} → ${regle} : ${reel} réelles pour ${compte} inventoriées`);
      }
    }
  }

  assert.deepStrictEqual(
    perimees,
    [],
    'Des violations inventoriées ont été corrigées — bravo. Resserrer le cliquet :\n' +
      `${perimees.join('\n')}\n\n` +
      '  A11Y_BASELINE_UPDATE=1 node --test --test-force-exit tests/a11y-static-guard.test.js',
  );
});
