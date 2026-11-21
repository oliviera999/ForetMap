'use strict';

// Chantier collège (flux C4) : arbre réduit aux groupes d'usage (`collapseForProfile`).
// Fixture : arbre réel de la production (instantané du 21/11/2026, recopié dans
// `tests/fixtures/college-c4-clades-tree.json`), sans marque `visible_college` : le test pose
// les marques de l'arbre collège prévu (prompt D2, § 1).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/college-c4-clades-tree.json');
const {
  indexClades,
  ancestorChain,
  usageGroupFor,
  collapseForProfile,
  collapsedCladeIdFor,
  isCollegeTreeProfile,
  buildNestedActivityTree,
} = require('../lib/clades');

/** Boîtes visibles au collège et libellés simples (sélection de l'arbre prévu par D2). */
const COLLEGE_MARKS = {
  vivant: { label: null },
  bacteries: { label: null },
  champignons: { label: null },
  algues_vertes: { label: null },
  rhodophytes: { label: null },
  stramenopiles: { label: 'Algues brunes' },
  embryophytes: { label: 'Plantes terrestres', attr: 'Vivent hors de l’eau' },
  bryophytes: { label: 'Mousses' },
  fougeres: { label: null },
  gymnospermes: { label: 'Conifères et cousins' },
  angiospermes: { label: 'Plantes à fleurs', attr: 'Ont des fleurs puis des fruits' },
  metazoaires: { label: 'Animaux' },
  cnidaires: { label: 'Méduses et anémones' },
  mollusques: { label: null },
  arthropodes: { label: 'Animaux à pattes articulées' },
  insectes: { label: null },
  arachnides: { label: 'Araignées, scorpions, acariens' },
  crustaces: { label: null },
  vertebres: { label: null },
  oiseaux: { label: null },
  mammiferes: { label: null },
};

function markedTree() {
  return fixture.clades.map((row) => {
    const mark = COLLEGE_MARKS[row.id];
    return {
      ...row,
      visible_college: mark ? 1 : 0,
      label_simple: mark?.label ?? null,
      attribute_simple: mark?.attr ?? null,
    };
  });
}

function depthOf(byId, id) {
  return ancestorChain(byId, id).length;
}

test('la fixture reprend l’arbre réel (74 boîtes, racine unique « Êtres vivants »)', () => {
  assert.equal(fixture.clades.length, 74);
  const roots = fixture.clades.filter((c) => !c.parent_id);
  assert.deepEqual(
    roots.map((r) => r.id),
    ['vivant'],
  );
});

test('repli : profil autre que collège → arbre inchangé, correspondance identité', () => {
  const tree = markedTree();
  for (const profile of [null, undefined, '', 'lycee', 'universite', { etape: 'lycee' }]) {
    const out = collapseForProfile(tree, profile);
    assert.equal(out.collapsed, false);
    assert.equal(out.items.length, tree.length);
    assert.deepEqual(
      out.items.map((r) => r.name),
      tree.map((r) => r.name),
    );
    assert.equal(collapsedCladeIdFor(out, 'oiseaux'), 'oiseaux');
  }
});

test('repli : aucune boîte marquée → comportement actuel même au collège', () => {
  const out = collapseForProfile(fixture.clades, 'college');
  assert.equal(out.collapsed, false);
  assert.equal(out.items.length, 74);
  assert.equal(collapsedCladeIdFor(out, 'lepidopteres'), 'lepidopteres');
});

test('profil collège : seules les boîtes visibles restent, reliées à la visible la plus proche', () => {
  const out = collapseForProfile(markedTree(), 'college');
  assert.equal(out.collapsed, true);
  assert.equal(out.items.length, Object.keys(COLLEGE_MARKS).length);
  assert.ok(out.items.every((r) => Number(r.visible_college) === 1));

  const byId = indexClades(out.items);
  // Eucaryotes, Opisthocontes, Bilatériens… disparaissent : Animaux se rattache à la racine.
  assert.equal(byId.get('metazoaires').parent_id, 'vivant');
  assert.equal(byId.get('champignons').parent_id, 'vivant');
  // Hexapodes disparaît : Insectes se rattache aux arthropodes.
  assert.equal(byId.get('insectes').parent_id, 'arthropodes');
  // Tétrapodes, Amniotes, Sauropsides disparaissent : Oiseaux sous Vertébrés.
  assert.equal(byId.get('oiseaux').parent_id, 'vertebres');
  // Plantes à graines, Plantes vasculaires disparaissent.
  assert.equal(byId.get('angiospermes').parent_id, 'embryophytes');
  assert.equal(byId.get('vivant').parent_id, null);

  // Profondeur bornée (l'arbre complet descend à 10 niveaux).
  const fullDepth = Math.max(
    ...fixture.clades.map((c) => depthOf(indexClades(fixture.clades), c.id)),
  );
  const reducedDepth = Math.max(...out.items.map((c) => depthOf(byId, c.id)));
  assert.ok(fullDepth >= 9, `profondeur complète ${fullDepth}`);
  assert.ok(reducedDepth <= 4, `profondeur réduite ${reducedDepth}`);
});

test('libellé = label_simple || name ; attribut = attribute_simple || shared_attribute', () => {
  const out = collapseForProfile(markedTree(), 'college');
  const byId = indexClades(out.items);
  const angio = byId.get('angiospermes');
  assert.equal(angio.name, 'Plantes à fleurs');
  assert.equal(angio.shared_attribute, 'Ont des fleurs puis des fruits');
  assert.equal(angio.full_name, 'Plantes à fleurs (angiospermes)');
  const oiseaux = byId.get('oiseaux');
  assert.equal(oiseaux.name, 'Oiseaux'); // pas de libellé simple : nom conservé
  const source = fixture.clades.find((c) => c.id === 'oiseaux');
  assert.equal(oiseaux.shared_attribute, source.shared_attribute);
});

test('les espèces des boîtes retirées remontent à la boîte visible la plus proche', () => {
  const tree = markedTree();
  const out = collapseForProfile(tree, 'college');
  assert.equal(collapsedCladeIdFor(out, 'lepidopteres'), 'insectes');
  assert.equal(collapsedCladeIdFor(out, 'asteracees'), 'angiospermes');
  assert.equal(collapsedCladeIdFor(out, 'poacees'), 'angiospermes');
  assert.equal(collapsedCladeIdFor(out, 'araignees'), 'arachnides');
  assert.equal(collapsedCladeIdFor(out, 'squamates'), 'vertebres');
  assert.equal(collapsedCladeIdFor(out, 'cilies'), 'vivant');
  assert.equal(collapsedCladeIdFor(out, 'oiseaux'), 'oiseaux');
  assert.equal(collapsedCladeIdFor(out, 'inconnu'), null);
  assert.equal(collapsedCladeIdFor(out, null), null);

  // Même boîte que le groupe d'usage du socle (`usageGroupFor`), pour toutes les boîtes.
  const byId = indexClades(tree);
  for (const id of byId.keys()) {
    assert.equal(collapsedCladeIdFor(out, id), usageGroupFor(byId, id)?.id ?? null, id);
  }

  // Toutes les fiches classées de l'instantané trouvent une boîte visible.
  const unplaced = Object.keys(fixture.plantCountsByClade).filter(
    (id) => !collapsedCladeIdFor(out, id),
  );
  assert.deepEqual(unplaced, []);
});

test('l’arbre réduit sert l’activité : sous-arbre construit sur les boîtes visibles', () => {
  const out = collapseForProfile(markedTree(), 'college');
  const plants = [
    { id: 1, name: 'Mésange', clade_id: 'oiseaux' },
    { id: 2, name: 'Machaon', clade_id: 'lepidopteres' },
    { id: 3, name: 'Coccinelle', clade_id: 'coleopteres' },
  ].map((p) => ({ ...p, clade_id: collapsedCladeIdFor(out, p.clade_id) }));
  const tree = buildNestedActivityTree(
    indexClades(out.items),
    plants,
    plants.map((p) => p.clade_id),
  );
  assert.equal(tree.id, 'metazoaires');
  assert.equal(tree.name, 'Animaux');
  const ids = [];
  (function walk(n) {
    ids.push(n.id);
    n.children.forEach(walk);
  })(tree);
  assert.deepEqual(ids.sort(), ['arthropodes', 'insectes', 'metazoaires', 'oiseaux', 'vertebres']);
});

test('isCollegeTreeProfile : chaîne ou apprenant', () => {
  assert.equal(isCollegeTreeProfile('college'), true);
  assert.equal(isCollegeTreeProfile(' College '), true);
  assert.equal(isCollegeTreeProfile({ etape: 'college' }), true);
  assert.equal(isCollegeTreeProfile('lycee'), false);
  assert.equal(isCollegeTreeProfile(null), false);
});
