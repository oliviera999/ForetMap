'use strict';

/**
 * Non-régression du corpus d'aide GL réécrit à la voix d'OLU (lot 6b, cf.
 * `docs/MASCOT_NARRATEUR_OLU.md` §2.4 pour la charte et §8.4 pour le statut d'OLU en GL).
 *
 * Pendant du test ForetMap `tests/help-corpus-olu.test.js`. Il ne juge pas le style : il
 * verrouille les règles **mécaniques** de la charte et les invariants que la prochaine
 * réécriture ne doit pas casser en silence. La règle centrale du §8.4 — « OLU parle du jeu,
 * jamais dans le jeu » — n'est pas automatisable : elle reste à la relecture humaine.
 *
 * Aucune base de données requise : le corpus est le fichier versionné des défauts.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadDefaultGlHelpConfig, glHelpConfigSchema, HELP_ENTRY_KEYS } = require('../lib/glHelp');

/** Emoji au sens large (pictogrammes), séquences à sélecteur de variation comprises. */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Tournures explicitement bannies par la charte (§2.6). */
const FORBIDDEN_PHRASES = ['n’hésite pas', "n'hésite pas", 'Désolé', 'Tu me suis', 'C’est clair ?'];

/**
 * Écrans de responsabilité — comptes, permissions, réglages, pilotage de partie.
 * OLU s'y tait (§2.2bis-4) : textes factuels, pas de première personne, pas d'humour.
 */
const ADMIN_KEYS = ['tab:users', 'tab:contents', 'tab:settings', 'tab:mascots', 'tab:mj'];

function entries() {
  return loadDefaultGlHelpConfig().entries;
}

/** Le rendu (`GLHelpPanel`) fait une puce par ligne : la charte s'applique ligne à ligne. */
function bodyLines(body) {
  return String(body)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

test('corpus GL : les défauts versionnés passent le schéma Zod', () => {
  const parsed = glHelpConfigSchema.safeParse(loadDefaultGlHelpConfig());
  assert.ok(parsed.success, 'les défauts d’aide GL ne passent pas le schéma');
});

test('corpus GL : toutes les clés d’onglet sont couvertes, et rien de plus', () => {
  assert.deepStrictEqual(Object.keys(entries()).sort(), [...HELP_ENTRY_KEYS].sort());
});

test('corpus GL : chaque onglet a son propre titre — plus de « Aide GL » générique', () => {
  const titles = Object.entries(entries()).map(([key, entry]) => {
    assert.ok(entry.title.trim().length > 0, `${key} : titre vide`);
    assert.notStrictEqual(entry.title, 'Aide GL', `${key} : titre générique`);
    return entry.title;
  });
  assert.strictEqual(new Set(titles).size, titles.length, 'deux onglets partagent un titre');
});

test('corpus GL : aucun emoji dans les textes d’OLU', () => {
  for (const [key, entry] of Object.entries(entries())) {
    assert.ok(!EMOJI_RE.test(entry.body), `${key} : emoji interdit`);
    assert.ok(!EMOJI_RE.test(entry.title), `${key} : emoji interdit dans le titre`);
  }
});

test('corpus GL : au plus un point d’exclamation sur l’ensemble du corpus', () => {
  const count = Object.values(entries()).reduce(
    (total, entry) => total + (entry.body.match(/!/g) || []).length,
    0,
  );
  assert.ok(count <= 1, `${count} points d’exclamation (maximum 1)`);
});

test('corpus GL : aucune tournure bannie par la charte', () => {
  for (const [key, entry] of Object.entries(entries())) {
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(!entry.body.includes(phrase), `${key} : tournure bannie « ${phrase} »`);
    }
  }
});

test('corpus GL : chaque ligne tient en 1 à 3 phrases', () => {
  for (const [key, entry] of Object.entries(entries())) {
    for (const line of bodyLines(entry.body)) {
      const sentences = (line.match(/[.!?](\s|$)/g) || []).length;
      assert.ok(sentences >= 1 && sentences <= 3, `${key} : ${sentences} phrases dans « ${line} »`);
    }
  }
});

test('corpus GL : sur les écrans de responsabilité, OLU se tait', () => {
  const FIRST_PERSON = /\b(je|j’ai|j’y|moi|mon carnet)\b/i;
  for (const key of ADMIN_KEYS) {
    const body = entries()[key]?.body || '';
    assert.ok(
      !FIRST_PERSON.test(body),
      `${key} : première personne sur un écran de responsabilité`,
    );
  }
});

// L'ancien corpus répétait à des joueurs une consigne adressée au MJ (« Désactive un module
// dans Réglages plateforme… »), coquille « épurger » comprise. L'information a rejoint
// l'entrée `tab:settings`, où elle s'adresse à qui peut agir.
test('corpus GL : la consigne de réglage ne s’adresse plus qu’à l’écran qui la porte', () => {
  const all = Object.entries(entries());
  for (const [key, entry] of all) {
    assert.ok(!entry.body.includes('épurger'), `${key} : coquille « épurger »`);
    if (key !== 'tab:settings') {
      assert.ok(
        !entry.body.includes('Réglages plateforme'),
        `${key} : consigne d’administration adressée à des joueurs`,
      );
    }
  }
  assert.match(entries()['tab:settings'].body, /module/i);
});
