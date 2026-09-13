const express = require('express');
const bcrypt = require('bcryptjs');
const {
  queryAll,
  queryOne,
  execute,
  withTransaction,
  getDataWriteVersion,
} = require('../../database');
const { purgeGlPlayerLearningTraces } = require('../../lib/glPlayerPurge');
const { ACTIVE_TEAM_ID_SUBQUERY_SQL } = require('../../lib/glPlayerMembership');
const {
  GlPairingLockError,
  listPairingLocks,
  upsertPairingLock,
  deletePairingLock,
} = require('../../lib/glClassPairingLocks');
const { TEAM_POLICIES } = require('../../lib/gl/teamComposition');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { logAudit } = require('../../lib/auditLog');
const {
  upsertGlSetting,
  validateGlSettingValue,
  getGameplaySettings,
} = require('../../lib/glSettings');
const { getDefaultVitalityFromSettings } = require('../../lib/glVitality');
const {
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  normalizeOptionalString: normalizeImportOptionalString,
  resolveImportRows,
  buildCsvTemplate,
  buildXlsxTemplate,
} = require('../../lib/glPlayersImport');
const { importPlayersFromRows } = require('../../lib/gl/importPlayers');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../../lib/mediaLibrary');
const {
  collectMediaLibraryUsage,
  createMediaLibraryUsageCache,
} = require('../../lib/mediaLibraryUsage');
const { loadMediaKeyIndex } = require('../../lib/glAssetManifest');
const { auditGlMediaKeys } = require('../../lib/glMediaKeysAudit');
const { auditMarkerPromises } = require('../../lib/glMarkerPromiseAudit');
const { listChapterRecitScenes, updateChapterSceneMeta } = require('../../lib/glChapterScenes');
const {
  INTRO_SETTINGS_KEY,
  loadDefaultIntroConfig,
  normalizeIntroConfig,
  getIntroConfigFromDb,
} = require('../../lib/glIntro');
const {
  loadDefaultGlHelpConfig,
  normalizeGlHelpConfig,
  getGlHelpConfigFromDb,
  saveGlHelpConfigToDb,
} = require('../../lib/glHelp');
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
const {
  ensureForetmapGroupForGlClass,
  upsertForetmapUserForGlPlayer,
  syncForetmapUserForGlPlayer,
  removeGlClassGroupMembership,
} = require('../../lib/glGroupBridge');
const { setGlPlayerPassword } = require('../../lib/glPlayerIdentity');
const { deleteStudentById } = require('../../lib/studentDeletion');
const {
  buildGlIdentityReport,
  applyGlIdentityReconciliation,
} = require('../../lib/glIdentityReconcile');
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

/** Usage des médias G&L : même scan coûteux que côté ForetMap, même invalidation. */
const glMediaUsageCache = createMediaLibraryUsageCache({ writeVersion: getDataWriteVersion });

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const asyncHandler = require('../../lib/asyncHandler');
const { z, validate } = require('../../lib/validate');
const {
  normalizeBiomeSlugFilter,
  normalizePseudo,
  normalizePassword,
  parseOptionalBoolean,
  buildGeneratedPassword,
  PLAYER_EMAIL_RE,
  normalizePlayerEmail,
  ALLOWED_MODULE_SETTINGS,
  ALLOWED_GAMEPLAY_SETTINGS,
} = require('../../lib/gl/adminRouteHelpers');

// O7 — `limit` de la médiathèque GL : coercition permissive (repli sur 300 côté handler si
// absent/non numérique, comme l'ancien `Number.isFinite(Number(x)) ? x : 300`) — jamais de 400.
const glAdminMediaQuerySchema = z.object({ limit: z.coerce.number().optional().catch(undefined) });

// O7 — `classId` de GET /players et GET /players/export : coercition permissive reproduisant
// exactement l'ancienne lecture manuelle (`req.query?.classId ? Number(...) : null`, NaN/Infinity
// conservés et filtrés en aval comme avant) — jamais de 400 issu du schéma. Le 400 historique
// « classId invalide » de l'export reste décidé par le handler, condition inchangée
// (`classId != null && !Number.isFinite(classId)` ; pour `''`, l'ancien `Number('') === 0` et le
// nouveau `null` suivent la même branche : pas de 400, pas de filtre).
const glAdminPlayersQuerySchema = z
  .object({ classId: z.unknown().optional() })
  .transform((q) => ({ classId: q.classId ? Number(q.classId) : null }));

// O7 — `chapter` de GET /media-library/chapter-scenes : coercition permissive reproduisant
// exactement l'ancien `Number(req.query?.chapter)` (NaN conservé) ; le 400 historique
// « Paramètre chapter requis (0–5) » reste décidé par le handler, condition inchangée.
const glAdminChapterScenesQuerySchema = z
  .object({ chapter: z.unknown().optional() })
  .transform((q) => ({ chapter: Number(q.chapter) }));

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

/**
 * E-mail disponible pour un joueur : il vit sur le compte `users` lié (unification des
 * identités). Un élève ForetMap libre portant cet e-mail n'est pas un conflit — le pont le
 * rapprochera ; un compte non-élève ou déjà lié à un autre joueur, si.
 */
async function ensureEmailAvailable(email, excludedPlayerId = null) {
  if (!email) return true;
  const existing = await queryOne(
    `SELECT u.id
       FROM users u
       LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
      WHERE LOWER(u.email) = LOWER(?)
        AND (u.user_type <> 'student' OR (p.id IS NOT NULL AND (? IS NULL OR p.id <> ?)))
      LIMIT 1`,
    [email, excludedPlayerId, excludedPlayerId],
  );
  return !existing;
}

async function ensureClassExists(classId) {
  const row = await queryOne('SELECT id, name FROM gl_classes WHERE id = ? LIMIT 1', [classId]);
  return row || null;
}

async function ensurePseudoAvailable(pseudo, excludedPlayerId = null) {
  const existing = excludedPlayerId
    ? await queryOne(
        'SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) AND id <> ? LIMIT 1',
        [pseudo, excludedPlayerId],
      )
    : await queryOne('SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) LIMIT 1', [pseudo]);
  return !existing;
}

router.get(
  '/classes',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT c.id, c.name, c.school, c.is_active, c.foretmap_group_id, c.created_at, c.updated_at,
              c.team_policy, c.team_size_default,
              COUNT(p.id) AS players_count,
              g.slug AS foretmap_group_slug, g.name AS foretmap_group_name
       FROM gl_classes c
  LEFT JOIN gl_players p ON p.class_id = c.id
  LEFT JOIN \`groups\` g ON g.id = c.foretmap_group_id
   GROUP BY c.id
   ORDER BY c.id DESC`,
    );
    return res.json(rows);
  }),
);

router.post(
  '/classes',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const name = normalizeOptionalString(req.body?.name);
    const school = normalizeOptionalString(req.body?.school);
    if (!name) return res.status(400).json({ error: 'Nom de classe requis' });
    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [name, school, req.glAuth.userId],
    );
    const created = await queryOne('SELECT * FROM gl_classes ORDER BY id DESC LIMIT 1');
    const defaultRoleId =
      req.body?.defaultRoleId != null ? Number(req.body.defaultRoleId) : undefined;
    const grantsN3beur = !!req.body?.grantsN3beurAccess;
    await ensureForetmapGroupForGlClass(created, {
      defaultRoleId: Number.isFinite(defaultRoleId) ? defaultRoleId : undefined,
      grantsN3beurAccess: grantsN3beur,
    });
    const enriched = await queryOne(
      `SELECT c.*, g.slug AS foretmap_group_slug, g.name AS foretmap_group_name
         FROM gl_classes c
         LEFT JOIN \`groups\` g ON g.id = c.foretmap_group_id
        WHERE c.id = ?
        LIMIT 1`,
      [created.id],
    );
    return res.status(201).json(enriched || created);
  }),
);

router.put(
  '/classes/:id',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const existing = await queryOne('SELECT id FROM gl_classes WHERE id = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ error: 'Classe introuvable' });

    const name = req.body?.name == null ? null : normalizeOptionalString(req.body?.name);
    const school = req.body?.school == null ? null : normalizeOptionalString(req.body?.school);
    const isActive = parseOptionalBoolean(req.body?.isActive);
    if (name != null && !name) return res.status(400).json({ error: 'Nom de classe invalide' });
    if (isActive === undefined)
      return res.status(400).json({ error: 'isActive doit être booléen' });
    // Politique d'équipes (lot v3 composition automatique) et taille visée par défaut.
    const teamPolicy =
      req.body?.teamPolicy == null ? null : String(req.body.teamPolicy).toLowerCase();
    if (teamPolicy != null && !TEAM_POLICIES.includes(teamPolicy)) {
      return res.status(400).json({
        error: `Politique d’équipes invalide (${TEAM_POLICIES.join(', ')})`,
      });
    }
    const teamSizeDefault =
      req.body?.teamSizeDefault == null ? null : Number(req.body.teamSizeDefault);
    if (
      teamSizeDefault != null &&
      (!Number.isInteger(teamSizeDefault) || teamSizeDefault < 2 || teamSizeDefault > 12)
    ) {
      return res.status(400).json({ error: 'Taille d’équipe par défaut invalide (2 à 12)' });
    }
    if (
      name == null &&
      school == null &&
      isActive == null &&
      teamPolicy == null &&
      teamSizeDefault == null
    ) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    await execute(
      `UPDATE gl_classes
        SET name = COALESCE(?, name),
            school = ?,
            is_active = COALESCE(?, is_active),
            team_policy = COALESCE(?, team_policy),
            team_size_default = COALESCE(?, team_size_default),
            updated_at = NOW()
      WHERE id = ?`,
      [name, school, isActive == null ? null : isActive ? 1 : 0, teamPolicy, teamSizeDefault, id],
    );
    const updated = await queryOne('SELECT * FROM gl_classes WHERE id = ? LIMIT 1', [id]);
    return res.json(updated);
  }),
);

router.delete(
  '/classes/:id',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const existing = await queryOne('SELECT id FROM gl_classes WHERE id = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ error: 'Classe introuvable' });

    const playersRow = await queryOne(
      'SELECT COUNT(*) AS c FROM gl_players WHERE class_id = ? AND is_active = 1',
      [id],
    );
    if (Number(playersRow?.c || 0) > 0) {
      return res
        .status(409)
        .json({ error: 'Suppression refusée : des joueurs actifs sont rattachés à cette classe' });
    }
    const gamesRow = await queryOne(
      "SELECT COUNT(*) AS c FROM gl_games WHERE class_id = ? AND status <> 'ended'",
      [id],
    );
    if (Number(gamesRow?.c || 0) > 0) {
      return res.status(409).json({
        error: 'Suppression refusée : des parties non terminées existent pour cette classe',
      });
    }

    await execute('DELETE FROM gl_classes WHERE id = ?', [id]);
    return res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------------------------
// Verrous de paires (composition automatique, lot v3) — `gl.players.manage`, jamais joueur.
// ---------------------------------------------------------------------------------------------

function sendPairingLockError(res, err) {
  if (err instanceof GlPairingLockError) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

router.get(
  '/classes/:id/pairing-locks',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    try {
      return res.json({ locks: await listPairingLocks(req.params.id) });
    } catch (err) {
      if (sendPairingLockError(res, err)) return undefined;
      throw err;
    }
  }),
);

router.post(
  '/classes/:id/pairing-locks',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    try {
      const { lock, created } = await upsertPairingLock({
        classId: req.params.id,
        playerAId: req.body?.playerAId ?? req.body?.playerIds?.[0],
        playerBId: req.body?.playerBId ?? req.body?.playerIds?.[1],
        kind: req.body?.kind,
        actorId: req.glAuth?.userId != null ? String(req.glAuth.userId) : null,
        replace: req.body?.replace !== false,
      });
      return res.status(created ? 201 : 200).json({ ok: true, created, lock });
    } catch (err) {
      if (sendPairingLockError(res, err)) return undefined;
      throw err;
    }
  }),
);

router.delete(
  '/classes/:id/pairing-locks/:lockId',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    try {
      return res.json(
        await deletePairingLock({ classId: req.params.id, lockId: req.params.lockId }),
      );
    } catch (err) {
      if (sendPairingLockError(res, err)) return undefined;
      throw err;
    }
  }),
);

// `team_id` = équipe de la partie active du joueur (gl_team_members), pas le pointeur global.
const PLAYER_ADMIN_SELECT = `
  SELECT p.id, p.class_id, ${ACTIVE_TEAM_ID_SUBQUERY_SQL} AS team_id, p.first_name, p.last_name, p.pseudo,
         p.is_active, p.linked_foretmap_user_id, p.last_seen, p.health_points, p.power_points,
         p.legacy_password_hash IS NOT NULL AS legacy_password_pending,
         u.email, u.password_must_reset, u.is_active AS account_is_active,
         u.auth_provider AS account_provider, u.pseudo AS account_pseudo,
         c.name AS class_name
    FROM gl_players p
    LEFT JOIN users u ON u.id = p.linked_foretmap_user_id AND u.user_type = 'student'
    LEFT JOIN gl_classes c ON c.id = p.class_id`;

function toAdminPlayerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    class_id: row.class_id,
    team_id: row.team_id,
    first_name: row.first_name,
    last_name: row.last_name,
    pseudo: row.pseudo,
    email: row.email || null,
    password_must_reset: Number(row.password_must_reset || 0),
    is_active: Number(row.is_active || 0),
    account_is_active: row.account_is_active == null ? null : Number(row.account_is_active),
    // « Compte élève » = vrai compte ForetMap (inscrit/importé côté ForetMap), par opposition
    // au compte miroir créé par le jeu.
    account_kind: !row.linked_foretmap_user_id
      ? null
      : row.account_provider === 'gl_bridge'
        ? 'bridge'
        : 'student',
    linked_foretmap_user_id: row.linked_foretmap_user_id || null,
    legacy_password_pending: !!Number(row.legacy_password_pending || 0),
    last_seen: row.last_seen,
    health_points: row.health_points,
    power_points: row.power_points,
    class_name: row.class_name || null,
  };
}

router.get(
  '/players',
  requireGlPermission('gl.players.manage'),
  validate({ query: glAdminPlayersQuerySchema }),
  asyncHandler(async (req, res) => {
    const classId = req.validatedQuery?.classId;
    const rows = classId
      ? await queryAll(`${PLAYER_ADMIN_SELECT} WHERE p.class_id = ? ORDER BY p.id DESC`, [classId])
      : await queryAll(`${PLAYER_ADMIN_SELECT} ORDER BY p.id DESC`);
    return res.json(rows.map(toAdminPlayerRow));
  }),
);

router.post(
  '/players',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
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
      return res.status(400).json({ error: PSEUDO_INVALID_MSG });
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
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }
    const generated = !password;
    const effectivePassword = password || buildGeneratedPassword();
    const passwordMustReset =
      passwordMustResetInput == null ? generated : !!parseOptionalBoolean(passwordMustResetInput);
    const passwordHash = await bcrypt.hash(effectivePassword, 10);
    const gameplayDefaults = getDefaultVitalityFromSettings(await getGameplaySettings());
    // Le compte `users` (créé, ou élève ForetMap existant rapproché) porte le mot de passe.
    const foretmapLink = await upsertForetmapUserForGlPlayer({
      classId,
      firstName,
      lastName,
      pseudo,
      email,
      passwordHash,
      passwordMustReset,
    });
    if (!foretmapLink.ok) {
      return res.status(500).json({ error: foretmapLink.error || 'Liaison ForetMap impossible' });
    }
    await execute(
      `INSERT INTO gl_players
      (class_id, first_name, last_name, pseudo,
       linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
      [
        classId,
        firstName,
        lastName,
        pseudo,
        foretmapLink.user.id,
        gameplayDefaults.health,
        gameplayDefaults.power,
      ],
    );
    if (!foretmapLink.created && passwordMustReset) {
      // Compte existant rapproché : le drapeau demandé s'applique quand même.
      await execute('UPDATE users SET password_must_reset = 1, updated_at = NOW() WHERE id = ?', [
        foretmapLink.user.id,
      ]);
    }
    const created = await queryOne(
      `${PLAYER_ADMIN_SELECT} WHERE p.class_id = ? AND p.pseudo = ? ORDER BY p.id DESC LIMIT 1`,
      [classId, pseudo],
    );
    // Le mot de passe généré n'est restitué qu'ICI, une seule fois : il n'est stocké nulle
    // part en clair. Compte rapproché : son mot de passe ForetMap est conservé, rien à afficher.
    return res.status(201).json({
      ...toAdminPlayerRow(created),
      reusedExisting: !!foretmapLink.reusedExisting,
      emailConflict: !!foretmapLink.emailConflict,
      generatedPassword: generated && !foretmapLink.reusedExisting ? effectivePassword : null,
    });
  }),
);

router.put(
  '/players/:id',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const existing = await queryOne(
      'SELECT id, pseudo, class_id FROM gl_players WHERE id = ? LIMIT 1',
      [id],
    );
    if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });

    const firstName = normalizeImportOptionalString(req.body?.firstName);
    const lastName = normalizeImportOptionalString(req.body?.lastName);
    const classId = req.body?.classId == null ? null : Number(req.body.classId);
    const pseudo = req.body?.pseudo == null ? null : normalizePseudo(req.body?.pseudo);
    const emailProvided =
      req.body != null && Object.prototype.hasOwnProperty.call(req.body, 'email');
    const email = emailProvided ? normalizePlayerEmail(req.body.email) : undefined;
    const isActive = parseOptionalBoolean(req.body?.isActive);

    if (firstName != null && !firstName) return res.status(400).json({ error: 'Prénom invalide' });
    if (emailProvided && email && !PLAYER_EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (lastName != null && !lastName) return res.status(400).json({ error: 'Nom invalide' });
    if (isActive === undefined)
      return res.status(400).json({ error: 'isActive doit être booléen' });
    if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
      return res.status(400).json({ error: PSEUDO_INVALID_MSG });
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
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }

    await execute(
      `UPDATE gl_players SET
         first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         pseudo = COALESCE(?, pseudo),
         class_id = COALESCE(?, class_id),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [
        firstName,
        lastName,
        pseudo,
        Number.isFinite(classId) ? classId : null,
        isActive == null ? null : isActive ? 1 : 0,
        id,
      ],
    );
    // Le compte lié suit : identité et groupe de classe ; l'e-mail s'y écrit (source unique).
    const syncResult = await syncForetmapUserForGlPlayer(
      id,
      emailProvided ? { email, forceEmail: true } : {},
    );
    if (!syncResult.ok) {
      return res
        .status(500)
        .json({ error: syncResult.error || 'Synchronisation ForetMap impossible' });
    }
    if (emailProvided && email == null) {
      await execute('UPDATE users SET email = NULL, updated_at = NOW() WHERE id = ?', [
        syncResult.user.id,
      ]);
    }
    const updated = await queryOne(`${PLAYER_ADMIN_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
    return res.json(toAdminPlayerRow(updated));
  }),
);

/**
 * DELETE /api/gl/admin/players/:id — supprime le profil de jeu.
 *
 * Le compte `users` lié n'est supprimé que s'il s'agit du compte MIROIR créé par le jeu
 * (`auth_provider = 'gl_bridge'`) : un vrai compte élève ForetMap reste, et quitte simplement
 * le groupe de sa classe GL. Avant l'unification, le miroir orphelin restait actif, membre du
 * groupe, capable de se connecter (audit comptes 2026-09, C2).
 */
router.delete(
  '/players/:id',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const existing = await queryOne(
      `SELECT p.id, p.class_id, p.linked_foretmap_user_id, u.auth_provider
         FROM gl_players p
         LEFT JOIN users u ON u.id = p.linked_foretmap_user_id
        WHERE p.id = ? LIMIT 1`,
      [id],
    );
    if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });

    const activeGames = await queryOne(
      `SELECT COUNT(*) AS c
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ? AND g.status IN ('draft', 'live', 'paused')`,
      [id],
    );
    if (Number(activeGames?.c || 0) > 0) {
      return res
        .status(409)
        .json({ error: 'Suppression refusée : joueur engagé dans une partie en cours' });
    }

    try {
      await withTransaction(async (tx) => {
        await tx.execute('DELETE FROM gl_team_members WHERE player_id = ?', [id]);
        // Les jetons de réinitialisation du joueur ne portent pas de FK (table polymorphe) :
        // purge applicative, comme pour les élèves (lib/studentDeletion.js).
        await tx.execute(
          `DELETE FROM password_reset_tokens WHERE user_type = 'gl_player' AND user_id = ?`,
          [id],
        );
        // Tentatives QCM, verrous et accusés d'apprentissage : lecteur polymorphe, pas de FK.
        await purgeGlPlayerLearningTraces(tx, id);
        await tx.execute('DELETE FROM gl_players WHERE id = ?', [id]);
      });
    } catch (err) {
      // Une contribution à un sortilège dans une partie TERMINÉE référence encore le joueur via
      // `fk_gl_spell_cast_contrib_player` (ON DELETE RESTRICT) : sans capture, l'erreur devenait
      // un 500. On répond un 409 explicite plutôt que de supprimer l'historique de partie.
      if (err && (err.errno === 1451 || err.code === 'ER_ROW_IS_REFERENCED_2')) {
        return res.status(409).json({
          error:
            'Suppression refusée : ce joueur a contribué à un sortilège dans une partie terminée. Supprimez d’abord cette partie.',
        });
      }
      throw err;
    }
    let accountDeleted = false;
    if (existing.linked_foretmap_user_id) {
      if (String(existing.auth_provider || '') === 'gl_bridge') {
        const result = await deleteStudentById(existing.linked_foretmap_user_id, {
          skipLinkedGlPlayer: true,
        });
        accountDeleted = !!result.ok;
      } else {
        await removeGlClassGroupMembership(existing.linked_foretmap_user_id, existing.class_id);
      }
    }
    await logAudit('gl_player_delete', 'gl_player', String(id), 'Suppression joueur GL', {
      req,
      payload: {
        linked_user_id: existing.linked_foretmap_user_id || null,
        account_deleted: accountDeleted,
      },
    });
    return res.json({ ok: true, accountDeleted });
  }),
);

// G5 — l'ancien doublon POST /players/:id/reset-pin (héritage PIN) est supprimé ;
// `password` accepte encore l'alias `pin` en compatibilité silencieuse, à retirer à terme.
router.post(
  '/players/:id/reset-password',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const password = normalizePassword(req.body?.password) || normalizePassword(req.body?.pin);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Mot de passe requis (min 4 caractères)' });
    }
    const existing = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [id]);
    if (!existing) return res.status(404).json({ error: 'Joueur introuvable' });
    const mustReset = parseOptionalBoolean(req.body?.passwordMustReset) === true;
    // Source unique `users` ; révoque les sessions en cours du joueur.
    await setGlPlayerPassword(id, { password, mustReset });
    await logAudit(
      'gl_player_reset_password',
      'gl_player',
      String(id),
      'Réinitialisation mot de passe joueur',
      {
        req,
        payload: { must_reset: mustReset },
      },
    );
    return res.json({ ok: true });
  }),
);

router.get(
  '/players/import/template',
  requireGlPermission('gl.players.manage'),
  wrapXlsxRoute(async (req, res) => {
    const format = String(req.query?.format || 'csv').toLowerCase();
    if (format === 'xlsx') {
      return sendXlsxAttachment(res, await buildXlsxTemplate(), 'foretmap-gl-modele-joueurs.xlsx');
    }
    const csv = buildCsvTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-joueurs.csv"');
    return res.send(csv);
  }),
);

/** Modèles / exports contenus (même URLs que routes /api/gl/admin/… sur routeurs dédiés). */
router.get(
  '/glossary/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) =>
    sendXlsxAttachment(
      res,
      await buildGlossaryTemplateWorkbook(),
      'foretmap-gl-modele-glossaire.xlsx',
    ),
  ),
);

router.get(
  '/glossary/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const rows = await loadGlossaryExportRows({ queryAll }, { statut });
    return sendXlsxAttachment(
      res,
      await buildGlossaryExportWorkbook(rows),
      'foretmap-gl-export-glossaire.xlsx',
    );
  }),
);

router.get(
  '/qcm/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) =>
    sendXlsxAttachment(res, await buildQcmTemplateWorkbook(), 'foretmap-gl-modele-qcm.xlsx'),
  ),
);

router.get(
  '/qcm/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const biomeSlug = normalizeBiomeSlugFilter(req.query?.biomeSlug);
    const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
    const data = await loadQcmExportRows({ queryAll }, { statut, biomeSlug, categorieSlug });
    return sendXlsxAttachment(
      res,
      await buildQcmExportWorkbook(data),
      'foretmap-gl-export-qcm.xlsx',
    );
  }),
);

/*
 * Cohérence des plateaux : ce que chaque case **annonce** à l'élève contre ce que le moteur
 * **applique**. Les deux champs (`effet_mecanique`, texte libre, et `event_config_json`,
 * seule config exécutée) sont saisis séparément et rien ne les relie — une case peut donc
 * afficher « Bonne réponse : +2 gemmes » sans qu'une seule gemme ne soit créditée.
 *
 * Diagnostic pur : rien n'est modifié, aucune case n'est corrigée. Le MJ voit l'écart et
 * décide — soit câbler l'effet, soit retirer la promesse du texte.
 */
router.get(
  '/plateaux/coherence',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const chapterId = req.query?.chapterId != null ? Number(req.query.chapterId) : null;
    const onlyIssues = String(req.query?.onlyIssues ?? 'true') !== 'false';
    const params = [];
    let where = '';
    if (Number.isFinite(chapterId) && chapterId > 0) {
      where = 'WHERE m.chapter_id = ?';
      params.push(chapterId);
    }
    const markers = await queryAll(
      `SELECT m.id, m.chapter_id, m.label, m.event_type, m.effet_mecanique,
              m.event_config_json, m.qcm_categorie_slug, m.qcm_question_code,
              m.order_index, c.slug AS chapter_slug, c.title AS chapter_title
         FROM gl_chapter_markers m
         LEFT JOIN gl_chapters c ON c.id = m.chapter_id
         ${where}
        ORDER BY m.chapter_id ASC, m.order_index ASC, m.id ASC`,
      params,
    );
    const report = auditMarkerPromises(markers);
    const chapterLabels = {};
    for (const m of markers) {
      if (m.chapter_id == null) continue;
      chapterLabels[String(m.chapter_id)] = m.chapter_title || m.chapter_slug || null;
    }
    return res.json({
      total: report.total,
      counts: report.counts,
      byCode: report.byCode,
      byChapter: report.byChapter,
      chapterLabels,
      markers: onlyIssues ? report.rows.filter((r) => r.severity !== 'ok') : report.rows,
    });
  }),
);

router.get(
  '/species/import/template',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (_req, res) =>
    sendXlsxAttachment(
      res,
      await buildSpeciesTemplateWorkbook(),
      'foretmap-gl-modele-biocenose.xlsx',
    ),
  ),
);

router.get(
  '/species/export',
  requireGlPermission('gl.content.manage'),
  wrapXlsxRoute(async (req, res) => {
    const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
    const statut = statutRaw === 'all' ? 'all' : 'actif';
    const biomeSlug = normalizeBiomeSlugFilter(req.query?.biomeSlug);
    const data = await loadSpeciesExportRows({ queryAll }, { statut, biomeSlug });
    return sendXlsxAttachment(
      res,
      await buildSpeciesExportWorkbook(data),
      'foretmap-gl-export-biocenose.xlsx',
    );
  }),
);

// O-audit — logique d'import extraite dans lib/gl/importPlayers.js (validation + création +
// rapport identiques) ; la vérification d'unicité pseudo/email y est bornée aux valeurs du
// fichier (`WHERE … IN (…)`) au lieu de charger toute la table gl_players.
router.post(
  '/players/import',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
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
    const report = await importPlayersFromRows(parsedRows, { dryRun });
    if (!dryRun && report.totals.created > 0) {
      await logAudit('gl_players_import', 'gl_player', null, 'Import de joueurs GL', {
        req,
        payload: { created: report.totals.created, reused_existing: report.totals.reused_existing },
      });
    }
    return res.json({ report });
  }),
);

/**
 * Réconciliation identités GL ↔ ForetMap (audit comptes 2026-09, C7/E3).
 * GET : rapport (totaux + échantillons). POST : rejoue le pont (liens, groupes) ; avec
 * `{ deleteOrphanBridgeAccounts: true }`, supprime aussi les comptes miroirs orphelins.
 */
router.get(
  '/players/reconcile',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (_req, res) => {
    return res.json(await buildGlIdentityReport());
  }),
);

router.post(
  '/players/reconcile',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const deleteOrphanBridgeAccounts =
      parseOptionalBoolean(req.body?.deleteOrphanBridgeAccounts) === true;
    const result = await applyGlIdentityReconciliation({ deleteOrphanBridgeAccounts });
    await logAudit('gl_players_reconcile', 'gl_player', null, 'Réconciliation identités GL', {
      req,
      payload: { backfill: result.backfill, orphans: result.orphans, deleteOrphanBridgeAccounts },
    });
    return res.json(result);
  }),
);

router.get(
  '/players/export',
  requireGlPermission('gl.players.manage'),
  validate({ query: glAdminPlayersQuerySchema }),
  asyncHandler(async (req, res) => {
    const classId = req.validatedQuery?.classId;
    if (classId != null && !Number.isFinite(classId)) {
      return res.status(400).json({ error: 'classId invalide' });
    }
    const rows = classId
      ? await queryAll(`${PLAYER_ADMIN_SELECT} WHERE p.class_id = ? ORDER BY p.id DESC`, [classId])
      : await queryAll(`${PLAYER_ADMIN_SELECT} ORDER BY p.id DESC`);
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['ID', 'Prenom', 'Nom', 'Pseudo', 'Email', 'Classe', 'Actif', 'Compte'].join(
      ',',
    );
    const lines = rows.map((row) =>
      [
        row.id,
        row.first_name || '',
        row.last_name || '',
        row.pseudo || '',
        row.email || '',
        row.class_name || '',
        Number(row.is_active) ? 'oui' : 'non',
        row.account_provider === 'gl_bridge'
          ? 'miroir'
          : row.linked_foretmap_user_id
            ? 'eleve'
            : '',
      ]
        .map(escapeCsv)
        .join(','),
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-joueurs.csv"');
    return res.send(csv);
  }),
);

router.get(
  '/settings',
  requireGlPermission('gl.settings.manage'),
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      'SELECT `key`, value_json, updated_at FROM gl_settings ORDER BY `key` ASC',
    );
    const out = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value_json);
      } catch (_) {
        out[row.key] = row.value_json;
      }
    }
    return res.json({ settings: out });
  }),
);

/*
 * PUT /settings/:key — la validation des valeurs vit dans le registre déclaratif
 * `GL_SETTINGS_REGISTRY` (`lib/glSettings.js`, noyau `lib/shared/settingsRegistryCore.js`) :
 * types, bornes et messages d'erreur historiques (`errorMessage`) y sont déclarés, la route
 * ne fait plus que les gardes de clé. Une clé hors registre (`platform.title`…) est persistée
 * telle quelle, comme avant.
 */
router.put(
  '/settings/:key',
  requireGlPermission('gl.settings.manage'),
  asyncHandler(async (req, res) => {
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
    const checked = validateGlSettingValue(key, value);
    if (checked.error) return res.status(400).json({ error: checked.error });
    value = checked.value;
    if (key === 'ui.map.plateau_marker_size_percent') {
      // Fuite connue, conservée telle quelle pour ce lot : ce réglage est un réglage
      // ForetMap (`app_settings`, source unique du ratio repères/plateau) écrit depuis
      // l'admin GL. À rapatrier dans un registre commun product-aware (audit convergence
      // 2026-09, §4.6 / §5.2) plutôt que de dupliquer la clé côté `gl_settings`.
      const { setSetting } = require('../../lib/settings');
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 50 || n > 200) {
        return res.status(400).json({ error: 'La valeur doit être un entier entre 50 et 200' });
      }
      await setSetting('ui.map.plateau_marker_size_percent', n, {
        userType: 'gl',
        userId: req.glAuth.userId,
      });
      return res.json({ ok: true });
    }
    // `upsertGlSetting` invalide le magasin (et le snapshot de test du domaine concerné) :
    // plus d'invalidation manuelle par préfixe de clé.
    await upsertGlSetting(key, value, req.glAuth.userId);
    return res.json({ ok: true });
  }),
);

router.get(
  '/content',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT slug, title, updated_by, updated_at
       FROM gl_content_pages
      ORDER BY updated_at DESC, slug ASC`,
    );
    return res.json(
      rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        updatedBy: row.updated_by || null,
        updatedAt: row.updated_at || null,
      })),
    );
  }),
);

router.get(
  '/content/intro',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const config = await getIntroConfigFromDb();
    return res.json(config);
  }),
);

router.put(
  '/content/intro',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const normalized = normalizeIntroConfig(req.body);
    // Pas de cache à invalider : getIntroConfigFromDb relit gl_settings à chaque appel.
    await upsertGlSetting(INTRO_SETTINGS_KEY, normalized, req.glAuth.userId);
    return res.json(normalized);
  }),
);

router.post(
  '/content/intro/reset',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const normalized = normalizeIntroConfig(loadDefaultIntroConfig());
    // Pas de cache à invalider : getIntroConfigFromDb relit gl_settings à chaque appel.
    await upsertGlSetting(INTRO_SETTINGS_KEY, normalized, req.glAuth.userId);
    return res.json(normalized);
  }),
);

router.get(
  '/content/help',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const config = await getGlHelpConfigFromDb();
    return res.json(config);
  }),
);

router.put(
  '/content/help',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const normalized = await saveGlHelpConfigToDb(req.body, req.glAuth.userId);
    return res.json(normalized);
  }),
);

router.post(
  '/content/help/reset',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const normalized = await saveGlHelpConfigToDb(loadDefaultGlHelpConfig(), req.glAuth.userId);
    return res.json(normalized);
  }),
);

router.get(
  '/media-library',
  requireGlPermission('gl.content.manage'),
  validate({ query: glAdminMediaQuerySchema }),
  asyncHandler(async (req, res) => {
    const limit = req.validatedQuery?.limit;
    const items = listMediaLibraryItems(Number.isFinite(limit) ? limit : 300, { app: 'gl' });
    return res.json({ items });
  }),
);

router.get(
  '/media-library/usage',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const usage = await collectMediaLibraryUsage(
      { queryAll },
      { app: 'gl', cache: glMediaUsageCache },
    );
    return res.json({ usage });
  }),
);

// Audit des conventions médiathèque (équivalent admin de scripts/audit-gl-media-keys.mjs) :
// ressources requises manquantes, clés récit suspectes (typos), clés non branchées.
router.get(
  '/media-library/audit',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const report = auditGlMediaKeys(loadMediaKeyIndex());
    return res.json({ report });
  }),
);

// Scènes de récit conventionnelles d'un chapitre (0 = prologue), avec métas.
router.get(
  '/media-library/chapter-scenes',
  requireGlPermission('gl.content.manage'),
  validate({ query: glAdminChapterScenesQuerySchema }),
  asyncHandler(async (req, res) => {
    const chapterNumber = req.validatedQuery?.chapter;
    if (!Number.isInteger(chapterNumber) || chapterNumber < 0 || chapterNumber > 5) {
      return res.status(400).json({ error: 'Paramètre chapter requis (0–5)' });
    }
    return res.json({ chapter: chapterNumber, scenes: listChapterRecitScenes(chapterNumber) });
  }),
);

// Métas éditoriales d'une scène de récit : légende, ordre d'affichage, couverture.
router.patch(
  '/media-library/scene-meta',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
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
        { req, payload: patch },
      );
      return res.json({ scene });
    } catch (err) {
      if (Number.isFinite(err?.status)) {
        return res.status(err.status).json({ error: err.message || 'Mise à jour impossible' });
      }
      throw err;
    }
  }),
);

router.post(
  '/media-library',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    try {
      const mediaData = String(req.body?.media_data || '').trim();
      if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
      const originalName =
        String(req.body?.original_name || req.body?.originalName || '').trim() || null;
      const saved = saveMediaFromDataUrl(mediaData, { originalName, app: 'gl' });
      return res.status(201).json(saved);
    } catch (err) {
      if (Number.isFinite(err?.status)) {
        return res.status(err.status).json({ error: err.message || 'Upload média refusé' });
      }
      throw err;
    }
  }),
);

router.delete(
  '/media-library',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    try {
      const payload = executeMediaLibraryDeleteRequest(req.body || {}, { app: 'gl' });
      return res.json(payload);
    } catch (err) {
      if (Number.isFinite(err?.status)) {
        return res.status(err.status).json({ error: err.message || 'Suppression média refusée' });
      }
      throw err;
    }
  }),
);

router.post(
  '/content-library/analyze',
  requireGlPermission('gl.content.manage'),
  contentLibraryUploadMiddleware,
  asyncHandler(async (req, res) => {
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
        },
      );
      return res.json(payload);
    } catch (err) {
      if (Number.isFinite(err?.status)) {
        return res.status(err.status).json({ error: err.message || 'Analyse impossible' });
      }
      throw err;
    }
  }),
);

router.get(
  '/content-library/limits',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    return res.json(getContentLibraryLimits());
  }),
);

router.post(
  '/content-library/apply',
  requireGlPermission('gl.content.manage'),
  contentLibraryUploadMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const uploadPayload = readApplyUploadPayload(req);
      const payload = await applyContentLibraryBulk({ queryAll, execute }, uploadPayload, {
        createdBy: req.glAuth?.userId != null ? Number(req.glAuth.userId) : null,
      });
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
        },
      );
      return res.json(payload);
    } catch (err) {
      if (Number.isFinite(err?.status)) {
        return res.status(err.status).json({ error: err.message || 'Application impossible' });
      }
      throw err;
    }
  }),
);

module.exports = router;
module.exports.glAdminMediaQuerySchema = glAdminMediaQuerySchema; // exporté pour test no-DB du contrat O7
module.exports.glAdminPlayersQuerySchema = glAdminPlayersQuerySchema; // exporté pour test no-DB du contrat O7
module.exports.glAdminChapterScenesQuerySchema = glAdminChapterScenesQuerySchema; // exporté pour test no-DB du contrat O7
