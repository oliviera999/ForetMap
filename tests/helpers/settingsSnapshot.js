'use strict';

/**
 * Instantané / restauration d'un réglage `app_settings` pour les tests.
 *
 * Pourquoi : deux suites remettaient `ui.plan.map_id` à la valeur littérale `'lyautey'`
 * en `after()` — une carte qui n'existe pas en base de test. Le plan retombait alors sur
 * la première carte active, en l'occurrence une carte de fixture sans fond publié, et
 * les scénarios e2e `plan-mobile` (joués sur la même base après `npm test`) ne trouvaient
 * plus la scène carte. Un test restaure l'état qu'il a trouvé, pas une valeur devinée.
 */
const { queryOne, execute } = require('../../database');
const { invalidateSettingsCache } = require('../../lib/settings');

/** @returns {Promise<{ key: string, row: object|null }>} */
async function snapshotSetting(key) {
  const row = await queryOne(
    'SELECT `key`, scope, value_json, updated_by_user_type, updated_by_user_id FROM app_settings WHERE `key` = ? LIMIT 1',
    [key],
  );
  return { key, row: row || null };
}

/** Rétablit la ligne telle qu'elle était (ou son absence), puis invalide le cache. */
async function restoreSetting(snapshot) {
  if (!snapshot || !snapshot.key) return;
  const { key, row } = snapshot;
  if (!row) {
    await execute('DELETE FROM app_settings WHERE `key` = ?', [key]);
  } else {
    await execute(
      `INSERT INTO app_settings (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE scope = VALUES(scope), value_json = VALUES(value_json),
         updated_by_user_type = VALUES(updated_by_user_type), updated_by_user_id = VALUES(updated_by_user_id)`,
      [key, row.scope, row.value_json, row.updated_by_user_type, row.updated_by_user_id],
    );
  }
  invalidateSettingsCache();
}

module.exports = { snapshotSetting, restoreSetting };
