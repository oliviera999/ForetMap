'use strict';

/**
 * Semis des **mascottes livrées** dans `visit_mascot_packs` — étape 2 de la fusion
 * catalogue / packs (`docs/AUDIT_MASCOTTES_2026-08.md`, piste P3).
 *
 * Le semis est la pièce la plus risquée de la fusion : il ne rate jamais à moitié. Ou bien il
 * vide le sélecteur, ou bien il double chaque mascotte — deux pannes bien visibles, et
 * découvertes en production. D'où une couverture en deux temps :
 *
 * - la **conversion** catalogue → pack, entièrement pure, vérifiée sur les seize entrées réelles ;
 * - le **semis** lui-même contre la base, pour ses trois propriétés : idempotent, respectueux
 *   d'une ligne éditée, et capable de re-semer une ligne supprimée (c'est ce qui rend
 *   « réinitialiser depuis l'origine » possible).
 *
 * Un piège rencontré pendant l'écriture, et figé ici : `created_by` est une clé étrangère vers
 * `users`. Un premier jet y posait la chaîne « system » sous `INSERT IGNORE` — la violation
 * devenait un avertissement muet, le semis annonçait « 16 insérées », et la table restait vide.
 * Le test `le semis écrit vraiment` compte les lignes plutôt que de croire le bilan.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  commonFramesBase,
  catalogEntryToPack,
  buildBuiltinMascotPacks,
  seedBuiltinMascotPacks,
} = require('../lib/visitMascotBuiltinSeed');
const { listStaticVisitMascotEntries } = require('../lib/visitMascotRegistry');

before(async () => {
  await initSchema();
});

// ---------------------------------------------------------------------------
// Conversion — pure
// ---------------------------------------------------------------------------

test('commonFramesBase trouve le préfixe commun, ou rien', () => {
  assert.equal(commonFramesBase(['/a/b/c/x.png', '/a/b/c/y.png']), '/a/b/c/');
  assert.equal(commonFramesBase(['/a/b/c/x.png', '/a/b/d/y.png']), '/a/b/');
  assert.equal(commonFramesBase(['/a/x.png']), '/a/');
  assert.equal(commonFramesBase([]), null);
  // Une URL externe n'a pas sa place dans une base commune de fichiers locaux.
  assert.equal(commonFramesBase(['https://exemple.test/x.png']), null);
});

test('les seize mascottes livrées se convertissent toutes en packs valides', async () => {
  const entries = await listStaticVisitMascotEntries();
  assert.ok(entries.length >= 16, `catalogue trop court : ${entries.length}`);

  const { packs, ignores } = buildBuiltinMascotPacks(entries);
  assert.deepEqual(ignores, [], `entrées écartées à la conversion : ${ignores.join(', ')}`);
  assert.equal(packs.length, entries.length);

  // Chaque pack produit doit passer la validation servie au runtime : semer un pack invalide
  // créerait une ligne morte, que rien ne signalerait.
  const { validateMascotPack } = await import('../src/utils/mascotPack.js');
  const invalides = [];
  for (const { catalogId, pack } of packs) {
    const res = validateMascotPack(pack, { relaxAssetPrefix: true });
    if (!res.ok) invalides.push(`${catalogId} : ${res.error.issues[0]?.message}`);
  }
  assert.deepEqual(invalides, [], `packs invalides : ${invalides.slice(0, 3).join(' | ')}`);
});

test('les trois moteurs sont représentés dans le semis', async () => {
  // Si un moteur disparaît du décompte, c'est que la conversion l'a silencieusement écarté —
  // et une famille entière de mascottes livrées cesserait d'être semée.
  const { packs } = buildBuiltinMascotPacks(await listStaticVisitMascotEntries());
  const parMoteur = {};
  for (const { pack } of packs) parMoteur[pack.renderer] = (parMoteur[pack.renderer] || 0) + 1;
  assert.ok(parMoteur.rive >= 10, `rive : ${parMoteur.rive}`);
  assert.ok(parMoteur.spritesheet >= 4, `spritesheet : ${parMoteur.spritesheet}`);
  assert.ok(parMoteur.sprite_cut >= 2, `sprite_cut : ${parMoteur.sprite_cut}`);
});

test('une entrée inexploitable est écartée et nommée, pas semée à moitié', () => {
  assert.equal(catalogEntryToPack(null), null);
  assert.equal(catalogEntryToPack({ id: 'x' }), null, 'sans renderer');
  assert.equal(catalogEntryToPack({ id: 'x', renderer: 'rive' }), null, 'rive sans bloc');
  assert.equal(catalogEntryToPack({ id: 'x', renderer: 'inconnu' }), null, 'moteur inconnu');

  const { packs, ignores } = buildBuiltinMascotPacks([
    { id: 'bon', renderer: 'rive', rive: { src: '/a.riv', stateAnimations: { idle: ['i'] } } },
    { id: 'casse', renderer: 'rive' },
  ]);
  assert.equal(packs.length, 1);
  assert.deepEqual(ignores, ['casse']);
});

// ---------------------------------------------------------------------------
// Semis — contre la base
// ---------------------------------------------------------------------------

/** Les identifiants semés au titre des mascottes livrées. */
async function idsSemes() {
  const rows = await queryAll(
    "SELECT catalog_id FROM visit_mascot_packs WHERE origin = 'builtin' ORDER BY catalog_id",
  );
  return rows.map((r) => String(r.catalog_id));
}

test('le semis écrit vraiment les lignes annoncées', async () => {
  // Le bilan n'est pas une preuve : un `INSERT IGNORE` sur une clé étrangère violée annoncerait
  // le même chiffre avec une table vide. On compte les lignes.
  await seedBuiltinMascotPacks();
  const semees = await idsSemes();
  const { packs } = buildBuiltinMascotPacks(await listStaticVisitMascotEntries());
  const attendus = packs.map((p) => p.catalogId).sort();
  const manquantes = attendus.filter((id) => !semees.includes(id));
  assert.deepEqual(manquantes, [], `mascottes annoncées mais absentes : ${manquantes.join(', ')}`);
});

test('les lignes semées sont marquées builtin, sans auteur, et publiées selon leur fichier', async () => {
  // La version d'avant lisait `WHERE origin = 'builtin' LIMIT 1` **sans ORDER BY** et exigeait
  // `is_published = 1`. Elle est tombée le jour où le semis a cessé de publier les mascottes
  // dont le fichier d'animation manque : la ligne arbitraire retenue par le `LIMIT` était l'une
  // d'elles. Un test qui dépend d'un ordre non garanti ne dit pas ce qu'il croit dire.
  //
  // Il pinne maintenant les **deux** branches, sur des identifiants nommés — ce qui le rend
  // plus fort qu'avant, pas plus permissif.
  const { builtinAssetIsMissing } = require('../lib/visitMascotBuiltinSeed');
  const entries = await listStaticVisitMascotEntries();

  const avecFichier = entries.find((e) => !builtinAssetIsMissing(e));
  const sansFichier = entries.find((e) => builtinAssetIsMissing(e));
  assert.ok(avecFichier && sansFichier, 'le catalogue ne couvre plus les deux cas');

  // **Le test possède son fixture.** Les fichiers de cette suite partagent une base et se
  // passent l'état de publication : un autre fichier peut avoir republié délibérément une
  // mascotte livrée. Mesurer la décision du **semis** exige donc de repartir de lignes
  // absentes, sinon on mesure ce que le voisin a laissé.
  for (const entry of [avecFichier, sansFichier]) {
    await execute('DELETE FROM visit_mascot_packs WHERE catalog_id = ?', [entry.id]);
  }
  await seedBuiltinMascotPacks();

  for (const [entry, publieeAttendue] of [
    [avecFichier, 1],
    [sansFichier, 0],
  ]) {
    const row = await queryOne(
      'SELECT origin, is_published, created_by FROM visit_mascot_packs WHERE catalog_id = ?',
      [entry.id],
    );
    assert.ok(row, `${entry.id} n’a pas été semée`);
    assert.equal(row.origin, 'builtin');
    // `created_by` est une FK vers `users` : une ligne semée n'a pas d'auteur.
    assert.equal(row.created_by, null);
    assert.equal(
      Number(row.is_published),
      publieeAttendue,
      publieeAttendue
        ? `${entry.id} a un fichier : elle doit être proposée`
        : `${entry.id} n’a pas de fichier d’animation : elle ne doit pas être proposée`,
    );
  }
});

test('le semis est idempotent', async () => {
  await seedBuiltinMascotPacks();
  const avant = (await idsSemes()).length;
  const bilan = await seedBuiltinMascotPacks();
  const apres = (await idsSemes()).length;
  assert.equal(apres, avant, 'le second semis a dupliqué des lignes');
  assert.deepEqual(bilan.inserted, [], 'le second semis a cru devoir insérer');
  assert.equal(bilan.failed.length, 0);
});

test('une ligne modifiée n’est pas écrasée par un nouveau semis', async () => {
  await seedBuiltinMascotPacks();
  const cible = (await idsSemes())[0];
  const marqueur = `Modifié ${Date.now()}`;
  await execute('UPDATE visit_mascot_packs SET label = ? WHERE catalog_id = ?', [marqueur, cible]);

  await seedBuiltinMascotPacks();

  const row = await queryOne('SELECT label FROM visit_mascot_packs WHERE catalog_id = ?', [cible]);
  assert.equal(row.label, marqueur, 'le semis a écrasé une ligne éditée par un prof');
});

test('une ligne supprimée est re-semée — c’est « réinitialiser depuis l’origine »', async () => {
  await seedBuiltinMascotPacks();
  const cible = (await idsSemes())[0];
  await execute('DELETE FROM visit_mascot_packs WHERE catalog_id = ?', [cible]);
  assert.equal(
    await queryOne('SELECT id FROM visit_mascot_packs WHERE catalog_id = ?', [cible]),
    undefined,
    'la ligne devait être supprimée',
  );

  const bilan = await seedBuiltinMascotPacks();
  assert.ok(bilan.inserted.includes(cible), `${cible} n’a pas été re-semée`);
  assert.ok(await queryOne('SELECT id FROM visit_mascot_packs WHERE catalog_id = ?', [cible]));
});

// ---------------------------------------------------------------------------
// Registre — la ligne semée gagne, le catalogue reste le filet
// ---------------------------------------------------------------------------

test('la ligne semée l’emporte sur son jumeau en code', async () => {
  // C'est tout l'objet de la fusion : la ligne en base est la version **éditable**. Si le
  // catalogue en code passait devant, un prof modifierait une mascotte livrée sans que rien
  // ne change à l'écran — en silence.
  await seedBuiltinMascotPacks();
  const { listVisitMascotRegistry } = require('../lib/visitMascotRegistry');
  const registre = await listVisitMascotRegistry();
  const semees = new Set(await idsSemes());
  const servisParLeCode = registre.filter((e) => semees.has(e.id) && e.source !== 'pack');
  assert.deepEqual(
    servisParLeCode.map((e) => e.id),
    [],
    'des mascottes semées sont encore servies par le catalogue en code',
  );
});

test('le registre ne double jamais une mascotte', async () => {
  await seedBuiltinMascotPacks();
  const { listVisitMascotRegistry } = require('../lib/visitMascotRegistry');
  const ids = (await listVisitMascotRegistry()).map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size, 'identifiants en double au registre');
});

test('le catalogue reprend le relais quand une ligne semée disparaît', async () => {
  // Le filet. Une entrée non semée — semis en échec, installation pas encore redémarrée —
  // doit rester proposée : un semis raté ne peut pas vider le sélecteur.
  await seedBuiltinMascotPacks();
  const { listVisitMascotRegistry } = require('../lib/visitMascotRegistry');
  const avant = await listVisitMascotRegistry();
  const cible = (await idsSemes())[0];

  await execute('DELETE FROM visit_mascot_packs WHERE catalog_id = ?', [cible]);
  const apres = await listVisitMascotRegistry();

  assert.equal(apres.length, avant.length, 'le sélecteur a perdu une mascotte');
  const relais = apres.find((e) => e.id === cible);
  assert.ok(relais, `${cible} a disparu du registre`);
  assert.equal(relais.source, 'catalog', 'le relais ne vient pas du catalogue livré');

  await seedBuiltinMascotPacks();
});

test('table vide : le sélecteur reste peuplé', async () => {
  // Le cas extrême du filet : aucune ligne semée du tout.
  await execute("DELETE FROM visit_mascot_packs WHERE origin = 'builtin'");
  const { listVisitMascotRegistry } = require('../lib/visitMascotRegistry');
  const registre = await listVisitMascotRegistry();
  assert.ok(registre.length >= 16, `sélecteur vidé : ${registre.length} mascotte(s)`);
  assert.ok(
    registre.every((e) => e.source === 'catalog' || e.source === 'pack'),
    'source inattendue',
  );
  await seedBuiltinMascotPacks();
});

after(async () => {
  // Les lignes semées appartiennent au schéma de test partagé : on ne les retire pas, les
  // autres suites peuvent légitimement s'attendre à les trouver.
});
