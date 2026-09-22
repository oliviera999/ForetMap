'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  INTERACTION_TYPES,
  INTERACTION_TYPES_CORE,
  INTERACTION_TYPE_META,
  EVIDENCE_LEVELS,
  POLLINATION_EFFICACIES,
  interactionTypeLabel,
  interactionTypeMeta,
  evidenceLevelLabel,
  pollinationEfficacyLabel,
  orientInteraction,
  isInteractionType,
  normalizeInteractionInput,
  makeFoodWebStore,
} = require('../lib/shared/foodWebCore');

test('INTERACTION_TYPES_CORE — parité avec l’ENUM de gl_species_interactions', () => {
  // Les six derniers viennent de la migration 255, qui a démêlé `nitrification`
  // (excrétion / assimilation / oxydation) et `decomposition` (détritivorie, frugivorie).
  // GL s'arrête ici : son ENUM n'a pas été étendue par la migration 272.
  assert.deepStrictEqual(
    [...INTERACTION_TYPES_CORE].sort(),
    [
      'assimilation',
      'competition',
      'decomposition',
      'detritivorie',
      'excretion',
      'frugivorie',
      'granivorie',
      'herbivorie',
      'nitrification',
      'parasitisme',
      'plante_hote',
      'pollinisation',
      'predation',
      'symbiose',
    ].sort(),
  );
});

test('INTERACTION_TYPES — parité avec l’ENUM de species_interactions (19 types)', () => {
  // Migration 272 : cinq types ajoutés EN FIN d'ENUM, côté ForetMap seulement.
  assert.deepStrictEqual(
    [...INTERACTION_TYPES].sort(),
    [
      ...INTERACTION_TYPES_CORE,
      'mutualisme',
      'commensalisme',
      'mycophagie',
      'allelopathie',
      'facilitation',
    ].sort(),
  );
  assert.strictEqual(INTERACTION_TYPES.length, 19);
  // L'ordre compte : l'ENUM SQL ne réordonne pas, il ajoute à la fin.
  assert.deepStrictEqual(INTERACTION_TYPES.slice(0, 14), [...INTERACTION_TYPES_CORE]);
});

test('libellés des niveaux de preuve et des efficacités de pollinisation', () => {
  assert.deepStrictEqual([...EVIDENCE_LEVELS], ['bibliographie', 'observe_site', 'hypothese']);
  assert.strictEqual(evidenceLevelLabel('observe_site'), 'Observé sur le site');
  assert.strictEqual(evidenceLevelLabel('hypothese'), 'Hypothèse');
  // Repli : une valeur absente se lit « Documenté », jamais vide.
  assert.strictEqual(evidenceLevelLabel(null), 'Documenté');
  assert.deepStrictEqual(
    [...POLLINATION_EFFICACIES],
    ['efficace', 'accessoire', 'visiteur', 'voleur_nectar'],
  );
  assert.strictEqual(pollinationEfficacyLabel('voleur_nectar'), 'Voleur de nectar');
  assert.strictEqual(pollinationEfficacyLabel(null), '');
});

test('isInteractionType — le vocabulaire peut être borné (isolement GL)', () => {
  assert.strictEqual(isInteractionType('mutualisme'), true);
  assert.strictEqual(isInteractionType('mutualisme', INTERACTION_TYPES_CORE), false);
  assert.strictEqual(isInteractionType('predation', INTERACTION_TYPES_CORE), true);
});

test('interactionTypeLabel / isInteractionType', () => {
  assert.strictEqual(interactionTypeLabel('predation'), 'Prédation');
  assert.strictEqual(interactionTypeLabel('PREDATION'), 'Prédation');
  assert.strictEqual(interactionTypeLabel('inconnu'), 'inconnu');
  assert.strictEqual(isInteractionType('symbiose'), true);
  assert.strictEqual(isInteractionType('nope'), false);
});

test('INTERACTION_TYPE_META — couvre tous les types', () => {
  for (const type of INTERACTION_TYPES) {
    const meta = INTERACTION_TYPE_META[type];
    assert.ok(meta, `méta manquante pour ${type}`);
    assert.ok(['directed', 'consumed', 'mutual'].includes(meta.orientation));
    assert.ok(typeof meta.relation === 'string' && meta.relation.length > 0);
  }
  // repli neutre sur type inconnu
  assert.strictEqual(interactionTypeMeta('inconnu').orientation, 'directed');
});

test('orientInteraction — sens écologique « est mangée par »', () => {
  // Trophique : la flèche est inversée (de la proie/cible vers le consommateur).
  const pred = orientInteraction(10, 20, 'predation');
  assert.strictEqual(pred.tailId, 20);
  assert.strictEqual(pred.headId, 10);
  assert.strictEqual(pred.symmetric, false);
  assert.strictEqual(pred.relation, 'est mangée par');

  const herbi = orientInteraction(3, 7, 'herbivorie');
  assert.strictEqual(herbi.tailId, 7);
  assert.strictEqual(herbi.headId, 3);

  // Dirigé : sens source → cible conservé.
  const polli = orientInteraction(5, 9, 'pollinisation');
  assert.strictEqual(polli.tailId, 5);
  assert.strictEqual(polli.headId, 9);
  assert.strictEqual(polli.symmetric, false);

  // Mutuel : symétrique.
  const symb = orientInteraction(1, 2, 'symbiose');
  assert.strictEqual(symb.symmetric, true);

  // Cible nulle (environnement) conservée comme null.
  const env = orientInteraction(4, null, 'decomposition');
  assert.strictEqual(env.tailId, null);
  assert.strictEqual(env.headId, 4);
});

test('normalizeInteractionInput — cas valides et erreurs', () => {
  const ok = normalizeInteractionInput(
    {
      from_id: 5,
      to_id: 9,
      interaction_type: 'Pollinisation',
      description: '  pollen  ',
    },
    { quality: false },
  );
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.value, {
    fromId: 5,
    toId: 9,
    type: 'pollinisation',
    description: 'pollen',
  });

  const noTarget = normalizeInteractionInput(
    { fromId: 3, interactionType: 'decomposition' },
    { quality: false },
  );
  assert.deepStrictEqual(noTarget.errors, []);
  assert.strictEqual(noTarget.value.toId, null);
  assert.strictEqual(noTarget.value.description, null);

  assert.ok(normalizeInteractionInput({ from_id: 0, interaction_type: 'symbiose' }).errors.length);
  assert.ok(normalizeInteractionInput({ from_id: 1, interaction_type: 'bad' }).errors.length);
  assert.ok(
    normalizeInteractionInput({ from_id: 2, to_id: 2, interaction_type: 'predation' }).errors.some(
      (e) => /elle-même/.test(e),
    ),
  );
});

test('normalizeInteractionInput — qualité du lien (migration 272)', () => {
  // Par défaut, un lien est « documenté » : la colonne est NOT NULL en base.
  const implicite = normalizeInteractionInput({
    from_id: 5,
    to_id: 9,
    interaction_type: 'predation',
  });
  assert.deepStrictEqual(implicite.errors, []);
  assert.strictEqual(implicite.value.evidenceLevel, 'bibliographie');
  assert.strictEqual(implicite.value.pollinationEfficacy, null);
  assert.strictEqual(implicite.value.sourceRef, null);

  const complet = normalizeInteractionInput({
    from_id: 5,
    to_id: 9,
    interaction_type: 'pollinisation',
    evidence_level: 'Observe_Site',
    pollination_efficacy: 'voleur_nectar',
    source_ref: '  Flore du Maroc, t. 2  ',
  });
  assert.deepStrictEqual(complet.errors, []);
  assert.strictEqual(complet.value.evidenceLevel, 'observe_site');
  assert.strictEqual(complet.value.pollinationEfficacy, 'voleur_nectar');
  assert.strictEqual(complet.value.sourceRef, 'Flore du Maroc, t. 2');

  // Une « efficacité de pollinisation » hors pollinisation est refusée, pas effacée en
  // silence : c'est la saisie qu'il faut corriger.
  const horsSujet = normalizeInteractionInput({
    from_id: 5,
    to_id: 9,
    interaction_type: 'predation',
    pollination_efficacy: 'efficace',
  });
  assert.ok(horsSujet.errors.some((e) => /pollinisation/.test(e)));
  assert.strictEqual(horsSujet.value.pollinationEfficacy, null);

  assert.ok(
    normalizeInteractionInput({
      from_id: 5,
      interaction_type: 'predation',
      evidence_level: 'rumeur',
    }).errors.some((e) => /Niveau de preuve/.test(e)),
  );
  assert.ok(
    normalizeInteractionInput({
      from_id: 5,
      interaction_type: 'pollinisation',
      pollination_efficacy: 'moyen',
    }).errors.some((e) => /Efficacité/.test(e)),
  );

  // Une source trop longue est tronquée, comme la description.
  const longue = normalizeInteractionInput({
    from_id: 5,
    interaction_type: 'predation',
    source_ref: 'x'.repeat(400),
  });
  assert.strictEqual(longue.value.sourceRef.length, 255);

  // Vocabulaire borné (GL) : les cinq types de la migration 272 sont refusés.
  const glType = normalizeInteractionInput(
    { from_id: 5, to_id: 9, interaction_type: 'mutualisme' },
    { allowedTypes: INTERACTION_TYPES_CORE, quality: false },
  );
  assert.ok(glType.errors.some((e) => /Type d’interaction invalide/.test(e)));
  assert.strictEqual(glType.value.evidenceLevel, undefined);
});

/** Base simulée minimale : ids 1..100 existants, doublon sur (from, to, type). */
function makeFakeDb(rows, seen) {
  let seq = 0;
  return {
    async queryOne(sql, params) {
      if (/FROM plants/.test(sql)) {
        // refExists : on considère les ids 1..100 comme existants.
        const id = Number(params[0]);
        return id >= 1 && id <= 100 ? { id } : null;
      }
      if (/SELECT id, from_plant_id/.test(sql)) {
        return rows.get(Number(params[0])) || null;
      }
      if (/SELECT id FROM species_interactions/.test(sql)) {
        // findDuplicate : compare from/to/type, exclut excludeId.
        const [fromId, toId, type, , excludeId] = params;
        for (const r of rows.values()) {
          if (excludeId && r.id === excludeId) continue;
          if (r.from_id === fromId && r.to_id === toId && r.interaction_type === type)
            return { id: r.id };
        }
        return null;
      }
      return null;
    },
    async execute(sql, params) {
      seen.push({ sql, params });
      if (/^INSERT INTO species_interactions/.test(sql)) {
        seq += 1;
        rows.set(seq, {
          id: seq,
          from_id: params[0],
          to_id: params[1],
          interaction_type: params[2],
          description: params[3],
          evidence_level: params[4] ?? null,
          pollination_efficacy: params[5] ?? null,
          source_ref: params[6] ?? null,
        });
        return { insertId: seq };
      }
      if (/^UPDATE species_interactions/.test(sql)) {
        const id = params[params.length - 1];
        rows.set(id, {
          id,
          from_id: params[0],
          to_id: params[1],
          interaction_type: params[2],
          description: params[3],
          evidence_level: params[4] ?? null,
          pollination_efficacy: params[5] ?? null,
          source_ref: params[6] ?? null,
        });
        return { affectedRows: 1 };
      }
      if (/^DELETE FROM species_interactions/.test(sql)) {
        rows.delete(params[0]);
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    },
  };
}

test('makeFoodWebStore — CRUD via base de données simulée', async () => {
  const rows = new Map();
  const seen = [];
  const fakeDb = makeFakeDb(rows, seen);

  const store = makeFoodWebStore(fakeDb, {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
    quality: true,
  });

  const created = await store.create({ from_id: 5, to_id: 9, interaction_type: 'pollinisation' });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.row.interaction_type, 'pollinisation');

  const dup = await store.create({ from_id: 5, to_id: 9, interaction_type: 'pollinisation' });
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.status, 409);

  const badRef = await store.create({ from_id: 999, interaction_type: 'symbiose' });
  assert.strictEqual(badRef.ok, false);
  assert.strictEqual(badRef.status, 400);

  const updated = await store.update(created.row.id, {
    from_id: 5,
    to_id: 9,
    interaction_type: 'symbiose',
  });
  assert.strictEqual(updated.ok, true);
  assert.strictEqual(updated.row.interaction_type, 'symbiose');

  const removed = await store.remove(created.row.id);
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(await store.getById(created.row.id), null);

  const missing = await store.update(424242, { from_id: 5, interaction_type: 'symbiose' });
  assert.strictEqual(missing.status, 404);
});

test('makeFoodWebStore — `quality` persiste la qualité du lien (ForetMap)', async () => {
  const rows = new Map();
  const seen = [];
  const store = makeFoodWebStore(makeFakeDb(rows, seen), {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
    quality: true,
  });

  const created = await store.create({
    from_id: 5,
    to_id: 9,
    interaction_type: 'pollinisation',
    evidence_level: 'observe_site',
    pollination_efficacy: 'accessoire',
    source_ref: 'Relevé de la classe, mai 2026',
  });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.row.evidence_level, 'observe_site');
  assert.strictEqual(created.row.pollination_efficacy, 'accessoire');
  assert.strictEqual(created.row.source_ref, 'Relevé de la classe, mai 2026');

  const insert = seen.find((q) => /^INSERT INTO/.test(q.sql));
  assert.match(insert.sql, /evidence_level, pollination_efficacy, source_ref/);

  // Changer de type efface l'efficacité : elle n'a de sens que pour la pollinisation.
  const updated = await store.update(created.row.id, {
    from_id: 5,
    to_id: 9,
    interaction_type: 'herbivorie',
    evidence_level: 'hypothese',
  });
  assert.strictEqual(updated.ok, true);
  assert.strictEqual(updated.row.pollination_efficacy, null);
  assert.strictEqual(updated.row.evidence_level, 'hypothese');
});

test('makeFoodWebStore — configuration GL : 14 types, aucune colonne de qualité', async () => {
  const rows = new Map();
  const seen = [];
  const store = makeFoodWebStore(makeFakeDb(rows, seen), {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
    allowedTypes: INTERACTION_TYPES_CORE,
  });

  // L'ENUM de `gl_species_interactions` ignore les cinq types de la migration 272 : le
  // magasin doit les refuser avant l'écriture, sinon l'erreur remonte du moteur SQL.
  for (const type of [
    'mutualisme',
    'commensalisme',
    'mycophagie',
    'allelopathie',
    'facilitation',
  ]) {
    const refused = await store.create({ from_id: 5, to_id: 9, interaction_type: type });
    assert.strictEqual(refused.ok, false, `${type} devrait être refusé côté GL`);
    assert.strictEqual(refused.status, 400);
  }

  const created = await store.create({
    from_id: 5,
    to_id: 9,
    interaction_type: 'predation',
    evidence_level: 'observe_site',
  });
  assert.strictEqual(created.ok, true);
  const insert = seen.find((q) => /^INSERT INTO/.test(q.sql));
  assert.ok(
    !/evidence_level/.test(insert.sql),
    'la table GL ne porte pas les colonnes de qualité du lien',
  );
  assert.strictEqual(insert.params.length, 4);
});
