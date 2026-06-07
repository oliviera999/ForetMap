'use strict';

const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../lib/glGameAccess');
const { getGameplaySettings, getGlModulesSettings, LORE_SPOILER_LEVELS } = require('../../lib/glSettings');
const { parseBiomeSlugsFromQuery, normalizeBiomeSlugList } = require('../../lib/glChapterBiomes');
const { sendXlsxAttachment, wrapXlsxRoute } = require('../../lib/glXlsxAttachment');
const { parseGlId, resolveTeamContext } = require('../../lib/glTeamContext');
const { recordFeuilletEvent } = require('../../lib/glLoreFeuilletEvents');
const {
  FEUILLET_SELECT,
  FEUILLET_ZONE_ORDER_SQL,
  formatFeuilletRow,
  loadFeuilletStates,
  findFeuilletsForZone,
  upsertFeuilletState,
} = require('../../lib/glLoreFeuillets');
const {
  canPresentFeuillet,
  resolveLoreFeuilletRetrigger,
  resolveLoreBoolSetting,
} = require('../../lib/glLoreFeuilletRetrigger');
const {
  applyFeuilletVitalityEffects,
  computeEffacementPct,
  canHoldFeuillet,
} = require('../../lib/glLoreFeuilletEffects');
const { resolveVitalityError } = require('../../lib/glVitality');
const {
  parseFeuilletsWorkbook,
  resolveFeuilletsImportBody,
  applyFeuilletsImport,
  buildFeuilletsTemplateWorkbook,
  buildFeuilletsExportWorkbook,
  loadFeuilletsExportRows,
  buildFeuilletPayload,
} = require('../../lib/glLoreFeuilletsImport');
const {
  parseLoreGlossaryWorkbook,
  resolveLoreGlossaryImportBody,
  applyLoreGlossaryImport,
  buildLoreGlossaryTemplateWorkbook,
  buildLoreGlossaryExportWorkbook,
  loadLoreGlossaryExportRows,
  upsertLoreGlossaryTerm,
  allocateNextLoreCode,
  LORE_GLOSSARY_CATEGORIES,
} = require('../../lib/glLoreGlossaryImport');
const {
  LORE_GLOSSARY_CATEGORY_LABELS,
  LORE_NIVEAU_LABELS,
  filterLoreGlossaryList,
} = require('../../lib/glLoreGlossaryMatch');

const router = express.Router();
const db = { queryAll, queryOne, execute };

function parseId(value) {
  return parseGlId(value);
}

function resolveLoreSettings(gameRow, gameplaySettings) {
  return {
    retrigger: resolveLoreFeuilletRetrigger(gameRow, gameplaySettings),
    effacementEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_effacement_enabled', gameplaySettings, 'loreEffacementEnabled', true
    ),
    gemmeCostsEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_gemme_costs_enabled', gameplaySettings, 'loreGemmeCostsEnabled', true
    ),
    heartRewardsEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_heart_rewards_enabled', gameplaySettings, 'loreHeartRewardsEnabled', true
    ),
    spoilerMaxLevel: gameplaySettings.loreSpoilerMaxLevel || 'recit',
  };
}

/** GET /api/gl/lore/feuillets */
router.get('/feuillets', requireGlAuth, async (req, res) => {
  const modules = await getGlModulesSettings();
  if (!modules.loreCarnetEnabled) return res.status(404).json({ error: 'Module carnet désactivé' });

  const gameId = parseId(req.query?.gameId);
  const teamId = parseId(req.query?.teamId);
  const biomeSlugs = parseBiomeSlugsFromQuery(req.query?.biomeSlugs);
  const liasse = String(req.query?.liasse || '').trim();

  let progressMap = new Map();
  if (gameId && teamId) {
    progressMap = await loadFeuilletStates(db, gameId, teamId);
  }

  const params = [];
  let sql = `SELECT ${FEUILLET_SELECT} FROM gl_lore_feuillets f WHERE f.statut = 'actif'`;
  if (biomeSlugs.length) {
    sql += ` AND (f.biome_slug IS NULL OR f.biome_slug IN (${biomeSlugs.map(() => '?').join(', ')}))`;
    params.push(...biomeSlugs);
  }
  if (liasse) {
    sql += ' AND f.liasse = ?';
    params.push(liasse);
  }
  sql += ' ORDER BY f.ordre_voyage ASC, f.ordre_liasse ASC, f.feuillet_code ASC LIMIT 500';

  const rows = await queryAll(sql, params);
  const isMj = req.glAuth.userType === 'gl_admin';
  const items = rows.map((row) => {
    const progress = progressMap.get(String(row.feuillet_code));
    return formatFeuilletRow(row, {
      isMj,
      progressStatus: progress?.status || (gameId ? 'locked' : null),
      effacementPct: progress?.effacement_pct || 0,
    });
  });
  return res.json({ items });
});

/** GET /api/gl/lore/feuillets/:code */
router.get('/feuillets/:code', requireGlAuth, async (req, res) => {
  const modules = await getGlModulesSettings();
  if (!modules.loreCarnetEnabled) return res.status(404).json({ error: 'Module carnet désactivé' });

  const code = String(req.params.code || '').trim();
  const gameId = parseId(req.query?.gameId);
  const teamId = parseId(req.query?.teamId);
  const row = await queryOne(`SELECT ${FEUILLET_SELECT} FROM gl_lore_feuillets f WHERE f.feuillet_code = ? LIMIT 1`, [code]);
  if (!row || row.statut !== 'actif') return res.status(404).json({ error: 'Feuillet introuvable' });

  let progress = null;
  if (gameId && teamId) {
    progress = await queryOne(
      `SELECT status, effacement_pct FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [gameId, teamId, code]
    );
  }
  const isMj = req.glAuth.userType === 'gl_admin';
  if (progress?.status === 'locked' && !isMj) {
    return res.status(403).json({ error: 'Feuillet non découvert' });
  }
  return res.json({
    feuillet: formatFeuilletRow(row, {
      isMj,
      progressStatus: progress?.status || null,
      effacementPct: progress?.effacement_pct || 0,
    }),
  });
});

/** POST /api/gl/lore/games/:id/feuillets/:code/present */
router.post('/games/:id/feuillets/:code/present', requireGlAuth, async (req, res) => {
  const modules = await getGlModulesSettings();
  if (!modules.loreCarnetEnabled) return res.status(404).json({ error: 'Module carnet désactivé' });

  const gameId = parseId(req.params.id);
  const code = String(req.params.code || '').trim();
  if (!gameId || !code) return res.status(400).json({ error: 'Identifiants invalides' });

  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    return res.status(403).json({ error: 'Accès partie refusé' });
  }

  const game = await queryOne(
    `SELECT id, chapter_id, status, lore_feuillet_retrigger, lore_effacement_enabled,
            lore_gemme_costs_enabled, lore_heart_rewards_enabled
       FROM gl_games WHERE id = ? LIMIT 1`,
    [gameId]
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const feuillet = await queryOne(`SELECT ${FEUILLET_SELECT} FROM gl_lore_feuillets f WHERE f.feuillet_code = ? LIMIT 1`, [code]);
  if (!feuillet || feuillet.statut !== 'actif') return res.status(404).json({ error: 'Feuillet introuvable' });

  const teamCtx = await resolveTeamContext(req, gameId, req.body?.teamId);
  if (teamCtx.error) return res.status(teamCtx.error.status).json({ error: teamCtx.error.message });
  const { teamId } = teamCtx;

  const gameplaySettings = await getGameplaySettings();
  const loreSettings = resolveLoreSettings(game, gameplaySettings);

  const kingdomZoneId = parseId(req.body?.kingdomZoneId ?? req.body?.zoneId);
  const canPresent = await canPresentFeuillet(db, {
    gameId,
    teamId,
    feuilletCode: code,
    retriggerMode: loreSettings.retrigger,
  });
  if (!canPresent) return res.status(409).json({ error: 'Feuillet déjà présenté selon les règles de re-déclenchement' });

  let effacementPct = 0;
  if (loreSettings.effacementEnabled) {
    const existing = await queryOne(
      `SELECT effacement_pct FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [gameId, teamId, code]
    );
    effacementPct = computeEffacementPct(feuillet, existing?.effacement_pct || 0);
  }

  let vitalityPayload = null;
  try {
    await withTransaction(async (tx) => {
      vitalityPayload = await applyFeuilletVitalityEffects(tx, {
        gameId,
        teamId,
        feuillet,
        settings: gameplaySettings,
        loreSettings,
        actorId: String(req.glAuth.userId),
        reason: feuillet.titre || code,
      });
      await upsertFeuilletState(tx, {
        gameId,
        teamId,
        feuilletCode: code,
        status: effacementPct >= 100 ? 'effaced' : 'discovered',
        effacementPct,
        unlockedVia: kingdomZoneId ? 'zone' : 'story',
        kingdomZoneId,
      });
    });
  } catch (err) {
    const mapped = resolveVitalityError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  await recordFeuilletEvent(gameId, teamId, actorType, String(req.glAuth.userId), 'feuillet_discovered', {
    feuilletCode: code,
    titre: feuillet.titre,
    kingdomZoneId,
    effacementPct,
    vitality: vitalityPayload,
  });

  const isMj = req.glAuth.userType === 'gl_admin';
  return res.json({
    feuillet: formatFeuilletRow(feuillet, { isMj, progressStatus: 'discovered', effacementPct }),
    vitality: vitalityPayload,
  });
});

/** POST /api/gl/lore/games/:id/feuillets/:code/read */
router.post('/games/:id/feuillets/:code/read', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const code = String(req.params.code || '').trim();
  if (!gameId || !code) return res.status(400).json({ error: 'Identifiants invalides' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) return res.status(403).json({ error: 'Accès partie refusé' });

  const teamCtx = await resolveTeamContext(req, gameId, req.body?.teamId);
  if (teamCtx.error) return res.status(teamCtx.error.status).json({ error: teamCtx.error.message });

  await upsertFeuilletState(db, {
    gameId,
    teamId: teamCtx.teamId,
    feuilletCode: code,
    status: 'read',
  });

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  await recordFeuilletEvent(gameId, teamCtx.teamId, actorType, String(req.glAuth.userId), 'feuillet_read', {
    feuilletCode: code,
  });
  return res.json({ ok: true });
});

/** POST /api/gl/lore/games/:id/feuillets/:code/hold */
router.post('/games/:id/feuillets/:code/hold', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const code = String(req.params.code || '').trim();
  if (!gameId || !code) return res.status(400).json({ error: 'Identifiants invalides' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) return res.status(403).json({ error: 'Accès partie refusé' });

  const feuillet = await queryOne('SELECT tenir FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1', [code]);
  if (!feuillet || !canHoldFeuillet(feuillet)) {
    return res.status(409).json({ error: 'Ce feuillet ne peut pas être tenu' });
  }

  const teamCtx = await resolveTeamContext(req, gameId, req.body?.teamId);
  if (teamCtx.error) return res.status(teamCtx.error.status).json({ error: teamCtx.error.message });

  await upsertFeuilletState(db, {
    gameId,
    teamId: teamCtx.teamId,
    feuilletCode: code,
    status: 'held',
  });

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  await recordFeuilletEvent(gameId, teamCtx.teamId, actorType, String(req.glAuth.userId), 'feuillet_held', {
    feuilletCode: code,
    tenir: feuillet.tenir,
  });
  return res.json({ ok: true, tenir: feuillet.tenir });
});

/** GET /api/gl/lore/games/:id/zones/:zoneId/feuillets — candidats à la découverte */
router.get('/games/:id/zones/:zoneId/feuillets', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const zoneId = parseId(req.params.zoneId);
  if (!gameId || !zoneId) return res.status(400).json({ error: 'Identifiants invalides' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne('SELECT id, chapter_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const zone = await queryOne(
    'SELECT id, chapter_id, label FROM gl_kingdom_zones WHERE id = ? LIMIT 1',
    [zoneId]
  );
  if (!zone || Number(zone.chapter_id) !== Number(game.chapter_id)) {
    return res.status(404).json({ error: 'Zone introuvable' });
  }

  const biomeRows = await queryAll(
    'SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index ASC',
    [game.chapter_id]
  );
  const biomeSlugs = biomeRows.map((r) => String(r.biome_slug));

  const linked = await queryAll(
    `SELECT ${FEUILLET_SELECT} FROM gl_lore_feuillets f
      WHERE f.statut = 'actif' AND f.kingdom_zone_id = ?
      ${FEUILLET_ZONE_ORDER_SQL}`,
    [zoneId]
  );
  const candidates = linked.length
    ? linked
    : await findFeuilletsForZone(db, {
      zoneId,
      zoneLabel: zone.label,
      biomeSlugs,
    });

  return res.json({
    items: candidates.map((row) => formatFeuilletRow(row, { isMj: req.glAuth.userType === 'gl_admin' })),
  });
});

/** GET /api/gl/lore/glossary */
router.get('/glossary', requireGlAuth, async (req, res) => {
  const modules = await getGlModulesSettings();
  if (!modules.loreGlossaryEnabled) return res.status(404).json({ error: 'Module glossaire lore désactivé' });

  const gameplay = await getGameplaySettings();
  const isMj = req.glAuth.userType === 'gl_admin';
  const rows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, niveau, definition_courte, chapitre_scope, statut
       FROM gl_lore_glossary_terms
      WHERE statut = 'actif'
      ORDER BY categorie ASC, terme ASC`
  );
  const items = filterLoreGlossaryList(rows, {
    categorie: String(req.query?.categorie || '').trim() || null,
    niveau: String(req.query?.niveau || '').trim() || null,
    q: String(req.query?.q || '').trim(),
    chapitreScope: String(req.query?.chapitreScope || '').trim() || null,
    maxSpoilerLevel: gameplay.loreSpoilerMaxLevel,
    isMj,
  }).map((row) => ({
    lore_code: row.lore_code,
    terme: row.terme,
    variantes: row.variantes,
    categorie: row.categorie,
    categorie_label: LORE_GLOSSARY_CATEGORY_LABELS[row.categorie] || row.categorie,
    niveau: row.niveau,
    niveau_label: LORE_NIVEAU_LABELS[row.niveau] || row.niveau,
    definition_courte: row.definition_courte,
    chapitre_scope: row.chapitre_scope,
  }));
  return res.json({ items });
});

/** GET /api/gl/lore/glossary/:code */
router.get('/glossary/:code', requireGlAuth, async (req, res) => {
  const modules = await getGlModulesSettings();
  if (!modules.loreGlossaryEnabled) return res.status(404).json({ error: 'Module glossaire lore désactivé' });

  const code = String(req.params.code || '').trim();
  const gameplay = await getGameplaySettings();
  const isMj = req.glAuth.userType === 'gl_admin';
  const term = await queryOne(
    `SELECT lore_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
            role_recit, correspondance_reelle, chapitre_scope, source, statut
       FROM gl_lore_glossary_terms WHERE lore_code = ? LIMIT 1`,
    [code]
  );
  if (!term || term.statut !== 'actif') return res.status(404).json({ error: 'Terme introuvable' });
  if (!isMj && term.niveau === 'secret') return res.status(403).json({ error: 'Terme secret — accès MJ' });

  const related = await queryAll(
    `SELECT t.lore_code, t.terme, t.niveau
       FROM gl_lore_glossary_relations r
       JOIN gl_lore_glossary_terms t ON t.lore_code = r.to_code
      WHERE r.from_code = ?
      ORDER BY t.terme ASC`,
    [code]
  );

  return res.json({
    term: {
      ...term,
      categorie_label: LORE_GLOSSARY_CATEGORY_LABELS[term.categorie] || term.categorie,
      niveau_label: LORE_NIVEAU_LABELS[term.niveau] || term.niveau,
    },
    relatedTerms: related,
    spoilerMaxLevel: gameplay.loreSpoilerMaxLevel,
  });
});

/** GET /api/gl/lore/glossary/link-index — auto-liens front */
router.get('/glossary/link-index', requireGlAuth, async (_req, res) => {
  const rows = await queryAll(
    `SELECT lore_code, terme, variantes FROM gl_lore_glossary_terms WHERE statut = 'actif'`
  );
  return res.json({
    items: rows.map((row) => ({
      lore_code: row.lore_code,
      terme: row.terme,
      variantes: row.variantes,
    })),
  });
});

// --- Admin ---

router.get('/admin/feuillets', requireGlPermission('gl.content.manage'), async (req, res) => {
  const q = String(req.query?.q || '').trim();
  const params = [];
  let sql = `SELECT feuillet_code, titre, type, liasse, biome_slug, zone_label, kingdom_zone_id,
                     mode_apparition, ordre_voyage, statut
               FROM gl_lore_feuillets WHERE 1=1`;
  if (q) {
    sql += ' AND (feuillet_code LIKE ? OR titre LIKE ? OR liasse LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY ordre_voyage ASC, ordre_liasse ASC LIMIT 500';
  const items = await queryAll(sql, params);
  return res.json({ items });
});

router.get('/admin/feuillets/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const row = await queryOne(
    `SELECT ${FEUILLET_SELECT} FROM gl_lore_feuillets f WHERE f.feuillet_code = ? LIMIT 1`,
    [req.params.code]
  );
  if (!row) return res.status(404).json({ error: 'Feuillet introuvable' });
  return res.json({ feuillet: formatFeuilletRow(row, { isMj: true }) });
});

router.put('/admin/feuillets/:code/kingdom-zone', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim();
  const kingdomZoneId = req.body?.kingdomZoneId == null ? null : parseId(req.body.kingdomZoneId);
  const existing = await queryOne('SELECT feuillet_code FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1', [code]);
  if (!existing) return res.status(404).json({ error: 'Feuillet introuvable' });
  if (kingdomZoneId) {
    const zone = await queryOne('SELECT id FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [kingdomZoneId]);
    if (!zone) return res.status(404).json({ error: 'Zone royaume introuvable' });
  }
  await execute(
    'UPDATE gl_lore_feuillets SET kingdom_zone_id = ?, updated_at = NOW() WHERE feuillet_code = ?',
    [kingdomZoneId, code]
  );
  return res.json({ ok: true, feuilletCode: code, kingdomZoneId });
});

router.get('/admin/feuillets/import/template', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async () => ({
  buffer: buildFeuilletsTemplateWorkbook(),
  filename: 'modele-feuillets-selene.xlsx',
})));

router.get('/admin/feuillets/export', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async () => ({
  buffer: buildFeuilletsExportWorkbook(await loadFeuilletsExportRows(db)),
  filename: 'export-feuillets-selene.xlsx',
})));

router.post('/admin/feuillets/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  try {
    const parsed = resolveFeuilletsImportBody(req.body || {});
    const report = await applyFeuilletsImport(db, parsed, { dryRun });
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

router.get('/admin/glossary/meta', requireGlPermission('gl.content.manage'), async (_req, res) => {
  return res.json({
    categories: LORE_GLOSSARY_CATEGORIES.map((id) => ({
      id,
      label: LORE_GLOSSARY_CATEGORY_LABELS[id] || id,
    })),
    niveaux: Object.entries(LORE_NIVEAU_LABELS).map(([id, label]) => ({ id, label })),
    spoilerLevels: [...LORE_SPOILER_LEVELS],
  });
});

router.get('/admin/glossary/terms/next-code', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const lore_code = await allocateNextLoreCode(queryAll);
  return res.json({ lore_code });
});

router.get('/admin/glossary/terms', requireGlPermission('gl.content.manage'), async (req, res) => {
  const rows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, niveau, definition_courte, chapitre_scope, statut
       FROM gl_lore_glossary_terms
     ORDER BY categorie ASC, terme ASC LIMIT 500`
  );
  return res.json({ items: rows });
});

router.post('/admin/glossary/terms', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const result = await upsertLoreGlossaryTerm(db, req.body || {}, { requireNew: false });
    return res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message, details: err.details });
  }
});

router.put('/admin/glossary/terms/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const result = await upsertLoreGlossaryTerm(db, { ...req.body, lore_code: req.params.code });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message, details: err.details });
  }
});

router.get('/admin/glossary/import/template', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async () => ({
  buffer: buildLoreGlossaryTemplateWorkbook(),
  filename: 'modele-glossaire-lore.xlsx',
})));

router.get('/admin/glossary/export', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async (req) => {
  const statut = String(req.query?.statut || 'actif').toLowerCase();
  return {
    buffer: buildLoreGlossaryExportWorkbook(await loadLoreGlossaryExportRows(db, statut)),
    filename: 'export-glossaire-lore.xlsx',
  };
}));

router.post('/admin/glossary/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  try {
    const { glossaryRows } = resolveLoreGlossaryImportBody(req.body || {});
    const report = await applyLoreGlossaryImport(db, glossaryRows, { dryRun });
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

module.exports = { router };
