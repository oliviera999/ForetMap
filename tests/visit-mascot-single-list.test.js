'use strict';

/**
 * **Une seule liste de mascottes** — étape 3 de la fusion catalogue / packs
 * (`docs/AUDIT_MASCOTTES_2026-08.md`, piste P3).
 *
 * L'étape 2 a fait des mascottes livrées des lignes de `visit_mascot_packs`. L'étape 3 en tire
 * les conséquences côté usage, et referme le défaut d'origine du signalement — « la mascotte
 * importée n'est pas utilisable dans la carte ou les visites, j'ai une liste figée à la place ».
 *
 * Trois propriétés sont vérifiées ici, chacune fermant une panne silencieuse :
 *
 * 1. **La liste figée n'existe plus.** `ui.visit.mascot.allowed_ids` était une liste blanche
 *    d'identifiants : posée un jour, elle ignorait toute mascotte ajoutée ensuite. Elle est
 *    retirée du registre des réglages — donc irréinscriptible — et la restriction en cours est
 *    reportée sur `is_published` au démarrage.
 * 2. **Dépublier masque vraiment.** Le repli catalogue de l'étape 2 protège d'un semis raté ;
 *    mal borné, il ramènerait aussitôt toute livrée qu'on vient de retirer de la visite, et le
 *    geste n'aurait aucun effet visible.
 * 3. **Réinitialiser rend l'état d'origine, et supprimer une livrée est refusé.** Accepter la
 *    suppression donnerait une réussite qui s'annule d'elle-même : le semis la recrée au
 *    démarrage suivant.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  seedBuiltinMascotPacks,
  buildBuiltinMascotPacks,
  UNRENDERABLE_ALIGNED_KEY,
} = require('../lib/visitMascotBuiltinSeed');
const {
  migrateVisitMascotVisibilityToColumn,
  ALLOWED_KEY,
} = require('../lib/visitMascotVisibility');
const {
  listVisitMascotRegistry,
  listStaticVisitMascotEntries,
} = require('../lib/visitMascotRegistry');
const { buildMascotPackZipBuffer } = require('../lib/mascotPackArchive');

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  await seedBuiltinMascotPacks();
});

/** Jeton d'un compte doté de `visit.manage` — la permission du studio. */
async function studioToken() {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id && role?.id, 'compte admin de test introuvable');
  await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
    'visit.manage',
    'visit.manage',
    'Permission auto-seed tests',
  ]);
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    role.id,
    'visit.manage',
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, role.id],
  );
  return await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: role.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
}

/** Une ligne semée, publiée, choisie au hasard stable (la première par identifiant). */
async function uneLivree() {
  const row = await queryOne(
    "SELECT * FROM visit_mascot_packs WHERE origin = 'builtin' ORDER BY catalog_id ASC LIMIT 1",
  );
  assert.ok(row, 'aucune mascotte livrée semée');
  return row;
}

// ---------------------------------------------------------------------------
// Schéma en retard : le studio doit le dire, pas rendre « Erreur serveur »
// ---------------------------------------------------------------------------

test('colonne `origin` absente : le studio nomme la migration au lieu d’un 500 muet', async () => {
  // Le serveur **n'applique pas les migrations au démarrage** : `initDatabase()` ne fait qu'un
  // ping, et `initSchema()` — donc la migration 198 — ne tourne que via `npm run db:migrate`.
  // Un déploiement qui remplace les fichiers sans jouer cette étape met le studio devant un
  // schéma en retard, et `SELECT … origin …` échoue en `ER_BAD_FIELD_ERROR`.
  //
  // Sans mappage, ça retombait sur le 500 générique : « Erreur serveur [requête … ] » — un
  // message qui ne dit ni ce qui manque ni quoi faire. C'est exactement le reproche fait à ce
  // système. On vérifie ici que la réponse nomme la colonne et la commande.
  const token = await studioToken();
  await execute('ALTER TABLE visit_mascot_packs DROP COLUMN origin');
  try {
    const res = await request(app)
      .get('/api/visit/mascot-packs')
      .set('Authorization', `Bearer ${token}`)
      .expect(503);
    assert.equal(res.body?.code, 'visit_mascot_packs_schema_outdated');
    assert.match(String(res.body?.error || ''), /origin/);
    assert.match(String(res.body?.error || ''), /db:migrate/);
    assert.doesNotMatch(String(res.body?.error || ''), /^Erreur serveur$/);
  } finally {
    // Recréer la colonne remet **toutes** les lignes à `custom` : le semis ne les rattrape pas
    // (elles existent déjà, il ne réécrit rien). Sans cette remise en état, le fichier laissait
    // seize mascottes livrées déguisées en mascottes créées ici, et huit tests tombaient
    // ensuite pour une raison sans rapport avec ce qu'ils vérifient.
    await execute(
      "ALTER TABLE visit_mascot_packs ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'custom'",
    );
    const { packs } = buildBuiltinMascotPacks(await listStaticVisitMascotEntries());
    for (const { catalogId } of packs) {
      await execute("UPDATE visit_mascot_packs SET origin = 'builtin' WHERE catalog_id = ?", [
        catalogId,
      ]);
    }
    await seedBuiltinMascotPacks();
  }
});

// ---------------------------------------------------------------------------
// La liste unique
// ---------------------------------------------------------------------------

test('la liste du studio porte les livrées **et** les mascottes créées ici, avec leur origine', async () => {
  const token = await studioToken();
  const perso = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO visit_mascot_packs (id, catalog_id, label, pack_json, is_published, origin, created_at, updated_at, created_by)
     VALUES (?, ?, 'Mascotte de test', '{}', 0, 'custom', ?, ?, NULL)`,
    [perso, `srv-${perso}`, now, now],
  );
  try {
    const res = await request(app)
      .get('/api/visit/mascot-packs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const packs = res.body?.packs || [];
    const origines = new Set(packs.map((p) => p.origin));
    assert.ok(origines.has('builtin'), 'aucune mascotte livrée dans la liste du studio');
    assert.ok(origines.has('custom'), 'aucune mascotte créée ici dans la liste du studio');
    // Sans `origin` sérialisé, le studio ne peut pas distinguer les deux gestes possibles
    // (réinitialiser / supprimer) et proposerait le mauvais.
    assert.ok(
      packs.every((p) => p.origin === 'builtin' || p.origin === 'custom'),
      'une ligne sans origine exploitable',
    );
  } finally {
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [perso]);
  }
});

// ---------------------------------------------------------------------------
// Masquer : dépublier, et non plus une liste blanche
// ---------------------------------------------------------------------------

test('dépublier une mascotte livrée la retire vraiment du sélecteur', async () => {
  // Le repli catalogue de l'étape 2 la ramènerait si son périmètre n'était pas borné aux
  // mascottes **sans ligne**. Le geste de masquage n'aurait alors aucun effet visible.
  const livree = await uneLivree();
  const avant = await listVisitMascotRegistry();
  assert.ok(avant.some((e) => e.id === livree.catalog_id));

  await execute('UPDATE visit_mascot_packs SET is_published = 0 WHERE id = ?', [livree.id]);
  try {
    const apres = await listVisitMascotRegistry();
    assert.equal(
      apres.some((e) => e.id === livree.catalog_id),
      false,
      `${livree.catalog_id} est toujours proposée après avoir été retirée de la visite`,
    );
    assert.equal(apres.length, avant.length - 1);
  } finally {
    await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE id = ?', [livree.id]);
  }
});

test('une mascotte sans ligne reste servie par le catalogue — le filet de l’étape 2 tient', async () => {
  // Les deux règles doivent coexister : ligne présente, elle seule décide ; ligne absente, le
  // catalogue parle. Confondre les deux casse soit le masquage, soit le filet.
  const livree = await uneLivree();
  await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [livree.id]);
  try {
    const registre = await listVisitMascotRegistry();
    const relais = registre.find((e) => e.id === livree.catalog_id);
    assert.ok(relais, `${livree.catalog_id} a disparu du sélecteur sans sa ligne`);
    assert.equal(relais.source, 'catalog');
  } finally {
    await seedBuiltinMascotPacks();
  }
});

test('une mascotte retirée de la visite n’est plus choisissable comme préférence', async () => {
  const token = await studioToken();
  const livree = await uneLivree();
  await execute('UPDATE visit_mascot_packs SET is_published = 0 WHERE id = ?', [livree.id]);
  try {
    await request(app)
      .put('/api/visit/mascot-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ visit_mascot_catalog_id: livree.catalog_id })
      .expect(400);
  } finally {
    await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE id = ?', [livree.id]);
  }
  // Republiée, elle redevient choisissable : le sélecteur et la validation lisent la même source.
  await request(app)
    .put('/api/visit/mascot-preference')
    .set('Authorization', `Bearer ${token}`)
    .send({ visit_mascot_catalog_id: livree.catalog_id })
    .expect(200);
  await request(app)
    .put('/api/visit/mascot-preference')
    .set('Authorization', `Bearer ${token}`)
    .send({ visit_mascot_catalog_id: '' })
    .expect(200);
});

// ---------------------------------------------------------------------------
// La bascule de l'ancienne liste blanche
// ---------------------------------------------------------------------------

async function poserLancienneRestriction(ids) {
  await execute(
    'INSERT INTO app_settings (`key`, scope, value_json, updated_at) VALUES (?, ?, ?, NOW()) ' +
      'ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)',
    [ALLOWED_KEY, 'public', JSON.stringify(ids.join(','))],
  );
}

test('la restriction héritée est reportée sur is_published, puis le réglage disparaît', async () => {
  await seedBuiltinMascotPacks();
  await execute("UPDATE visit_mascot_packs SET is_published = 1 WHERE origin = 'builtin'");
  const livrees = (
    await queryAll(
      "SELECT catalog_id FROM visit_mascot_packs WHERE origin = 'builtin' ORDER BY catalog_id ASC",
    )
  ).map((r) => String(r.catalog_id));
  assert.ok(livrees.length >= 3, 'trop peu de mascottes semées pour le test');
  const gardees = livrees.slice(0, 2);

  await poserLancienneRestriction(gardees);
  const bilan = await migrateVisitMascotVisibilityToColumn();

  assert.equal(bilan.applied, true, `bascule non appliquée : ${bilan.reason}`);
  const publiees = (
    await queryAll('SELECT catalog_id FROM visit_mascot_packs WHERE is_published = 1')
  ).map((r) => String(r.catalog_id));
  assert.deepEqual(publiees.sort(), [...gardees].sort(), 'la restriction n’a pas été reportée');
  // Le réglage effacé **est** la marque de passage : tant qu'il reste, la liste peut se refiger.
  assert.equal(
    await queryOne('SELECT `key` FROM app_settings WHERE `key` = ?', [ALLOWED_KEY]),
    undefined,
  );
  // Idempotent : une fois le réglage parti, il n'y a plus rien à traduire.
  assert.equal((await migrateVisitMascotVisibilityToColumn()).applied, false);

  await execute("UPDATE visit_mascot_packs SET is_published = 1 WHERE origin = 'builtin'");
});

test('une restriction qui viderait le sélecteur n’est pas appliquée', async () => {
  // Le refus qui compte : traduire à la lettre une restriction qui ne désigne aucune ligne
  // connue laisserait zéro mascotte proposée. Mieux vaut ne rien faire et le dire.
  await seedBuiltinMascotPacks();
  await execute("UPDATE visit_mascot_packs SET is_published = 1 WHERE origin = 'builtin'");
  await poserLancienneRestriction(['mascotte-dune-autre-installation']);
  try {
    const bilan = await migrateVisitMascotVisibilityToColumn();
    assert.equal(bilan.applied, false);
    assert.equal(bilan.reason, 'restriction_inconnue');
    const publiees = await queryAll('SELECT id FROM visit_mascot_packs WHERE is_published = 1');
    assert.ok(publiees.length > 0, 'le sélecteur a été vidé');
    // Le réglage est **conservé** : ne pas l'effacer laisse une seconde chance au démarrage
    // suivant, quand les lignes attendues existeront peut-être.
    assert.ok(await queryOne('SELECT `key` FROM app_settings WHERE `key` = ?', [ALLOWED_KEY]));
  } finally {
    await execute('DELETE FROM app_settings WHERE `key` = ?', [ALLOWED_KEY]);
  }
});

// ---------------------------------------------------------------------------
// Remplacer une mascotte livrée par une archive — le cas d'usage d'origine
// ---------------------------------------------------------------------------

test('importer une archive « en remplacement » sur une mascotte livrée la fait vraiment changer', async () => {
  // C'est le scénario qui avait motivé tout ce travail : une mascotte livrée n'a qu'une image
  // fixe, on veut lui donner de vraies animations par une archive. Avant la fusion, c'était
  // **impossible** — l'import forçait un identifiant `srv-…`, donc l'archive créait une
  // dix-septième mascotte à côté de la livrée, qui restait inchangée.
  //
  // Depuis que la livrée est une ligne comme une autre, l'import « en remplacement » la vise
  // directement, en gardant son identifiant de catalogue : c'est bien **elle** qui change.
  const token = await studioToken();
  const cible = await queryOne(
    "SELECT * FROM visit_mascot_packs WHERE origin = 'builtin' AND catalog_id = 'olu-spritesheet' LIMIT 1",
  );
  assert.ok(cible, 'la mascotte livrée OLU n’est pas semée');
  const packOrigine = JSON.parse(cible.pack_json);

  const archive = buildMascotPackZipBuffer({
    manifest: {
      format: 'foretmap-mascot-pack-archive',
      formatVersion: 1,
      variant: 'visit',
      source: { label: 'OLU animé' },
    },
    pack: {
      mascotPackVersion: 2,
      id: 'olu-spritesheet',
      label: 'OLU animé',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/olu-planches/frames/',
      frameWidth: 256,
      frameHeight: 256,
      fallbackSilhouette: 'olu',
      stateFrames: { idle: { files: ['idle-0.png', 'idle-1.png'], fps: 6 } },
    },
    assetFiles: [],
  });

  try {
    const res = await request(app)
      .post('/api/visit/mascot-packs/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'replace',
        target_pack_id: cible.id,
        archive: { fileName: 'olu.zip', fileDataBase64: archive.toString('base64') },
      })
      .expect(200);

    // La ligne visée est bien celle qui a changé, et elle reste une mascotte livrée.
    assert.equal(res.body?.catalog_id, 'olu-spritesheet');
    assert.equal(res.body?.origin, 'builtin');
    assert.equal(res.body?.pack?.renderer, 'sprite_cut');

    // Et surtout : c'est cette version-là que le sélecteur sert, sous le même identifiant.
    const registre = await listVisitMascotRegistry();
    const servie = registre.filter((e) => e.id === 'olu-spritesheet');
    assert.equal(servie.length, 1, 'OLU apparaît en double au sélecteur');
    assert.equal(servie[0].source, 'pack');
    assert.equal(servie[0].pack?.renderer, 'sprite_cut', 'le sélecteur sert encore l’ancienne');

    // Le filet : la réinitialisation défait l'import.
    await request(app)
      .post(`/api/visit/mascot-packs/${cible.id}/reset`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const apres = await queryOne('SELECT pack_json FROM visit_mascot_packs WHERE id = ?', [
      cible.id,
    ]);
    assert.deepEqual(JSON.parse(apres.pack_json), packOrigine, 'l’état d’origine n’est pas revenu');
  } finally {
    await execute('UPDATE visit_mascot_packs SET label = ?, pack_json = ? WHERE id = ?', [
      cible.label,
      cible.pack_json,
      cible.id,
    ]);
  }
});

// ---------------------------------------------------------------------------
// Les mascottes livrées sans fichier d'animation ne sont pas proposées
// ---------------------------------------------------------------------------

test('une mascotte livrée dont le fichier d’animation manque n’est pas proposée', async () => {
  // Dix des seize livrées déclarent `renderer: 'rive'` et pointent vers `/assets/rive/*.riv`.
  // Aucun de ces fichiers n'existe, et aucun n'a jamais été versionné. À l'écran, l'échec est
  // silencieux : `onLoadError` bascule sur la silhouette SVG, et le visiteur voit un dessin
  // parfaitement immobile sans rien pour le lui dire. Les proposer, c'est promettre dix
  // personnages animés dont pas un ne bougera.
  const { builtinAssetIsMissing } = require('../lib/visitMascotBuiltinSeed');
  const entries = await listStaticVisitMascotEntries();
  const sansFichier = entries.filter((e) => builtinAssetIsMissing(e)).map((e) => e.id);
  assert.ok(sansFichier.length >= 10, `attendu ≥ 10 sans fichier, vu ${sansFichier.length}`);

  // La règle se **mesure** : une entrée dont le fichier existe n'est jamais écartée.
  const avecFichier = entries.filter((e) => !builtinAssetIsMissing(e)).map((e) => e.id);
  assert.ok(avecFichier.includes('renard2-cut-spritesheet'));
  assert.ok(avecFichier.includes('olu-spritesheet'));

  // Et le sélecteur ne les propose pas.
  await execute("DELETE FROM visit_mascot_packs WHERE origin = 'builtin'");
  await execute('DELETE FROM app_settings WHERE `key` = ?', [UNRENDERABLE_ALIGNED_KEY]);
  const bilan = await seedBuiltinMascotPacks();
  assert.deepEqual(
    [...bilan.unpublished].sort(),
    [...sansFichier].sort(),
    'le semis n’a pas retenu exactement les mascottes sans fichier',
  );
  const registre = await listVisitMascotRegistry();
  const proposees = new Set(registre.map((e) => e.id));
  for (const id of sansFichier) {
    assert.equal(proposees.has(id), false, `${id} est proposée alors qu’elle ne peut pas rendre`);
  }
  assert.ok(proposees.has('renard2-cut-spritesheet'), 'la mascotte par défaut a disparu');
});

test('le rattrapage des installations déjà semées ne passe qu’une fois', async () => {
  // Deux exigences contradictoires : corriger les bases semées avant cette règle, sans jamais
  // reprendre la main sur un administrateur qui republie délibérément. D'où la marque de
  // passage — sans elle, on ne distingue pas « pas encore fait » de « fait, puis défait exprès ».
  const { alignUnrenderableBuiltinMascots } = require('../lib/visitMascotBuiltinSeed');
  await execute("DELETE FROM visit_mascot_packs WHERE origin = 'builtin'");
  await execute('DELETE FROM app_settings WHERE `key` = ?', [UNRENDERABLE_ALIGNED_KEY]);
  await seedBuiltinMascotPacks();
  // On remet l'état d'avant la règle : tout publié, aucune marque.
  await execute("UPDATE visit_mascot_packs SET is_published = 1 WHERE origin = 'builtin'");
  await execute('DELETE FROM app_settings WHERE `key` = ?', [UNRENDERABLE_ALIGNED_KEY]);

  const premier = await alignUnrenderableBuiltinMascots();
  assert.equal(premier.applied, true);
  assert.ok(premier.hidden.length >= 10, `retirées : ${premier.hidden.length}`);

  // Un administrateur republie délibérément l'une d'elles.
  const rendue = premier.hidden[0];
  await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE catalog_id = ?', [rendue]);

  const second = await alignUnrenderableBuiltinMascots();
  assert.equal(second.applied, false, 'le rattrapage a rejoué');
  assert.equal(second.reason, 'deja_aligne');
  const row = await queryOne('SELECT is_published FROM visit_mascot_packs WHERE catalog_id = ?', [
    rendue,
  ]);
  assert.equal(Number(row.is_published), 1, 'le rattrapage a défait un choix d’administrateur');
});

// ---------------------------------------------------------------------------
// Réinitialiser / supprimer
// ---------------------------------------------------------------------------

test('réinitialiser rend son état d’origine à une mascotte livrée, sans toucher sa publication', async () => {
  const token = await studioToken();
  const livree = await uneLivree();
  await execute(
    'UPDATE visit_mascot_packs SET label = ?, pack_json = ?, is_published = 0 WHERE id = ?',
    ['Défigurée', JSON.stringify({ mascotPackVersion: 2, id: livree.catalog_id }), livree.id],
  );

  const res = await request(app)
    .post(`/api/visit/mascot-packs/${livree.id}/reset`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(res.body?.label, livree.label, 'le libellé d’origine n’est pas revenu');
  assert.deepEqual(
    res.body?.pack,
    JSON.parse(livree.pack_json),
    'le pack d’origine n’est pas revenu',
  );
  // Réinitialiser rend l'apparence d'origine, **pas** la visibilité : republier une mascotte
  // qu'un administrateur venait de retirer serait une décision prise à sa place.
  assert.equal(res.body?.is_published, false, 'la réinitialisation a republié la mascotte');

  await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE id = ?', [livree.id]);
});

test('réinitialiser une mascotte créée ici est refusé : elle n’a pas d’origine', async () => {
  const token = await studioToken();
  const perso = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO visit_mascot_packs (id, catalog_id, label, pack_json, is_published, origin, created_at, updated_at, created_by)
     VALUES (?, ?, 'Perso', '{}', 0, 'custom', ?, ?, NULL)`,
    [perso, `srv-${perso}`, now, now],
  );
  try {
    const res = await request(app)
      .post(`/api/visit/mascot-packs/${perso}/reset`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    assert.equal(res.body?.code, 'visit_mascot_pack_not_builtin');
  } finally {
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [perso]);
  }
});

test('supprimer une mascotte livrée est refusé, et la réponse nomme quoi faire à la place', async () => {
  // Une suppression acceptée serait annulée par le semis au démarrage suivant : une réussite
  // qui ne dure pas est pire qu'un refus expliqué.
  const token = await studioToken();
  const livree = await uneLivree();
  const res = await request(app)
    .delete(`/api/visit/mascot-packs/${livree.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(409);
  assert.equal(res.body?.code, 'visit_mascot_pack_builtin');
  assert.match(String(res.body?.error || ''), /Retirez-la de la visite|réinitialisez/i);
  assert.ok(
    await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ?', [livree.id]),
    'la ligne a été supprimée malgré le refus',
  );
});

test('supprimer une mascotte créée ici reste possible', async () => {
  const token = await studioToken();
  const perso = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO visit_mascot_packs (id, catalog_id, label, pack_json, is_published, origin, created_at, updated_at, created_by)
     VALUES (?, ?, 'À supprimer', '{}', 0, 'custom', ?, ?, NULL)`,
    [perso, `srv-${perso}`, now, now],
  );
  await request(app)
    .delete(`/api/visit/mascot-packs/${perso}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(
    await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ?', [perso]),
    undefined,
  );
});
