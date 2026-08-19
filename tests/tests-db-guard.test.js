'use strict';

// Garde-fou base de test (audit docs/AUDIT_BDD_2026-08.md §5.7).
//
// Le harnais `tests/helpers/setup.js` reprend le DB_NAME du `.env` quand TEST_DB_NAME est
// absent — celui-là même que docs/LOCAL_DEV.md fait pointer vers un dump de production.
// Chaque fichier de test appelant initSchema() puis écrivant et supprimant, un `npm test`
// lancé avec le mauvais `.env` écrirait dans la production.
//
// Le garde s'exécute au CHARGEMENT du module : on le vérifie donc dans un sous-processus,
// avec un environnement fabriqué. Aucune base n'est ouverte.

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const SETUP = path.join(__dirname, 'helpers', 'setup.js');

function loadSetupWith(env) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SETUP)})`], {
    cwd: ROOT,
    encoding: 'utf8',
    // DOTENV_CONFIG_PATH n'est pas lu par setup.js (chemin en dur) : on neutralise le .env
    // du dépôt en imposant TEST_DB_NAME, qui prime dans tous les cas.
    env: { ...process.env, ...env },
  });
}

test('une base au nom non « test » est refusée', () => {
  const res = loadSetupWith({
    TEST_DB_NAME: 'oliviera_foretmap',
    FORETMAP_ALLOW_NON_TEST_DB: '',
  });
  assert.notStrictEqual(res.status, 0, 'le chargement doit échouer');
  assert.match(
    res.stderr,
    /Refus de lancer la suite sur la base/,
    'le message doit nommer explicitement le refus',
  );
  assert.match(res.stderr, /oliviera_foretmap/, 'le message doit citer la base refusée');
});

test('une base de test est acceptée', () => {
  const res = loadSetupWith({ TEST_DB_NAME: 'foretmap_test' });
  assert.doesNotMatch(
    String(res.stderr || ''),
    /Refus de lancer la suite sur la base/,
    'foretmap_test doit passer le garde',
  );
});

test('la base de développement locale documentée est acceptée', () => {
  const res = loadSetupWith({ TEST_DB_NAME: 'foretmap_local' });
  assert.doesNotMatch(String(res.stderr || ''), /Refus de lancer la suite sur la base/);
});

test('le contournement explicite est possible', () => {
  const res = loadSetupWith({
    TEST_DB_NAME: 'oliviera_foretmap',
    FORETMAP_ALLOW_NON_TEST_DB: '1',
  });
  assert.doesNotMatch(
    String(res.stderr || ''),
    /Refus de lancer la suite sur la base/,
    'FORETMAP_ALLOW_NON_TEST_DB=1 doit lever le garde',
  );
});
