'use strict';

/**
 * Fresques — jeux de cartes « cause → effet » (premier jeu : La Fresque du Climat, version
 * Enfant) : jeux disponibles, plateau actif d'un élève ou d'une équipe, enregistrement strict
 * avec verrou optimiste, journal des gestes, vue prof en lecture seule.
 *
 * Toutes les routes exigent un compte connecté. Module `ui.modules.fresque_enabled` éteint :
 * 503 pour les élèves, passage pour `plants.manage` (`lib/pedagoModuleGate.js`).
 * Logique métier : `lib/fresqueBoards.js` + cœur partagé `lib/shared/fresqueCore.js`.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { requireAuth, hasPermission } = require('../middleware/requireTeacher');
const { requirePedagoModuleOrManager } = require('../lib/pedagoModuleGate');
const { fresqueSaveLimiter } = require('../lib/rateLimit');
const { canBypassGroupScope } = require('../lib/groupScope');
const { DECK_ID_RE, getFresqueDeck, listFresqueDecks } = require('../lib/fresqueDecks');
const { FRESQUE_LEVELS } = require('../lib/shared/fresqueCore');
const { emitFresqueBoardChanged } = require('../lib/realtime');
const boards = require('../lib/fresqueBoards');

const router = express.Router();

router.use(requirePedagoModuleOrManager('fresque', 'Fresques désactivées'));
router.use(requireAuth);

const deckIdSchema = z.string().regex(DECK_ID_RE, 'deckId invalide');
const boardIdSchema = z.string().uuid('identifiant de plateau invalide');
const groupIdSchema = z.string().trim().min(1).max(64);

const createBoardBody = z.object({
  deckId: deckIdSchema,
  ownerType: z.enum(['user', 'team']).default('user'),
  groupId: groupIdSchema.nullable().optional(),
  level: z.enum(FRESQUE_LEVELS).optional(),
});

const saveBoardBody = z.object({
  state: z.object({}).passthrough(),
  expected_revision: z.union([z.number().int().nonnegative(), z.string(), z.null()]).optional(),
  clientSeq: z.number().int().nonnegative().optional(),
});

/** Erreur métier (`FresqueError`) → `{ error }` avec son statut ; le reste part au gestionnaire central. */
function handle(fn) {
  return asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof boards.FresqueError) {
        return res.status(err.status).json({ error: err.message, ...err.extra });
      }
      throw err;
    }
  });
}

async function loadAccessibleBoard(req, res, { withState = false, write = false } = {}) {
  const row = await boards.loadBoardRow(req.params.id, { withState });
  if (!row) {
    res.status(404).json({ error: 'Plateau introuvable' });
    return null;
  }
  const access = await boards.resolveBoardAccess(req.auth, row);
  if (!access.canRead || (write && !access.canWrite)) {
    res.status(403).json({
      error: write ? 'Ce plateau est en lecture seule pour toi' : 'Accès refusé à ce plateau',
    });
    return null;
  }
  return { row, access };
}

router.get(
  '/decks',
  asyncHandler(async (_req, res) => {
    res.json({ decks: listFresqueDecks() });
  }),
);

router.get(
  '/decks/:deckId',
  validate({ params: z.object({ deckId: deckIdSchema }) }),
  asyncHandler(async (req, res) => {
    const entry = getFresqueDeck(req.validatedParams.deckId);
    if (!entry) return res.status(404).json({ error: 'Jeu de fresque introuvable' });
    return res.json({
      id: entry.id,
      publicBase: entry.publicBase,
      deck: entry.deck,
      correction: entry.correction,
      hints: entry.hints,
    });
  }),
);

router.get(
  '/boards/mine',
  validate({ query: z.object({ deckId: deckIdSchema.optional() }).passthrough() }),
  handle(async (req, res) => {
    const deckId = req.validatedQuery.deckId || null;
    if (deckId && !getFresqueDeck(deckId)) {
      return res.status(404).json({ error: 'Jeu de fresque introuvable' });
    }
    const [items, teams] = await Promise.all([
      boards.listMyBoards(req.auth, { deckId }),
      boards.listMyTeams(req.auth),
    ]);
    return res.json({ boards: items, teams });
  }),
);

router.post(
  '/boards',
  validate({ body: createBoardBody }),
  handle(async (req, res) => {
    const { deckId, ownerType, groupId, level } = req.body;
    const { row, created } = await boards.getOrCreateActiveBoard(req.auth, {
      deckId,
      ownerType,
      groupId: groupId || null,
      level,
    });
    return res.status(created ? 201 : 200).json({
      board: boards.serializeBoard(row, {
        state: boards.parseState(row.state_json),
        access: { canWrite: true },
      }),
      created,
    });
  }),
);

router.get(
  '/boards/:id',
  validate({ params: z.object({ id: boardIdSchema }) }),
  handle(async (req, res) => {
    const loaded = await loadAccessibleBoard(req, res, { withState: true });
    if (!loaded) return;
    const { row, access } = loaded;
    res.json({
      board: boards.serializeBoard(row, { state: boards.parseState(row.state_json), access }),
    });
  }),
);

router.put(
  '/boards/:id',
  fresqueSaveLimiter,
  validate({ params: z.object({ id: boardIdSchema }), body: saveBoardBody }),
  handle(async (req, res) => {
    const loaded = await loadAccessibleBoard(req, res, { withState: true, write: true });
    if (!loaded) return;
    const result = await boards.saveBoardState(req.auth, loaded.row, req.body);
    if (result.status === 200) {
      emitFresqueBoardChanged(loaded.row.id, {
        revision: result.body.revision,
        by: String(req.auth?.userId || ''),
        clientSeq: result.body.clientSeq,
      });
    }
    res.status(result.status).json(result.body);
  }),
);

router.post(
  '/boards/:id/restart',
  validate({ params: z.object({ id: boardIdSchema }) }),
  handle(async (req, res) => {
    const loaded = await loadAccessibleBoard(req, res, { write: true });
    if (!loaded) return;
    const row = await boards.restartBoard(req.auth, loaded.row);
    emitFresqueBoardChanged(loaded.row.id, { archived: true, nextBoardId: row.id });
    res.status(201).json({
      board: boards.serializeBoard(row, {
        state: boards.parseState(row.state_json),
        access: { canWrite: true },
      }),
      previousBoardId: loaded.row.id,
    });
  }),
);

router.get(
  '/boards/:id/events',
  validate({
    params: z.object({ id: boardIdSchema }),
    query: z.object({ after: z.coerce.number().int().nonnegative().optional() }).passthrough(),
  }),
  handle(async (req, res) => {
    const loaded = await loadAccessibleBoard(req, res);
    if (!loaded) return;
    const events = await boards.listEvents(loaded.row.id, { after: req.validatedQuery.after || 0 });
    res.json({ boardId: loaded.row.id, events });
  }),
);

router.get(
  '/overview',
  validate({
    query: z
      .object({ deckId: deckIdSchema.optional(), groupId: groupIdSchema.optional() })
      .passthrough(),
  }),
  handle(async (req, res) => {
    const auth = req.auth;
    const allowed =
      hasPermission(auth, 'stats.read.group') ||
      hasPermission(auth, 'stats.read.all') ||
      canBypassGroupScope(auth);
    if (!allowed) return res.status(403).json({ error: 'Permission insuffisante' });
    const { deckId = null, groupId = null } = req.validatedQuery;
    const result = await boards.overview(auth, { deckId, groupId });
    if (result.unauthorizedGroup) {
      return res.status(403).json({ error: 'Groupe hors de votre périmètre' });
    }
    return res.json({ deckId, groupId, boards: result.boards });
  }),
);

module.exports = router;
