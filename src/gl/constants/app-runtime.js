export const GL_TAB_STORAGE_KEY = 'gl_active_tab';

/** Onglets épinglés sur la barre mobile (bottom-nav + raccourcis desktop compacts). */
export const GL_MOBILE_PRIMARY_TAB_IDS = ['maps', 'ecosystemes', 'glossary', 'rules'];

/** Onglet plateau démo — visible uniquement en Mode Découverte. */
export const GL_DISCOVERY_TAB = { id: 'discovery', label: 'Découverte', icon: '🧭' };

export const GL_GUEST_TAB_IDS = [
  'world',
  'rules',
  'discovery',
  'glossary',
  'ecosystemes',
  'biodiversite',
];

export const GL_PLAYER_TABS = [
  { id: 'maps', label: 'Cartes', icon: '🗺️' },
  { id: 'ecosystemes', label: 'Écosystèmes', icon: '🌿' },
  { id: 'biodiversite', label: 'Biodiversité', icon: '🦋' },
  { id: 'glossary', label: 'Glossaire', icon: '📚' },
  { id: 'lore-glossary', label: 'Lexique lore', icon: '📜' },
  { id: 'selene-carnet', label: 'Carnet Sélène', icon: '📒' },
  { id: 'history', label: 'Histoire', icon: '📜' },
  { id: 'world', label: 'Le monde de G&L', icon: '🌍' },
  { id: 'spells', label: 'Sortilèges', icon: '✨' },
  { id: 'rules', label: 'Règles du jeu', icon: '📖' },
  { id: 'tutorials', label: 'Tutoriels', icon: '🎓' },
  { id: 'forum', label: 'Forum', icon: '💬' },
  { id: 'market', label: 'Marché', icon: '🤝' },
  { id: 'journal', label: 'Journal', icon: '📓' },
  { id: 'my-journal', label: 'Mon journal', icon: '📔' },
];

export const GL_ADMIN_EXTRA_TABS = [
  { id: 'stats', label: 'Statistiques', icon: '📊' },
  { id: 'users', label: 'Gestion utilisateurs', icon: '👥' },
  { id: 'contents', label: 'Contenus', icon: '🧩' },
  { id: 'settings', label: 'Réglages plateforme', icon: '⚙️' },
  { id: 'mascots', label: 'Gestion mascottes', icon: '🧙' },
  { id: 'mj', label: 'Console MJ', icon: '🎲' },
];

export const GL_VALID_TABS = new Set([
  ...GL_PLAYER_TABS.map((tab) => tab.id),
  ...GL_ADMIN_EXTRA_TABS.map((tab) => tab.id),
  GL_DISCOVERY_TAB.id,
  'auth',
]);
