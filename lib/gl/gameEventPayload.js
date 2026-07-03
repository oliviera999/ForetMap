'use strict';

const { normalizeOptionalString, parseId } = require('../shared/httpHelpers');
const { parseNarrationImageUrl } = require('../glJournalPresent');

/** Pourcentage [0,100] arrondi à 2 décimales, sinon null (extrait de routes/gl/games.js). */
function parsePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Number(n.toFixed(2));
}

/**
 * Validation/normalisation du payload de POST /api/gl/games/:id/events (pur, sans DB).
 * Extraction iso-comportement du corps de la route : mêmes contrôles, mêmes messages,
 * même ordre (les contrôles move / narration / score sont exclusifs par eventType).
 * Le contrôle « déplacement libre vs mode repères numérotés » (lecture DB) reste à la route.
 *
 * @param {string} eventType type d'événement normalisé (non vide)
 * @param {object} payload   req.body.payload (déjà défaulté à {})
 * @param {object} settings  snapshot getGameplaySettings()
 * @param {{ teamId?: number|null }} [context]
 * @returns {{ error: { status: number, message: string } } |
 *           { payloadToStore: object,
 *             move: { markerId: number|null, xp: number|null, yp: number|null, hasPctPayload: boolean } }}
 */
function validateEventPayload(eventType, payload, settings, { teamId = null } = {}) {
  const moveXp = parsePct(payload?.xp);
  const moveYp = parsePct(payload?.yp);
  const moveMarkerId = payload?.markerId != null ? parseId(payload.markerId) : null;
  const hasMovePctPayload = payload?.xp != null || payload?.yp != null;

  if (eventType === 'move' && teamId == null) {
    return { error: { status: 400, message: 'teamId requis pour un déplacement' } };
  }
  if (eventType === 'move' && hasMovePctPayload && (moveXp == null || moveYp == null)) {
    return { error: { status: 400, message: 'xp/yp invalides (attendus entre 0 et 100)' } };
  }
  if (eventType === 'move' && moveMarkerId == null && !hasMovePctPayload) {
    return { error: { status: 400, message: 'payload move invalide (markerId ou xp/yp requis)' } };
  }
  if (eventType === 'narration' && !settings.narrationEnabled) {
    return { error: { status: 409, message: 'Narration desactivée dans les réglages' } };
  }
  if (eventType === 'score' && !settings.scoringEnabled) {
    return { error: { status: 409, message: 'Score desactivé dans les réglages' } };
  }

  let payloadToStore = payload;
  if (eventType === 'narration') {
    const text = normalizeOptionalString(payload?.text);
    if (!text) return { error: { status: 400, message: 'Texte de narration requis' } };
    try {
      const imageUrl = parseNarrationImageUrl(payload?.imageUrl);
      payloadToStore = imageUrl ? { text, imageUrl } : { text };
    } catch (err) {
      if (err?.status === 400) {
        return { error: { status: 400, message: err.message || 'URL image invalide' } };
      }
      throw err;
    }
  }

  return {
    payloadToStore,
    move: { markerId: moveMarkerId, xp: moveXp, yp: moveYp, hasPctPayload: hasMovePctPayload },
  };
}

module.exports = { parsePct, validateEventPayload };
