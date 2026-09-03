'use strict';

/**
 * Journal d'audit et journal de sécurité — module de bibliothèque (lot 1 du plan de
 * convergence, `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2).
 *
 * Historiquement, `logAudit` et `logSecurityEvent` étaient exportés par le ROUTEUR
 * `routes/audit.js`, importé comme tel par dix-huit fichiers dont deux routes G&L : un
 * couplage route → route qui rendait le journal impossible à appeler depuis `lib/` sans
 * tirer Express, les permissions et zod. Le routeur ré-exporte désormais ces fonctions
 * pour compatibilité, mais leur maison est ici.
 *
 * Deux tables, une seule fonction d'entrée : `logAudit` écrit dans `audit_log` puis
 * duplique l'événement dans `security_events` (`logSecurityEvent`), pour que les deux
 * journaux ne divergent jamais. Ni l'une ni l'autre ne lève : un échec d'écriture est
 * journalisé (Pino) et n'interrompt pas l'action métier appelante.
 */

const { queryOne, execute } = require('../database');
const { nowIsoUtc } = require('./shared/isoTimestamp');
const { ensureCanonicalUserByAuth, resolveActorFromReq } = require('./identity');
const logger = require('./logger');

/**
 * Identifiant canonique (table `users`) de l'acteur, résolu depuis son couple
 * type/identifiant historique. Un acteur sans entrée `users` (compte G&L autonome,
 * cf. `docs/USERS_MIGRATION.md`) est créé à la volée par `ensureCanonicalUserByAuth`
 * quand c'est possible, sinon `null`.
 */
async function resolveCanonicalActorId(actorUserType, actorUserId) {
  if (!actorUserType || !actorUserId) return null;
  const existing = await queryOne('SELECT id FROM users WHERE user_type = ? AND id = ? LIMIT 1', [
    actorUserType,
    actorUserId,
  ]);
  if (existing?.id) return existing.id;
  const fromAuth = await ensureCanonicalUserByAuth({
    userType: actorUserType,
    userId: actorUserId,
  });
  return fromAuth || null;
}

/**
 * Événement de sécurité (connexion, refus, changement de droits…).
 * @param {string} action
 * @param {{ req?: object, actorUserType?: string, actorUserId?: string, actorUserCanonicalId?: string,
 *   targetType?: string, targetId?: string, result?: string, reason?: string, payload?: object }} [options]
 */
async function logSecurityEvent(action, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorUserId || null;
    const actorUserId =
      options.actorUserCanonicalId ||
      (await resolveCanonicalActorId(actorUserType, actorLegacyUserId));
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      // `occurred_at` est en heure LOCALE serveur depuis l'origine de la table, et rien ne
      // permet de recaler l'historique a posteriori (pas de second horodatage de référence,
      // contrairement à `audit_log.created_at`). On garde donc NOW() : une colonne
      // homogène en local vaut mieux qu'une discontinuité de fuseau au milieu du journal.
      // Voir docs/AUDIT_BDD_2026-08.md §4.4.
      `INSERT INTO security_events
        (occurred_at, actor_user_id, actor_user_type, action, target_type, target_id, result, reason, ip_address, user_agent, payload_json)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorUserId,
        actorUserType,
        action,
        options.targetType || null,
        options.targetId || null,
        options.result || 'success',
        options.reason || null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null,
        payload,
      ],
    );
  } catch (err) {
    // Ne pas bloquer la route appelante — mais ne pas se taire non plus : c'est par ce
    // silence que les deux journaux pouvaient diverger sans que personne ne le sache.
    logger.warn({ err, action }, 'Écriture security_events en échec');
  }
}

/**
 * Enregistre une action dans l'audit log (et la duplique dans le journal de sécurité).
 * @param {string} action
 * @param {string} targetType
 * @param {string|number|null} targetId
 * @param {string|null} details
 * @param {{ req?: object, actorUserType?: string, actorUserId?: string, actorUserCanonicalId?: string,
 *   result?: string, reason?: string, payload?: object }} [options]
 */
async function logAudit(action, targetType, targetId, details, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorUserId || null;
    const actorUserId =
      options.actorUserCanonicalId ||
      (await resolveCanonicalActorId(actorUserType, actorLegacyUserId));
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      // `occurred_at` en UTC_TIMESTAMP() et non NOW() : la colonne décrit le MÊME instant
      // que `created_at`, qui est de l'ISO-8601 UTC. Avec NOW() les deux divergeaient de
      // l'offset Europe/Paris (+1 h ou +2 h selon la saison) sur toutes les lignes.
      // La migration 188 a recalé l'historique depuis `created_at`, qui fait foi.
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [
        action,
        targetType,
        targetId || null,
        details || null,
        actorUserType,
        actorUserId,
        options.result || 'success',
        nowIsoUtc(),
        payload,
      ],
    );
    await logSecurityEvent(action, {
      req,
      actorUserType,
      actorUserCanonicalId: actorUserId,
      targetType,
      targetId,
      result: options.result || 'success',
      reason: options.reason || null,
      payload: options.payload || null,
    });
  } catch (err) {
    // Ne pas bloquer l'action principale si l'audit échoue — mais laisser une trace.
    logger.warn({ err, action }, 'Écriture audit_log en échec');
  }
}

module.exports = { logAudit, logSecurityEvent, resolveCanonicalActorId };
