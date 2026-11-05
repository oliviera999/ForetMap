'use strict';

/**
 * Outils de domaine `foretmap_species`, `foretmap_food_web` et `foretmap_id_keys` (lot D3) :
 * chaque lecture, effets métier des écritures par le pont (relecture des dangers remise à
 * zéro quand le danger change, photo « à confirmer » puis confirmée, registre de carte),
 * sources externes simulées (GBIF), domaine désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const fm = require('./helpers/fmFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
let token;
let mapId;
const plantIds = [];
const keyIds = [];

const call = (name, args) => fx.callTool(app, token, name, args);

function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  mapId = (await fm.createMap({ id: `sp${U}` })).id;
});

test.after(async () => {
  for (const id of keyIds) await execute('DELETE FROM id_keys WHERE id = ?', [id]);
  for (const id of plantIds) await execute('DELETE FROM plants WHERE id = ?', [id]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('fiche : créer, lire, modifier (danger → à relire), autres noms, sosies, supprimer', async () => {
  const a = ok(
    await call('foretmap_species', {
      action: 'create',
      data: { name: `Sureau ${U}`, scientific_name: 'Sambucus nigra', map_ids: [mapId] },
    }),
  );
  const b = ok(await call('foretmap_species', { action: 'create', data: { name: `Yèble ${U}` } }));
  plantIds.push(a.id, b.id);

  const list = ok(await call('foretmap_species', { action: 'list', map_id: mapId }));
  assert.equal(list.total, 1);
  assert.equal(list.items[0].name, `Sureau ${U}`);
  const found = ok(await call('foretmap_species', { action: 'list', q: 'sambucus nigra' }));
  assert.ok(found.items.some((p) => p.id === a.id));

  // Danger posé puis relu ; une modification du danger remet la relecture à zéro.
  ok(
    await call('foretmap_species', {
      action: 'update',
      plant_id: a.id,
      data: { toxicity_level: 'toxique' },
    }),
  );
  const reviewed = ok(await call('foretmap_species', { action: 'hazard_review', plant_id: a.id }));
  assert.equal(reviewed.hazard_reviewed, true);
  const unreviewed = ok(
    await call('foretmap_species', { action: 'list', hazard_unreviewed: true, limit: 5000 }),
  );
  assert.ok(!unreviewed.items.some((p) => p.id === a.id));
  ok(
    await call('foretmap_species', {
      action: 'update',
      plant_id: a.id,
      data: { toxicity_level: 'mortel' },
    }),
  );
  const after = ok(await call('foretmap_species', { action: 'get', plant_id: a.id }));
  assert.equal(Number(after.hazard_reviewed), 0, 'danger modifié : relecture annulée');

  const al = ok(
    await call('foretmap_species', {
      action: 'aliases',
      plant_id: a.id,
      names: ['Sureau noir', 'Arbre de Judas'],
    }),
  );
  assert.deepEqual(al.secondary_names.sort(), ['Arbre de Judas', 'Sureau noir']);
  const look = ok(
    await call('foretmap_species', {
      action: 'lookalikes',
      plant_id: a.id,
      lookalikes: [{ plant_id: b.id, note: 'Yèble : tige herbacée' }],
    }),
  );
  assert.equal(look.lookalikes[0].plant_id, b.id);
  // Symétrie tenue par le service : B voit A.
  const bView = ok(await call('foretmap_species', { action: 'get', plant_id: b.id }));
  assert.equal(bView.lookalikes[0].plant_id, a.id);

  ok(await call('foretmap_species', { action: 'delete', plant_id: b.id }));
  assert.equal(await queryOne('SELECT id FROM plants WHERE id = ?', [b.id]), undefined);
});

test('photos : lien « à confirmer », confirmation, crédit, ordre, retrait', async () => {
  const p = ok(await call('foretmap_species', { action: 'create', data: { name: `Ail ${U}` } }));
  plantIds.push(p.id);
  const add = ok(
    await call('foretmap_species', {
      action: 'photos',
      plant_id: p.id,
      op: 'add_url',
      photos: [
        { kind: 'photo_leaf', url: 'https://example.org/a.jpg' },
        { kind: 'photo_leaf', url: 'https://example.org/b.jpg', credit: 'X' },
      ],
    }),
  );
  assert.equal(add.inserted, 2);
  assert.ok(add.photos.every((ph) => ph.confirmed === false));
  const first = add.photos.find((ph) => ph.url.endsWith('/a.jpg'));

  const conf = ok(
    await call('foretmap_species', {
      action: 'photos',
      plant_id: p.id,
      op: 'confirm',
      photo_id: first.id,
    }),
  );
  assert.equal(conf.photo.confirmed, true);

  const credit = ok(
    await call('foretmap_species', {
      action: 'photos',
      plant_id: p.id,
      op: 'set_credit',
      photo_id: 'https://example.org/a.jpg',
      credit: 'Photographe',
      licence: 'CC BY 4.0',
    }),
  );
  const a = credit.photos.find((ph) => ph.url.endsWith('/a.jpg'));
  assert.equal(a.credit, 'Photographe');
  assert.equal(a.licence, 'CC BY 4.0');
  // La photo non confirmée le reste après la réécriture de la liste.
  assert.equal(credit.photos.find((ph) => ph.url.endsWith('/b.jpg')).confirmed, false);

  const reordered = ok(
    await call('foretmap_species', {
      action: 'photos',
      plant_id: p.id,
      op: 'reorder',
      kind: 'photo_leaf',
      photo_ids: ['https://example.org/b.jpg', 'https://example.org/a.jpg'],
    }),
  );
  const leaves = reordered.photos.filter((ph) => ph.kind === 'photo_leaf');
  assert.ok(leaves[0].url.endsWith('/b.jpg'));

  const removed = ok(
    await call('foretmap_species', {
      action: 'photos',
      plant_id: p.id,
      op: 'remove',
      photo_id: 'https://example.org/b.jpg',
    }),
  );
  assert.equal(removed.photos.length, 1);
});

test('registre : statut d’une espèce sur une carte (PATCH) et notes de site (PUT)', async () => {
  const p = ok(
    await call('foretmap_species', {
      action: 'create',
      data: { name: `Mésange ${U}`, map_ids: [mapId] },
    }),
  );
  plantIds.push(p.id);
  const r = ok(
    await call('foretmap_species', {
      action: 'registry_status',
      plant_id: p.id,
      map_id: mapId,
      presence_status: 'resident',
      validation_status: 'confirme_site',
      site_notes: 'Niche dans le vieux chêne',
    }),
  );
  assert.equal(r.registry.presence_status, 'resident');
  const row = await queryOne(
    'SELECT presence_status, validation_status, site_notes FROM map_species WHERE plant_id = ? AND map_id = ?',
    [p.id, mapId],
  );
  assert.equal(row.validation_status, 'confirme_site');
  assert.equal(row.site_notes, 'Niche dans le vieux chêne');
  // Retirer la carte de la fiche ne retire pas une présence confirmée (invariant du registre).
  ok(await call('foretmap_species', { action: 'update', plant_id: p.id, data: { map_ids: [] } }));
  assert.ok(
    await queryOne('SELECT 1 AS x FROM map_species WHERE plant_id = ? AND map_id = ?', [
      p.id,
      mapId,
    ]),
  );
  const down = await call('foretmap_species', {
    action: 'registry_status',
    plant_id: p.id,
    map_id: mapId,
    validation_status: 'attendu',
  });
  assert.equal(down.isError, true);
  assert.match(down.text, /409/);
});

test('GBIF et pré-saisie : lecture seule, sources externes simulées', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('api.gbif.org/v1/species/match')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            confidence: 97,
            scientificName: 'Rosa canina L.',
            canonicalName: 'Rosa canina',
            kingdom: 'Plantae',
            order: 'Rosales',
            family: 'Rosaceae',
            usageKey: 8395064,
            rank: 'SPECIES',
            matchType: 'EXACT',
          };
        },
      };
    }
    throw new Error(`URL inattendue: ${url}`);
  };
  try {
    const count = (await queryOne('SELECT COUNT(*) AS n FROM plants')).n;
    const g = await call('foretmap_species', { action: 'gbif_match', q: `rosa canina ${U}` });
    assert.equal(g.isError, false, g.text);
    const auto = ok(
      await call('foretmap_species', {
        action: 'autofill_preview',
        q: `rosa canina ${U}`,
        sources: 'gbif',
      }),
    );
    assert.equal(auto.fields.taxon_family, 'Rosaceae');
    assert.equal((await queryOne('SELECT COUNT(*) AS n FROM plants')).n, count, 'rien écrit');
  } finally {
    global.fetch = previousFetch;
  }
});

test('réseau trophique : types, créer, lister, modifier (fusion), supprimer', async () => {
  const types = ok(await call('foretmap_food_web', { action: 'types' }));
  assert.ok(types.types.length > 5);
  const fox = ok(
    await call('foretmap_species', { action: 'create', data: { name: `Renard ${U}` } }),
  );
  const hare = ok(
    await call('foretmap_species', { action: 'create', data: { name: `Lièvre ${U}` } }),
  );
  plantIds.push(fox.id, hare.id);
  const c = ok(
    await call('foretmap_food_web', {
      action: 'create',
      from_id: fox.id,
      to_id: hare.id,
      interaction_type: 'predation',
      description: 'Chasse nocturne',
      source_ref: 'Atlas 2020',
    }),
  );
  const dup = await call('foretmap_food_web', {
    action: 'create',
    from_id: fox.id,
    to_id: hare.id,
    interaction_type: 'predation',
  });
  assert.equal(dup.isError, true, 'doublon refusé par le noyau');
  const list = ok(await call('foretmap_food_web', { action: 'list', plant_id: fox.id }));
  assert.equal(list.total, 1);
  const up = ok(
    await call('foretmap_food_web', {
      action: 'update',
      interaction_id: c.id,
      evidence_level: 'observe_site',
    }),
  );
  assert.equal(up.evidence_level, 'observe_site');
  assert.equal(up.description, 'Chasse nocturne', 'champs non fournis conservés');
  assert.equal(up.source_ref, 'Atlas 2020');
  ok(await call('foretmap_food_web', { action: 'delete', interaction_id: c.id }));
  assert.equal(
    await queryOne('SELECT id FROM species_interactions WHERE id = ?', [c.id]),
    undefined,
  );
});

test('clés d’identification : clé, nœuds, refus sans couplet orphelin, publication', async () => {
  const leaf = ok(
    await call('foretmap_species', { action: 'create', data: { name: `Érable ${U}` } }),
  );
  plantIds.push(leaf.id);
  const key = ok(
    await call('foretmap_id_keys', {
      action: 'create_key',
      title: `Clé ${U}`,
      slug: `cle-${U}`,
    }),
  );
  keyIds.push(key.id);
  const full = ok(await call('foretmap_id_keys', { action: 'get', key: key.id }));
  const start = full.couplets[0];
  const n2 = ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      leads: [
        { statement: 'Feuilles lobées', plant_id: leaf.id },
        { statement: 'Feuilles entières', plant_id: leaf.id },
      ],
    }),
  );
  assert.equal(n2.created, true);
  ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      couplet_id: start.id,
      leads: [
        { statement: 'Arbre', next_couplet_id: n2.couplet.id },
        { statement: 'Herbe', plant_id: leaf.id },
      ],
    }),
  );
  const countCouplets = async () =>
    Number(
      (await queryOne('SELECT COUNT(*) AS n FROM id_key_couplets WHERE key_id = ?', [key.id])).n,
    );
  const before = await countCouplets();
  const unknown = await call('foretmap_id_keys', {
    action: 'upsert_node',
    key_id: key.id,
    leads: [
      { statement: 'A', plant_id: 999999999 },
      { statement: 'B', plant_id: leaf.id },
    ],
  });
  assert.equal(unknown.isError, true);
  assert.equal(await countCouplets(), before, 'couplet créé puis retiré après le refus');
  // Le numéro d'un couplet existant ne se modifie pas (aucune route).
  const renumber = await call('foretmap_id_keys', {
    action: 'upsert_node',
    key_id: key.id,
    couplet_id: n2.couplet.id,
    number: 7,
    leads: [
      { statement: 'A', plant_id: leaf.id },
      { statement: 'B', plant_id: leaf.id },
    ],
  });
  assert.equal(renumber.isError, true);
  const pub = ok(
    await call('foretmap_id_keys', { action: 'update_key', key_id: key.id, is_published: true }),
  );
  assert.ok(pub);
  const list = ok(await call('foretmap_id_keys', { action: 'list' }));
  assert.ok(list.items.some((k) => k.id === key.id && k.is_published));
  const spare = ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      leads: [
        { statement: 'C', plant_id: leaf.id },
        { statement: 'D', plant_id: leaf.id },
      ],
    }),
  );
  ok(
    await call('foretmap_id_keys', {
      action: 'delete_node',
      key_id: key.id,
      couplet_id: spare.couplet.id,
    }),
  );
  assert.equal(await countCouplets(), before);
  ok(await call('foretmap_id_keys', { action: 'delete_key', key_id: key.id }));
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'species';
  const tools = await fx.listTools(app, token);
  assert.ok(!tools.includes('foretmap_species'));
  assert.ok(tools.includes('foretmap_food_web'));
  const r = await call('foretmap_species', { action: 'list' });
  assert.equal(r.isError, true);
});
