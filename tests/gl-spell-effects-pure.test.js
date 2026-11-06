'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestContributions,
  assertFenetre,
  parseLimite,
  fenetreMessage,
  limiteMessage,
} = require('../lib/glSpellFenetres');
const { resolveSpellEffect } = require('../lib/glSpellEffectsApply');
const {
  validateSpellEffect,
  TENIR_SPELL_EFFECTS,
  AIDE_SPELL_CODES,
} = require('../lib/glSpellEffects');
const { momentForEvent, renderOluLine } = require('../lib/glTenirOlu');
const { longestWeeklyStreak } = require('../lib/glTenirBadges');
const { csvCell, csvLines, BOM } = require('../lib/glTenirExports');

test('pot : 5 présents, coût 2 → 1, 1, 0, 0, 0 ; reste au plus riche (égalité → plus petit id)', () => {
  const members = [1, 2, 3, 4, 5].map((id) => ({ playerId: id, health: 3, power: 3 }));
  const out = suggestContributions({ members, ressource: 'power', cout: 2 });
  assert.deepEqual(
    out.map((m) => m.amount),
    [1, 1, 0, 0, 0],
  );
});

test('pot : parts égales puis reste au plus riche ; un membre à 0 ne verse pas ; part plafonnée au solde', () => {
  const members = [
    { playerId: 1, health: 0, power: 5 },
    { playerId: 2, health: 0, power: 2 },
    { playerId: 3, health: 0, power: 0 },
  ];
  const out = suggestContributions({ members, ressource: 'power', cout: 4 });
  assert.deepEqual(out, [
    { playerId: 1, amount: 2 },
    { playerId: 2, amount: 2 },
    { playerId: 3, amount: 0 },
  ]);
  const out2 = suggestContributions({ members, ressource: 'power', cout: 6 });
  assert.deepEqual(
    out2.map((m) => m.amount),
    [4, 2, 0],
    'le reste va au plus riche dans la ressource',
  );
  assert.deepEqual(suggestContributions({ members: [], ressource: 'health', cout: 2 }), []);
});

test('fenêtres : avant / après le jet, phase jeu, seuil hors phase jeu, message explicite', () => {
  const round = (phase) => ({ phase });
  assert.doesNotThrow(() =>
    assertFenetre({ spell: { fenetre: 'avant_jet' }, round: round('jeu'), teamRolled: false }),
  );
  assert.throws(
    () => assertFenetre({ spell: { fenetre: 'avant_jet' }, round: round('jeu'), teamRolled: true }),
    (err) => err.code === 'SPELL_FENETRE' && /avant le jet/.test(err.message),
  );
  assert.throws(
    () =>
      assertFenetre({ spell: { fenetre: 'apres_jet' }, round: round('jeu'), teamRolled: false }),
    (err) => err.code === 'SPELL_FENETRE' && /après le jet/.test(err.message),
  );
  assert.throws(
    () => assertFenetre({ spell: { fenetre: 'jeu' }, round: round('souffle'), teamRolled: false }),
    (err) => err.code === 'SPELL_FENETRE',
  );
  assert.doesNotThrow(() => assertFenetre({ spell: { fenetre: 'seuil' }, round: round('clos') }));
  assert.throws(() => assertFenetre({ spell: { fenetre: 'seuil' }, round: round('jeu') }));
  assert.doesNotThrow(() => assertFenetre({ spell: { fenetre: 'activite' }, round: null }));
  assert.throws(
    () =>
      assertFenetre({
        spell: { fenetre: 'avant_jets_pacte' },
        round: round('jeu'),
        teamRolled: false,
        partnerRolled: true,
      }),
    (err) => err.code === 'SPELL_FENETRE',
  );
  assert.match(fenetreMessage('inconnue'), /pas lançable/);
});

test('limites : analyse du JSON, message ; effets : repli par code et validation', () => {
  assert.deepEqual(parseLimite('{"par":"tour","n":1,"portee":"equipe"}'), {
    par: 'tour',
    n: 1,
    portee: 'equipe',
  });
  assert.equal(parseLimite(null), null);
  assert.match(limiteMessage({ par: 'tour', n: 1, portee: 'partie' }), /1 fois par tour/);
  assert.equal(
    resolveSpellEffect({ spellCode: 'SL037', effetAutoJson: null }).type,
    'reveler_zone',
  );
  assert.equal(resolveSpellEffect({ spellCode: 'SL004', effetAutoJson: null }), null);
  assert.equal(
    resolveSpellEffect({
      spellCode: 'SL002',
      effetAutoJson: '{"type":"move_delta","choix":[-2,2]}',
    }).choix[1],
    2,
    'le fichier gagne sur le repli',
  );
  for (const [code, effect] of Object.entries(TENIR_SPELL_EFFECTS)) {
    assert.equal(validateSpellEffect(effect), null, `${code} : effet de repli valide`);
  }
  assert.deepEqual(AIDE_SPELL_CODES, ['SL039', 'SL043', 'SL044', 'SL045']);
});

test('Olu : moment par événement, substitution des variables', () => {
  assert.equal(momentForEvent('fouille'), 'fouille');
  assert.equal(momentForEvent('page_tenue'), 'tenir');
  assert.equal(momentForEvent('chapardeur'), 'oiseau');
  assert.equal(momentForEvent('inconnu'), null);
  assert.equal(
    renderOluLine('{equipe} avance de {n} cases', { equipe: 'Gnomes A', n: 3 }),
    'Gnomes A avance de 3 cases',
  );
  assert.equal(renderOluLine('{biome} ?', {}), '{biome} ?');
});

test('badges : série hebdomadaire consécutive ; CSV : séparateur ; et BOM', () => {
  assert.equal(longestWeeklyStreak(['2026-W40', '2026-W41', '2026-W42', '2026-W45']), 3);
  assert.equal(longestWeeklyStreak(['2025-W52', '2026-W01']), 2);
  assert.equal(longestWeeklyStreak([]), 0);
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('dit "oui"'), '"dit ""oui"""');
  const csv = csvLines(['a', 'b'], [[1, 'x']]);
  assert.ok(csv.startsWith(BOM));
  assert.equal(csv.replace(BOM, ''), 'a;b\r\n1;x\r\n');
});
