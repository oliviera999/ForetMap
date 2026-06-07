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
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
} = require('../../lib/glLoreGlossaryMatch');
const {
  resolveImportRows: resolveQcmLoreImportRows,
  applyQcmLoreImport,
  buildQcmLoreTemplateWorkbook,
  buildQcmLoreExportWorkbook,
  loadQcmLoreExportRows,
  combineKeywords: combineLoreQcmKeywords,
  MAX_IMPORT_ROWS: QCM_LORE_MAX_IMPORT_ROWS,
} = require('../../lib/glQcmLoreImport');
const {
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('../../lib/glQcmChoices');
const {
  buildLorePresentation,
} = require('../../lib/glQcmLoreQuestionQuery');
const { previewLoreQuestionPool } = require('../../lib/glMarkerLoreQuestionPool');
const { normalizeLoreQuestionPool } = require('../../lib/glMarkerEventConfig');
const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');

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

function normalizeLoreQuestionCode(value) {
  const s = String(value || '').trim().toUpperCase();
  return s.length > 0 ? s : null;
}

function normalizeChapitreSlug(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function parseCsvQuery(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseDifficulteQuery(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 1 || i > 5) return null;
  return i;
}

const LORE_QUESTION_SELECT = `
  SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, source_lore, tags, mots_cles, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_lore_questions
`;

async function loadLoreGlossaryLookupForQcm() {
  const rows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, definition_courte, niveau
       FROM gl_lore_glossary_terms WHERE statut = 'actif'`
  );
  return buildLoreGlossaryLookupMap(rows);
}

async function enrichLoreQuestionWithGlossary(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  return matchLoreGlossaryTermsForText(combineLoreQcmKeywords(questionRow), glossaryByKey);
}

async function loadActiveLoreQuestionRow(code) {
  return queryOne(
    `${LORE_QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
    [code]
  );
}

/** GET /api/gl/lore/qcm/categories */
router.get('/qcm/categories', requireGlPermission('gl.read'), async (_req, res) => {
  const items = await queryAll(
    `SELECT slug, nom, emoji, description, order_index
       FROM gl_qcm_lore_categories
      ORDER BY order_index ASC, nom ASC`
  );
  return res.json(items);
});

/** GET /api/gl/lore/qcm/scopes */
router.get('/qcm/scopes', requireGlPermission('gl.read'), async (_req, res) => {
  const items = await queryAll(
    `SELECT slug, nom, plateau, description, order_index
       FROM gl_qcm_lore_scopes
      ORDER BY order_index ASC, nom ASC`
  );
  return res.json(items);
});

/** GET /api/gl/lore/qcm/questions */
router.get('/qcm/questions', requireGlPermission('gl.read'), async (req, res) => {
  const chapitreSlug = normalizeChapitreSlug(req.query?.chapitreSlug);
  const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
  const q = normalizeOptionalString(req.query?.q);

  const params = [];
  let sql = `${LORE_QUESTION_SELECT} WHERE statut = 'actif'`;
  if (chapitreSlug) {
    sql += ' AND chapitre_slug = ?';
    params.push(chapitreSlug);
  }
  if (categorieSlug) {
    sql += ' AND categorie_slug = ?';
    params.push(categorieSlug);
  }
  sql += ' ORDER BY chapitre_slug ASC, categorie_slug ASC, numero_dans_categorie ASC';

  let rows = await queryAll(sql, params);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((row) => {
      const hay = `${row.question} ${row.tags || ''} ${row.mots_cles || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  const glossaryByKey = await loadLoreGlossaryLookupForQcm();
  const items = await Promise.all(rows.map(async (row) => ({
    question_code: row.question_code,
    chapitre_slug: row.chapitre_slug,
    categorie_slug: row.categorie_slug,
    numero_dans_categorie: row.numero_dans_categorie,
    tier_lore: row.tier_lore,
    question: row.question,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
    reponse_correcte: row.reponse_correcte,
    source_lore: row.source_lore,
    loreGlossaryTerms: await enrichLoreQuestionWithGlossary(row, glossaryByKey),
  })));

  return res.json({ items });
});

/** GET /api/gl/lore/qcm/pool-preview */
router.get('/qcm/pool-preview', requireGlPermission('gl.content.manage'), async (req, res) => {
  const chapterId = req.query?.chapterId != null ? Number(req.query.chapterId) : null;
  let chapterPlateauNumber = null;
  if (chapterId != null && Number.isFinite(chapterId)) {
    const chapter = await queryOne(
      'SELECT plateau_number FROM gl_chapters WHERE id = ? LIMIT 1',
      [chapterId]
    );
    chapterPlateauNumber = chapter?.plateau_number ?? null;
  }

  const pool = normalizeLoreQuestionPool({
    chapitreMode: req.query?.chapitreMode || 'chapter',
    chapitreSlugs: parseCsvQuery(req.query?.chapitreSlugs || req.query?.chapitreSlug),
    categorieSlugs: parseCsvQuery(req.query?.categorieSlugs || req.query?.categorieSlug),
    tierLore: parseCsvQuery(req.query?.tierLore),
    niveaux: parseCsvQuery(req.query?.niveaux || req.query?.niveau),
    difficulteMin: parseDifficulteQuery(req.query?.difficulteMin),
    difficulteMax: parseDifficulteQuery(req.query?.difficulteMax),
    searchQuery: normalizeOptionalString(req.query?.q) || '',
    selectedQuestionCodes: parseCsvQuery(req.query?.selectedQuestionCodes),
  });

  const items = await previewLoreQuestionPool(
    { queryAll },
    { pool, chapterPlateauNumber }
  );
  return res.json({ items, total: items.length });
});

/** GET /api/gl/lore/qcm/draw */
router.get('/qcm/draw', requireGlPermission('gl.read'), async (req, res) => {
  const chapitreSlugs = parseCsvQuery(req.query?.chapitreSlug || req.query?.chapitreSlugs);
  if (chapitreSlugs.length === 0) {
    return res.status(400).json({ error: 'chapitreSlug ou chapitreSlugs requis' });
  }
  const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
  const excludeRaw = normalizeOptionalString(req.query?.exclude);
  const exclude = excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const placeholders = chapitreSlugs.map(() => '?').join(', ');
  const params = [...chapitreSlugs];
  let sql = `${LORE_QUESTION_SELECT} WHERE statut = 'actif' AND chapitre_slug IN (${placeholders})`;
  if (categorieSlug) {
    sql += ' AND categorie_slug = ?';
    params.push(categorieSlug);
  }
  if (exclude.length > 0) {
    sql += ` AND question_code NOT IN (${exclude.map(() => '?').join(', ')})`;
    params.push(...exclude);
  }

  const pool = await queryAll(sql, params);
  if (pool.length === 0) return res.status(404).json({ error: 'Aucune question disponible' });
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return res.json({ question_code: picked.question_code });
});

/** GET /api/gl/lore/qcm/questions/:code/present */
router.get('/qcm/questions/:code/present', requireGlPermission('gl.read'), async (req, res) => {
  const code = normalizeLoreQuestionCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'Code invalide' });

  const row = await loadActiveLoreQuestionRow(code);
  if (!row) return res.status(404).json({ error: 'Question introuvable' });

  const glossaryByKey = await loadLoreGlossaryLookupForQcm();
  const loreGlossaryTerms = await enrichLoreQuestionWithGlossary(row, glossaryByKey);

  try {
    const presentation = buildLorePresentation(row, loreGlossaryTerms);
    return res.json(presentation);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Présentation impossible' });
  }
});

/** POST /api/gl/lore/qcm/questions/:code/answer */
router.post('/qcm/questions/:code/answer', requireGlPermission('gl.read'), async (req, res) => {
  const code = normalizeLoreQuestionCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'Code invalide' });

  const row = await loadActiveLoreQuestionRow(code);
  if (!row) return res.status(404).json({ error: 'Question introuvable' });

  try {
    const result = verifyPresentationAnswer(
      req.body?.presentationToken,
      code,
      req.body?.choiceId
    );
    const glossaryByKey = await loadLoreGlossaryLookupForQcm();
    const loreGlossaryTerms = await enrichLoreQuestionWithGlossary(row, glossaryByKey);
    return res.json({
      correct: result.correct,
      feedback: resolveQcmAnswerFeedback(row, result),
      correctChoiceId: result.correct ? result.correctChoiceId : undefined,
      qcmSet: 'lore',
      loreGlossaryTerms: result.correct ? loreGlossaryTerms : undefined,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Réponse invalide' });
  }
});

/** GET /api/gl/lore/admin/qcm/stats */
router.get('/admin/qcm/stats', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const total = await queryOne(
    `SELECT COUNT(*) AS total FROM gl_qcm_lore_questions WHERE statut = 'actif'`
  );
  const byChapitre = await queryAll(
    `SELECT chapitre_slug, COUNT(*) AS effectif
       FROM gl_qcm_lore_questions WHERE statut = 'actif'
      GROUP BY chapitre_slug ORDER BY effectif DESC`
  );
  const byCategory = await queryAll(
    `SELECT categorie_slug, COUNT(*) AS effectif
       FROM gl_qcm_lore_questions WHERE statut = 'actif'
      GROUP BY categorie_slug ORDER BY effectif DESC`
  );
  const byTier = await queryAll(
    `SELECT tier_lore, COUNT(*) AS effectif
       FROM gl_qcm_lore_questions WHERE statut = 'actif'
      GROUP BY tier_lore ORDER BY tier_lore ASC`
  );
  const glossaryLinks = await queryOne(
    'SELECT COUNT(*) AS total FROM gl_qcm_lore_question_glossary'
  );
  return res.json({
    total: Number(total?.total || 0),
    glossaryLinks: Number(glossaryLinks?.total || 0),
    byChapitre,
    byCategory,
    byTier,
  });
});

router.get('/admin/qcm/import/template', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async () => ({
  buffer: buildQcmLoreTemplateWorkbook(),
  filename: 'foretmap-gl-modele-qcm-lore.xlsx',
})));

router.get('/admin/qcm/export', requireGlPermission('gl.content.manage'), wrapXlsxRoute(async (req) => {
  const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
  const statut = statutRaw === 'all' ? 'all' : 'actif';
  const chapitreSlug = normalizeChapitreSlug(req.query?.chapitreSlug);
  const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
  const data = await loadQcmLoreExportRows(
    { queryAll },
    { statut, chapitreSlug, categorieSlug }
  );
  return {
    buffer: buildQcmLoreExportWorkbook(data),
    filename: 'foretmap-gl-export-qcm-lore.xlsx',
  };
}));

router.post('/admin/qcm/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  let parsed;
  try {
    parsed = resolveQcmLoreImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const { scopeRows, categoryRows, questionRows } = parsed;
  if (!Array.isArray(questionRows) || questionRows.length === 0) {
    return res.status(400).json({ error: 'Feuille questions vide ou absente' });
  }
  if (questionRows.length > QCM_LORE_MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Trop de lignes (max ${QCM_LORE_MAX_IMPORT_ROWS})` });
  }
  try {
    const report = await applyQcmLoreImport(
      { queryAll, execute },
      scopeRows || [],
      categoryRows || [],
      questionRows,
      { dryRun }
    );
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

module.exports = { router };
