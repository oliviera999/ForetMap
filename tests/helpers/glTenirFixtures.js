'use strict';

/**
 * Fixtures « Tenir à deux » — ANONYMES (aucun nom, aucun e-mail, aucun mot de passe réel).
 *
 * - `ensureTenirCorpus()` : 4 chapitres de plateau 1-4 (`tenir-ex-plateau-N`) avec 12 repères
 *   numérotés, biomes, 2 feuillets et 2 questions 6ème par plateau (codes du jeu d'exemple
 *   `data/gl/tenir/exemple/`), catégories `faune` / `flore`.
 * - `createTenirGame()` : classe + 10 joueurs (`joueur-a-<stamp>` …) + partie `live` en profil
 *   `complet` avec 4 équipes (2 gnomes, 2 licornes) placées sur la case départ.
 */

const { execute, queryOne, queryAll } = require('../../database');
const { invalidateGameplayCache } = require('../../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./glFixtures');

const BIOMES = {
  1: ['jungle_afc', 'savane'],
  2: ['sahara', 'foret_mediterraneenne'],
  3: ['foret_caducifoliee', 'landes'],
  4: ['taiga', 'toundra'],
};

async function setGlSetting(key, value) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  invalidateGameplayCache();
}

/** Réglages de base d'une suite « tenir » : mouture active, vitalité, plafonds 8/8, Marché. */
async function enableTenirSettings(extra = {}) {
  const base = {
    'gameplay.tenir_enabled': true,
    'gameplay.vitality_enabled': true,
    'gameplay.max_health_points': 8,
    'gameplay.max_power_points': 8,
    'gameplay.market_hearts_enabled': true,
    'gameplay.lore_gemme_costs_enabled': false,
    'gameplay.lore_heart_rewards_enabled': false,
    'modules.market_enabled': true,
    'modules.spell_cast_enabled': true,
    'gameplay.spell_cast_contribution_mode': 'coordinator',
    'gameplay.spell_cast_team_scope': 'own_team',
    'gameplay.marker_effect_auto_move_enabled': true,
    ...extra,
  };
  for (const [key, value] of Object.entries(base)) await setGlSetting(key, value);
  const { invalidateModulesCache } = require('../../lib/glSettings');
  invalidateModulesCache();
}

async function ensureCategory(slug) {
  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, ?, 0, NOW(), NOW()) ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [slug, slug],
  );
}

// `numero_dans_categorie` unique par (biome, catégorie) : plage 9000+ pour ne jamais entrer en
// collision avec le catalogue réel importé par d'autres suites (`uq_gl_qcm_biome_cat_num`).
let questionNumero = 9000;

async function ensureQuestion(code, biome, categorie, { niveau = '6ème' } = {}) {
  questionNumero += 1;
  await execute(
    `INSERT INTO gl_qcm_questions (
       question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, niveau, statut, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'La forêt respire', 'Le sable chante', 'La neige écoute', 'La rivière compte', '', 'A', ?, 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE biome_slug = VALUES(biome_slug), categorie_slug = VALUES(categorie_slug),
       numero_dans_categorie = VALUES(numero_dans_categorie), statut = 'actif', updated_at = NOW()`,
    [code, biome, categorie, questionNumero, `Question d'exemple ${code} ?`, niveau],
  );
}

async function ensureFeuillet(
  code,
  plateau,
  biome,
  { type = 'feuillet', modeApparition = 'ancre_biome' } = {},
) {
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, incipit, texte, texte_accessible, biome_slug,
        plateau_number, mode_apparition, ordre_voyage, statut, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE plateau_number = VALUES(plateau_number), type = VALUES(type), statut = 'actif', updated_at = NOW()`,
    [
      code,
      type,
      `Page d'exemple ${code}`,
      'La forêt respire.',
      'La forêt respire. Le sable chante. La neige écoute. La rivière compte.',
      'La forêt respire.',
      biome,
      plateau,
      modeApparition,
      plateau * 100 + Number(code.slice(-1)),
    ],
  );
}

/** Chapitre de plateau N avec 12 repères numérotés (start, quiz, behavior trame/souffle, finish). */
async function ensureChapter(plateau) {
  const slug = `tenir-ex-plateau-${plateau}`;
  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown, biotope_markdown, biocenose_markdown, plateau_number, order_index, created_at, updated_at)
     VALUES (?, ?, ?, '', '# Story', '# Biotope', '# Biocenose', ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE plateau_number = VALUES(plateau_number), updated_at = NOW()`,
    [slug, `Plateau d'exemple ${plateau}`, BIOMES[plateau][0], plateau, 100 + plateau],
  );
  const chapter = await queryOne('SELECT * FROM gl_chapters WHERE slug = ? LIMIT 1', [slug]);
  for (let i = 0; i < BIOMES[plateau].length; i += 1) {
    await execute(
      `INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
      [chapter.id, BIOMES[plateau][i], i * 10],
    );
  }
  const existing = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_chapter_markers WHERE chapter_id = ?',
    [chapter.id],
  );
  if (Number(existing?.c || 0) === 0) {
    const trame = JSON.stringify({
      version: 2,
      effects: {
        neutral: { label: null, deltaPv: 0, deltaGems: 1, deltaMove: 0, passTurn: false },
      },
      eventMeta: { tonalite: 'trame', rarete: 'commun' },
    });
    const souffle = JSON.stringify({
      version: 2,
      effects: {
        gnome: { label: 'Recule de 1', deltaPv: 0, deltaGems: 0, deltaMove: -1, passTurn: false },
        unicorn: { label: '−1 gemme', deltaPv: 0, deltaGems: -1, deltaMove: 0, passTurn: false },
      },
      eventMeta: { tonalite: 'souffle', rarete: null },
    });
    const quiz = JSON.stringify({
      version: 2,
      question: {
        mode: 'random',
        fixedQuestionCode: null,
        pool: { biomeMode: 'chapter', biomeSlugs: [], categorieSlugs: [], niveaux: [] },
      },
    });
    const finish = JSON.stringify({
      version: 2,
      effects: {
        neutral: { label: null, deltaPv: 0, deltaGems: 0, deltaMove: 0, passTurn: false },
      },
    });
    const defs = [
      ['start', 'Départ', null],
      ['quiz', 'Question 1', quiz],
      ['behavior', 'Trame 1', trame],
      ['point', 'Étape', null],
      ['behavior', 'Souffle 1', souffle],
      ['quiz', 'Question 2', quiz],
      ['event', 'Péripétie', null],
      ['behavior', 'Trame 2', trame],
      ['point', 'Étape 2', null],
      ['quiz', 'Question 3', quiz],
      ['behavior', 'Souffle 2', souffle],
      ['story', 'Camp', finish],
    ];
    for (let i = 0; i < defs.length; i += 1) {
      const [eventType, label, cfg] = defs[i];
      await execute(
        `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          chapter.id,
          5 + i * 8,
          20 + (i % 2) * 10,
          eventType,
          label,
          eventType === 'event' ? '' : label,
          cfg,
          i,
        ],
      );
    }
  }
  await execute(
    `UPDATE gl_chapter_markers SET event_config_json = ? WHERE chapter_id = ? AND label LIKE 'Trame%'`,
    [
      JSON.stringify({
        version: 2,
        effects: {
          neutral: { label: null, deltaPv: 0, deltaGems: 1, deltaMove: 0, passTurn: false },
        },
        eventMeta: { tonalite: 'trame', rarete: 'commun' },
      }),
      chapter.id,
    ],
  );
  const markers = await queryAll(
    'SELECT id, event_type, label, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
    [chapter.id],
  );
  await attachTenirSpells(chapter.id, plateau);
  return { chapter, markers };
}

/** Sorts v2 ouverts au plateau (cumulatifs, `data/gl/tenir/sorts.json`), sur un chapitre. */
async function attachTenirSpells(chapterId, plateau) {
  const path = require('node:path');
  const fs = require('node:fs');
  const file = path.join(__dirname, '..', '..', 'data', 'gl', 'tenir', 'sorts.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ouverture = json.ouverture_par_chapitre || {};
  let cumul = [];
  for (const key of ['1', '2', '3', '4']) {
    cumul = [...new Set([...cumul, ...(ouverture[key] || [])])];
    if (Number(key) === Number(plateau)) break;
  }
  if (Number(plateau) === 4) cumul = [...new Set([...cumul, ...(ouverture.retour || [])])];
  // Déterministe : les sorts v2 du chapitre sont réécrits à chaque passage (une suite a pu en
  // rattacher davantage sur ce chapitre partagé).
  await execute(
    'DELETE cs FROM gl_chapter_spells cs INNER JOIN gl_spells s ON s.spell_code = cs.spell_code WHERE cs.chapter_id = ? AND s.tenir_v2 = 1',
    [chapterId],
  );
  let idx = 0;
  for (const code of cumul) {
    const exists = await queryOne('SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1', [
      code,
    ]);
    if (!exists) continue;
    await execute(
      'INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index) VALUES (?, ?, ?)',
      [chapterId, code, idx * 10],
    );
    idx += 1;
  }
}

/** Corpus complet d'exemple (idempotent). Renvoie `{ chapters: { 1..4: { chapter, markers } } }`. */
async function ensureTenirCorpus() {
  await ensureCategory('faune');
  await ensureCategory('flore');
  const chapters = {};
  for (let p = 1; p <= 4; p += 1) {
    chapters[p] = await ensureChapter(p);
    for (let i = 1; i <= 2; i += 1) {
      await ensureFeuillet(`tenir-ex-p${p}-${i}`, p, BIOMES[p][i - 1]);
      await ensureQuestion(`TEX-P${p}-0${i}`, BIOMES[p][i - 1], i === 1 ? 'faune' : 'flore');
    }
    // Pool de biome : 10 questions présentables par plateau (tests de contenu des cases quiz).
    for (let k = 3; k <= 12; k += 1) {
      await ensureQuestion(
        `TEX-P${p}-${String(k).padStart(2, '0')}`,
        BIOMES[p][k % 2],
        k % 2 ? 'faune' : 'flore',
      );
    }
  }
  return { chapters };
}

/**
 * Partie « tenir » prête à jouer : 4 équipes, 10 joueurs (ou `playerCount`), `live`.
 * @returns {{ admin, adminToken, cls, game, teams, players: [{ id, pseudo, teamId, token }], markers, chapter }}
 */
async function createTenirGame({
  plateau = 1,
  playerCount = 10,
  profil = 'complet',
  status = 'live',
  stamp = Date.now(),
  settings = {},
} = {}) {
  await enableTenirSettings(settings);
  const { chapters } = await ensureTenirCorpus();
  const { chapter, markers } = chapters[plateau];
  const admin = await createGlAdmin({
    email: `mj.tenir.${stamp}@ecole.local`,
    displayName: 'MJ Tenir',
  });
  const cls = await createGlClass({
    name: `Classe Tenir ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: `Partie Tenir ${stamp}`,
    createdBy: admin.id,
    status: 'draft',
    teams: [
      { name: 'Gnomes A', type: 'gnome', color: '#65a30d' },
      { name: 'Gnomes B', type: 'gnome', color: '#84cc16' },
      { name: 'Licornes A', type: 'unicorn', color: '#a855f7' },
      { name: 'Licornes B', type: 'unicorn', color: '#d946ef' },
    ],
  });
  const start = markers[0];
  await execute(
    `UPDATE gl_games SET tenir_profil = ?, tenir_surface = 'tablette', board_movement_mode = 'numbered_path',
            status = ?, updated_at = NOW() WHERE id = ?`,
    [profil, status, seed.game.id],
  );
  await execute(
    'UPDATE gl_teams SET position_marker_id = ?, position_x_pct = NULL, position_y_pct = NULL WHERE game_id = ?',
    [start.id, seed.game.id],
  );
  const players = [];
  const letters = 'abcdefghijklmnop';
  for (let i = 0; i < playerCount; i += 1) {
    const pseudo = `joueur-${letters[i]}-${stamp}`;
    const player = await createGlPlayer({
      classId: cls.id,
      pseudo,
      firstName: 'J',
      lastName: letters[i].toUpperCase(),
    });
    const team = seed.teams[i % 4];
    await assignPlayerToGameTeam({ gameId: seed.game.id, teamId: team.id, playerId: player.id });
    const tokens = await signTokens({ playerId: player.id, playerPseudo: pseudo, teamId: team.id });
    players.push({
      id: Number(player.id),
      pseudo,
      teamId: Number(team.id),
      teamType: team.type,
      token: tokens.playerToken,
    });
  }
  const { adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: [
      'gl.read',
      'gl.game.manage',
      'gl.team.manage',
      'gl.players.manage',
      'gl.event.emit',
      'gl.settings.manage',
      'gl.content.manage',
      'gl.mascot.position',
    ],
  });
  const game = await queryOne('SELECT * FROM gl_games WHERE id = ? LIMIT 1', [seed.game.id]);
  return { admin, adminToken, cls, game, teams: seed.teams, players, markers, chapter };
}

async function readPlayerBourses(playerId) {
  const row = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1',
    [playerId],
  );
  return { health: Number(row.health_points), power: Number(row.power_points) };
}

async function setPlayerBourses(playerId, health, power) {
  await execute('UPDATE gl_players SET health_points = ?, power_points = ? WHERE id = ?', [
    health,
    power,
    playerId,
  ]);
}

/** Importe le jeu d'exemple des zones de chasse et des questions de lecture (idempotent). */
async function importExempleChasse(db, { game = null } = {}) {
  const path = require('node:path');
  const { runImports } = require('../../scripts/gl-import-tenir');
  const dossier = path.join(__dirname, '..', '..', 'data', 'gl', 'tenir', 'exemple');
  const reports = [];
  for (const fichier of ['chasse-zones', 'questions-lecture']) {
    const [rep] = await runImports(db, { fichier, dossier });
    if (rep.errors.length) throw new Error(`import ${fichier} : ${rep.errors.join(' ; ')}`);
    reports.push(rep);
  }
  // Les zones d'exemple appartiennent aux chapitres d'exemple (le chargeur prend le premier
  // chapitre du plateau, qui peut être un chapitre réel dans une base partagée).
  for (let p = 1; p <= 4; p += 1) {
    await execute(
      `UPDATE gl_chasse_zones z SET z.chapter_id = (SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1)
        WHERE z.feuillet_code LIKE ?`,
      [`tenir-ex-plateau-${p}`, `tenir-ex-p${p}-%`],
    );
  }
  if (game) {
    const { initChassePagesForGame } = require('../../lib/glChasse');
    await initChassePagesForGame(db, Number(game.id));
  }
  return reports;
}

/** Ouvre un tour et passe en phase `jeu` (via l'API, jeton MJ). */
async function ouvrirTourEnJeu(request, app, ctx, { phase = 'jeu' } = {}) {
  const auth = { Authorization: `Bearer ${ctx.adminToken}` };
  const ouvert = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/tour/ouvrir`)
    .set(auth);
  if (ouvert.status !== 200)
    throw new Error(`ouvrir : ${ouvert.status} ${JSON.stringify(ouvert.body)}`);
  if (phase === 'ouverture') return ouvert.body;
  const jeu = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/tour/phase`)
    .set(auth)
    .send({ phase: 'jeu' });
  if (jeu.status !== 200) throw new Error(`phase jeu : ${jeu.status} ${JSON.stringify(jeu.body)}`);
  return ouvert.body;
}

module.exports = {
  attachTenirSpells,
  importExempleChasse,
  ouvrirTourEnJeu,
  BIOMES,
  setGlSetting,
  enableTenirSettings,
  ensureTenirCorpus,
  ensureChapter,
  ensureFeuillet,
  ensureQuestion,
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
};
