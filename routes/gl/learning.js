'use strict';

const express = require('express');
const { queryOne, queryAll, execute } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const {
  parseConfirmBody,
  normalizeTargetCode,
  buildReaderKey,
  upsertLearningAck,
  listLearningAcks,
  groupLearningAcksByType,
} = require('../../lib/shared/learningAckCore');

const router = express.Router();

const db = { queryOne, queryAll, execute };

/** GET /api/gl/learning/me — progression du lecteur connecté. */
router.get('/me', requireGlAuth, async (req, res) => {
  const reader = buildReaderKey(req.glAuth);
  if (!reader) return res.status(403).json({ error: 'Profil invalide' });
  const rows = await listLearningAcks(db, reader);
  return res.json(groupLearningAcksByType(rows));
});

async function handleAcknowledge(req, res, { targetType, resolveTarget }) {
  const confirm = parseConfirmBody(req.body);
  if (!confirm.ok) return res.status(400).json({ error: confirm.error });
  const reader = buildReaderKey(req.glAuth);
  if (!reader) return res.status(403).json({ error: 'Profil invalide' });
  const code = normalizeTargetCode(req.params.code ?? req.params.id);
  if (!code) return res.status(400).json({ error: 'Identifiant invalide' });
  const exists = await resolveTarget(code);
  if (!exists) return res.status(404).json({ error: 'Ressource introuvable' });
  await upsertLearningAck(db, reader, targetType, code);
  return res.json({ success: true, target_type: targetType, target_code: code });
}

/** POST /api/gl/learning/species/:code — marquer une espèce comme étudiée. */
router.post('/species/:code', requireGlAuth, async (req, res) => {
  return handleAcknowledge(req, res, {
    targetType: 'species',
    resolveTarget: async (code) => {
      const row = await queryOne(
        "SELECT species_code FROM gl_species WHERE species_code = ? AND statut = 'actif' LIMIT 1",
        [code]
      );
      return !!row;
    },
  });
});

/** POST /api/gl/learning/glossary/:code — marquer un terme de glossaire comme appris. */
router.post('/glossary/:code', requireGlAuth, async (req, res) => {
  return handleAcknowledge(req, res, {
    targetType: 'glossary',
    resolveTarget: async (code) => {
      const row = await queryOne(
        "SELECT glossary_code FROM gl_glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
        [code]
      );
      return !!row;
    },
  });
});

/** POST /api/gl/learning/tutorials/:id — marquer un tutoriel GL comme lu. */
router.post('/tutorials/:id', requireGlAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide' });
  }
  req.params.code = String(id);
  return handleAcknowledge(req, res, {
    targetType: 'tutorial',
    resolveTarget: async (code) => {
      const tid = Number(code);
      if (!Number.isFinite(tid) || tid <= 0) return false;
      const row = await queryOne('SELECT id FROM gl_tutorials WHERE id = ? LIMIT 1', [tid]);
      return !!row;
    },
  });
});

module.exports = router;
