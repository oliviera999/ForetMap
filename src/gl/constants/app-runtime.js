export const GL_TAB_STORAGE_KEY = 'gl_active_tab';

/** Onglets épinglés sur la barre mobile (bottom-nav + raccourcis desktop compacts). */
export const GL_MOBILE_PRIMARY_TAB_IDS = ['maps', 'nature', 'monde-gl'];

/** Sous-onglets regroupés dans « La nature ». */
export const GL_NATURE_SUB_TABS = [
  { id: 'ecosystemes', label: 'Écosystèmes', icon: '🌿' },
  { id: 'biodiversite', label: 'Biodiversité', icon: '🦋' },
  { id: 'glossary', label: 'Glossaire', icon: '📚' },
];

export const GL_NATURE_SUB_TAB_IDS = GL_NATURE_SUB_TABS.map((tab) => tab.id);

export const GL_NATURE_TAB = { id: 'nature', label: 'La nature', icon: '🌳' };

/** Sous-onglets regroupés dans « L'aventure » (`module` = clé `modules.*` requise). */
export const GL_ADVENTURE_SUB_TABS = [
  { id: 'history', label: 'Histoire', icon: '📜', module: 'journalEnabled' },
  { id: 'selene-carnet', label: 'Carnet Sélène', icon: '📒', module: 'loreCarnetEnabled' },
  { id: 'spells', label: 'Sortilèges', icon: '✨' },
];

export const GL_ADVENTURE_SUB_TAB_IDS = GL_ADVENTURE_SUB_TABS.map((tab) => tab.id);

export const GL_ADVENTURE_TAB = { id: 'adventure', label: "L'aventure", icon: '🗡️' };

/** Sous-onglets regroupés dans « Le monde G&L » (`module` = clé `modules.*` requise). */
export const GL_MONDE_SUB_TABS = [
  { id: 'world', label: 'Introduction', icon: '🌍' },
  { id: 'rules', label: 'Règles du jeu', icon: '📖' },
  { id: 'lore-glossary', label: 'Lexique lore', icon: '📜', module: 'loreGlossaryEnabled' },
  { id: 'tutorials', label: 'Tutoriels', icon: '🎓', module: 'tutorialsEnabled' },
];

export const GL_MONDE_SUB_TAB_IDS = GL_MONDE_SUB_TABS.map((tab) => tab.id);

export const GL_MONDE_TAB = { id: 'monde-gl', label: 'Le monde G&L', icon: '🌍' };

/** Sous-onglets regroupés dans « Les joueurs » (`module` = clé `modules.*` ; marché exige aussi la vitalité). */
export const GL_JOUEURS_SUB_TABS = [
  { id: 'forum', label: 'Forum', icon: '💬', module: 'forumEnabled' },
  { id: 'market', label: 'Marché', icon: '🤝', module: 'marketEnabled', requiresVitality: true },
  { id: 'stats', label: 'Statistiques', icon: '📊' },
];

export const GL_JOUEURS_SUB_TAB_IDS = GL_JOUEURS_SUB_TABS.map((tab) => tab.id);

export const GL_JOUEURS_TAB = { id: 'joueurs', label: 'Les joueurs', icon: '👥' };

/** Onglet plateau démo — visible uniquement en Mode Découverte. */
export const GL_DISCOVERY_TAB = { id: 'discovery', label: 'Découverte', icon: '🧭' };

export const GL_GUEST_TAB_IDS = ['monde-gl', 'discovery', 'nature'];

export const GL_PLAYER_TABS = [
  { id: 'maps', label: 'Cartes', icon: '🗺️' },
  GL_NATURE_TAB,
  GL_ADVENTURE_TAB,
  GL_MONDE_TAB,
  GL_JOUEURS_TAB,
  { id: 'journal', label: 'Journal', icon: '📓' },
  { id: 'my-journal', label: 'Mon journal', icon: '📔' },
];

export const GL_ADMIN_EXTRA_TABS = [
  { id: 'users', label: 'Gestion utilisateurs', icon: '👥' },
  { id: 'contents', label: 'Contenus', icon: '🧩' },
  { id: 'settings', label: 'Réglages plateforme', icon: '⚙️' },
  { id: 'mascots', label: 'Gestion mascottes', icon: '🧙' },
  { id: 'mj', label: 'Console MJ', icon: '🎲' },
];

export const GL_VALID_TABS = new Set([
  ...GL_PLAYER_TABS.map((tab) => tab.id),
  ...GL_ADMIN_EXTRA_TABS.map((tab) => tab.id),
  ...GL_NATURE_SUB_TAB_IDS,
  ...GL_ADVENTURE_SUB_TAB_IDS,
  ...GL_MONDE_SUB_TAB_IDS,
  ...GL_JOUEURS_SUB_TAB_IDS,
  GL_DISCOVERY_TAB.id,
  'auth',
]);
