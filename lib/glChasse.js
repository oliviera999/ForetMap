'use strict';

/**
 * « Tenir à deux » v2 — la chasse (spec § 5 et § 6) : zones cachées d'un plateau, fouilles au
 * clic, questions de chasse (fixe puis thème de secours), pages trouvées / réparées / tenues,
 * pistes de veillée, carnet de la classe, oiseau témoin (position seulement), carnet complet.
 *
 * Invariants (§ 2) : une mauvaise réponse ne retire rien et ne dit jamais « faux » ; aucune
 * ressource pour une bonne réponse de chasse sauf la réparation (+1 cœur par Gnome) et la page
 * tenue (+1 ressource du peuple aux membres des deux équipes) ; les polygones ne sortent jamais
 * vers un élève ; l'oiseau est muet et sans nom (identifiant `kraa` toléré dans le code).
 */

const glRandom = require('./glRandom');
const glClock = require('./glClock');
const { insertGameEvent } = require('./glGameEvents');
const { isPointInPolygon } = require('./shared/glPointInPolygon');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('./qcmChoices');
const { consumePresentationJti } = require('./qcmPresentationUse');
const { upsertFeuilletState, upsertPlayerFeuilletState } = require('./glLoreFeuillets');
const { applyPlayerVitalityDelta, resolveVitalityCaps } = require('./glVitality');
const {
  resolveTenirSettings,
  resolveZonesParPlateau,
  resolveFouillesParTour,
  resourceOfPeople,
  peopleDelta,
  isoWeekOf,
  listPresentMembers,
  parseJsonColumn,
} = require('./glTenir');

const ETATS_FOUILLABLES = new Set(['endormie', 'revelee', 'palie']);
const ETATS_TROUVEES = new Set(['trouvee', 'reparee', 'tenue']);
const LECTURE_PREFIX = 'LECT-';
const KRAA_ETATS = new Set([
  'froid',
  'tiede',
  'chaud',
  'zone',
  'page_trouvee',
  'page_tenue',
  'deja_trouvee',
]);

function fail(code, status = 400, extra = {}) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/** « Pas encore » : jamais « faux » côté élève (spec § 1). */
function pasEncore(feedback) {
  const cleaned = String(feedback || '')
    .replace(/^ce n’est pas la bonne réponse\.?/i, '')
    .trim();
  return cleaned ? `Pas encore. ${cleaned}` : 'Pas encore : la page dort encore ici.';
}

function normalizePoint(x, y) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  if (px < 0 || px > 1 || py < 0 || py > 1) return null;
  return { x: px, y: py };
}

function polygonPoints(raw) {
  const poly = parseJsonColumn(raw, null);
  if (!Array.isArray(poly)) return [];
  return poly
    .map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : null))
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
}

function formatZone(row) {
  return {
    id: Number(row.id),
    zoneKey: String(row.zone_key),
    plateau: Number(row.plateau),
    feuilletCode: String(row.feuillet_code),
    indice: String(row.indice || ''),
    points: polygonPoints(row.polygone_json),
    centre:
      row.centre_x != null && row.centre_y != null
        ? { x: Number(row.centre_x), y: Number(row.centre_y) }
        : null,
    rangCase: row.rang_case != null ? Number(row.rang_case) : null,
    questionCode: row.question_code ? String(row.question_code) : null,
    themeSecours: row.theme_secours ? String(row.theme_secours) : null,
    especes: parseJsonColumn(row.especes_json, []) || [],
    ordre: Number(row.ordre) || 0,
  };
}

/** Les N premières zones actives et prêtes du plateau de la partie (N = `zones_par_plateau`). */
async function loadZonesForGame(db, game, resolved) {
  const plateau = Number(game?.plateau_number) || 1;
  const n = resolveZonesParPlateau(resolved, plateau);
  if (!n) return [];
  // Les zones du chapitre de la partie d'abord ; à défaut, celles du plateau sans chapitre.
  const chapterId = Number(game?.chapter_id) || 0;
  const rows = await db.queryAll(
    `SELECT id, zone_key, plateau, feuillet_code, indice, polygone_json, centre_x, centre_y,
            rang_case, question_code, theme_secours, especes_json, ordre
       FROM gl_chasse_zones
      WHERE plateau = ? AND actif = 1 AND geometrie_prete = 1
        AND (chapter_id = ? OR chapter_id IS NULL)
      ORDER BY (chapter_id = ?) DESC, ordre ASC, id ASC
      LIMIT ${Math.max(0, Math.min(50, n))}`,
    [plateau, chapterId, chapterId],
  );
  return rows.map(formatZone);
}

async function loadGameForChasse(db, gameId) {
  return db.queryOne(
    `SELECT g.id, g.chapter_id, g.status, g.current_round_number, g.tenir_profil,
            g.tenir_overrides_json, g.tenir_surface, ch.plateau_number
       FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
}

/** Pages de la partie (`gl_game_chasse_pages`) indexées par `zone_id`. */
async function loadPages(db, gameId) {
  const rows = await db.queryAll(
    `SELECT zone_id, etat, trouvee_par_team_id, trouvee_at, tenue_par_team_id, tenue_at,
            reparee_at, palissement_json
       FROM gl_game_chasse_pages WHERE game_id = ?`,
    [gameId],
  );
  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.zone_id), {
      zoneId: Number(r.zone_id),
      etat: String(r.etat),
      trouveeParTeamId: r.trouvee_par_team_id != null ? Number(r.trouvee_par_team_id) : null,
      trouveeAt: r.trouvee_at,
      tenueParTeamId: r.tenue_par_team_id != null ? Number(r.tenue_par_team_id) : null,
      tenueAt: r.tenue_at,
      repareeAt: r.reparee_at,
      palissement: parseJsonColumn(r.palissement_json, {}) || {},
    });
  }
  return map;
}

/** Au passage en `live` : une ligne `endormie` par zone active (idempotent). */
async function initChassePagesForGame(db, gameId, { settings = null } = {}) {
  const game = await loadGameForChasse(db, gameId);
  if (!game) return 0;
  const gameplay = settings || (await require('./glSettings').getGameplaySettings());
  const resolved = resolveTenirSettings(gameplay, game);
  const zones = await loadZonesForGame(db, game, resolved);
  let created = 0;
  for (const z of zones) {
    const r = await db.execute(
      `INSERT IGNORE INTO gl_game_chasse_pages (game_id, zone_id, etat, updated_at) VALUES (?, ?, 'endormie', NOW())`,
      [gameId, z.id],
    );
    created += Number(r?.affectedRows) || 0;
  }
  return created;
}

// ---------------------------------------------------------------------
// Géométrie (pur)
// ---------------------------------------------------------------------

function findZoneAtPoint(zones, point) {
  if (!point) return null;
  for (const z of zones) {
    if (z.points.length >= 3 && isPointInPolygon(point.x, point.y, z.points)) return z;
  }
  return null;
}

function distance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Zone `endormie` ou `palie` la plus proche du point (centroïde), ou `null`. */
function nearestSleepingZone(zones, pages, point) {
  let best = null;
  let bestD = Infinity;
  for (const z of zones) {
    const page = pages.get(z.id);
    const etat = page?.etat || 'endormie';
    if (etat !== 'endormie' && etat !== 'palie') continue;
    if (!z.centre) continue;
    const d = distance(point, z.centre);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best ? { zone: best, distance: bestD } : null;
}

function verdictForDistance(d, seuils) {
  const chaud = Number(seuils?.chaud);
  const tiede = Number(seuils?.tiede);
  const c = Number.isFinite(chaud) ? chaud : 0.06;
  const t = Number.isFinite(tiede) ? tiede : 0.15;
  if (d <= c) return 'chaud';
  if (d <= t) return 'tiede';
  return 'froid';
}

// ---------------------------------------------------------------------
// Quota de fouilles
// ---------------------------------------------------------------------

async function countEffet(db, gameId, roundNumber, kind, teamId) {
  const rows = await db.queryAll(
    `SELECT team_id, payload_json FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number = ? AND kind = ? AND (team_id IS NULL OR team_id = ?)`,
    [gameId, roundNumber, kind, teamId],
  );
  let n = 0;
  for (const r of rows) {
    const p = parseJsonColumn(r.payload_json, {}) || {};
    n += Number.isInteger(Number(p.n)) ? Number(p.n) : 1;
  }
  return n;
}

/**
 * Fouilles restantes de l'équipe pour le tour : quota du peuple + bonus (Grand Regard), 0 sous
 * le voile sauf Abri / Cordée, moins les fouilles déjà faites ce tour.
 */
async function fouillesRestantes(db, { gameId, roundNumber, team, resolved, sousVoile = false }) {
  const round = Number(roundNumber) || 0;
  const base = resolveFouillesParTour(resolved, team.type);
  const bonus = round ? await countEffet(db, gameId, round, 'fouilles_bonus', team.id) : 0;
  let quota = base + bonus;
  if (sousVoile) {
    const abri = round ? await countEffet(db, gameId, round, 'abri', team.id) : 0;
    const cordee = round
      ? await db.queryOne(
          `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = 'cordee'
              AND (team_id = ? OR source_team_id = ?) LIMIT 1`,
          [gameId, round, team.id, team.id],
        )
      : null;
    if (!abri && !cordee) quota = 0;
  }
  const used = await db.queryOne(
    `SELECT COUNT(*) AS c FROM gl_game_chasse_empreintes WHERE game_id = ? AND team_id = ? AND round_number = ?`,
    [gameId, team.id, round],
  );
  const utilisees = Number(used?.c) || 0;
  return { quota, utilisees, restantes: Math.max(0, quota - utilisees) };
}

async function isSousVoile(db, gameId, team) {
  const state = await db.queryOne(
    'SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  const position = Number(state?.voile_position ?? -1);
  if (position < 0) return false;
  const game = await db.queryOne('SELECT chapter_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  const markers = await db.queryAll(
    'SELECT id, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
    [game?.chapter_id],
  );
  const { teamPathIndex } = require('./shared/glBoardPathCore');
  const idx = teamPathIndex(team, markers);
  return idx != null && idx <= position;
}

// ---------------------------------------------------------------------
// Questions de chasse (fixe, puis thème de secours)
// ---------------------------------------------------------------------

async function loadQuestionRow(db, code) {
  return db.queryOne(
    `SELECT * FROM gl_qcm_questions WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
    [code],
  );
}

async function pickChasseQuestion(db, { gameId, zone, chapterId }) {
  const vues = await db.queryAll(
    'SELECT question_code FROM gl_game_chasse_questions_vues WHERE game_id = ? AND zone_id = ?',
    [gameId, zone.id],
  );
  const dejaVues = new Set(vues.map((v) => String(v.question_code)));
  if (zone.questionCode && !dejaVues.has(zone.questionCode)) {
    const fixed = await loadQuestionRow(db, zone.questionCode);
    if (fixed) return fixed;
  }
  const biomes = await db.queryAll(
    'SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index ASC',
    [chapterId],
  );
  const slugs = biomes.map((b) => String(b.biome_slug));
  const params = [zone.themeSecours];
  let where = `statut = 'actif' AND categorie_slug = ?`;
  if (slugs.length) {
    where += ` AND biome_slug IN (${slugs.map(() => '?').join(', ')})`;
    params.push(...slugs);
  }
  if (dejaVues.size) {
    where += ` AND question_code NOT IN (${[...dejaVues].map(() => '?').join(', ')})`;
    params.push(...dejaVues);
  }
  let rows = await db.queryAll(`SELECT * FROM gl_qcm_questions WHERE ${where}`, params);
  if (!rows.length) {
    // Thème épuisé : on repart du début (jamais bloquant).
    rows = await db.queryAll(
      `SELECT * FROM gl_qcm_questions WHERE statut = 'actif' AND categorie_slug = ?`,
      [zone.themeSecours],
    );
  }
  if (!rows.length && zone.questionCode) return loadQuestionRow(db, zone.questionCode);
  if (!rows.length) return null;
  return glRandom.pick(rows, { gameId });
}

async function presentChasseQuestion(db, { gameId, teamId, zone, chapterId }) {
  const row = await pickChasseQuestion(db, { gameId, zone, chapterId });
  if (!row) throw fail('CHASSE_SANS_QUESTION', 409);
  await db.execute(
    'INSERT IGNORE INTO gl_game_chasse_questions_vues (game_id, zone_id, question_code, created_at) VALUES (?, ?, ?, NOW())',
    [gameId, zone.id, row.question_code],
  );
  return presentQuestion(row, [], { game: { gameId, teamId, zoneKey: zone.zoneKey } });
}

// ---------------------------------------------------------------------
// Oiseau témoin : position et état, jamais de texte
// ---------------------------------------------------------------------

async function setKraaTx(tx, gameId, { x, y, etat }) {
  const state = KRAA_ETATS.has(etat) ? etat : 'zone';
  const kraa = { x, y, etat: state, at: new Date().toISOString() };
  await tx.execute(
    'UPDATE gl_game_tenir_state SET kraa_json = ?, updated_at = NOW() WHERE game_id = ?',
    [JSON.stringify(kraa), gameId],
  );
  return kraa;
}

// ---------------------------------------------------------------------
// Fouiller
// ---------------------------------------------------------------------

async function loadTeam(db, gameId, teamId, { lock = false } = {}) {
  const team = await db.queryOne(
    `SELECT id, game_id, type, name, position_marker_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [teamId, gameId],
  );
  if (!team) throw fail('TEAM_NOT_FOUND', 404);
  return team;
}

/**
 * Une fouille au point (x, y) normalisé. Résultat : `{ verdict, zoneKey?, question?, kraa, fouilles }`.
 * @throws 409 `FOUILLES_EPUISEES`
 */
async function fouillerTx(
  tx,
  { gameId, teamId, playerId = null, x, y, roundNumber, settings, actorType, actorId },
) {
  const point = normalizePoint(x, y);
  if (!point) throw fail('POINT_INVALIDE', 400);
  const game = await loadGameForChasse(tx, gameId);
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  const resolved = resolveTenirSettings(settings, game);
  const team = await loadTeam(tx, gameId, teamId, { lock: true });
  const zones = await loadZonesForGame(tx, game, resolved);
  const pages = await loadPages(tx, gameId);
  const zone = findZoneAtPoint(zones, point);
  const page = zone ? pages.get(zone.id) || { etat: 'endormie' } : null;
  const events = [];

  // Zone déjà trouvée / tenue : rien, aucune fouille consommée.
  if (zone && ETATS_TROUVEES.has(page.etat)) {
    const kraa = await setKraaTx(tx, gameId, { ...point, etat: 'deja_trouvee' });
    return { verdict: 'deja_trouvee', zoneKey: zone.zoneKey, question: null, kraa, events };
  }
  // Zone pâlie : réservée aux Gnomes (aucune fouille consommée pour une équipe licorne).
  if (zone && page.etat === 'palie' && resourceOfPeople(team.type) !== 'health') {
    const kraa = await setKraaTx(tx, gameId, { ...point, etat: 'zone' });
    return {
      verdict: 'palie',
      zoneKey: zone.zoneKey,
      reservee: 'gnome',
      question: null,
      kraa,
      events,
    };
  }

  const sousVoile = await isSousVoile(tx, gameId, team);
  const fouilles = await fouillesRestantes(tx, {
    gameId,
    roundNumber,
    team,
    resolved,
    sousVoile,
  });
  if (fouilles.restantes <= 0) throw fail('FOUILLES_EPUISEES', 409, { fouilles, sousVoile });

  let verdict;
  let question = null;
  let zoneKey = null;
  if (zone) {
    verdict = 'zone';
    zoneKey = zone.zoneKey;
    question = await presentChasseQuestion(tx, {
      gameId,
      teamId,
      zone,
      chapterId: game.chapter_id,
    });
  } else {
    const near = nearestSleepingZone(zones, pages, point);
    verdict = near ? verdictForDistance(near.distance, resolved.fouille_seuils) : 'froid';
  }
  await tx.execute(
    `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [gameId, teamId, playerId, Number(roundNumber) || 0, point.x, point.y, verdict],
  );
  const kraa = await setKraaTx(tx, gameId, { ...point, etat: verdict });
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: 'fouille',
      payload: {
        roundNumber: Number(roundNumber) || 0,
        x: point.x,
        y: point.y,
        verdict,
        ...(zoneKey ? { zoneKey } : {}),
      },
    }),
  );
  return {
    verdict,
    zoneKey,
    question,
    kraa,
    fouilles: { ...fouilles, utilisees: fouilles.utilisees + 1, restantes: fouilles.restantes - 1 },
    events,
  };
}

// ---------------------------------------------------------------------
// Répondre à la question de chasse
// ---------------------------------------------------------------------

async function loadZoneByKey(db, zoneKey) {
  const row = await db.queryOne(
    `SELECT id, zone_key, plateau, feuillet_code, indice, polygone_json, centre_x, centre_y,
            rang_case, question_code, theme_secours, ordre
       FROM gl_chasse_zones WHERE zone_key = ? LIMIT 1`,
    [zoneKey],
  );
  return row ? formatZone(row) : null;
}

async function lockPage(tx, gameId, zoneId) {
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ? LIMIT 1 FOR UPDATE',
    [gameId, zoneId],
  );
  if (row) return row;
  await tx.execute(
    `INSERT IGNORE INTO gl_game_chasse_pages (game_id, zone_id, etat, updated_at) VALUES (?, ?, 'endormie', NOW())`,
    [gameId, zoneId],
  );
  return tx.queryOne(
    'SELECT * FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ? LIMIT 1 FOR UPDATE',
    [gameId, zoneId],
  );
}

async function loadFeuilletMeta(db, feuilletCode) {
  return db.queryOne(
    'SELECT feuillet_code, titre, incipit, biome_slug, lien_canal, lien_ref FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1',
    [feuilletCode],
  );
}

/** Carnet d'équipe + carnet personnel des membres présents (découverte). */
async function inscrireDecouverteTx(tx, { gameId, team, feuilletCode, roundNumber, status, via }) {
  await upsertFeuilletState(tx, {
    gameId,
    teamId: team.id,
    feuilletCode,
    status,
    effacementPct: 0,
    unlockedVia: 'zone',
    discoveredSource: via,
  });
  const present = await listPresentMembers(tx, gameId, team.id, roundNumber);
  for (const playerId of present) {
    await upsertPlayerFeuilletState(tx, {
      playerId,
      feuilletCode,
      status,
      effacementPct: 0,
      acquiredVia: 'decouverte',
      discoveredSource: via,
    });
  }
  return present;
}

async function repondreChasseTx(
  tx,
  {
    gameId,
    teamId,
    roundNumber,
    presentationToken,
    questionCode,
    choiceId,
    settings,
    actorType,
    actorId,
  },
) {
  const verification = verifyPresentationAnswer(presentationToken, questionCode, choiceId);
  const claim = verification.game;
  if (!claim || !claim.zoneKey || claim.lecture) throw fail('JETON_HORS_CHASSE', 400);
  if (Number(claim.gameId) !== Number(gameId) || Number(claim.teamId) !== Number(teamId)) {
    throw fail('JETON_AUTRE_EQUIPE', 403);
  }
  await consumePresentationJti(tx, {
    jti: verification.jti,
    gameId,
    teamId,
    questionCode,
  });
  const team = await loadTeam(tx, gameId, teamId, { lock: true });
  const zone = await loadZoneByKey(tx, claim.zoneKey);
  if (!zone) throw fail('ZONE_INTROUVABLE', 404);
  const page = await lockPage(tx, gameId, zone.id);
  const questionRow = await loadQuestionRow(tx, questionCode);
  const events = [];
  const kraaPoint = zone.centre || { x: 0.5, y: 0.5 };

  if (ETATS_TROUVEES.has(String(page.etat))) {
    return { correct: null, etat: page.etat, feedback: 'Cette page est déjà trouvée.', events };
  }
  if (!verification.correct) {
    if (String(page.etat) === 'endormie') {
      await tx.execute(
        "UPDATE gl_game_chasse_pages SET etat = 'revelee', updated_at = NOW() WHERE game_id = ? AND zone_id = ?",
        [gameId, zone.id],
      );
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType,
          actorId,
          eventType: 'page_revelee',
          payload: { zoneKey: zone.zoneKey, via: 'fouille' },
        }),
      );
    }
    return {
      correct: false,
      etat: String(page.etat) === 'endormie' ? 'revelee' : String(page.etat),
      feedback: pasEncore(questionRow ? resolveQcmAnswerFeedback(questionRow, verification) : ''),
      events,
    };
  }

  const reparation = String(page.etat) === 'palie';
  const nextEtat = reparation ? 'reparee' : 'trouvee';
  await tx.execute(
    `UPDATE gl_game_chasse_pages SET etat = ?, trouvee_par_team_id = ?, trouvee_at = NOW(),
            reparee_at = ${reparation ? 'NOW()' : 'reparee_at'}, palissement_json = NULL, updated_at = NOW()
      WHERE game_id = ? AND zone_id = ?`,
    [nextEtat, teamId, gameId, zone.id],
  );
  const present = await inscrireDecouverteTx(tx, {
    gameId,
    team,
    feuilletCode: zone.feuilletCode,
    roundNumber,
    status: 'discovered',
    via: 'chasse',
  });
  let vitality = null;
  if (reparation) {
    // +1 cœur à chaque Gnome de l'équipe (spec § 5), plafond appliqué.
    const members = await tx.queryAll(
      'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?',
      [gameId, teamId],
    );
    const caps = resolveVitalityCaps(settings);
    vitality = [];
    for (const m of members) {
      vitality.push(
        await applyPlayerVitalityDelta(tx, {
          playerId: m.player_id,
          healthDelta: 1,
          caps,
          cause: 'reparation',
          gameId,
        }),
      );
    }
  }
  const feuillet = await loadFeuilletMeta(tx, zone.feuilletCode);
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: reparation ? 'page_reparee' : 'page_trouvee',
      payload: {
        zoneKey: zone.zoneKey,
        feuilletCode: zone.feuilletCode,
        titre: feuillet?.titre || null,
        roundNumber: Number(roundNumber) || 0,
        membres: present.length,
        ...(vitality
          ? {
              vitality,
              private: true,
              publicKeys: ['zoneKey', 'feuilletCode', 'titre', 'roundNumber', 'membres'],
            }
          : {}),
      },
    }),
  );
  // Nid du chapardeur : rendu au membre le moins riche de l'équipe découvreuse.
  try {
    const { rendreNidTx } = require('./glChapardeur');
    const nid = await rendreNidTx(tx, { gameId, teamId, settings });
    if (nid?.event) events.push(nid.event);
  } catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
  }
  const kraa = await setKraaTx(tx, gameId, { ...kraaPoint, etat: 'page_trouvee' });
  return {
    correct: true,
    etat: nextEtat,
    zoneKey: zone.zoneKey,
    feuilletCode: zone.feuilletCode,
    titre: feuillet?.titre || null,
    feedback: questionRow ? resolveQcmAnswerFeedback(questionRow, verification) : 'Bonne réponse !',
    kraa,
    events,
  };
}

// ---------------------------------------------------------------------
// Ouvrir / tenir une page (lecture)
// ---------------------------------------------------------------------

function lectureQuestionRow(zoneKey, q) {
  const choix = parseJsonColumn(q.choix_json, {}) || {};
  return {
    question_code: `${LECTURE_PREFIX}${zoneKey}`,
    question: String(q.question),
    choix_a: String(choix.A || ''),
    choix_b: String(choix.B || ''),
    choix_c: String(choix.C || ''),
    choix_d: String(choix.D || ''),
    choix_e: '',
    reponse_correcte: String(q.reponse || 'A').toUpperCase(),
    feedback_correct: q.feedback_correct || null,
    feedback_incorrect: q.feedback_incorrect || null,
  };
}

async function loadLectureQuestion(db, zoneKey) {
  const q = await db.queryOne(
    'SELECT * FROM gl_tenir_questions_lecture WHERE zone_key = ? AND actif = 1 LIMIT 1',
    [zoneKey],
  );
  return q ? lectureQuestionRow(zoneKey, q) : null;
}

async function countOuverturesGainSemaine(db, playerId, semaine) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS c FROM gl_game_chasse_ouvertures WHERE player_id = ? AND semaine_iso = ? AND via = 'veillee' AND gain = 1`,
    [playerId, semaine],
  );
  return Number(row?.c) || 0;
}

/**
 * Ouvre une page trouvée : lecture pour tous ; pour une équipe de l'autre peuple que la
 * découvreuse, la question de lecture est jointe (tant que la page n'est pas tenue).
 * @throws 409 `PAGE_PAS_TROUVEE`, 409 `VEILLEE_LIMITE`
 */
async function ouvrirPageTx(
  tx,
  {
    gameId,
    teamId,
    playerId = null,
    zoneKey,
    via = 'tour',
    roundNumber,
    settings,
    actorType,
    actorId,
  },
) {
  const game = await loadGameForChasse(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  const team = await loadTeam(tx, gameId, teamId);
  const zone = await loadZoneByKey(tx, zoneKey);
  if (!zone) throw fail('ZONE_INTROUVABLE', 404);
  const page = await lockPage(tx, gameId, zone.id);
  if (!ETATS_TROUVEES.has(String(page.etat))) throw fail('PAGE_PAS_TROUVEE', 409);
  const decouvreuse = await loadTeam(tx, gameId, page.trouvee_par_team_id);
  const autrePeuple = resourceOfPeople(decouvreuse.type) !== resourceOfPeople(team.type);
  const peutTenir = autrePeuple && String(page.etat) !== 'tenue';
  const semaine = isoWeekOf(glClock.now());
  if (peutTenir && via === 'veillee' && playerId != null) {
    const limite = Number(resolved.pages_veillee_par_semaine);
    const n = await countOuverturesGainSemaine(tx, playerId, semaine);
    if (Number.isInteger(limite) && limite >= 0 && n >= limite) {
      throw fail('VEILLEE_LIMITE', 409, { limite, semaine });
    }
  }
  // Lecture : état `read` pour l'équipe (sans gain), carnet personnel du lecteur.
  const isDecouvreuse = Number(decouvreuse.id) === Number(team.id);
  await upsertFeuilletState(tx, {
    gameId,
    teamId: team.id,
    feuilletCode: zone.feuilletCode,
    status: 'read',
    unlockedVia: 'zone',
    discoveredSource: isDecouvreuse ? 'chasse' : 'lecture',
  });
  if (playerId != null) {
    await upsertPlayerFeuilletState(tx, {
      playerId,
      feuilletCode: zone.feuilletCode,
      status: 'read',
      effacementPct: 0,
      acquiredVia: 'decouverte',
    });
  }
  await tx.execute(
    `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, question_code, reussie, gain, semaine_iso, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, NOW())`,
    [gameId, zone.id, team.id, playerId, via === 'veillee' ? 'veillee' : 'tour', semaine],
  );
  const palissement = parseJsonColumn(page.palissement_json, {}) || {};
  const palissementPct = Number(palissement[String(team.id)]) || 0;
  const feuillet = await tx.queryOne(
    `SELECT feuillet_code, titre, incipit, texte, texte_accessible, biome_slug, image_url
       FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1`,
    [zone.feuilletCode],
  );
  const event = await insertGameEvent(tx, {
    gameId,
    teamId: team.id,
    actorType,
    actorId,
    eventType: 'page_lue',
    payload: {
      zoneKey: zone.zoneKey,
      feuilletCode: zone.feuilletCode,
      titre: feuillet?.titre || null,
      via,
      roundNumber: Number(roundNumber) || 0,
    },
  });
  let question = null;
  if (peutTenir) {
    const row = await loadLectureQuestion(tx, zone.zoneKey);
    if (row) {
      question = presentQuestion(row, [], {
        game: { gameId, teamId: team.id, zoneKey: zone.zoneKey, lecture: true },
      });
    }
  }
  return {
    zoneKey: zone.zoneKey,
    etat: String(page.etat),
    feuillet: feuillet
      ? {
          feuilletCode: feuillet.feuillet_code,
          titre: feuillet.titre,
          incipit: feuillet.incipit,
          texte: feuillet.texte,
          texteAccessible: feuillet.texte_accessible,
          biomeSlug: feuillet.biome_slug,
          imageUrl: feuillet.image_url,
        }
      : null,
    palissementPct,
    peutTenir,
    question,
    events: [event],
  };
}

async function teamMembers(db, gameId, teamId) {
  const rows = await db.queryAll(
    'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId],
  );
  return rows.map((r) => Number(r.player_id));
}

/** Carnet complet : toutes les pages actives `tenue` → +1 ressource à tout le groupe, voile −3. */
async function verifierCarnetCompletTx(
  tx,
  { gameId, game, resolved, settings, actorType, actorId },
) {
  const state = await tx.queryOne(
    'SELECT carnet_complet_at FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  if (!state || state.carnet_complet_at) return [];
  const zones = await loadZonesForGame(tx, game, resolved);
  if (!zones.length) return [];
  const pages = await loadPages(tx, gameId);
  const toutesTenues = zones.every((z) => pages.get(z.id)?.etat === 'tenue');
  if (!toutesTenues) return [];
  await tx.execute(
    'UPDATE gl_game_tenir_state SET carnet_complet_at = NOW(), updated_at = NOW() WHERE game_id = ?',
    [gameId],
  );
  const teams = await tx.queryAll('SELECT id, type FROM gl_teams WHERE game_id = ?', [gameId]);
  const caps = resolveVitalityCaps(settings);
  for (const t of teams) {
    for (const playerId of await teamMembers(tx, gameId, t.id)) {
      await applyPlayerVitalityDelta(tx, {
        playerId,
        ...peopleDelta(t.type, 1),
        caps,
        cause: 'carnet_complet',
        gameId,
      });
    }
  }
  const events = [];
  events.push(
    await insertGameEvent(tx, {
      gameId,
      actorType,
      actorId,
      eventType: 'carnet_complet',
      payload: { pages: zones.length, recul: Number(resolved.recul_carnet_complet) || 0 },
    }),
  );
  try {
    const { retreatVoileTx } = require('./glVoile');
    events.push(
      ...(await retreatVoileTx(tx, {
        gameId,
        cases: Number(resolved.recul_carnet_complet) || 0,
        reason: 'carnet_complet',
      })),
    );
  } catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return events;
}

/**
 * Tenir une page : réponse juste à la question de lecture par une équipe de l'autre peuple.
 * +1 ressource du peuple à chaque membre des deux équipes ; `page_tenue` ; carnet complet.
 */
async function tenirPageTx(
  tx,
  {
    gameId,
    teamId,
    playerId = null,
    roundNumber,
    presentationToken,
    questionCode,
    choiceId,
    via = 'tour',
    settings,
    actorType,
    actorId,
    expectedZoneKey = null,
  },
) {
  const verification = verifyPresentationAnswer(presentationToken, questionCode, choiceId);
  const claim = verification.game;
  if (!claim || !claim.zoneKey || !claim.lecture) throw fail('JETON_HORS_LECTURE', 400);
  if (Number(claim.gameId) !== Number(gameId) || Number(claim.teamId) !== Number(teamId)) {
    throw fail('JETON_AUTRE_EQUIPE', 403);
  }
  // Vérifié AVANT toute écriture : un jeton d'une autre page ne doit rien tenir ni créditer.
  if (expectedZoneKey && String(claim.zoneKey) !== String(expectedZoneKey)) {
    throw fail('JETON_AUTRE_PAGE', 400);
  }
  await consumePresentationJti(tx, { jti: verification.jti, gameId, teamId, questionCode });
  const game = await loadGameForChasse(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  const team = await loadTeam(tx, gameId, teamId, { lock: true });
  const zone = await loadZoneByKey(tx, claim.zoneKey);
  if (!zone) throw fail('ZONE_INTROUVABLE', 404);
  const page = await lockPage(tx, gameId, zone.id);
  if (!ETATS_TROUVEES.has(String(page.etat))) throw fail('PAGE_PAS_TROUVEE', 409);
  if (String(page.etat) === 'tenue') {
    return { correct: null, etat: 'tenue', feedback: 'Cette page est déjà tenue.', events: [] };
  }
  const decouvreuse = await loadTeam(tx, gameId, page.trouvee_par_team_id);
  if (resourceOfPeople(decouvreuse.type) === resourceOfPeople(team.type)) {
    throw fail('MEME_PEUPLE', 409);
  }
  const lectureRow = await loadLectureQuestion(tx, zone.zoneKey);
  const semaine = isoWeekOf(glClock.now());
  if (!verification.correct) {
    await tx.execute(
      `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, question_code, reussie, gain, semaine_iso, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, NOW())`,
      [
        gameId,
        zone.id,
        team.id,
        playerId,
        via === 'veillee' ? 'veillee' : 'tour',
        questionCode,
        semaine,
      ],
    );
    // La question se repose jusqu'à réussite : nouvelle présentation jointe.
    const question = lectureRow
      ? presentQuestion(lectureRow, [], {
          game: { gameId, teamId: team.id, zoneKey: zone.zoneKey, lecture: true },
        })
      : null;
    return {
      correct: false,
      etat: String(page.etat),
      feedback: pasEncore(lectureRow ? resolveQcmAnswerFeedback(lectureRow, verification) : ''),
      question,
      events: [],
    };
  }
  if (via === 'veillee' && playerId != null) {
    const limite = Number(resolved.pages_veillee_par_semaine);
    const n = await countOuverturesGainSemaine(tx, playerId, semaine);
    if (Number.isInteger(limite) && limite >= 0 && n >= limite) {
      throw fail('VEILLEE_LIMITE', 409, { limite, semaine });
    }
  }
  await tx.execute(
    `UPDATE gl_game_chasse_pages SET etat = 'tenue', tenue_par_team_id = ?, tenue_at = NOW(), updated_at = NOW()
      WHERE game_id = ? AND zone_id = ?`,
    [team.id, gameId, zone.id],
  );
  await tx.execute(
    `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, question_code, reussie, gain, semaine_iso, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, NOW())`,
    [
      gameId,
      zone.id,
      team.id,
      playerId,
      via === 'veillee' ? 'veillee' : 'tour',
      questionCode,
      semaine,
    ],
  );
  await upsertFeuilletState(tx, {
    gameId,
    teamId: team.id,
    feuilletCode: zone.feuilletCode,
    status: 'held',
    unlockedVia: 'zone',
    discoveredSource: 'lecture',
  });
  if (playerId != null) {
    await upsertPlayerFeuilletState(tx, {
      playerId,
      feuilletCode: zone.feuilletCode,
      status: 'held',
      effacementPct: 0,
      acquiredVia: 'decouverte',
    });
  }
  const caps = resolveVitalityCaps(settings);
  const vitality = [];
  for (const t of [decouvreuse, team]) {
    for (const memberId of await teamMembers(tx, gameId, t.id)) {
      vitality.push(
        await applyPlayerVitalityDelta(tx, {
          playerId: memberId,
          ...peopleDelta(t.type, 1),
          caps,
          cause: 'page_tenue',
          gameId,
        }),
      );
    }
  }
  const feuillet = await loadFeuilletMeta(tx, zone.feuilletCode);
  const events = [];
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId: team.id,
      actorType,
      actorId,
      eventType: 'page_tenue',
      payload: {
        zoneKey: zone.zoneKey,
        feuilletCode: zone.feuilletCode,
        titre: feuillet?.titre || null,
        decouvreuseTeamId: Number(decouvreuse.id),
        tenanteTeamId: Number(team.id),
        via,
        roundNumber: Number(roundNumber) || 0,
        vitality,
        private: true,
        publicKeys: [
          'zoneKey',
          'feuilletCode',
          'titre',
          'decouvreuseTeamId',
          'tenanteTeamId',
          'via',
          'roundNumber',
        ],
      },
    }),
  );
  events.push(
    ...(await verifierCarnetCompletTx(tx, {
      gameId,
      game,
      resolved,
      settings,
      actorType,
      actorId,
    })),
  );
  const kraa = await setKraaTx(tx, gameId, {
    ...(zone.centre || { x: 0.5, y: 0.5 }),
    etat: 'page_tenue',
  });
  return {
    correct: true,
    etat: 'tenue',
    zoneKey: zone.zoneKey,
    feuilletCode: zone.feuilletCode,
    titre: feuillet?.titre || null,
    feedback: lectureRow ? resolveQcmAnswerFeedback(lectureRow, verification) : 'Page tenue.',
    kraa,
    events,
  };
}

// ---------------------------------------------------------------------
// Pistes de veillée (étude d'une espèce liée à une page endormie)
// ---------------------------------------------------------------------

/**
 * Révèle la zone endormie dont le feuillet est lié à l'espèce étudiée ; limite
 * `pistes_par_semaine` par élève. Renvoie `null` si rien à révéler.
 */
async function pisteTx(tx, { gameId, playerId, speciesCode, settings, actorType, actorId }) {
  const game = await loadGameForChasse(tx, gameId);
  if (!game) return null;
  const resolved = resolveTenirSettings(settings, game);
  const zones = await loadZonesForGame(tx, game, resolved);
  if (!zones.length) return null;
  const pages = await loadPages(tx, gameId);
  const candidates = zones.filter((z) => (pages.get(z.id)?.etat || 'endormie') === 'endormie');
  if (!candidates.length) return null;
  // D'abord les espèces de la zone (`especes_json`, catalogue `chasse-zones.json`), puis le
  // lien du feuillet (`lien_canal = 'espece'`) : aucune page de chasse réelle ne porte ce lien.
  const code = String(speciesCode || '')
    .trim()
    .toUpperCase();
  let zone =
    candidates.find((z) =>
      (Array.isArray(z.especes) ? z.especes : []).some((c) => String(c).toUpperCase() === code),
    ) || null;
  if (!zone) {
    const feuillets = await tx.queryAll(
      `SELECT feuillet_code FROM gl_lore_feuillets WHERE lien_canal = 'espece' AND lien_ref = ?
          AND feuillet_code IN (${candidates.map(() => '?').join(', ')})`,
      [speciesCode, ...candidates.map((z) => z.feuilletCode)],
    );
    if (!feuillets.length) return null;
    zone = candidates.find((z) => z.feuilletCode === String(feuillets[0].feuillet_code)) || null;
  }
  if (!zone) return null;
  const semaine = isoWeekOf(glClock.now());
  const limite = Number(resolved.pistes_par_semaine);
  const deja = await tx.queryOne(
    'SELECT COUNT(*) AS c FROM gl_game_chasse_pistes WHERE player_id = ? AND semaine_iso = ?',
    [playerId, semaine],
  );
  if (Number.isInteger(limite) && limite >= 0 && (Number(deja?.c) || 0) >= limite) {
    return { zoneKey: zone.zoneKey, limite: true };
  }
  const inserted = await tx.execute(
    'INSERT IGNORE INTO gl_game_chasse_pistes (game_id, zone_id, player_id, semaine_iso, created_at) VALUES (?, ?, ?, ?, NOW())',
    [gameId, zone.id, playerId, semaine],
  );
  if (!inserted?.affectedRows) return { zoneKey: zone.zoneKey, limite: false, deja: true };
  await lockPage(tx, gameId, zone.id);
  await tx.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'revelee', updated_at = NOW() WHERE game_id = ? AND zone_id = ? AND etat = 'endormie'",
    [gameId, zone.id],
  );
  const feuillet = await loadFeuilletMeta(tx, zone.feuilletCode);
  const event = await insertGameEvent(tx, {
    gameId,
    actorType,
    actorId,
    eventType: 'piste',
    payload: {
      zoneKey: zone.zoneKey,
      feuilletCode: zone.feuilletCode,
      titre: feuillet?.titre || null,
      speciesCode,
    },
  });
  return { zoneKey: zone.zoneKey, limite: false, event };
}

// ---------------------------------------------------------------------
// Carnet de la classe (lecture)
// ---------------------------------------------------------------------

/**
 * Carnet de la classe : indice, état, découvreuse, tenue par, pâlissement (pour l'équipe du
 * spectateur). Les polygones ne sont servis qu'au prof (`includeGeometry`).
 */
async function buildCarnetClasse(
  db,
  { game, settings, viewerTeamId = null, includeGeometry = false },
) {
  const resolved = resolveTenirSettings(settings, game);
  const zones = await loadZonesForGame(db, game, resolved);
  const pages = await loadPages(db, Number(game.id));
  const teams = await db.queryAll('SELECT id, name, type FROM gl_teams WHERE game_id = ?', [
    game.id,
  ]);
  const teamById = new Map(teams.map((t) => [Number(t.id), t]));
  const codes = zones.map((z) => z.feuilletCode);
  const titres = codes.length
    ? await db.queryAll(
        `SELECT feuillet_code, titre FROM gl_lore_feuillets WHERE feuillet_code IN (${codes.map(() => '?').join(', ')})`,
        codes,
      )
    : [];
  const titreByCode = new Map(titres.map((t) => [String(t.feuillet_code), t.titre]));
  const teamRef = (id) =>
    id != null && teamById.has(Number(id))
      ? { id: Number(id), name: teamById.get(Number(id)).name, type: teamById.get(Number(id)).type }
      : null;
  const items = zones.map((z) => {
    const page = pages.get(z.id) || { etat: 'endormie', palissement: {} };
    const trouvee = ETATS_TROUVEES.has(page.etat);
    return {
      zoneKey: z.zoneKey,
      ordre: z.ordre,
      indice: z.indice,
      etat: page.etat,
      feuilletCode: trouvee ? z.feuilletCode : null,
      titre: trouvee ? titreByCode.get(z.feuilletCode) || null : null,
      trouveePar: teamRef(page.trouveeParTeamId),
      tenuePar: teamRef(page.tenueParTeamId),
      palissementPct:
        viewerTeamId != null ? Number(page.palissement?.[String(viewerTeamId)]) || 0 : 0,
      // Contour visible de tous pour une page révélée, pâlie, trouvée ou tenue.
      contour: page.etat !== 'endormie' && z.centre ? { x: z.centre.x, y: z.centre.y } : null,
      ...(includeGeometry ? { points: z.points, rangCase: z.rangCase } : {}),
    };
  });
  const empreintes = await db.queryAll(
    `SELECT id, team_id, round_number, x, y, verdict, created_at FROM gl_game_chasse_empreintes
      WHERE game_id = ? ORDER BY id DESC LIMIT 200`,
    [game.id],
  );
  const state = await db.queryOne(
    'SELECT voile_position, kraa_json, carnet_complet_at FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1',
    [game.id],
  );
  return {
    pages: items,
    total: items.length,
    tenues: items.filter((i) => i.etat === 'tenue').length,
    trouvees: items.filter((i) => ETATS_TROUVEES.has(i.etat)).length,
    empreintes: empreintes.map((e) => ({
      id: Number(e.id),
      teamId: e.team_id != null ? Number(e.team_id) : null,
      roundNumber: Number(e.round_number) || 0,
      x: Number(e.x),
      y: Number(e.y),
      verdict: String(e.verdict),
      createdAt: e.created_at,
    })),
    voilePosition: Number(state?.voile_position ?? -1),
    kraa: parseJsonColumn(state?.kraa_json, null),
    carnetCompletAt: state?.carnet_complet_at || null,
  };
}

module.exports = {
  ETATS_FOUILLABLES,
  ETATS_TROUVEES,
  LECTURE_PREFIX,
  KRAA_ETATS,
  normalizePoint,
  findZoneAtPoint,
  nearestSleepingZone,
  verdictForDistance,
  loadZonesForGame,
  loadPages,
  initChassePagesForGame,
  fouillesRestantes,
  isSousVoile,
  pickChasseQuestion,
  presentChasseQuestion,
  fouillerTx,
  repondreChasseTx,
  ouvrirPageTx,
  tenirPageTx,
  verifierCarnetCompletTx,
  pisteTx,
  buildCarnetClasse,
  pasEncore,
  setKraaTx,
};
