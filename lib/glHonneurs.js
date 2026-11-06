'use strict';

/**
 * « Tenir à deux » v2 — honneurs, sceaux de peuple, titres, missions (spec § 12).
 *
 * `computeHonneurs(db, gameId)` : pur sur les données de la partie. Un honneur par équipe au
 * plus : si une équipe en mérite deux, le second va à la suivante dans l'ordre du critère
 * (égalité de valeur → plus petit identifiant d'équipe ; valeur nulle → pas d'honneur). Sceaux
 * Éclaireuses (équipe licorne, pages trouvées) et Mains (équipe gnome, pages réparées), hors
 * de la règle « un par équipe ». Titre par honneur et biome (`gl_tenir_titres`, `plateau`),
 * `prefixe_double` si l'équipe a déjà gagné le même honneur dans la classe. Le titre suit
 * chaque membre (`gl_player_titres`). Aucun classement n'est affiché.
 */

const { insertGameEvent } = require('./glGameEvents');
const { AIDE_SPELL_CODES } = require('./glSpellEffects');
const { resourceOfPeople } = require('./glTenir');

const HONNEURS = Object.freeze(['eclaireurs', 'gardiens', 'passeurs', 'esprit']);
const SCEAUX = Object.freeze({ eclaireuses: 'unicorn', mains: 'gnome' });

async function teamStats(db, gameId) {
  const teams = await db.queryAll(
    'SELECT id, type, name FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [gameId],
  );
  const stats = new Map(
    teams.map((t) => [
      Number(t.id),
      {
        teamId: Number(t.id),
        type: t.type,
        name: t.name,
        tenues: 0,
        trouvees: 0,
        reparees: 0,
        aides: 0,
        cartes: 0,
      },
    ]),
  );
  const pages = await db.queryAll(
    'SELECT etat, trouvee_par_team_id, tenue_par_team_id, reparee_at FROM gl_game_chasse_pages WHERE game_id = ?',
    [gameId],
  );
  for (const p of pages) {
    const t = stats.get(Number(p.trouvee_par_team_id));
    const h = stats.get(Number(p.tenue_par_team_id));
    if (['trouvee', 'tenue', 'reparee'].includes(String(p.etat)) && t) t.trouvees += 1;
    if (p.reparee_at && t) t.reparees += 1;
    if (String(p.etat) === 'tenue') {
      if (t) t.tenues += 1; // découverte
      if (h) {
        h.tenues += 1; // tenue
        h.aides += 1; // page tenue pour l'autre peuple
      }
    }
  }
  const casts = await db.queryAll(
    `SELECT team_id, spell_code FROM gl_spell_cast_drafts WHERE game_id = ? AND status = 'cast'`,
    [gameId],
  );
  for (const c of casts) {
    const t = stats.get(Number(c.team_id));
    if (t && AIDE_SPELL_CODES.includes(String(c.spell_code))) t.aides += 1;
  }
  const dons = await db.queryAll(
    `SELECT tm.team_id, COUNT(*) AS c FROM gl_market_dons d
       INNER JOIN gl_team_members tm ON tm.player_id = d.donneur_id AND tm.game_id = ?
      WHERE d.game_id = ? GROUP BY tm.team_id`,
    [gameId, gameId],
  );
  for (const d of dons) {
    const t = stats.get(Number(d.team_id));
    if (t) t.aides += Number(d.c) || 0;
  }
  const spirit = await db.queryAll(
    'SELECT team_id, SUM(cartes_gardees) AS s FROM gl_game_team_spirit WHERE game_id = ? GROUP BY team_id',
    [gameId],
  );
  for (const s of spirit) {
    const t = stats.get(Number(s.team_id));
    if (t) t.cartes = Number(s.s) || 0;
  }
  return { teams, stats };
}

function rankBy(stats, key) {
  return [...stats.values()]
    .filter((s) => Number(s[key]) > 0)
    .sort((a, b) => Number(b[key]) - Number(a[key]) || a.teamId - b.teamId);
}

/**
 * @returns {Promise<{ honneurs: Array<{ honneur, teamId, valeur }>, sceaux: Array, stats }>}
 */
async function computeHonneurs(db, gameId, { premiereArriveeTeamId = null } = {}) {
  const { stats } = await teamStats(db, gameId);
  const taken = new Set();
  const honneurs = [];
  const give = (honneur, candidates) => {
    for (const c of candidates) {
      if (taken.has(c.teamId)) continue;
      taken.add(c.teamId);
      honneurs.push({ honneur, teamId: c.teamId, valeur: c.valeur });
      return;
    }
  };
  if (premiereArriveeTeamId != null && stats.has(Number(premiereArriveeTeamId))) {
    give('eclaireurs', [{ teamId: Number(premiereArriveeTeamId), valeur: 1 }]);
  }
  give(
    'gardiens',
    rankBy(stats, 'tenues').map((s) => ({ teamId: s.teamId, valeur: s.tenues })),
  );
  give(
    'passeurs',
    rankBy(stats, 'aides').map((s) => ({ teamId: s.teamId, valeur: s.aides })),
  );
  give(
    'esprit',
    rankBy(stats, 'cartes').map((s) => ({ teamId: s.teamId, valeur: s.cartes })),
  );
  const sceaux = [];
  for (const [sceau, peuple] of Object.entries(SCEAUX)) {
    const key = sceau === 'eclaireuses' ? 'trouvees' : 'reparees';
    const best = rankBy(stats, key).filter(
      (s) => resourceOfPeople(s.type) === resourceOfPeople(peuple),
    )[0];
    if (best) sceaux.push({ honneur: sceau, teamId: best.teamId, valeur: best[key] });
  }
  return { honneurs, sceaux, stats: [...stats.values()] };
}

async function loadTitre(db, { famille, honneur, plateau }) {
  return db.queryOne(
    `SELECT code, libelle FROM gl_tenir_titres WHERE famille = ? AND honneur = ? AND actif = 1
        AND (plateau = ? OR plateau IS NULL) ORDER BY (plateau = ?) DESC, code ASC LIMIT 1`,
    [famille, honneur, plateau, plateau],
  );
}

async function prefixeDouble(db) {
  const row = await db.queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'gameplay.tenir_titres_prefixe_double' LIMIT 1",
  );
  try {
    const v = row ? JSON.parse(row.value_json) : null;
    return typeof v === 'string' && v ? v : 'Très Grands';
  } catch (_) {
    return 'Très Grands';
  }
}

/** Même honneur déjà gagné par l'équipe (même nom) dans une partie antérieure de la classe. */
async function dejaGagne(db, { classId, teamName, honneur, gameId }) {
  const row = await db.queryOne(
    `SELECT h.id FROM gl_game_honneurs h INNER JOIN gl_games g ON g.id = h.game_id INNER JOIN gl_teams t ON t.id = h.team_id
      WHERE g.class_id = ? AND h.honneur = ? AND t.name = ? AND h.game_id <> ? LIMIT 1`,
    [classId, honneur, teamName, gameId],
  );
  return !!row;
}

async function propagerTitre(tx, { gameId, teamId, code, famille, libelle }) {
  const members = await tx.queryAll(
    'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId],
  );
  for (const m of members) {
    await tx.execute(
      `INSERT IGNORE INTO gl_player_titres (player_id, game_id, team_id, titre_code, famille, libelle, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [m.player_id, gameId, teamId, code, famille, libelle],
    );
  }
  return members.length;
}

/** Attribue honneurs, sceaux et titres à la clôture (idempotent : INSERT IGNORE). */
async function attribuerHonneursTx(tx, { gameId, actorId, game, premiereArriveeTeamId = null }) {
  const gameRow =
    game ||
    (await tx.queryOne('SELECT id, class_id, chapter_id FROM gl_games WHERE id = ? LIMIT 1', [
      gameId,
    ]));
  const chapter =
    gameRow?.plateau_number != null
      ? gameRow
      : await tx.queryOne('SELECT plateau_number FROM gl_chapters WHERE id = ? LIMIT 1', [
          gameRow?.chapter_id,
        ]);
  const plateau = Number(chapter?.plateau_number) || 1;
  const classId = Number(gameRow?.class_id);
  const { honneurs, sceaux, stats } = await computeHonneurs(tx, gameId, { premiereArriveeTeamId });
  const prefixe = await prefixeDouble(tx);
  const events = [];
  const resume = [];
  const teamsById = new Map(stats.map((s) => [s.teamId, s]));
  for (const h of [...honneurs, ...sceaux]) {
    const famille = SCEAUX[h.honneur] ? 'sceau_peuple' : 'honneur';
    const titre = await loadTitre(tx, { famille, honneur: h.honneur, plateau });
    const team = teamsById.get(h.teamId);
    const double =
      famille === 'honneur' &&
      classId &&
      (await dejaGagne(tx, { classId, teamName: team?.name, honneur: h.honneur, gameId }));
    const libelle = titre ? (double ? `${prefixe} ${titre.libelle}` : titre.libelle) : h.honneur;
    const r = await tx.execute(
      `INSERT IGNORE INTO gl_game_honneurs (game_id, team_id, honneur, titre_code, libelle, double_honneur, valeur, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        gameId,
        h.teamId,
        h.honneur,
        titre?.code || null,
        libelle,
        double ? 1 : 0,
        h.valeur,
        actorId != null ? String(actorId) : null,
      ],
    );
    if (!r.affectedRows) continue;
    await propagerTitre(tx, {
      gameId,
      teamId: h.teamId,
      code: titre?.code || `honneurs.${h.honneur}`,
      famille,
      libelle,
    });
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: h.teamId,
        actorType: 'system',
        eventType: 'honneur',
        payload: { honneur: h.honneur, famille, titre: libelle, double: !!double },
      }),
    );
    resume.push({ honneur: h.honneur, teamId: h.teamId, titre: libelle });
  }
  return { honneurs: resume, events };
}

/** Mission réussie (saisie prof) : sceau + titre de mission pour l'équipe et ses membres. */
async function enregistrerMissionTx(tx, { gameId, teamId, missionId, actorId }) {
  const mission = await tx.queryOne(
    'SELECT id, titre_sceau FROM gl_tenir_missions WHERE id = ? AND actif = 1 LIMIT 1',
    [missionId],
  );
  if (!mission) {
    const err = new Error('MISSION_INTROUVABLE');
    err.status = 404;
    throw err;
  }
  const r = await tx.execute(
    `INSERT IGNORE INTO gl_game_missions (game_id, team_id, mission_id, titre_sceau, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
    [gameId, teamId, mission.id, mission.titre_sceau, String(actorId)],
  );
  if (!r.affectedRows) {
    const err = new Error('MISSION_DEJA_SAISIE');
    err.status = 409;
    throw err;
  }
  await tx.execute(
    `INSERT IGNORE INTO gl_game_honneurs (game_id, team_id, honneur, titre_code, libelle, mission_id, created_by, created_at) VALUES (?, ?, 'mission', NULL, ?, ?, ?, NOW())`,
    [gameId, teamId, mission.titre_sceau, mission.id, String(actorId)],
  );
  await propagerTitre(tx, {
    gameId,
    teamId,
    code: `missions.${mission.id}`,
    famille: 'mission',
    libelle: mission.titre_sceau,
  });
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'mission_reussie',
    payload: { missionId: String(mission.id), titre: mission.titre_sceau },
  });
  return { missionId: String(mission.id), titre: mission.titre_sceau, event };
}

/** Titre d'équipe affiché sous la mascotte : titre majoritaire de ses membres (dernier gagné), sinon rien. */
async function titreMajoritaire(db, gameId, teamId) {
  const rows = await db.queryAll(
    `SELECT pt.libelle, COUNT(*) AS n, MAX(pt.id) AS last_id FROM gl_team_members tm
       INNER JOIN gl_player_titres pt ON pt.player_id = tm.player_id AND pt.famille IN ('honneur', 'sceau_peuple')
      WHERE tm.game_id = ? AND tm.team_id = ? AND (pt.game_id IS NULL OR pt.game_id <> ?)
      GROUP BY pt.libelle ORDER BY n DESC, last_id DESC LIMIT 1`,
    [gameId, teamId, gameId],
  );
  const members = await db.queryOne(
    'SELECT COUNT(*) AS c FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId],
  );
  const total = Number(members?.c) || 0;
  if (!rows.length || !total) return null;
  return Number(rows[0].n) * 2 > total ? String(rows[0].libelle) : null;
}

module.exports = {
  HONNEURS,
  SCEAUX,
  computeHonneurs,
  attribuerHonneursTx,
  enregistrerMissionTx,
  titreMajoritaire,
  teamStats,
};
