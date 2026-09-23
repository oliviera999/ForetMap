'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let layoutIdKeySchema;
let resolveStartCouplet;
let truncateEdgeLabel;
let coupletNodeId;
let plantNodeId;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/utils/idKeySchemaLayout.js')).href
  );
  layoutIdKeySchema = mod.layoutIdKeySchema;
  resolveStartCouplet = mod.resolveStartCouplet;
  truncateEdgeLabel = mod.truncateEdgeLabel;
  coupletNodeId = mod.coupletNodeId;
  plantNodeId = mod.plantNodeId;
});

/** Clé minimale : couplet 1 → (A) couplet 2 → espèce ; (B) espèce directe. */
function sampleKey() {
  return {
    title: 'Test',
    couplets: [
      {
        id: 10,
        number: 1,
        leads: [
          {
            id: 101,
            statement: 'Feuilles opposées',
            image_url: 'https://example.com/a.png',
            next_couplet_id: 20,
            plant_id: null,
          },
          {
            id: 102,
            statement: 'Feuilles alternes',
            image_url: null,
            next_couplet_id: null,
            plant_id: 5,
            plant_name: 'Chêne',
            plant_emoji: '🌳',
          },
        ],
      },
      {
        id: 20,
        number: 2,
        leads: [
          {
            id: 201,
            statement: 'Écorce lisse',
            image_url: null,
            next_couplet_id: null,
            plant_id: 7,
            plant_name: 'Hêtre',
            plant_emoji: '🌲',
          },
        ],
      },
    ],
  };
}

describe('idKeySchemaLayout', () => {
  it('resolveStartCouplet préfère le couplet n°1', () => {
    const start = resolveStartCouplet(sampleKey());
    assert.equal(start.id, 10);
  });

  it('truncateEdgeLabel coupe les longs énoncés', () => {
    assert.equal(truncateEdgeLabel('court'), 'court');
    const long = 'x'.repeat(50);
    const out = truncateEdgeLabel(long, 42);
    assert.ok(out.length <= 42);
    assert.ok(out.endsWith('…'));
  });

  it('layout vide si pas de couplets', () => {
    const empty = layoutIdKeySchema({ couplets: [] });
    assert.equal(empty.rootId, null);
    assert.equal(empty.nodes.length, 0);
    assert.equal(empty.edges.length, 0);
  });

  it('layout place racine, couplet enfant et feuilles espèce', () => {
    const layout = layoutIdKeySchema(sampleKey());
    assert.equal(layout.rootId, coupletNodeId(10));
    assert.ok(layout.nodes.some((n) => n.id === coupletNodeId(10) && n.type === 'couplet'));
    assert.ok(layout.nodes.some((n) => n.id === coupletNodeId(20) && n.type === 'couplet'));
    assert.ok(layout.nodes.some((n) => n.id === plantNodeId(102) && n.type === 'plant'));
    assert.ok(layout.nodes.some((n) => n.id === plantNodeId(201) && n.plantId === 7));
    assert.equal(layout.edges.length, 3);
  });

  it('profondeurs monotones le long des arêtes (parent plus haut que enfant)', () => {
    const layout = layoutIdKeySchema(sampleKey());
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const e of layout.edges) {
      const from = byId.get(e.fromId);
      const to = byId.get(e.toId);
      assert.ok(from && to);
      assert.ok(from.y < to.y, `y parent ${from.y} < y enfant ${to.y}`);
      assert.ok(from.depth < to.depth);
    }
  });

  it('conserve image_url et énoncé sur les arêtes', () => {
    const layout = layoutIdKeySchema(sampleKey());
    const withImg = layout.edges.find((e) => e.leadId === 101);
    assert.equal(withImg.image_url, 'https://example.com/a.png');
    assert.match(withImg.statement, /opposées/);
  });
});
