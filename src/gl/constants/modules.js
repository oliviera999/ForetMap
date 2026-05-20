export const GL_MODULE_DEFAULTS = {
  mascotPacksEnabled: true,
  contextCommentsEnabled: true,
  forumEnabled: true,
  notificationsEnabled: true,
  tutorialsEnabled: true,
  helpEnabled: true,
  journalEnabled: true,
  kingdomMapEnabled: true,
};

export function normalizeGlModules(raw) {
  const out = { ...GL_MODULE_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(GL_MODULE_DEFAULTS)) {
    out[key] = raw[key] === true;
  }
  return out;
}

export function isModuleEnabled(modules, moduleKey) {
  return !!(modules && modules[moduleKey] === true);
}
