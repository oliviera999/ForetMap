'use strict';

const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { getChallengeState } = require('../lib/learningGatingAcknowledge');
const {
  normalizeResourceType,
  normalizeResourceRef,
  FORETMAP_RESOURCE_TYPES,
} = require('../lib/shared/resourceQuestionGatingCore');
const { FM_MARKABLE } = require('../lib/learningGatingRuntime');

const router = express.Router();
const db = { queryAll, queryOne };

/** GET /api/learning/gating/challenge?resourceType=&resourceRef= */
router.get(
  '/challenge',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resourceType = normalizeResourceType(req.query.resourceType, FORETMAP_RESOURCE_TYPES);
    const resourceRef = normalizeResourceRef(req.query.resourceRef);
    if (!resourceType || !resourceRef || !FM_MARKABLE.has(resourceType)) {
      return res.status(400).json({ error: 'Paramètres de ressource invalides' });
    }
    const userId = req.auth?.userId;
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });

    const state = await getChallengeState(db, {
      product: 'fm',
      resourceType,
      resourceRef,
      userId,
    });
    if (!state.ok) {
      return res.status(state.status || 400).json({ error: state.error || 'Challenge invalide' });
    }
    return res.json({
      gating_enabled: state.gating_enabled,
      required: state.required,
      mode: state.mode,
      required_correct: state.required_correct,
      granularity: state.granularity,
      questions: state.questions,
      pending_count: state.pending_count,
      satisfied: state.satisfied,
      cooldown: state.cooldown,
    });
  }),
);

/** Plafond de ressources interrogeables en une fois (garde-fou de charge). */
const SUMMARY_MAX_REFS = 60;

/**
 * GET /api/learning/gating/summary?resourceType=&resourceRefs=1,2,3
 *
 * Resume compact du conditionnement pour PLUSIEURS ressources d'un coup. Sert a
 * prevenir l'eleve AVANT qu'il ne clique : jusqu'ici, « Marquer comme lu » ne
 * laissait rien deviner, et le controle ne se revelait qu'une fois la fenetre
 * ouverte. Interroger une route par tutoriel aurait multiplie les appels ; ce
 * point d'entree en traite une liste.
 */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resourceType = normalizeResourceType(req.query.resourceType, FORETMAP_RESOURCE_TYPES);
    if (!resourceType || !FM_MARKABLE.has(resourceType)) {
      return res.status(400).json({ error: 'Type de ressource invalide' });
    }
    const userId = req.auth?.userId;
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });

    const refs = String(req.query.resourceRefs || '')
      .split(',')
      .map((r) => normalizeResourceRef(r))
      .filter(Boolean);
    const unique = [...new Set(refs)].slice(0, SUMMARY_MAX_REFS);
    if (!unique.length) return res.json({ resource_type: resourceType, items: [] });

    const items = [];
    for (const resourceRef of unique) {
      const state = await getChallengeState(db, {
        product: 'fm',
        resourceType,
        resourceRef,
        userId,
      });
      if (!state.ok) continue;
      items.push({
        resource_ref: resourceRef,
        required: !!state.required,
        // `ask_count` = ce qui sera reellement pose maintenant (plafond par session
        // applique) ; `pending_count` = ce qu'il reste au total pour valider.
        ask_count: state.ask_count || 0,
        pending_count: state.pending_count || 0,
        satisfied: !!state.satisfied,
        mode: state.mode,
        locked: !!state.cooldown?.locked,
        remaining_days: state.cooldown?.remaining_days || 0,
        retry_days: state.cooldown?.retry_days || 0,
        allowed_wrong_attempts: state.allowed_wrong_attempts || 0,
      });
    }
    return res.json({ resource_type: resourceType, items });
  }),
);

module.exports = router;
