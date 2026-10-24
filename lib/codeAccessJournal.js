'use strict';

/**
 * Journal des saisies de code des plans (plan public, plan e-nov, plan des personnels).
 *
 * Un code partagé ne dit pas qui entre : le journal dit au moins **quand**, **depuis où** et
 * **avec quel résultat**. Chaque saisie est inscrite au journal de sécurité
 * (`security_events`, lu par `audit.security.read`) avec :
 *
 *   - une action par plan et par issue : `<plan>.access.code_granted` / `.code_refused` ;
 *   - `result` = `success` ou `failure` — un refus n'est jamais inscrit comme une réussite ;
 *   - `reason` pour un refus : `code_invalid` (code faux), `code_missing` (code absent),
 *     `code_disabled` (entrée par code désactivée), `rate_limited` (limiteur d'essais) ;
 *   - l'adresse IP et le navigateur dans leurs colonnes (`req`) ;
 *   - la voie (`via` : `form` pour `POST /access`, `link` pour un `?code=` de lecture) et
 *     l'identifiant de requête.
 *
 * **Jamais le code saisi**, ni sa longueur : un mot de passe tapé dans le mauvais champ, ou
 * un code presque juste, n'a rien à faire dans un journal.
 *
 * Le plan des personnels passe par `logAudit` (journal d'audit **et** journal de sécurité) :
 * ses ouvertures par code y étaient déjà inscrites, et le restent.
 */

const { logAudit, logSecurityEvent } = require('./auditLog');

/** Plans gardés par un code : préfixe d'action, cible, chemins de saisie. */
const CODE_ACCESS_SURFACES = Object.freeze({
  plan: Object.freeze({
    actionPrefix: 'plan.access',
    targetType: 'plan',
    accessPath: '/api/plan/access',
    contentPath: '/api/plan/content',
    audit: false,
  }),
  enov: Object.freeze({
    actionPrefix: 'enov_plan.access',
    targetType: 'enov_plan',
    accessPath: '/api/enov/access',
    contentPath: '/api/enov/content',
    audit: false,
  }),
  staff: Object.freeze({
    actionPrefix: 'staff_plan.access',
    targetType: 'staff_plan',
    accessPath: '/api/staff-plan/access',
    // Le plan des personnels n'ouvre pas sur un lien : pas de `?code=` de lecture.
    contentPath: null,
    audit: true,
  }),
});

/** Motifs de refus inscrits dans `security_events.reason`. */
const CODE_ACCESS_REFUSAL_REASONS = Object.freeze({
  invalid: 'code_invalid',
  missing: 'code_missing',
  disabled: 'code_disabled',
  rateLimited: 'rate_limited',
});

/**
 * Inscrit une saisie de code. Ne lève jamais (le journal ne bloque pas l'accès).
 *
 * @param {object} req requête Express (IP, navigateur, identifiant de requête).
 * @param {'plan'|'enov'|'staff'} surfaceId
 * @param {{ granted: boolean, reason?: string|null, via?: 'form'|'link',
 *   payload?: object }} outcome `payload` : détails sans secret (profil endossé…).
 */
async function logCodeAccessAttempt(req, surfaceId, outcome = {}) {
  const surface = CODE_ACCESS_SURFACES[surfaceId];
  if (!surface) return;
  const granted = Boolean(outcome.granted);
  const action = `${surface.actionPrefix}.${granted ? 'code_granted' : 'code_refused'}`;
  const payload = {
    via: outcome.via || 'form',
    requestId: req?.requestId || null,
    ...(outcome.payload || {}),
  };
  const options = {
    req,
    result: granted ? 'success' : 'failure',
    reason: granted ? null : outcome.reason || CODE_ACCESS_REFUSAL_REASONS.invalid,
    payload,
  };
  if (surface.audit) {
    await logAudit(
      action,
      surface.targetType,
      null,
      granted ? 'Entrée par code' : 'Code refusé',
      options,
    );
    return;
  }
  await logSecurityEvent(action, { ...options, targetType: surface.targetType });
}

/** Chemin normalisé d'une requête (sans requête ni barre finale, en minuscules). */
function requestPath(req) {
  const raw = String(req?.originalUrl || req?.url || '').split('?')[0];
  const trimmed = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return trimmed.toLowerCase();
}

/**
 * Saisie de code visée par la requête, ou `null` : `POST /access` d'un plan, ou lecture d'un
 * plan public portant `?code=`.
 * @returns {{ surfaceId: string, via: 'form'|'link' } | null}
 */
function resolveCodeAccessAttempt(req) {
  const path = requestPath(req);
  for (const [surfaceId, surface] of Object.entries(CODE_ACCESS_SURFACES)) {
    if (path === surface.accessPath) return { surfaceId, via: 'form' };
    if (surface.contentPath && path === surface.contentPath) {
      let code = '';
      try {
        code = String(req?.query?.code || '').trim();
      } catch (_) {
        code = '';
      }
      if (code) return { surfaceId, via: 'link' };
    }
  }
  return null;
}

/**
 * Refus du limiteur d'essais : inscrits **une fois par plan, par adresse et par fenêtre**
 * (15 minutes, celle du limiteur). Au-delà, chaque requête refusée écrirait une ligne — un
 * tâtonnement soutenu remplirait le journal au lieu d'y laisser une trace.
 */
const LIMITER_JOURNAL_WINDOW_MS = 15 * 60 * 1000;
const LIMITER_JOURNAL_MAX_KEYS = 5000;
const limiterJournal = new Map();

function pruneLimiterJournal(now) {
  for (const [key, at] of limiterJournal) {
    if (now - at >= LIMITER_JOURNAL_WINDOW_MS) limiterJournal.delete(key);
  }
  // Borne dure : la mémoire d'un processus ne grossit pas avec le nombre d'adresses.
  while (limiterJournal.size >= LIMITER_JOURNAL_MAX_KEYS) {
    const oldest = limiterJournal.keys().next().value;
    limiterJournal.delete(oldest);
  }
}

/**
 * Appelé par le limiteur strict (`lib/rateLimit.js`) quand il refuse une requête : si c'est
 * une saisie de code, le refus est inscrit (motif `rate_limited`). Sans effet ailleurs —
 * le même limiteur garde les connexions ForetMap et G&L.
 * @returns {Promise<void>|null}
 */
function recordCodeAccessRateLimited(req, { now = Date.now() } = {}) {
  const attempt = resolveCodeAccessAttempt(req);
  if (!attempt) return null;
  const key = `${attempt.surfaceId}|${req?.ip || ''}`;
  const last = limiterJournal.get(key);
  if (last !== undefined && now - last < LIMITER_JOURNAL_WINDOW_MS) return null;
  pruneLimiterJournal(now);
  limiterJournal.set(key, now);
  return logCodeAccessAttempt(req, attempt.surfaceId, {
    granted: false,
    reason: CODE_ACCESS_REFUSAL_REASONS.rateLimited,
    via: attempt.via,
  });
}

/** Tests : oublie les refus du limiteur déjà inscrits. */
function resetCodeAccessLimiterJournal() {
  limiterJournal.clear();
}

module.exports = {
  CODE_ACCESS_SURFACES,
  CODE_ACCESS_REFUSAL_REASONS,
  LIMITER_JOURNAL_WINDOW_MS,
  logCodeAccessAttempt,
  resolveCodeAccessAttempt,
  recordCodeAccessRateLimited,
  resetCodeAccessLimiterJournal,
};
