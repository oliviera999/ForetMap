'use strict';

/**
 * Le voyageur — progression personnelle d'un joueur G&L, indépendante de l'équipe et de
 * l'action du professeur (audit `docs/AUDIT_EXPERIENCE_JOUEUR_GL_2026-10-03.md`, § 10–11).
 *
 * Deux regards, tirés du « pacte du seuil » (`docs/reference/gl/lore-deux-peuples.md`) :
 * - **proche** (gnome, observation) : espèces, glossaire scientifique, écosystèmes, QCM biomes ;
 * - **loin** (licorne, récit) : lexique lore, feuillets trouvés et lus, pages du monde,
 *   QCM lore, articles de « Mon journal » (plafonnés).
 *
 * Le niveau est CALCULÉ à chaque lecture à partir de tables existantes : aucune table de points,
 * aucune monnaie. Les points ne baissent jamais (acquis, réponses justes et feuillets sont
 * durables). Seule la consommation des sortilèges du grimoire est stockée
 * (`gl_voyageur_spell_uses`, migration 317).
 */

const { resolveGlPlayerActiveMembership } = require('./glPlayerMembership');
const { resolveResourceTitle } = require('./glLearnableResources');
const { upsertPlayerFeuilletState } = require('./glLoreFeuillets');

const READER_TYPE = 'gl_player';

/** Points nécessaires pour passer d'un niveau au suivant : 5, 10, 15, 20… (cumul 0, 5, 15, 30…). */
const LEVEL_STEP_POINTS = 5;
/** Points à regagner, après un lancer, pour recharger un sortilège. */
const SPELL_RECHARGE_POINTS = 5;
/** Articles du journal comptés au plus par semaine (on récompense l'écriture, pas le remplissage). */
const JOURNAL_ARTICLES_PER_WEEK = 2;
/** Longueur minimale d'un article pour qu'il compte. */
const JOURNAL_MIN_CHARS = 40;

const STAGES = Object.freeze([
  { name: 'Graine', emoji: '🌰' },
  { name: 'Pousse', emoji: '🌱' },
  { name: 'Tige', emoji: '🌿' },
  { name: 'Arbrisseau', emoji: '🪴' },
  { name: 'Arbre', emoji: '🌳' },
  { name: 'Bosquet', emoji: '🌲' },
  { name: 'Forêt', emoji: '🏞️' },
  { name: 'Forêt ancienne', emoji: '🌌' },
]);

const AFFINITIES = Object.freeze({
  eveil: { key: 'eveil', label: 'Regard qui s’éveille', emoji: '👁️' },
  proche: { key: 'proche', label: 'Regard du proche', emoji: '🍄' },
  loin: { key: 'loin', label: 'Regard du loin', emoji: '🦄' },
  pacte: { key: 'pacte', label: 'Pacte du seuil', emoji: '🌗' },
});

/** Sources comptées dans chaque regard (clé → libellé affiché). */
const REGARD_SOURCES = Object.freeze({
  proche: [
    { key: 'species', label: 'Espèces étudiées' },
    { key: 'glossary', label: 'Termes du glossaire scientifique' },
    { key: 'ecosystem', label: 'Écosystèmes explorés' },
    { key: 'qcm', label: 'Questions des biomes réussies' },
  ],
  loin: [
    { key: 'feuillets_found', label: 'Feuillets trouvés' },
    { key: 'feuillet', label: 'Feuillets lus' },
    { key: 'lore_glossary', label: 'Termes du lexique lore' },
    { key: 'content_page', label: 'Pages du monde lues' },
    { key: 'qcm_lore', label: 'Questions du lore réussies' },
    { key: 'journal', label: 'Articles de « Mon journal »' },
  ],
});

/**
 * Grimoire du voyageur : sortilèges personnels, hors chapitre, lançables à tout moment.
 * Chaque effet est borné et codé ici : aucun arbitrage du MJ n'est nécessaire.
 */
const VOYAGEUR_SPELLS = Object.freeze([
  {
    code: 'seconde_chance',
    name: 'Seconde chance',
    emoji: '🔁',
    regard: 'proche',
    levelRequired: 2,
    targetKind: 'cooldown',
    description:
      'Lève le délai d’attente posé après une mauvaise réponse : tu peux retenter la fiche tout de suite.',
    emptyTargets: 'Aucune fiche n’est en attente : rien à lever pour l’instant.',
  },
  {
    code: 'memoire',
    name: 'Mémoire',
    emoji: '🪶',
    regard: 'loin',
    levelRequired: 3,
    targetKind: 'feuillet',
    description: 'Rend lisible un feuillet de ton carnet que le Souffle a effacé.',
    emptyTargets: 'Aucun feuillet de ton carnet n’est effacé.',
  },
]);

const SPELL_BY_CODE = new Map(VOYAGEUR_SPELLS.map((s) => [s.code, s]));

function makeError(code, status, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/** Points cumulés requis pour atteindre `level` (niveau 1 = 0 point). */
function pointsForLevel(level) {
  const n = Math.max(1, Math.trunc(Number(level) || 1));
  return (LEVEL_STEP_POINTS * n * (n - 1)) / 2;
}

/** Niveau atteint avec `points` (≥ 1). */
function levelForPoints(points) {
  const p = Math.max(0, Math.trunc(Number(points) || 0));
  let level = 1;
  while (pointsForLevel(level + 1) <= p) level += 1;
  return level;
}

function stageForLevel(level) {
  const idx = Math.min(STAGES.length - 1, Math.max(0, Math.trunc(level) - 1));
  return STAGES[idx];
}

/** Penchant : éveil tant que peu de points, sinon proche / loin / pacte selon la part. */
function affinityFor(prochePoints, loinPoints) {
  const total = prochePoints + loinPoints;
  if (total < 6) return AFFINITIES.eveil;
  const share = prochePoints / total;
  if (share >= 0.6) return AFFINITIES.proche;
  if (share <= 0.4) return AFFINITIES.loin;
  return AFFINITIES.pacte;
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Comptes bruts par source, tirés des tables existantes. */
async function loadVoyageurCounts(db, playerId) {
  const readerId = String(playerId);
  const [acks, qcm, feuillets, journal] = await Promise.all([
    db.queryAll(
      `SELECT target_type, COUNT(*) AS cnt
         FROM gl_learning_acknowledgements
        WHERE reader_user_type = ? AND reader_user_id = ?
        GROUP BY target_type`,
      [READER_TYPE, readerId],
    ),
    db.queryAll(
      `SELECT question_dataset, COUNT(DISTINCT question_code) AS cnt
         FROM gl_qcm_attempts
        WHERE reader_user_type = ? AND reader_user_id = ? AND is_correct = 1
        GROUP BY question_dataset`,
      [READER_TYPE, readerId],
    ),
    db.queryOne(
      `SELECT COUNT(*) AS cnt
         FROM gl_player_feuillet_states
        WHERE player_id = ? AND status IN ('discovered', 'read', 'held', 'effaced')`,
      [Number(playerId)],
    ),
    db.queryOne(
      `SELECT COALESCE(SUM(LEAST(w.cnt, ?)), 0) AS cnt
         FROM (
           SELECT YEARWEEK(created_at, 3) AS wk, COUNT(*) AS cnt
             FROM gl_player_journal_articles
            WHERE player_id = ? AND CHAR_LENGTH(body_markdown) >= ?
            GROUP BY YEARWEEK(created_at, 3)
         ) w`,
      [JOURNAL_ARTICLES_PER_WEEK, Number(playerId), JOURNAL_MIN_CHARS],
    ),
  ]);
  const counts = {};
  for (const row of acks || []) counts[String(row.target_type)] = toCount(row.cnt);
  for (const row of qcm || []) counts[String(row.question_dataset)] = toCount(row.cnt);
  counts.feuillets_found = toCount(feuillets?.cnt);
  counts.journal = toCount(journal?.cnt);
  return counts;
}

/** Vue du niveau à partir des comptes (pure, testable sans base). */
function buildVoyageurProgress(counts = {}) {
  const regards = {};
  for (const regard of ['proche', 'loin']) {
    const sources = REGARD_SOURCES[regard].map((src) => ({
      key: src.key,
      label: src.label,
      count: toCount(counts[src.key]),
    }));
    regards[regard] = {
      points: sources.reduce((sum, s) => sum + s.count, 0),
      sources,
    };
  }
  const points = regards.proche.points + regards.loin.points;
  const level = levelForPoints(points);
  const levelStart = pointsForLevel(level);
  const nextLevelAt = pointsForLevel(level + 1);
  return {
    points,
    level,
    stage: stageForLevel(level),
    affinity: affinityFor(regards.proche.points, regards.loin.points),
    levelStart,
    nextLevelAt,
    pointsToNextLevel: nextLevelAt - points,
    regards,
  };
}

/** État d'un sortilège du grimoire pour un joueur (pur). */
function buildSpellState(spell, { level, points, useRow }) {
  const unlocked = level >= spell.levelRequired;
  const usesCount = toCount(useRow?.uses_count);
  const rechargeAt = usesCount > 0 ? toCount(useRow?.last_used_points) + SPELL_RECHARGE_POINTS : 0;
  const charged = unlocked && points >= rechargeAt;
  return {
    code: spell.code,
    name: spell.name,
    emoji: spell.emoji,
    regard: spell.regard,
    levelRequired: spell.levelRequired,
    description: spell.description,
    unlocked,
    charged,
    usesCount,
    pointsToRecharge: unlocked && !charged ? rechargeAt - points : 0,
  };
}

async function loadSpellUses(db, playerId) {
  const rows = await db.queryAll(
    `SELECT spell_code, uses_count, last_used_points
       FROM gl_voyageur_spell_uses
      WHERE player_id = ?`,
    [Number(playerId)],
  );
  return new Map((rows || []).map((r) => [String(r.spell_code), r]));
}

/** Expédition en cours : partie et équipe actives du joueur, ou null. */
async function loadExpedition(db, playerId) {
  const membership = await resolveGlPlayerActiveMembership(playerId, { queryOne: db.queryOne });
  if (!membership?.gameId || !membership?.teamId) return null;
  const row = await db.queryOne(
    `SELECT g.id AS game_id, g.name AS game_name, g.status AS game_status,
            c.title AS chapter_title,
            t.id AS team_id, t.name AS team_name, t.type AS team_type,
            t.mascot_id, t.color
       FROM gl_games g
       JOIN gl_teams t ON t.game_id = g.id
       LEFT JOIN gl_chapters c ON c.id = g.chapter_id
      WHERE g.id = ? AND t.id = ?
      LIMIT 1`,
    [membership.gameId, membership.teamId],
  );
  if (!row) return null;
  const mates = await db.queryAll(
    `SELECT p.pseudo
       FROM gl_team_members tm
       JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.team_id = ? AND tm.player_id <> ? AND p.is_active = 1
      ORDER BY p.pseudo ASC
      LIMIT 12`,
    [membership.gameId, membership.teamId, Number(playerId)],
  );
  return {
    gameId: Number(row.game_id),
    gameName: row.game_name,
    gameStatus: String(row.game_status || ''),
    chapterTitle: row.chapter_title || null,
    teamId: Number(row.team_id),
    teamName: row.team_name,
    teamType: row.team_type === 'unicorn' ? 'unicorn' : 'gnome',
    mascotId: row.mascot_id || null,
    color: row.color || null,
    teammates: (mates || []).map((m) => m.pseudo).filter(Boolean),
  };
}

/** Vue complète du Seuil pour un joueur. */
async function buildVoyageurView(db, playerId) {
  const [counts, uses, expedition] = await Promise.all([
    loadVoyageurCounts(db, playerId),
    loadSpellUses(db, playerId),
    loadExpedition(db, playerId),
  ]);
  const progress = buildVoyageurProgress(counts);
  const grimoire = VOYAGEUR_SPELLS.map((spell) =>
    buildSpellState(spell, {
      level: progress.level,
      points: progress.points,
      useRow: uses.get(spell.code),
    }),
  );
  return { ...progress, grimoire, expedition };
}

function requireSpell(code) {
  const spell = SPELL_BY_CODE.get(String(code || ''));
  if (!spell) throw makeError('UNKNOWN_SPELL', 404, 'Sortilège inconnu');
  return spell;
}

/** Cibles possibles d'un sortilège pour un joueur. */
async function listSpellTargets(db, playerId, code) {
  const spell = requireSpell(code);
  if (spell.targetKind === 'cooldown') {
    const rows = await db.queryAll(
      `SELECT resource_type, resource_ref, locked_until
         FROM gl_resource_gating_cooldowns
        WHERE reader_user_type = ? AND reader_user_id = ? AND locked_until > NOW()
        ORDER BY locked_until ASC
        LIMIT 50`,
      [READER_TYPE, String(playerId)],
    );
    const items = [];
    for (const row of rows || []) {
      const title = await resolveResourceTitle(db, row.resource_type, row.resource_ref);
      items.push({
        target: `${row.resource_type}:${row.resource_ref}`,
        resourceType: row.resource_type,
        resourceRef: row.resource_ref,
        label: title || row.resource_ref,
        lockedUntil: row.locked_until,
      });
    }
    return { spell: spell.code, items, emptyMessage: spell.emptyTargets };
  }
  // Mémoire : feuillets trouvés encore effacés (vue carnet = le moins effacé des sources).
  const rows = await db.queryAll(
    `SELECT src.feuillet_code, MIN(src.effacement_pct) AS pct, f.titre
       FROM (
         SELECT s.feuillet_code, s.status, s.effacement_pct
           FROM gl_game_feuillet_states s
           JOIN gl_team_members tm ON tm.game_id = s.game_id AND tm.team_id = s.team_id
          WHERE tm.player_id = ?
         UNION ALL
         SELECT p.feuillet_code, p.status, p.effacement_pct
           FROM gl_player_feuillet_states p
          WHERE p.player_id = ?
       ) src
       JOIN gl_lore_feuillets f ON f.feuillet_code = src.feuillet_code
      WHERE src.status IN ('discovered', 'read', 'held', 'effaced')
      GROUP BY src.feuillet_code, f.titre
     HAVING MIN(src.effacement_pct) > 0
      ORDER BY f.titre ASC
      LIMIT 50`,
    [Number(playerId), Number(playerId)],
  );
  return {
    spell: spell.code,
    items: (rows || []).map((r) => ({
      target: String(r.feuillet_code),
      label: r.titre || r.feuillet_code,
      effacementPct: toCount(r.pct),
    })),
    emptyMessage: spell.emptyTargets,
  };
}

async function applySecondeChance(tx, playerId, target) {
  const sep = String(target || '').indexOf(':');
  const resourceType = sep > 0 ? target.slice(0, sep) : '';
  const resourceRef = sep > 0 ? target.slice(sep + 1) : '';
  if (!resourceType || !resourceRef) throw makeError('INVALID_TARGET', 400, 'Cible invalide');
  const res = await tx.execute(
    `DELETE FROM gl_resource_gating_cooldowns
      WHERE reader_user_type = ? AND reader_user_id = ?
        AND resource_type = ? AND resource_ref = ? AND locked_until > NOW()`,
    [READER_TYPE, String(playerId), resourceType, resourceRef],
  );
  if (!res.affectedRows) {
    throw makeError('TARGET_NOT_FOUND', 404, 'Aucun délai d’attente en cours sur cette fiche');
  }
  return { resourceType, resourceRef };
}

async function applyMemoire(tx, playerId, target) {
  const code = String(target || '').trim();
  if (!code) throw makeError('INVALID_TARGET', 400, 'Cible invalide');
  const found = await tx.queryOne(
    `SELECT MIN(src.effacement_pct) AS pct
       FROM (
         SELECT s.effacement_pct, s.status
           FROM gl_game_feuillet_states s
           JOIN gl_team_members tm ON tm.game_id = s.game_id AND tm.team_id = s.team_id
          WHERE tm.player_id = ? AND s.feuillet_code = ?
         UNION ALL
         SELECT p.effacement_pct, p.status
           FROM gl_player_feuillet_states p
          WHERE p.player_id = ? AND p.feuillet_code = ?
       ) src
      WHERE src.status IN ('discovered', 'read', 'held', 'effaced')`,
    [Number(playerId), code, Number(playerId), code],
  );
  if (found?.pct == null || toCount(found.pct) === 0) {
    throw makeError('TARGET_NOT_FOUND', 404, 'Ce feuillet n’est pas effacé dans ton carnet');
  }
  // La possession propre garde toujours le moins effacé (LEAST) : poser 0 rend le feuillet
  // lisible partout où le carnet le montre, sans toucher aux états d'équipe.
  await upsertPlayerFeuilletState(tx, {
    playerId: Number(playerId),
    feuilletCode: code,
    status: 'read',
    effacementPct: 0,
  });
  return { feuilletCode: code, previousEffacementPct: toCount(found.pct) };
}

/**
 * Lance un sortilège du grimoire. Vérifie niveau et charge sous verrou de ligne, applique
 * l'effet, puis consomme la charge — le tout dans une transaction.
 */
async function castVoyageurSpell({ db, withTransaction }, playerId, code, target) {
  const spell = requireSpell(code);
  const counts = await loadVoyageurCounts(db, playerId);
  const progress = buildVoyageurProgress(counts);
  if (progress.level < spell.levelRequired) {
    throw makeError('SPELL_LOCKED', 409, `Ce sortilège s’ouvre au niveau ${spell.levelRequired}`);
  }
  return withTransaction(async (tx) => {
    await tx.execute(
      `INSERT IGNORE INTO gl_voyageur_spell_uses (player_id, spell_code, uses_count, last_used_points)
       VALUES (?, ?, 0, 0)`,
      [Number(playerId), spell.code],
    );
    const useRow = await tx.queryOne(
      `SELECT uses_count, last_used_points
         FROM gl_voyageur_spell_uses
        WHERE player_id = ? AND spell_code = ?
        FOR UPDATE`,
      [Number(playerId), spell.code],
    );
    const state = buildSpellState(spell, {
      level: progress.level,
      points: progress.points,
      useRow,
    });
    if (!state.charged) {
      throw makeError(
        'SPELL_NOT_CHARGED',
        409,
        `Ce sortilège se recharge : encore ${state.pointsToRecharge} point(s) à gagner`,
      );
    }
    const effect =
      spell.targetKind === 'cooldown'
        ? await applySecondeChance(tx, playerId, target)
        : await applyMemoire(tx, playerId, target);
    await tx.execute(
      `UPDATE gl_voyageur_spell_uses
          SET uses_count = uses_count + 1,
              last_used_points = ?,
              last_used_at = NOW(),
              last_target = ?
        WHERE player_id = ? AND spell_code = ?`,
      [progress.points, String(target).slice(0, 160), Number(playerId), spell.code],
    );
    const after = buildSpellState(spell, {
      level: progress.level,
      points: progress.points,
      useRow: { uses_count: toCount(useRow?.uses_count) + 1, last_used_points: progress.points },
    });
    return { spell: after, effect };
  });
}

module.exports = {
  LEVEL_STEP_POINTS,
  SPELL_RECHARGE_POINTS,
  JOURNAL_ARTICLES_PER_WEEK,
  JOURNAL_MIN_CHARS,
  STAGES,
  AFFINITIES,
  REGARD_SOURCES,
  VOYAGEUR_SPELLS,
  pointsForLevel,
  levelForPoints,
  stageForLevel,
  affinityFor,
  buildVoyageurProgress,
  buildSpellState,
  loadVoyageurCounts,
  buildVoyageurView,
  listSpellTargets,
  castVoyageurSpell,
};
