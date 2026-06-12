/**
 * Réglages publics du shell App (O6) : valeur par défaut affichée avant la
 * réponse de `/api/settings/public`, et fusion de cette réponse dans l'état.
 * Logique pure extraite de `src/App.jsx` — aucun état React ici.
 */
import { DEFAULT_VISIT_MASCOT_ALLOWED_IDS } from '../constants/app-runtime';

/** Réglages publics par défaut (utilisés tant que `/api/settings/public` n'a pas répondu). */
export const DEFAULT_PUBLIC_SETTINGS = {
  auth: {
    allow_register: true,
    allow_google_student: true,
    allow_google_teacher: true,
    allow_guest_visit: true,
    default_mode: 'login',
    welcome_message: '',
  },
  map: {
    default_map_student: 'foret',
    default_map_teacher: 'foret',
    default_map_visit: 'foret',
    emoji_label_center_gap: 14,
    overlay_emoji_size_percent: 100,
    overlay_label_size_percent: 100,
  },
  modules: {
    tutorials_enabled: true,
    visit_enabled: true,
    stats_enabled: true,
    observations_enabled: true,
    help_enabled: true,
    forum_enabled: true,
    context_comments_enabled: true,
  },
  help: {
    show_context_hints: true,
    pulse_unseen_panels: true,
  },
  visit: {
    mascot: {
      allowed_ids: DEFAULT_VISIT_MASCOT_ALLOWED_IDS,
      default_id: 'renard2-cut-spritesheet',
    },
  },
};

/**
 * Fusionne la réponse de `/api/settings/public` (`d.settings`) dans les réglages courants.
 * Les sections legacy sous `ui.*` (modules/help/map/auth/visit) sont fusionnées champ à
 * champ avec `prev`, et `visit.mascot.dialog` est replié dans `visit.mascot`.
 * Pure : ne mute ni `prev` ni `settings`, retourne un nouvel objet.
 */
export function mergePublicSettings(prev, settings) {
  if (!settings || typeof settings !== 'object') return prev;
  const next = { ...prev, ...settings };
  const ui = settings.ui;
  if (ui && typeof ui === 'object') {
    if (ui.modules && typeof ui.modules === 'object') {
      next.modules = { ...prev.modules, ...ui.modules };
    }
    if (ui.help && typeof ui.help === 'object') {
      next.help = { ...prev.help, ...ui.help };
    }
    if (ui.map && typeof ui.map === 'object') {
      next.map = { ...prev.map, ...ui.map };
    }
    if (ui.auth && typeof ui.auth === 'object') {
      next.auth = { ...prev.auth, ...ui.auth };
    }
    if (ui.visit && typeof ui.visit === 'object') {
      next.visit = { ...prev.visit, ...ui.visit };
    }
  }
  if (settings.visit?.mascot?.dialog) {
    next.visit = {
      ...next.visit,
      mascot: {
        ...(next.visit?.mascot || {}),
        ...(settings.visit?.mascot || {}),
        dialog: settings.visit.mascot.dialog,
      },
    };
  }
  return next;
}
