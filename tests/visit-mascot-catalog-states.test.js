'use strict';

/**
 * Invariants du **mapping d'états** du catalogue mascottes, et état des lieux des assets
 * livrés avec le dépôt. Voir `docs/MASCOT_NARRATEUR_OLU.md` §3.1a (lot 7).
 *
 * Deux régressions silencieuses sont visées :
 *
 * 1. **L'alias mort.** `resolveStateSpec` (`VisitMapMascotSpritesheet`) consulte `stateFrames`
 *    **avant** `stateAliases` : un alias dont la clé figure déjà dans `stateFrames` ne sert
 *    jamais. L'entrée OLU en portait six, dont trois identités (`spin -> spin`) — du code
 *    d'apparence utile qui ne s'exécutait pas.
 * 2. **L'asset fantôme.** Plusieurs entrées déclarent un renderer animé alors que leur fichier
 *    n'est pas versionné : elles sont proposées dans le sélecteur et ne peuvent que retomber
 *    sur la silhouette SVG. Ce n'est pas une panne (§4.1, niveau 3) mais c'est un écart, et il
 *    doit rester **conscient** : la liste est figée ici pour qu'aucune nouvelle n'apparaisse
 *    par accident, et pour qu'en retirer une soit une décision, pas un effet de bord.
 *
 * Aucune base de données requise.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_ROOT = path.join(__dirname, '..', 'public');

async function loadCatalog() {
  return import('../src/utils/visitMascotCatalog.js');
}

async function loadStates() {
  return import('../src/utils/visitMascotState.js');
}

/** Config d'animation d'une entrée, quel que soit son renderer. */
function animationConfig(entry) {
  return entry?.spritesheet || entry?.spriteCut || null;
}

/** Chemins `/assets/...` déclarés par une entrée, tous renderers confondus. */
function declaredAssetPaths(entry) {
  const found = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('/assets/')) found.add(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') return Object.values(value).forEach(walk);
  };
  walk(entry);
  return [...found];
}

/**
 * Entrées dont l'asset n'est pas versionné, à ce jour. Elles restent proposées : retirer une
 * entrée du sélecteur change ce que voient les profs (et ce que devient une mascotte déjà
 * choisie), donc c'est un arbitrage produit, pas un nettoyage de test.
 */
const KNOWN_MISSING_ASSET_ENTRIES = Object.freeze([
  'gnome-ambre-rive',
  'gnome-foret-rive',
  'gnome-punk-rive',
  'moss-rive',
  'olu-spritesheet',
  'scrap-rive',
  'seed-rive',
  'sprite-template',
  'spore-rive',
  'sprout-rive',
  'swarm-rive',
  'vine-rive',
]);

/**
 * États canoniques qu'OLU ne mappe pas : ajoutés au moteur (lot « comportements ») après
 * l'écriture de l'entrée, ils retombent sur `idle`. Les mapper reviendrait à décrire des
 * rangées d'une planche qui n'existe pas — le repli est assumé (§3.1a).
 */
const OLU_UNMAPPED_STATES = Object.freeze([
  'angry',
  'dance',
  'eat',
  'love',
  'point',
  'sad',
  'search',
  'sleep',
  'wave',
]);

test('catalogue : aucun alias d’état mort (stateFrames est consulté en premier)', async () => {
  const { getVisitMascotCatalog } = await loadCatalog();
  for (const entry of getVisitMascotCatalog()) {
    const config = animationConfig(entry);
    const aliases = config?.stateAliases;
    if (!aliases) continue;
    const frames = Object.keys(config.stateFrames || {});
    for (const key of Object.keys(aliases)) {
      assert.ok(
        !frames.includes(key),
        `${entry.id} : l’alias « ${key} » ne sert jamais, « ${key} » est déjà dans stateFrames`,
      );
    }
  }
});

test('catalogue : tout alias pointe vers un état réellement défini', async () => {
  const { getVisitMascotCatalog } = await loadCatalog();
  for (const entry of getVisitMascotCatalog()) {
    const config = animationConfig(entry);
    const aliases = config?.stateAliases;
    if (!aliases) continue;
    const frames = Object.keys(config.stateFrames || {});
    for (const [key, target] of Object.entries(aliases)) {
      assert.ok(
        frames.includes(target),
        `${entry.id} : l’alias « ${key} » vise « ${target} », absent de stateFrames`,
      );
    }
  }
});

test('catalogue : la liste des entrées sans asset versionné est celle attendue', async () => {
  const { getVisitMascotCatalog } = await loadCatalog();
  const missing = [];
  for (const entry of getVisitMascotCatalog()) {
    const absent = declaredAssetPaths(entry).some(
      (assetPath) => !fs.existsSync(path.join(PUBLIC_ROOT, assetPath)),
    );
    if (absent) missing.push(entry.id);
  }
  assert.deepStrictEqual(
    missing.sort(),
    [...KNOWN_MISSING_ASSET_ENTRIES].sort(),
    'la liste des mascottes sans asset livré a changé : décision à prendre, pas à subir',
  );
});

test('catalogue : une entrée sans asset garde une silhouette de repli', async () => {
  const { getVisitMascotById } = await loadCatalog();
  for (const id of KNOWN_MISSING_ASSET_ENTRIES) {
    const entry = getVisitMascotById(id);
    assert.ok(entry, `${id} : entrée introuvable`);
    assert.ok(
      typeof entry.fallbackSilhouette === 'string' && entry.fallbackSilhouette.length > 0,
      `${id} : sans asset ET sans silhouette, l’écran serait vide`,
    );
  }
});

test('OLU : les états non mappés sont ceux qu’on a décidé de laisser retomber sur idle', async () => {
  const { getVisitMascotSupportedStates } = await loadCatalog();
  const { VISIT_MASCOT_STATE } = await loadStates();
  const supported = getVisitMascotSupportedStates('olu-spritesheet');
  const unmapped = Object.values(VISIT_MASCOT_STATE)
    .filter((state) => !supported.includes(state))
    .sort();
  assert.deepStrictEqual(unmapped, [...OLU_UNMAPPED_STATES].sort());
});

test('OLU : le découpage supposé reste cohérent (rangées et cadences)', async () => {
  const { getVisitMascotById } = await loadCatalog();
  const sheet = getVisitMascotById('olu-spritesheet').spritesheet;
  assert.equal(sheet.frameWidth, 64);
  assert.equal(sheet.frameHeight, 64);
  for (const [state, spec] of Object.entries(sheet.stateFrames)) {
    assert.ok(Number.isInteger(spec.row) && spec.row >= 0, `${state} : rangée invalide`);
    assert.ok(Number.isInteger(spec.frames) && spec.frames >= 1, `${state} : frames invalides`);
    assert.ok(Number(spec.fps) >= 1, `${state} : cadence invalide`);
  }
  // Les états partageant une rangée doivent en lire le même nombre d'images : sinon deux
  // animations se chevaucheraient sur la planche.
  const framesByRow = new Map();
  for (const [state, spec] of Object.entries(sheet.stateFrames)) {
    const known = framesByRow.get(spec.row);
    if (known === undefined) framesByRow.set(spec.row, spec.frames);
    else
      assert.equal(
        spec.frames,
        known,
        `rangée ${spec.row} : « ${state} » lit ${spec.frames} images au lieu de ${known}`,
      );
  }
});
