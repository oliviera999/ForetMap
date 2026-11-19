/**
 * Mise en forme commune des journaux (historique, sécurité, utilisateurs).
 * Fonctions pures : testées sans monter de composant (`tests-ui/audit-journal.test.jsx`).
 */

import { localDateInput } from '../../utils/localDateInput.js';
import { currentLocalDateOnly } from '../../utils/taskListHelpers.js';

/** 30 derniers jours, bornes en date locale (et non UTC : audit du 19/11, F9). */
export function defaultDayRange() {
  return { from: localDateInput(-29), to: currentLocalDateOnly() };
}

/** Raccourcis de période proposés au-dessus des dates. */
export const PERIOD_PRESETS = Object.freeze([
  { id: 'today', label: 'Aujourd’hui', days: 1 },
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: '90d', label: '3 mois', days: 90 },
  { id: '365d', label: '1 an', days: 365 },
]);

export function presetRange(days) {
  return { from: localDateInput(-(Math.max(1, days) - 1)), to: currentLocalDateOnly() };
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Libellé de jour pour regrouper la liste (« Aujourd’hui », « Hier », « mardi 17 sept. »). */
export function dayGroupLabel(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date inconnue';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Aujourd’hui';
  if (diffDays === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** Clé de regroupement par jour local. */
export function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Libellé du type de compte, avec la terminologie des rôles du site. */
export function userTypeLabel(type, roleTerms) {
  switch (String(type || '')) {
    case 'student':
      return roleTerms?.studentSingular || 'élève';
    case 'teacher':
      return roleTerms?.teacherSingular || 'professeur';
    case 'admin':
      return 'administrateur';
    case 'staff':
      return 'personnel';
    case 'gl_player':
      return 'joueur G&L';
    case 'visitor':
      return 'visiteur';
    default:
      return type ? String(type) : '';
  }
}

/** Nom lisible d'un acteur enrichi par l'API (`{ name, pseudo, id, deleted }`). */
export function actorName(actor) {
  if (!actor) return 'Sans compte';
  if (actor.name) return actor.name;
  if (actor.pseudo) return actor.pseudo;
  if (actor.deleted) return `Compte supprimé (${String(actor.id).slice(0, 8)})`;
  return `Compte ${String(actor.id).slice(0, 8)}`;
}

export function truncate(text, max = 72) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Résumé lisible d'un User-Agent (« Chrome · Windows »). Heuristique volontairement simple :
 * l'en-tête complet reste visible dans le détail de l'événement.
 */
export function summarizeUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return '';
  let browser = '';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\//.test(s)) browser = 'Opera';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Chrome\//.test(s) || /CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';
  else if (/curl|node|axios|python|supertest/i.test(s)) browser = 'Script';
  let os = '';
  if (/Android/.test(s)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(s)) os = 'iOS';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : truncate(s, 40);
}

/** Libellé du canal (`via`) d'une action. */
export function viaLabel(via) {
  if (!via) return '';
  if (via === 'mcp') return 'via le connecteur Claude';
  if (via === 'identifier') return 'identifiant + mot de passe';
  return `via ${via}`;
}

/** Charge JSON lisible (indentée), ou chaîne vide. */
export function prettyPayload(payload) {
  if (payload == null || payload === '') return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/** Paramètres de requête des filtres (valeurs vides omises). */
export function filtersToParams(filters, extra = {}) {
  const params = new URLSearchParams();
  const all = { ...filters, ...extra };
  Object.entries(all).forEach(([key, value]) => {
    if (value == null) return;
    const s = String(value).trim();
    if (s) params.set(key, s);
  });
  return params.toString();
}
