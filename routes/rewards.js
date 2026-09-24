'use strict';

/** Badges génériques (ludification) — lecture seule ; l'attribution se fait côté règles métier. */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { requireAuth } = require('../middleware/requireTeacher');
const { REWARD_CATALOGUE, listRewardsForUser } = require('../lib/rewards');

const router = express.Router();

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = String(req.auth?.userId || '').trim();
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const rewards = await listRewardsForUser(userId);
    return res.json({ rewards, catalogue: REWARD_CATALOGUE });
  }),
);

module.exports = router;
