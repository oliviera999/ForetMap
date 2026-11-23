/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/pedagoStepActions.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — **actions d'étape d'une séance pédagogique**
 * (`pedago_sessions.steps_json`, champ `action.type` de chaque étape). Voir `enumCore.js`.
 *
 * Source unique : la validation serveur (`lib/pedagoSessions.js`), l'exécution et l'éditeur
 * côté client (`usePedagoSession`, `SessionStepEditor`), le schéma de l'outil MCP
 * `foretmap_pedago_sessions` et les tests lisent cette liste. Aucune de ces valeurs ne
 * s'écrit en littéral ailleurs (`tests/pedago-step-actions-literals.test.js`).
 *
 * Les étapes sont rangées en JSON : aucune colonne SQL ne porte ces valeurs (`columns` vide),
 * ajouter une action ne demande donc pas de migration.
 *
 * Miroir CJS : `lib/shared/pedagoStepActions.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Noms symboliques des actions : à utiliser à la place des littéraux. */
const PEDAGO_STEP_ACTION = Object.freeze({
  MESSAGE: 'message',
  OPEN_ID_KEY: 'open_id_key',
  OPEN_PLANT: 'open_plant',
  OPEN_FOODWEB: 'open_foodweb',
  OPEN_QUIZ: 'open_quiz',
  OPEN_GLOSSARY: 'open_glossary',
  OPEN_INDIVIDUAL: 'open_individual',
  OPEN_NESTED_GROUPS: 'open_nested_groups',
  OPEN_MAP_ROUTE: 'open_map_route',
  // Fresque du Climat (cartes + flèches) : `deckId` facultatif (jeu unique aujourd'hui).
  OPEN_FRESQUE: 'open_fresque',
  // Tutoriel affiché par-dessus la séance : `tutorialId` (ou `tutorialSlug` à l'écriture).
  OPEN_TUTORIAL: 'open_tutorial',
});

/** Actions d'étape, dans l'ordre du menu « Outil ouvert » de l'éditeur. */
const PEDAGO_STEP_ACTION_ENUM = defineEnum('PEDAGO_STEP_ACTION_ENUM', {
  values: Object.values(PEDAGO_STEP_ACTION),
  labels: {
    [PEDAGO_STEP_ACTION.MESSAGE]: 'Consigne (texte seul)',
    [PEDAGO_STEP_ACTION.OPEN_ID_KEY]: 'Clé d’identification',
    [PEDAGO_STEP_ACTION.OPEN_PLANT]: 'Fiche espèce',
    [PEDAGO_STEP_ACTION.OPEN_FOODWEB]: 'Réseau trophique',
    [PEDAGO_STEP_ACTION.OPEN_QUIZ]: 'Mini-quiz',
    [PEDAGO_STEP_ACTION.OPEN_GLOSSARY]: 'Terme du glossaire',
    [PEDAGO_STEP_ACTION.OPEN_INDIVIDUAL]: 'Arbre suivi',
    [PEDAGO_STEP_ACTION.OPEN_NESTED_GROUPS]: 'Boîtes emboîtées',
    [PEDAGO_STEP_ACTION.OPEN_MAP_ROUTE]: 'Parcours sur la carte',
    [PEDAGO_STEP_ACTION.OPEN_FRESQUE]: 'Fresque du Climat (cartes et flèches)',
    [PEDAGO_STEP_ACTION.OPEN_TUTORIAL]: 'Tutoriel',
  },
  columns: [],
});

/**
 * Champs du `payload` propres à chaque action (documentation du schéma MCP et de l'API).
 * Une action absente n'attend aucun champ.
 */
const PEDAGO_STEP_ACTION_PAYLOAD_FIELDS = Object.freeze({
  [PEDAGO_STEP_ACTION.OPEN_ID_KEY]: Object.freeze(['keyIdOrSlug']),
  [PEDAGO_STEP_ACTION.OPEN_PLANT]: Object.freeze(['plantId']),
  [PEDAGO_STEP_ACTION.OPEN_FOODWEB]: Object.freeze([
    'mapId',
    'highlightPlantId',
    'plantIds',
    'preset',
  ]),
  [PEDAGO_STEP_ACTION.OPEN_QUIZ]: Object.freeze(['questionCode', 'notionId', 'notionNiveau']),
  [PEDAGO_STEP_ACTION.OPEN_GLOSSARY]: Object.freeze(['termCode']),
  [PEDAGO_STEP_ACTION.OPEN_INDIVIDUAL]: Object.freeze(['individualId', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_NESTED_GROUPS]: Object.freeze(['plantIds', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_MAP_ROUTE]: Object.freeze(['routeSlug', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_FRESQUE]: Object.freeze(['deckId']),
  [PEDAGO_STEP_ACTION.OPEN_TUTORIAL]: Object.freeze(['tutorialId', 'tutorialSlug']),
});

/** Vrai si `type` est une action d'étape connue. */
function isPedagoStepAction(type) {
  return PEDAGO_STEP_ACTION_ENUM.values.includes(type);
}

/**
 * Nombre maximal d'espèces montrées par une étape « réseau trophique » (`plantIds`, chantier
 * collège, flux C3). Au-delà, le sous-réseau ne se lit plus d'un coup d'œil.
 */
const FOODWEB_STEP_MAX_PLANT_IDS = 12;

/**
 * Cadrages qu'une étape « réseau trophique » peut imposer (`preset`, chantier collège du
 * 22/11/2026, lot 3) : mêmes clés que `GRAPH_PRESETS` du graphe (`foodWebGraphModel.js`, parité
 * testée) — réseau alimentaire, autres relations, tout.
 */
const FOODWEB_STEP_PRESETS = Object.freeze(['alimentaire', 'relations', 'all']);

/**
 * Validation du `payload` propre à une action d'étape, partagée par le serveur
 * (`lib/pedagoSessions.js`), l'éditeur et l'outil MCP. Seuls les champs qui ont une règle sont
 * contrôlés ; les autres passent tels quels (comportement historique).
 *
 * Réseau trophique : `plantIds` (facultatif) est une liste d'identifiants d'espèces (entiers
 * > 0, sans doublon, au plus `FOODWEB_STEP_MAX_PLANT_IDS`). L'élève voit ces espèces et leurs
 * liens mutuels (profondeur 0), en plus de `highlightPlantId`, qui garde sa forme. Une liste
 * vide est retirée : la forme d'une étape sans `plantIds` ne change pas. `preset` (facultatif)
 * impose le cadrage à l'ouverture (`FOODWEB_STEP_PRESETS`) ; vide, il est retiré ; inconnu, refusé.
 *
 * @param {string} type
 * @param {object} payload
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function validateStepActionPayload(type, payload) {
  const out =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  if (type !== PEDAGO_STEP_ACTION.OPEN_FOODWEB) return { ok: true, payload: out };
  if (out.preset != null) {
    const preset = String(out.preset).trim();
    if (!preset) delete out.preset;
    else if (!FOODWEB_STEP_PRESETS.includes(preset)) {
      return {
        ok: false,
        error: `preset : cadrage inconnu (${preset}) — attendu : ${FOODWEB_STEP_PRESETS.join(', ')}`,
      };
    } else out.preset = preset;
  }
  if (out.plantIds == null) return { ok: true, payload: out };
  if (!Array.isArray(out.plantIds)) {
    return { ok: false, error: 'plantIds doit être une liste d’identifiants d’espèces' };
  }
  const ids = [];
  for (const raw of out.plantIds) {
    const id = Number(raw);
    if (raw === '' || raw == null || !Number.isInteger(id) || id <= 0) {
      return { ok: false, error: `plantIds : identifiant d’espèce invalide (${String(raw)})` };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > FOODWEB_STEP_MAX_PLANT_IDS) {
    return {
      ok: false,
      error: `plantIds : au plus ${FOODWEB_STEP_MAX_PLANT_IDS} espèces par étape`,
    };
  }
  if (ids.length === 0) delete out.plantIds;
  else out.plantIds = ids;
  return { ok: true, payload: out };
}

module.exports = {
  PEDAGO_STEP_ACTION,
  PEDAGO_STEP_ACTION_ENUM,
  PEDAGO_STEP_ACTION_PAYLOAD_FIELDS,
  isPedagoStepAction,
  FOODWEB_STEP_MAX_PLANT_IDS,
  FOODWEB_STEP_PRESETS,
  validateStepActionPayload,
};
