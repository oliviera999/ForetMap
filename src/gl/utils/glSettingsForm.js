/**
 * Logique pure de la vue des réglages plateforme GL (`GLSettingsView`).
 * Constantes de toggles/options + helpers de normalisation et validation,
 * sans dépendance React. Couverts par `tests-ui/gl/glSettingsForm.test.js`.
 */

/** Repères visibles par défaut si le réglage plateforme est absent. */
export function readPlateauMarkersVisibleSetting(settings) {
  const value = settings?.['gameplay.plateau_markers_visible'];
  if (value == null) return true;
  return value === true || value === 'true';
}

/** Toggles d'affichage repères / zones feuillets sur la carte en partie. */
export const MAP_DISPLAY_TOGGLES = [
  {
    key: 'gameplay.plateau_markers_visible',
    label: 'Repères visibles sur la carte',
    hint: 'Affiche les repères interactifs sur le plateau en partie (défaut : visible).',
    readChecked: readPlateauMarkersVisibleSetting,
  },
  {
    key: 'gameplay.plateau_zones_visible',
    label: 'Zones feuillets visibles sur la carte',
    hint: 'Affiche les polygones de zones feuillets sur le plateau en partie (défaut : masqué).',
    readChecked: readGameplayFlag,
  },
];

/** Toggles gameplay (modes standard puis complet), avec libellé et aide. */
export const GAMEPLAY_TOGGLES = [
  {
    key: 'gameplay.turns_enabled',
    camel: 'turnsEnabled',
    label: 'Tours de jeu',
    hint: 'Active la rotation des équipes (mode standard).',
  },
  {
    key: 'gameplay.narration_enabled',
    camel: 'narrationEnabled',
    label: 'Narration MJ',
    hint: 'Le MJ peut envoyer un message narratif aux joueurs (mode standard).',
  },
  {
    key: 'gameplay.player_actions_enabled',
    camel: 'playerActionsEnabled',
    label: 'Actions joueurs',
    hint: 'Les joueurs peuvent proposer une action que le MJ valide (mode complet).',
  },
  {
    key: 'gameplay.scoring_enabled',
    camel: 'scoringEnabled',
    label: 'Score par équipe',
    hint: 'Tableau de score et bonus à la validation des actions (mode complet).',
  },
  {
    key: 'gameplay.vitality_enabled',
    camel: 'vitalityEnabled',
    label: 'Points de vie et de pouvoir',
    hint: 'PV (❤️) et points de pouvoir (💎) persistants par joueur, gérés par le MJ.',
  },
];

/** Drapeaux d'activation des modules GL côté interface. */
export const MODULE_TOGGLES = [
  {
    key: 'modules.mascot_packs_enabled',
    label: 'Studio mascottes',
    hint: 'Affiche la gestion mascottes/packs.',
  },
  {
    key: 'modules.context_comments_enabled',
    label: 'Commentaires contextuels',
    hint: 'Prépare le module commentaires GL.',
  },
  { key: 'modules.forum_enabled', label: 'Forum', hint: 'Prépare le module forum GL.' },
  {
    key: 'modules.notifications_enabled',
    label: 'Notifications',
    hint: 'Prépare le centre de notifications GL.',
  },
  { key: 'modules.tutorials_enabled', label: 'Tutoriels', hint: 'Prépare le module tutoriels GL.' },
  { key: 'modules.help_enabled', label: 'Aide contextuelle', hint: 'Prépare l’onboarding GL.' },
  {
    key: 'modules.intro_enabled',
    label: 'Intro cinématique',
    hint: 'Écran d’introduction avant la connexion (1ère visite + lien « Revoir l’intro »).',
  },
  {
    key: 'modules.journal_enabled',
    label: 'Journal/Histoire',
    hint: 'Affiche l’onglet Histoire et la timeline évènements de partie.',
  },
  {
    key: 'modules.player_journal_enabled',
    label: 'Mon journal (carnet personnel)',
    hint: 'Carnet éditable par chaque joueur (texte, images, encarts).',
  },
  {
    key: 'modules.zone_music_enabled',
    label: 'Musique des zones',
    hint: 'Ambiance sonore par zone sur la carte de jeu (fondus en transition). Les zones se définissent dans Contenus → Chapitres.',
  },
  {
    key: 'modules.market_enabled',
    label: 'Marché',
    hint: 'Échanges de cœurs et gemmes entre joueurs de la classe (nécessite la vitalité).',
  },
  {
    key: 'modules.spell_cast_enabled',
    label: 'Lancement de sortilèges',
    hint: 'Assistant MJ : pool multi-équipes (gemmes/cœurs). Activer aussi la vitalité et « MJ only » pour réserver le lancement au staff.',
  },
  {
    key: 'modules.virtual_dice_enabled',
    label: 'Dés virtuels',
    hint: 'Bouton et lanceur de dés D6 sur la carte de jeu (jusqu’à 5 dés).',
  },
  {
    key: 'modules.lore_carnet_enabled',
    label: 'Carnet de Sélène',
    hint: 'Feuillets narratifs, découverte par zone et onglet carnet.',
  },
  {
    key: 'modules.lore_glossary_enabled',
    label: 'Lexique du lore',
    hint: 'Glossaire narratif distinct du glossaire SVT.',
  },
];

/** Options du mode de contribution au lancement de sortilèges. */
export const SPELL_CAST_CONTRIBUTION_OPTIONS = [
  { value: 'both', label: 'Les deux (soi + répartition équipe avec confirmation)' },
  { value: 'coordinator', label: 'Coordinateur (une personne répartit pour toute l’équipe)' },
  { value: 'self_only', label: 'Chaque joueur saisit uniquement sa contribution' },
];

/** Options de portée d'équipe pour le lancement de sortilèges. */
export const SPELL_CAST_TEAM_SCOPE_OPTIONS = [
  { value: 'any_team', label: 'Toutes les équipes de la partie' },
  { value: 'own_team', label: 'Uniquement son équipe' },
  { value: 'mj_any', label: 'Joueur : son équipe · MJ : toutes les équipes' },
];

/**
 * Lit un drapeau gameplay booléen depuis l'objet `settings` (les valeurs
 * peuvent être un booléen ou la chaîne `'true'`).
 */
export function readGameplayFlag(settings, key) {
  const value = settings?.[key];
  return value === true || value === 'true';
}

/**
 * Lit une valeur de réglage texte de type énumération en retirant les guillemets
 * encadrants éventuels et en appliquant une valeur par défaut.
 */
export function readSelectSetting(settings, key, fallback) {
  return String(settings?.[key] || fallback).replace(/^"|"$/g, '');
}

/**
 * Normalise une valeur de points (PV/PP) lue des réglages en chaîne pour un
 * champ contrôlé : nombre tel quel, sinon `Number(...)` ou repli 3.
 */
export function normalizeInitialPoints(raw) {
  return String(typeof raw === 'number' ? raw : Number(raw) || 3);
}

/**
 * Construit l'état initial du formulaire depuis l'objet `settings` chargé.
 * Renvoie titre/sous-titre (chaînes) et PV/PP initiaux normalisés.
 */
export function settingsToIdentityFields(settings) {
  const next = settings || {};
  return {
    title: String(next['platform.title'] || 'Gnomes & Licornes'),
    subtitle: String(next['platform.subtitle'] || ''),
    defaultHealthPoints: normalizeInitialPoints(next['gameplay.default_health_points']),
    defaultPowerPoints: normalizeInitialPoints(next['gameplay.default_power_points']),
  };
}

/** Valide que les PV/PP initiaux sont des entiers entre 0 et 99. */
export function areVitalityValuesValid(health, power) {
  return (
    Number.isInteger(health) &&
    health >= 0 &&
    health <= 99 &&
    Number.isInteger(power) &&
    power >= 0 &&
    power <= 99
  );
}

/**
 * Calcule les changements gameplay à appliquer pour un profil de séance.
 * Renvoie la liste des `[key, value]` dont la valeur diffère de l'état courant.
 */
export function gameplayPresetChanges(settings, preset) {
  if (!preset?.settings) return [];
  return Object.entries(preset.settings).filter(
    ([key, value]) => readGameplayFlag(settings, key) !== value,
  );
}
