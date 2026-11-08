'use strict';

/**
 * « Tenir à deux » v2 — exports CSV par classe (spec § 11) : Team Spirit (élève × séance) et
 * badges. `text/csv; charset=utf-8`, séparateur `;`, BOM UTF-8 (Excel). **Aucun classement,
 * aucune bourse** dans les exports (§ 2).
 */

const BOM = '﻿';
const SEP = ';';

function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  // Injection de formule : un pseudo « =HYPERLINK(…) » ne doit jamais s'exécuter dans Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n']/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLines(header, rows) {
  const lines = [header.map(csvCell).join(SEP)];
  for (const r of rows) lines.push(r.map(csvCell).join(SEP));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function fmtDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Élève × séance : partie, chapitre, tour, date, équipe du moment, peuple, cartes gardées, cartes nommées. */
async function buildTeamSpiritCsv(db, classId) {
  const rows = await db.queryAll(
    `SELECT p.pseudo, p.first_name, p.last_name, g.id AS game_id, g.name AS game_name, c.title AS chapter_title,
            ts.round_number, ts.saisi_at, t.name AS team_name, t.type AS team_type, ts.cartes_gardees, ts.cartes_json
       FROM gl_game_team_spirit ts
       INNER JOIN gl_games g ON g.id = ts.game_id AND g.class_id = ?
       INNER JOIN gl_teams t ON t.id = ts.team_id
       INNER JOIN gl_team_members tm ON tm.game_id = ts.game_id AND tm.team_id = ts.team_id
       INNER JOIN gl_players p ON p.id = tm.player_id
       LEFT JOIN gl_chapters c ON c.id = g.chapter_id
      WHERE g.class_id = ?
      ORDER BY p.pseudo ASC, g.id ASC, ts.round_number ASC`,
    [classId, classId],
  );
  const header = [
    'eleve',
    'prenom',
    'nom',
    'partie',
    'chapitre',
    'tour',
    'date',
    'equipe',
    'peuple',
    'cartes_gardees',
    'cartes_nommees',
  ];
  const data = rows.map((r) => {
    let cartes = '';
    try {
      const v = JSON.parse(r.cartes_json || '[]');
      cartes = Array.isArray(v) ? v.join(', ') : '';
    } catch (_) {
      cartes = '';
    }
    return [
      r.pseudo,
      r.first_name || '',
      r.last_name || '',
      r.game_name,
      r.chapter_title || '',
      Number(r.round_number) || 0,
      fmtDate(r.saisi_at),
      r.team_name,
      r.team_type === 'unicorn' ? 'licornes' : 'gnomes',
      Number(r.cartes_gardees) || 0,
      cartes,
    ];
  });
  return csvLines(header, data);
}

/**
 * Badges (moteur commun, `gl_player_rewards`) : élève, clé, titre, palier, date, mot du prof.
 * Une ligne par palier ou badge décerné, par ordre alphabétique d'élève puis de date : aucun
 * classement, aucun total.
 */
async function buildBadgesCsv(db, classId) {
  const { glRewards } = require('./glRewards');
  const rows = await db.queryAll(
    `SELECT p.pseudo, p.first_name, p.last_name, b.reward_key, b.awarded_at, b.note, b.source_type
       FROM gl_player_rewards b
       INNER JOIN gl_players p ON p.id = b.player_id AND p.class_id = ?
      ORDER BY p.pseudo ASC, b.awarded_at ASC, b.reward_key ASC`,
    [classId],
  );
  const header = ['eleve', 'prenom', 'nom', 'badge', 'libelle', 'palier', 'date', 'mot'];
  const tiers = glRewards.tiers;
  const data = rows.map((r) => {
    const described = glRewards.describeReward(r.reward_key);
    const palier = described?.tier ? tiers[described.tier - 1]?.label || '' : '';
    return [
      r.pseudo,
      r.first_name || '',
      r.last_name || '',
      r.reward_key,
      described?.title || '',
      palier,
      fmtDate(r.awarded_at),
      r.note || '',
    ];
  });
  return csvLines(header, data);
}

module.exports = { buildTeamSpiritCsv, buildBadgesCsv, csvCell, csvLines, BOM, SEP };
