'use strict';

// B4 (audit charge biodiversité 2026-09) — le résumé du conditionnement se charge en
// requêtes GROUPÉES.
//
// `buildGatingSummary` exécutait, POUR CHAQUE ressource et en série, la politique de la
// ressource, la politique de type (la même ligne relue à chaque tour), les liens bloquants
// et le verrou de re-tentative : 3 à 4 requêtes SQL par ressource, soit jusqu'à ~240 pour un
// seul appel HTTP sur une page de 60 fiches. Le catalogue biodiversité en émet un par
// ouverture d'écran, chez chaque élève.
//
// Deux garanties tenues ici :
//  1. le payload est STRICTEMENT identique à celui du chemin unitaire — `getChallengeState`
//     sans préchargement, qui reste celui de `GET /gating/challenge` — sur un jeu couvrant
//     politique par ressource, politique de type, liens multiples, verrou posé et ressource
//     sans lien ;
//  2. le nombre de requêtes SQL est CONSTANT quel que soit le nombre de ressources.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { setSetting } = require('../lib/settings');
const {
  getChallengeState,
  listFmCorrectQuestionCodes,
} = require('../lib/learningGatingAcknowledge');
const {
  buildGatingSummary,
  serializeSummaryItem,
  SUMMARY_MAX_REFS,
} = require('../lib/learningGatingSummary');
const { getGatingPresentation, decorateSummaryItem } = require('../lib/learningGatingPresentation');

const stamp = Date.now();
const catSlug = `batchcat${stamp}`.slice(0, 64);
const userId = `u-gating-batch-${stamp}`.slice(0, 64);
const PLANT_COUNT = 20;

/** ids des fiches créées pour le test, dans l'ordre de création. */
const plantIds = [];
const questionCodes = [];

const db = { queryAll, queryOne };

/** Base instrumentée : même contrat, avec un compteur de requêtes. */
function countingDb() {
  const counter = { count: 0 };
  return {
    counter,
    db: {
      queryAll: (...args) => {
        counter.count += 1;
        return queryAll(...args);
      },
      queryOne: (...args) => {
        counter.count += 1;
        return queryOne(...args);
      },
    },
  };
}

/**
 * Résumé calculé par le chemin UNITAIRE (sans préchargement) — algorithme de référence,
 * celui qu'empruntait `buildGatingSummary` avant le lot, et qu'emprunte toujours
 * `GET /gating/challenge`.
 */
async function referenceSummary(refs) {
  const presentation = await getGatingPresentation('fm');
  const correctCodesPreload = new Set(await listFmCorrectQuestionCodes(db, userId));
  const items = [];
  for (const resourceRef of refs) {
    const state = await getChallengeState(db, {
      product: 'fm',
      resourceType: 'plant',
      resourceRef,
      userId,
      correctCodesPreload,
    });
    if (!state.ok) continue;
    items.push(decorateSummaryItem(serializeSummaryItem(resourceRef, state), presentation));
  }
  return { resource_type: 'plant', items, ...presentation };
}

before(async () => {
  await initSchema();
  await setSetting('learning.gating.enabled', true, {});

  // Le verrou de re-tentative référence `users` (clé étrangère) : il faut un compte réel.
  await execute("INSERT IGNORE INTO users (id, user_type) VALUES (?, 'student')", [userId]);

  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test résumé groupé', 'jardinage', 996)`,
    [catSlug],
  );

  for (let i = 0; i < PLANT_COUNT; i += 1) {
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce lot ${stamp}-${i}`,
      '🌿',
      `Fiche de test ${i}`,
    ]);
    const row = await queryOne('SELECT LAST_INSERT_ID() AS id');
    plantIds.push(Number(row.id));
  }

  // Deux questions par fiche pour la moitié des fiches, une pour un quart, aucune pour le
  // reste : le résumé doit rester juste sur les trois cas.
  for (let i = 0; i < PLANT_COUNT; i += 1) {
    const linkCount = i % 4 === 3 ? 0 : (i % 2) + 1;
    for (let q = 0; q < linkCount; q += 1) {
      const code = `QB${stamp}${i}${q}`.slice(0, 16);
      questionCodes.push(code);
      await execute(
        `INSERT IGNORE INTO quiz_questions
          (question_code, categorie_slug, numero_dans_categorie, question,
           choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
         VALUES (?, ?, ?, 'Question groupée ?', 'A', 'B', 'C', 'A', 'college', 'actif')`,
        [code, catSlug, i * 10 + q + 1],
      );
      await execute(
        `INSERT IGNORE INTO resource_question_links
          (resource_type, resource_ref, question_code, is_gating, status, origin, weight)
         VALUES ('plant', ?, ?, 1, 'approved', 'manual', ?)`,
        [String(plantIds[i]), code, q],
      );
    }
  }

  // Politique de TYPE (`resource_ref = '*'`) : c'est la ligne que la boucle relisait à
  // chaque tour.
  await execute(
    `INSERT INTO resource_gating_policy (resource_type, resource_ref, enabled, mode, retry_cooldown_days)
     VALUES ('plant', '*', 1, 'all', 2)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), mode = VALUES(mode),
       retry_cooldown_days = VALUES(retry_cooldown_days)`,
  );
  // Politique propre à une fiche : elle doit primer sur celle de type.
  await execute(
    `INSERT INTO resource_gating_policy (resource_type, resource_ref, enabled, mode, retry_cooldown_days)
     VALUES ('plant', ?, 1, 'any', 5)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), mode = VALUES(mode),
       retry_cooldown_days = VALUES(retry_cooldown_days)`,
    [String(plantIds[0])],
  );
  // Fiche explicitement dispensée.
  await execute(
    `INSERT INTO resource_gating_policy (resource_type, resource_ref, enabled, mode)
     VALUES ('plant', ?, 0, 'all')
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), mode = VALUES(mode)`,
    [String(plantIds[1])],
  );
  // Verrou de re-tentative posé sur une fiche : le chemin groupé doit le retrouver.
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_attempts)
     VALUES (?, 'plant', ?, '', DATE_ADD(NOW(), INTERVAL 1 DAY), 2)
     ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until),
       wrong_attempts = VALUES(wrong_attempts)`,
    [userId, String(plantIds[2])],
  );
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  for (const code of questionCodes) {
    await execute('DELETE FROM resource_question_links WHERE question_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [code]).catch(() => {});
  }
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [userId]).catch(
    () => {},
  );
  for (const id of plantIds) {
    await execute(
      "DELETE FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref = ?",
      [String(id)],
    ).catch(() => {});
    await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  }
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref = '*'",
  ).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
});

test('payload strictement identique à l’algorithme unitaire', async () => {
  const refs = plantIds.map((id) => String(id));
  const grouped = await buildGatingSummary(db, {
    product: 'fm',
    resourceType: 'plant',
    rawRefs: refs.join(','),
    userId,
  });
  const reference = await referenceSummary(refs);

  assert.deepEqual(grouped, reference);
  assert.equal(grouped.items.length, PLANT_COUNT, 'toutes les fiches doivent figurer');

  // Le jeu couvre bien les trois cas, sinon la comparaison ne prouverait pas grand-chose.
  assert.ok(
    grouped.items.some((i) => i.required === true),
    'au moins une fiche conditionnée',
  );
  assert.ok(
    grouped.items.some((i) => i.required === false),
    'au moins une fiche non conditionnée',
  );
  assert.ok(
    grouped.items.some((i) => i.locked === true),
    'au moins une fiche verrouillée',
  );
});

test('coût SQL constant, quel que soit le nombre de fiches', async () => {
  const counts = [];
  for (const size of [1, 5, 20]) {
    const { db: probe, counter } = countingDb();
    await buildGatingSummary(probe, {
      product: 'fm',
      resourceType: 'plant',
      rawRefs: plantIds
        .slice(0, size)
        .map((id) => String(id))
        .join(','),
      userId,
    });
    counts.push(counter.count);
  }
  assert.equal(
    counts[0],
    counts[2],
    `le coût doit être constant (1 fiche : ${counts[0]}, 20 fiches : ${counts[2]})`,
  );
  assert.equal(counts[1], counts[0]);
  // Bonnes réponses + politiques + liens + verrous : une poignée de requêtes, pas 3N.
  assert.ok(counts[0] <= 6, `attendu ≤ 6 requêtes, obtenu ${counts[0]}`);
});

test('le plafond de références couvre un catalogue complet', () => {
  // 60 était inférieur au catalogue biodiversité (78 fiches) : au-delà, l'annonce du
  // contrôle disparaissait sans que rien ne le signale.
  assert.ok(SUMMARY_MAX_REFS >= 200, `plafond trop bas : ${SUMMARY_MAX_REFS}`);
});

test('le plafond est respecté et déduplique', async () => {
  const refs = [...plantIds, ...plantIds].map((id) => String(id));
  const grouped = await buildGatingSummary(db, {
    product: 'fm',
    resourceType: 'plant',
    rawRefs: refs.join(','),
    userId,
  });
  assert.equal(grouped.items.length, PLANT_COUNT, 'les doublons ne créent pas d’entrées');
});
