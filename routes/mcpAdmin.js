'use strict';

/**
 * Administration du connecteur Claude (lot E) — montée sous `/api/settings/admin/mcp` :
 *
 * - `GET /status` (admin.settings.read) : réglages `mcp.*` (valeur effective, source
 *   `env` / `base` / `défaut`, verrou), outils exposés pour un administrateur, un n3boss et un
 *   prof de classe (calculés par `checkToolAccess`, comme `tools/list`), état du bypass RGPD,
 *   vingt dernières lignes d'audit `via: 'mcp'` ;
 * - `POST /write-off` (admin.settings.write) : « Couper l'écriture » d'un geste —
 *   `mcp.api_bridge_enabled=false`, `mcp.sql_write_enabled=false`, `mcp.write_mode=plan`. Une
 *   clé verrouillée par l'environnement est laissée telle quelle et signalée.
 */

const express = require('express');
const { queryAll } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('../lib/auditLog');
const { setSetting } = require('../lib/settings');
const { MCP_SETTINGS } = require('../lib/settings/mcp');

const router = express.Router();

/** Profils dont on montre les outils (le prof de classe n'a pas `mcp.use` par défaut). */
const PROFILE_SLUGS = Object.freeze(['admin', 'prof', 'prof_classe']);

const WRITE_OFF = Object.freeze([
  ['mcp.api_bridge_enabled', false],
  ['mcp.sql_write_enabled', false],
  ['mcp.write_mode', 'plan'],
]);

async function permissionsOfRole(slug) {
  const rows = await queryAll(
    `SELECT rp.permission_key AS k FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
      WHERE r.slug = ?`,
    [slug],
  );
  return rows.map((r) => r.k);
}

/** Outils que `tools/list` proposerait à un compte de ce profil (portées accordables). */
async function toolsForProfile(cfg, slug) {
  const { getToolDefs, buildAccess } = require('../lib/mcp/server');
  const { checkToolAccess } = require('../lib/mcp/registry');
  const { grantableScopes } = require('../lib/mcp/oauth/bearer');
  const permissions = await permissionsOfRole(slug);
  const scopes = [...grantableScopes(permissions, cfg.writeScopePolicy)];
  if (!permissions.includes('mcp.use')) {
    return { profile: slug, connector: false, scopes: [], tools: [] };
  }
  const access = buildAccess(cfg, { scopes, permissions, roleSlug: slug });
  const tools = getToolDefs()
    .filter((def) => checkToolAccess(def, access).ok)
    .map((def) => def.name);
  return { profile: slug, connector: true, scopes, count: tools.length, tools };
}

async function lastMcpActivity() {
  const rows = await queryAll(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.created_at, a.result,
            a.actor_user_id, u.display_name AS actor_name, a.payload_json
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.payload_json LIKE '%"via":"mcp"%'
      ORDER BY a.id DESC
      LIMIT 20`,
  );
  return rows.map((r) => {
    let payload = r.payload_json;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }
    return {
      id: r.id,
      at: r.created_at,
      actor: r.actor_name || r.actor_user_id || null,
      tool: payload?.mcp_tool || payload?.tool || null,
      action: r.action,
      target: r.target_type ? `${r.target_type}${r.target_id ? ` ${r.target_id}` : ''}` : null,
      result: r.result,
    };
  });
}

router.get(
  '/status',
  requirePermission('admin.settings.read'),
  asyncHandler(async (req, res) => {
    const { getMcpConfig, resolveMcpSettings } = require('../lib/mcp/config');
    const cfg = getMcpConfig(await resolveMcpSettings({ force: true }));
    const settings = Object.entries(cfg.settings).map(([key, e]) => ({
      key,
      value: e.value,
      source: e.source,
      locked: e.locked,
      env: e.env,
      type: MCP_SETTINGS[key].type,
      values: MCP_SETTINGS[key].values || null,
      min: MCP_SETTINGS[key].min ?? null,
      max: MCP_SETTINGS[key].max ?? null,
      default_value: MCP_SETTINGS[key].default,
    }));
    const profiles = [];
    for (const slug of PROFILE_SLUGS) profiles.push(await toolsForProfile(cfg, slug));
    res.json({
      enabled: cfg.enabled,
      settings,
      privacy_bypass: {
        active: cfg.privacyBypassActive,
        ack: cfg.privacyBypassAck,
        ack_missing_reason: cfg.privacyBypassReason,
      },
      profiles,
      activity: await lastMcpActivity(),
    });
  }),
);

router.post(
  '/write-off',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const { buildSettingsEntries } = require('../lib/mcp/config');
    const entries = buildSettingsEntries({});
    const applied = [];
    const locked = [];
    for (const [key, value] of WRITE_OFF) {
      if (entries[key].locked) {
        locked.push({ key, env: entries[key].env });
        continue;
      }
      await setSetting(key, value, { userType: req.auth?.userType, userId: req.auth?.userId });
      applied.push({ key, value });
    }
    await logAudit('mcp.write_off', 'setting', 'mcp', 'Écriture du connecteur Claude coupée', {
      req,
      payload: { applied, locked },
    });
    res.json({ ok: true, applied, locked });
  }),
);

module.exports = router;
