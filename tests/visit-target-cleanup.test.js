'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { deleteVisitTargetCascade, VISIT_TARGET_TABLE } = require('../lib/visitTargetCleanup');

/** Construit des dépendances injectées qui enregistrent les appels (aucune BDD requise). */
function makeDeps({ mediaRows = [], deleteFileThrows = false } = {}) {
  const calls = { execute: [], queryAll: [], deleteFile: [] };
  return {
    calls,
    deps: {
      queryAll: async (sql, params) => {
        calls.queryAll.push({ sql, params });
        return mediaRows;
      },
      execute: async (sql, params) => {
        calls.execute.push({ sql, params });
        return { affectedRows: 1 };
      },
      deleteFile: (relativePath) => {
        calls.deleteFile.push(relativePath);
        if (deleteFileThrows) throw new Error('fichier absent');
      },
    },
  };
}

describe('deleteVisitTargetCascade — cascade carte → couche visite', () => {
  it('zone : supprime ligne visite, médias, progression et fichiers (même id)', async () => {
    const { calls, deps } = makeDeps({
      mediaRows: [{ image_path: 'uploads/visit_media/a.jpg' }, { image_path: '' }],
    });

    const result = await deleteVisitTargetCascade('zone', 'z1', deps);
    assert.equal(result, true);

    // Fichiers : seul le chemin non vide est supprimé (best-effort).
    assert.deepEqual(calls.deleteFile, ['uploads/visit_media/a.jpg']);

    // Quatre DELETE, dans l'ordre : visit_zones puis médias puis progressions.
    const tables = calls.execute.map((c) => c.sql);
    assert.equal(calls.execute.length, 4);
    assert.match(tables[0], /DELETE FROM visit_zones WHERE id = \?/);
    assert.match(tables[1], /DELETE FROM visit_media WHERE target_type = \? AND target_id = \?/);
    assert.match(
      tables[2],
      /DELETE FROM visit_seen_students WHERE target_type = \? AND target_id = \?/,
    );
    assert.match(
      tables[3],
      /DELETE FROM visit_seen_anonymous WHERE target_type = \? AND target_id = \?/,
    );

    // Paramètres : type 'zone' + id stringifié partout.
    assert.deepEqual(calls.execute[0].params, ['z1']);
    for (const c of calls.execute.slice(1)) {
      assert.deepEqual(c.params, ['zone', 'z1']);
    }
    // La requête médias cible bien la cible visite.
    assert.deepEqual(calls.queryAll[0].params, ['zone', 'z1']);
  });

  it('marker : cible la table visit_markers', async () => {
    const { calls, deps } = makeDeps({ mediaRows: [] });

    const result = await deleteVisitTargetCascade('marker', 42, deps);
    assert.equal(result, true);
    assert.equal(calls.deleteFile.length, 0);
    assert.match(calls.execute[0].sql, /DELETE FROM visit_markers WHERE id = \?/);
    // id numérique normalisé en chaîne.
    assert.deepEqual(calls.execute[0].params, ['42']);
    for (const c of calls.execute.slice(1)) {
      assert.deepEqual(c.params, ['marker', '42']);
    }
  });

  it('best-effort : un fichier déjà absent n’interrompt pas le nettoyage SQL', async () => {
    const { calls, deps } = makeDeps({
      mediaRows: [{ image_path: 'uploads/visit_media/missing.jpg' }],
      deleteFileThrows: true,
    });

    await assert.doesNotReject(() => deleteVisitTargetCascade('zone', 'z9', deps));
    // Les 4 DELETE ont bien été émis malgré l’échec de suppression de fichier.
    assert.equal(calls.execute.length, 4);
  });

  it('type de cible inconnu : no-op qui renvoie false (aucun DELETE)', async () => {
    const { calls, deps } = makeDeps();
    const result = await deleteVisitTargetCascade('plant', 'p1', deps);
    assert.equal(result, false);
    assert.equal(calls.execute.length, 0);
    assert.equal(calls.queryAll.length, 0);
  });

  it('table de correspondance figée (zone/marker uniquement)', () => {
    assert.deepEqual(VISIT_TARGET_TABLE, { zone: 'visit_zones', marker: 'visit_markers' });
    assert.ok(Object.isFrozen(VISIT_TARGET_TABLE));
  });
});
