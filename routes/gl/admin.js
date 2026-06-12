const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { logAudit } = require('../audit');
const {
  invalidateGameplayCache,
  invalidateModulesCache,
  MODULE_KEYS,
  MARKER_QUESTION_RETRIGGER_VALUES,
  LORE_SPOILER_LEVELS,
  SPELL_CAST_CONTRIBUTION_MODES,
  SPELL_CAST_TEAM_SCOPES,
  getGameplaySettings,
} = require('../../lib/glSettings');
const { getDefaultVitalityFromSettings, clampVitality } = require('../../lib/glVitality');
const {
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  normalizeOptionalString: normalizeImportOptionalString,
  buildPlayerImportPayload,
  validatePlayerImportPayload,
  resolveImportRows,
  buildCsvTemplate,
  buildXlsxTemplate,
} = require('../../lib/glPlayersImport');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../../lib/mediaLibrary');
const { collectMediaLibraryUsage } = require('../../lib/mediaLibraryUsage');
const { loadMediaKeyIndex } = require('../../lib/glAssetManifest');
const { auditGlMediaKeys } = require('../../lib/glMediaKeysAudit');
const {
  listChapterRecitScenes,
  updateChapterSceneMeta,
} = require('../../lib/glChapterScenes');
const {
  INTRO_SETTINGS_KEY,
  loadDefaultIntroConfig,
  normalizeIntroConfig,
  getIntroConfigFromDb,
} = require('../../lib/glIntro');
const {
  analyzeContentLibraryBulk,
  applyContentLibraryBulk,
} = require('../../lib/contentLibraryBulk');
const {
  contentLibraryUploadMiddleware,
  readAnalyzeUploadPayload,
  readApplyUploadPayload,
  getContentLibraryLimits,
} = require('../../lib/contentLibraryUpload');
const { normalizeBrand } = require('../../lib/glBrand');
const { sendXlsxAttachment, wrapXlsxRoute } = require('../../lib/glXlsxAttachment');
const {
  buildGlossaryTemplateWorkbook,
  buildGlossaryExportWorkbook,
  loadGlossaryExportRows,
} = require('../../lib/glGlossaryImport');
const {
  buildQcmTemplateWorkbook,
  buildQcmExportWorkbook,
  loadQcmExportRows,
} = require('../../lib/glQcmImport');
const {
  buildSpeciesTemplateWorkbook,
  buildSpeciesExportWorkbook,
  loadSpeciesExportRows,
} = require('../../lib/glSpeciesImport');

const router = express.Router();

function normalizeBiomeSlugFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');

// O7 — `limit` de la médiathèque GL : coercition permissive (repli sur 300 côté handler si
// absent/non numérique, comme l'ancien `Number.isFinite(Number(x)) ? x : 300`) — jamais de 400.
const glAdminMediaQuerySchema = z.object({ limit: z.coerce.number().optional().catch(undefined) });

/** Clé complète (ex. modules.zone_music_enabled) même si req.params.key est tronqué. */
function resolveSettingsKey(req) {
  const paramKey = normalizeOptionalString(req.params.key);
  let pathKey = null;
  const source = String(req.originalUrl || req.url || '');
  const match = source.match(/\/settings\/([^?#]+)/);
  if (match) {
    try {
      pathKey = normalizeOptionalString(decodeURIComponent(match[1]));
    } catch (_) {
      pathKey = normalizeOptionalString(match[1]);
    }
  }
  if (!pathKey) return paramKey;
  if (!paramKey) return pathKey;
  if (pathKey.length > paramKey.length && pathKey.startsWith(`${paramKey}.`)) return pathKey;
  if (paramKey.length > pathKey.length && paramKey.startsWith(`${pathKey}.`)) return paramKey;
  return paramKey;
}

function normalizePseudo(value) {
  const pseudo = normalizeOptionalString(value);
  return pseudo ? pseudo.toLowerCase() : null;
}

function normalizePassword(value) {
  const password = normalizeOptionalString(value);
  if (!password) return null;
  return password;
}

function parseOptionalBoolean(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

function buildGeneratedPassword() {
  return `gl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PLAYER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePlayerEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

async function ensureEmailAvailable(email, excludedPlayerId = null) {
  if (!email) return true;
  const existing = excludedPlayerId
    ? await queryOne(
      'SELECT id FROM gl_players WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1',
      [email, excludedPlayerId]
    )
    : await queryOne(
      'SELECT id FROM gl_players WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [email]
    );
  return !existing;
}

const ALLOWED_MODULE_SETTINGS = new Set(MODULE_KEYS);
const ALLOWED_GAMEPLAY_SETTINGS = new Set([
  'gameplay.turns_enabled',
  'gameplay.narration_enabled',
  'gameplay.player_actions_enabled',
  'gameplay.scoring_enabled',
  'gameplay.marker_question_retrigger',
  'gameplay.zone_content_retrigger',
  'gameplay.vitality_enabled',
  'gameplay.default_health_points',
  'gameplay.default_power_points',
  'gameplay.spell_cast_contribution_mode',
  'gameplay.spell_cast_team_scope',
  'gameplay.spell_cast_mj_only',
  'gameplay.qcm_mj_only',
  'gameplay.player_journal_max_chars',
  'gameplay.player_journal_max_assets',
  'gameplay.lore_feuillet_retrigger',
  'gameplay.lore_effacement_enabled',
  'gameplay.lore_gemme_costs_enabled',
  'gameplay.lore_heart_rewards_enabled',
  'gameplay.lore_spoiler_max_level',
]);

async function ensureClassExists(classId) {
  const row = await queryOne(
    'SELECT id, name FROM gl_classes WHERE id = ? LIMIT 1',
    [classId]
  );
  return row || null;
}

async function ensurePseudoAvailable(pseudo, excludedPlayerId = null) {
  const existing = excludedPlayerId
    ? await queryOne(
      'SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) AND id <> ? LIMIT 1',
      [pseudo, excludedPlayerId]
    )
    : await queryOne(
      'SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) LIMIT 1',
      [pseudo]
    );
  return !existing;
}

router.get('/classes', requireGlPermission('gl.players.manage'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT c.id, c.name, c.school, c.is_active, c.created_at, c.updated_at, COUNT(p.id) AS players_count
       FROM gl_classes c
  LEFT JOIN gl_players p ON p.class_id = c.id
   GROUP BY c.id
   ORDER BY c.id DESC`
  );
  return res.json(rows);
});

router.post('/classes', requireGlPermission('gl.players.manage'), async (req, res) => {
  const name = normalizeOptionalString(req.body?.name);
  const school = normalizeOptionalString(req.body?.school);
  if (!name) return res.status(400).json({ error: 'Nom de classe requis' });
  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [name, school, req.glAuth.userId]
  );
  const created = await queryOne('SELECT * FROM gl_classes ORDER BY id DESC LIMIT 1');
  return res.status(201).json(created);
});

router.put('/classes/:id', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_classes WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Classe introuvable' });

  const name = req.body?.name == null ? null : normalizeOptionalString(req.body?.name);
  const school = req.body?.school == null ? null : normalizeOptionalString(req.body?.school);
  const isActive = parseOptionalBoolean(req.body?.isActive);
  if (name != null && !name) return res.status(400).json({ error: 'Nom de classe invalide' });
  if (isActive === undefined) return res.status(400).json({ error: 'isActive doit être booléen' });
  if (name == null && school == null && isActive == null) {
    return res.status(400).json({ error: 'Aucune modification fournie' });
  }

  await execute(
    `UPDATE gl_classes
        SET name = COALESCE(?, name),
            school = ?,
            is_active = COALESCE(?, is_active),
            updated_at = NOW()
      WHERE id = ?`,
    [name, school, isActive == null ? null : (isActive ? 1 : 0), id]
  );
  const updated = await queryOne('SELECT * FROM gl_classes WHERE id = ? LIMIT 1', [id]);
  return res.json(updated);
});

router.delete('/classes/:id', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_classes WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Classe introuvable' });

  const playersRow = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_players WHERE class_id = ? AND is_active = 1',
    [id]
  );
  if (Number(playersRow?.c || 0) > 0) {
    return res.status(409).json({ error: 'Suppression refusée : des joueurs actifs sont rattachés à cette classe' });
  }
  const gamesRow = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_games WHERE class_id = ? AND status <> 'ended'",
    [id]
  );
  if (Number(gamesRow?.c || 0) > 0) {
    return res.status(409).json({ error: 'Suppression refusée : des parties non terminées existent pour cette classe' });
  }

  await execute('DELETE FROM gl_classes WHERE id = ?', [id]);
  return res.json({ ok: true });
});

router.get('/players', requireGlPermission('gl.players.manage'), async (req, res) => {
  const classId = req.query?.classId ? Number(req.query.classId) : null;
  const rows = classId
    ? await queryAll(
      `SELECT p.id, p.class_id, p.team_id, p.first_name, p.last_name, p.pseudo, p.email,
              p.password_must_reset, p.is_active, p.linked_foretmap_user_id, p.last_seen, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        WHERE p.class_id = ?
        ORDER BY p.id DESC`,
      [classId]
    )
    : await queryAll(
      `SELECT p.id, p.class_id, p.team_id, p.first_name, p.last_name, p.pseudo, p.email,
              p.password_must_reset, p.is_active, p.linked_foretmap_user_id, p.last_seen, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        ORDER BY p.id DESC`
    );
  return res.json(rows);
});

router.post('/players', requireGlPermission('gl.players.manage'), async (req, res) => {
  const firstName = normalizeImportOptionalString(req.body?.firstName);
  const lastName = normalizeImportOptionalString(req.body?.lastName);
  const pseudo = normalizePseudo(req.body?.pseudo);
  const password = normalizePassword(req.body?.password) || normalizePassword(req.body?.pin);
  const classId = Number(req.body?.classId);
  const passwordMustResetInput = req.body?.passwordMustReset;
  const email = normalizePlayerEmail(req.body?.email);
  if (!firstName || !lastName || !pseudo || !Number.isFinite(classId)) {
    return res.status(400).json({ error: 'Prénom, nom, pseudo et classId requis' });
  }
  if (email && !PLAYER_EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  if (!PSEUDO_RE.test(pseudo)) {
    return res.status(400).json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
  }
  if (password && password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  }
  const cls = await ensureClassExists(classId);
  if (!cls) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  const pseudoAvailable = await ensurePseudoAvailable(pseudo);
  if (!pseudoAvailable) {
    return res.status(409).json({ error: 'Pseudo déjà utilisé' });
  }
  if (email && !(await ensureEmailAvailable(email))) {
    return res.status(409).json({ error: 'Email déjà utilisé pour un joueur GL' });
  }
  const generatedPassword = buildGeneratedPassword();
  const effectivePassword = password || generatedPassword;
  const passwordMustReset = passwordMustResetInput == null
    ? (password ? 0 : 1)
    : (passwordMustResetInput ? 1 : 0);
  const passwordHash = await bcrypt.hash(effectivePassword, 10);
  const gameplayDefaults = getDefaultVitalityFromSettings(await getGameplaySettings());
  await execute(
    `INSERT INTO gl_players
      (class_id, team_id, first_name, last_name, email, pseudo, password_must_reset, password_hash,
       linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NOW(), NOW())`,
    [classId, firstName, lastName, email, pseudo, passwordMustReset, passwordHash,
      gameplayDefaults.health, gameplayDefaults.power]
  );
  const created = await queryOne(
    `SELECT p.id, p.class_id, p.team_id, p.first_name, p.last_name, p.pseudo, p.email, p.password_must_reset, p.is_active,
            p.health_points, p.power_points
       FROM gl_players p
      WHERE p.class_id = ? AND p.pseudo = ?
      ORDER BY p.id DESC
      LIMIT 1`,
    [classId, pseudo]
  );
  return res.status(201).json(created);
});

router.put('/players/:id', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id, pseudo, class_id FROM gl_players WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });

  const firstName = normalizeImportOptionalString(req.body?.firstName);
  const lastName = normalizeImportOptionalString(req.body?.lastName);
  const classId = req.body?.classId == null ? null : Number(req.body.classId);
  const pseudo = req.body?.pseudo == null ? null : normalizePseudo(req.body?.pseudo);
  const emailProvided = req.body != null && Object.prototype.hasOwnProperty.call(req.body, 'email');
  const email = emailProvided ? normalizePlayerEmail(req.body.email) : undefined;
  const isActive = parseOptionalBoolean(req.body?.isActive);

  if (firstName != null && !firstName) return res.status(400).json({ error: 'Prénom invalide' });
  if (emailProvided && email && !PLAYER_EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  if (lastName != null && !lastName) return res.status(400).json({ error: 'Nom invalide' });
  if (isActive === undefined) return res.status(400).json({ error: 'isActive doit être booléen' });
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return res.status(400).json({ error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
  }
  if (Number.isFinite(classId)) {
    const cls = await ensureClassExists(classId);
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
  }
  if (pseudo != null) {
    const pseudoAvailable = await ensurePseudoAvailable(pseudo, id);
    if (!pseudoAvailable) return res.status(409).json({ error: 'Pseudo déjà utilisé' });
  }
  if (emailProvided && email && !(await ensureEmailAvailable(email, id))) {
    return res.status(409).json({ error: 'Email déjà utilisé pour un joueur GL' });
  }

  const setParts = [
    'first_name = COALESCE(?, first_name)',
    'last_name = COALESCE(?, last_name)',
    'pseudo = COALESCE(?, pseudo)',
    'class_id = COALESCE(?, class_id)',
    'is_active = COALESCE(?, is_active)',
    'updated_at = NOW()',
  ];
  const params = [
    firstName,
    lastName,
    pseudo,
    Number.isFinite(classId) ? classId : null,
    isActive == null ? null : (isActive ? 1 : 0),
  ];
  if (emailProvided) {
    setParts.splice(2, 0, 'email = ?');
    params.splice(2, 0, email);
  }
  params.push(id);
  await execute(`UPDATE gl_players SET ${setParts.join(', ')} WHERE id = ?`, params);
  const updated = await queryOne(
    `SELECT id, class_id, team_id, first_name, last_name, pseudo, email, password_must_reset, is_active
       FROM gl_players
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  return res.json(updated);
});

router.delete('/players/:id', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });

  const activeGames = await queryOne(
    `SELECT COUNT(*) AS c
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ? AND g.status IN ('draft', 'live', 'paused')`,
    [id]
  );
  if (Number(activeGames?.c || 0) > 0) {
    return res.status(409).json({ error: 'Suppression refusée : joueur engagé dans une partie en cours' });
  }

  await execute('DELETE FROM gl_team_members WHERE player_id = ?', [id]);
  await execute('DELETE FROM gl_players WHERE id = ?', [id]);
  return res.json({ ok: true });
});

router.post('/players/:id/reset-password', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const password = normalizePassword(req.body?.password);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe requis (min 4 caractères)' });
  }
  const existing = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });
  const hash = await bcrypt.hash(password, 10);
  await execute(
    'UPDATE gl_players SET password_hash = ?, password_must_reset = 0, updated_at = NOW() WHERE id = ?',
    [hash, id]
  );
  return res.json({ ok: true });
});

router.post('/players/:id/reset-pin', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const password = normalizePassword(req.body?.pin) || normalizePassword(req.body?.password);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'PIN/mot de passe requis (min 4 caractères)' });
  }
  const existing = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });
  const hash = await bcrypt.hash(password, 10);
  await execute(
    'UPDATE gl_players SET password_hash = ?, password_must_reset = 0, updated_at = NOW() WHERE id = ?',
    [hash, id]
  );
  return res.json({ ok: true });
});

router.get('/players/import/template', requireGlPermission('gl.players.manage'), wrapXlsxRoute(async (req, res) => {
  const format = String(req.query?.format || 'csv').toLowerCase();
  if (format === 'xlsx') {
    return sendXlsxAttachment(res, await buildXlsxTemplate(), 'foretmap-gl-modele-joueurs.xlsx');
  }
  const csv = buildCsvTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-joueurs.csv"');
  return res.send(csv);
}));

/** Modèles / exports contenus (même URLs que routes /api/gl/admin/… sur routeurs dédiés). */
router.get(
  '/glossary/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) => sendXlsxAttachment(
    res,
    await buildGlossaryTemplateWorkbook(),
    'foretmap-gl-modele-glossaire.xlsx'
  ))
);

router.get(
  '/glossary/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const rows = await loadGlossaryExportRows({ queryAll }, { statut });
    return sendXlsxAttachment(res, await buildGlossaryExportWorkbook(rows), 'foretmap-gl-export-glossaire.xlsx');
  })
);

router.get(
  '/qcm/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) => sendXlsxAttachment(
    res,
    await buildQcmTemplateWorkbook(),
    'foretmap-gl-modele-qcm.xlsx'
  ))
);

router.get(
  '/qcm/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const biomeSlug = normalizeBiomeSlugFilter(req.query?.biomeSlug);
    const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
    const data = await loadQcmExportRows(
      { queryAll },
      { statut, biomeSlug, categorieSlug }
    );
    return sendXlsxAttachment(res, await buildQcmExportWorkbook(data), 'foretmap-gl-export-qcm.xlsx');
  })
);

router.get(
  '/species/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) => sendXlsxAttachment(
    res,
    await buildSpeciesTemplateWorkbook(),
    'foretmap-gl-modele-biocenose.xlsx'
  ))
);

router.get(
  '/species/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const biomeSlug = normalizeBiomeSlugFilter(req.query?.biomeSlug);
    const data = await loadSpeciesExportRows({ queryAll }, { statut, biomeSlug });
    return sendXlsxAttachment(res, await buildSpeciesExportWorkbook(data), 'foretmap-gl-export-biocenose.xlsx');
  })
);

router.post('/players/import', requireGlPermission('gl.players.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  let parsedRows;
  try {
    parsedRows = await resolveImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    return res.status(400).json({ error: 'Fichier import vide ou sans lignes exploitables' });
  }
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
  }

  const classRows = await queryAll('SELECT id, name FROM gl_classes');
  const classIdByName = new Map(
    classRows.map((row) => [String(row.name || '').trim().toLowerCase(), Number(row.id)])
  );
  const existingPseudos = await queryAll('SELECT pseudo FROM gl_players');
  const knownPseudos = new Set(existingPseudos.map((row) => String(row.pseudo || '').trim().toLowerCase()));
  const existingEmails = await queryAll('SELECT email FROM gl_players WHERE email IS NOT NULL');
  const knownEmails = new Set(existingEmails.map((row) => String(row.email || '').trim().toLowerCase()));

  const errors = [];
  const validRows = [];
  for (let i = 0; i < parsedRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildPlayerImportPayload(parsedRows[i]);
    const rowErrors = validatePlayerImportPayload(payload, rowNumber, { passwordMinLength: 4 });
    const normalizedPseudo = payload.pseudo ? payload.pseudo.toLowerCase() : null;
    const normalizedClass = payload.className ? payload.className.toLowerCase() : null;

    if (normalizedPseudo && !PSEUDO_RE.test(normalizedPseudo)) {
      rowErrors.push({
        row: rowNumber,
        field: 'pseudo',
        error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)',
      });
    }
    if (normalizedPseudo && knownPseudos.has(normalizedPseudo)) {
      rowErrors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
    }
    const normalizedEmail = payload.email ? payload.email.toLowerCase() : null;
    if (normalizedEmail && !PLAYER_EMAIL_RE.test(normalizedEmail)) {
      rowErrors.push({ row: rowNumber, field: 'email', error: 'Email invalide' });
    }
    if (normalizedEmail && knownEmails.has(normalizedEmail)) {
      rowErrors.push({ row: rowNumber, field: 'email', error: 'Email déjà utilisé' });
    }
    const classId = normalizedClass ? classIdByName.get(normalizedClass) : null;
    if (!classId) {
      rowErrors.push({ row: rowNumber, field: 'className', error: 'Classe introuvable' });
    }
    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }
    knownPseudos.add(normalizedPseudo);
    if (normalizedEmail) knownEmails.add(normalizedEmail);
    validRows.push({
      rowNumber,
      firstName: payload.firstName,
      lastName: payload.lastName,
      pseudo: normalizedPseudo,
      email: normalizedEmail,
      classId,
      password: payload.password || null,
    });
  }

  let created = 0;
  if (!dryRun) {
    for (const row of validRows) {
      const effectivePassword = row.password || buildGeneratedPassword();
      const passwordHash = await bcrypt.hash(effectivePassword, 10);
      const passwordMustReset = row.password ? 0 : 1;
      try {
        const gameplayDefaults = getDefaultVitalityFromSettings(await getGameplaySettings());
        await execute(
          `INSERT INTO gl_players
            (class_id, team_id, first_name, last_name, email, pseudo, password_must_reset, password_hash,
             linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NOW(), NOW())`,
          [row.classId, row.firstName, row.lastName, row.email, row.pseudo, passwordMustReset, passwordHash,
            gameplayDefaults.health, gameplayDefaults.power]
        );
        created += 1;
      } catch (err) {
        const code = String(err?.code || '');
        if (code === 'ER_DUP_ENTRY') {
          errors.push({
            row: row.rowNumber,
            field: 'pseudo',
            error: 'Pseudo déjà utilisé',
          });
          continue;
        }
        throw err;
      }
    }
  }

  return res.json({
    report: {
      totals: {
        received: parsedRows.length,
        valid: validRows.length,
        skipped_invalid: errors.length > 0 ? parsedRows.length - validRows.length : 0,
        created,
      },
      errors,
    },
  });
});

router.get('/players/export', requireGlPermission('gl.players.manage'), async (req, res) => {
  const classId = req.query?.classId == null ? null : Number(req.query.classId);
  if (classId != null && !Number.isFinite(classId)) {
    return res.status(400).json({ error: 'classId invalide' });
  }
  const rows = classId
    ? await queryAll(
      `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.is_active, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        WHERE p.class_id = ?
        ORDER BY p.id DESC`,
      [classId]
    )
    : await queryAll(
      `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.is_active, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        ORDER BY p.id DESC`
    );
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['ID', 'Prenom', 'Nom', 'Pseudo', 'Classe', 'Actif'].join(',');
  const lines = rows.map((row) => ([
    row.id,
    row.first_name || '',
    row.last_name || '',
    row.pseudo || '',
    row.class_name || '',
    Number(row.is_active) ? 'oui' : 'non',
  ].map(escapeCsv).join(',')));
  const csv = [header, ...lines].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-joueurs.csv"');
  return res.send(csv);
});

router.get('/settings', requireGlPermission('gl.settings.manage'), async (_req, res) => {
  const rows = await queryAll('SELECT `key`, value_json, updated_at FROM gl_settings ORDER BY `key` ASC');
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch (_) {
      out[row.key] = row.value_json;
    }
  }
  return res.json({ settings: out });
});

router.put('/settings/:key', requireGlPermission('gl.settings.manage'), async (req, res) => {
  const key = resolveSettingsKey(req);
  if (!key) return res.status(400).json({ error: 'Clé invalide' });
  let value = req.body?.value ?? null;
  if (key.startsWith('modules.')) {
    if (!ALLOWED_MODULE_SETTINGS.has(key)) {
      return res.status(400).json({ error: 'Clé module inconnue' });
    }
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'La valeur d’un module doit être booléenne' });
    }
  }
  if (key.startsWith('gameplay.') && !ALLOWED_GAMEPLAY_SETTINGS.has(key)) {
    return res.status(400).json({ error: 'Clé gameplay inconnue' });
  }
  if (key === 'gameplay.marker_question_retrigger') {
    const mode = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) {
      return res.status(400).json({ error: 'Valeur marker_question_retrigger invalide' });
    }
    value = mode;
  }
  if (key === 'gameplay.zone_content_retrigger') {
    const mode = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) {
      return res.status(400).json({ error: 'Valeur zone_content_retrigger invalide' });
    }
    value = mode;
  }
  if (key === 'gameplay.spell_cast_contribution_mode') {
    const mode = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!SPELL_CAST_CONTRIBUTION_MODES.has(mode)) {
      return res.status(400).json({ error: 'Mode de contribution invalide (coordinator, self_only, both)' });
    }
    value = mode;
  }
  if (key === 'gameplay.spell_cast_team_scope') {
    const scope = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!SPELL_CAST_TEAM_SCOPES.has(scope)) {
      return res.status(400).json({ error: 'Périmètre équipe invalide (any_team, own_team, mj_any)' });
    }
    value = scope;
  }
  if (key === 'gameplay.spell_cast_mj_only') {
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'La valeur de spell_cast_mj_only doit être booléenne' });
    }
  }
  if (key === 'gameplay.qcm_mj_only') {
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'La valeur de qcm_mj_only doit être booléenne' });
    }
  }
  if (key === 'gameplay.vitality_enabled') {
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'La valeur de vitality_enabled doit être booléenne' });
    }
  }
  if (key === 'gameplay.default_health_points' || key === 'gameplay.default_power_points') {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 99) {
      return res.status(400).json({ error: 'La valeur doit être un entier entre 0 et 99' });
    }
    value = clampVitality(n);
  }
  if (key === 'gameplay.player_journal_max_chars') {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 500 || n > 200000) {
      return res.status(400).json({ error: 'La valeur doit être un entier entre 500 et 200000' });
    }
    value = n;
  }
  if (key === 'gameplay.player_journal_max_assets') {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 200) {
      return res.status(400).json({ error: 'La valeur doit être un entier entre 1 et 200' });
    }
    value = n;
  }
  if (key === 'gameplay.lore_feuillet_retrigger') {
    const mode = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) {
      return res.status(400).json({ error: 'Valeur lore_feuillet_retrigger invalide' });
    }
    value = mode;
  }
  if (key === 'gameplay.lore_spoiler_max_level') {
    const level = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!LORE_SPOILER_LEVELS.has(level)) {
      return res.status(400).json({ error: 'Niveau spoiler lore invalide (cle, recit, secret)' });
    }
    value = level;
  }
  if (
    key === 'gameplay.lore_effacement_enabled'
    || key === 'gameplay.lore_gemme_costs_enabled'
    || key === 'gameplay.lore_heart_rewards_enabled'
  ) {
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'La valeur doit être booléenne' });
    }
  }
  if (key === 'platform.brand') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return res.status(400).json({ error: 'La valeur de platform.brand doit etre un objet JSON' });
    }
    value = normalizeBrand(value);
  }
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, JSON.stringify(value), req.glAuth.userId]
  );
  if (key.startsWith('gameplay.')) {
    invalidateGameplayCache();
  }
  if (key.startsWith('modules.')) {
    invalidateModulesCache();
  }
  return res.json({ ok: true });
});

router.get('/content', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT slug, title, updated_by, updated_at
       FROM gl_content_pages
      ORDER BY updated_at DESC, slug ASC`
  );
  return res.json(rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  })));
});

router.get('/content/intro', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const config = await getIntroConfigFromDb();
  return res.json(config);
});

router.put('/content/intro', requireGlPermission('gl.content.manage'), async (req, res) => {
  const normalized = normalizeIntroConfig(req.body);
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [INTRO_SETTINGS_KEY, JSON.stringify(normalized), req.glAuth.userId]
  );
  return res.json(normalized);
});

router.post('/content/intro/reset', requireGlPermission('gl.content.manage'), async (req, res) => {
  const normalized = normalizeIntroConfig(loadDefaultIntroConfig());
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [INTRO_SETTINGS_KEY, JSON.stringify(normalized), req.glAuth.userId]
  );
  return res.json(normalized);
});

router.get(
  '/media-library',
  requireGlPermission('gl.content.manage'),
  validate({ query: glAdminMediaQuerySchema }),
  async (req, res) => {
    const limit = req.validatedQuery?.limit;
    const items = listMediaLibraryItems(Number.isFinite(limit) ? limit : 300, { app: 'gl' });
    return res.json({ items });
  }
);

router.get('/media-library/usage', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const usage = await collectMediaLibraryUsage({ queryAll }, { app: 'gl' });
  return res.json({ usage });
});

// Audit des conventions médiathèque (équivalent admin de scripts/audit-gl-media-keys.mjs) :
// ressources requises manquantes, clés récit suspectes (typos), clés non branchées.
router.get('/media-library/audit', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const report = auditGlMediaKeys(loadMediaKeyIndex());
  return res.json({ report });
});

// Scènes de récit conventionnelles d'un chapitre (0 = prologue), avec métas.
router.get('/media-library/chapter-scenes', requireGlPermission('gl.content.manage'), async (req, res) => {
  const chapterNumber = Number(req.query?.chapter);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 0 || chapterNumber > 5) {
    return res.status(400).json({ error: 'Paramètre chapter requis (0–5)' });
  }
  return res.json({ chapter: chapterNumber, scenes: listChapterRecitScenes(chapterNumber) });
});

// Métas éditoriales d'une scène de récit : légende, ordre d'affichage, couverture.
router.patch('/media-library/scene-meta', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const stableKey = String(req.body?.stable_key || req.body?.stableKey || '').trim();
    if (!stableKey) return res.status(400).json({ error: 'stable_key requis' });
    const patch = {};
    if ('caption' in (req.body || {})) patch.caption = req.body.caption;
    if ('order' in (req.body || {})) patch.order = req.body.order;
    if ('cover' in (req.body || {})) patch.cover = req.body.cover === true;
    const scene = updateChapterSceneMeta(stableKey, patch);
    await logAudit(
      'media_scene_meta_update',
      'gl_media_library',
      stableKey,
      'Mise à jour méta scène de récit (médiathèque GL)',
      { req, payload: patch }
    );
    return res.json({ scene });
  } catch (err) {
    if (Number.isFinite(err?.status)) {
      return res.status(err.status).json({ error: err.message || 'Mise à jour impossible' });
    }
    throw err;
  }
});

router.post('/media-library', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const mediaData = String(req.body?.media_data || '').trim();
    if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
    const originalName = String(req.body?.original_name || req.body?.originalName || '').trim() || null;
    const saved = saveMediaFromDataUrl(mediaData, { originalName, app: 'gl' });
    return res.status(201).json(saved);
  } catch (err) {
    if (Number.isFinite(err?.status)) {
      return res.status(err.status).json({ error: err.message || 'Upload média refusé' });
    }
    throw err;
  }
});

router.delete('/media-library', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const payload = executeMediaLibraryDeleteRequest(req.body || {});
    return res.json(payload);
  } catch (err) {
    if (Number.isFinite(err?.status)) {
      return res.status(err.status).json({ error: err.message || 'Suppression média refusée' });
    }
    throw err;
  }
});

router.post('/content-library/analyze', requireGlPermission('gl.content.manage'), contentLibraryUploadMiddleware, async (req, res) => {
  try {
    const uploadPayload = readAnalyzeUploadPayload(req);
    const payload = await analyzeContentLibraryBulk({ queryAll, execute }, uploadPayload);
    await logAudit(
      'content_library_analyze',
      'gl_content_library',
      'bulk',
      'Analyse import bibliothèque contenu GL',
      {
        req,
        payload: {
          total: payload.summary?.total || 0,
          applyable: payload.summary?.applyable || 0,
          errors: payload.summary?.errors || 0,
        },
      }
    );
    return res.json(payload);
  } catch (err) {
    if (Number.isFinite(err?.status)) {
      return res.status(err.status).json({ error: err.message || 'Analyse impossible' });
    }
    throw err;
  }
});

router.get('/content-library/limits', requireGlPermission('gl.content.manage'), async (_req, res) => {
  return res.json(getContentLibraryLimits());
});

router.post('/content-library/apply', requireGlPermission('gl.content.manage'), contentLibraryUploadMiddleware, async (req, res) => {
  try {
    const uploadPayload = readApplyUploadPayload(req);
    const payload = await applyContentLibraryBulk(
      { queryAll, execute },
      uploadPayload,
      { createdBy: req.glAuth?.userId != null ? Number(req.glAuth.userId) : null }
    );
    await logAudit(
      'content_library_apply',
      'gl_content_library',
      'bulk',
      'Application import bibliothèque contenu GL',
      {
        req,
        payload: {
          total: payload.summary?.total || 0,
          applied: payload.summary?.applied || 0,
          failed: payload.summary?.failed || 0,
        },
      }
    );
    return res.json(payload);
  } catch (err) {
    if (Number.isFinite(err?.status)) {
      return res.status(err.status).json({ error: err.message || 'Application impossible' });
    }
    throw err;
  }
});

module.exports = router;
module.exports.glAdminMediaQuerySchema = glAdminMediaQuerySchema; // exporté pour test no-DB du contrat O7
