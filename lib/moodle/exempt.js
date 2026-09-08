'use strict';

/**
 * Marquage « hors synchronisation » (section 11) : `users.sync_exempt` / `groups.sync_exempt`,
 * posé et retiré depuis l'écran administrateur seulement. Un objet marqué n'est ni écrit ni
 * désactivé par la synchronisation, et n'est pas poussé vers Moodle.
 */

const { queryOne, queryAll, execute } = require('../../database');

async function setExempt({ targetType, targetId, exempt = true }) {
  const id = String(targetId || '').trim();
  if (!id) return { ok: false, error: 'Identifiant requis' };
  const flag = exempt ? 1 : 0;
  if (targetType === 'user') {
    const row = await queryOne('SELECT id, sync_exempt FROM users WHERE id = ? LIMIT 1', [id]);
    if (!row) return { ok: false, error: 'Compte introuvable' };
    await execute('UPDATE users SET sync_exempt = ?, updated_at = NOW() WHERE id = ?', [flag, id]);
    return {
      ok: true,
      targetType,
      targetId: id,
      exempt: Boolean(flag),
      previous: Number(row.sync_exempt) === 1,
    };
  }
  if (targetType === 'group') {
    const row = await queryOne('SELECT id, sync_exempt FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!row) return { ok: false, error: 'Groupe introuvable' };
    await execute('UPDATE `groups` SET sync_exempt = ?, updated_at = NOW() WHERE id = ?', [
      flag,
      id,
    ]);
    return {
      ok: true,
      targetType,
      targetId: id,
      exempt: Boolean(flag),
      previous: Number(row.sync_exempt) === 1,
    };
  }
  return { ok: false, error: 'Type invalide (user ou group)' };
}

async function listExempt() {
  const users = await queryAll(
    'SELECT id, user_type, display_name, email, pseudo FROM users WHERE sync_exempt = 1 ORDER BY display_name ASC LIMIT 500',
  );
  const groups = await queryAll(
    'SELECT id, name, slug, kind FROM `groups` WHERE sync_exempt = 1 ORDER BY name ASC LIMIT 500',
  );
  return {
    users: users.map((u) => ({
      userId: u.id,
      userType: u.user_type,
      displayName: u.display_name,
      email: u.email,
      pseudo: u.pseudo,
    })),
    groups: groups.map((g) => ({ groupId: g.id, name: g.name, slug: g.slug, kind: g.kind })),
  };
}

module.exports = { setExempt, listExempt };
