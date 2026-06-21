import { HELP_TOOLTIPS, HELP_PANELS, resolveRoleText } from '../constants/help';
import { RT_PROF_TOOLTIPS } from '../constants/realtime';
import { getContentText } from './content';

function getHelpRegistry(publicSettings) {
  return publicSettings?.content?.help?.registry ?? null;
}

function readNestedTooltip(path) {
  const [zone, action] = String(path || '').split('.');
  if (!zone || !action) return null;
  return HELP_TOOLTIPS[zone]?.[action] ?? null;
}

/** Infobulle par clé à points (ex. `header.userBadge`). */
export function resolveTooltipKey(path, publicSettings, isTeacher) {
  const registry = getHelpRegistry(publicSettings);
  const override = registry?.tooltips?.[path];
  const fallback = readNestedTooltip(path);
  return resolveRoleText({ ...fallback, ...override }, isTeacher);
}

/** Panneau d'aide (?) pour une section (`map`, `tasks`, …). */
export function resolveHelpPanelSection(sectionId, publicSettings) {
  const registry = getHelpRegistry(publicSettings);
  const fallback = HELP_PANELS[sectionId] || { title: 'Aide', items: [] };
  const override = registry?.panels?.[sectionId];
  if (!override) return { title: fallback.title, items: [...fallback.items] };
  return {
    title: override.title || fallback.title,
    items: Array.isArray(override.items) && override.items.length > 0 ? override.items : fallback.items,
  };
}

/** Libellés chrome du système d'aide (astuce, boutons panneau ?). */
export function resolveHelpChrome(publicSettings) {
  const registry = getHelpRegistry(publicSettings);
  const chrome = registry?.chrome;
  return {
    hintPrefix: chrome?.hintPrefix || getContentText(publicSettings, 'help.hint_prefix', 'Astuce :'),
    panelTitlePrefix:
      chrome?.panelTitlePrefix ||
      getContentText(publicSettings, 'help.panel_title_prefix', '💡'),
    panelCloseCta:
      chrome?.panelCloseCta || getContentText(publicSettings, 'help.panel_close_cta', 'Fermer'),
    panelDismissCta:
      chrome?.panelDismissCta ||
      getContentText(publicSettings, 'help.panel_dismiss_cta', 'Ne plus afficher'),
  };
}

/** Mini-astuce contextuelle par vue (`map`, `tasks`, `visit`). */
export function resolveHelpQuickTip(viewKey, publicSettings) {
  const registry = getHelpRegistry(publicSettings);
  const fromRegistry = registry?.quickTips?.[viewKey];
  if (fromRegistry) return fromRegistry;
  return getContentText(
    publicSettings,
    `help.${viewKey}_quick_tip`,
    {
      map: 'Clique une zone ou un repère puis ouvre ? pour les actions guidées.',
      tasks: 'Filtre d abord par carte ou groupe, puis traite les retours en attente.',
      visit: 'Coche ce que tu vois déjà pour suivre ta progression sur la carte.',
    }[viewKey] || '',
  );
}

const MAP_CANVAS_HINT_FALLBACKS = {
  drawZoneMin: '🖊️ Touche la carte (min. 3 pts)',
  drawZoneReady: '✅ {count} pts — Terminer',
  addMarker: '📍 Touche la carte pour placer',
  editPoints: "✋ Glisse un point ou l'intérieur · limites carte · Ctrl+Z annule",
  pageScroll: '📱 1 doigt: page · 2 doigts: zoom carte',
  gesturesActive: '✋ Gestes carte actifs',
};

/** Bandeau carte (mode dessin, gestes tactiles). */
export function resolveMapCanvasHint(key, publicSettings, vars = {}) {
  const registry = getHelpRegistry(publicSettings);
  const template =
    registry?.mapCanvasHints?.[key] || MAP_CANVAS_HINT_FALLBACKS[key] || '';
  return String(template).replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : '',
  );
}

const REALTIME_KEY_MAP = {
  live: 'live',
  polling: 'polling',
  connecting: 'connecting',
  offline: 'offline',
  'no-client': 'noClient',
};

/** Infobulle indicateur temps réel prof. */
export function resolveRealtimeTooltip(status, publicSettings) {
  const registry = getHelpRegistry(publicSettings);
  const registryKey = REALTIME_KEY_MAP[status] || status;
  const fromRegistry = registry?.realtime?.[registryKey];
  if (fromRegistry) return fromRegistry;
  return RT_PROF_TOOLTIPS[status] || '';
}

export { resolveRoleText, getHelpRegistry };
