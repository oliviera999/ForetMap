'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parsePromisedEffects,
  summarizeMachineEffects,
  auditMarkerPromise,
  auditMarkerPromises,
} = require('../lib/glMarkerPromiseAudit');

const effectsJson = (effects) => JSON.stringify({ version: 2, effects });

test('parsePromisedEffects lit les gains simples en chiffres et en lettres', () => {
  assert.strictEqual(parsePromisedEffects('+1 cœur').deltaPv, 1);
  assert.strictEqual(parsePromisedEffects('+2 cœurs').deltaPv, 2);
  assert.strictEqual(parsePromisedEffects('Un répit : soigne 1 cœur.').deltaPv, 1);
  assert.strictEqual(parsePromisedEffects('soigne un cœur').deltaPv, 1);
  assert.strictEqual(parsePromisedEffects('Avance de 2 cases.').deltaMove, 2);
  assert.strictEqual(parsePromisedEffects('Recule de 3 cases').deltaMove, -3);
  assert.strictEqual(parsePromisedEffects('Passe ton tour').passTurn, true);
});

test('parsePromisedEffects distingue les pertes des gains', () => {
  assert.strictEqual(parsePromisedEffects('tu perds 1 cœur').deltaPv, -1);
  assert.strictEqual(parsePromisedEffects('coûte 2 gemmes').deltaGems, -2);
  assert.strictEqual(parsePromisedEffects('gagne 3 gemmes').deltaGems, 3);
});

test('parsePromisedEffects repère les promesses conditionnelles', () => {
  const quiz = parsePromisedEffects('Bonne réponse : +1 gemme. Mauvaise réponse : rien.');
  assert.deepStrictEqual(quiz.conditions, ['bonne_reponse', 'mauvaise_reponse']);
  assert.strictEqual(quiz.deltaGems, 1);

  const defi = parsePromisedEffects('Si réussi : +1 gemme. Sinon : -1 cœur.');
  assert.ok(defi.conditions.includes('defi_reussi'));

  const arrivee = parsePromisedEffects(
    "Arrivée. L'équipe qui atteint cette case en premier gagne 3 gemmes bonus.",
  );
  assert.ok(arrivee.conditions.includes('premier_arrive'));
  assert.strictEqual(arrivee.deltaGems, 3);
});

test('parsePromisedEffects signale un texte vide sans rien inventer', () => {
  const empty = parsePromisedEffects(null);
  assert.strictEqual(empty.empty, true);
  assert.strictEqual(empty.deltaPv, null);
  assert.strictEqual(parsePromisedEffects("Pas d'effet — observation libre").deltaPv, null);
});

test('summarizeMachineEffects retient la plus forte amplitude par branche', () => {
  const marker = {
    event_type: 'trame',
    event_config_json: effectsJson({
      gnome: { label: 'Gnome : +1 cœur.', deltaPv: 1 },
      unicorn: { label: 'Licorne : +2 gemmes.', deltaGems: 2 },
    }),
  };
  const machine = summarizeMachineEffects(marker);
  assert.strictEqual(machine.deltaPv, 1);
  assert.strictEqual(machine.deltaGems, 2);
  assert.strictEqual(machine.allActiveBranchesLabelled, true);
});

test('une case dont la promesse est tenue est classée ok', () => {
  const audit = auditMarkerPromise({
    id: 1,
    chapter_id: 3,
    event_type: 'behavior',
    effet_mecanique: '+1 cœur',
    event_config_json: effectsJson({ neutral: { deltaPv: 1 } }),
  });
  assert.strictEqual(audit.severity, 'ok');
  assert.deepStrictEqual(audit.issues, []);
});

test('une promesse conditionnelle est une erreur : le moteur n’a pas de branche « bonne réponse »', () => {
  const audit = auditMarkerPromise({
    id: 8,
    chapter_id: 3,
    event_type: 'quiz',
    effet_mecanique: 'Bonne réponse : +1 gemme. Mauvaise réponse : rien.',
    event_config_json: JSON.stringify({
      version: 2,
      question: { set: 'biome', mode: 'random', pool: {} },
    }),
  });
  assert.strictEqual(audit.severity, 'error');
  assert.strictEqual(audit.issues[0].code, 'CONDITIONNEL_NON_CABLE');
  assert.ok(audit.issues[0].resources.includes('gemmes'));
});

test('une promesse simple sans effet moteur est une erreur', () => {
  const audit = auditMarkerPromise({
    id: 13,
    chapter_id: 3,
    event_type: 'behavior',
    effet_mecanique: 'Passe ton tour',
    event_config_json: null,
  });
  assert.strictEqual(audit.severity, 'error');
  assert.strictEqual(audit.issues[0].code, 'PROMESSE_NON_TENUE');
});

test('un montant divergent est un avertissement, pas une erreur', () => {
  const audit = auditMarkerPromise({
    id: 20,
    chapter_id: 3,
    event_type: 'behavior',
    effet_mecanique: 'Avance de 2 cases',
    event_config_json: effectsJson({ neutral: { deltaMove: 3 } }),
  });
  assert.strictEqual(audit.severity, 'warn');
  assert.strictEqual(audit.issues[0].code, 'PROMESSE_DIVERGENTE');
  assert.strictEqual(audit.issues[0].promised, 2);
  assert.strictEqual(audit.issues[0].machine, 3);
});

test('un effet annoncé par le label de branche n’est pas signalé comme muet', () => {
  const audit = auditMarkerPromise({
    id: 19,
    chapter_id: 3,
    event_type: 'trame',
    effet_mecanique: null,
    event_config_json: effectsJson({
      gnome: { label: 'Gnome : tes mains le renouent → +1 cœur.', deltaPv: 1 },
      unicorn: { label: 'Licorne : tu consignes → +1 gemme.', deltaGems: 1 },
    }),
  });
  assert.strictEqual(audit.severity, 'ok');
});

test('un effet sans texte ni label est signalé comme non annoncé', () => {
  const audit = auditMarkerPromise({
    id: 99,
    chapter_id: 3,
    event_type: 'event',
    effet_mecanique: null,
    event_config_json: effectsJson({ neutral: { deltaGems: 2 } }),
  });
  assert.strictEqual(audit.severity, 'info');
  assert.strictEqual(audit.issues[0].code, 'EFFET_NON_ANNONCE');
});

test('auditMarkerPromises agrège par sévérité, par code et par chapitre', () => {
  const report = auditMarkerPromises([
    {
      id: 1,
      chapter_id: 3,
      effet_mecanique: '+1 cœur',
      event_config_json: effectsJson({ neutral: { deltaPv: 1 } }),
    },
    {
      id: 2,
      chapter_id: 3,
      effet_mecanique: 'Bonne réponse : +1 gemme.',
      event_config_json: null,
    },
    { id: 3, chapter_id: 4, effet_mecanique: 'Passe ton tour', event_config_json: null },
  ]);
  assert.strictEqual(report.total, 3);
  assert.strictEqual(report.counts.ok, 1);
  assert.strictEqual(report.counts.error, 2);
  assert.strictEqual(report.byCode.CONDITIONNEL_NON_CABLE, 1);
  assert.strictEqual(report.byCode.PROMESSE_NON_TENUE, 1);
  assert.strictEqual(report.byChapter['3'].total, 2);
  assert.strictEqual(report.byChapter['4'].error, 1);
});
