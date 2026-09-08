'use strict';

// Préréglage par type « tutorial » livré par la migration 216 — vérifié SANS base : le
// fichier de migration est la source, la cascade en calcule l'effet.
//
// Ce que ce test protège : jusqu'à la migration 216, aucun préréglage par type n'était
// livré. Tutoriels, fiches espèces et termes de glossaire suivaient tous le site — une
// seule bonne réponse, un seul essai — et rien dans le code ne disait le contraire. Le
// jour où quelqu'un croit se souvenir que « les tutoriels sont plus exigeants », il faut
// que ce soit vrai ou que ce test tombe.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gatingCore = require('../lib/shared/gatingSettingsCore');
const { resolveEffectiveGatingPolicy } = require('../lib/shared/gatingPolicyLayersCore');
const { DEFAULT_RETRY_COOLDOWN_HOURS } = require('../lib/shared/cooldownDurationCore');

const MIGRATION = path.join(
  __dirname,
  '..',
  'migrations',
  '216_gating_tutorial_preset_and_lock_1h.sql',
);

/** Ligne semée par la migration, telle que la base la rendra à `loadTypePolicy`. */
const TUTORIAL_PRESET = Object.freeze({
  resource_type: 'tutorial',
  resource_ref: '*',
  mode: 'threshold',
  required_correct: 2,
  enabled: 1,
  allowed_wrong_attempts: null,
  max_questions_per_session: null,
  retry_cooldown_hours: null,
  cooldown_scope: 'question',
  lock_mode: null,
  granularity: null,
});

const site = gatingCore.buildGatingSettings({}, 'fm');
// Le conditionnement est éteint par défaut, et `resolveEffectiveGatingPolicy` force alors
// `mode = 'off'` : pour observer l'exigence d'un type, il faut le site allumé — l'état
// d'une classe où le professeur a activé le contrôle.
const siteOn = { ...site, enabled: true };

test('la migration 216 sème bien le préréglage décrit ici', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  // INSERT IGNORE et non ON DUPLICATE KEY : un professeur qui ajuste le préréglage ne doit
  // jamais le voir réécrit au déploiement suivant.
  assert.match(sql, /INSERT IGNORE INTO resource_gating_policy/);
  assert.match(sql, /'tutorial',\s*'\*',\s*'threshold',\s*2,\s*1,\s*NULL,/);
  assert.match(sql, /'question',\s*NULL,\s*NULL/);
  // Le délai du site est aligné sur le défaut livré, pour les deux produits.
  assert.match(sql, /learning\.gating\.retry_cooldown_hours/);
  assert.match(sql, /gating\.retry_cooldown_hours/);
});

test('un tutoriel exige deux bonnes réponses, le reste une seule', () => {
  const tutorial = resolveEffectiveGatingPolicy({
    typePolicy: TUTORIAL_PRESET,
    site: siteOn,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(tutorial.mode, 'threshold');
  assert.equal(tutorial.requiredCorrect, 2, 'deux bonnes réponses attendues sur un tutoriel');
  assert.equal(tutorial.effectiveSources.mode, 'type:tutorial');

  // Aucun préréglage n'est livré pour les autres types : ils suivent le site.
  for (const resourceType of ['plant', 'glossary']) {
    const other = resolveEffectiveGatingPolicy({ site: siteOn, product: 'fm', resourceType });
    assert.equal(other.mode, 'any', `${resourceType} : une seule bonne réponse suffit`);
    assert.equal(other.requiredCorrect, 1);
    assert.equal(other.allowedWrongAttempts, 0, `${resourceType} : un seul essai`);
    assert.equal(other.effectiveSources.mode, 'site');
  }
});

test('le tutoriel reste jouable sans devenir plus permissif que le reste', () => {
  const tutorial = resolveEffectiveGatingPolicy({
    typePolicy: TUTORIAL_PRESET,
    site: siteOn,
    product: 'fm',
    resourceType: 'tutorial',
  });
  // Le contrepoids de l'exigence est la PORTÉE, pas la tolérance : l'erreur ne ferme que la
  // question ratée. Exiger deux réponses ET verrouiller la fiche entière à la première
  // erreur rendrait le tutoriel injouable.
  assert.equal(tutorial.cooldownScope, 'question');
  assert.equal(tutorial.effectiveSources.cooldownScope, 'type:tutorial');

  // La tolérance, elle, reste celle du site. Une tolérance propre au type (1) aurait produit
  // l'inverse du but : un tutoriel ne portant qu'UNE question bloquante — le seuil se
  // ramenant alors à 1 — aurait offert deux essais là où une fiche espèce n'en offre qu'un.
  const plant = resolveEffectiveGatingPolicy({
    site: siteOn,
    product: 'fm',
    resourceType: 'plant',
  });
  assert.equal(tutorial.allowedWrongAttempts, plant.allowedWrongAttempts, 'jamais plus permissif');
  assert.equal(tutorial.effectiveSources.allowedWrongAttempts, 'site');

  // Et la tolérance du site continue de se propager aux tutoriels quand elle change.
  const relaxedSite = resolveEffectiveGatingPolicy({
    typePolicy: TUTORIAL_PRESET,
    site: { ...siteOn, allowedWrongAttempts: 2 },
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(relaxedSite.allowedWrongAttempts, 2);
});

test('ce que le préréglage ne fige pas continue de suivre le site', () => {
  const tutorial = resolveEffectiveGatingPolicy({
    typePolicy: TUTORIAL_PRESET,
    site: siteOn,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(tutorial.retryCooldownHours, DEFAULT_RETRY_COOLDOWN_HOURS, 'délai hérité du site');
  assert.equal(tutorial.effectiveSources.retryCooldownHours, 'site');
  assert.equal(tutorial.lockMode, site.lockMode, 'sévérité héritée du site');
  assert.equal(tutorial.effectiveSources.lockMode, 'site');
  assert.equal(tutorial.maxQuestionsPerSession, site.maxQuestionsPerSession);
  assert.equal(tutorial.effectiveSources.maxQuestionsPerSession, 'site');
});

test('le préréglage ne conditionne rien tant que l’interrupteur du site est éteint', () => {
  // Le préréglage est semé, mais l'interrupteur maître reste `false` : livrer ce lot ne
  // change RIEN pour les élèves tant qu'un professeur n'a pas activé le contrôle.
  assert.equal(site.enabled, false, 'le conditionnement reste éteint par défaut');
  const tutorial = resolveEffectiveGatingPolicy({
    typePolicy: TUTORIAL_PRESET,
    site,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(tutorial.enabled, false);
  assert.equal(tutorial.mode, 'off', 'interrupteur éteint : aucune question exigée');
});

test('une exception par fiche l’emporte toujours sur le préréglage du type', () => {
  // Un professeur doit pouvoir dispenser UN tutoriel sans toucher au préréglage.
  const exempted = resolveEffectiveGatingPolicy({
    perResource: { enabled: 0 },
    typePolicy: TUTORIAL_PRESET,
    site: siteOn,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(exempted.enabled, false);
  assert.equal(exempted.mode, 'off');

  const relaxed = resolveEffectiveGatingPolicy({
    perResource: { mode: 'any' },
    typePolicy: TUTORIAL_PRESET,
    site: siteOn,
    product: 'fm',
    resourceType: 'tutorial',
  });
  assert.equal(relaxed.mode, 'any');
  assert.equal(relaxed.effectiveSources.mode, 'resource');
});
