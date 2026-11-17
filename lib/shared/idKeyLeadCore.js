/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/idKeyLeadCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Issue d'une proposition de clé d'identification — noyau pur partagé serveur / client
 * (migration 366). Miroir CJS : `lib/shared/idKeyLeadCore.js` (généré par
 * `npm run sync:shared-cores`, ne pas éditer le miroir).
 *
 * Une proposition (`id_key_leads`) a exactement une issue :
 *   - `couplet` : couplet suivant (`next_couplet_id`) ;
 *   - `espece`  : une espèce (`plant_id`) ;
 *   - `groupe`  : des espèces candidates (`group_plant_ids`, table `id_key_lead_plants`),
 *                 nommées par `result_label` (clade de rattachement facultatif) ;
 *   - `clade`   : un grand groupe de la classification (`clade_id`).
 * Une feuille (espece, groupe, clade) peut proposer « Pour aller plus loin » une autre clé
 * (`next_key_id`).
 *
 * Les lignes écrites avant la migration 366 n'ont pas toujours une colonne `outcome` fiable
 * (valeur par défaut `couplet`) : l'issue se déduit alors des colonnes renseignées.
 */

const { ID_KEY_LEAD_OUTCOME_ENUM } = require('./pedagoEnums');

const ID_KEY_LEAD_OUTCOMES = ID_KEY_LEAD_OUTCOME_ENUM.values;

/** Issues qui terminent la lecture (écran d'arrivée). */
const TERMINAL_OUTCOMES = Object.freeze(['espece', 'groupe', 'clade']);

function present(value) {
  return value != null && value !== '';
}

function toId(value) {
  if (!present(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toText(value) {
  if (!present(value)) return null;
  const s = String(value).trim();
  return s || null;
}

/** Identifiants des espèces candidates, quelle que soit la forme reçue. */
function groupPlantIdsOf(lead) {
  const raw = Array.isArray(lead?.group_plant_ids)
    ? lead.group_plant_ids
    : Array.isArray(lead?.groupPlantIds)
      ? lead.groupPlantIds
      : Array.isArray(lead?.group_plants)
        ? lead.group_plants.map((p) => (p && typeof p === 'object' ? p.id : p))
        : [];
  const out = [];
  for (const v of raw) {
    const id = toId(v);
    if (id != null && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Issue effective d'une proposition : la colonne `outcome` quand elle est cohérente avec
 * les autres colonnes, sinon déduite (`next_couplet_id` → couplet, `plant_id` → espece).
 * @returns {'couplet'|'espece'|'groupe'|'clade'|null}
 */
function resolveLeadOutcome(lead) {
  const declared = toText(lead?.outcome);
  const hasNext = present(lead?.next_couplet_id ?? lead?.nextCoupletId);
  const hasPlant = present(lead?.plant_id ?? lead?.plantId);
  if (declared === 'groupe' || declared === 'clade') return declared;
  if (declared === 'espece' && hasPlant) return 'espece';
  if (declared === 'couplet' && hasNext) return 'couplet';
  if (hasNext && !hasPlant) return 'couplet';
  if (hasPlant && !hasNext) return 'espece';
  if (!hasNext && !hasPlant) {
    // Ni couplet ni espèce : on déduit la feuille de ses propres champs.
    if (present(lead?.clade_id ?? lead?.cladeId)) return 'clade';
    if (groupPlantIdsOf(lead).length > 0 || present(lead?.result_label ?? lead?.resultLabel)) {
      return 'groupe';
    }
    if (declared && ID_KEY_LEAD_OUTCOMES.includes(declared)) return declared;
  }
  return null;
}

/** Forme normalisée d'une proposition (champs d'issue seulement). */
function normalizeLeadOutcomeFields(lead) {
  const outcome = resolveLeadOutcome(lead);
  return {
    outcome,
    next_couplet_id: toId(lead?.next_couplet_id ?? lead?.nextCoupletId),
    plant_id: toId(lead?.plant_id ?? lead?.plantId),
    clade_id: toText(lead?.clade_id ?? lead?.cladeId),
    result_label: toText(lead?.result_label ?? lead?.resultLabel),
    next_key_id: toId(lead?.next_key_id ?? lead?.nextKeyId),
    group_plant_ids: groupPlantIdsOf(lead),
  };
}

/**
 * Règles de forme d'une proposition, sans accès à la base.
 * @param {object} lead
 * @param {{ keyId?: number|null }} [opts] — clé de la proposition (refus d'un renvoi vers elle-même)
 * @returns {{ ok: true, fields: object } | { ok: false, error: string }}
 */
function validateLeadShape(lead, { keyId = null } = {}) {
  const f = normalizeLeadOutcomeFields(lead);
  if (!f.outcome) {
    return {
      ok: false,
      error:
        'Chaque proposition doit mener à une seule issue : un couplet suivant, une espèce, un groupe d’espèces ou un grand groupe',
    };
  }
  if (f.outcome === 'couplet') {
    if (f.next_couplet_id == null) return { ok: false, error: 'Couplet suivant manquant' };
    if (f.plant_id != null || f.clade_id || f.result_label || f.group_plant_ids.length) {
      return {
        ok: false,
        error: 'Une proposition qui mène à un couplet ne désigne ni espèce ni groupe',
      };
    }
    if (f.next_key_id != null) {
      return {
        ok: false,
        error: '« Pour aller plus loin » n’existe que sur un résultat, pas vers un couplet',
      };
    }
  } else {
    if (f.next_couplet_id != null) {
      return {
        ok: false,
        error: 'Un résultat (espèce, groupe ou grand groupe) ne mène pas à un couplet',
      };
    }
    if (f.outcome === 'espece') {
      if (f.plant_id == null) return { ok: false, error: 'Espèce manquante' };
      // Contrainte `chk_idkey_lead_outcome` (migration 366) : ni grand groupe ni nom de groupe.
      if (f.clade_id || f.result_label || f.group_plant_ids.length) {
        return {
          ok: false,
          error: 'Une proposition qui mène à une espèce ne désigne ni groupe ni grand groupe',
        };
      }
    }
    if (f.outcome === 'groupe') {
      if (!f.result_label) return { ok: false, error: 'Nom du groupe d’espèces manquant' };
      if (f.group_plant_ids.length === 0) {
        return { ok: false, error: 'Un groupe doit proposer au moins une espèce candidate' };
      }
      if (f.plant_id != null) {
        return {
          ok: false,
          error: 'Un groupe désigne ses espèces candidates, pas une espèce unique',
        };
      }
    }
    if (f.outcome === 'clade') {
      if (!f.clade_id) return { ok: false, error: 'Grand groupe (clade) manquant' };
      if (f.plant_id != null || f.group_plant_ids.length) {
        return { ok: false, error: 'Un grand groupe ne désigne pas d’espèce' };
      }
      if (f.result_label) {
        return {
          ok: false,
          error: 'Un nom de groupe n’existe que sur un groupe d’espèces, pas sur un grand groupe',
        };
      }
    }
    if (f.next_key_id != null && keyId != null && Number(f.next_key_id) === Number(keyId)) {
      return { ok: false, error: '« Pour aller plus loin » ne peut pas renvoyer à la même clé' };
    }
  }
  return { ok: true, fields: f };
}

/**
 * Une proposition est-elle praticable par un élève (issue complète) ?
 * @param {object} lead
 * @param {Set<number>} [coupletIds] — couplets de la clé (un renvoi vers un couplet absent est inerte)
 */
function isLeadPracticable(lead, coupletIds) {
  const outcome = resolveLeadOutcome(lead);
  if (outcome === 'couplet') {
    const next = toId(lead?.next_couplet_id ?? lead?.nextCoupletId);
    return coupletIds ? coupletIds.has(next) : next != null;
  }
  if (outcome === 'espece') return toId(lead?.plant_id ?? lead?.plantId) != null;
  if (outcome === 'groupe') {
    return Boolean(toText(lead?.result_label)) && groupPlantIdsOf(lead).length > 0;
  }
  if (outcome === 'clade') return Boolean(toText(lead?.clade_id) || lead?.clade?.id);
  return false;
}

module.exports = {
  ID_KEY_LEAD_OUTCOMES,
  TERMINAL_OUTCOMES,
  groupPlantIdsOf,
  resolveLeadOutcome,
  normalizeLeadOutcomeFields,
  validateLeadShape,
  isLeadPracticable,
};
