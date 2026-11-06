'use strict';

/**
 * Grimoire v2 « Tenir à deux » — schéma des effets automatiques (`gl_spells.effet_auto_json`)
 * et table de repli `TENIR_SPELL_EFFECTS` (code → objet) appliquée par le chargeur quand le
 * fichier ne porte pas d'objet (le fichier gagne s'il en porte un).
 *
 * Les objets suivent la forme du fichier livré (`data/gl/tenir/sorts.json`) : discriminant
 * `type` (alias `kind` accepté), vocabulaire :
 *   move_delta, reroll, mascotte_danse (farce), heritage, reveler_zone (lanterne),
 *   apercu_cases (boussole), move_delta_cible (bourrasque), fouilles_bonus (grand regard),
 *   reparer_zone (nommer, prof), ignorer_prochaine_case_souffle (sentier), abri,
 *   rejoindre_case_lanceur (relais), cordee, lumiere, file_prof.
 *
 * L'exécution (`applySpellEffectTx`) vit dans `lib/glSpellEffectsApply.js` (étape 4) pour
 * garder ce module pur (chargeur, tests de contenu, CRUD).
 */

const EFFECT_TYPES = Object.freeze([
  'move_delta',
  'reroll',
  'mascotte_danse',
  'heritage',
  'reveler_zone',
  'apercu_cases',
  'move_delta_cible',
  'fouilles_bonus',
  'reparer_zone',
  'ignorer_prochaine_case_souffle',
  'abri',
  'rejoindre_case_lanceur',
  'cordee',
  'lumiere',
  'file_prof',
]);

/** Alias historiques du prompt (`kind`) → types du fichier. */
const KIND_ALIASES = Object.freeze({
  farce: 'mascotte_danse',
  lanterne: 'reveler_zone',
  boussole: 'apercu_cases',
  move_other: 'move_delta_cible',
  fouille_bonus_all: 'fouilles_bonus',
  nommer: 'reparer_zone',
  sentier: 'ignorer_prochaine_case_souffle',
  relais: 'rejoindre_case_lanceur',
});

function effectType(effect) {
  const raw = String(effect?.type ?? effect?.kind ?? '').trim();
  return KIND_ALIASES[raw] || raw;
}

function isInt(v) {
  return Number.isInteger(Number(v));
}

/** Message d'erreur, ou `null` si l'effet est conforme. */
function validateSpellEffect(effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return 'objet attendu';
  const type = effectType(effect);
  if (!EFFECT_TYPES.includes(type)) return `type inconnu : ${type || '(vide)'}`;
  switch (type) {
    case 'move_delta':
      if (!Array.isArray(effect.choix) || !effect.choix.length || !effect.choix.every(isInt)) {
        return 'move_delta : choix[] d’entiers attendu';
      }
      return null;
    case 'move_delta_cible':
      if (!isInt(effect.delta) || Number(effect.delta) === 0)
        return 'move_delta_cible : delta entier non nul';
      return null;
    case 'mascotte_danse':
      if (effect.duree_s != null && !(Number(effect.duree_s) > 0))
        return 'mascotte_danse : duree_s > 0';
      return null;
    case 'heritage':
      if (!isInt(effect.montant) || Number(effect.montant) < 1) return 'heritage : montant ≥ 1';
      return null;
    case 'apercu_cases':
      if (!isInt(effect.n) || Number(effect.n) < 1) return 'apercu_cases : n ≥ 1';
      return null;
    case 'fouilles_bonus':
      if (!isInt(effect.delta) || Number(effect.delta) < 1) return 'fouilles_bonus : delta ≥ 1';
      return null;
    case 'reparer_zone':
      if (effect.bonus && !isInt(effect.bonus.montant))
        return 'reparer_zone : bonus.montant entier';
      return null;
    case 'cordee':
      if (!effect.repartition || typeof effect.repartition !== 'object')
        return 'cordee : repartition attendue';
      return null;
    case 'lumiere':
      if (!Array.isArray(effect.options) || !effect.options.length)
        return 'lumiere : options[] attendues';
      return null;
    default:
      return null;
  }
}

/** Repli par code quand `sorts.json` laisse `effet_auto_json` à `null` pour un sort `auto`. */
const TENIR_SPELL_EFFECTS = Object.freeze({
  SL002: { type: 'move_delta', choix: [-1, 1], appliquer_case: true },
  SL005: { type: 'reroll', annule_precedent: true },
  SL036: { type: 'mascotte_danse', duree_s: 10 },
  SL033: {
    type: 'heritage',
    montant: 2,
    ressource: 'choix',
    application: 'ouverture_chapitre_suivant',
  },
  SL037: {
    type: 'reveler_zone',
    selection: 'plus_proche_du_pion',
    etats_source: ['endormie'],
    etat_cible: 'revelee',
  },
  SL038: { type: 'apercu_cases', n: 6 },
  SL039: {
    type: 'move_delta_cible',
    delta: 3,
    appliquer_case: false,
    consomme_tour: false,
    compte_aide: true,
  },
  SL040: { type: 'fouilles_bonus', delta: 1, portee: 'toutes_equipes', duree: 'tour' },
  SL041: {
    type: 'reparer_zone',
    validation: 'prof',
    vivants_a_nommer: 3,
    bonus: { ressource: 'coeurs', montant: 1, beneficiaires: 'gnomes_equipe' },
  },
  SL042: { type: 'ignorer_prochaine_case_souffle' },
  SL043: {
    type: 'abri',
    garde_fouilles: true,
    pas_de_palissement: true,
    duree: 'tour',
    compte_aide: true,
  },
  SL044: {
    type: 'rejoindre_case_lanceur',
    cible: 'equipe_derniere',
    appliquer_case: false,
    compte_aide: true,
  },
  SL045: {
    type: 'cordee',
    repartition: {
      gnome: { ressource: 'coeurs', montant: 2 },
      unicorn: { ressource: 'gemmes', montant: 2 },
    },
    deplacement: 'meilleur_des_deux_jets',
    immunite_voile: true,
    compte_aide: true,
  },
  SL050: {
    type: 'lumiere',
    options: [{ code: 'voile_recul', delta: -5 }, { code: 'sort_classe_libre' }],
    reglage: 'tenir_lumiere',
  },
});

/** Sorts dont le lancement compte comme « aide » (honneur Passeurs). */
const AIDE_SPELL_CODES = Object.freeze(['SL039', 'SL043', 'SL044', 'SL045']);

function parseEffect(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

module.exports = {
  EFFECT_TYPES,
  KIND_ALIASES,
  TENIR_SPELL_EFFECTS,
  AIDE_SPELL_CODES,
  effectType,
  validateSpellEffect,
  parseEffect,
};
