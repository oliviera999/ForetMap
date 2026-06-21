'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  INTERACTION_TYPES,
  interactionTypeLabel,
  isInteractionType,
  normalizeInteractionInput,
  makeFoodWebStore,
} = require('../lib/shared/foodWebCore');

test('INTERACTION_TYPES — parité avec l’ENUM SQL', () => {
  assert.deepStrictEqual(
    [...INTERACTION_TYPES].sort(),
    [
      'competition',
      'decomposition',
      'herbivorie',
      'nitrification',
      'plante_hote',
      'pollinisation',
      'predation',
      'symbiose',
    ].sort(),
  );
});

test('interactionTypeLabel / isInteractionType', () => {
  assert.strictEqual(interactionTypeLabel('predation'), 'Prédation');
  assert.strictEqual(interactionTypeLabel('PREDATION'), 'Prédation');
  assert.strictEqual(interactionTypeLabel('inconnu'), 'inconnu');
  assert.strictEqual(isInteractionType('symbiose'), true);
  assert.strictEqual(isInteractionType('nope'), false);
});

test('normalizeInteractionInput — cas valides et erreurs', () => {
  const ok = normalizeInteractionInput({
    from_id: 5,
    to_id: 9,
    interaction_type: 'Pollinisation',
    description: '  pollen  ',
  });
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.value, {
    fromId: 5,
    toId: 9,
    type: 'pollinisation',
    description: 'pollen',
  });

  const noTarget = normalizeInteractionInput({ fromId: 3, interactionType: 'decomposition' });
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

test('makeFoodWebStore — CRUD via base de données simulée', async () => {
  const rows = new Map();
  let seq = 0;
  const fakeDb = {
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
      if (/^INSERT INTO species_interactions/.test(sql)) {
        seq += 1;
        rows.set(seq, {
          id: seq,
          from_id: params[0],
          to_id: params[1],
          interaction_type: params[2],
          description: params[3],
        });
        return { insertId: seq };
      }
      if (/^UPDATE species_interactions/.test(sql)) {
        const id = params[4];
        rows.set(id, {
          id,
          from_id: params[0],
          to_id: params[1],
          interaction_type: params[2],
          description: params[3],
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

  const store = makeFoodWebStore(fakeDb, {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
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
