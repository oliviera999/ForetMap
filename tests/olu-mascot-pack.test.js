'use strict';

/**
 * Invariants du pack mascotte **OLU — planches d'animation** (`docs/packs/olu-planches-pack.json`,
 * trames sous `public/assets/mascots/olu-planches/frames/`).
 *
 * Trois régressions silencieuses sont visées — silencieuses parce qu'aucune ne lève d'erreur :
 * le moteur `sprite_cut` retombe sur la silhouette SVG (niveau 3 du §4.1), ce qui est un repli
 * correct et donc invisible.
 *
 * 1. **La trame fantôme.** Un `stateFrames.<état>.files` peut citer un PNG qui n'est pas versionné.
 *    L'état concerné n'anime alors rien, sans message.
 * 2. **L'état perdu.** Le catalogue OLU couvrait douze états sur vingt et un ; les neuf autres
 *    retombaient sur `idle`. Ce pack couvre les vingt et un — le figer ici évite qu'un état
 *    disparaisse à la faveur d'une régénération partielle.
 * 3. **La trame orpheline.** Un PNG versionné que plus personne ne cite : du poids servi pour rien,
 *    et le signe qu'un découpage a changé sans que le pack suive.
 *
 * On vérifie en plus la géométrie réelle des PNG : le pack déclare 256×256, une trame d'une autre
 * taille se recadrerait silencieusement à l'affichage.
 *
 * Aucune base de données requise.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PACK_JSON = path.join(ROOT, 'docs/packs/olu-planches-pack.json');
const FRAMES_DIR = path.join(ROOT, 'public/assets/mascots/olu-planches/frames');

const pack = JSON.parse(fs.readFileSync(PACK_JSON, 'utf8'));

/** Les états visite canoniques, lus à la source plutôt que recopiés. */
async function canonicalStates() {
  const mod = await import('../src/utils/visitMascotState.js');
  return new Set(Object.values(mod.VISIT_MASCOT_STATE));
}

function citedFiles() {
  const names = new Set();
  for (const spec of Object.values(pack.stateFrames)) {
    for (const f of spec.files) names.add(f);
  }
  return names;
}

/** Dimensions d'un PNG, lues dans le chunk IHDR — évite une dépendance image dans les tests. */
function pngSize(absPath) {
  const fd = fs.openSync(absPath, 'r');
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  assert.equal(
    head.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${absPath} n'est pas un PNG`,
  );
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

test('le pack reprend l’identifiant catalogue d’OLU, et ne s’ajoute pas à côté', () => {
  // Un pack publié dont le `catalog_id` reprend celui d'une mascotte livrée **remplace** cette
  // mascotte dans le sélecteur (`buildVisitMascotCatalogExtrasFromContent`). L'entrée catalogue
  // `olu-spritesheet` déclare un spritesheet dont le PNG n'est pas versionné : OLU n'y apparaît
  // qu'en silhouette SVG. Reprendre cet identifiant, c'est donner ses animations à cette
  // mascotte-là ; en choisir un autre créerait un **second** OLU à côté du muet.
  // Le dossier des trames, lui, reste `olu-planches` : ce sont des trames découpées
  // (`sprite_cut`), pas un spritesheet — les nommer ainsi induirait en erreur.
  assert.equal(pack.id, 'olu-spritesheet');
  assert.match(pack.framesBase, /\/olu-planches\/frames\/$/);
});

test('le pack OLU déclare la géométrie et le rendu attendus', () => {
  assert.equal(pack.renderer, 'sprite_cut');
  assert.equal(pack.frameWidth, 256);
  assert.equal(pack.frameHeight, 256);
  // Illustration HD, contrairement à fox-backpack : un rendu pixelated la rendrait crénelée.
  assert.equal(pack.pixelated, false);
  assert.equal(pack.fallbackSilhouette, 'olu');
  assert.equal(pack.framesBase, '/assets/mascots/olu-planches/frames/');
});

test('le pack OLU couvre les vingt et un états canoniques', async () => {
  const canonical = await canonicalStates();
  const covered = new Set(Object.keys(pack.stateFrames));
  const manquants = [...canonical].filter((s) => !covered.has(s));
  assert.deepEqual(manquants, [], `états sans trames (ils retomberaient sur idle) : ${manquants}`);
  const inconnus = [...covered].filter((s) => !canonical.has(s));
  assert.deepEqual(inconnus, [], `états hors palette canonique : ${inconnus}`);
});

test('chaque trame citée par le pack est versionnée', () => {
  const manquantes = [...citedFiles()].filter((f) => !fs.existsSync(path.join(FRAMES_DIR, f)));
  assert.deepEqual(manquantes, [], `trames citées et absentes : ${manquantes.slice(0, 8)}`);
});

test('aucune trame versionnée n’est orpheline', () => {
  const cited = citedFiles();
  const onDisk = fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.png'));
  const orphelines = onDisk.filter((f) => !cited.has(f));
  assert.deepEqual(
    orphelines,
    [],
    `trames servies que personne ne cite : ${orphelines.slice(0, 8)}`,
  );
});

test('toutes les trames font bien 256 × 256', () => {
  const horsGabarit = [];
  for (const f of citedFiles()) {
    const { width, height } = pngSize(path.join(FRAMES_DIR, f));
    if (width !== pack.frameWidth || height !== pack.frameHeight) {
      horsGabarit.push(`${f} (${width}×${height})`);
    }
  }
  assert.deepEqual(horsGabarit, [], `trames hors gabarit : ${horsGabarit.slice(0, 8)}`);
});

test('chaque état a au moins une trame et une cadence plausible', () => {
  for (const [state, spec] of Object.entries(pack.stateFrames)) {
    assert.ok(Array.isArray(spec.files) && spec.files.length >= 1, `${state} : aucune trame`);
    assert.ok(
      Number.isFinite(spec.fps) && spec.fps >= 1 && spec.fps <= 24,
      `${state} : cadence hors bornes (${spec.fps})`,
    );
  }
});

test('les deux états dérivés réutilisent bien les trames de leur source', () => {
  // `running`, c'est `walking` joué plus vite ; `map_read`, c'est `inspect`. Dupliquer les PNG
  // doublerait le poids servi pour une animation identique.
  assert.deepEqual(pack.stateFrames.running.files, pack.stateFrames.walking.files);
  assert.ok(pack.stateFrames.running.fps > pack.stateFrames.walking.fps);
  assert.deepEqual(pack.stateFrames.map_read.files, pack.stateFrames.inspect.files);
});

test('le pack passe la validation Zod servie au runtime', async () => {
  const mod = await import('../lib/visit-pack/mascotPack.js');
  const parsed = mod.parseMascotPack(pack);
  assert.ok(parsed, 'parseMascotPack a refusé le pack');
  assert.ok(!parsed.error, `parseMascotPack : ${parsed.error}`);
});
