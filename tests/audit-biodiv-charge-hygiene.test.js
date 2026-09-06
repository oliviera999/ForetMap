'use strict';

// Gardes du lot « dégraissage » de l'audit de charge biodiversité
// (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md) : constats A4/B6, B5, P4, P7, P8.
//
// Chaque garde tient un acquis qu'aucun test fonctionnel ne verrait disparaître : le
// périmètre d'un domaine de synchronisation, la présence d'un cache, une borne de lecture,
// et la convention « SQL toujours paramétré ».

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { execute, getSyncDomainVersions } = require('../database');

const repoRoot = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('B6 — une observation d’espèce ne fait plus recharger le catalogue', async () => {
  // `user_plant_observation_events` ne pèse aucun octet dans `GET /api/plants` : elle
  // n'alimente que les compteurs par utilisateur, que le cycle `fetchAll` ne rappelle pas.
  // Tant qu'elle appartenait au domaine `plants`, chaque clic « espèce découverte » d'un
  // élève faisait recharger le catalogue complet chez TOUS les clients connectés.
  const before = getSyncDomainVersions();
  // Écriture sans effet : ce qui compte est le classement de la requête, pas son résultat.
  await execute('DELETE FROM user_plant_observation_events WHERE 1 = 0');
  const after = getSyncDomainVersions();

  assert.equal(after.plants, before.plants, 'le domaine plants ne doit pas bouger');
  // Et surtout : pas de repli conservateur, qui bumperait TOUS les domaines — l'inverse
  // du but recherché.
  for (const domain of Object.keys(before)) {
    assert.equal(after[domain], before[domain], `le domaine ${domain} ne doit pas bouger`);
  }
});

test('B6 — une écriture sur le catalogue bumpe toujours le domaine plants', async () => {
  const before = getSyncDomainVersions();
  await execute('DELETE FROM plants WHERE 1 = 0');
  const after = getSyncDomainVersions();
  assert.ok(after.plants > before.plants, 'une écriture sur plants doit bumper son domaine');
});

test('B5 — la liste des plantes n’est pas ré-enrichie à chaque hit de cache', () => {
  const src = read('routes/plants.js');
  assert.ok(
    /if \(cached\) return res\.json\(cached\);/.test(src),
    'le hit de cache doit renvoyer la valeur cachée telle quelle',
  );
  assert.ok(
    !/cached\.map\(enrichPlantRow\)/.test(src),
    'les lignes cachées sont déjà enrichies : les ré-enrichir reconstruit tout le catalogue',
  );
});

test('B7 / P4 — les agrégats partagés passent par un cache mémoire', () => {
  assert.ok(
    read('routes/plants.js').includes("getNamedMemoryTtlCache('plants:site-observations:v1'"),
    'compteurs « tout le site » : agrégat identique pour tous, à ne pas recalculer par élève',
  );
  assert.ok(
    read('routes/glossary.js').includes("getNamedMemoryTtlCache('glossary:terms:v1'"),
    'liste du glossaire : demandée une fois par session, par chaque utilisateur',
  );
});

test('P7 — le carnet d’observations d’un élève est borné', () => {
  const src = read('routes/observations.js');
  assert.ok(
    /FROM observation_logs o[\s\S]*?WHERE o\.student_id = \?[\s\S]*?LIMIT \?/.test(src),
    'la lecture du carnet doit porter une borne',
  );
  assert.ok(
    /STUDENT_NOTEBOOK_MAX_ROWS = \d+/.test(src),
    'la borne doit être une constante nommée, pas un nombre perdu dans la requête',
  );
});

test('P8 — plus aucun LIMIT/OFFSET interpolé depuis une valeur de requête', () => {
  // Les valeurs étaient bornées en amont, donc aucune injection n'était atteignable : c'est
  // la convention « SQL toujours paramétré » qui manquait, déjà rétablie côté G&L (G5).
  const files = [
    'lib/shared/contextCommentsCore.js',
    'routes/forum.js',
    'routes/gl/forum.js',
    'routes/audit.js',
  ];
  for (const file of files) {
    const src = read(file);
    const offenders = src.match(/LIMIT \$\{[^}]*\}/g) || [];
    assert.deepEqual(offenders, [], `${file} interpole encore un LIMIT : ${offenders.join(', ')}`);
  }
});

test('P5 — le tirage du quiz ne trie plus tout le catalogue', () => {
  // Lignes de commentaire retirées : celle qui explique le correctif cite la formule.
  const code = read('routes/quiz.js')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.ok(
    !/ORDER BY RAND\(\)/.test(code),
    '`ORDER BY RAND()` matérialise et trie la sélection entière à chaque tirage',
  );
});
