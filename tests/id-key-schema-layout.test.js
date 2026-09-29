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
let refNodeId;
let missingNodeId;
let wrapEdgeLabel;
let isLeadUsable;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/utils/idKeySchemaLayout.js')).href
  );
  layoutIdKeySchema = mod.layoutIdKeySchema;
  resolveStartCouplet = mod.resolveStartCouplet;
  truncateEdgeLabel = mod.truncateEdgeLabel;
  coupletNodeId = mod.coupletNodeId;
  plantNodeId = mod.plantNodeId;
  refNodeId = mod.refNodeId;
  missingNodeId = mod.missingNodeId;
  wrapEdgeLabel = mod.wrapEdgeLabel;
  isLeadUsable = mod.isLeadUsable;
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

  it('wrapEdgeLabel coupe aux espaces, sur deux lignes au plus', () => {
    assert.deepEqual(wrapEdgeLabel('Feuilles opposées', 28, 2), ['Feuilles opposées']);
    const lines = wrapEdgeLabel('Feuilles composées pennées à folioles finement dentées', 28, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.length <= 28));
    const long = wrapEdgeLabel(
      'Feuilles composées pennées à folioles finement dentées sur tout le bord du limbe',
      28,
      2,
    );
    assert.ok(long[1].endsWith('…'));
    assert.deepEqual(wrapEdgeLabel('x'.repeat(56), 28, 2), ['x'.repeat(28), 'x'.repeat(28)]);
    assert.deepEqual(wrapEdgeLabel('', 28, 2), ['—']);
  });
});

/** Boîte de toucher d'une étiquette : l'étiquette, vignette comprise. */
function tapBox(edge) {
  const top = edge.imageBox ? edge.imageBox.y : edge.labelBox.y;
  return {
    left: edge.labelBox.x,
    right: edge.labelBox.x + edge.labelBox.width,
    top,
    bottom: edge.labelBox.y + edge.labelBox.height,
  };
}

function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function assertNoLabelOverlap(layout) {
  const boxes = layout.edges.map((e) => ({ id: e.id, box: tapBox(e) }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(
        !boxesOverlap(boxes[i].box, boxes[j].box),
        `étiquettes ${boxes[i].id} et ${boxes[j].id} superposées`,
      );
    }
  }
}

/** Clé équilibrée à 2^depth espèces, énoncés longs et vignettes partout. */
function balancedKey(depth) {
  let cid = 100;
  let lid = 1000;
  const couplets = [];
  function build(level) {
    const id = cid;
    cid += 1;
    const couplet = { id, number: id - 99, leads: [] };
    couplets.push(couplet);
    for (let k = 0; k < 2; k += 1) {
      const leadId = lid;
      lid += 1;
      const statement = 'Feuilles composées pennées à folioles finement dentées';
      if (level === 0) {
        couplet.leads.push({
          id: leadId,
          statement,
          image_url: 'https://example.com/i.png',
          next_couplet_id: null,
          plant_id: leadId,
          plant_name: `Espèce ${leadId}`,
        });
      } else {
        couplet.leads.push({
          id: leadId,
          statement,
          image_url: 'https://example.com/i.png',
          next_couplet_id: build(level - 1),
          plant_id: null,
        });
      }
    }
    return id;
  }
  build(depth);
  return { couplets };
}

describe('idKeySchemaLayout — géométrie (audit 29/09, K1/K2/K8)', () => {
  it('K1 : deux propositions d’un même couplet ne se recouvrent jamais', () => {
    const key = {
      couplets: [
        {
          id: 1,
          number: 1,
          leads: [
            { id: 11, statement: 'Feuilles opposées', next_couplet_id: null, plant_id: 5 },
            { id: 12, statement: 'Feuilles alternes', next_couplet_id: null, plant_id: 6 },
          ],
        },
      ],
    };
    const layout = layoutIdKeySchema(key);
    assertNoLabelOverlap(layout);
    const [a, b] = layout.edges;
    assert.ok(tapBox(a).right <= tapBox(b).left, 'A entièrement à gauche de B');
  });

  it('K1 : aucune étiquette superposée sur une clé équilibrée de 16 espèces', () => {
    assertNoLabelOverlap(layoutIdKeySchema(balancedKey(3)));
  });

  it('K1 : une feuille voisine d’un sous-arbre ne recouvre pas ses étiquettes', () => {
    const key = sampleKey();
    key.couplets[1].leads.push({
      id: 202,
      statement: 'Écorce crevassée en longues lanières',
      next_couplet_id: null,
      plant_id: 8,
    });
    assertNoLabelOverlap(layoutIdKeySchema(key));
  });

  it('K8 : la vignette ne touche ni le parent ni l’enfant', () => {
    const layout = layoutIdKeySchema(balancedKey(1));
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const edge of layout.edges) {
      const parent = byId.get(edge.fromId);
      const child = byId.get(edge.toId);
      assert.ok(edge.imageBox.y > parent.y + 30, 'vignette sous la barre du parent');
      assert.ok(edge.labelBox.y + edge.labelBox.height < child.y - 28, 'étiquette au-dessus');
    }
  });

  it('K2 : un couplet atteint par deux propositions est placé une seule fois', () => {
    const L = (id, next, plant) => ({
      id,
      statement: `P${id}`,
      next_couplet_id: next,
      plant_id: plant,
    });
    const key = {
      couplets: [
        { id: 1, number: 1, leads: [L(11, 2, null), L(12, 3, null)] },
        { id: 2, number: 2, leads: [L(21, 3, null), L(22, null, 5)] },
        { id: 3, number: 3, leads: [L(31, null, 6), L(32, null, 7)] },
      ],
    };
    const layout = layoutIdKeySchema(key);
    const ids = layout.edges.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'identifiants d’arêtes uniques');
    assert.equal(layout.nodes.filter((n) => n.id === coupletNodeId(3)).length, 1);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const edge of layout.edges) {
      const to = byId.get(edge.toId);
      assert.ok(to, `cible de ${edge.id} placée`);
      assert.equal(edge.x2, to.x);
      assert.equal(edge.y2, to.y);
    }
    const ref = layout.nodes.find((n) => n.type === 'ref');
    assert.ok(ref, 'renvoi vers le couplet déjà placé');
    assert.equal(ref.coupletId, 3);
    // Parcours en profondeur : 1 → 2 → 3 place le couplet 3 ; la proposition 12
    // (1 → 3), rencontrée ensuite, devient le renvoi.
    assert.equal(ref.id, refNodeId(12));
    assertNoLabelOverlap(layout);
  });

  it('boucle de brouillon : pas de récursion infinie, renvoi vers l’ancêtre', () => {
    const key = {
      couplets: [
        {
          id: 1,
          number: 1,
          leads: [
            { id: 11, statement: 'A', next_couplet_id: 2 },
            { id: 12, statement: 'B', plant_id: 4 },
          ],
        },
        {
          id: 2,
          number: 2,
          leads: [
            { id: 21, statement: 'C', next_couplet_id: 1 },
            { id: 22, statement: 'D', plant_id: 5 },
          ],
        },
      ],
    };
    const layout = layoutIdKeySchema(key);
    assert.ok(layout.nodes.some((n) => n.type === 'ref' && n.coupletId === 1));
  });

  it('K12 : proposition incomplète visible et inerte, couplets non reliés listés', () => {
    const key = {
      couplets: [
        {
          id: 1,
          number: 1,
          leads: [
            { id: 11, statement: 'A', next_couplet_id: null, plant_id: null },
            { id: 12, statement: 'B', next_couplet_id: 99, plant_id: null },
            { id: 13, statement: 'C', plant_id: 4 },
          ],
        },
        { id: 5, number: 4, leads: [] },
      ],
    };
    const layout = layoutIdKeySchema(key);
    const missing = layout.nodes.filter((n) => n.type === 'missing');
    assert.deepEqual(missing.map((n) => n.id).sort(), [missingNodeId(11), missingNodeId(12)]);
    assert.equal(layout.edges.filter((e) => !e.usable).length, 2);
    assert.deepEqual(layout.orphanNumbers, [4]);
    assert.equal(isLeadUsable({ plant_id: 3 }), true);
    assert.equal(isLeadUsable({ next_couplet_id: 99 }, new Set([1])), false);
    assert.equal(isLeadUsable({}), false);
  });
});
