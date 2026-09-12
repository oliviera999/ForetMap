'use strict';

/**
 * Audience des lieux (zones / repères) par rôles ForetMap — V1.
 * - `visible_role_slugs` vide/NULL = lieu public ;
 * - sinon le lieu n'est visible que pour ces rôles (absent sinon) ;
 * - `restricted_note` + `restricted_note_role_slugs` : complément de texte optionnel ;
 *   slugs vides pour le complément = réservé aux gestionnaires du jardin.
 * Suite documentée : groupes, multi-blocs, héritage par catégorie
 * (`docs/reference/foretmap/carte-et-zones.md`).
 */

const { hasPermission } = require('../middleware/requireTeacher');

/** Rôles ForetMap proposés dans l'UI « Qui peut voir » (hors rôles GL). */
const FORETMAP_AUDIENCE_ROLE_OPTIONS = Object.freeze([
  { slug: 'visiteur', label: 'Visiteur' },
  { slug: 'personnel', label: 'Personnel' },
  { slug: 'eleve_novice', label: 'n3beur novice' },
  { slug: 'eleve_avance', label: 'n3beur avancé' },
  { slug: 'eleve_chevronne', label: 'n3beur chevronné' },
  { slug: 'prof_classe', label: 'Prof de classe' },
  { slug: 'prof', label: 'n3boss' },
  { slug: 'admin', label: 'Administrateur' },
]);

const FORETMAP_AUDIENCE_ROLE_SLUGS = Object.freeze(
  FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug),
);

const RESTRICTED_NOTE_MAX_LENGTH = 8000;

function isKnownAudienceRoleSlug(slug) {
  return FORETMAP_AUDIENCE_ROLE_SLUGS.includes(slug);
}

/**
 * Valeur SQL (JSON / CSV / tableau) → liste de slugs connus, dédoublonnés, ordre canonique.
 * @param {unknown} value
 * @returns {string[]}
 */
function parseRoleSlugList(value) {
  if (value == null || value === '') return [];
  let raw = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed);
      } catch (_) {
        raw = trimmed.split(/[,;]/);
      }
    } else {
      raw = trimmed.split(/[,;]/);
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const item of raw) {
    const slug = String(item ?? '')
      .trim()
      .toLowerCase();
    if (isKnownAudienceRoleSlug(slug)) seen.add(slug);
  }
  return FORETMAP_AUDIENCE_ROLE_SLUGS.filter((slug) => seen.has(slug));
}

/** Liste → JSON stocké en TEXT (`[]` si vide). */
function serializeRoleSlugList(list) {
  return JSON.stringify(parseRoleSlugList(list));
}

/**
 * Entrée d'API (`undefined` = non fourni) → liste, ou `null` si non fourni.
 * @returns {{ ok: true, value: string[] | null } | { ok: false, error: string }}
 */
function normalizeRoleSlugInput(value, { field = 'visible_role_slugs' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null || value === '') return { ok: true, value: [] };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !isKnownAudienceRoleSlug(item.trim().toLowerCase())) {
        return {
          ok: false,
          error: `${field} : rôle inconnu (attendus : ${FORETMAP_AUDIENCE_ROLE_SLUGS.join(', ')})`,
        };
      }
    }
    return { ok: true, value: parseRoleSlugList(value) };
  }
  if (typeof value === 'string') {
    const parsed = parseRoleSlugList(value);
    const parts = value.trim().startsWith('[')
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (_) {
            return null;
          }
        })()
      : value
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
    if (parts === null) {
      return { ok: false, error: `${field} : JSON invalide` };
    }
    if (!Array.isArray(parts)) {
      return { ok: false, error: `${field} doit être un tableau de rôles` };
    }
    for (const item of parts) {
      const slug = String(item ?? '')
        .trim()
        .toLowerCase();
      if (slug && !isKnownAudienceRoleSlug(slug)) {
        return {
          ok: false,
          error: `${field} : rôle inconnu (attendus : ${FORETMAP_AUDIENCE_ROLE_SLUGS.join(', ')})`,
        };
      }
    }
    return { ok: true, value: parsed };
  }
  return { ok: false, error: `${field} doit être un tableau de rôles` };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
function normalizeRestrictedNoteInput(value, { field = 'restricted_note' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: '' };
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} doit être une chaîne` };
  }
  const text = value.trim();
  if (text.length > RESTRICTED_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `${field} : ${RESTRICTED_NOTE_MAX_LENGTH} caractères maximum`,
    };
  }
  return { ok: true, value: text };
}

/**
 * Lit les trois champs d'audience d'un corps de requête (create/update).
 * `undefined` sur un champ = non fourni (à conserver en UPDATE).
 * @returns {{
 *   ok: true,
 *   visible_role_slugs: string[] | null,
 *   restricted_note: string | null,
 *   restricted_note_role_slugs: string[] | null
 * } | { ok: false, error: string }}
 */
function readAudienceWriteFields(body = {}) {
  const visible = normalizeRoleSlugInput(body.visible_role_slugs, {
    field: 'visible_role_slugs',
  });
  if (!visible.ok) return visible;
  const note = normalizeRestrictedNoteInput(body.restricted_note);
  if (!note.ok) return note;
  const noteRoles = normalizeRoleSlugInput(body.restricted_note_role_slugs, {
    field: 'restricted_note_role_slugs',
  });
  if (!noteRoles.ok) return noteRoles;
  return {
    ok: true,
    visible_role_slugs: visible.value,
    restricted_note: note.value,
    restricted_note_role_slugs: noteRoles.value,
  };
}

function isLocationManager(auth) {
  return hasPermission(auth, 'zones.manage') || hasPermission(auth, 'map.manage_markers');
}

/**
 * Rôle effectif du lecteur. Sur une surface publique (visite / plan), un anonyme
 * compte comme « visiteur ».
 * @param {object|null|undefined} auth
 * @param {{ publicSurface?: boolean }} [opts]
 */
function resolveViewerRoleSlug(auth, { publicSurface = false } = {}) {
  const slug = String(auth?.roleSlug || '')
    .trim()
    .toLowerCase();
  if (slug) return slug;
  if (publicSurface) return 'visiteur';
  return null;
}

function canViewLocation(entity, auth, { publicSurface = false } = {}) {
  if (isLocationManager(auth)) return true;
  const audience = parseRoleSlugList(entity?.visible_role_slugs);
  if (audience.length === 0) return true;
  const role = resolveViewerRoleSlug(auth, { publicSurface });
  return role != null && audience.includes(role);
}

function canViewRestrictedNote(entity, auth, { publicSurface = false } = {}) {
  if (isLocationManager(auth)) return true;
  const text = String(entity?.restricted_note || '').trim();
  if (!text) return false;
  const audience = parseRoleSlugList(entity?.restricted_note_role_slugs);
  if (audience.length === 0) return false;
  const role = resolveViewerRoleSlug(auth, { publicSurface });
  return role != null && audience.includes(role);
}

/** Ligne SQL → champs audience normalisés (tableaux + chaîne note). */
function withLocationAudienceFields(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    visible_role_slugs: parseRoleSlugList(row.visible_role_slugs),
    restricted_note: row.restricted_note == null ? '' : String(row.restricted_note),
    restricted_note_role_slugs: parseRoleSlugList(row.restricted_note_role_slugs),
  };
}

/**
 * Prépare une entité pour un lecteur : `null` si le lieu est hors audience ;
 * sinon retire le complément et les métadonnées d'audience selon les droits.
 * Les gestionnaires reçoivent tous les champs (édition).
 */
function projectLocationAudienceForViewer(row, auth, { publicSurface = false } = {}) {
  if (!row || typeof row !== 'object') return row;
  const base = withLocationAudienceFields(row);
  if (!canViewLocation(base, auth, { publicSurface })) return null;
  if (isLocationManager(auth)) return base;
  const out = { ...base };
  delete out.visible_role_slugs;
  if (!canViewRestrictedNote(base, auth, { publicSurface })) {
    delete out.restricted_note;
    delete out.restricted_note_role_slugs;
  } else {
    delete out.restricted_note_role_slugs;
  }
  return out;
}

/**
 * Filtre + projection d'une liste de lieux pour un lecteur.
 * @param {object[]} rows
 */
function filterLocationsForViewer(rows, auth, opts = {}) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const projected = projectLocationAudienceForViewer(row, auth, opts);
    if (projected) out.push(projected);
  }
  return out;
}

module.exports = {
  FORETMAP_AUDIENCE_ROLE_OPTIONS,
  FORETMAP_AUDIENCE_ROLE_SLUGS,
  RESTRICTED_NOTE_MAX_LENGTH,
  isKnownAudienceRoleSlug,
  parseRoleSlugList,
  serializeRoleSlugList,
  normalizeRoleSlugInput,
  normalizeRestrictedNoteInput,
  isLocationManager,
  resolveViewerRoleSlug,
  canViewLocation,
  canViewRestrictedNote,
  withLocationAudienceFields,
  projectLocationAudienceForViewer,
  filterLocationsForViewer,
  readAudienceWriteFields,
};
