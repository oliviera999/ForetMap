'use strict';

/**
 * Le format « mascot pack » décrit désormais **les trois moteurs** du catalogue —
 * `sprite_cut`, `spritesheet`, `rive` — et non plus le seul `sprite_cut`.
 *
 * C'est le verrou qui empêchait de fusionner catalogue et packs en un registre unique : onze
 * mascottes livrées sont `rive` et quatre `spritesheet` ; tant que le format ne savait pas les
 * décrire, elles ne pouvaient pas devenir des packs, et le catalogue en code restait un univers
 * parallèle (`docs/AUDIT_MASCOTTES_2026-08.md` §2.2 et P3).
 *
 * Trois régressions silencieuses sont visées :
 *
 * 1. **Le pack existant qui cesse de valider.** Ouvrir le format ne doit rien changer pour les
 *    packs `sprite_cut` déjà enregistrés — mêmes champs requis, mêmes refus.
 * 2. **Le pack à moitié converti.** Un pack qui annonce un moteur et porte les champs d'un autre
 *    doit être refusé : arbitrer en silence laisserait passer des packs dont personne ne saurait
 *    dire ce qu'ils rendent.
 * 3. **L'entrée catalogue muette.** `buildMascotCatalogEntry` doit loger la configuration sous la
 *    clé que lit `VisitMapMascotRenderer` (`spriteCut` / `spritesheet` / `rive`). Se tromper de
 *    clé ne lève rien : la mascotte retombe sur la silhouette SVG, sans message.
 *
 * Aucune base de données requise.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const COMMUN = { mascotPackVersion: 1, label: 'Exemple', fallbackSilhouette: 'gnome' };

const PACK_SPRITE_CUT = {
  ...COMMUN,
  id: 'exemple-cut',
  renderer: 'sprite_cut',
  framesBase: '/assets/mascots/exemple/frames/',
  frameWidth: 64,
  frameHeight: 64,
  stateFrames: { idle: { files: ['idle-0.png', 'idle-1.png'], fps: 4 } },
};

const PACK_SPRITESHEET = {
  ...COMMUN,
  id: 'exemple-sheet',
  renderer: 'spritesheet',
  spritesheet: {
    src: '/assets/mascots/exemple/sheet.png',
    frameWidth: 153,
    frameHeight: 160,
    stateFrames: {
      idle: { row: 0, frames: 3, fps: 3 },
      talk: { row: 2, col: 0, frames: 4, fps: 8 },
    },
  },
};

const PACK_RIVE = {
  ...COMMUN,
  id: 'exemple-rive',
  renderer: 'rive',
  rive: {
    src: '/assets/rive/exemple.riv',
    stateAnimations: { idle: ['idle', 'Idle', 'IDLE'], walking: ['move', 'Walk'] },
  },
};

async function mod() {
  return import('../src/utils/mascotPack.js');
}

async function parse(pack) {
  const { parseMascotPack } = await mod();
  return parseMascotPack(pack, { relaxAssetPrefix: true });
}

test('les trois moteurs valident', async () => {
  for (const [nom, pack] of [
    ['sprite_cut', PACK_SPRITE_CUT],
    ['spritesheet', PACK_SPRITESHEET],
    ['rive', PACK_RIVE],
  ]) {
    const res = await parse(pack);
    assert.ok(res.success, `${nom} refusé : ${res.success ? '' : res.error.issues[0]?.message}`);
    assert.equal(res.data.renderer, nom);
  }
});

test('un moteur sans ses champs propres est refusé, avec le champ nommé', async () => {
  const cas = [
    [{ ...PACK_SPRITE_CUT, framesBase: undefined }, 'framesBase'],
    [{ ...PACK_SPRITE_CUT, stateFrames: undefined }, 'stateFrames'],
    [{ ...PACK_SPRITESHEET, spritesheet: undefined }, 'spritesheet'],
    [{ ...PACK_RIVE, rive: undefined }, 'rive'],
  ];
  for (const [pack, champ] of cas) {
    const res = await parse(pack);
    assert.equal(res.success, false, `${pack.renderer} sans ${champ} aurait dû être refusé`);
    const messages = res.error.issues.map((i) => i.message).join(' | ');
    assert.match(messages, new RegExp(champ), `message sans le champ manquant : ${messages}`);
  }
});

test('porter les champs d’un autre moteur est refusé', async () => {
  // Un pack à moitié converti annonce un moteur et garde les champs de l'ancien. Arbitrer
  // silencieusement laisserait un pack dont personne ne peut dire ce qu'il rend.
  const melange = { ...PACK_RIVE, spritesheet: PACK_SPRITESHEET.spritesheet };
  const res = await parse(melange);
  assert.equal(res.success, false);
  assert.match(res.error.issues.map((i) => i.message).join(' | '), /réservé aux packs/);
});

test('un pack sprite_cut historique valide exactement comme avant', async () => {
  const { validateMascotPack } = await mod();
  const res = validateMascotPack(PACK_SPRITE_CUT, { relaxAssetPrefix: true });
  assert.ok(res.ok);
  assert.equal(res.renderer, 'sprite_cut');
  assert.ok(res.spriteCut, 'spriteCut absent : les appelants historiques le lisent');
  assert.deepEqual(res.spriteCut.stateFrames.idle.srcs, [
    '/assets/mascots/exemple/frames/idle-0.png',
    '/assets/mascots/exemple/frames/idle-1.png',
  ]);
});

test('expandMascotPackToSpriteCut ne rend une config que pour son moteur', async () => {
  const { expandMascotPackToSpriteCut } = await mod();
  assert.ok(expandMascotPackToSpriteCut(PACK_SPRITE_CUT));
  assert.equal(expandMascotPackToSpriteCut(PACK_SPRITESHEET), null);
  assert.equal(expandMascotPackToSpriteCut(PACK_RIVE), null);
});

test('la configuration d’animation suit le moteur', async () => {
  const { validateMascotPack } = await mod();
  const sheet = validateMascotPack(PACK_SPRITESHEET, { relaxAssetPrefix: true });
  assert.ok(sheet.ok);
  assert.equal(sheet.spriteCut, null, 'un pack spritesheet n’a pas de spriteCut');
  assert.equal(sheet.animation.src, '/assets/mascots/exemple/sheet.png');

  const rive = validateMascotPack(PACK_RIVE, { relaxAssetPrefix: true });
  assert.ok(rive.ok);
  assert.deepEqual(rive.animation.stateAnimations.idle, ['idle', 'Idle', 'IDLE']);
});

test('l’entrée catalogue loge la config sous la clé que lit le renderer', async () => {
  const { buildMascotCatalogEntry } =
    await import('../src/shared/mascot-pack/spriteCutCatalogEntry.js');
  const attendu = { sprite_cut: 'spriteCut', spritesheet: 'spritesheet', rive: 'rive' };
  for (const [renderer, cle] of Object.entries(attendu)) {
    const entry = buildMascotCatalogEntry({
      id: 'x',
      renderer,
      animation: { marqueur: true },
      fallbackSilhouette: 'olu',
    });
    assert.ok(entry, `${renderer} : aucune entrée`);
    assert.equal(entry.renderer, renderer);
    assert.deepEqual(entry[cle], { marqueur: true }, `${renderer} : config sous la mauvaise clé`);
  }
  assert.equal(buildMascotCatalogEntry({ id: 'x', renderer: 'inconnu', animation: {} }), null);
  assert.equal(buildMascotCatalogEntry({ id: 'x', renderer: 'rive', animation: null }), null);
});

test('framesBase ne concerne que sprite_cut — aller-retour serveur', async () => {
  // Deux défauts qui se cumulaient, et que seul le chemin **serveur** (`relax = false`)
  // révélait :
  //
  // 1. `framesBase` était normalisé pour tous les moteurs. Un pack `rive` n'en a pas ;
  //    `normalizeFramesBase(undefined)` rendait `'/'`, qui ne commence par aucun préfixe
  //    autorisé — quinze des seize mascottes livrées devenaient **inenregistrables**, refusées
  //    au nom d'un champ qu'elles n'ont pas.
  // 2. Ce `framesBase: '/'` fantôme était **écrit dans la ligne**. La relecture le refusait
  //    ensuite comme « champ réservé aux packs sprite_cut » : une ligne qu'on ne peut plus
  //    rouvrir.
  const { parseMascotPack } = await mod();
  const prefixes = { allowedFramesBasePrefixes: ['/assets/mascots/'] };

  for (const pack of [PACK_RIVE, PACK_SPRITESHEET]) {
    const res = parseMascotPack(pack, prefixes);
    assert.ok(res.success, `${pack.renderer} refusé côté serveur`);
    assert.equal(res.data.framesBase, undefined, `${pack.renderer} : framesBase fantôme`);
    // L'aller-retour : ce qui est écrit doit pouvoir être relu.
    assert.ok(parseMascotPack(res.data, prefixes).success, `${pack.renderer} : ligne illisible`);
  }

  // Et le garde-fou de `sprite_cut` reste entier : hors préfixe autorisé, c'est refusé.
  const horsPrefixe = { ...PACK_SPRITE_CUT, framesBase: '/ailleurs/' };
  assert.equal(parseMascotPack(horsPrefixe, prefixes).success, false);
  assert.ok(parseMascotPack(PACK_SPRITE_CUT, prefixes).success);
});

test('un pack publié de chaque moteur devient une entrée catalogue', async () => {
  // Le chemin réel : `GET /api/visit/content` → `mascot_packs` → entrées fusionnées au sélecteur.
  const { buildVisitMascotCatalogExtrasFromContent } =
    await import('../src/utils/visitMascotPackExtras.js');
  const rows = [
    { catalog_id: 'a', label: 'A', pack: PACK_SPRITE_CUT },
    { catalog_id: 'b', label: 'B', pack: PACK_SPRITESHEET },
    { catalog_id: 'c', label: 'C', pack: PACK_RIVE },
  ];
  const entries = buildVisitMascotCatalogExtrasFromContent(rows);
  assert.equal(entries.length, 3, 'un moteur ne franchit pas la construction d’entrée');
  assert.deepEqual(
    entries.map((e) => e.renderer),
    ['sprite_cut', 'spritesheet', 'rive'],
  );
  assert.ok(entries[0].spriteCut && entries[1].spritesheet && entries[2].rive);
});
