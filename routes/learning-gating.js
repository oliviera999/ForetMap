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
      questions: state.questions,
      pending_count: state.pending_count,
      cooldown: state.cooldown,
    });
  }),
);

module.exports = router;
