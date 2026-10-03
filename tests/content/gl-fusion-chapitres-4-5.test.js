'use strict';

// Migration 316 : fusion des chapitres 4 (Taïga & désert froid) et 5 (Toundra arctique) en un
// seul chapitre 4 joué sur le plateau peint `plateau-4_fond` (38 dalles).
//
// Les chapitres visés n'existent qu'en production : une base de CI n'en a aucun. Le test
// rejoue donc la migration (une connexion unique, comme le runner : elle pose des variables de
// session) sur un jeu de données qui imite la production — mêmes slugs, mêmes `order_index`,
// mêmes libellés de zones, mêmes codes de feuillets — puis vérifie la grammaire du chapitre
// fusionné, la rejouabilité, le no-op sur une base sans ces chapitres et la garde « équipe
// posée sur un repère supprimé ».
//
// Tout se joue dans **une transaction annulée à la fin** (la migration ne contient que du DML) :
// le test ne laisse aucune trace et ne dépend pas de ce que d'autres suites ont importé dans la
// base de test (corpus de feuillets, scopes QCM lore) — ces lignes sont écartées le temps du
// test, puis rendues par le ROLLBACK. Seule une base qui porte les vrais chapitres 4 et 5
// (copie de production) est laissée de côté.
require('../helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { initSchema, pool, splitSqlStatements } = require('../../database');
const {
  isFeuilletInChapterPool,
  resolveChapterFeuilletPool,
} = require('../../lib/glFeuilletChapterPool');
const { resolveMarkerEventConfig } = require('../../lib/glMarkerEventConfig');

const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'migrations',
  '316_gl_fusion_chapitres_4_5.sql',
);
const ZONES_FILE = path.join(__dirname, '..', '..', 'src', 'gl', 'data', 'zones_feuillets.json');

const SLUG_E = 'eurasie-continentale';
const SLUG_T = 'toundra-arctique';
const stamp = Date.now();

// Connexion unique, transaction ouverte dans before() et annulée dans after() : toutes les
// requêtes du test (et la migration rejouée) passent par elle.
let conn = null;
async function queryAll(sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  return Array.isArray(rows) ? rows : [];
}
async function queryOne(sql, params = []) {
  return (await queryAll(sql, params))[0];
}
async function execute(sql, params = []) {
  const [result] = await conn.execute(sql, params);
  return result;
}
const db = { queryOne, queryAll, execute };

// --- Chapitre 4 « avant » : 42 repères, taïga (10–210) puis désert froid (220–420) --------
const QUIZ = (categorie, niveau) => ({ type: 'quiz', categorie, niveau });
const E_LAYOUT = {
  10: { type: 'start', label: 'Départ' },
  20: QUIZ('faune', 'approfondissement'),
  30: { label: "Trace d'ours brun" },
  40: QUIZ('faune', 'approfondissement'),
  50: { label: 'Éclaircie bienvenue' },
  60: { label: '🌫️ Un fil lâche' },
  70: QUIZ('flore', 'approfondissement'),
  80: { label: 'Hutte de castor' },
  90: { label: 'Passage dégagé' },
  100: QUIZ('flore', 'approfondissement'),
  110: { label: '➡️ Sentier de pisteur' },
  120: QUIZ('climat', 'approfondissement'),
  130: { label: 'Halte sous les épicéas' },
  140: { label: 'Feu de forêt', description: 'Ancienne description.' },
  150: QUIZ('climat', 'base'),
  160: { label: '🧵 Renouer le nœud' },
  170: { label: '🌫️ Le fil qui lâche' },
  180: QUIZ('geologie', 'approfondissement'),
  190: { label: 'Refuge sami' },
  200: QUIZ('geologie', 'base'),
  210: { label: "Défi d'équipe" },
  420: { type: 'story', label: 'Arrivée du désert froid' },
};
// --- Chapitre 5 « avant » : 42 repères ; seuls ceux repris par la fusion sont typés --------
const T_LAYOUT = {
  10: { type: 'start', label: 'Départ toundra' },
  30: { label: 'Soleil de minuit' },
  110: { label: '➡️ Sentier de pisteur' },
  130: { label: 'Floraison express' },
  190: { label: 'Lemming en pleine explosion' },
  230: QUIZ('ecologie', 'approfondissement'),
  250: QUIZ('ecologie', 'base'),
  260: { label: "🌫️ L'oubli" },
  280: QUIZ('geographie', 'approfondissement'),
  290: { label: 'Blizzard' },
  300: QUIZ('geographie', 'base'),
  320: { label: '🌫️ La nuit qui tombe' },
  330: QUIZ('conservation', 'approfondissement'),
  340: { label: 'Ours polaire' },
  350: QUIZ('conservation', 'base'),
  360: { label: '🧵 Réécrire la page' },
  380: QUIZ('vocabulaire', 'approfondissement'),
  390: { label: 'Aurores boréales' },
  400: QUIZ('vocabulaire', 'base'),
  410: { label: "Défi d'équipe" },
  420: { type: 'story', label: 'Arrivée au pôle' },
};

// Cible (tableau de l'étape B, ramené à 38 dalles) : position → [x %, y %].
const COORDS = [
  [12.1, 21.4],
  [15.8, 18.4],
  [19.8, 17.3],
  [23.8, 18.6],
  [27.2, 22.3],
  [29.3, 28.5],
  [30.4, 35.3],
  [29.5, 42.3],
  [27.9, 48.8],
  [26.4, 55.3],
  [25.3, 61.8],
  [25.1, 68.9],
  [26.2, 75.7],
  [29.1, 80.3],
  [32.7, 82.4],
  [35.9, 78.8],
  [37.3, 72.8],
  [39.1, 67.1],
  [42.4, 63.9],
  [46.1, 63.0],
  [49.9, 63.0],
  [53.8, 62.4],
  [57.1, 57.7],
  [58.3, 50.1],
  [58.6, 42.8],
  [58.9, 35.4],
  [60.7, 28.6],
  [64.1, 25.0],
  [68.2, 24.6],
  [71.9, 28.0],
  [74.6, 33.2],
  [76.5, 39.5],
  [78.1, 45.8],
  [82.0, 47.9],
  [85.9, 45.4],
  [89.3, 42.1],
  [91.4, 35.9],
  [91.9, 28.8],
];

const FEUILLETS_INACTIFS = [
  'ren-dfroid-01',
  'ren-dfroid-02',
  'sort-dfroid-01',
  'cop-bio-dfroid',
  'ep-VII-feu-1',
  'ep-VII-feu-2',
  'ep-VIII-04b',
  'ep-III-04',
  'ep-III-07',
  'rep-II-09',
  'ep-III-02',
  'vierge-P4',
  'vierge-P5b',
  'ep-quot-2',
];
const FEUILLETS_REBASES = [
  'ep-I-12',
  'ep-III-01',
  'ep-seuil-4',
  'ep-VI-08',
  'ep-VII-07',
  'ep-VII-08',
  'ep-VIII-01',
  'ep-VIII-02',
  'ep-VIII-05',
  'ep-VII-rechute',
];
const FEUILLETS_P5 = ['ep-I-14', 'ep-I-16', 'ep-I-13', 'ep-I-15', 'ep-III-06', 'ep-I-17'];
const FEUILLETS_P4 = ['ep-I-11', 'ep-III-03'];

const LORE_CATEGORIES = [`fus-recit-${stamp}`.slice(0, 64), `fus-cle-${stamp}`.slice(0, 64)];
const LORE_CODES = ['LQCMF4001', 'LQCMF4002', 'LQCMF5001', 'LQCMF5002', 'LQCMF5003', 'LQCMF5004'];

const SORTILEGES_AVANT =
  '## Sortilèges du chapitre\n\n' +
  'Sur ce plateau, le **Souffle** prend le visage du *Détricotage*. Aux cases **Souffle** ' +
  '(🌫️), il éprouve les deux peuples différemment ; aux cases **Trame** (🧵), le choix Gnome ' +
  '(cœur) ou Licorne (gemme) dessine la voie que vous incarnez.\n\n- Sortilège de la mousse\n';

let skipReason = '';
let chapterE = null;
let chapterT = null;
let createdScopes = [];
let gameId = null;

function migrationSql() {
  return fs.readFileSync(MIGRATION_FILE, 'utf8');
}

/** Rejoue la migration comme le runner : une seule connexion, requête par requête. */
async function runMigration(statements = splitSqlStatements(migrationSql())) {
  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

function quizConfig(categorie, niveau) {
  return JSON.stringify({
    version: 2,
    question: {
      set: 'biome',
      mode: 'random',
      fixedQuestionCode: null,
      pool: {
        biomeMode: 'chapter',
        biomeSlugs: [],
        categorieSlugs: [categorie],
        niveaux: [niveau],
        difficulteMin: null,
        difficulteMax: null,
        searchQuery: '',
        selectedQuestionCodes: [],
      },
    },
  });
}

async function insertMarkers(chapterId, layout, sousBiomeAt) {
  for (let order = 10; order <= 420; order += 10) {
    const spec = layout[order] || { label: `Case ${order}` };
    const type = spec.type || 'behavior';
    await execute(
      `INSERT INTO gl_chapter_markers
         (chapter_id, x_pct, y_pct, event_type, label, description, sous_biome_slug,
          event_config_json, display_mode, emoji, order_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        chapterId,
        (order / 420) * 90,
        50,
        type,
        spec.label || `Quiz ${spec.categorie} (${spec.niveau})`,
        spec.description || `Description ${order}`,
        sousBiomeAt(order),
        type === 'quiz' ? quizConfig(spec.categorie, spec.niveau) : null,
        type === 'quiz' ? 'emoji' : null,
        type === 'quiz' ? '❓' : null,
        order,
      ],
    );
  }
}

async function insertFeuillet(code, fields = {}) {
  const columns = {
    feuillet_code: code,
    type: 'feuillet',
    titre: `Feuillet ${code}`,
    statut: 'actif',
    ...fields,
  };
  const keys = Object.keys(columns);
  await execute(
    `INSERT INTO gl_lore_feuillets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => columns[k]),
  );
}

function allFixtureFeuilletCodes() {
  const zoneCodes = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8'))
    .zones.filter((z) => z.plateau === 4)
    .map((z) => z.feuillet_code);
  return [
    ...new Set([
      ...FEUILLETS_INACTIFS,
      ...FEUILLETS_REBASES,
      ...FEUILLETS_P5,
      ...FEUILLETS_P4,
      ...zoneCodes,
      'page-dfroid',
      'sc-nom',
      'ep-VIII-09',
      'cop-mov-5',
      'cop-mov-6',
      'fus-zone-hiver',
    ]),
  ];
}

async function chapterIdBySlug(slug) {
  const row = await queryOne('SELECT id FROM gl_chapters WHERE slug = ?', [slug]);
  return row ? Number(row.id) : null;
}

async function markersOf(chapterId) {
  return queryAll(
    `SELECT id, x_pct, y_pct, event_type, label, description, sous_biome_slug, effet_mecanique,
            qcm_categorie_slug, qcm_question_code, event_config_json, display_mode, emoji,
            icon_url, order_index
       FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index, id`,
    [chapterId],
  );
}

/** Instantané de tout ce que la migration peut toucher (hors horodatages). */
async function snapshot() {
  const codes = allFixtureFeuilletCodes();
  const chapters = await queryAll(
    `SELECT id, slug, title, biome, plateau_number, order_index, story_markdown,
            biotope_markdown, biocenose_markdown, sortileges_markdown
       FROM gl_chapters ORDER BY id`,
  );
  const markers = await queryAll(
    `SELECT id, chapter_id, x_pct, y_pct, event_type, label, description, sous_biome_slug,
            event_config_json, order_index
       FROM gl_chapter_markers ORDER BY id`,
  );
  const biomes = await queryAll(
    'SELECT chapter_id, biome_slug, order_index FROM gl_chapter_biomes ORDER BY chapter_id, biome_slug',
  );
  const zones = await queryAll(
    `SELECT id, chapter_id, label, points_json, popover_markdown, music_urls_json
       FROM gl_kingdom_zones ORDER BY id`,
  );
  const feuillets = await queryAll(
    `SELECT feuillet_code, titre, biome_slug, plateau_number, statut, kingdom_zone_id,
            lien_pays, ordre_voyage, ordre_recit
       FROM gl_lore_feuillets
      WHERE feuillet_code IN (${codes.map(() => '?').join(', ')})
      ORDER BY feuillet_code`,
    codes,
  );
  const questions = await queryAll(
    `SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie
       FROM gl_qcm_lore_questions ORDER BY question_code`,
  );
  const scopes = await queryAll(
    'SELECT slug, nom, description FROM gl_qcm_lore_scopes ORDER BY slug',
  );
  return JSON.stringify({ chapters, markers, biomes, zones, feuillets, questions, scopes });
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const { x: xi, y: yi } = points[i];
    const { x: xj, y: yj } = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Jeu de données « comme en production » (chapitres, repères, zones, QCM lore, feuillets). */
async function createFixtures() {
  // Corpus réel importé par d'autres suites (même codes, mêmes scopes) : écarté le temps du
  // test, la transaction le rend à la fin.
  const codes = allFixtureFeuilletCodes();
  await execute(
    `DELETE FROM gl_lore_feuillets WHERE feuillet_code IN (${codes.map(() => '?').join(', ')})`,
    codes,
  );
  await execute("DELETE FROM gl_qcm_lore_questions WHERE chapitre_slug IN ('ch4', 'ch5')");
  await execute("DELETE FROM gl_qcm_lore_scopes WHERE slug IN ('ch4', 'ch5')");
  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, plateau_number, order_index, story_markdown,
                              sortileges_markdown, created_at, updated_at)
     VALUES (?, 'Chapitre 4 — Eurasie continentale', 'Taïga & désert froid', 4, 40,
             'Ancien récit.', ?, NOW(), NOW())`,
    [SLUG_E, SORTILEGES_AVANT],
  );
  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, plateau_number, order_index, story_markdown,
                              created_at, updated_at)
     VALUES (?, 'Chapitre 5 — Toundra arctique', 'Toundra arctique', 5, 50,
             'Récit de la toundra (dévoile la chute).', NOW(), NOW())`,
    [SLUG_T],
  );
  chapterE = await chapterIdBySlug(SLUG_E);
  chapterT = await chapterIdBySlug(SLUG_T);
  await execute(
    `INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
     VALUES (?, 'taiga', 0), (?, 'desert_froid', 10), (?, 'toundra', 0)`,
    [chapterE, chapterE, chapterT],
  );
  await insertMarkers(chapterE, E_LAYOUT, (order) =>
    order <= 210 ? 'taiga' : order === 220 ? 'transition' : 'desert_froid',
  );
  await insertMarkers(chapterT, T_LAYOUT, () => 'toundra');

  const square = JSON.stringify([
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ]);
  await execute(
    `INSERT INTO gl_kingdom_zones (chapter_id, label, points_json, popover_markdown, music_url,
                                   created_at, updated_at)
     VALUES (?, 'Taïga', ?, 'Popover taïga', '/uploads/media-library/audio/taiga.mp3', NOW(), NOW()),
            (?, 'Désert froid', ?, 'Popover Gobi', NULL, NOW(), NOW())`,
    [chapterE, square, chapterE, square],
  );
  await execute(
    `INSERT INTO gl_kingdom_zones (chapter_id, label, points_json, popover_markdown,
                                   popover_images_json, music_urls_json, music_volume,
                                   created_at, updated_at)
     VALUES (?, 'Toundra — été polaire', ?, 'Popover été', NULL,
             '["/uploads/media-library/audio/ete.mp3"]', 0.6, NOW(), NOW()),
            (?, 'Toundra — hiver polaire', ?, 'Popover nuit',
             '[{"url":"/uploads/media-library/image/nuit.png","caption":"Nuit","sortOrder":0}]',
             '["/uploads/media-library/audio/nuit.mp3"]', 0.5, NOW(), NOW())`,
    [chapterT, square, chapterT, square],
  );

  for (const [slug, nom, plateau] of [
    ['ch4', 'Eurasie continentale', 4],
    ['ch5', 'Toundra arctique', 5],
  ]) {
    await execute(
      'INSERT INTO gl_qcm_lore_scopes (slug, nom, plateau, description) VALUES (?, ?, ?, ?)',
      [slug, nom, plateau, `Scope ${slug}`],
    );
    if (!createdScopes.includes(slug)) createdScopes.push(slug);
  }
  for (const slug of LORE_CATEGORIES) {
    await execute('INSERT INTO gl_qcm_lore_categories (slug, nom) VALUES (?, ?)', [slug, slug]);
  }
  const questions = [
    ['LQCMF4001', 'ch4', LORE_CATEGORIES[0], 1],
    ['LQCMF4002', 'ch4', LORE_CATEGORIES[0], 2],
    ['LQCMF5001', 'ch5', LORE_CATEGORIES[0], 1],
    ['LQCMF5002', 'ch5', LORE_CATEGORIES[0], 2],
    ['LQCMF5003', 'ch5', LORE_CATEGORIES[0], 3],
    ['LQCMF5004', 'ch5', LORE_CATEGORIES[1], 1],
  ];
  for (const [code, chapitre, categorie, numero] of questions) {
    await execute(
      `INSERT INTO gl_qcm_lore_questions
         (question_code, chapitre_slug, categorie_slug, numero_dans_categorie, question,
          choix_a, choix_b, choix_c, choix_d, reponse_correcte)
       VALUES (?, ?, ?, ?, 'Q ?', 'a', 'b', 'c', 'd', 'A')`,
      [code, chapitre, categorie, numero],
    );
  }

  for (const code of FEUILLETS_INACTIFS) {
    await insertFeuillet(code, { biome_slug: 'desert_froid', plateau_number: 4 });
  }
  for (const code of FEUILLETS_REBASES) {
    await insertFeuillet(code, {
      biome_slug: 'desert_froid',
      plateau_number: 4,
      titre: code === 'ep-VII-rechute' ? 'Le désert froid. J’ai recompté.' : `Feuillet ${code}`,
    });
  }
  for (const code of FEUILLETS_P5) {
    await insertFeuillet(code, { biome_slug: 'toundra', plateau_number: 5, lien_pays: 5 });
  }
  for (const code of FEUILLETS_P4) {
    await insertFeuillet(code, { biome_slug: 'taiga', plateau_number: 4, lien_pays: 4 });
  }
  await insertFeuillet('page-dfroid', {
    biome_slug: 'desert_froid',
    plateau_number: 4,
    ordre_voyage: 40200,
  });
  await insertFeuillet('cop-mov-5', { type: 'copiste', lien_canal: 'intro_pays', lien_pays: 4 });
  await insertFeuillet('cop-mov-6', { type: 'copiste', lien_canal: 'intro_pays', lien_pays: 5 });
  // Fin du récit : la nomination du corbeau reste tout au bout.
  await insertFeuillet('sc-nom', {
    biome_slug: 'toundra',
    plateau_number: 5,
    ordre_recit: 999998,
  });
  await insertFeuillet('ep-VIII-09', {
    biome_slug: 'toundra',
    plateau_number: 5,
    ordre_recit: 999999,
  });
  const zoneHiver = await queryOne(
    "SELECT id FROM gl_kingdom_zones WHERE chapter_id = ? AND label = 'Toundra — hiver polaire'",
    [chapterT],
  );
  await insertFeuillet('fus-zone-hiver', {
    biome_slug: 'toundra',
    plateau_number: 5,
    kingdom_zone_id: zoneHiver.id,
  });
}

/** Retire tout le jeu de données (les cascades emportent repères, zones et biomes). */
async function dropFixtures() {
  if (gameId) await execute('DELETE FROM gl_games WHERE id = ?', [gameId]);
  gameId = null;
  const codes = allFixtureFeuilletCodes();
  await execute(
    `DELETE FROM gl_lore_feuillets WHERE feuillet_code IN (${codes.map(() => '?').join(', ')})`,
    codes,
  );
  await execute(
    `DELETE FROM gl_qcm_lore_questions WHERE question_code IN (${LORE_CODES.map(() => '?').join(', ')})`,
    LORE_CODES,
  );
  for (const slug of createdScopes) {
    await execute('DELETE FROM gl_qcm_lore_scopes WHERE slug = ?', [slug]);
  }
  createdScopes = [];
  await execute(
    `DELETE FROM gl_qcm_lore_categories WHERE slug IN (${LORE_CATEGORIES.map(() => '?').join(', ')})`,
    LORE_CATEGORIES,
  );
  for (const id of [chapterE, chapterT]) {
    if (id) await execute('DELETE FROM gl_chapters WHERE id = ?', [id]);
  }
  chapterE = null;
  chapterT = null;
}

/** Résultat observable de la fusion, sans les ids (pour comparer deux passages). */
async function fusionResult() {
  const strip = (rows) => rows.map(({ id: _id, ...rest }) => rest);
  return JSON.stringify({
    e: strip(await markersOf(chapterE)),
    t: strip(await markersOf(chapterT)),
    zones: await queryAll(
      `SELECT label, points_json, popover_markdown, music_urls_json
         FROM gl_kingdom_zones WHERE chapter_id IN (?, ?) ORDER BY chapter_id = ?, label`,
      [chapterE, chapterT, chapterT],
    ),
    chapters: await queryAll(
      `SELECT slug, title, biome, plateau_number, order_index, story_markdown, sortileges_markdown
         FROM gl_chapters WHERE id IN (?, ?) ORDER BY slug`,
      [chapterE, chapterT],
    ),
  });
}

before(async () => {
  await initSchema();
  conn = await pool.getConnection();
  if ((await chapterIdBySlug(SLUG_E)) || (await chapterIdBySlug(SLUG_T))) {
    skipReason = 'chapitres de production présents dans cette base : rien à simuler';
    return;
  }
  await conn.query('START TRANSACTION');
});

after(async () => {
  if (!conn) return;
  if (!skipReason) await conn.query('ROLLBACK');
  conn.release();
});

test('sans les chapitres 4 et 5 (CI, base neuve), la migration ne touche à rien', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const avant = await snapshot();
  await runMigration();
  assert.strictEqual(await snapshot(), avant);
});

test('mise en place : chapitres, zones, QCM lore et feuillets comme en production', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await createFixtures();
  assert.strictEqual((await markersOf(chapterE)).length, 42);
  assert.strictEqual((await markersOf(chapterT)).length, 42);
});

test('garde : une équipe posée sur un repère supprimé suspend toute la fusion', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const admin = await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ fusion', 'admin', 1, NOW(), NOW())`,
    [`gl.fusion.${stamp}@ecole.local`],
  );
  const cls = await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Test', ?, 1, NOW(), NOW())`,
    [`Classe fusion ${stamp}`, admin.insertId],
  );
  const game = await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.insertId, chapterE, `Partie fusion ${stamp}`, admin.insertId],
  );
  gameId = game.insertId;
  const team = await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Gnomes du Gobi', 'gnome', '#22c55e', NOW(), NOW())`,
    [gameId],
  );
  const gobi = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND order_index = 300',
    [chapterE],
  );
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    gobi.id,
    team.insertId,
  ]);

  const avant = await snapshot();
  await runMigration();
  assert.strictEqual(await snapshot(), avant, 'rien ne doit bouger tant que l’équipe y est');

  await execute('DELETE FROM gl_games WHERE id = ?', [gameId]);
  gameId = null;
});

test('fusion : 38 repères à la grammaire du plateau peint', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const avantE = await markersOf(chapterE);
  const avantT = await markersOf(chapterT);
  await runMigration();

  const markers = await markersOf(chapterE);
  assert.deepStrictEqual(
    markers.map((m) => m.order_index),
    Array.from({ length: 38 }, (_, i) => (i + 1) * 10),
  );
  markers.forEach((m, i) => {
    assert.strictEqual(Number(m.x_pct), COORDS[i][0], `x de la dalle ${i + 1}`);
    assert.strictEqual(Number(m.y_pct), COORDS[i][1], `y de la dalle ${i + 1}`);
  });

  const byType = {};
  for (const m of markers) byType[m.event_type] = (byType[m.event_type] || 0) + 1;
  assert.deepStrictEqual(byType, { start: 1, quiz: 14, behavior: 22, story: 1 });
  assert.strictEqual(markers[0].event_type, 'start');
  assert.strictEqual(markers[37].event_type, 'story');

  const sousBiomes = markers.map((m) => m.sous_biome_slug);
  assert.deepStrictEqual(sousBiomes.slice(0, 21), Array(21).fill('taiga'));
  assert.strictEqual(sousBiomes[21], 'transition');
  assert.deepStrictEqual(sousBiomes.slice(22, 31), Array(9).fill('toundra_ete'));
  assert.deepStrictEqual(sousBiomes.slice(31), Array(7).fill('toundra_hiver'));

  const at = (pos) => markers[pos - 1];
  assert.strictEqual(at(1).label, 'Bivouac boréal');
  assert.strictEqual(at(13).label, 'Refuge sami');
  assert.strictEqual(
    at(13).id,
    avantE.find((m) => m.order_index === 190).id,
    'le Refuge sami garde son id',
  );
  assert.strictEqual(at(14).label, 'Ligne de feu');
  assert.match(at(14).description, /^Un incendie court de cime en cime\./);
  assert.strictEqual(at(19).label, "L'homme assis");
  assert.strictEqual(at(19).event_config_json, null, 'épreuve sans points');
  assert.strictEqual(at(19).emoji, '🍵');
  assert.strictEqual(at(22).label, 'Le dernier arbre');
  assert.strictEqual(at(22).emoji, '🌲');
  assert.strictEqual(at(24).label, 'Soleil de minuit');
  assert.strictEqual(at(32).label, '🌫️ La nuit qui tombe');
  assert.strictEqual(
    at(32).description,
    'Le soleil se couche et ne se relève plus. Le blanc avale tout.',
  );
  assert.strictEqual(at(34).label, 'La tempête blanche');
  assert.strictEqual(at(36).label, '🧵 Réécrire la page');
  assert.strictEqual(at(37).label, "Défi d'équipe");
  assert.strictEqual(at(38).label, "L'étoile fixe");
  assert.ok(!markers.some((m) => m.label === 'Halte sous les épicéas'));
  assert.ok(!markers.some((m) => m.label === 'Ours polaire' || m.label === 'Aurores boréales'));

  // Les ids des repères de la taïga repris en place sont conservés.
  for (const order of [10, 20, 60, 110, 160, 170, 210]) {
    assert.strictEqual(
      markers.find((m) => m.order_index === order).id,
      avantE.find((m) => m.order_index === order).id,
    );
  }
  // 🌫️ 6, 17, 26, 32 · 🧵 16, 36 · ➡️ 11, 31 · défis 21, 37.
  for (const [pos, prefix] of [
    [6, '🌫️'],
    [17, '🌫️'],
    [26, '🌫️'],
    [32, '🌫️'],
    [16, '🧵'],
    [36, '🧵'],
    [11, '➡️'],
    [31, '➡️'],
  ]) {
    assert.ok(at(pos).label.startsWith(prefix), `case ${pos} : ${at(pos).label}`);
  }
  assert.strictEqual(at(21).label, "Défi d'équipe");

  // Le chapitre mis de côté n'a pas bougé (repères compris).
  assert.deepStrictEqual(await markersOf(chapterT), avantT);
});

test('fusion : les quiz tirent dans le biome de leur case', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const quizzes = (await markersOf(chapterE)).filter((m) => m.event_type === 'quiz');
  assert.strictEqual(quizzes.length, 14);
  const categories = {};
  const niveaux = {};
  for (const m of quizzes) {
    const pool = resolveMarkerEventConfig(m).question.pool;
    assert.strictEqual(pool.biomeMode, 'sous_biome', `quiz ${m.order_index}`);
    categories[pool.categorieSlugs[0]] = (categories[pool.categorieSlugs[0]] || 0) + 1;
    niveaux[pool.niveaux[0]] = (niveaux[pool.niveaux[0]] || 0) + 1;
  }
  assert.deepStrictEqual(categories, {
    faune: 2,
    flore: 2,
    climat: 2,
    geologie: 2,
    ecologie: 2,
    geographie: 2,
    conservation: 1,
    vocabulaire: 1,
  });
  assert.deepStrictEqual(niveaux, { approfondissement: 11, base: 3 });
  const ecologie25 = quizzes.find((m) => m.order_index === 250);
  assert.deepStrictEqual(resolveMarkerEventConfig(ecologie25).question.pool.niveaux, [
    'approfondissement',
  ]);
});

test('fusion : chapitres, biomes et textes', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const e = await queryOne('SELECT * FROM gl_chapters WHERE id = ?', [chapterE]);
  assert.strictEqual(e.title, 'Chapitre 4 — Eurasie continentale');
  assert.strictEqual(Number(e.plateau_number), 4);
  assert.strictEqual(e.biome, 'Taïga & toundra arctique (été et nuit polaires)');
  assert.match(e.story_markdown, /^!\[Le dernier campement de Selene\]\(scene:1\)/);
  assert.match(e.story_markdown, /\*\*La rencontre\.\*\* Dans un dernier coin vert/);
  assert.match(e.biotope_markdown, /### La limite des arbres/);
  assert.match(e.biocenose_markdown, /### Toundra — nuit polaire/);
  assert.strictEqual(
    e.sortileges_markdown,
    '## Sortilèges du chapitre\n\n' +
      'Sur ce plateau, le **Souffle** prend deux visages : *Le Détricotage* dans la taïga, ' +
      "puis *L'Effacement* au-delà des arbres. Aux cases **Souffle** (🌫️), il éprouve les deux " +
      'peuples différemment ; aux cases **Trame** (🧵), le choix Gnome (cœur) ou Licorne ' +
      '(gemme) dessine la voie que vous incarnez.\n\n- Sortilège de la mousse\n',
  );
  // Garde-fous de lore sur les textes affichés en début de chapitre.
  for (const text of [e.story_markdown, e.biotope_markdown, e.biocenose_markdown]) {
    assert.doesNotMatch(text, /monstre|ennemi/i);
  }
  const biomes = await queryAll(
    'SELECT biome_slug, order_index FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index',
    [chapterE],
  );
  assert.deepStrictEqual(
    biomes.map((b) => [b.biome_slug, Number(b.order_index)]),
    [
      ['taiga', 0],
      ['toundra', 10],
    ],
  );

  const tch = await queryOne('SELECT * FROM gl_chapters WHERE id = ?', [chapterT]);
  assert.strictEqual(tch.title, 'Chapitre 5 — Toundra arctique (mis de côté)');
  assert.strictEqual(tch.plateau_number, null);
  assert.strictEqual(Number(tch.order_index), 900);
  assert.strictEqual(tch.story_markdown, 'Récit de la toundra (dévoile la chute).');
});

test('fusion : zones du royaume sans chevauchement, chaque case dans la bonne', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const zones = await queryAll(
    'SELECT * FROM gl_kingdom_zones WHERE chapter_id = ? ORDER BY label',
    [chapterE],
  );
  assert.deepStrictEqual(
    zones.map((z) => z.label),
    ['Taïga', 'Toundra — été polaire', 'Toundra — nuit polaire'],
  );
  const byLabel = Object.fromEntries(zones.map((z) => [z.label, z]));
  assert.strictEqual(byLabel['Taïga'].popover_markdown, 'Popover taïga');
  assert.strictEqual(byLabel['Toundra — été polaire'].popover_markdown, 'Popover été');
  assert.strictEqual(
    byLabel['Toundra — été polaire'].music_urls_json,
    '["/uploads/media-library/audio/ete.mp3"]',
  );
  assert.strictEqual(byLabel['Toundra — nuit polaire'].popover_markdown, 'Popover nuit');
  assert.match(byLabel['Toundra — nuit polaire'].popover_images_json, /nuit\.png/);
  assert.strictEqual(Number(byLabel['Toundra — nuit polaire'].music_volume), 0.5);

  const polygons = zones.map((z) => ({ label: z.label, points: JSON.parse(z.points_json) }));
  const expected = (sb) =>
    sb === 'toundra_ete'
      ? 'Toundra — été polaire'
      : sb === 'toundra_hiver'
        ? 'Toundra — nuit polaire'
        : 'Taïga';
  for (const m of await markersOf(chapterE)) {
    const hits = polygons.filter((p) => pointInPolygon(Number(m.x_pct), Number(m.y_pct), p.points));
    assert.deepStrictEqual(
      hits.map((p) => p.label),
      [expected(m.sous_biome_slug)],
      `case ${m.order_index}`,
    );
  }
  for (let x = 4; x < 97; x += 1.3) {
    for (let y = 6; y < 95; y += 1.3) {
      const hits = polygons.filter((p) => pointInPolygon(x, y, p.points));
      assert.ok(hits.length <= 1, `chevauchement en (${x}, ${y})`);
    }
  }

  // Le feuillet rattaché à la nuit du chapitre mis de côté suit la nuit du chapitre fusionné.
  const feuillet = await queryOne(
    "SELECT kingdom_zone_id FROM gl_lore_feuillets WHERE feuillet_code = 'fus-zone-hiver'",
  );
  assert.strictEqual(
    Number(feuillet.kingdom_zone_id),
    Number(byLabel['Toundra — nuit polaire'].id),
  );
});

test('fusion : QCM lore ch5 → ch4, renumérotés à la suite', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const rows = await queryAll(
    `SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie
       FROM gl_qcm_lore_questions
      WHERE question_code IN (${LORE_CODES.map(() => '?').join(', ')})
      ORDER BY question_code`,
    LORE_CODES,
  );
  assert.deepStrictEqual(
    rows.map((r) => [r.question_code, r.chapitre_slug, Number(r.numero_dans_categorie)]),
    [
      ['LQCMF4001', 'ch4', 1],
      ['LQCMF4002', 'ch4', 2],
      ['LQCMF5001', 'ch4', 3],
      ['LQCMF5002', 'ch4', 4],
      ['LQCMF5003', 'ch4', 5],
      ['LQCMF5004', 'ch4', 1],
    ],
  );
  const scopes = await queryAll(
    "SELECT slug, nom, description FROM gl_qcm_lore_scopes WHERE slug IN ('ch4', 'ch5') ORDER BY slug",
  );
  assert.deepStrictEqual(scopes, [
    {
      slug: 'ch4',
      nom: 'Eurasie continentale',
      description: "Taïga & toundra. Le Détricotage, puis l'Effacement.",
    },
    { slug: 'ch5', nom: 'Toundra arctique (mis de côté)', description: 'Scope ch5' },
  ]);
});

test('fusion : feuillets raccourcis, rebasés, plateau 4 ; récit inchangé', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const codes = allFixtureFeuilletCodes();
  const rows = await queryAll(
    `SELECT feuillet_code, titre, biome_slug, plateau_number, statut, lien_pays, ordre_recit
       FROM gl_lore_feuillets WHERE feuillet_code IN (${codes.map(() => '?').join(', ')})`,
    codes,
  );
  const byCode = Object.fromEntries(rows.map((r) => [r.feuillet_code, r]));
  for (const code of FEUILLETS_INACTIFS) {
    assert.strictEqual(byCode[code].statut, 'inactif', code);
  }
  for (const code of FEUILLETS_REBASES) {
    assert.strictEqual(byCode[code].biome_slug, 'taiga', code);
    assert.strictEqual(byCode[code].statut, 'actif', code);
  }
  assert.strictEqual(byCode['ep-VII-rechute'].titre, "Les grands froids. J'ai recompté.");

  const actifs = rows.filter((r) => r.statut === 'actif');
  assert.deepStrictEqual(
    actifs.filter((r) => r.biome_slug === 'desert_froid').map((r) => r.feuillet_code),
    ['page-dfroid'],
  );
  assert.deepStrictEqual(
    actifs.filter((r) => Number(r.plateau_number) === 5),
    [],
  );
  for (const code of FEUILLETS_P5) {
    assert.strictEqual(Number(byCode[code].plateau_number), 4, code);
    assert.strictEqual(Number(byCode[code].lien_pays), 5, `${code} : le pays du Livre reste 5`);
  }
  // `page-dfroid` reste atteignable par le plateau 4 du chapitre fusionné.
  assert.ok(
    await isFeuilletInChapterPool(db, { chapterId: chapterE, feuilletCode: 'page-dfroid' }),
  );

  // Nomination du corbeau toujours en toute fin du récit du chapitre.
  const poolE = await resolveChapterFeuilletPool(db, { chapterId: chapterE });
  const recit = [...poolE].sort((a, b) => Number(a.ordre_recit) - Number(b.ordre_recit));
  assert.deepStrictEqual(
    recit.slice(-2).map((f) => f.feuillet_code),
    ['sc-nom', 'ep-VIII-09'],
  );
});

test('zones feuillets : 21 zones (P4 = 10), centrées sur les cases du chapitre fusionné', async (t) => {
  const zones = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8')).zones;
  const countBy = {};
  for (const z of zones) countBy[z.plateau] = (countBy[z.plateau] || 0) + 1;
  assert.deepStrictEqual(countBy, { 1: 4, 2: 3, 3: 4, 4: 10 });
  const p4 = zones.filter((z) => z.plateau === 4);
  assert.deepStrictEqual(
    p4.map((z) => z.zone_id),
    Array.from({ length: 10 }, (_, i) => `zf-p4-${String(i + 1).padStart(2, '0')}`),
  );
  for (const zone of p4) {
    assert.strictEqual(zone.board_image, 'GL_plateau-4_fond.png');
    assert.ok(
      !FEUILLETS_INACTIFS.includes(zone.feuillet_code),
      `${zone.feuillet_code} : un feuillet de zone ne peut pas être raccourci`,
    );
  }
  // Chaque zone se pose sur une dalle du relevé (et celles des moments-clés, sur la bonne).
  const dalleOf = (zone) =>
    COORDS.findIndex(
      ([x, y]) =>
        Math.abs(x / 100 - zone.centre[0]) < 0.0011 && Math.abs(y / 100 - zone.centre[1]) < 0.0011,
    ) + 1;
  assert.deepStrictEqual(
    p4.map((z) => dalleOf(z)),
    [6, 13, 22, 25, 29, 32, 34, 35, 37, 38],
  );
  if (skipReason) return t.skip(skipReason);
  const codes = p4.map((z) => z.feuillet_code);
  const actifs = await queryAll(
    `SELECT feuillet_code FROM gl_lore_feuillets
      WHERE statut = 'actif' AND feuillet_code IN (${codes.map(() => '?').join(', ')})`,
    codes,
  );
  assert.strictEqual(actifs.length, codes.length, 'chaque feuillet de zone reste actif');
});

test('rejouer la migration ne change plus rien', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const avant = await snapshot();
  await runMigration();
  assert.strictEqual(await snapshot(), avant);
});

test('interrompue en plein milieu puis relancée, la migration aboutit au même résultat', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const reference = await fusionResult();
  const statements = splitSqlStatements(migrationSql());
  const cuts = [
    statements.findIndex((stmt) => stmt.startsWith('INSERT INTO gl_chapter_markers')),
    statements.findIndex((stmt) => stmt.startsWith('DELETE FROM gl_chapter_markers')),
  ];
  assert.ok(cuts.every((i) => i > 0));
  for (const cut of cuts) {
    await dropFixtures();
    await createFixtures();
    // Le runner s'arrête sur une erreur après la requête `cut` : on la simule.
    await runMigration(statements.slice(0, cut + 1));
    await runMigration();
    assert.strictEqual(await fusionResult(), reference, `reprise après la requête ${cut}`);
  }
});
