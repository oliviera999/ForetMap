'use strict';

/**
 * Garde module activé/désactivé — ForetMap (`ui.modules.*`) et GL (`modules.*`).
 * Une seule implémentation : les routeurs passent `product` + clé logique.
 */

const { getSettingValue } = require('../settings');
const { getGlModulesSettings, moduleCamelKeyFor } = require('../glSettings');

const FM_MODULE_KEYS = Object.freeze({
  forum: 'ui.modules.forum_enabled',
  context_comments: 'ui.modules.context_comments_enabled',
  reports: 'ui.modules.reports_enabled',
  presence: 'ui.modules.presence_enabled',
  help: 'ui.modules.help_enabled',
  observations: 'ui.modules.observations_enabled',
  stats: 'ui.modules.stats_enabled',
  tutorials: 'ui.modules.tutorials_enabled',
  visit: 'ui.modules.visit_enabled',
  // Modules pédagogiques activables (25/09/2026) — ForetMap seulement, sans équivalent GL.
  id_keys: 'ui.modules.id_keys_enabled',
  individuals: 'ui.modules.individuals_enabled',
  pedago_sessions: 'ui.modules.pedago_sessions_enabled',
  rewards: 'ui.modules.rewards_enabled',
});

const GL_MODULE_LOGICAL = Object.freeze({
  forum: 'forum_enabled',
  context_comments: 'context_comments_enabled',
  presence: 'presence_enabled',
  market: 'market_enabled',
  notifications: 'notifications_enabled',
  journal: 'journal_enabled',
  player_journal: 'player_journal_enabled',
  spell_cast: 'spell_cast_enabled',
});

const DEFAULT_DISABLED_MESSAGES = Object.freeze({
  forum: 'Forum désactivé',
  context_comments: 'Commentaires de contexte désactivés',
  presence: 'Présence en ligne désactivée',
  reports: 'Signalements désactivés',
  market: 'Marché désactivé',
});

/**
 * @param {'foret'|'gl'|string} product
 * @param {string} logicalKey forum | context_comments | presence | …
 * @returns {Promise<boolean>}
 */
function snakeToCamelEnabled(snake) {
  return String(snake || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

async function isModuleEnabled(product, logicalKey) {
  const p = String(product || 'foret').toLowerCase();
  const key = String(logicalKey || '').trim();
  if (p === 'gl') {
    const snake = GL_MODULE_LOGICAL[key] || (key.endsWith('_enabled') ? key : `${key}_enabled`);
    const modules = await getGlModulesSettings();
    const camel = moduleCamelKeyFor(`modules.${snake}`) || snakeToCamelEnabled(snake);
    if (camel && Object.prototype.hasOwnProperty.call(modules, camel)) {
      return modules[camel] !== false;
    }
    return true;
  }
  const settingKey = FM_MODULE_KEYS[key] || `ui.modules.${key}_enabled`;
  return !!(await getSettingValue(settingKey, true));
}

/**
 * Middleware Express : 503 si le module est off.
 * @param {'foret'|'gl'} product
 * @param {string} logicalKey
 * @param {string} [message]
 */
function requireModuleEnabled(product, logicalKey, message) {
  return async function moduleEnabledMiddleware(req, res, next) {
    try {
      const on = await isModuleEnabled(product, logicalKey);
      if (!on) {
        const errMsg = message || DEFAULT_DISABLED_MESSAGES[logicalKey] || 'Module désactivé';
        return res.status(503).json({ error: errMsg });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  FM_MODULE_KEYS,
  GL_MODULE_LOGICAL,
  isModuleEnabled,
  requireModuleEnabled,
};
