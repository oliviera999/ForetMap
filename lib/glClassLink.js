'use strict';

/**
 * « Tenir à deux », lot 2 — lien de classe permanent et session d'équipe.
 *
 * - **Lien de classe** (`gl_class_links`, migration 349) : un par classe, valable jusqu'à sa
 *   régénération. Le prof imprime une fois le QR (`gl.html?classe=<jeton>`) et le code à huit
 *   caractères. Le jeton se recalcule depuis le code et le secret du serveur : seul son
 *   hachage est stocké.
 * - **Ouverture** : la tablette présente le jeton (QR) ou le code ; le serveur répond le nom de
 *   la classe, la partie « Tenir à deux » en cours, ses équipes et la phase — aucun nom d'élève.
 * - **Session d'équipe** : la tablette touche la mascotte de son équipe et reçoit un jeton
 *   invité de 3 heures (`lib/glGuestToken.js`), révocable. Régénérer le lien révoque toutes les
 *   sessions de la classe ; la clôture de la partie et le rebrassage des équipes aussi.
 */

const crypto = require('node:crypto');
const { JWT_SECRET } = require('../middleware/requireTeacher');
const { getGameplaySettings } = require('./glSettings');
const { isTenirGame } = require('./glTenir');
const { hashJti, issueTeamSession, revokeTeamSessions } = require('./glGuestToken');

/** Alphabet du code : ni 0 / O, ni 1 / I / L (lisibles à l'oral et sur une feuille). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

function fail(code, status) {
  const err = new Error(code);
  err.status = status;
  return err;
}

/**
 * Code de classe : un secret, pas un tirage de jeu — il ne passe donc pas par `lib/glRandom.js`
 * (qu'une graine rend reproductible sur le banc). Octets cryptographiques, tirage sans biais
 * (les octets au-delà du dernier multiple de la taille de l'alphabet sont rejetés).
 */
function newCode() {
  const max = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const byte of crypto.randomBytes(CODE_LENGTH * 2)) {
      if (byte < max && out.length < CODE_LENGTH) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Code saisi → forme canonique (majuscules, sans espace ni tiret), ou `null` s'il est invalide. */
function normalizeCode(raw) {
  const code = String(raw || '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}

/** Jeton de l'URL, recalculé depuis la classe et son code (jamais stocké en clair). */
function tokenFor(classId, code) {
  return crypto
    .createHmac('sha256', String(JWT_SECRET))
    .update(`gl-class-link:${Number(classId)}:${code}`)
    .digest('base64url')
    .slice(0, 32);
}

function urlFor(token) {
  return `gl.html?classe=${encodeURIComponent(token)}`;
}

function describeLink(row) {
  const token = tokenFor(row.class_id, row.code);
  return {
    classId: Number(row.class_id),
    code: String(row.code),
    token,
    url: urlFor(token),
    createdAt: row.created_at,
  };
}

async function loadClass(db, classId) {
  return db.queryOne('SELECT id, name FROM gl_classes WHERE id = ? LIMIT 1', [classId]);
}

async function writeLink(db, { classId, createdBy }) {
  // Collision de code (unique) : on retire, quelques essais suffisent largement.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    try {
      await db.execute(
        `INSERT INTO gl_class_links (class_id, token_hash, code, created_by, created_at, revoked_at)
         VALUES (?, ?, ?, ?, NOW(), NULL)
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), code = VALUES(code),
           created_by = VALUES(created_by), created_at = NOW(), revoked_at = NULL`,
        [classId, hashJti(tokenFor(classId, code)), code, createdBy],
      );
      return;
    } catch (err) {
      if (err?.errno !== 1062 && err?.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  throw fail('CLASS_LINK_CODE', 500);
}

/**
 * Lien de la classe : créé au besoin, sinon rendu tel quel (il est permanent).
 * @throws 404 `CLASS_NOT_FOUND`
 */
async function ensureClassLink(db, { classId, createdBy = null }) {
  const cls = await loadClass(db, classId);
  if (!cls) throw fail('CLASS_NOT_FOUND', 404);
  let row = await db.queryOne(
    'SELECT class_id, code, created_at FROM gl_class_links WHERE class_id = ? AND revoked_at IS NULL LIMIT 1',
    [classId],
  );
  if (!row) {
    await writeLink(db, { classId, createdBy });
    row = await db.queryOne(
      'SELECT class_id, code, created_at FROM gl_class_links WHERE class_id = ? LIMIT 1',
      [classId],
    );
  }
  return { ...describeLink(row), className: cls.name };
}

/**
 * Nouveau lien : l'ancien QR et l'ancien code ne valent plus rien, et toutes les sessions
 * d'équipe de la classe sont révoquées.
 */
async function regenerateClassLink(db, { classId, createdBy = null }) {
  const cls = await loadClass(db, classId);
  if (!cls) throw fail('CLASS_NOT_FOUND', 404);
  await writeLink(db, { classId, createdBy });
  const sessionsRevoquees = await revokeTeamSessions(db, { classId });
  const row = await db.queryOne(
    'SELECT class_id, code, created_at FROM gl_class_links WHERE class_id = ? LIMIT 1',
    [classId],
  );
  return { ...describeLink(row), className: cls.name, sessionsRevoquees };
}

/** Classe désignée par un jeton (QR) ou un code (saisie), ou `null`. */
async function findClassByLink(db, { token = null, code = null }) {
  const canon = normalizeCode(code);
  const jeton = String(token || '').trim();
  let row = null;
  if (jeton) {
    row = await db.queryOne(
      'SELECT class_id, code FROM gl_class_links WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1',
      [hashJti(jeton)],
    );
  } else if (canon) {
    row = await db.queryOne(
      'SELECT class_id, code FROM gl_class_links WHERE code = ? AND revoked_at IS NULL LIMIT 1',
      [canon],
    );
  }
  if (!row) return null;
  const cls = await loadClass(db, row.class_id);
  return cls ? { id: Number(cls.id), name: cls.name } : null;
}

/** Partie « Tenir à deux » en cours d'une classe (la plus récente), ou `null`. */
async function loadPartieEnCours(db, classId) {
  const settings = await getGameplaySettings();
  const games = await db.queryAll(
    `SELECT id, name, status, tenir_profil, tenir_surface, tenir_overrides_json, current_round_number
       FROM gl_games WHERE class_id = ? AND status IN ('live', 'paused')
      ORDER BY (status = 'live') DESC, updated_at DESC, id DESC`,
    [classId],
  );
  return games.find((g) => isTenirGame(settings, g)) || null;
}

/**
 * Ce que voit une tablette qui ouvre le lien : la classe, la partie en cours, ses équipes, la
 * phase. Aucun nom d'élève, aucune bourse.
 * @throws 404 `CLASS_LINK_INCONNU`
 */
async function openClassLink(db, { token = null, code = null }) {
  const cls = await findClassByLink(db, { token, code });
  if (!cls) throw fail('CLASS_LINK_INCONNU', 404);
  const game = await loadPartieEnCours(db, cls.id);
  if (!game) return { className: cls.name, game: null, teams: [], phase: null };
  const teams = await db.queryAll(
    'SELECT id, name, type, mascot_id, color FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [game.id],
  );
  const round = Number(game.current_round_number)
    ? await db.queryOne(
        'SELECT phase FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
        [game.id, game.current_round_number],
      )
    : null;
  return {
    className: cls.name,
    game: { id: Number(game.id), name: game.name, status: game.status },
    teams: teams.map((t) => ({
      teamId: Number(t.id),
      name: t.name,
      mascotId: t.mascot_id || null,
      type: t.type,
      color: t.color || null,
    })),
    phase: round?.phase || null,
  };
}

/**
 * Ouvre une session d'équipe : la tablette a touché la mascotte de son équipe.
 * @throws 404 `CLASS_LINK_INCONNU`, 409 `CLASS_LINK_SANS_PARTIE`, 404 `TEAM_NOT_FOUND`
 */
async function openTeamSession(db, { token = null, code = null, teamId }) {
  const cls = await findClassByLink(db, { token, code });
  if (!cls) throw fail('CLASS_LINK_INCONNU', 404);
  const game = await loadPartieEnCours(db, cls.id);
  if (!game) throw fail('CLASS_LINK_SANS_PARTIE', 409);
  const team = await db.queryOne(
    'SELECT id, name, type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [Number(teamId) || 0, game.id],
  );
  if (!team) throw fail('TEAM_NOT_FOUND', 404);
  const session = await issueTeamSession(db, {
    gameId: Number(game.id),
    teamId: Number(team.id),
    classId: cls.id,
  });
  return {
    token: session.token,
    expiresInSeconds: session.expiresInSeconds,
    gameId: Number(game.id),
    teamId: Number(team.id),
    teamName: team.name,
    teamType: team.type,
    className: cls.name,
  };
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  normalizeCode,
  tokenFor,
  ensureClassLink,
  regenerateClassLink,
  findClassByLink,
  openClassLink,
  openTeamSession,
};
