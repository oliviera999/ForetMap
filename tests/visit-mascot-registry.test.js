const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidVisitMascotId, SETTINGS_REGISTRY } = require('../lib/settings');
const {
  listStaticVisitMascots,
  getBuiltinDefaultVisitMascotId,
} = require('../lib/visitMascotRegistry');

// Registre des mascottes de visite : le serveur ne tient plus de liste blanche d'ids.
// Les mascottes livrées et les packs publiés (`srv-…`) sont traités à égalité.

test('la liste blanche de mascottes n’est plus un réglage', () => {
  // Elle se figeait sur les mascottes existant le jour où on la posait. La retirer du registre
  // est ce qui ferme la classe de défaut : sans clé, rien ne peut la reposer.
  assert.equal(SETTINGS_REGISTRY['ui.visit.mascot.allowed_ids'], undefined);
  assert.equal(SETTINGS_REGISTRY['ui.visit.mascot.default_id'].default, '');
});

test('isValidVisitMascotId : forme seulement, packs serveur acceptés', () => {
  assert.equal(isValidVisitMascotId('renard2-cut-spritesheet'), true);
  assert.equal(isValidVisitMascotId('gnome1'), true);
  assert.equal(isValidVisitMascotId('srv-pack-abc_1.2'), true);
  assert.equal(isValidVisitMascotId(''), false);
  assert.equal(isValidVisitMascotId('id avec espace'), false);
  assert.equal(isValidVisitMascotId('-commence-par-tiret'), false);
  assert.equal(isValidVisitMascotId('a'.repeat(81)), false);
});

test('registre statique : toutes les mascottes livrées sont exposées, gnome1 compris', async () => {
  const entries = await listStaticVisitMascots();
  assert.ok(entries.length > 0);
  const ids = entries.map((entry) => entry.id);
  assert.ok(ids.includes('renard2-cut-spritesheet'));
  // gnome1 était absent de l'ancienne liste blanche : il en devenait inatteignable.
  assert.ok(ids.includes('gnome1'));
  for (const entry of entries) {
    assert.ok(isValidVisitMascotId(entry.id), `id invalide: ${entry.id}`);
    assert.ok(entry.label, `libellé manquant: ${entry.id}`);
  }
});

test('mascotte par défaut livrée : résolue depuis le catalogue, pas codée en dur côté serveur', async () => {
  const builtin = await getBuiltinDefaultVisitMascotId();
  const ids = (await listStaticVisitMascots()).map((entry) => entry.id);
  assert.ok(builtin);
  assert.ok(ids.includes(builtin));
});
