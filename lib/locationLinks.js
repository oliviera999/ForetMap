'use strict';

/**
 * Liens documentaires d'un lieu (zone / repère) — migration 261.
 *
 * **Pourquoi une table et pas un lien dans la description.** La confidentialité d'un lieu se
 * jouait jusqu'ici au niveau du **bloc de texte** : la description est publique, le complément
 * réservé ne l'est pas (`lib/locationAudience.js`). Poser « cette fiche-ci pour les profs,
 * celle-là pour tout le monde » obligeait donc à couper le texte en deux. Ici chaque lien
 * porte **sa propre audience**, et le filtrage est fait par le serveur : un lien hors audience
 * ne quitte jamais la base — exactement comme `restricted_note`.
 *
 * Ce module porte la **validation et le SQL**. Le filtrage par rôle vit dans
 * `lib/locationAudience.js` (qui tient déjà les slugs et la notion de gestionnaire), pour que
 * toutes les surfaces — carte de travail, Visite, Plan, plan des personnels — en héritent par
 * `projectLocationAudienceForViewer` sans code supplémentaire.
 *
 * Politique d'URL : identique au rendu Markdown (`src/shared/platform/markdown.js`), pour
 * qu'un auteur n'ait pas deux règles à retenir selon l'endroit où il colle son lien.
 */

const {
  assertKnownGroupIds,
  normalizeGroupIdInput,
  normalizeRoleSlugInput,
  parseGroupIdList,
  parseRoleSlugList,
  serializeGroupIdList,
  serializeRoleSlugList,
} = require('./locationAudience');

/** Types de lieu porteurs (colonne `location_kind`). */
const LOCATION_LINK_KINDS = Object.freeze(['zone', 'marker']);

const LINK_LABEL_MAX_LENGTH = 160;
const LINK_URL_MAX_LENGTH = 2048;
/**
 * Plafond par lieu. Ce n'est pas une contrainte technique : au-delà, la fiche cesse d'être
 * lisible sur un téléphone, et le besoin relève d'une page de ressources, pas d'un lieu.
 */
const LOCATION_LINKS_MAX = 12;

/**
 * `//exemple.org` et `/\exemple.org` sont refusés : les deux valent une origine externe
 * déguisée en chemin (les navigateurs normalisent `\` en `/`).
 * Miroir de `INTERNAL_HREF_RE` / `CONTACT_HREF_RE` dans `src/shared/platform/markdown.js`.
 */
const INTERNAL_URL_RE = /^\/(?![/\\])[^\s<>"'`]*$/;
const CONTACT_URL_RE = /^(?:mailto|tel):[^\s<>"'`]+$/i;
const EXTERNAL_URL_RE = /^https?:\/\/[^\s<>"'`]+$/i;

/**
 * @param {unknown} url
 * @returns {'external' | 'internal' | 'contact' | null} `null` = cible refusée.
 */
function classifyLocationLinkUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  if (EXTERNAL_URL_RE.test(raw)) return 'external';
  if (CONTACT_URL_RE.test(raw)) return 'contact';
  if (INTERNAL_URL_RE.test(raw)) return 'internal';
  return null;
}

/**
 * @param {unknown} url
 * @returns {{ ok: true, value: string, kind: string } | { ok: false, error: string }}
 */
function normalizeLocationLinkUrl(url, { field = 'links[].url' } = {}) {
  const raw = String(url ?? '').trim();
  if (!raw) return { ok: false, error: `${field} : adresse requise` };
  if (raw.length > LINK_URL_MAX_LENGTH) {
    return { ok: false, error: `${field} : ${LINK_URL_MAX_LENGTH} caractères maximum` };
  }
  const kind = classifyLocationLinkUrl(raw);
  if (!kind) {
    return {
      ok: false,
      error: `${field} : adresse non reconnue (attendu https://…, /page-de-l-application, mailto: ou tel:)`,
    };
  }
  return { ok: true, value: raw, kind };
}

/**
 * Entrée d'API → liste normalisée, ou `null` si le champ n'est pas fourni (UPDATE partiel).
 *
 * `[]` explicite vaut « effacer tous les liens » : c'est ce que produit l'interface quand on
 * retire la dernière ligne, et le confondre avec « non fourni » rendrait la suppression
 * impossible.
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: Array<object> | null } | { ok: false, error: string }}
 */
function normalizeLocationLinksInput(value, { field = 'links' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: `${field} doit être un tableau` };
  if (value.length > LOCATION_LINKS_MAX) {
    return { ok: false, error: `${field} : ${LOCATION_LINKS_MAX} liens maximum par lieu` };
  }
  const out = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `${field}[${index}] doit être un objet { label, url }` };
    }
    const label = String(entry.label ?? '').trim();
    if (!label) return { ok: false, error: `${field}[${index}].label : libellé requis` };
    if (label.length > LINK_LABEL_MAX_LENGTH) {
      return {
        ok: false,
        error: `${field}[${index}].label : ${LINK_LABEL_MAX_LENGTH} caractères maximum`,
      };
    }
    const url = normalizeLocationLinkUrl(entry.url, { field: `${field}[${index}].url` });
    if (!url.ok) return url;
    const audience = normalizeRoleSlugInput(entry.audience_role_slugs, {
      field: `${field}[${index}].audience_role_slugs`,
    });
    if (!audience.ok) return audience;
    const audienceGroups = normalizeGroupIdInput(entry.audience_group_ids, {
      field: `${field}[${index}].audience_group_ids`,
    });
    if (!audienceGroups.ok) return audienceGroups;
    out.push({
      label,
      url: url.value,
      audience_role_slugs: audience.value === null ? [] : audience.value,
      audience_group_ids: audienceGroups.value === null ? [] : audienceGroups.value,
      sort_order: index,
    });
  }
  return { ok: true, value: out };
}

/** Ligne SQL → forme d'API (audience normalisée en tableau, `is_external` dérivé). */
function serializeLocationLinkRow(row) {
  return {
    id: Number(row.id),
    label: String(row.label ?? ''),
    url: String(row.url ?? ''),
    audience_role_slugs: parseRoleSlugList(row.audience_role_slugs),
    audience_group_ids: parseGroupIdList(row.audience_group_ids),
    // Dérivé plutôt que stocké : la politique de lien peut évoluer, la base ne doit pas
    // conserver une classification périmée. Le front s'en sert pour `target="_blank"`.
    is_external: classifyLocationLinkUrl(row.url) === 'external',
    sort_order: Number(row.sort_order) || 0,
  };
}

const LINKS_SELECT =
  'SELECT id, location_kind, location_id, label, url, audience_role_slugs, audience_group_ids, sort_order FROM location_links';

/**
 * Charge les liens de plusieurs lieux d'un coup.
 *
 * @param {{ queryAll: Function }} db
 * @param {'zone'|'marker'} kind
 * @param {Array<string>} ids
 * @returns {Promise<Map<string, Array<object>>>} clé = identifiant de lieu
 */
async function loadLocationLinksMap(db, kind, ids) {
  const out = new Map();
  const list = (Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean);
  if (!list.length || !LOCATION_LINK_KINDS.includes(kind)) return out;
  const placeholders = list.map(() => '?').join(',');
  const rows = await db.queryAll(
    `${LINKS_SELECT} WHERE location_kind = ? AND location_id IN (${placeholders})
     ORDER BY location_id ASC, sort_order ASC, id ASC`,
    [kind, ...list],
  );
  for (const row of rows) {
    const key = String(row.location_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(serializeLocationLinkRow(row));
  }
  return out;
}

/** Pose `links` sur une entité (tableau vide si le lieu n'en a aucun). */
function attachLinksToEntity(entity, links) {
  if (!entity || typeof entity !== 'object') return entity;
  return { ...entity, links: Array.isArray(links) ? links : [] };
}

/**
 * Remplace la liste des liens d'un lieu.
 *
 * Remplacement complet (supprimer puis réinsérer) plutôt que réconciliation ligne à ligne :
 * l'ordre fait partie de la donnée et les identifiants n'ont aucune valeur pour l'auteur.
 *
 * @param {{ execute: Function }} db
 * @param {'zone'|'marker'} kind
 * @param {string} locationId
 * @param {Array<object>} links déjà normalisés (`normalizeLocationLinksInput`)
 */
async function replaceLocationLinks(db, kind, locationId, links) {
  if (!LOCATION_LINK_KINDS.includes(kind)) return;
  const id = String(locationId || '');
  if (!id) return;
  await db.execute('DELETE FROM location_links WHERE location_kind = ? AND location_id = ?', [
    kind,
    id,
  ]);
  const list = Array.isArray(links) ? links : [];
  for (let index = 0; index < list.length; index += 1) {
    const link = list[index];
    await db.execute(
      `INSERT INTO location_links
         (location_kind, location_id, label, url, audience_role_slugs, audience_group_ids, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        kind,
        id,
        String(link.label),
        String(link.url),
        serializeRoleSlugList(link.audience_role_slugs),
        serializeGroupIdList(link.audience_group_ids),
        index,
      ],
    );
  }
}

/**
 * Nettoyage à la suppression d'un lieu : la cible étant polymorphe, aucune clé étrangère ne
 * peut s'en charger (même situation que `map_route_steps`).
 */
async function deleteLocationLinks(db, kind, locationId) {
  if (!LOCATION_LINK_KINDS.includes(kind)) return;
  const id = String(locationId || '');
  if (!id) return;
  await db.execute('DELETE FROM location_links WHERE location_kind = ? AND location_id = ?', [
    kind,
    id,
  ]);
}

/**
 * Vérifie l'existence des groupes cités par les liens d'une écriture.
 * Même motif que `assertAudienceGroupsExist` : une coquille d'identifiant produirait un lien
 * que plus personne ne voit, en silence.
 */
async function assertLocationLinksGroupsExist(db, links, { field = 'links' } = {}) {
  const list = Array.isArray(links) ? links : [];
  for (let index = 0; index < list.length; index += 1) {
    const check = await assertKnownGroupIds(db, list[index]?.audience_group_ids, {
      field: `${field}[${index}].audience_group_ids`,
    });
    if (!check.ok) return check;
  }
  return { ok: true };
}

module.exports = {
  assertLocationLinksGroupsExist,
  LOCATION_LINK_KINDS,
  LINK_LABEL_MAX_LENGTH,
  LINK_URL_MAX_LENGTH,
  LOCATION_LINKS_MAX,
  classifyLocationLinkUrl,
  normalizeLocationLinkUrl,
  normalizeLocationLinksInput,
  serializeLocationLinkRow,
  loadLocationLinksMap,
  attachLinksToEntity,
  replaceLocationLinks,
  deleteLocationLinks,
};
