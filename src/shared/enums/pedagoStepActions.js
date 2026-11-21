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

import { defineEnum } from './enumCore.js';

/** Noms symboliques des actions : à utiliser à la place des littéraux. */
export const PEDAGO_STEP_ACTION = Object.freeze({
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
export const PEDAGO_STEP_ACTION_ENUM = defineEnum('PEDAGO_STEP_ACTION_ENUM', {
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
export const PEDAGO_STEP_ACTION_PAYLOAD_FIELDS = Object.freeze({
  [PEDAGO_STEP_ACTION.OPEN_ID_KEY]: Object.freeze(['keyIdOrSlug']),
  [PEDAGO_STEP_ACTION.OPEN_PLANT]: Object.freeze(['plantId']),
  [PEDAGO_STEP_ACTION.OPEN_FOODWEB]: Object.freeze(['mapId', 'highlightPlantId']),
  [PEDAGO_STEP_ACTION.OPEN_QUIZ]: Object.freeze(['questionCode', 'notionId', 'notionNiveau']),
  [PEDAGO_STEP_ACTION.OPEN_GLOSSARY]: Object.freeze(['termCode']),
  [PEDAGO_STEP_ACTION.OPEN_INDIVIDUAL]: Object.freeze(['individualId', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_NESTED_GROUPS]: Object.freeze(['plantIds', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_MAP_ROUTE]: Object.freeze(['routeSlug', 'mapId']),
  [PEDAGO_STEP_ACTION.OPEN_FRESQUE]: Object.freeze(['deckId']),
  [PEDAGO_STEP_ACTION.OPEN_TUTORIAL]: Object.freeze(['tutorialId', 'tutorialSlug']),
});

/** Vrai si `type` est une action d'étape connue. */
export function isPedagoStepAction(type) {
  return PEDAGO_STEP_ACTION_ENUM.values.includes(type);
}
