'use strict';

// =====================================================================
// Sévérité du verrou (`lock_mode`) — lot 2 de docs/AUDIT_VALIDATION_QUIZ_2026-09.md.
//
// Le verrou de re-tentative ne tenait que par la bonne volonté du client : il n'était posé que
// si la réponse arrivait avec le contexte ressource (`resourceType`/`resourceRef` dans le corps),
// et les codes des questions bloquantes sont livrés au lecteur par le challenge. Répondre
// depuis le Quiz libre — ou rejouer la requête sans le contexte — donnait des essais illimités
// dont les bonnes réponses comptaient quand même (constat A4).
//
// Trois sévérités, réglables en cascade site → type de ressource → fiche :
//   advisory : comportement historique, le contexte du corps est honoré ;
//   flow     : le contexte est GRAVÉ dans le jeton à la présentation (`?resourceType=&resourceRef=`)
//              et la réponse ne lit que le jeton — le corps est ignoré ;
//   strict   : en plus, une question bloquante d'une ressource `strict` n'est présentable QUE
//              dans le flux de validation (403 hors contexte) et sort du tirage libre.
// Les bonnes réponses passées comptent toujours (activation rétroactive, F3), et
// l'interrupteur global reste maître : conditionnement éteint = rien de tout ceci.
// =====================================================================

const { getFmGatingSite, FM_MARKABLE, GL_MARKABLE } = require('./learningGatingRuntime');
const { getGlGatingSettings } = require('./glSettings');
const { loadResourcePolicy, loadTypePolicy, loadResourcePolicies } = require('./gatingPolicyLoad');
const { resolveEffectiveGatingPolicy } = require('./shared/gatingPolicyLayersCore');
const {
  normalizeResourceType,
  normalizeResourceRef,
  normalizeQuestionCode,
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');
const { isApprovedGatingLink, getResourceCooldownState } = require('./learningGatingCooldown');
const { buildReaderKey } = require('./shared/learningAckCore');
const { getNamedMemoryTtlCache } = require('./memoryTtlCache');

/** Cache court des codes « réservés » : le tirage libre est appelé à chaque clic. */
const STRICT_CODES_TTL_MS = 30 * 1000;
const strictCodesCache = getNamedMemoryTtlCache('learning-gating:strict-codes', {
  ttlMs: STRICT_CODES_TTL_MS,
  maxEntries: 4,
});

function normalizeProduct(product) {
  return String(product || '').toLowerCase() === 'gl' ? 'gl' : 'fm';
}

function allowedTypes(product) {
  return product === 'gl' ? GL_RESOURCE_TYPES : FORETMAP_RESOURCE_TYPES;
}

function markableTypes(product) {
  return product === 'gl' ? GL_MARKABLE : FM_MARKABLE;
}

async function siteSettings(product) {
  return product === 'gl' ? await getGlGatingSettings() : await getFmGatingSite();
}

/** Politique effective d'une ressource (sans granularité chapitre : seule la sévérité importe). */
async function resolveLockPolicy(db, { product, resourceType, resourceRef }) {
  const p = normalizeProduct(product);
  const settings = await siteSettings(p);
  const perResource = await loadResourcePolicy(db, p, resourceType, resourceRef);
  const typePolicy = await loadTypePolicy(db, p, resourceType);
  return resolveEffectiveGatingPolicy({
    perResource,
    typePolicy,
    site: settings,
    product: p,
    resourceType,
  });
}

/**
 * Contexte ressource demandé à la PRÉSENTATION (`?resourceType=&resourceRef=`).
 * Sans contexte → `{ resource: null }` (Quiz libre). Avec contexte → la ressource doit être d'un
 * type validable et la question un de ses liens bloquants approuvés, sinon 400 : un contexte
 * fantaisiste ne doit pas pouvoir « signer » un jeton pour une fiche qui ne pose pas la question.
 * @returns {Promise<{ resource: {type: string, ref: string}|null, status?: number, error?: string }>}
 */
async function resolvePresentContext(db, { product, query, questionCode }) {
  const p = normalizeProduct(product);
  const rawType = query?.resourceType;
  const rawRef = query?.resourceRef;
  if (rawType == null && rawRef == null) return { resource: null };
  const type = normalizeResourceType(rawType, allowedTypes(p));
  const ref = normalizeResourceRef(rawRef);
  if (!type || !ref || !markableTypes(p).has(type)) {
    return { resource: null, status: 400, error: 'Contexte de ressource invalide' };
  }
  const code = normalizeQuestionCode(questionCode);
  if (!code || !(await isApprovedGatingLink(db, p, type, ref, code))) {
    return {
      resource: null,
      status: 400,
      error: 'Cette question ne conditionne pas cette ressource',
    };
  }
  return { resource: { type, ref } };
}

/**
 * Ressources (approuvées, bloquantes) que cette question conditionne, avec leur sévérité
 * effective. Sert au refus `strict` hors contexte et au message qui l'explique.
 */
async function listStrictResourcesForQuestion(db, { product, questionCode }) {
  const p = normalizeProduct(product);
  const code = normalizeQuestionCode(questionCode);
  if (!code) return [];
  const rows =
    p === 'gl'
      ? await db.queryAll(
          `SELECT resource_type, resource_ref FROM gl_resource_question_links
            WHERE question_code = ? AND status = 'approved' AND is_gating = 1`,
          [code],
        )
      : await db.queryAll(
          `SELECT resource_type, resource_ref FROM resource_question_links
            WHERE question_code = ? AND status = 'approved' AND is_gating = 1`,
          [code],
        );
  const out = [];
  for (const row of rows || []) {
    const type = normalizeResourceType(row.resource_type, allowedTypes(p));
    const ref = normalizeResourceRef(row.resource_ref);
    if (!type || !ref || !markableTypes(p).has(type)) continue;
    const policy = await resolveLockPolicy(db, {
      product: p,
      resourceType: type,
      resourceRef: ref,
    });
    if (policy.enabled && policy.mode !== 'off' && policy.lockMode === 'strict') {
      out.push({ type, ref });
    }
  }
  return out;
}

/**
 * Une présentation SANS contexte est-elle permise ? Refusée (403) si la question est réservée
 * à la validation d'au moins une ressource `strict`. Conditionnement éteint → toujours permise
 * (l'interrupteur global reste maître : `resolveLockPolicy` renvoie alors `enabled = false`).
 * @returns {Promise<{ ok: true } | { ok: false, status: 403, error: string, reserved_for: object[] }>}
 */
async function assertPresentAllowed(db, { product, questionCode, resource }) {
  if (resource) return { ok: true };
  const strictFor = await listStrictResourcesForQuestion(db, { product, questionCode });
  if (strictFor.length === 0) return { ok: true };
  return {
    ok: false,
    status: 403,
    error:
      'Cette question sert à valider une fiche : réponds-y depuis la fiche elle-même ' +
      '(bouton « Marquer comme lu / appris / étudié »).',
    reserved_for: strictFor,
  };
}

/**
 * Contexte retenu à la RÉPONSE : le jeton d'abord ; à défaut, le corps — mais seulement si la
 * sévérité effective de la ressource visée est `advisory` (comportement historique). En `flow`
 * et `strict`, un contexte envoyé dans le corps sans jeton contextualisé est ignoré : la
 * réponse compte comme une réponse libre.
 * @returns {Promise<{ type: string, ref: string }|null>}
 */
async function resolveAnswerContext(db, { product, tokenResource, bodyResource }) {
  if (tokenResource?.type && tokenResource?.ref) {
    return { type: String(tokenResource.type), ref: String(tokenResource.ref) };
  }
  const p = normalizeProduct(product);
  const type = normalizeResourceType(bodyResource?.resourceType, allowedTypes(p));
  const ref = normalizeResourceRef(bodyResource?.resourceRef);
  if (!type || !ref || !markableTypes(p).has(type)) return null;
  const policy = await resolveLockPolicy(db, { product: p, resourceType: type, resourceRef: ref });
  if (!policy.enabled || policy.mode === 'off') return null;
  return policy.lockMode === 'advisory' ? { type, ref } : null;
}

/**
 * Une question verrouillée pour ce lecteur (portée ressource, ou « question seule » — lot 3)
 * ne se présente ni ne se répond dans le flux de validation : sans cela, la portée
 * « question seule » ne bloquait que la validation finale, pas la question elle-même. Hors
 * contexte (Quiz libre), rien n'est refusé : le verrou ne concerne que la validation.
 * @returns {Promise<{ ok: true } | { ok: false, status: 403, error: string, cooldown: object }>}
 */
async function assertQuestionOpen(
  db,
  { product, userId = null, glAuth = null, resource, questionCode },
) {
  if (!resource?.type || !resource?.ref) return { ok: true };
  const p = normalizeProduct(product);
  const code = normalizeQuestionCode(questionCode);
  const reader = p === 'gl' ? buildReaderKey(glAuth) : null;
  if (p === 'gl' ? !reader : !userId) return { ok: true };
  const policy = await resolveLockPolicy(db, {
    product: p,
    resourceType: resource.type,
    resourceRef: resource.ref,
  });
  if (!policy.enabled || policy.mode === 'off') return { ok: true };
  const cooldown = await getResourceCooldownState(db, {
    product: p,
    userId,
    reader,
    resourceType: resource.type,
    resourceRef: resource.ref,
    retryHours: policy.retryCooldownHours,
    questionCode: code,
  });
  if (!cooldown.locked) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: `Cette question est bloquée après une erreur : réessaie dans ${cooldown.remaining_label || 'quelques minutes'}.`,
    cooldown,
  };
}

/**
 * Codes des questions réservées à la validation (au moins une ressource `strict`), pour les
 * exclure du tirage libre. Cache mémoire court ; invalidé par les écritures de politiques et
 * de liens (`invalidateStrictCodesCache`).
 * @returns {Promise<string[]>}
 */
async function listStrictGatingQuestionCodes(db, product) {
  const p = normalizeProduct(product);
  const cached = strictCodesCache.get(p);
  if (cached) return cached;

  const settings = await siteSettings(p);
  if (!settings?.enabled) {
    strictCodesCache.set(p, []);
    return [];
  }
  const rows =
    p === 'gl'
      ? await db.queryAll(
          `SELECT resource_type, resource_ref, question_code FROM gl_resource_question_links
            WHERE status = 'approved' AND is_gating = 1`,
        )
      : await db.queryAll(
          `SELECT resource_type, resource_ref, question_code FROM resource_question_links
            WHERE status = 'approved' AND is_gating = 1`,
        );
  const byType = new Map();
  for (const row of rows || []) {
    const type = normalizeResourceType(row.resource_type, allowedTypes(p));
    const ref = normalizeResourceRef(row.resource_ref);
    const code = normalizeQuestionCode(row.question_code);
    if (!type || !ref || !code || !markableTypes(p).has(type)) continue;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push({ ref, code });
  }
  const strict = new Set();
  for (const [type, links] of byType) {
    const { byRef, typePolicy } = await loadResourcePolicies(
      db,
      p,
      type,
      links.map((l) => l.ref),
    );
    for (const { ref, code } of links) {
      const policy = resolveEffectiveGatingPolicy({
        perResource: byRef.get(ref) || null,
        typePolicy,
        site: settings,
        product: p,
        resourceType: type,
      });
      if (policy.enabled && policy.mode !== 'off' && policy.lockMode === 'strict') strict.add(code);
    }
  }
  const codes = [...strict];
  strictCodesCache.set(p, codes);
  return codes;
}

function invalidateStrictCodesCache() {
  strictCodesCache.delete('fm');
  strictCodesCache.delete('gl');
}

module.exports = {
  STRICT_CODES_TTL_MS,
  resolveLockPolicy,
  resolvePresentContext,
  listStrictResourcesForQuestion,
  assertPresentAllowed,
  resolveAnswerContext,
  assertQuestionOpen,
  listStrictGatingQuestionCodes,
  invalidateStrictCodesCache,
};
