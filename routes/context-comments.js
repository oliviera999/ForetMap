const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute } = require('../database');
const { requireAuth, requirePermission, hasPermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { logAudit } = require('../lib/auditLog');
const { emitContextCommentsChanged } = require('../lib/realtime');
const {
  fireAndForget,
  notifyContextComment,
  notifyPlaceMessageStatus,
} = require('../lib/notificationEvents');
const { isReportsEnabled } = require('../lib/settings');
const { requireModuleEnabled } = require('../lib/shared/moduleGate');
const {
  getActor,
  canModerateWithTeacherAccess,
  isParticipationExcludedRole,
  createCooldownChecker,
  studentParticipationAllowed,
} = require('../lib/shared/participationGuards');
const { persistUserContentImages, validateImagesPayload } = require('../lib/userContentImages');
const { normalizeOptionalString, parsePageQuery } = require('../lib/shared/httpHelpers');
const { listRecentPlaceMessages, setPlaceMessageStatus } = require('../lib/placeMessages');
const {
  AUTO_BODY_WITH_PHOTOS: CORE_AUTO_BODY_WITH_PHOTOS,
  loadContextCommentReactions,
  listContextComments,
  countContextCommentsByContextIds,
  softDeleteContextComment,
  CONTEXT_COMMENT_COUNTS_MAX_IDS,
  CONTEXT_COMMENT_LIMITS,
  insertContextComment,
  makeContextTypeNormalizer,
  resolveReactionToggle,
} = require('../lib/shared/contextCommentsCore');

const router = express.Router();

const AUTO_BODY_WITH_PHOTOS = CORE_AUTO_BODY_WITH_PHOTOS;

const ALLOWED_CONTEXT_TYPES = new Set(['task', 'project', 'zone', 'marker', 'plant', 'tutorial']);

/** Droit de clore un message de lieu — `admin` seul à la livraison (`lib/rbac.js`). */
const PLACE_STATUS_PERMISSION = 'place_messages.manage';

// Bornes de saisie : communes aux deux produits, donc lues au noyau partagé plutôt que
// redéclarées ici. Les alias locaux gardent les noms historiques, pour que le reste du fichier
// se lise sans changement.
const {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_BODY: MIN_COMMENT_LEN,
  MAX_BODY: MAX_COMMENT_LEN,
  MIN_REPORT_REASON: MIN_REPORT_REASON_LEN,
  MAX_REPORT_REASON: MAX_REPORT_REASON_LEN,
} = CONTEXT_COMMENT_LIMITS;

// Propre à ForetMap : G&L n'a pas de délai anti-rafale sur les commentaires contextuels.
const COMMENT_COOLDOWN_MS = 3_000;

const normalizeContextType = makeContextTypeNormalizer(ALLOWED_CONTEXT_TYPES);

// O7 — query de GET / : coercition permissive (jamais de 400 issu du schéma) reproduisant
// exactement l'ancienne lecture manuelle : `contextType` via normalizeContextType (type
// inconnu → ''), `contextId` via normalizeOptionalString (vide → null), pagination via
// parsePageQuery (`page` ≥ 1, `page_size` borné [1, MAX_PAGE_SIZE], `offset` dérivé).
// Les 400 « contextType invalide » / « contextId requis » restent décidés par le handler
// (contrat historique inchangé) — le schéma, lui, ne rejette jamais.
const contextCommentsListQuerySchema = z
  .object({
    contextType: z.unknown().optional(),
    contextId: z.unknown().optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .transform((q) => ({
    contextType: normalizeContextType(q.contextType),
    contextId: normalizeOptionalString(q.contextId),
    ...parsePageQuery(q, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    }),
  }));

// Noyau commun avec routes/forum.js (lib/shared/participationGuards) —
// mêmes comportements ; seuls le message 403, le code et la colonne de rôle sont locaux.
const canModerateComments = canModerateWithTeacherAccess;
const checkCooldown = createCooldownChecker();

/** n3boss : toujours ; n3beur : selon le profil principal (roles.context_comment_participate) */
async function userContextCommentParticipationAllowed(auth) {
  return studentParticipationAllowed(auth, 'context_comment_participate');
}

async function requireContextCommentParticipation(req, res) {
  const ok = await userContextCommentParticipationAllowed(req.auth);
  if (ok) return true;
  res.status(403).json({
    error: 'Commentaires en lecture seule : la publication n’est pas activée pour ton profil.',
    code: 'CONTEXT_COMMENT_READ_ONLY',
  });
  return false;
}

async function contextExists(contextType, contextId) {
  if (contextType === 'task') {
    const row = await queryOne('SELECT id FROM tasks WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'project') {
    const row = await queryOne('SELECT id FROM task_projects WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'zone') {
    const row = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'marker') {
    const row = await queryOne('SELECT id FROM map_markers WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'plant') {
    const row = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'tutorial') {
    const row = await queryOne('SELECT id FROM tutorials WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  return false;
}

router.use(requireAuth);
router.use(
  requireModuleEnabled('foret', 'context_comments', 'Commentaires de contexte désactivés'),
);
/*
 * Seul « visiteur » est privé de commentaires. « Personnel » l'était aussi, la garde
 * s'appuyant sur la liste des profils **sans carte de travail ni tâches** — deux questions
 * distinctes. Ce blocage avait déjà imposé une porte de contournement dédiée pour les
 * signalements du plan des personnels (`POST /api/staff-plan/report`), qui reste en place :
 * elle vérifie en plus que le lieu est réellement visible par ce lecteur sur la surface
 * `staff`, ce que cette route-ci ne fait pas.
 */
router.use((req, res, next) => {
  if (isParticipationExcludedRole(req.auth)) {
    return res.status(403).json({
      error: 'Accès refusé aux commentaires de contexte pour le profil visiteur',
    });
  }
  return next();
});

/**
 * Journal transverse des messages déposés sur des **lieux** (zones et repères), du plus
 * récent au plus ancien — la vue « Messages reçus sur les lieux » de la console.
 *
 * Réservée aux comptes qui ouvrent la console (`teacher.access`) : c'est une lecture par-dessus
 * tous les lieux à la fois, y compris ceux qu'un lecteur donné ne verrait pas sur la carte.
 * Elle ne sert pas à participer mais à **prendre connaissance** — d'où l'absence de réactions,
 * de pagination profonde et de suppression ici : tout cela se fait sur le lieu concerné.
 */
router.get(
  '/recent',
  requirePermission('teacher.access'),
  asyncHandler(async (req, res) => {
    const {
      items,
      total,
      open_total: openTotal,
    } = await listRecentPlaceMessages({
      limit: req.query.limit,
    });
    return res.json({
      items,
      total,
      open_total: openTotal,
      // Poser un statut est un droit distinct de celui de lire le journal : le front masque
      // les boutons plutôt que d'offrir une action qui répondrait 403.
      can_set_status: hasPermission(req.auth, PLACE_STATUS_PERMISSION),
    });
  }),
);

/**
 * Résumé groupé (total + dernier id) pour afficher le badge et les non-lus **sans**
 * ouvrir chaque section — une requête SQL pour toute une liste de tâches / tutoriels.
 * Inspiré de `GET /api/learning/gating/summary` (lots de refs, absence = zéro).
 */
router.get(
  '/counts',
  asyncHandler(async (req, res) => {
    const contextType = normalizeContextType(req.query.contextType);
    if (!contextType) {
      return res
        .status(400)
        .json({ error: 'contextType invalide (task|project|zone|marker|plant|tutorial)' });
    }
    const rawIds = String(req.query.contextIds || '')
      .split(',')
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(rawIds)];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: 'contextIds requis' });
    }
    if (uniqueIds.length > CONTEXT_COMMENT_COUNTS_MAX_IDS) {
      return res.status(400).json({
        error: `Trop d’identifiants (max ${CONTEXT_COMMENT_COUNTS_MAX_IDS})`,
        code: 'CONTEXT_COMMENT_COUNTS_LIMIT',
      });
    }
    const map = await countContextCommentsByContextIds(contextType, uniqueIds);
    const counts = {};
    for (const id of uniqueIds) {
      const row = map.get(String(id));
      counts[String(id)] = {
        total: row?.total || 0,
        // Marqueur opaque du dernier commentaire (chaîne vide = aucun) : le client le compare
        // par égalité à son curseur de lecture. Voir `countContextCommentsByContextIds`.
        newestId: row?.newestId || '',
      };
    }
    return res.json({
      contextType,
      counts,
      max_ids: CONTEXT_COMMENT_COUNTS_MAX_IDS,
    });
  }),
);

/**
 * Statut de traitement d'un message reçu sur un lieu : « pris en compte », « traité »,
 * « sans suite ». Réservé à `place_messages.manage` (le seul `admin` à la livraison).
 *
 * C'est la seule alternative à la suppression, qui efface l'information au lieu de la clore —
 * et la seule façon pour l'auteur d'apprendre que son signalement a été vu
 * (`docs/AUDIT_COMMUNICATION_2026-09-18.md` §6, C1).
 */
router.patch(
  '/:id/place-status',
  requirePermission(PLACE_STATUS_PERMISSION),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const outcome = await setPlaceMessageStatus({
      commentId: req.params.id,
      status: req.body?.status,
      actor,
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    const { comment, previousStatus } = outcome;
    await logAudit(
      'context_comment_place_status',
      'context_comment',
      comment.id,
      `Statut ${comment.place_status} sur ${comment.context_type}:${comment.context_id}`,
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          context_type: comment.context_type,
          context_id: comment.context_id,
          previous_status: previousStatus,
          status: comment.place_status,
        },
      },
    );
    emitContextCommentsChanged({
      reason: 'comment_place_status_changed',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
    });
    if (comment.place_status !== previousStatus) {
      fireAndForget(
        () =>
          notifyPlaceMessageStatus({
            commentId: comment.id,
            status: comment.place_status,
            actorUserId: actor.userId,
          }),
        { commentId: comment.id },
      );
    }
    return res.json({ ok: true, id: comment.id, place_status: comment.place_status });
  }),
);

router.get(
  '/',
  validate({ query: contextCommentsListQuerySchema }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    const { contextType, contextId, page, pageSize, offset } = req.validatedQuery;
    if (!contextType)
      return res
        .status(400)
        .json({ error: 'contextType invalide (task|project|zone|marker|plant|tutorial)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const sqlLimit = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    const sqlOffset = Math.max(0, Number(offset) || 0);
    const { items, total } = await listContextComments(contextType, contextId, {
      includeAuthorDisplayName: true,
      pageSize: sqlLimit,
      offset: sqlOffset,
    });
    const reactionsByComment = await loadContextCommentReactions(
      items.map((item) => item.id),
      actor,
    );
    const enrichedItems = items.map((item) => ({
      ...item,
      reactions: reactionsByComment.get(item.id) || [],
    }));
    return res.json({ items: enrichedItems, page, page_size: pageSize, total });
  }),
);

router.post(
  '/:id/reactions',
  asyncHandler(async (req, res) => {
    if (!(await requireContextCommentParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const toggle = await resolveReactionToggle(req.params.id, actor, req.body?.emoji);
    if (toggle.status !== 200) return res.status(toggle.status).json({ error: toggle.error });
    const { comment, reacted, emoji } = toggle;

    await logAudit(
      'context_comment_reaction_toggle',
      'context_comment',
      comment.id,
      'Réaction emoji commentaire contextuel',
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          context_type: comment.context_type,
          context_id: comment.context_id,
          emoji,
          reacted,
        },
      },
    );
    emitContextCommentsChanged({
      reason: 'comment_reaction_changed',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
      emoji,
    });
    return res.json({ ok: true, reacted, emoji });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!(await requireContextCommentParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeOptionalString(req.body?.contextId);
    const imagesCheck = validateImagesPayload(req.body?.images);
    if (imagesCheck.error) return res.status(400).json({ error: imagesCheck.error });
    const imageList = imagesCheck.images || [];
    let body = normalizeOptionalString(req.body?.body);
    if (!contextType)
      return res
        .status(400)
        .json({ error: 'contextType invalide (task|project|zone|marker|plant|tutorial)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (
      imageList.length === 0 &&
      (!body || body.length < MIN_COMMENT_LEN || body.length > MAX_COMMENT_LEN)
    ) {
      return res.status(400).json({
        error: `Message invalide (${MIN_COMMENT_LEN}-${MAX_COMMENT_LEN} caractères), ou ajoute au moins une image`,
      });
    }
    if (imageList.length > 0 && (!body || !String(body).trim())) {
      body = AUTO_BODY_WITH_PHOTOS;
    }
    if (body.length < MIN_COMMENT_LEN || body.length > MAX_COMMENT_LEN) {
      return res
        .status(400)
        .json({ error: `Message invalide (${MIN_COMMENT_LEN}-${MAX_COMMENT_LEN} caractères)` });
    }
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    if (!checkCooldown(actor, 'context_comment', COMMENT_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }
    // L'identifiant est tiré ici, et non dans `insertContextComment` : les images sont
    // rangées sous cet identifiant **avant** l'insertion, pour qu'une photo refusée ne laisse
    // pas un commentaire vide derrière elle.
    const commentId = crypto.randomUUID();
    let pathsJson = null;
    if (imageList.length > 0) {
      const persisted = await persistUserContentImages('context-comments', commentId, imageList);
      if (persisted.error) {
        return res.status(400).json({ error: persisted.error });
      }
      pathsJson = persisted.pathsJson;
    }
    const created = await insertContextComment({
      commentId,
      contextType,
      contextId,
      body,
      actor,
      imagePathsJson: pathsJson,
    });
    await logAudit(
      'context_comment_create',
      'context_comment',
      commentId,
      `Commentaire ${contextType}:${contextId}`,
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          context_type: contextType,
          context_id: contextId,
          images_count: imageList.length,
        },
      },
    );
    emitContextCommentsChanged({ reason: 'comment_created', contextType, contextId, commentId });
    fireAndForget(
      () => notifyContextComment({ contextType, contextId, body, actorUserId: actor.userId }),
      { commentId },
    );
    return res.status(201).json(created);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await requireContextCommentParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const existing = await queryOne(
      `SELECT id, context_type, context_id, author_user_type, author_user_id, is_deleted
       FROM context_comments WHERE id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!existing) return res.status(404).json({ error: 'Commentaire introuvable' });
    if (Number(existing.is_deleted)) return res.json({ ok: true, already_deleted: true });

    const ownsComment =
      existing.author_user_type === actor.userType && existing.author_user_id === actor.userId;
    const moderator = canModerateComments(req.auth);
    if (!ownsComment && !moderator)
      return res.status(403).json({ error: 'Permission insuffisante' });

    const deleted = await softDeleteContextComment(req.params.id);
    const comment = deleted.comment;
    await logAudit(
      'context_comment_delete',
      'context_comment',
      comment.id,
      'Suppression commentaire contextuel',
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          context_type: comment.context_type,
          context_id: comment.context_id,
          moderator_action: moderator && !ownsComment,
        },
      },
    );
    emitContextCommentsChanged({
      reason: 'comment_deleted',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
    });
    return res.json({ ok: true });
  }),
);

router.post(
  '/:id/report',
  asyncHandler(async (req, res) => {
    if (!(await isReportsEnabled())) {
      return res.status(403).json({
        error: 'Les signalements sont désactivés.',
        code: 'REPORTS_DISABLED',
      });
    }
    if (!(await requireContextCommentParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const reason = normalizeOptionalString(req.body?.reason);
    if (!reason || reason.length < MIN_REPORT_REASON_LEN || reason.length > MAX_REPORT_REASON_LEN) {
      return res.status(400).json({
        error: `Motif invalide (${MIN_REPORT_REASON_LEN}-${MAX_REPORT_REASON_LEN} caractères)`,
      });
    }
    const comment = await queryOne(
      `SELECT id, context_type, context_id
       FROM context_comments
      WHERE id = ?
      LIMIT 1`,
      [req.params.id],
    );
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });

    const duplicate = await queryOne(
      `SELECT id
       FROM context_comment_reports
      WHERE comment_id = ?
        AND reporter_user_type = ?
        AND reporter_user_id = ?
        AND status = 'open'
      LIMIT 1`,
      [comment.id, actor.userType, actor.userId],
    );
    if (duplicate)
      return res.status(409).json({ error: 'Signalement déjà envoyé pour ce commentaire' });

    const created = await execute(
      `INSERT INTO context_comment_reports
      (comment_id, reporter_user_type, reporter_user_id, reason, status)
     VALUES (?, ?, ?, ?, 'open')`,
      [comment.id, actor.userType, actor.userId, reason],
    );
    await logAudit(
      'context_comment_report',
      'context_comment',
      comment.id,
      'Signalement commentaire contextuel',
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          report_id: created.insertId,
          context_type: comment.context_type,
          context_id: comment.context_id,
        },
      },
    );
    emitContextCommentsChanged({
      reason: 'comment_reported',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
    });
    return res.status(201).json({ ok: true, report_id: created.insertId });
  }),
);

module.exports = router;
module.exports.contextCommentsListQuerySchema = contextCommentsListQuerySchema; // exporté pour test no-DB du contrat O7
