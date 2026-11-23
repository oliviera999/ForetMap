'use strict';

/**
 * Empreinte de version d'une question du quiz ForetMap (migration `quiz_attempt_choice`).
 *
 * Une répartition des choix n'a de sens que pour un même jeu de choix : si un distracteur est
 * réécrit, les réponses d'avant ne disent plus rien de lui. L'empreinte résume ce qui fait
 * qu'une question « est la même » — l'énoncé, les cinq choix et la bonne réponse — et ignore
 * ce qui ne change pas la question posée (feedbacks, photo, crédits, catégorie, statut).
 *
 * Fonction **pure** : SHA-256 d'une sérialisation JSON stable (textes rognés, lettre en
 * majuscule), tronqué à 12 caractères hexadécimaux (48 bits : aucune collision réaliste entre
 * les versions d'une même question).
 *
 * L'empreinte dépend de la bonne réponse : elle ne doit **jamais** partir en clair dans le
 * jeton de présentation (signé, pas chiffré) — l'élève, qui voit l'énoncé et les choix, la
 * calculerait pour A à E et lirait la bonne lettre. Le jeton n'en porte qu'un HMAC
 * (`fingerprintClaim`), vérifié à la réponse.
 */

const crypto = require('crypto');

const FINGERPRINT_LENGTH = 12;
const FINGERPRINT_CHOICE_KEYS = ['choix_a', 'choix_b', 'choix_c', 'choix_d', 'choix_e'];
const FINGERPRINT_PATTERN = /^[0-9a-f]{12}$/;

function cleanText(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * @param {{ question?: string, choix_a?: string, choix_b?: string, choix_c?: string,
 *   choix_d?: string, choix_e?: string, reponse_correcte?: string }} questionRow
 * @returns {string} 12 caractères hexadécimaux
 */
function computeQuestionFingerprint(questionRow) {
  const row = questionRow || {};
  const payload = JSON.stringify([
    cleanText(row.question),
    ...FINGERPRINT_CHOICE_KEYS.map((key) => cleanText(row[key])),
    cleanText(row.reponse_correcte).toUpperCase(),
  ]);
  return crypto
    .createHash('sha256')
    .update(payload, 'utf8')
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

/** Vrai pour une empreinte bien formée (12 hex minuscules). */
function isQuestionFingerprint(value) {
  return typeof value === 'string' && FINGERPRINT_PATTERN.test(value);
}

/**
 * Revendication `qfp` du jeton : HMAC de l'empreinte, lié à la présentation (`jti`). Elle ne
 * révèle rien (pas de secret, pas d'inversion) ; à la réponse, le serveur recalcule
 * l'empreinte de la question courante et vérifie qu'elle est celle de la présentation.
 *
 * @param {{ secret: string, jti: string, fingerprint: string }} input
 * @returns {string} 24 caractères hexadécimaux
 */
function fingerprintClaim({ secret, jti, fingerprint }) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(`fm_quiz_qfp|${String(jti)}|${String(fingerprint)}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Empreinte retenue pour une tentative : celle de la question courante si elle est bien celle
 * qui a été présentée (HMAC concordant), sinon `null` (question modifiée entre la présentation
 * et la réponse, ou jeton sans revendication).
 *
 * @param {{ secret: string, jti: string, claim: unknown, questionRow: object }} input
 * @returns {string|null}
 */
function resolvePresentedFingerprint({ secret, jti, claim, questionRow }) {
  if (typeof claim !== 'string' || !claim || !jti || !secret) return null;
  const current = computeQuestionFingerprint(questionRow);
  const expected = fingerprintClaim({ secret, jti, fingerprint: current });
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(claim, 'utf8');
  if (left.length !== right.length) return null;
  return crypto.timingSafeEqual(left, right) ? current : null;
}

module.exports = {
  FINGERPRINT_LENGTH,
  FINGERPRINT_CHOICE_KEYS,
  computeQuestionFingerprint,
  isQuestionFingerprint,
  fingerprintClaim,
  resolvePresentedFingerprint,
};
