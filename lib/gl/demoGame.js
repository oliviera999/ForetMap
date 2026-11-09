'use strict';

/**
 * **Partie de démonstration** G&L (scénario 3 des modes de démonstration : réunion de
 * parents, conseil pédagogique, inspection).
 *
 * Le MJ prépare d'un clic — ou par `npm run gl:demo:seed` — une classe et une partie
 * **fictives** : six joueurs « Gnome Démo n » / « Licorne Démo n », deux équipes, le premier
 * plateau. Il la joue depuis la console et la projette (jeton de projection existant). La
 * réinitialiser efface la partie (équipes, évènements, tours… par cascade) et la recrée ;
 * les joueurs fictifs sont conservés, leur vitalité remise aux défauts.
 *
 * Jamais d'élève réel ici : les pseudos sont réservés (`demo-gnome-1`…) et la classe comme
 * la partie portent `is_demo = 1` (migration 336), ce qui les tient hors des exports
 * (joueurs, Team Spirit, badges) et les signale dans la console.
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { execute, queryAll, queryOne, withTransaction } = require('../../database');
const {
  ensureForetmapGroupForGlClass,
  upsertForetmapUserForGlPlayer,
} = require('../glGroupBridge');
const { getGameplaySettings } = require('../glSettings');
const { getDefaultVitalityFromSettings, resolveVitalityCaps } = require('../glVitality');
const { applyBourseDeltaTx } = require('../glBourses');
const { isTenirEnabled } = require('../glTenir');
const { TEAM_COLOR_PALETTE } = require('./teamNaming');

const GL_DEMO_CLASS_NAME = 'Classe de démonstration';
const GL_DEMO_CLASS_SCHOOL = 'Démonstration';
const GL_DEMO_GAME_NAME = 'Partie de démonstration';

/** Équipes fictives : nom typé par peuple (`typeFromTeamName` les reconnaîtrait aussi). */
const GL_DEMO_TEAMS = Object.freeze([
  { key: 'gnome', name: 'Gnomes démo', type: 'gnome' },
  { key: 'unicorn', name: 'Licornes démo', type: 'unicorn' },
]);

/** Joueurs fictifs : trois par équipe. Les pseudos sont réservés à la démo. */
const GL_DEMO_PLAYERS = Object.freeze([
  { pseudo: 'demo-gnome-1', firstName: 'Gnome', lastName: 'Démo 1', team: 'gnome' },
  { pseudo: 'demo-gnome-2', firstName: 'Gnome', lastName: 'Démo 2', team: 'gnome' },
  { pseudo: 'demo-gnome-3', firstName: 'Gnome', lastName: 'Démo 3', team: 'gnome' },
  { pseudo: 'demo-licorne-1', firstName: 'Licorne', lastName: 'Démo 1', team: 'unicorn' },
  { pseudo: 'demo-licorne-2', firstName: 'Licorne', lastName: 'Démo 2', team: 'unicorn' },
  { pseudo: 'demo-licorne-3', firstName: 'Licorne', lastName: 'Démo 3', team: 'unicorn' },
]);

function normalizeActorId(actorId) {
  const value = actorId == null ? '' : String(actorId).trim();
  return value || null;
}

async function findGlDemoClass() {
  return queryOne(
    'SELECT id, name, school, is_active, foretmap_group_id FROM gl_classes WHERE is_demo = 1 ORDER BY id ASC LIMIT 1',
  );
}

async function findGlDemoGame() {
  return queryOne(
    `SELECT g.id, g.name, g.status, g.class_id, g.chapter_id, g.created_at, g.updated_at,
            ch.title AS chapter_title
       FROM gl_games g
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.is_demo = 1
   ORDER BY g.id DESC
      LIMIT 1`,
  );
}

/** Premier plateau (`plateau_number = 1`), sinon le premier chapitre dans l'ordre éditorial. */
async function resolveDemoChapterId() {
  const plateau = await queryOne(
    'SELECT id FROM gl_chapters WHERE plateau_number = 1 ORDER BY order_index ASC, id ASC LIMIT 1',
  );
  if (plateau?.id) return Number(plateau.id);
  const first = await queryOne(
    'SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1',
  );
  return first?.id ? Number(first.id) : null;
}

async function ensureDemoClass(actorId) {
  const existing = await findGlDemoClass();
  if (existing) {
    if (!Number(existing.is_active)) {
      await execute('UPDATE gl_classes SET is_active = 1, updated_at = NOW() WHERE id = ?', [
        existing.id,
      ]);
    }
    return { row: existing, created: false };
  }
  const inserted = await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, NOW(), NOW())`,
    [GL_DEMO_CLASS_NAME, GL_DEMO_CLASS_SCHOOL, actorId],
  );
  const row = await queryOne(
    'SELECT id, name, school, is_active, foretmap_group_id FROM gl_classes WHERE id = ? LIMIT 1',
    [inserted.insertId],
  );
  // Groupe miroir ForetMap, comme pour toute classe créée depuis la console.
  await ensureForetmapGroupForGlClass(row);
  return { row, created: true };
}

/**
 * Joueurs fictifs : créés s'ils manquent (compte miroir `users` via le pont, mot de passe
 * aléatoire jamais restitué — personne ne se connecte avec), vitalité remise aux défauts
 * sur une réinitialisation. Un pseudo de démo déjà pris par une **autre** classe est une
 * anomalie : on refuse plutôt que d'annexer un élève.
 */
async function ensureDemoPlayers(classId, { reset }) {
  const gameplay = await getGameplaySettings();
  const vitality = getDefaultVitalityFromSettings(gameplay);
  const caps = resolveVitalityCaps(gameplay);
  const ids = new Map();
  for (const spec of GL_DEMO_PLAYERS) {
    const existing = await queryOne(
      'SELECT id, class_id, is_active, health_points, power_points FROM gl_players WHERE pseudo = ? LIMIT 1',
      [spec.pseudo],
    );
    if (existing) {
      if (Number(existing.class_id) !== Number(classId)) {
        throw new Error(
          `Le pseudo « ${spec.pseudo} » est déjà utilisé hors de la classe de démonstration`,
        );
      }
      if (!Number(existing.is_active)) {
        await execute('UPDATE gl_players SET is_active = 1, updated_at = NOW() WHERE id = ?', [
          existing.id,
        ]);
      }
      if (reset) {
        // Les bourses ne s'écrivent que par le grand livre (`lib/glBourses.js`) : la remise aux
        // défauts est un geste du prof, tracé comme tel.
        const dh = vitality.health - (Number(existing.health_points) || 0);
        const dg = vitality.power - (Number(existing.power_points) || 0);
        if (dh !== 0 || dg !== 0) {
          await withTransaction((tx) =>
            applyBourseDeltaTx(tx, {
              playerId: existing.id,
              dh,
              dg,
              cause: 'geste_prof',
              caps,
            }),
          );
        }
      }
      ids.set(spec.pseudo, Number(existing.id));
      continue;
    }
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
    const link = await upsertForetmapUserForGlPlayer({
      classId,
      firstName: spec.firstName,
      lastName: spec.lastName,
      pseudo: spec.pseudo,
      passwordHash,
      passwordMustReset: false,
      dedupe: false,
    });
    if (!link.ok) throw new Error(link.error || 'Liaison ForetMap impossible pour la démo');
    const inserted = await execute(
      `INSERT INTO gl_players
        (class_id, first_name, last_name, pseudo, linked_foretmap_user_id, is_active,
         health_points, power_points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
      [
        classId,
        spec.firstName,
        spec.lastName,
        spec.pseudo,
        link.user.id,
        vitality.health,
        vitality.power,
      ],
    );
    ids.set(spec.pseudo, Number(inserted.insertId));
  }
  return ids;
}

async function createDemoGame({ classId, actorId }) {
  const chapterId = await resolveDemoChapterId();
  if (!chapterId) throw new Error('Aucun chapitre disponible pour la partie de démonstration');
  const gameplay = await getGameplaySettings();
  const tenirProfil = isTenirEnabled(gameplay) ? 'complet' : null;
  const tenirSurface = tenirProfil ? gameplay.tenirSurface || 'tableau' : null;
  const inserted = await execute(
    `INSERT INTO gl_games
      (class_id, chapter_id, name, status, created_by, tenir_profil, tenir_surface, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, 1, NOW(), NOW())`,
    [classId, chapterId, GL_DEMO_GAME_NAME, actorId, tenirProfil, tenirSurface],
  );
  const gameId = Number(inserted.insertId);
  const teamIds = {};
  let n = 0;
  for (const team of GL_DEMO_TEAMS) {
    const color = TEAM_COLOR_PALETTE[n % TEAM_COLOR_PALETTE.length];
    const teamInserted = await execute(
      `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, NOW(), NOW())`,
      [gameId, team.name, team.type, color],
    );
    teamIds[team.key] = Number(teamInserted.insertId);
    n += 1;
  }
  return { gameId, chapterId, teamIds };
}

/**
 * Prépare (ou remet à zéro) la partie de démonstration.
 *
 * @param {{ actorId?: string|number|null, reset?: boolean }} [options]
 *   `reset` : efface la partie de démonstration existante et la recrée. Sans `reset`, une
 *   partie existante est rendue telle quelle (appel idempotent).
 * @returns {Promise<{ classId: number, gameId: number, chapterId: number, teamIds: Record<string, number>, playerIds: number[], created: boolean, classCreated: boolean }>}
 */
async function ensureGlDemoGame(options = {}) {
  const actorId = normalizeActorId(options.actorId);
  const reset = options.reset === true;
  const { row: demoClass, created: classCreated } = await ensureDemoClass(actorId);
  const classId = Number(demoClass.id);
  const playerIds = await ensureDemoPlayers(classId, { reset });

  const existingGame = await findGlDemoGame();
  if (existingGame && !reset) {
    return {
      classId,
      gameId: Number(existingGame.id),
      chapterId: Number(existingGame.chapter_id),
      teamIds: Object.fromEntries(
        (
          await queryAll('SELECT id, type FROM gl_teams WHERE game_id = ? ORDER BY id ASC', [
            existingGame.id,
          ])
        ).map((team) => [team.type, Number(team.id)]),
      ),
      playerIds: [...playerIds.values()],
      created: false,
      classCreated,
    };
  }
  if (existingGame) {
    // Toutes les parties de démo, au cas où une précédente aurait survécu (cascade FK).
    await execute('DELETE FROM gl_games WHERE is_demo = 1');
  }

  const { gameId, chapterId, teamIds } = await createDemoGame({ classId, actorId });
  for (const spec of GL_DEMO_PLAYERS) {
    const playerId = playerIds.get(spec.pseudo);
    const teamId = teamIds[spec.team];
    if (!playerId || !teamId) continue;
    await execute(
      `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)`,
      [gameId, teamId, playerId],
    );
  }
  return {
    classId,
    gameId,
    chapterId,
    teamIds,
    playerIds: [...playerIds.values()],
    created: true,
    classCreated,
  };
}

/** Résumé pour la console : `null` si aucune partie de démonstration n'existe. */
async function describeGlDemoGame() {
  const demoClass = await findGlDemoClass();
  const game = await findGlDemoGame();
  if (!demoClass && !game) return null;
  const playersCount = demoClass
    ? Number(
        (
          await queryOne(
            'SELECT COUNT(*) AS n FROM gl_players WHERE class_id = ? AND is_active = 1',
            [demoClass.id],
          )
        )?.n || 0,
      )
    : 0;
  return {
    classId: demoClass ? Number(demoClass.id) : null,
    className: demoClass?.name || null,
    playersCount,
    game: game
      ? {
          id: Number(game.id),
          name: game.name,
          status: game.status,
          chapterId: game.chapter_id != null ? Number(game.chapter_id) : null,
          chapterTitle: game.chapter_title || null,
          updatedAt: game.updated_at || null,
        }
      : null,
  };
}

module.exports = {
  GL_DEMO_CLASS_NAME,
  GL_DEMO_GAME_NAME,
  GL_DEMO_PLAYERS,
  GL_DEMO_TEAMS,
  ensureGlDemoGame,
  describeGlDemoGame,
  findGlDemoClass,
  findGlDemoGame,
};
