'use strict';

/**
 * Gabarits d'équipes par classe G&L (`gl.classes.team_templates`, section 10.2).
 * Commodité de saisie : les lignes `gl_teams` de la partie font foi ensuite.
 */

const { queryOne, execute } = require('../../database');
const { typeFromTeamName, TEAM_COLOR_PALETTE } = require('./teamNaming');

const SETTING_KEY = 'gl.classes.team_templates';
const TEAM_TYPES = new Set(['gnome', 'unicorn']);

function normalizeOne(raw, index) {
  const at = `équipe n°${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `${at} : objet { name, type? } attendu` };
  }
  const name = String(raw.name || '')
    .trim()
    .slice(0, 80);
  if (!name) return { error: `${at} : nom requis` };
  let type = String(raw.type || '')
    .trim()
    .toLowerCase();
  if (!TEAM_TYPES.has(type)) type = typeFromTeamName(name) || '';
  if (!TEAM_TYPES.has(type)) {
    return { error: `${at} : type gnome ou licorne (ou un nom commençant par gnome/licorne)` };
  }
  return { team: { name, type } };
}

function normalizeTeamTemplates(raw) {
  if (raw == null || raw === '') return { templates: {} };
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { error: 'gabarits d’équipes : JSON objet attendu' };
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'gabarits d’équipes : objet { classId: [équipes] } attendu' };
  }
  const templates = {};
  for (const [key, list] of Object.entries(raw)) {
    const classId = Number(key);
    if (!Number.isInteger(classId) || classId <= 0) {
      return { error: `identifiant de classe invalide : ${key}` };
    }
    if (!Array.isArray(list)) return { error: `classe ${classId} : liste d’équipes attendue` };
    const teams = [];
    const names = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const result = normalizeOne(list[i], i);
      if (result.error) return { error: `classe ${classId} : ${result.error}` };
      const slug = result.team.name.toLowerCase();
      if (names.has(slug)) return { error: `classe ${classId} : nom d’équipe en double` };
      names.add(slug);
      teams.push(result.team);
    }
    templates[classId] = teams;
  }
  return { templates };
}

async function loadTeamTemplates() {
  let row;
  try {
    row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
      SETTING_KEY,
    ]);
  } catch {
    return {};
  }
  if (!row) return {};
  let parsed = row.value_json;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  const { templates } = normalizeTeamTemplates(parsed);
  return templates || {};
}

async function seedTeamsFromTemplate({ gameId, classId }) {
  const templates = await loadTeamTemplates();
  const teams = templates[Number(classId)] || [];
  if (!teams.length) return 0;
  const existing = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? LIMIT 1', [gameId]);
  if (existing) return 0;
  let n = 0;
  for (const team of teams) {
    const color = TEAM_COLOR_PALETTE[n % TEAM_COLOR_PALETTE.length];
    await execute(
      `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, NOW(), NOW())`,
      [gameId, team.name, team.type, color],
    );
    n += 1;
  }
  return n;
}

module.exports = {
  SETTING_KEY,
  normalizeTeamTemplates,
  loadTeamTemplates,
  seedTeamsFromTemplate,
};
