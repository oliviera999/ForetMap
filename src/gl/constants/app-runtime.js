export const GL_TAB_STORAGE_KEY = 'gl_active_tab';

export const GL_PLAYER_TABS = [
  { id: 'maps', label: 'Cartes', icon: '🗺️' },
  { id: 'biotope', label: 'Biotope', icon: '🌿' },
  { id: 'biocenose', label: 'Biocenose', icon: '🦋' },
  { id: 'glossary', label: 'Glossaire', icon: '📚' },
  { id: 'history', label: 'Histoire', icon: '📜' },
  { id: 'world', label: 'Le monde de G&L', icon: '🌍' },
  { id: 'spells', label: 'Sortileges', icon: '✨' },
  { id: 'rules', label: 'Regles du jeu', icon: '📖' },
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
  { id: 'settings', label: 'Reglages plateforme', icon: '⚙️' },
  { id: 'mascots', label: 'Gestion mascottes', icon: '🧙' },
  { id: 'mj', label: 'Console MJ', icon: '🎲' },
];

export const GL_VALID_TABS = new Set([
  ...GL_PLAYER_TABS.map((tab) => tab.id),
  ...GL_ADMIN_EXTRA_TABS.map((tab) => tab.id),
  'auth',
]);
