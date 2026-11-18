const express = require('express');
const { queryOne } = require('../../../database');
const {
  requireGlAuth,
  requireGlAuthOrTeam,
  hasGlPermission,
} = require('../../../middleware/requireGlAuth');
const { refusSiTeamSessionHorsTour, resolveActingPlayer } = require('../../../lib/glActeur');
const { gardeDEquipe } = require('../../../lib/glEquipeEtat');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
const { emitGlGameEvent, emitGlSpellCastDraftChanged } = require('../../../lib/realtime');
const {
  getSpellCastConfig,
  assertSpellCastAvailable,
  assertSpellCastActorAllowed,
  resolveSpellCastError,
  mapSpellCastSqlError,
  createOrGetDraft,
  getDraftById,
  updateDraftContributions,
  setDraftExclusion,
  refuserCast,
  launchDraft,
  resolveDraftApproval,
  listPendingApprovalDrafts,
  listCastsAwaitingEffect,
  markEffectApplied,
  cancelDraft,
  isStaff,
} = require('../../../lib/glSpellCast');
const { normalizeSpellCode } = require('../../../lib/glChapterSpells');
const { logRouteError } = require('../../../lib/routeLog');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { parseId } = require('../../../lib/shared/httpHelpers');
const { queueGlRewardsForSpellCast } = require('../../../lib/glRewardsHooks');

const router = express.Router();

/**
 * Annonce temps réel d'un pot. La room d'une partie réunit toutes les équipes et la
 * projection : en « Tenir à deux », où les bourses sont privées, on n'y envoie que
 * l'identifiant du pot — l'écran qui l'a ouvert le recharge par HTTP (`GET …/drafts/:id`,
 * réservé à l'équipe lanceuse, à sa partenaire et au prof).
 */
function emitDraftChanged(gameId, payload) {
  const draft = payload?.draft;
  if (draft?.spell?.tenirV2) {
    const { draft: _prive, ...rest } = payload;
    return emitGlSpellCastDraftChanged(gameId, { ...rest, teamId: draft.teamId });
  }
  return emitGlSpellCastDraftChanged(gameId, payload);
}

/**
 * « Tenir à deux » : un pot (parts, bourses des membres) ne se lit que par l'équipe lanceuse,
 * sa partenaire de pacte et le prof.
 */
async function peutLireLePot(req, gameId, draft) {
  if (!draft?.spell?.tenirV2 || isStaff(req.glAuth)) return true;
  const actor = req.glAuth.actor || {};
  let teamId = actor.kind === 'team' ? Number(actor.teamId) : null;
  if (actor.kind === 'player') {
    const row = await queryOne(
      'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
      [gameId, actor.playerId],
    );
    teamId = row?.team_id != null ? Number(row.team_id) : null;
  }
  const equipes = Array.isArray(draft.equipesDuPot)
    ? draft.equipesDuPot.map(Number)
    : [Number(draft.teamId)];
  return teamId != null && equipes.includes(teamId);
}

/** Élève connecté, prof, ou tablette d'équipe (session ouverte par le lien de classe). */
function requireSpellCastPermission(req, res, next) {
  requireGlAuthOrTeam(req, res, () => {
    if (
      hasGlPermission(req.glAuth, 'gl.action.request') ||
      hasGlPermission(req.glAuth, 'gl.event.emit')
    ) {
      return next();
    }
    return res.status(403).json({ error: 'Permission insuffisante' });
  });
}

/** Équipe d'un brouillon, pour la garde d'équipe quand c'est le prof qui agit dessus. */
async function equipeDuBrouillon(req) {
  const draftId = parseId(req.params.draftId);
  const gameId = parseId(req.params.id);
  if (!draftId || !gameId) return null;
  const row = await queryOne(
    'SELECT team_id FROM gl_spell_cast_drafts WHERE id = ? AND game_id = ? LIMIT 1',
    [draftId, gameId],
  );
  return row?.team_id ?? null;
}

// Plusieurs appareils par équipe (M13) : préparer un sort prend la main ; le lancer ou
// l'annuler la rend. Hors d'un tour ouvert (sorts du camp, d'activité), la garde laisse passer.
// Régler SA part ou dire « pas moi » est un geste personnel, sur sa propre bourse : il ne passe
// pas par la garde, pour qu'un élève le fasse de son compte pendant qu'un autre appareil
// prépare le sort.
const gardeSortPrepare = gardeDEquipe({ prend: 'sort' });
const gardeSortFini = gardeDEquipe({
  rend: true,
  finit: 'sort',
  equipeDuProf: equipeDuBrouillon,
});

async function handleSpellCastRoute(req, res, handler) {
  try {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });
    // Une tablette d'équipe ne jette un sort que pendant un tour ouvert (hors tour : lecture).
    const horsTour = await refusSiTeamSessionHorsTour(req, gameId);
    if (horsTour) {
      return res.status(horsTour.status).json({ error: horsTour.error, code: horsTour.code });
    }
    const config = await getSpellCastConfig();
    await assertSpellCastAvailable(config);
    // Audit S11 — `spell_cast_mj_only` réserve au MJ le *lancement*, pas la lecture :
    // bloquer aussi les GET privait les joueurs de la consultation du pot alors que les
    // événements Socket.IO le leur poussaient quand même.
    if (String(req.method || '').toUpperCase() !== 'GET') {
      assertSpellCastActorAllowed(req.glAuth, config);
    }
    return await handler({ gameId, config });
  } catch (err) {
    const mapped = resolveSpellCastError(mapSpellCastSqlError(err));
    if (mapped) {
      return res
        .status(mapped.status)
        .json({ error: mapped.error, ...(mapped.code ? { code: mapped.code } : {}) });
    }
    if (err?.status && err?.code && typeof err.message === 'string') {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    logRouteError(req, err, 'gl.spell_cast');
    return res.status(500).json({ error: 'Erreur lors du sortilège collaboratif' });
  }
}

router.get('/spell-cast-settings', requireGlAuthOrTeam, async (_req, res) => {
  const config = await getSpellCastConfig();
  return res.json({
    settings: {
      enabled: config.enabled,
      vitalityRequired: true,
      contributionMode: config.contributionMode,
      teamScope: config.teamScope,
      mjOnly: config.mjOnly,
      approvalMode: config.approvalMode,
    },
  });
});

const routeBrouillon = ['/games/:id/spell-casts/drafts', requireSpellCastPermission];

router.post(...routeBrouillon, gardeSortPrepare, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
    const spellCode = normalizeSpellCode(req.body?.spellCode);
    if (!spellCode) {
      return res.status(400).json({ error: 'spellCode requis' });
    }
    // Tablette d'équipe : son équipe par défaut (le serveur refuse toute autre équipe).
    const teamId =
      parseId(req.body?.teamId) ||
      (req.glAuth.actor?.kind === 'team' ? Number(req.glAuth.actor.teamId) : null);
    if (!teamId && !isStaff(req.glAuth)) {
      return res.status(400).json({ error: 'teamId requis pour les joueurs' });
    }
    const draft = await createOrGetDraft({
      gameId,
      teamId,
      spellCode,
      auth: req.glAuth,
      config,
      // « Tenir à deux » v2 : ressource au choix, partenaire du pacte, paramètres d'effet,
      // élève (limite par élève).
      options: {
        ressource: req.body?.ressource,
        partnerTeamId: req.body?.partnerTeamId,
        effectParams:
          req.body?.effectParams && typeof req.body.effectParams === 'object'
            ? req.body.effectParams
            : null,
        playerId: req.body?.playerId,
      },
    });
    emitDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
    return res.status(201).json({ draft });
  });
});

router.get(
  '/games/:id/spell-casts/drafts/:draftId',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const draft = await getDraftById(draftId, gameId);
      if (!(await peutLireLePot(req, gameId, draft))) {
        return res.status(403).json({ error: 'Ce pot est celui d’une autre équipe' });
      }
      return res.json({ draft });
    });
  },
);

router.put(
  '/games/:id/spell-casts/drafts/:draftId/contributions',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const contributions = req.body?.contributions;
      const draft = await updateDraftContributions({
        gameId,
        draftId,
        contributions,
        auth: req.glAuth,
        config,
      });
      emitDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
      return res.json({ draft });
    });
  },
);

/**
 * « Pas moi » (lot 2) : `{ playerId, exclu }`. L'élève pour lui-même, depuis son propre compte,
 * ou le prof — jamais la tablette de l'équipe (M13, bourses au propriétaire). Le partage se
 * recalcule sur les présents non exclus.
 */
router.post(
  '/games/:id/spell-casts/drafts/:draftId/exclure',
  requireSpellCastPermission,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      let playerId = parseId(req.body?.playerId);
      const row = await queryOne(
        'SELECT team_id FROM gl_spell_cast_drafts WHERE id = ? AND game_id = ? LIMIT 1',
        [draftId, gameId],
      );
      if (!row) return res.status(404).json({ error: 'Brouillon introuvable' });
      // Bourses au propriétaire : un élève ne se retire que lui-même ; une tablette, personne.
      if (req.glAuth.actor?.kind !== 'mj') {
        const agit = await resolveActingPlayer(req, {
          gameId,
          teamId: Number(row.team_id),
          onBehalfOfPlayerId: playerId,
        });
        if (!agit.ok) {
          return res
            .status(agit.status)
            .json({ error: agit.error, ...(agit.code ? { code: agit.code } : {}) });
        }
        playerId = agit.playerId;
      }
      if (!playerId) return res.status(400).json({ error: 'playerId requis' });
      const draft = await setDraftExclusion({
        gameId,
        draftId,
        playerId,
        exclu: req.body?.exclu !== false,
        auth: req.glAuth,
      });
      emitDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
      return res.json({ draft });
    });
  },
);

router.post(
  '/games/:id/spell-casts/drafts/:draftId/launch',
  requireSpellCastPermission,
  gardeSortFini,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const { draft, eventPayload, eventId, pending, effectEvents, effectResult } =
        await launchDraft({
          gameId,
          draftId,
          auth: req.glAuth,
          config,
        });
      const evt = eventId
        ? await queryOne(
            `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
           FROM gl_game_events
          WHERE id = ? AND game_id = ?
          LIMIT 1`,
            [eventId, gameId],
          )
        : null;
      if (!evt) {
        return res
          .status(500)
          .json({ error: 'Événement de sortilège introuvable après lancement' });
      }
      const normalized = normalizeEventRow(evt);
      // Sort soumis à validation MJ : pas de débit, brouillon en attente.
      if (pending) {
        if (normalized.eventType !== 'spell_cast_request') {
          return res
            .status(500)
            .json({ error: 'Événement de sortilège incohérent après soumission' });
        }
        emitGlGameEvent(gameId, normalized);
        emitDraftChanged(gameId, { draftId: draft.id, type: 'draft_pending', draft });
        return res.json({
          ok: true,
          pending: true,
          draft,
          event: normalized,
          payload: eventPayload,
        });
      }
      // Badge « Épaule » (sorts d'aide) : hors transaction, jamais bloquant.
      queueGlRewardsForSpellCast(gameId, draftId);
      if (normalized.eventType !== 'spell_cast') {
        return res.status(500).json({ error: 'Événement de sortilège incohérent après lancement' });
      }
      emitGlGameEvent(gameId, normalized);
      for (const effectEvt of effectEvents || []) if (effectEvt) emitGlGameEvent(gameId, effectEvt);
      emitDraftChanged(gameId, { draftId: draft.id, type: 'draft_cast', draft });
      return res.json({
        ok: true,
        draft,
        event: normalized,
        payload: eventPayload,
        effectEvents: effectEvents || [],
        effectResult: effectResult || null,
      });
    });
  },
);

/**
 * Liste des sortilèges en attente de validation MJ (mode classique). Réservé au staff.
 */
router.get('/games/:id/spell-casts/pending', requireGlAuth, async (req, res) => {
  if (!hasGlPermission(req.glAuth, 'gl.game.manage')) {
    return res.status(403).json({ error: 'Réservé au maître du jeu' });
  }
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const drafts = await listPendingApprovalDrafts(gameId);
    return res.json({ drafts });
  });
});

/**
 * Résolution MJ d'un sortilège en attente de validation (accept = débit + cast ; reject = annulé).
 * Réservé au staff disposant de gl.game.manage.
 */
router.post('/games/:id/spell-casts/drafts/:draftId/resolve', requireGlAuth, async (req, res) => {
  if (!hasGlPermission(req.glAuth, 'gl.game.manage')) {
    return res.status(403).json({ error: 'Réservé au maître du jeu' });
  }
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    const decision = String(req.body?.decision || '').toLowerCase();
    if (!['accept', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Décision invalide (accept|reject)' });
    }
    const { draft, eventId, effectEvents } = await resolveDraftApproval({
      gameId,
      draftId,
      decision,
      auth: req.glAuth,
    });
    for (const effectEvt of effectEvents || []) if (effectEvt) emitGlGameEvent(gameId, effectEvt);
    if (decision === 'accept') queueGlRewardsForSpellCast(gameId, draftId);
    const evt = eventId
      ? await queryOne(
          `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
               FROM gl_game_events WHERE id = ? AND game_id = ? LIMIT 1`,
          [eventId, gameId],
        )
      : null;
    const normalized = evt ? normalizeEventRow(evt) : null;
    if (normalized) emitGlGameEvent(gameId, normalized);
    emitDraftChanged(gameId, {
      draftId: draft.id,
      type: decision === 'accept' ? 'draft_cast' : 'draft_rejected',
      draft,
    });
    return res.json({ ok: true, decision, draft, event: normalized });
  });
});

/**
 * G11 — file des sortilèges lancés dont le MJ n'a pas encore appliqué l'effet.
 * Le logiciel n'exécute pas les effets : cette liste est son pense-bête.
 */
router.get('/games/:id/spell-casts/awaiting-effect', requireGlAuth, async (req, res) => {
  if (!hasGlPermission(req.glAuth, 'gl.game.manage')) {
    return res.status(403).json({ error: 'Réservé au maître du jeu' });
  }
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const drafts = await listCastsAwaitingEffect(gameId);
    return res.json({ drafts });
  });
});

/** G11 — le MJ note qu'il a appliqué l'effet à la table (trace + ligne de journal). */
router.post(
  '/games/:id/spell-casts/drafts/:draftId/effect-applied',
  requireGlAuth,
  async (req, res) => {
    if (!hasGlPermission(req.glAuth, 'gl.game.manage')) {
      return res.status(403).json({ error: 'Réservé au maître du jeu' });
    }
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      const { draft, eventId, extraEvents } = await markEffectApplied({
        gameId,
        draftId,
        auth: req.glAuth,
        body: req.body || {},
      });
      for (const extra of extraEvents || []) if (extra) emitGlGameEvent(gameId, extra);
      const evt = eventId
        ? await queryOne(
            `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
               FROM gl_game_events WHERE id = ? AND game_id = ? LIMIT 1`,
            [eventId, gameId],
          )
        : null;
      const normalized = evt ? normalizeEventRow(evt) : null;
      if (normalized) emitGlGameEvent(gameId, normalized);
      emitDraftChanged(gameId, {
        draftId: draft.id,
        type: 'draft_effect_applied',
        draft,
      });
      return res.json({ ok: true, draft, event: normalized });
    });
  },
);

/**
 * « Refuser et rembourser » (lot 2) : `{ mot? }`. Prof seul, pour un sort lancé dont l'effet
 * n'est pas appliqué. Remboursement exact, évènement `spell_refuse` (mot visible de l'équipe).
 */
router.post('/games/:id/spell-casts/drafts/:draftId/refuser', requireGlAuth, async (req, res) => {
  if (!hasGlPermission(req.glAuth, 'gl.game.manage')) {
    return res.status(403).json({ error: 'Réservé au maître du jeu' });
  }
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    const result = await refuserCast({
      gameId,
      draftId,
      auth: req.glAuth,
      mot: req.body?.mot,
    });
    if (result.event) emitGlGameEvent(gameId, result.event);
    emitGlSpellCastDraftChanged(gameId, { draftId, type: 'draft_refused', teamId: result.teamId });
    return res.json({
      ok: true,
      draftId: result.draftId,
      teamId: result.teamId,
      spellCode: result.spellCode,
    });
  });
});

router.delete(
  '/games/:id/spell-casts/drafts/:draftId',
  requireSpellCastPermission,
  gardeSortFini,
  async (req, res) => {
    return handleSpellCastRoute(req, res, async ({ gameId }) => {
      const draftId = parseId(req.params.draftId);
      if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
      await cancelDraft({ gameId, draftId, auth: req.glAuth });
      emitDraftChanged(gameId, { draftId, type: 'draft_cancelled' });
      return res.json({ ok: true });
    });
  },
);

module.exports = router;
