'use strict';

const { execute } = require('../database');
const { nowIsoUtc } = require('./shared/isoTimestamp');
const {
  findGlPlayerByEmail,
  findGlPlayerByGoogleSub,
  isGlPlayerLoginActive,
} = require('./glPlayerIdentity');

function normalizeEmail(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

/**
 * Connexion joueur GL via Google : l'adresse (ou le `google_sub` déjà mémorisé) est celle du
 * compte `users` lié au joueur — depuis l'unification, `gl_players` ne porte plus d'e-mail.
 */
async function resolveGlPlayerLogin({ email, googleSub = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'Email requis' };
  }

  let player = await findGlPlayerByEmail(normalizedEmail);
  if (!player && googleSub) {
    player = await findGlPlayerByGoogleSub(googleSub);
  }

  if (!player || !isGlPlayerLoginActive(player)) {
    return {
      ok: false,
      status: 403,
      error: 'Aucun compte joueur Gnomes & Licornes associé à cette adresse Google.',
    };
  }

  if (googleSub && player.user_id && !player.google_sub) {
    await execute(
      'UPDATE users SET google_sub = ?, updated_at = NOW() WHERE id = ? AND google_sub IS NULL',
      [googleSub, player.user_id],
    );
  }
  await execute('UPDATE gl_players SET last_seen = NOW(), updated_at = NOW() WHERE id = ?', [
    player.id,
  ]);
  if (player.user_id) {
    await execute('UPDATE users SET last_seen = ?, updated_at = NOW() WHERE id = ?', [
      nowIsoUtc(),
      player.user_id,
    ]);
  }

  return { ok: true, player };
}

module.exports = {
  resolveGlPlayerLogin,
};
