'use strict';

/**
 * Invariants des **modèles catalogue** exposés au studio (`GET /api/visit/mascot-catalog/models`
 * et `…/:id/export.zip`).
 *
 * Deux défauts silencieux sont visés :
 *
 * 1. **Le figurant.** Douze des seize mascottes livrées retombent sur
 *    `buildSingleFrameMascotTemplate`, où les vingt et un états pointent la **même image**. Les
 *    présenter à égalité avec les quatre vraies, c'est promettre une animation qui n'existe pas —
 *    et laisser exporter un leurre sans un mot. Le drapeau `hasRealAnimation` se **mesure** plutôt
 *    que de se déclarer : une mascotte qui reçoit de vraies trames devient animée sans qu'on
 *    pense à tenir une liste à jour.
 * 2. **Le modèle introuvable.** Un identifiant absent de `VISIT_MASCOT_CATALOG_MODEL_META` reste
 *    clonable par appel direct mais n'apparaît nulle part dans le studio. C'était le cas de
 *    `gnome1`.
 *
 * Aucune base de données requise.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  listVisitMascotCatalogModels,
  visitMascotCatalogModelInfo,
  listVisitMascotCatalogTemplateIds,
  buildVisitCatalogPackTemplate,
} = require('../lib/visitMascotPackHelpers');
const {
  buildCatalogExportArchive,
  buildMascotPackZipBuffer,
  parseMascotPackZipBuffer,
} = require('../lib/mascotPackArchive');

/** Les quatre modèles qui portent de vraies trames. Les douze autres sont des figurants. */
const MODELES_ANIMES = [
  'olu-spritesheet',
  'gnome1',
  'renard2-cut-spritesheet',
  'fox-backpack-spritesheet',
];

test('chaque modèle listé a une fiche complète', () => {
  const models = listVisitMascotCatalogModels();
  assert.equal(models.length, listVisitMascotCatalogTemplateIds().length);
  for (const m of models) {
    assert.ok(m.id, 'fiche sans identifiant');
    assert.ok(m.label, `${m.id} : fiche sans libellé`);
    assert.ok(Number.isInteger(m.frameCount) && m.frameCount >= 1, `${m.id} : ${m.frameCount}`);
    assert.equal(m.hasRealAnimation, m.frameCount > 1, `${m.id} : drapeau incohérent`);
  }
});

test('les modèles animés le sont, les autres sont signalés comme figurants', () => {
  const models = listVisitMascotCatalogModels();
  const animes = models.filter((m) => m.hasRealAnimation).map((m) => m.id);
  assert.deepEqual(animes.sort(), [...MODELES_ANIMES].sort());
  // Le reste doit vraiment n'avoir qu'une image — sans quoi le badge ment dans l'autre sens.
  for (const m of models.filter((x) => !x.hasRealAnimation)) {
    assert.equal(m.frameCount, 1, `${m.id} : ${m.frameCount} trames mais signalé figurant`);
  }
});

test('un identifiant inconnu n’a pas de fiche', () => {
  assert.equal(visitMascotCatalogModelInfo('nexiste-pas'), null);
  assert.equal(visitMascotCatalogModelInfo(''), null);
  assert.equal(visitMascotCatalogModelInfo(null), null);
});

test('l’export d’un modèle animé produit une archive relue par le parseur d’import', () => {
  for (const id of MODELES_ANIMES) {
    const info = visitMascotCatalogModelInfo(id);
    const pack = buildVisitCatalogPackTemplate(id, id);
    const built = buildCatalogExportArchive({ catalogId: id, pack, modelInfo: info });
    const parsed = parseMascotPackZipBuffer(buildMascotPackZipBuffer(built));

    assert.equal(parsed.manifest.variant, 'visit', `${id} : variant`);
    assert.equal(parsed.manifest.source.origin, 'catalog-model', `${id} : origine`);
    assert.equal(parsed.manifest.source.has_real_animation, true, `${id} : drapeau manifest`);
    // `framesBase` doit être la forme portable, sinon l'import cherchera les PNG hors archive.
    assert.equal(parsed.pack.framesBase, './assets/', `${id} : framesBase non portable`);
    assert.ok(parsed.assets.size > 1, `${id} : ${parsed.assets.size} asset(s)`);

    const citees = new Set(Object.values(parsed.pack.stateFrames).flatMap((s) => s.files || []));
    const presentes = new Set([...parsed.assets.keys()].map((k) => k.replace(/^assets\//, '')));
    const manquantes = [...citees].filter((f) => !presentes.has(f));
    assert.deepEqual(manquantes, [], `${id} : trames citées et absentes`);
  }
});

test('l’export d’un figurant part quand même, mais avec son avertissement', () => {
  // Refuser l'export serait excessif : un modèle à image fixe reste un point de départ valable.
  // Mais l'avertissement doit voyager avec l'archive, sinon personne ne saura ce qu'il a reçu.
  const id = 'sprout-rive';
  const info = visitMascotCatalogModelInfo(id);
  assert.equal(info.hasRealAnimation, false, 'prémisse du test : sprout-rive est un figurant');

  const built = buildCatalogExportArchive({
    catalogId: id,
    pack: buildVisitCatalogPackTemplate(id, id),
    modelInfo: info,
  });
  const parsed = parseMascotPackZipBuffer(buildMascotPackZipBuffer(built));

  assert.equal(parsed.manifest.source.has_real_animation, false);
  assert.ok(
    parsed.manifest.warnings.some((w) => /sans animation propre/i.test(w)),
    `avertissement absent : ${JSON.stringify(parsed.manifest.warnings)}`,
  );
});

test('OLU exporte ses vingt et un états et ses 88 trames', () => {
  const info = visitMascotCatalogModelInfo('olu-spritesheet');
  assert.equal(info.frameCount, 88);
  const built = buildCatalogExportArchive({
    catalogId: 'olu-spritesheet',
    pack: buildVisitCatalogPackTemplate('olu-spritesheet', 'olu-spritesheet'),
    modelInfo: info,
  });
  const parsed = parseMascotPackZipBuffer(buildMascotPackZipBuffer(built));
  assert.equal(Object.keys(parsed.pack.stateFrames).length, 21);
  assert.equal(parsed.assets.size, 88);
  assert.deepEqual(built.warnings, []);
});
