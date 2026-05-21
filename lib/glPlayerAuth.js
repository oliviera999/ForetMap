'use strict';

const { queryOne, execute } = require('../database');

function normalizeEmail(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

/**
 * Connexion joueur GL via Google : compte actif avec email GL ou lien ForetMap élève.
 */
async function resolveGlPlayerLogin({ email, googleSub = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'Email requis' };
  }

  let player = await queryOne(
    `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.first_name, p.last_name,
            p.password_must_reset, p.is_active
       FROM gl_players p
      WHERE LOWER(p.email) = LOWER(?)
      LIMIT 1`,
    [normalizedEmail]
  );

  if (!player) {
    player = await queryOne(
      `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.first_name, p.last_name,
              p.password_must_reset, p.is_active
         FROM gl_players p
         INNER JOIN users u ON u.id = p.linked_foretmap_user_id AND u.user_type = 'student'
        WHERE LOWER(u.email) = LOWER(?)
        LIMIT 1`,
      [normalizedEmail]
    );
  }

  if (!player || !Number(player.is_active)) {
    return {
      ok: false,
      status: 403,
      error: 'Aucun compte joueur Gnomes & Licornes associé à cette adresse Google.',
    };
  }

  if (googleSub) {
    await execute(
      `UPDATE gl_players
          SET google_sub = COALESCE(?, google_sub),
              last_seen = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [googleSub, player.id]
    );
  } else {
    await execute('UPDATE gl_players SET last_seen = NOW(), updated_at = NOW() WHERE id = ?', [player.id]);
  }

  return { ok: true, player };
}

module.exports = {
  resolveGlPlayerLogin,
};
