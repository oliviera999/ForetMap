/** Profils de gameplay GL — combinaisons de toggles `gameplay.*` (pas les modules). */

export const GAMEPLAY_PRESETS = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'MJ déplace les mascottes ; pas de tour, narration ni actions joueurs.',
    settings: {
      'gameplay.turns_enabled': false,
      'gameplay.narration_enabled': false,
      'gameplay.player_actions_enabled': false,
      'gameplay.scoring_enabled': false,
      'gameplay.qcm_mj_only': false,
      'gameplay.spell_cast_mj_only': false,
    },
  },
  {
    id: 'mj_turns',
    label: 'MJ + tours',
    description: 'Alternance des équipes et narration ; joueurs spectateurs (QCM et sorts réservés au MJ).',
    settings: {
      'gameplay.turns_enabled': true,
      'gameplay.narration_enabled': true,
      'gameplay.player_actions_enabled': false,
      'gameplay.scoring_enabled': false,
      'gameplay.qcm_mj_only': true,
      'gameplay.spell_cast_mj_only': true,
    },
  },
  {
    id: 'mj_turns_interactive',
    label: 'MJ + tours interactif',
    description: 'Tours actifs ; l’équipe du tour répond aux QCM quand le MJ la déplace sur un repère.',
    settings: {
      'gameplay.turns_enabled': true,
      'gameplay.narration_enabled': true,
      'gameplay.player_actions_enabled': false,
      'gameplay.scoring_enabled': false,
      'gameplay.qcm_mj_only': false,
      'gameplay.spell_cast_mj_only': false,
    },
  },
  {
    id: 'collaborative_turns',
    label: 'Complet avec tours',
    description: 'Rotation des équipes ; propositions d’action joueurs et score activés.',
    settings: {
      'gameplay.turns_enabled': true,
      'gameplay.narration_enabled': true,
      'gameplay.player_actions_enabled': true,
      'gameplay.scoring_enabled': true,
      'gameplay.qcm_mj_only': false,
      'gameplay.spell_cast_mj_only': false,
    },
  },
  {
    id: 'collaborative_free',
    label: 'Complet libre',
    description: 'Pas de tour imposé ; toutes les équipes peuvent proposer des actions en parallèle.',
    settings: {
      'gameplay.turns_enabled': false,
      'gameplay.narration_enabled': false,
      'gameplay.player_actions_enabled': true,
      'gameplay.scoring_enabled': true,
      'gameplay.qcm_mj_only': false,
      'gameplay.spell_cast_mj_only': false,
    },
  },
];
