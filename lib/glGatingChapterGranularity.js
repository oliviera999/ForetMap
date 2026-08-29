'use strict';

// Résout la granularité chapitre/scope (4e couche GL) pour le runtime gating.

const { normalizeGranularity } = require('./shared/resourceQuestionGatingCore');

async function chapterGranularityFromGame(db, gameId) {
  const gid = Number(gameId);
  if (!Number.isFinite(gid) || gid <= 0) return null;
  try {
    const row = await db.queryOne(
      `SELECT c.gating_granularity
         FROM gl_games g
         INNER JOIN gl_chapters c ON c.id = g.chapter_id
        WHERE g.id = ? LIMIT 1`,
      [gid],
    );
    return normalizeGranularity(row?.gating_granularity) || null;
  } catch (_err) {
    return null;
  }
}

async function scopeGranularityFromLoreLink(db, resourceType, resourceRef) {
  try {
    const row = await db.queryOne(
      `SELECT s.gating_granularity
         FROM gl_resource_question_links l
         INNER JOIN gl_qcm_lore_questions q ON q.question_code = l.question_code
         INNER JOIN gl_qcm_lore_scopes s ON s.slug = q.chapitre_slug
        WHERE l.resource_type = ? AND l.resource_ref = ? AND l.status = 'approved'
        ORDER BY l.weight DESC, l.question_code ASC
        LIMIT 1`,
      [resourceType, resourceRef],
    );
    return normalizeGranularity(row?.gating_granularity) || null;
  } catch (_err) {
    return null;
  }
}

/**
 * Granularité chapitre/scope pour une ressource GL (best-effort).
 * @param {object} db
 * @param {{ resourceType: string, resourceRef: string, glAuth?: object }} params
 */
async function resolveGlChapterGranularity(db, { resourceType, resourceRef, glAuth = null } = {}) {
  const fromGame = await chapterGranularityFromGame(db, glAuth?.gameId);
  if (fromGame) return fromGame;

  const rt = String(resourceType || '').trim();
  if (rt === 'feuillet' || rt === 'lore_glossary') {
    const fromScope = await scopeGranularityFromLoreLink(db, rt, resourceRef);
    if (fromScope) return fromScope;
  }
  return null;
}

module.exports = {
  resolveGlChapterGranularity,
  chapterGranularityFromGame,
  scopeGranularityFromLoreLink,
};
