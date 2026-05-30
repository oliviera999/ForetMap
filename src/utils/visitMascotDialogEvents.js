/**
 * Clés stables des bulles de dialogue mascotte visite (pack v2 / réglages site).
 * Valeurs alignées sur visitMascotInteractionEvents.js (sans import pour éviter cycle ESM).
 */
import { z } from 'zod';

export const VISIT_MASCOT_DIALOG_EVENT = Object.freeze({
  MOVE: 'move',
  MASCOT_DRAG_LARGE: 'mascotDragLarge',
  MASCOT_DRAG_VERY_LARGE: 'mascotDragVeryLarge',
  MARKER_MARKED_SEEN: 'markerMarkedSeen',
  MAP_READ_OPEN: 'mapReadOpen',
  MARKER_INSPECT_OPEN: 'markerInspectOpen',
  IDLE: 'idle',
  TALK: 'talk',
  ALERT: 'alert',
  ANGRY: 'angry',
  CELEBRATE: 'celebrate',
});

/** @type {string[]} */
export const VISIT_MASCOT_DIALOG_EVENT_KEYS = Object.freeze(Object.values(VISIT_MASCOT_DIALOG_EVENT));

/** Situations réellement déclenchées au runtime visite / carte forêt. */
export const VISIT_MASCOT_DIALOG_RUNTIME_ACTIVE_KEYS = Object.freeze([
  VISIT_MASCOT_DIALOG_EVENT.MOVE,
  VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_LARGE,
  VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_VERY_LARGE,
  VISIT_MASCOT_DIALOG_EVENT.MARKER_MARKED_SEEN,
  VISIT_MASCOT_DIALOG_EVENT.MAP_READ_OPEN,
  VISIT_MASCOT_DIALOG_EVENT.MARKER_INSPECT_OPEN,
]);

/** Mapping clés historiques pickMascotDialog → clés stables. */
export const LEGACY_DIALOG_KEY_TO_EVENT = Object.freeze({
  move: VISIT_MASCOT_DIALOG_EVENT.MOVE,
  surprise: VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_LARGE,
  running: VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_VERY_LARGE,
  mark_seen: VISIT_MASCOT_DIALOG_EVENT.MARKER_MARKED_SEEN,
  map_read: VISIT_MASCOT_DIALOG_EVENT.MAP_READ_OPEN,
  inspect: VISIT_MASCOT_DIALOG_EVENT.MARKER_INSPECT_OPEN,
  idle: VISIT_MASCOT_DIALOG_EVENT.IDLE,
  talk: VISIT_MASCOT_DIALOG_EVENT.TALK,
  alert: VISIT_MASCOT_DIALOG_EVENT.ALERT,
  angry: VISIT_MASCOT_DIALOG_EVENT.ANGRY,
  celebrate: VISIT_MASCOT_DIALOG_EVENT.CELEBRATE,
});

/** @type {Record<string, string>} */
export const DIALOG_EVENT_TO_LEGACY_KEY = Object.freeze(
  Object.fromEntries(Object.entries(LEGACY_DIALOG_KEY_TO_EVENT).map(([legacy, stable]) => [stable, legacy])),
);

export const VISIT_MASCOT_DIALOG_LABELS = Object.freeze({
  [VISIT_MASCOT_DIALOG_EVENT.MOVE]: 'Déplacement court sur le plan',
  [VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_LARGE]: 'Déplacement long sur le plan',
  [VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_VERY_LARGE]: 'Déplacement très long sur le plan',
  [VISIT_MASCOT_DIALOG_EVENT.MARKER_MARKED_SEEN]: 'Marquage « vu » (repère ou zone)',
  [VISIT_MASCOT_DIALOG_EVENT.MAP_READ_OPEN]: 'Ouverture d’une zone (lecture carte)',
  [VISIT_MASCOT_DIALOG_EVENT.MARKER_INSPECT_OPEN]: 'Ouverture d’un repère (inspection)',
  [VISIT_MASCOT_DIALOG_EVENT.IDLE]: 'Repos (réservé)',
  [VISIT_MASCOT_DIALOG_EVENT.TALK]: 'Dialogue (réservé)',
  [VISIT_MASCOT_DIALOG_EVENT.ALERT]: 'Alerte (réservé)',
  [VISIT_MASCOT_DIALOG_EVENT.ANGRY]: 'Fâchée (réservé)',
  [VISIT_MASCOT_DIALOG_EVENT.CELEBRATE]: 'Célébration (réservé)',
});

const DIALOG_LINE_MAX = 160;
const DIALOG_LINES_MAX = 12;

const dialogLinesSchema = z.array(z.string().max(DIALOG_LINE_MAX)).max(DIALOG_LINES_MAX);

/** Schéma : uniquement les clés connues, chaque valeur = lignes de bulle. */
export function buildDialogProfileSchema() {
  const shape = {};
  for (const key of VISIT_MASCOT_DIALOG_EVENT_KEYS) {
    shape[key] = dialogLinesSchema.optional();
  }
  return z.object(shape).strict();
}

export const dialogProfileSchema = buildDialogProfileSchema();

export const DEFAULT_VISIT_MASCOT_DIALOG_PROFILE = Object.freeze({
  [VISIT_MASCOT_DIALOG_EVENT.MOVE]: [
    'Je trottine derriere toi.',
    'Le sentier du gnome est ouvert.',
    'On explore la foret ensemble.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_VERY_LARGE]: [
    'J accelere, suis-moi.',
    'Sprint vers le prochain indice.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_LARGE]: [
    'Oh ! Tu as vu ca ?',
    'Surprise, cette zone cache un detail.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.MARKER_MARKED_SEEN]: [
    'Bravo, zone benie du gnome.',
    'Excellent, repere valide.',
    'Parfait, la foret te remercie.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.IDLE]: [
    'Ton gnome gardien est pret.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.TALK]: [
    'Je te raconte ce que je vois ici.',
    'Regarde ce detail, il est important.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.ALERT]: [
    'Attention, il y a quelque chose a verifier.',
    'Je detecte une zone qui merite ton regard.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.ANGRY]: [
    'Oups... ce coin de la foret ne va pas bien.',
    'Je rale un peu, aidons la nature ici.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.MAP_READ_OPEN]: [
    'Je lis la carte pour toi.',
    'Orientation recalculée sur le plan.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.MARKER_INSPECT_OPEN]: [
    'Je scrute ce point de pres.',
    'Analyse en cours de ce repere.',
  ],
  [VISIT_MASCOT_DIALOG_EVENT.CELEBRATE]: [
    'On celebre cette etape franchie.',
    'Excellent travail, continuons.',
  ],
});

/** Profil legacy (clés historiques) dérivé des défauts stables. */
export const VISIT_MASCOT_DIALOG_LEGACY = Object.freeze(
  Object.fromEntries(
    VISIT_MASCOT_DIALOG_EVENT_KEYS.map((key) => {
      const legacy = DIALOG_EVENT_TO_LEGACY_KEY[key] || key;
      return [legacy, DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[key] || []];
    }).filter(([, lines]) => Array.isArray(lines) && lines.length > 0),
  ),
);

/**
 * @param {unknown} key
 * @returns {string}
 */
export function normalizeDialogEventKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return VISIT_MASCOT_DIALOG_EVENT.IDLE;
  if (VISIT_MASCOT_DIALOG_EVENT_KEYS.includes(raw)) return raw;
  if (LEGACY_DIALOG_KEY_TO_EVENT[raw]) return LEGACY_DIALOG_KEY_TO_EVENT[raw];
  return raw;
}

/**
 * @param {unknown} lines
 * @returns {string[]}
 */
export function sanitizeDialogLines(lines) {
  if (!Array.isArray(lines)) return [];
  const out = [];
  for (const line of lines) {
    const s = String(line ?? '').trim();
    if (!s) continue;
    out.push(s.slice(0, DIALOG_LINE_MAX));
    if (out.length >= DIALOG_LINES_MAX) break;
  }
  return out;
}

/**
 * @param {unknown} profile
 * @returns {Record<string, string[]>}
 */
export function sanitizeDialogProfile(profile) {
  const out = {};
  if (!profile || typeof profile !== 'object') return out;
  for (const [key, lines] of Object.entries(profile)) {
    const eventKey = normalizeDialogEventKey(key);
    if (!VISIT_MASCOT_DIALOG_EVENT_KEYS.includes(eventKey)) continue;
    const cleaned = sanitizeDialogLines(lines);
    if (cleaned.length > 0) out[eventKey] = cleaned;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, profile: Record<string, string[]> } | { ok: false, error: string }}
 */
export function parseDialogProfileJson(raw) {
  let candidate = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return { ok: true, profile: {} };
    try {
      candidate = JSON.parse(trimmed);
    } catch (_) {
      return { ok: false, error: 'JSON invalide pour le profil de dialogue.' };
    }
  }
  if (candidate == null) return { ok: true, profile: {} };
  const parsed = dialogProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(' ; ') || 'Profil de dialogue invalide.';
    return { ok: false, error: msg };
  }
  return { ok: true, profile: sanitizeDialogProfile(parsed.data) };
}

const catalogOverridesSchema = z.record(z.string().max(80), dialogProfileSchema);

/**
 * @param {unknown} raw
 * @returns {{ ok: true, overrides: Record<string, Record<string, string[]>> } | { ok: false, error: string }}
 */
export function parseCatalogDialogOverridesJson(raw) {
  let candidate = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return { ok: true, overrides: {} };
    try {
      candidate = JSON.parse(trimmed);
    } catch (_) {
      return { ok: false, error: 'JSON invalide pour les surcharges catalogue.' };
    }
  }
  if (candidate == null) return { ok: true, overrides: {} };
  const parsed = catalogOverridesSchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(' ; ') || 'Surcharges catalogue invalides.';
    return { ok: false, error: msg };
  }
  const overrides = {};
  for (const [catalogId, profile] of Object.entries(parsed.data)) {
    const id = String(catalogId || '').trim();
    if (!id) continue;
    const cleaned = sanitizeDialogProfile(profile);
    if (Object.keys(cleaned).length > 0) overrides[id] = cleaned;
  }
  return { ok: true, overrides };
}

/**
 * @param {Record<string, string[]>} profile
 * @returns {string}
 */
export function stringifyDialogProfile(profile) {
  return JSON.stringify(sanitizeDialogProfile(profile));
}

/**
 * @param {Record<string, Record<string, string[]>>} overrides
 * @returns {string}
 */
export function stringifyCatalogDialogOverrides(overrides) {
  const out = {};
  if (overrides && typeof overrides === 'object') {
    for (const [catalogId, profile] of Object.entries(overrides)) {
      const id = String(catalogId || '').trim();
      if (!id) continue;
      const cleaned = sanitizeDialogProfile(profile);
      if (Object.keys(cleaned).length > 0) out[id] = cleaned;
    }
  }
  return JSON.stringify(out);
}
