'use strict';

// Garde d'isolement de l'intégration Moodle vis-à-vis de Gnomes & Licornes (audit du 25/09/2026,
// § 3.1 ; décision Q18). Depuis l'extraction de `lib/moodle/gameAdapter.js`, c'est le SEUL
// fichier de `lib/moodle/` qui lit ou écrit une table `gl_*` ou importe du code GL. Le
// comportement est couvert ailleurs (moodle-gl-characterization, moodle-sync-apply,
// moodle-teams-mirror) ; ce fichier empêche seulement l'isolement de se défaire.

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const MOODLE_DIR = path.join(__dirname, '..', 'lib', 'moodle');
const ADAPTER = 'gameAdapter.js';

function codeOf(file) {
  // Commentaires retirés : la documentation a le droit de nommer GL et ses tables.
  return fs
    .readFileSync(path.join(MOODLE_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const moodleFiles = fs.readdirSync(MOODLE_DIR).filter((f) => f.endsWith('.js'));

/** Tables GL lues ou écrites par la synchronisation. */
const GL_TABLE = /\bgl_(players|classes|games|teams|team_members)\b/g;
/** Import d'un module GL (`lib/gl*.js` ou `lib/gl/…`). */
const GL_IMPORT = /require\(\s*'\.\.\/gl[A-Z/][^']*'\s*\)/g;

test('seul l’adaptateur GL de lib/moodle nomme une table gl_*', () => {
  for (const file of moodleFiles.filter((f) => f !== ADAPTER)) {
    const hits = codeOf(file).match(GL_TABLE) || [];
    assert.deepEqual(hits, [], `${file} accède directement à ${hits.join(', ')}`);
  }
  const adapterTables = new Set(codeOf(ADAPTER).match(GL_TABLE));
  assert.deepEqual([...adapterTables].sort(), [
    'gl_classes',
    'gl_games',
    'gl_players',
    'gl_team_members',
    'gl_teams',
  ]);
});

test('seul l’adaptateur GL de lib/moodle importe du code Gnomes & Licornes', () => {
  for (const file of moodleFiles.filter((f) => f !== ADAPTER)) {
    const hits = codeOf(file).match(GL_IMPORT) || [];
    assert.deepEqual(hits, [], `${file} importe ${hits.join(', ')}`);
  }
  assert.deepEqual((codeOf(ADAPTER).match(GL_IMPORT) || []).sort(), [
    "require('../glIdentityReconcile')",
    "require('../glSettings')",
    "require('../glVitality')",
  ]);
});

test('surface de l’adaptateur : lecture de l’état, application, annulation, miroir, contrôles', () => {
  const adapter = require('../lib/moodle/gameAdapter');
  assert.deepEqual(Object.keys(adapter).sort(), [
    'buildIdentityReport',
    'cohortIdnumberForClass',
    'countClassPlayers',
    'createClass',
    'createPlayer',
    'deactivateClass',
    'deleteClass',
    'findClassByGroupId',
    'findGame',
    'findGameClass',
    'findPlayer',
    'findPlayerByUserId',
    'listGameTeamMembers',
    'listGameTeams',
    'listGamesForCohorts',
    'loadClasses',
    'loadDefaultVitality',
    'loadLinkedPlayers',
    'movePlayer',
    'reactivateClass',
    'removePlayer',
    'restorePlayerPlacement',
    'uniquePlayerPseudo',
  ]);
});

test('retrait d’un joueur : suppression, ou désactivation si des contributions le retiennent', async () => {
  const { removePlayer } = require('../lib/moodle/gameAdapter');
  const calls = [];
  const fk = Object.assign(new Error('référencé'), { errno: 1451 });
  const db = {
    execute: async (sql, params) => {
      calls.push([sql.split(' ')[0], params]);
      if (sql.startsWith('DELETE') && params[0] === 2) throw fk;
    },
  };
  await removePlayer(db, 1);
  await removePlayer(db, 2);
  assert.deepEqual(calls, [
    ['DELETE', [1]],
    ['DELETE', [2]],
    ['UPDATE', [2]],
  ]);
  const other = Object.assign(new Error('autre'), { errno: 1205 });
  await assert.rejects(
    removePlayer(
      {
        execute: async () => {
          throw other;
        },
      },
      3,
    ),
    other,
  );
});
