'use strict';

/**
 * Audience des lieux (zones / repères) par rôles ForetMap — V1.
 * - `visible_role_slugs` vide/NULL = lieu public ;
 * - sinon le lieu n'est visible que pour ces rôles (absent sinon) ;
 * - compléments réservés : table `location_notes` (migration 263), **plusieurs par lieu**,
 *   chacun avec son audience ; audience vide = `LOCATION_NOTE_DEFAULT_ROLE_SLUGS`
 *   (administrateur, n3boss, prof de classe), en plus des gestionnaires du jardin.
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

/**
 * Audience par défaut d'un complément réservé (aucune case cochée) : l'encadrement.
 * `prof_classe` n'a pas `zones.manage` / `map.manage_markers` — sans cette liste, un
 * prof de classe ne verrait jamais un complément laissé au réglage par défaut.
 */
const LOCATION_NOTE_DEFAULT_ROLE_SLUGS = Object.freeze(['prof_classe', 'prof', 'admin']);

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
 * Valeur SQL (JSON / CSV / tableau) → liste d'identifiants de **groupes**, dédoublonnée,
 * dans l'ordre reçu.
 *
 * Contrairement aux rôles, il n'y a pas de catalogue figé à confronter : un groupe est une
 * ligne de `groups`, créée et supprimée en cours d'année. On ne filtre donc ici que la
 * forme (chaîne non vide, bornée) ; l'existence est vérifiée **à l'écriture**
 * (`assertKnownGroupIds`), pas à la lecture. Un groupe supprimé se comporte alors comme un
 * identifiant inconnu : il ne matche plus personne, et le lieu reste visible par ses autres
 * critères — jamais une erreur en pleine consultation.
 */
const GROUP_ID_MAX_LENGTH = 64;

function parseGroupIdList(value) {
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
  const out = [];
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id || id.length > GROUP_ID_MAX_LENGTH) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Liste de groupes → JSON stocké en TEXT (`[]` si vide). */
function serializeGroupIdList(list) {
  return JSON.stringify(parseGroupIdList(list));
}

/**
 * Entrée d'API (`undefined` = non fourni) → liste de groupes, ou `null` si non fourni.
 * @returns {{ ok: true, value: string[] | null } | { ok: false, error: string }}
 */
function normalizeGroupIdInput(value, { field = 'visible_group_ids' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null || value === '') return { ok: true, value: [] };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          return { ok: false, error: `${field} doit être un tableau d'identifiants de groupes` };
        }
      } catch (_) {
        return { ok: false, error: `${field} : JSON invalide` };
      }
    }
    return { ok: true, value: parseGroupIdList(trimmed) };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: `${field} doit être un tableau d'identifiants de groupes` };
  }
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      return { ok: false, error: `${field} : identifiant de groupe invalide` };
    }
    if (item.trim().length > GROUP_ID_MAX_LENGTH) {
      return {
        ok: false,
        error: `${field} : identifiant de groupe trop long (${GROUP_ID_MAX_LENGTH} max)`,
      };
    }
  }
  return { ok: true, value: parseGroupIdList(value) };
}

/**
 * Les identifiants de groupes existent-ils ? Appelé **à l'écriture** seulement.
 *
 * Sans cette garde, une coquille dans un identifiant produirait un lieu que plus personne ne
 * voit, sans le moindre message — le pire mode d'échec pour un réglage de confidentialité.
 *
 * @param {{ queryAll: Function }} db
 * @param {string[]} ids
 * @param {{ field?: string }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function assertKnownGroupIds(db, ids, { field = 'visible_group_ids' } = {}) {
  const list = parseGroupIdList(ids);
  if (list.length === 0) return { ok: true };
  const placeholders = list.map(() => '?').join(',');
  const rows = await db.queryAll(`SELECT id FROM \`groups\` WHERE id IN (${placeholders})`, list);
  const known = new Set(rows.map((row) => String(row.id)));
  const missing = list.filter((id) => !known.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `${field} : groupe inconnu (${missing.join(', ')})` };
  }
  return { ok: true };
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
 * Lit les trois champs d'audience d'un corps de requête (create/update).
 * `undefined` sur un champ = non fourni (à conserver en UPDATE).
 * @returns {{
 *   ok: true,
 *   visible_role_slugs: string[] | null,
 * } | { ok: false, error: string }}
 */
function readAudienceWriteFields(body = {}) {
  const visible = normalizeRoleSlugInput(body.visible_role_slugs, {
    field: 'visible_role_slugs',
  });
  if (!visible.ok) return visible;
  const visibleGroups = normalizeGroupIdInput(body.visible_group_ids, {
    field: 'visible_group_ids',
  });
  if (!visibleGroups.ok) return visibleGroups;
  return {
    ok: true,
    visible_role_slugs: visible.value,
    visible_group_ids: visibleGroups.value,
  };
}

/**
 * Vérifie l'existence des groupes cités par une écriture d'audience.
 * Séparé de `readAudienceWriteFields` (pur, sans base) pour que les routes gardent un
 * contrôle de forme synchrone avant de toucher la base.
 */
async function assertAudienceGroupsExist(db, audienceInput) {
  for (const field of ['visible_group_ids']) {
    const value = audienceInput?.[field];
    if (value == null) continue;
    const check = await assertKnownGroupIds(db, value, { field });
    if (!check.ok) return check;
  }
  return { ok: true };
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

/** Groupes du lecteur (appartenances directes + sous-groupes), posés par l'hydratation. */
function resolveViewerGroupIds(auth) {
  return parseGroupIdList(auth?.groupIds);
}

/**
 * Le lecteur satisfait-il une audience `{ roleSlugs, groupIds }` ?
 *
 * **Union**, jamais intersection : le lecteur passe s'il a l'un des rôles **ou** s'il est
 * membre de l'un des groupes. Avec une intersection, cocher un rôle sans cocher de groupe
 * (le cas courant) rendrait le lieu invisible pour tout le monde.
 *
 * Deux listes vides = audience non déclarée : l'appelant décide de ce que cela veut dire
 * (public pour un lieu, neutre pour une catégorie, encadrement pour un complément réservé).
 */
function viewerMatchesAudience(audience, auth, { publicSurface = false } = {}) {
  const roleSlugs = audience?.roleSlugs || [];
  const groupIds = audience?.groupIds || [];
  if (roleSlugs.length > 0) {
    const role = resolveViewerRoleSlug(auth, { publicSurface });
    if (role != null && roleSlugs.includes(role)) return true;
  }
  if (groupIds.length > 0) {
    const viewerGroups = resolveViewerGroupIds(auth);
    if (viewerGroups.some((id) => groupIds.includes(id))) return true;
  }
  return false;
}

function isEmptyAudience(audience) {
  return (audience?.roleSlugs || []).length === 0 && (audience?.groupIds || []).length === 0;
}

/** Union de plusieurs audiences, dédoublonnée. */
function mergeAudiences(list) {
  const roleSlugs = new Set();
  const groupIds = new Set();
  for (const audience of list || []) {
    for (const slug of audience?.roleSlugs || []) roleSlugs.add(slug);
    for (const id of audience?.groupIds || []) groupIds.add(id);
  }
  return {
    roleSlugs: FORETMAP_AUDIENCE_ROLE_SLUGS.filter((slug) => roleSlugs.has(slug)),
    groupIds: [...groupIds],
  };
}

/**
 * Audience **effective** d'un lieu : la sienne, ou à défaut celle héritée de ses catégories
 * (migration 262).
 *
 * L'héritage ne joue que si le lieu ne déclare **rien** — une audience posée sur le lieu
 * l'emporte, le plus spécifique gagne. Côté catégories, seules celles qui déclarent une
 * audience comptent : une catégorie neutre (listes vides) n'ouvre ni ne ferme rien. Sans
 * cette règle, ranger un lieu réservé dans une catégorie ordinaire l'aurait rendu public,
 * l'union avec « public » étant « public ».
 *
 * Les catégories sont lues sur `entity.categories`, que `attachCategoriesToEntity` pose sur
 * **toute** réponse zone / repère (`lib/locationCategories.js`). L'héritage suit donc les
 * entités elles-mêmes plutôt qu'un index que chaque surface devrait penser à transmettre —
 * un oubli aurait été un trou de confidentialité silencieux.
 *
 * @returns {{ roleSlugs: string[], groupIds: string[], inherited: boolean }}
 */
function resolveEffectiveLocationAudience(entity) {
  const own = {
    roleSlugs: parseRoleSlugList(entity?.visible_role_slugs),
    groupIds: parseGroupIdList(entity?.visible_group_ids),
  };
  if (!isEmptyAudience(own)) return { ...own, inherited: false };
  const categories = Array.isArray(entity?.categories) ? entity.categories : [];
  const declaring = categories
    .map((category) => ({
      roleSlugs: parseRoleSlugList(category?.visible_role_slugs),
      groupIds: parseGroupIdList(category?.visible_group_ids),
    }))
    .filter((audience) => !isEmptyAudience(audience));
  if (declaring.length === 0) return { roleSlugs: [], groupIds: [], inherited: false };
  return { ...mergeAudiences(declaring), inherited: true };
}

function canViewLocation(entity, auth, { publicSurface = false } = {}) {
  if (isLocationManager(auth)) return true;
  const audience = resolveEffectiveLocationAudience(entity);
  if (isEmptyAudience(audience)) return true;
  return viewerMatchesAudience(audience, auth, { publicSurface });
}

/**
 * Un complément réservé (`location_notes`, migration 263) est-il lisible ?
 *
 * Rien de coché = **encadrement** (`LOCATION_NOTE_DEFAULT_ROLE_SLUGS`), sémantique historique
 * du complément réservé : il est confidentiel par nature et ne s'ouvre pas tout seul. C'est
 * la différence assumée avec `canViewLocationLink`, où une audience vide veut dire « suit le
 * lieu ».
 *
 * @param {object} note ligne sérialisée (`serializeLocationNoteRow`)
 */
function canViewLocationNote(note, auth, { publicSurface = false } = {}) {
  if (isLocationManager(auth)) return true;
  if (!String(note?.body || '').trim()) return false;
  const audience = {
    roleSlugs: parseRoleSlugList(note?.audience_role_slugs),
    groupIds: parseGroupIdList(note?.audience_group_ids),
  };
  if (isEmptyAudience(audience)) {
    const role = resolveViewerRoleSlug(auth, { publicSurface });
    return role != null && LOCATION_NOTE_DEFAULT_ROLE_SLUGS.includes(role);
  }
  return viewerMatchesAudience(audience, auth, { publicSurface });
}

/**
 * Liste de compléments → liste lisible par ce lecteur. Les gestionnaires gardent l'audience
 * (ils éditent) ; pour les autres elle est retirée — inutile à l'affichage, et elle révèle la
 * cartographie des rôles et des classes visés par le lieu.
 */
function projectLocationNotesForViewer(notes, auth, { publicSurface = false } = {}) {
  if (!Array.isArray(notes)) return [];
  const manager = isLocationManager(auth);
  const out = [];
  for (const note of notes) {
    if (!canViewLocationNote(note, auth, { publicSurface })) continue;
    if (manager) {
      out.push(note);
      continue;
    }
    const { audience_role_slugs: _roles, audience_group_ids: _groups, ...rest } = note;
    out.push(rest);
  }
  return out;
}

/**
 * Un lien documentaire du lieu (`location_links`, migration 261) est-il lisible ?
 *
 * Audience vide = **le lien suit le lieu** : quiconque voit la fiche voit le lien. Audience
 * renseignée = lien confidentiel, réservé à ces rôles — la granularité descend du bloc de
 * texte (description publique / complément réservé) au lien lui-même.
 *
 * Volontairement plus simple que `canViewRestrictedNote` : pas d'audience par défaut de
 * repli. Un complément réservé laissé vide doit rester confidentiel (c'est son objet) ;
 * un lien laissé vide est au contraire un lien ordinaire, et le rendre invisible par défaut
 * serait un piège pour l'auteur.
 *
 * @param {object} link ligne sérialisée (`serializeLocationLinkRow`)
 */
function canViewLocationLink(link, auth, { publicSurface = false } = {}) {
  if (isLocationManager(auth)) return true;
  const audience = {
    roleSlugs: parseRoleSlugList(link?.audience_role_slugs),
    groupIds: parseGroupIdList(link?.audience_group_ids),
  };
  if (isEmptyAudience(audience)) return true;
  return viewerMatchesAudience(audience, auth, { publicSurface });
}

/**
 * Liste de liens → liste lisible par ce lecteur. Les gestionnaires gardent
 * `audience_role_slugs` (ils éditent) ; pour les autres, le champ est retiré — inutile à
 * l'affichage, et il révèle la cartographie des rôles du lieu.
 */
function projectLocationLinksForViewer(links, auth, { publicSurface = false } = {}) {
  if (!Array.isArray(links)) return [];
  const manager = isLocationManager(auth);
  const out = [];
  for (const link of links) {
    if (!canViewLocationLink(link, auth, { publicSurface })) continue;
    if (manager) {
      out.push(link);
      continue;
    }
    const { audience_role_slugs: _roles, audience_group_ids: _groups, ...rest } = link;
    out.push(rest);
  }
  return out;
}

/** Ligne SQL → champs audience normalisés (tableaux + chaîne note). */
function withLocationAudienceFields(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    visible_role_slugs: parseRoleSlugList(row.visible_role_slugs),
    visible_group_ids: parseGroupIdList(row.visible_group_ids),
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
  delete out.visible_group_ids;
  // Audience héritée d'une catégorie : elle a servi au filtre ci-dessus, elle n'a pas à
  // partir chez un lecteur ordinaire. Les catégories restent exposées (libellé, couleur,
  // emoji), amputées de leurs seules colonnes d'audience.
  if (Array.isArray(base.categories)) {
    out.categories = base.categories.map((category) => {
      if (!category || typeof category !== 'object') return category;
      const { visible_role_slugs: _roles, visible_group_ids: _groups, ...rest } = category;
      return rest;
    });
  }
  // Les liens du lieu suivent le même chemin que le complément réservé : filtrés ici, donc
  // sur **toutes** les surfaces qui passent par cette projection (carte de travail, Visite,
  // Plan public, plan des personnels). Un lien hors audience ne quitte jamais le serveur.
  if (Array.isArray(base.links)) {
    out.links = projectLocationLinksForViewer(base.links, auth, { publicSurface });
  }
  // Compléments réservés : filtrés note par note, sur le même chemin que les liens — donc
  // sur TOUTES les surfaces qui passent par cette projection (carte, Visite, Plan public,
  // plan des personnels). Une note hors audience ne quitte jamais le serveur.
  if (Array.isArray(base.notes)) {
    out.notes = projectLocationNotesForViewer(base.notes, auth, { publicSurface });
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
  LOCATION_NOTE_DEFAULT_ROLE_SLUGS,
  isKnownAudienceRoleSlug,
  parseRoleSlugList,
  serializeRoleSlugList,
  normalizeRoleSlugInput,
  GROUP_ID_MAX_LENGTH,
  parseGroupIdList,
  serializeGroupIdList,
  normalizeGroupIdInput,
  assertKnownGroupIds,
  assertAudienceGroupsExist,
  resolveViewerGroupIds,
  viewerMatchesAudience,
  mergeAudiences,
  resolveEffectiveLocationAudience,
  isLocationManager,
  resolveViewerRoleSlug,
  canViewLocation,
  canViewLocationNote,
  projectLocationNotesForViewer,
  canViewLocationLink,
  projectLocationLinksForViewer,
  withLocationAudienceFields,
  projectLocationAudienceForViewer,
  filterLocationsForViewer,
  readAudienceWriteFields,
};
