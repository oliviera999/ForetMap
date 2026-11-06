'use strict';

/**
 * Badges (ludification). L'attribution automatique se fait côté règles métier
 * (`lib/rewards/`) ; ce routeur lit les badges, la progression et la vitrine, et décerne les
 * badges manuels.
 *
 *  - `GET  /me`               badges de la personne connectée, catalogue complet (paliers),
 *                             progression vers le palier suivant. Évalue d'abord les familles
 *                             sans événement déclencheur (exploration, reportage, collectif) :
 *                             les badges mérités arrivent à l'ouverture, sans attendre la nuit ;
 *  - `POST /me/seen`          annonces vues (`seen_at`) ;
 *  - `GET  /students/:id`     badges et progression d'un élève (personnel, périmètre) ;
 *  - `GET  /groups/:id`       vitrine d'un groupe : élèves × familles, « proche d'un palier »
 *                             (personnel, périmètre ; tri alphabétique, aucun classement) ;
 *  - `POST /award`            badge manuel (`rewards.award`, élève du périmètre, mot requis).
 *
 * Visibilité : l'élève voit les siens ; le personnel voit ceux des élèves dont il voit déjà
 * les inscriptions (`canReadAllAssignments` + périmètre `getScopedStudentIds`). Aucun
 * affichage public.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { requireModuleEnabled } = require('../lib/shared/moduleGate');
const { canReadAllAssignments } = require('../lib/taskAuthzHelpers');
const { canAccessStudentId, getScopedStudentIds } = require('../lib/groupScope');
const { queryOne } = require('../database');
const logger = require('../lib/logger');
const { announceRewards } = require('../lib/rewards/announce');
const { evaluateUser } = require('../lib/rewards/evaluator');
const {
  RewardAwardError,
  publicCatalogue,
  buildRewardProgress,
  buildGroupShowcase,
  awardManualReward,
  markRewardsSeen,
} = require('../lib/rewards/progress');

const router = express.Router();

/**
 * Familles sans crochet d'action (visite, découvertes, mesures d'arbres, carnet, photos de
 * comptes rendus, réactions) : évaluées à l'ouverture de « Mes badges » et la nuit.
 */
const PULL_FAMILIES = Object.freeze(['exploration', 'reportage', 'collectif']);

// Module éteint (`ui.modules.rewards_enabled`) : tout le routeur répond 503 (badge manuel
// compris). Les badges automatiques continuent d'être attribués en silence et apparaissent
// tous au rallumage.
router.use(requireModuleEnabled('foret', 'rewards', 'Récompenses désactivées'));

function selfId(req) {
  return String(req.auth?.userId || '').trim();
}

/** Personnel qui voit les inscriptions des élèves de ce périmètre ? */
async function canSeeStudentRewards(auth, studentId) {
  if (!canReadAllAssignments(auth)) return false;
  return canAccessStudentId(auth, studentId);
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = selfId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    try {
      await evaluateUser(userId, { families: PULL_FAMILIES, source: { type: 'open' } });
    } catch (err) {
      // Lecture d'abord : une panne d'évaluation n'empêche pas d'afficher les badges.
      logger.error({ err, userId }, 'rewards_open_evaluation_failed');
    }
    const { rewards, progress } = await buildRewardProgress(userId);
    return res.json({ rewards, progress, ...publicCatalogue() });
  }),
);

router.post(
  '/me/seen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = selfId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    return res.json({ seen: await markRewardsSeen(userId) });
  }),
);

router.get(
  '/students/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const studentId = String(req.params.id || '').trim();
    if (!(await canSeeStudentRewards(req.auth, studentId))) {
      return res.status(403).json({ error: 'Élève hors de votre périmètre' });
    }
    const { rewards, progress } = await buildRewardProgress(studentId);
    return res.json({ studentId, rewards, progress, ...publicCatalogue() });
  }),
);

router.get(
  '/groups/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canReadAllAssignments(req.auth)) {
      return res.status(403).json({ error: 'Accès réservé au personnel' });
    }
    const groupId = String(req.params.id || '').trim();
    const group = await queryOne('SELECT id, name FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const scope = await getScopedStudentIds(req.auth, { groupId });
    if (scope.unauthorizedGroup) {
      return res.status(403).json({ error: 'Groupe hors de votre périmètre' });
    }
    const showcase = await buildGroupShowcase(scope.studentIds);
    return res.json({
      group: { id: group.id, name: group.name },
      ...showcase,
      families: publicCatalogue().families,
    });
  }),
);

router.post(
  '/award',
  requirePermission('rewards.award'),
  asyncHandler(async (req, res) => {
    const studentId = String(req.body?.studentId || '').trim();
    if (!studentId) return res.status(400).json({ error: 'Élève requis' });
    if (!(await canAccessStudentId(req.auth, studentId))) {
      return res.status(403).json({ error: 'Élève hors de votre périmètre' });
    }
    try {
      const reward = await awardManualReward({
        studentId,
        type: req.body?.type,
        note: req.body?.note,
        awardedBy: selfId(req) || null,
        req,
      });
      await announceRewards(studentId, [reward]);
      return res.status(201).json({ reward });
    } catch (err) {
      if (err instanceof RewardAwardError)
        return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }),
);

module.exports = router;
