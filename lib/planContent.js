'use strict';

/**
 * Charge agrégée d'un **plan** — noyau partagé par le Plan Lyautey public (`routes/plan.js`,
 * surface `plan`) et le plan des personnels (`routes/staff-plan.js`, surface `staff`).
 *
 * Les deux produits lisent les **mêmes tables** que la carte de travail ForetMap et la Visite
 * (`zones`, `map_markers`, `location_categories`, `map_routes`, textes `visit_*`, photos) — pas
 * de copie des lieux. Ce qui les sépare tient en deux paramètres :
 *
 *   - `surface` : quels lieux, catégories et parcours sortent (`lib/locationSurfaces.js`) ;
 *   - `auth` : **qui lit**. Le plan public passe `null` sur une surface publique, donc un
 *     lecteur « visiteur » ; le plan des personnels passe le lecteur identifié, et
 *     `lib/locationAudience.js` lui laisse alors les lieux réservés à son rôle **et** les
 *     compléments confidentiels (`location_notes`).
 *
 * Aucune donnée pédagogique ni nominative ne sort d'ici, sur aucune des deux surfaces : ni
 * tâches, ni élèves, ni progression.
 */

const { queryAll, queryOne } = require('../database');
const { getSettingValue, SETTINGS_REGISTRY } = require('./settings');
const { loadCategoriesMap, attachCategoriesToEntity } = require('./locationCategories');
const { isVisibleOnSurface, isPublicSurface, searchAliasesToList } = require('./locationSurfaces');
const { canViewLocation, projectLocationAudienceForViewer } = require('./locationAudience');
const { loadLocationLinksMap, attachLinksToEntity } = require('./locationLinks');
const { loadLocationNotesMap, attachNotesToEntity } = require('./locationNotes');
const { pickNewestMapPhotoByTarget, serializeMapLeadPhoto } = require('./visitContentHelpers');
const { attachStepsToRoutes, serializeRouteRow } = require('./mapRoutes');

/**
 * Suffixes de réglage communs aux deux plans. Le préfixe (`ui.plan.` / `ui.staff_plan.`) est
 * fourni par l'appelant : deux surfaces, deux lignes éditoriales, mêmes champs.
 */
const PLAN_SETTING_SUFFIXES = Object.freeze([
  'title',
  'welcome_hint',
  'access_mode',
  'attribution',
  'default_category_ids',
  'hidden_category_ids',
  // Autres cartes proposées au changement : **par surface**. Le plan des personnels peut
  // ouvrir des plans que le plan public n'a pas à offrir (annexes, locaux techniques).
  'selectable_map_ids',
]);

/**
 * Réglages partagés par les deux plans, toujours lus sous `ui.plan.` : ils décrivent la
 * **carte** et son rendu, pas la ligne éditoriale d'une surface. Les dupliquer par produit
 * obligerait à les tenir synchronisés à la main pour aucun gain — le plan des personnels
 * montre la carte de l'établissement, la même.
 */
const PLAN_SHARED_SETTING_SUFFIXES = Object.freeze(['map_id', 'brand', 'heading_up_enabled']);

function settingDefault(key) {
  return SETTINGS_REGISTRY[key]?.default ?? '';
}

/** Liste d'identifiants séparés par `;` (réglages `*_category_ids`). */
function idListFromSetting(value) {
  return String(value ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Réglages publics d'un plan, valeurs par défaut du registre comprises.
 * @param {object} [options]
 * @param {string} [options.prefix] Préfixe des réglages propres à la surface (`ui.plan.`).
 * @param {string[]} [options.accessModes] Valeurs acceptées pour `access_mode` ; la première
 *   fait office de repli quand la valeur stockée n'en fait pas partie.
 */
async function loadPlanSettings({ prefix = 'ui.plan.', accessModes = ['public', 'code'] } = {}) {
  const out = {};
  for (const suffix of PLAN_SETTING_SUFFIXES) {
    const key = `${prefix}${suffix}`;
    const value = await getSettingValue(key, settingDefault(key));
    out[suffix] = value == null ? settingDefault(key) : value;
  }
  for (const suffix of PLAN_SHARED_SETTING_SUFFIXES) {
    const key = `ui.plan.${suffix}`;
    const value = await getSettingValue(key, settingDefault(key));
    out[suffix] = value == null ? settingDefault(key) : value;
  }
  return {
    map_id: String(out.map_id || ''),
    // Thème de marque de l'établissement (lot 7) ; `{}` = apparence par défaut du produit.
    brand: out.brand && typeof out.brand === 'object' ? out.brand : {},
    title: String(out.title || ''),
    welcome_hint: String(out.welcome_hint || ''),
    access_mode: accessModes.includes(out.access_mode) ? out.access_mode : accessModes[0],
    attribution: String(out.attribution || ''),
    default_category_ids: idListFromSetting(out.default_category_ids),
    hidden_category_ids: idListFromSetting(out.hidden_category_ids),
    selectable_map_ids: idListFromSetting(out.selectable_map_ids),
    heading_up_enabled: out.heading_up_enabled === true || out.heading_up_enabled === 1,
  };
}

const MAP_SELECT =
  'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled, heading_up_enabled, scale_compass_enabled FROM maps';

/**
 * Cartes qu'un plan a le droit de servir : celle de ses réglages, plus celles que
 * l'administrateur a **déclarées** dans `ui.<surface>.selectable_map_ids`.
 *
 * C'est la liste blanche de `?map_id=`. Sans elle, `?map_id=foret` sortait la carte de
 * travail de la forêt comestible sur le plan public à qui devinait l'identifiant : les lieux
 * sans catégorie et sans `hidden_surfaces` sont visibles sur **toutes** les surfaces
 * (`lib/locationSurfaces.js`), le filtre de surface ne protégeait donc rien ici.
 *
 * @param {object} settings réglages chargés (`loadPlanSettings`).
 * @returns {string[]} identifiants, sans doublon, carte réglée en tête.
 */
function allowedPlanMapIds(settings) {
  const ids = [String(settings?.map_id || '').trim(), ...(settings?.selectable_map_ids || [])]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * Cartes proposées au changement depuis le plan (« Réglages → Plan affiché »).
 *
 * La carte réellement servie y figure toujours, même si un réglage la laisse hors liste ou
 * si elle est inactive : un sélecteur dont aucune entrée ne correspond à l'écran affiché est
 * un sélecteur cassé. Les autres doivent être **actives** — un plan dépublié ne se propose
 * pas.
 *
 * @param {object} settings réglages chargés (`loadPlanSettings`).
 * @param {object} currentMap ligne `maps` servie (`resolvePlanMap`).
 * @returns {Promise<Array<{ id: string, label: string }>>} vide si une seule carte : le front
 *   n'affiche alors aucun sélecteur.
 */
async function listSelectablePlanMaps(settings, currentMap) {
  const ids = allowedPlanMapIds(settings);
  const currentId = String(currentMap?.id || '').trim();
  const others = ids.filter((id) => id !== currentId);
  const rows = others.length
    ? await queryAll(
        `SELECT id, label, sort_order FROM maps
         WHERE is_active = 1 AND id IN (${others.map(() => '?').join(',')})
         ORDER BY sort_order ASC, label ASC`,
        others,
      )
    : [];
  if (!rows.length) return [];
  const current = {
    id: currentId,
    label: String(currentMap?.label || ''),
    sort_order: Number(currentMap?.sort_order) || 0,
  };
  return [
    current,
    ...rows.map((row) => ({
      id: String(row.id),
      label: String(row.label || ''),
      sort_order: Number(row.sort_order) || 0,
    })),
  ]
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'fr'))
    .map(({ id, label }) => ({ id, label: label || id }));
}

/**
 * Carte du plan : `?map_id=` si fournie **et déclarée** (400 sinon), sinon `ui.plan.map_id`
 * si active, sinon la première carte active (le plan doit toujours pouvoir s'afficher).
 * @returns {Promise<{ map: object|null, error?: string }>}
 */
async function resolvePlanMap(rawMapId, settings) {
  const requested = String(rawMapId || '').trim();
  if (requested) {
    // Hors liste blanche : « Carte introuvable », comme un identifiant inexistant. Distinguer
    // les deux apprendrait au curieux quelles cartes existent sans être publiées.
    if (!allowedPlanMapIds(settings).includes(requested)) {
      return { map: null, error: 'Carte introuvable' };
    }
    const row = await queryOne(`${MAP_SELECT} WHERE id = ? LIMIT 1`, [requested]);
    return row ? { map: row } : { map: null, error: 'Carte introuvable' };
  }
  const preferred = String(settings.map_id || '').trim();
  if (preferred) {
    const row = await queryOne(`${MAP_SELECT} WHERE id = ? AND is_active = 1 LIMIT 1`, [preferred]);
    if (row) return { map: row };
  }
  const first = await queryOne(
    `${MAP_SELECT} WHERE is_active = 1 ORDER BY sort_order ASC, label ASC LIMIT 1`,
  );
  return first ? { map: first } : { map: null, error: 'Aucune carte active' };
}

function parseGeoAnchors(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function serializePlanMap(row) {
  const geoAnchors = parseGeoAnchors(row.geo_anchors_json);
  const hasAnchors = !!geoAnchors;
  const scaleRaw = row.scale_compass_enabled == null ? 1 : row.scale_compass_enabled;
  return {
    id: String(row.id),
    label: String(row.label || ''),
    map_image_url: row.map_image_url == null ? null : String(row.map_image_url),
    frame_padding_px: row.frame_padding_px == null ? null : Number(row.frame_padding_px),
    gps_enabled: !!Number(row.gps_enabled),
    heading_up_enabled: !!Number(row.heading_up_enabled) && !!Number(row.gps_enabled),
    scale_compass_enabled: hasAnchors && !!Number(scaleRaw),
    geo_anchors: geoAnchors,
  };
}

const ZONES_SELECT = `SELECT z.id, z.map_id, z.name, z.emoji, z.points, z.color, z.description,
  z.hidden_surfaces, z.search_aliases,
  z.visible_role_slugs, z.visible_group_ids,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id`;

const ZONES_SQL = `${ZONES_SELECT}
WHERE z.map_id = ?
ORDER BY z.name ASC`;

/** Même projection que {@link ZONES_SQL}, pour un seul lieu (cf. `findPlanPlace`). */
const ZONE_BY_ID_SQL = `${ZONES_SELECT}
WHERE z.map_id = ? AND z.id = ?
LIMIT 1`;

const MARKERS_SELECT = `SELECT m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji, m.note,
  m.hidden_surfaces, m.search_aliases,
  m.visible_role_slugs, m.visible_group_ids,
  vm.subtitle AS visit_subtitle,
  vm.short_description AS visit_short_description,
  vm.details_title AS visit_details_title,
  vm.details_text AS visit_details_text
FROM map_markers m
LEFT JOIN visit_markers vm ON vm.id = m.id`;

const MARKERS_SQL = `${MARKERS_SELECT}
WHERE m.map_id = ?
ORDER BY m.label ASC`;

/** Même projection que {@link MARKERS_SQL}, pour un seul lieu (cf. `findPlanPlace`). */
const MARKER_BY_ID_SQL = `${MARKERS_SELECT}
WHERE m.map_id = ? AND m.id = ?
LIMIT 1`;

const ZONE_PHOTOS_SQL = `SELECT zp.zone_id AS target_id, zp.id, zp.caption, zp.uploaded_at, zp.sort_order, zp.image_path
  FROM zone_photos zp
  INNER JOIN zones z ON z.id = zp.zone_id AND z.map_id = ?
  ORDER BY zp.zone_id ASC, zp.sort_order ASC, zp.id ASC`;

const MARKER_PHOTOS_SQL = `SELECT mp.marker_id AS target_id, mp.id, mp.caption, mp.uploaded_at, mp.sort_order, mp.image_path
  FROM marker_photos mp
  INNER JOIN map_markers m ON m.id = mp.marker_id AND m.map_id = ?
  ORDER BY mp.marker_id ASC, mp.sort_order ASC, mp.id ASC`;

// `FIND_IN_SET(?, …)` : la surface est un **paramètre lié**, jamais interpolée dans le SQL.
const ROUTES_SQL = `SELECT id, map_id, slug, title, description, audience, surfaces,
  is_published, sort_order
  FROM map_routes
  WHERE map_id = ? AND is_published = 1 AND FIND_IN_SET(?, surfaces) > 0
  ORDER BY sort_order ASC, title ASC`;

const ROUTE_STEPS_SQL = `SELECT s.route_id, s.position, s.target_type, s.target_id,
  s.step_title, s.step_text
  FROM map_route_steps s
  JOIN map_routes r ON r.id = s.route_id
  WHERE r.map_id = ? AND r.is_published = 1 AND FIND_IN_SET(?, r.surfaces) > 0
  ORDER BY s.route_id, s.position`;

const CATEGORIES_SQL = `SELECT id, map_id, slug, label, emoji, color, description, applies_to,
  is_infrastructure, sort_order, is_active, surfaces, zoom_only
  FROM location_categories
  WHERE is_active = 1 AND (map_id IS NULL OR map_id = ?) AND FIND_IN_SET(?, surfaces) > 0
  ORDER BY sort_order ASC, label ASC`;

function textOrEmpty(value) {
  return value == null ? '' : String(value);
}

/** Champs communs d'un lieu de plan (jamais de donnée pédagogique ou nominative). */
function publicPlaceFields(row, hiddenCategoryIds) {
  const categoryIds = (row.category_ids || []).filter((id) => !hiddenCategoryIds.has(id));
  return {
    id: String(row.id),
    emoji: textOrEmpty(row.emoji).trim(),
    category_ids: categoryIds,
    search_aliases: searchAliasesToList(row.search_aliases),
    visit_subtitle: textOrEmpty(row.visit_subtitle),
    visit_short_description: textOrEmpty(row.visit_short_description),
    visit_details_title: textOrEmpty(row.visit_details_title),
    visit_details_text: textOrEmpty(row.visit_details_text),
  };
}

/**
 * Charge agrégée d'un plan sur une surface, pour un lecteur donné.
 *
 * @param {object} map Ligne `maps` déjà résolue (`resolvePlanMap`).
 * @param {object} settings Réglages chargés (`loadPlanSettings`).
 * @param {object} [options]
 * @param {string} [options.surface] Surface servie (`plan` par défaut).
 * @param {object|null} [options.auth] Lecteur (`req.auth`) ; `null` = anonyme. Sur une surface
 *   publique, un anonyme est traité en « visiteur » ; sur une surface fermée, il ne voit aucun
 *   lieu à audience restreinte.
 */
/**
 * Un lieu précis de la carte d'un plan, **vu par ce lecteur** — ou `null`.
 *
 * Même chemin de décision que `buildPlanContent` (surface puis audience), pour un seul lieu :
 * une écriture rattachée à un lieu (« Signaler ou proposer ») ne doit pas pouvoir viser un
 * repère que le lecteur ne verrait pas sur son plan. Répondre « introuvable » plutôt que
 * « interdit » est volontaire : distinguer les deux dirait au lecteur qu'un lieu masqué
 * existe.
 *
 * @param {{ mapId: string, kind: 'zone'|'marker', id: string, surface?: string, auth?: object|null }} params
 * @returns {Promise<{ kind: 'zone'|'marker', id: string, label: string }|null>}
 */
async function findPlanPlace({ mapId, kind, id, surface = 'plan', auth = null }) {
  const normalizedMapId = String(mapId || '').trim();
  const normalizedKind = String(kind || '')
    .trim()
    .toLowerCase();
  const normalizedId = String(id || '').trim();
  if (!normalizedMapId || !normalizedId) return null;
  if (normalizedKind !== 'zone' && normalizedKind !== 'marker') return null;

  const row = await queryOne(normalizedKind === 'zone' ? ZONE_BY_ID_SQL : MARKER_BY_ID_SQL, [
    normalizedMapId,
    normalizedId,
  ]);
  if (!row) return null;

  const categories = await loadCategoriesMap({ queryAll, queryOne }, normalizedKind, [row.id]);
  const withCategories = attachCategoriesToEntity(row, categories.get(String(row.id)) || []);
  if (!isVisibleOnSurface(withCategories, surface)) return null;
  if (!canViewLocation(withCategories, auth, { publicSurface: isPublicSurface(surface) })) {
    return null;
  }
  return {
    kind: normalizedKind,
    id: String(row.id),
    label: textOrEmpty(normalizedKind === 'zone' ? row.name : row.label),
  };
}

async function buildPlanContent(map, settings, { surface = 'plan', auth = null } = {}) {
  const mapId = String(map.id);
  const publicSurface = isPublicSurface(surface);
  const viewer = { publicSurface };
  const [zoneRows, markerRows, categoryRows, zonePhotoRows, markerPhotoRows, routeRows, stepRows] =
    await Promise.all([
      queryAll(ZONES_SQL, [mapId]),
      queryAll(MARKERS_SQL, [mapId]),
      queryAll(CATEGORIES_SQL, [mapId, surface]),
      queryAll(ZONE_PHOTOS_SQL, [mapId]),
      queryAll(MARKER_PHOTOS_SQL, [mapId]),
      queryAll(ROUTES_SQL, [mapId, surface]),
      queryAll(ROUTE_STEPS_SQL, [mapId, surface]),
    ]);
  const db = { queryAll, queryOne };
  const [zoneCategories, markerCategories] = await Promise.all([
    loadCategoriesMap(
      db,
      'zone',
      zoneRows.map((z) => z.id),
    ),
    loadCategoriesMap(
      db,
      'marker',
      markerRows.map((m) => m.id),
    ),
  ]);
  // Liens documentaires (migration 261) : chargés pour les deux familles de lieux, posés
  // bruts sur les lignes, puis filtrés par rôle dans `projectLocationAudienceForViewer` —
  // même chemin que le complément réservé, donc un lien hors audience ne sort pas d'ici.
  const [zoneLinks, markerLinks, zoneNotes, markerNotes] = await Promise.all([
    loadLocationLinksMap(
      db,
      'zone',
      zoneRows.map((z) => z.id),
    ),
    loadLocationLinksMap(
      db,
      'marker',
      markerRows.map((m) => m.id),
    ),
    loadLocationNotesMap(
      db,
      'zone',
      zoneRows.map((z) => z.id),
    ),
    loadLocationNotesMap(
      db,
      'marker',
      markerRows.map((m) => m.id),
    ),
  ]);
  const hiddenCategoryIds = new Set(settings.hidden_category_ids);
  const zoneLead = pickNewestMapPhotoByTarget(zonePhotoRows);
  const markerLead = pickNewestMapPhotoByTarget(markerPhotoRows);

  const zones = zoneRows
    .map((row) => attachCategoriesToEntity(row, zoneCategories.get(String(row.id)) || []))
    .filter((row) => isVisibleOnSurface(row, surface))
    .filter((row) => canViewLocation(row, auth, viewer))
    .map((row) => {
      const projected = projectLocationAudienceForViewer(
        attachNotesToEntity(
          attachLinksToEntity(row, zoneLinks.get(String(row.id)) || []),
          zoneNotes.get(String(row.id)) || [],
        ),
        auth,
        viewer,
      );
      return {
        ...publicPlaceFields(projected, hiddenCategoryIds),
        links: projected.links || [],
        name: textOrEmpty(projected.name),
        points: textOrEmpty(projected.points),
        color: textOrEmpty(projected.color),
        description: textOrEmpty(projected.description),
        notes: projected.notes || [],
        map_lead_photo: serializeMapLeadPhoto('zone', row.id, zoneLead.get(String(row.id))),
      };
    });

  const markers = markerRows
    .map((row) => attachCategoriesToEntity(row, markerCategories.get(String(row.id)) || []))
    .filter((row) => isVisibleOnSurface(row, surface))
    .filter((row) => canViewLocation(row, auth, viewer))
    .map((row) => {
      const projected = projectLocationAudienceForViewer(
        attachNotesToEntity(
          attachLinksToEntity(row, markerLinks.get(String(row.id)) || []),
          markerNotes.get(String(row.id)) || [],
        ),
        auth,
        viewer,
      );
      return {
        ...publicPlaceFields(projected, hiddenCategoryIds),
        links: projected.links || [],
        label: textOrEmpty(projected.label),
        x_pct: Number(projected.x_pct),
        y_pct: Number(projected.y_pct),
        note: textOrEmpty(projected.note),
        notes: projected.notes || [],
        map_lead_photo: serializeMapLeadPhoto('marker', row.id, markerLead.get(String(row.id))),
      };
    });

  const categories = categoryRows
    .filter((row) => !hiddenCategoryIds.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      slug: textOrEmpty(row.slug),
      label: textOrEmpty(row.label),
      emoji: textOrEmpty(row.emoji),
      color: textOrEmpty(row.color),
      description: textOrEmpty(row.description),
      is_infrastructure: !!Number(row.is_infrastructure),
      sort_order: Number(row.sort_order) || 0,
      // Désencombrement (lot 5) : le front n'affiche ces lieux qu'une fois la carte zoomée.
      zoom_only: !!Number(row.zoom_only),
    }));

  const knownCategoryIds = new Set(categories.map((c) => c.id));
  /** Lieux réellement servis, dans la forme des cibles d'étape (`zone:z1`, `marker:m4`). */
  const visiblePlaceKeys = new Set([
    ...zones.map((zone) => `zone:${zone.id}`),
    ...markers.map((marker) => `marker:${marker.id}`),
  ]);
  // `map_id` et `selectable_map_ids` sont des réglages d'exploitation : la carte servie sort
  // déjà sous `map`, et les cartes proposées sortent sous `maps` avec leur intitulé — une
  // liste d'identifiants nus n'apprendrait rien au front et lui ferait deviner les libellés.
  const { map_id: _mapIdSetting, selectable_map_ids: _selectableIds, ...publicSettings } = settings;
  const maps = await listSelectablePlanMaps(settings, map);
  return {
    map: serializePlanMap(map),
    /**
     * Plans proposés au changement (« Réglages → Plan affiché »). Vide quand
     * l'établissement n'en publie qu'un : le front n'affiche alors aucun sélecteur.
     */
    maps,
    settings: {
      ...publicSettings,
      default_category_ids: settings.default_category_ids.filter((id) => knownCategoryIds.has(id)),
      hidden_category_ids: settings.hidden_category_ids,
    },
    categories,
    zones,
    markers,
    // Parcours publiés sur la surface (lot 8) : listes ordonnées de lieux, sans progression
    // enregistrée — l'avancement vit sur l'appareil. Les étapes sont confrontées aux lieux
    // réellement publiés ci-dessus : une étape dont le lieu est supprimé, masqué ou hors
    // audience du lecteur ne sort pas d'ici. Sans ce filtre, la puce annonçait « 5 étapes »
    // quand la feuille en affichait 3, et le texte d'une étape survivait au masquage de son
    // lieu (`docs/AUDIT_PARCOURS_2026-09.md` §2.4 et §2.5).
    routes: attachStepsToRoutes(
      routeRows.map(serializeRouteRow),
      stepRows.filter((step) =>
        visiblePlaceKeys.has(`${String(step.target_type)}:${String(step.target_id)}`),
      ),
    ),
  };
}

module.exports = {
  PLAN_SETTING_SUFFIXES,
  PLAN_SHARED_SETTING_SUFFIXES,
  loadPlanSettings,
  allowedPlanMapIds,
  listSelectablePlanMaps,
  resolvePlanMap,
  buildPlanContent,
  findPlanPlace,
  serializePlanMap,
};
