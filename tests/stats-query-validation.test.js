'use strict';

// O7 — vérifie SANS DB que le schéma zod du périmètre des stats (`/all`, `/export`)
// reproduit exactement l'ancienne lecture manuelle :
//   group_id/subgroup_id → String(x || '').trim() ; map_id/project_id → x || null.
// Coercition tolérante, jamais de 400 pour une query invalide.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { statsScopeQuerySchema } = require('../routes/stats');

function runQuery(rawQuery) {
  const req = { query: rawQuery };
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {
      return this;
    },
  };
  let nextCalled = false;
  validate({ query: statsScopeQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, parsed: req.validatedQuery };
}

// Ré-implémentation indépendante de l'ancienne logique.
function legacy(query) {
  return {
    groupId: String(query?.group_id || '').trim(),
    subgroupId: String(query?.subgroup_id || '').trim(),
    mapId: query?.map_id || null,
    projectId: query?.project_id || null,
  };
}

const EDGE_VALUES = [undefined, '', '   ', ' g-1 ', 'abc', '0', '-3', '7.5'];

test("group_id/subgroup_id : équivalence exacte avec String(x || '').trim(), jamais de 400", () => {
  for (const raw of EDGE_VALUES) {
    const query = {};
    if (raw !== undefined) {
      query.group_id = raw;
      query.subgroup_id = raw;
    }
    const { nextCalled, status, parsed } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `group_id=${JSON.stringify(raw)} ne doit jamais être rejeté`,
    );
    assert.strictEqual(status, 200);
    const expected = legacy(query);
    assert.strictEqual(parsed.groupId, expected.groupId, `groupId pour ${JSON.stringify(raw)}`);
    assert.strictEqual(
      parsed.subgroupId,
      expected.subgroupId,
      `subgroupId pour ${JSON.stringify(raw)}`,
    );
  }
});

test('map_id/project_id : transmis tels quels ou null si falsy, jamais de 400', () => {
  for (const raw of [undefined, '', 'm-1', '0', ' x ']) {
    const query = {};
    if (raw !== undefined) {
      query.map_id = raw;
      query.project_id = raw;
    }
    const { nextCalled, parsed } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `map_id=${JSON.stringify(raw)} ne doit jamais être rejeté`,
    );
    const expected = legacy(query);
    assert.strictEqual(parsed.mapId, expected.mapId, `mapId pour ${JSON.stringify(raw)}`);
    assert.strictEqual(
      parsed.projectId,
      expected.projectId,
      `projectId pour ${JSON.stringify(raw)}`,
    );
  }
});
