'use strict';

/**
 * Réglages `gl_settings` posés par le banc : base commune de la mouture (identique aux suites
 * `tests/gl-tenir-*`), réglages d'un scénario ou d'une variante de grille, puis remise des
 * valeurs précédentes entre deux exécutions.
 *
 * Écriture par `upsertGlSetting` (`lib/glSettings.js`, caches invalidés) ; si une clé est
 * refusée, elle est posée directement dans `gl_settings` par SQL paramétré, puis les caches sont
 * invalidés. Une clé que le moteur ignore (ex. `tenir_fouilles_reparation_gnome` livrée par une
 * autre étape) est ainsi posée quand même, comme le cahier des charges le demande.
 */

const REGLAGES_BASE = Object.freeze({
  'gameplay.tenir_enabled': true,
  'gameplay.vitality_enabled': true,
  'gameplay.max_health_points': 8,
  'gameplay.max_power_points': 8,
  'gameplay.market_hearts_enabled': true,
  'gameplay.lore_gemme_costs_enabled': false,
  'gameplay.lore_heart_rewards_enabled': false,
  'gameplay.marker_question_retrigger': 'every_arrival',
  'modules.market_enabled': true,
  'modules.spell_cast_enabled': true,
  'gameplay.spell_cast_contribution_mode': 'coordinator',
  'gameplay.spell_cast_team_scope': 'own_team',
  'gameplay.marker_effect_auto_move_enabled': true,
});

function invaliderCaches() {
  const s = require('../../lib/glSettings');
  for (const fn of ['invalidateGameplayCache', 'invalidateModulesCache', 'invalidateGatingCache']) {
    if (typeof s[fn] === 'function') s[fn]();
  }
}

/** Lit les lignes actuelles des clés (pour les remettre ensuite). */
async function lireEtat(db, keys) {
  if (!keys.length) return new Map();
  const rows = await db.queryAll(
    `SELECT \`key\`, value_json FROM gl_settings WHERE \`key\` IN (${keys.map(() => '?').join(', ')})`,
    keys,
  );
  const etat = new Map(keys.map((k) => [k, null]));
  for (const r of rows) etat.set(String(r.key), r.value_json == null ? null : String(r.value_json));
  return etat;
}

async function poserUne(db, key, value) {
  const { upsertGlSetting } = require('../../lib/glSettings');
  try {
    await upsertGlSetting(key, value, null);
  } catch (_) {
    await db.execute(
      `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }
}

/**
 * Pose `reglages` (`{ clé: valeur }`) et renvoie l'état précédent (à passer à `remettre`).
 * @returns {Promise<Map<string, string|null>>}
 */
async function appliquerReglages(db, reglages) {
  const entries = Object.entries(reglages || {});
  const precedent = await lireEtat(
    db,
    entries.map(([k]) => k),
  );
  for (const [key, value] of entries) await poserUne(db, key, value);
  invaliderCaches();
  return precedent;
}

/** Remet l'état précédent : supprime les clés absentes avant, restaure les autres. */
async function remettreReglages(db, precedent) {
  if (!precedent || !precedent.size) return;
  for (const [key, valueJson] of precedent) {
    if (valueJson == null) {
      await db.execute('DELETE FROM gl_settings WHERE `key` = ?', [key]);
    } else {
      await db.execute(
        `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
        [key, valueJson],
      );
    }
  }
  invaliderCaches();
}

module.exports = { REGLAGES_BASE, invaliderCaches, lireEtat, appliquerReglages, remettreReglages };
