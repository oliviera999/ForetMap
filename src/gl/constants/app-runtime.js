export const GL_TAB_STORAGE_KEY = 'gl_active_tab';

export const GL_PLAYER_TABS = [
  { id: 'maps', label: 'Cartes' },
  { id: 'biotope', label: 'Biotope' },
  { id: 'biocenose', label: 'Biocenose' },
  { id: 'history', label: 'Histoire' },
  { id: 'world', label: 'Le monde de G&L' },
  { id: 'spells', label: 'Sortileges' },
  { id: 'rules', label: 'Regles du jeu' },
];

export const GL_ADMIN_EXTRA_TABS = [
  { id: 'users', label: 'Gestion utilisateurs' },
  { id: 'settings', label: 'Reglages plateforme' },
  { id: 'mascots', label: 'Gestion mascottes' },
  { id: 'mj', label: 'Console MJ' },
];

export const GL_VALID_TABS = new Set([
  ...GL_PLAYER_TABS.map((tab) => tab.id),
  ...GL_ADMIN_EXTRA_TABS.map((tab) => tab.id),
  'auth',
]);
