'use strict';

/**
 * Outils de domaine `foretmap_maps`, `foretmap_visit` et `foretmap_plans` (lot D3) : lectures,
 * effets métier des écritures par le pont (géométrie et coordonnées réécrites, notes et liens,
 * photos, catégories, parcours, registre, calage GPS, fiche de visite qui comble la
 * couverture), rotation du code d'accès du plan vérifiée par la vraie route d'entrée,
 * domaine désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const fm = require('./helpers/fmFixtures');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let token;
let mapId;
let plant;
const snapshots = [];

const call = (name, args) => fx.callTool(app, token, name, args);

function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  mapId = (await fm.createMap({ id: `mp${U}`, label: `Carte MCP ${U}` })).id;
  plant = await fm.createPlant({ name: `Chêne ${U}` });
  for (const key of ['ui.plan.access_mode', 'security.plan_access_code_hash']) {
    snapshots.push(await snapshotSetting(key));
  }
});

test.after(async () => {
  for (const s of snapshots) await restoreSetting(s);
  await execute('DELETE FROM map_routes WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM location_categories WHERE map_id = ?', [mapId]);
  await execute(
    "DELETE FROM visit_media WHERE target_type = 'zone' AND target_id IN (SELECT id FROM visit_zones WHERE map_id = ?)",
    [mapId],
  );
  await execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM plants WHERE id = ?', [plant.id]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('lieux : créer, lire, géométrie et coordonnées, notes et liens, photos, supprimer', async () => {
  const maps = ok(await call('foretmap_maps', { action: 'list_maps' }));
  assert.ok(maps.some((m) => m.id === mapId));
  const zone = ok(
    await call('foretmap_maps', {
      action: 'place_create',
      kind: 'zone',
      data: {
        map_id: mapId,
        name: `Mare ${U}`,
        points: [
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 20, yp: 20 },
        ],
        species_ids: [plant.id],
      },
    }),
  );
  const marker = ok(
    await call('foretmap_maps', {
      action: 'place_create',
      kind: 'marker',
      data: { map_id: mapId, label: `Nichoir ${U}`, x_pct: 40, y_pct: 40 },
    }),
  );
  const places = ok(await call('foretmap_maps', { action: 'places', map_id: mapId }));
  assert.equal(places.zones.length, 1);
  assert.equal(places.markers[0].name, `Nichoir ${U}`);

  ok(
    await call('foretmap_maps', {
      action: 'place_update',
      kind: 'zone',
      place_id: zone.id,
      data: {
        points: [
          { xp: 50, yp: 50 },
          { xp: 60, yp: 50 },
          { xp: 60, yp: 60 },
          { xp: 50, yp: 60 },
        ],
      },
    }),
  );
  const zrow = await queryOne('SELECT points FROM zones WHERE id = ?', [zone.id]);
  assert.equal(JSON.parse(zrow.points).length, 4, 'géométrie réécrite');
  const bad = await call('foretmap_maps', {
    action: 'place_update',
    kind: 'zone',
    place_id: zone.id,
    data: { points: [{ xp: 1, yp: 1 }] },
  });
  assert.equal(bad.isError, true, 'polygone invalide refusé par le service');
  ok(
    await call('foretmap_maps', {
      action: 'place_update',
      kind: 'marker',
      place_id: marker.id,
      data: { x_pct: 75.5, y_pct: 12 },
    }),
  );
  const m = ok(
    await call('foretmap_maps', {
      action: 'place_get',
      kind: 'marker',
      place_id: marker.id,
      map_id: mapId,
    }),
  );
  assert.equal(Number(m.x_pct), 75.5);

  ok(
    await call('foretmap_maps', {
      action: 'place_notes',
      kind: 'zone',
      place_id: zone.id,
      notes: [{ title: 'Sécurité', body: 'Berges glissantes' }],
      links: [{ label: 'Fiche mare', url: 'https://example.org/mare' }],
    }),
  );
  const z = ok(
    await call('foretmap_maps', { action: 'place_get', kind: 'zone', place_id: zone.id }),
  );
  assert.equal(z.notes.length, 1);
  assert.equal(z.links[0].label, 'Fiche mare');

  const photo = ok(
    await call('foretmap_maps', {
      action: 'place_photo_write',
      kind: 'zone',
      place_id: zone.id,
      op: 'add',
      image_data: PNG_1PX,
      caption: 'Vue',
    }),
  );
  const photos = ok(
    await call('foretmap_maps', { action: 'place_photos', kind: 'zone', place_id: zone.id }),
  );
  assert.equal(photos.length, 1);
  const wrongOp = await call('foretmap_maps', {
    action: 'place_photo_write',
    kind: 'zone',
    place_id: zone.id,
    op: 'georef',
  });
  assert.equal(wrongOp.isError, true, 'op hors de l’action refusée');
  ok(
    await call('foretmap_maps', {
      action: 'place_photo_write',
      kind: 'zone',
      place_id: zone.id,
      op: 'delete',
      photo_id: photo.id,
    }),
  );

  const inv = ok(await call('foretmap_maps', { action: 'inventory', map_id: mapId }));
  assert.equal(inv.items[0].species[0].plant_id, plant.id);

  ok(await call('foretmap_maps', { action: 'place_delete', kind: 'marker', place_id: marker.id }));
  assert.equal(await queryOne('SELECT id FROM map_markers WHERE id = ?', [marker.id]), undefined);
});

test('catégories, parcours, registre, calage GPS', async () => {
  const cat = ok(
    await call('foretmap_maps', {
      action: 'category_write',
      op: 'create',
      data: { label: `Points d’eau ${U}`, map_id: mapId },
    }),
  );
  ok(
    await call('foretmap_maps', {
      action: 'category_write',
      op: 'update',
      category_id: cat.id,
      data: { label: `Eau ${U}` },
    }),
  );
  const cats = ok(await call('foretmap_maps', { action: 'categories', map_id: mapId }));
  assert.ok(cats.some((c) => c.id === cat.id && c.label === `Eau ${U}`));
  ok(await call('foretmap_maps', { action: 'category_write', op: 'delete', category_id: cat.id }));

  const zone = await fm.createZone({ mapId, name: `Verger ${U}` });
  const route = ok(
    await call('foretmap_maps', {
      action: 'route_write',
      op: 'create',
      data: {
        title: `Parcours ${U}`,
        map_id: mapId,
        steps: [{ target_type: 'zone', target_id: zone.id, step_text: 'Observer' }],
      },
    }),
  );
  const routes = ok(await call('foretmap_maps', { action: 'routes', map_id: mapId }));
  const listed = routes.find((r) => r.id === route.id);
  assert.equal(listed.steps.length, 1);
  ok(await call('foretmap_maps', { action: 'route_write', op: 'delete', route_id: route.id }));

  // Registre : notes de site (crée la ligne), puis statut ; lecture par la carte.
  ok(
    await call('foretmap_maps', {
      action: 'registry_write',
      map_id: mapId,
      plant_id: plant.id,
      site_notes: 'Trois sujets adultes',
      presence_status: 'resident',
    }),
  );
  const reg = ok(await call('foretmap_maps', { action: 'registry', map_id: mapId }));
  assert.ok(reg.species.some((s) => Number(s.plant_id ?? s.id) === Number(plant.id)));

  const geo = ok(
    await call('foretmap_maps', {
      action: 'settings_write',
      op: 'georef',
      map_id: mapId,
      anchors: [
        { xp: 0, yp: 0, lat: 33.5731, lng: -7.5898 },
        { xp: 100, yp: 0, lat: 33.5731, lng: -7.5888 },
        { xp: 0, yp: 100, lat: 33.5723, lng: -7.5898 },
      ],
      gps_enabled: true,
      heading_up_enabled: true,
      scale_compass_enabled: true,
    }),
  );
  assert.ok(geo);
  const row = await queryOne(
    'SELECT gps_enabled, heading_up_enabled, geo_anchors_json FROM maps WHERE id = ?',
    [mapId],
  );
  assert.equal(Number(row.gps_enabled), 1);
  assert.equal(Number(row.heading_up_enabled), 1, 'orientation boussole active');
  assert.equal(JSON.parse(row.geo_anchors_json).length, 3);
  ok(
    await call('foretmap_maps', {
      action: 'settings_write',
      op: 'update',
      map_id: mapId,
      data: { label: `Carte renommée ${U}` },
    }),
  );
  assert.equal(
    (await queryOne('SELECT label FROM maps WHERE id = ?', [mapId])).label,
    `Carte renommée ${U}`,
  );
});

test('visite : fiche créée, couverture comblée, médias, contenu, mascottes, stats', async () => {
  const before = ok(await call('foretmap_visit', { action: 'coverage', map_id: mapId }));
  const vz = ok(
    await call('foretmap_visit', {
      action: 'place_write',
      kind: 'zone',
      op: 'create',
      data: {
        map_id: mapId,
        name: `Potager ${U}`,
        points: [
          { xp: 70, yp: 70 },
          { xp: 80, yp: 70 },
          { xp: 80, yp: 80 },
        ],
      },
    }),
  );
  ok(
    await call('foretmap_visit', {
      action: 'place_write',
      kind: 'zone',
      op: 'update',
      place_id: vz.id,
      data: { short_description: 'Légumes de saison cultivés par les classes' },
    }),
  );
  const after = ok(await call('foretmap_visit', { action: 'coverage', map_id: mapId }));
  assert.equal(after.zones.published_with_text, before.zones.published_with_text + 1);
  assert.ok(!after.zones.without_text.some((p) => p.id === vz.id));

  const media = ok(
    await call('foretmap_visit', {
      action: 'media_write',
      op: 'add',
      target_type: 'zone',
      target_id: vz.id,
      image_url: 'https://example.org/potager.jpg',
      caption: 'Le potager',
    }),
  );
  const content = ok(await call('foretmap_visit', { action: 'content', map_id: mapId }));
  const z = content.zones.find((p) => p.id === vz.id);
  assert.equal(z.media, 1);
  assert.match(z.short_description, /Légumes/);
  ok(await call('foretmap_visit', { action: 'media_write', op: 'delete', media_id: media.id }));

  const packs = ok(await call('foretmap_visit', { action: 'mascot_packs' }));
  assert.ok(Array.isArray(packs.packs));
  if (packs.packs[0]) {
    const one = ok(
      await call('foretmap_visit', { action: 'mascot_packs', pack_id: packs.packs[0].id }),
    );
    assert.equal(one.id, packs.packs[0].id);
  }
  const stats = await call('foretmap_visit', { action: 'stats' });
  assert.equal(stats.isError, false, stats.text);
  // La Visite reflète la carte : un lieu se supprime depuis la carte, pas depuis la Visite.
  const refused = await call('foretmap_visit', {
    action: 'place_write',
    kind: 'zone',
    op: 'delete',
    place_id: vz.id,
  });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /409/);
  ok(await call('foretmap_maps', { action: 'place_delete', kind: 'zone', place_id: vz.id }));
  assert.equal(await queryOne('SELECT id FROM visit_zones WHERE id = ?', [vz.id]), undefined);
});

test('plans : contenu, lieux, réglages, champ e-nov d’un lieu, rotation du code', async () => {
  ok(
    await call('foretmap_plans', {
      action: 'set_setting',
      key: 'ui.plan.access_mode',
      value: 'public',
    }),
  );
  const content = await call('foretmap_plans', { action: 'content', surface: 'plan' });
  assert.equal(content.isError, false, content.text);
  const places = ok(await call('foretmap_plans', { action: 'places', surface: 'plan' }));
  assert.ok(Array.isArray(places.items));
  const settings = ok(await call('foretmap_plans', { action: 'settings', surface: 'plan' }));
  assert.ok(settings.items.some((s) => s.key === 'ui.plan.access_mode'));
  const outside = await call('foretmap_plans', {
    action: 'set_setting',
    key: 'mcp.enabled',
    value: false,
  });
  assert.equal(outside.isError, true, 'clé hors des plans refusée');

  const zone = await fm.createZone({ mapId, name: `Atelier ${U}` });
  ok(
    await call('foretmap_plans', {
      action: 'place_update',
      kind: 'zone',
      place_id: zone.id,
      enov_description: 'Fablab ouvert aux élèves',
      search_aliases: ['fablab', 'atelier numérique'],
    }),
  );
  const zr = await queryOne('SELECT enov_description, search_aliases FROM zones WHERE id = ?', [
    zone.id,
  ]);
  assert.equal(zr.enov_description, 'Fablab ouvert aux élèves');
  assert.match(String(zr.search_aliases), /fablab/);

  // Rotation : le plan fermé par code n'accepte que le nouveau code, renvoyé une seule fois.
  ok(
    await call('foretmap_plans', {
      action: 'set_setting',
      key: 'ui.plan.access_mode',
      value: 'code',
    }),
  );
  const rot = ok(await call('foretmap_plans', { action: 'rotate_code', surface: 'plan' }));
  assert.match(rot.nouveau_code, /^[A-HJ-NP-Z2-9]{12,}$/);
  const audit = await queryOne(
    "SELECT details, payload_json FROM audit_log WHERE action = 'settings_update' AND target_id = 'security.plan_access_code_hash' ORDER BY id DESC LIMIT 1",
  );
  assert.ok(!JSON.stringify(audit).includes(rot.nouveau_code), 'code jamais journalisé');
  await request(app).post('/api/plan/access').send({ code: 'MAUVAISCODE99' }).expect(401);
  const entry = await request(app)
    .post('/api/plan/access')
    .send({ code: rot.nouveau_code })
    .expect(200);
  assert.equal(entry.body.ok, true);
  assert.equal(entry.body.required, true);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'maps,plans';
  const tools = await fx.listTools(app, token);
  assert.ok(!tools.includes('foretmap_maps'));
  assert.ok(!tools.includes('foretmap_plans'));
  assert.ok(tools.includes('foretmap_visit'));
  const r = await call('foretmap_maps', { action: 'list_maps' });
  assert.equal(r.isError, true);
});
