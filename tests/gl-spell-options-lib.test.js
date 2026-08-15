'use strict';

// Tests purs (sans DB) des options de sortilège : normalisation ENUM, règle
// d'autorisation par peuple, patch d'édition en masse et sémantique d'import
// (« colonne absente => valeur en base conservée »).
const test = require('node:test');
const assert = require('node:assert');

const {
  normalizeCasterKind,
  normalizeCasterKindOrNull,
  normalizeTeamType,
  isCasterKindAllowed,
  casterKindLabel,
  teamTypeLabel,
  normalizeApprovalMode,
  normalizeApprovalModeOrNull,
  normalizeCastScope,
  normalizeCastScopeOrNull,
} = require('../lib/glSpellOptions');
const { buildSpellBulkPatch, buildSpellBulkUpdateSql } = require('../lib/glSpellBulkPatch');
const {
  buildSpellPayload,
  buildSpellUpsertParams,
  validateSpellPayload,
  SPELL_UPSERT_SQL,
  SPELL_TEMPLATE_HEADERS,
} = require('../lib/glSpellsImport');

test('normalizeCasterKind accepte les alias français et anglais', () => {
  for (const value of ['gnome', 'Gnomes', ' GNOME ']) {
    assert.strictEqual(normalizeCasterKind(value), 'gnome');
  }
  for (const value of ['unicorn', 'licorne', 'Licornes']) {
    assert.strictEqual(normalizeCasterKind(value), 'unicorn');
  }
  for (const value of ['any', 'tous', 'les deux', 'both']) {
    assert.strictEqual(normalizeCasterKind(value), 'any');
  }
});

test('normalizeCasterKind replie tout inconnu sur any, la variante OrNull garde null', () => {
  assert.strictEqual(normalizeCasterKind('dragon'), 'any');
  assert.strictEqual(normalizeCasterKind(null), 'any');
  assert.strictEqual(normalizeCasterKindOrNull('dragon'), null);
  assert.strictEqual(normalizeCasterKindOrNull(''), null);
  assert.strictEqual(normalizeCasterKindOrNull(undefined), null);
});

test('normalizeTeamType reconnaît le vocabulaire de gl_teams.type', () => {
  assert.strictEqual(normalizeTeamType('gnome'), 'gnome');
  assert.strictEqual(normalizeTeamType('unicorn'), 'unicorn');
  assert.strictEqual(normalizeTeamType('licorne'), 'unicorn');
  assert.strictEqual(normalizeTeamType('troll'), null);
  assert.strictEqual(normalizeTeamType(null), null);
});

test('isCasterKindAllowed : any ouvre à tous, une restriction exige le bon peuple', () => {
  assert.strictEqual(isCasterKindAllowed('any', 'gnome'), true);
  assert.strictEqual(isCasterKindAllowed('any', 'unicorn'), true);
  assert.strictEqual(isCasterKindAllowed('gnome', 'gnome'), true);
  assert.strictEqual(isCasterKindAllowed('gnome', 'unicorn'), false);
  assert.strictEqual(isCasterKindAllowed('unicorn', 'unicorn'), true);
  assert.strictEqual(isCasterKindAllowed('unicorn', 'gnome'), false);
});

test('isCasterKindAllowed : un peuple indéterminé ne satisfait aucune restriction', () => {
  // Aucune équipe => aucune vérification possible : on refuse plutôt que de laisser passer.
  assert.strictEqual(isCasterKindAllowed('gnome', null), false);
  assert.strictEqual(isCasterKindAllowed('unicorn', undefined), false);
  // …mais un sort ouvert reste ouvert.
  assert.strictEqual(isCasterKindAllowed('any', null), true);
});

test('libellés français des restrictions et des peuples', () => {
  assert.strictEqual(casterKindLabel('gnome'), 'Gnomes uniquement');
  assert.strictEqual(casterKindLabel('licorne'), 'Licornes uniquement');
  assert.strictEqual(casterKindLabel('inconnu'), 'Gnomes et licornes');
  assert.strictEqual(teamTypeLabel('unicorn'), 'Licornes');
  assert.strictEqual(teamTypeLabel('troll'), null);
});

test('normalisation des deux autres options ENUM du sort', () => {
  assert.strictEqual(normalizeApprovalMode('mj'), 'mj_required');
  assert.strictEqual(normalizeApprovalMode('bidon'), 'auto');
  assert.strictEqual(normalizeApprovalModeOrNull('bidon'), null);
  assert.strictEqual(normalizeCastScope('collectif'), 'collective');
  assert.strictEqual(normalizeCastScope('bidon'), 'any');
  assert.strictEqual(normalizeCastScopeOrNull(''), null);
});

test('buildSpellBulkPatch ne retient que les champs fournis et valides', () => {
  const { patch, errors } = buildSpellBulkPatch({ caster_kind: 'licornes' });
  assert.deepStrictEqual(patch, { caster_kind: 'unicorn' });
  assert.deepStrictEqual(errors, []);

  const empty = buildSpellBulkPatch({});
  assert.deepStrictEqual(empty.patch, {});
  assert.deepStrictEqual(empty.errors, []);
});

test('buildSpellBulkPatch refuse une valeur inconnue plutôt que de retomber au défaut', () => {
  const { patch, errors } = buildSpellBulkPatch({ caster_kind: 'dragon', statut: 'officiel' });
  assert.deepStrictEqual(patch, { statut: 'officiel' });
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].field, 'caster_kind');
});

test('buildSpellBulkPatch ignore les champs hors liste blanche', () => {
  const { patch } = buildSpellBulkPatch({ nom: 'Pirate', cout_gemmes: 99, cast_scope: 'solo' });
  assert.deepStrictEqual(patch, { cast_scope: 'solo' });
});

test('buildSpellBulkUpdateSql produit un SET paramétré', () => {
  const { setSql, params, columns } = buildSpellBulkUpdateSql({
    caster_kind: 'gnome',
    statut: 'propose',
  });
  assert.strictEqual(setSql, 'caster_kind = ?, statut = ?');
  assert.deepStrictEqual(params, ['gnome', 'propose']);
  assert.deepStrictEqual(columns, ['caster_kind', 'statut']);
});

test('import : une colonne absente laisse les options à null (valeur en base conservée)', () => {
  const payload = buildSpellPayload({ id: 'SL500', nom: 'Sort', categorie: 'vie' });
  assert.strictEqual(payload.caster_kind, null);
  assert.strictEqual(payload.approval_mode, null);
  assert.strictEqual(payload.cast_scope, null);
  assert.deepStrictEqual(validateSpellPayload(payload, 2), []);
});

test('import : les colonnes lanceurs / validation_mj / portee_lancement sont reconnues', () => {
  const payload = buildSpellPayload({
    id: 'SL501',
    nom: 'Sort',
    categorie: 'vie',
    lanceurs: 'licornes',
    validation_mj: 'mj_required',
    portee_lancement: 'collectif',
  });
  assert.strictEqual(payload.caster_kind, 'unicorn');
  assert.strictEqual(payload.approval_mode, 'mj_required');
  assert.strictEqual(payload.cast_scope, 'collective');
});

test('import : une option fournie mais illisible est signalée, pas écrasée en silence', () => {
  const payload = buildSpellPayload({
    id: 'SL502',
    nom: 'Sort',
    categorie: 'vie',
    lanceurs: 'dragons',
  });
  const errors = validateSpellPayload(payload, 7);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].row, 7);
  assert.strictEqual(errors[0].field, 'lanceurs');
});

test('import : les paramètres d’upsert couvrent exactement les placeholders du SQL', () => {
  const payload = buildSpellPayload({ id: 'SL503', nom: 'Sort', categorie: 'vie' });
  const params = buildSpellUpsertParams(payload);
  const placeholders = (SPELL_UPSERT_SQL.match(/\?/g) || []).length;
  assert.strictEqual(params.length, placeholders);
  // Les trois options passent deux fois : COALESCE de l'INSERT puis celui de l'UPDATE.
  assert.deepStrictEqual(params.slice(-6), [null, null, null, null, null, null]);
});

test('modèle XLSX : les trois options figurent en fin d’en-têtes', () => {
  assert.deepStrictEqual(SPELL_TEMPLATE_HEADERS.slice(-3), [
    'lanceurs',
    'validation_mj',
    'portee_lancement',
  ]);
});
