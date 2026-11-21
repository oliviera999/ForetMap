'use strict';

// Chantier collège (novembre 2026), flux D4 : clés de détermination courtes.
// Assertions sur les DONNÉES (`data/college-2026-11/d4/cles-courtes.json`) et sur la migration
// « college_cles_courtes » générée à partir d'elles. La mécanique de rejeu (création en base,
// gardes, audit des chemins morts) est dans `tests/college-d4-rejeu.test.js`.
// Pas de base de données : contrôles purs sur les fichiers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  checkD4,
  loadData,
  countWords,
  issueOf,
  MAX_MOTS_PROPOSITION,
} = require('../../scripts/college-2026-11/check-d4-donnees');
const { buildSql, migrationPath } = require('../../scripts/college-2026-11/build-d4-migration');

const data = loadData();
const bySlug = (slug) => data.cles.find((c) => c.slug === slug);
const clone = () => JSON.parse(JSON.stringify(data));

const VERSIONS_COURTES = {
  'araignees-college': 'araignees',
  'papillons-college': 'papillons',
  'traces-mammiferes-melah-college': 'traces-mammiferes-melah',
  'arbres-palmiers-college': 'arbres-palmiers',
  'amphibiens-reptiles-melah-college': 'amphibiens-reptiles-melah',
};

test('D4 : fichier de données conforme (contrôle par script)', () => {
  assert.deepEqual(checkD4(), []);
});

test('D4 : la migration générée est à jour avec les données', () => {
  assert.equal(fs.readFileSync(migrationPath(), 'utf8'), buildSql(data));
});

test('D4 : cinq versions courtes renvoient chacune à leur clé complète', () => {
  for (const [slug, full] of Object.entries(VERSIONS_COURTES)) {
    const cle = bySlug(slug);
    assert.ok(cle, slug);
    assert.equal(cle.full_key_slug, full);
    for (const c of cle.couplets) {
      for (const l of c.leads) {
        if (issueOf(l) === 'couplet') continue;
        // « Pour aller plus loin » : la clé complète (pas de renvoi propre sur ces cinq clés).
        assert.equal(l.next_key ?? cle.full_key_slug, full, `${slug} couplet ${c.number}`);
      }
    }
  }
});

test('D4 : clé collège de la daya, avec consigne de sécurité et matériel', () => {
  const daya = bySlug('oiseaux-eau-daya-college');
  assert.ok(daya);
  assert.equal(daya.map_id, 'dayat');
  assert.equal(daya.tool_required, 'jumelles');
  assert.ok(daya.safety_note.length > 50);
  assert.equal(data.cles.length, 6);
});

test('D4 : 6 à 8 couplets, propositions de 15 mots au plus', () => {
  for (const cle of data.cles) {
    assert.ok(cle.couplets.length >= 6 && cle.couplets.length <= 8, cle.slug);
    for (const c of cle.couplets) {
      for (const l of c.leads) {
        assert.ok(countWords(l.statement) <= MAX_MOTS_PROPOSITION, l.statement);
      }
    }
  }
});

test('D4 : le contrôle détecte un clade nommé, un verbe interdit et une proposition trop longue', () => {
  const d = clone();
  const leads = d.cles[0].couplets.flatMap((c) => c.leads);
  const clade = leads.find((l) => issueOf(l) === 'clade');
  clade.result_label = 'Nom interdit';
  leads[0].statement = 'On peut toucher la bête pour mieux voir.';
  leads[1].statement =
    'Une proposition beaucoup trop longue qui compte bien plus de quinze mots au total pour un élève de sixième.';
  const errors = checkD4({ data: d, snapshot: null });
  assert.ok(errors.some((e) => /nom de groupe sur un clade/.test(e)));
  assert.ok(errors.some((e) => /verbe interdit/.test(e)));
  assert.ok(errors.some((e) => /mots \(max 15\)/.test(e)));
});

test('D4 : le contrôle détecte un couplet inatteignable et une espace insécable manquante', () => {
  const d = clone();
  const cle = d.cles[0];
  for (const c of cle.couplets) {
    for (const l of c.leads) if (l.couplet === cle.couplets.length) l.couplet = 2;
  }
  cle.couplets[0].leads[0].hint = 'Prudence : on recule.';
  const errors = checkD4({ data: d, snapshot: null });
  assert.ok(errors.some((e) => /inatteignable/.test(e)));
  assert.ok(errors.some((e) => /insécable/.test(e)));
});

test('D4 : la migration ne fait qu’insérer (aucun UPDATE, DELETE ni DDL)', () => {
  const sql = buildSql(data)
    .replace(/^--.*$/gm, '')
    .replace(/'(?:[^']|'')*'/g, "''");
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
  assert.doesNotMatch(sql, /@[a-z0-9.-]+\.[a-z]{2,}/i, 'aucune adresse e-mail');
});
