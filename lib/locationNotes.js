'use strict';

/**
 * Compléments réservés **multiples** d'un lieu (zone / repère) — migration 263.
 *
 * Ce module remplace les colonnes `restricted_note*` des quatre tables de lieux. Il porte la
 * **validation et le SQL** ; le filtrage par rôle et par groupe vit dans
 * `lib/locationAudience.js`, comme pour les liens.
 *
 * Deux choses le distinguent de `lib/locationLinks.js`, dont il reprend par ailleurs la forme :
 *
 * 1. **Audience vide = encadrement**, pas « suit le lieu ». C'est la sémantique historique du
 *    complément réservé, et elle doit être préservée : un complément est confidentiel par
 *    nature. Un lien laissé sans audience est au contraire un lien ordinaire.
 * 2. **Les mêmes lignes servent la carte et la Visite.** `visit_zones.id` vaut `zones.id`
 *    (la synchronisation écrit le même identifiant), donc une table clé sur
 *    `(location_kind, location_id)` couvre les deux surfaces. C'est ce qui permet de
 *    supprimer la duplication de colonnes que la Visite traînait depuis la migration 240 —
 *    duplication qu'il fallait recopier à la main dans six écritures, et dont un oubli avait
 *    rendu publique une note réservée (corrigé en 262).
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
const LOCATION_NOTE_KINDS = Object.freeze(['zone', 'marker']);

const NOTE_TITLE_MAX_LENGTH = 160;
/** Reprise de `RESTRICTED_NOTE_MAX_LENGTH` : le corps garde la même borne qu'avant. */
const NOTE_BODY_MAX_LENGTH = 8000;
/**
 * Plafond par lieu. Six blocs de texte sur une fiche consultée au téléphone, c'est déjà la
 * limite du lisible — au-delà, le besoin relève d'une page de ressources, pas d'un lieu.
 * Volontairement plus bas que les 12 liens : un lien tient sur une ligne, pas une note.
 */
const LOCATION_NOTES_MAX = 6;

/**
 * Entrée d'API → liste normalisée, ou `null` si le champ n'est pas fourni (UPDATE partiel).
 *
 * `[]` explicite vaut « retirer tous les compléments » : c'est ce que produit l'interface
 * quand on supprime la dernière note, et le confondre avec « non fourni » rendrait la
 * suppression impossible.
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: Array<object> | null } | { ok: false, error: string }}
 */
function normalizeLocationNotesInput(value, { field = 'notes' } = {}) {
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: `${field} doit être un tableau` };
  if (value.length > LOCATION_NOTES_MAX) {
    return { ok: false, error: `${field} : ${LOCATION_NOTES_MAX} compléments maximum par lieu` };
  }
  const out = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `${field}[${index}] doit être un objet { title, body }` };
    }
    const title = String(entry.title ?? '').trim();
    if (title.length > NOTE_TITLE_MAX_LENGTH) {
      return {
        ok: false,
        error: `${field}[${index}].title : ${NOTE_TITLE_MAX_LENGTH} caractères maximum`,
      };
    }
    const body = String(entry.body ?? '').trim();
    if (!body) return { ok: false, error: `${field}[${index}].body : texte requis` };
    if (body.length > NOTE_BODY_MAX_LENGTH) {
      return {
        ok: false,
        error: `${field}[${index}].body : ${NOTE_BODY_MAX_LENGTH} caractères maximum`,
      };
    }
    const audience = normalizeRoleSlugInput(entry.audience_role_slugs, {
      field: `${field}[${index}].audience_role_slugs`,
    });
    if (!audience.ok) return audience;
    const audienceGroups = normalizeGroupIdInput(entry.audience_group_ids, {
      field: `${field}[${index}].audience_group_ids`,
    });
    if (!audienceGroups.ok) return audienceGroups;
    out.push({
      title,
      body,
      audience_role_slugs: audience.value === null ? [] : audience.value,
      audience_group_ids: audienceGroups.value === null ? [] : audienceGroups.value,
      sort_order: index,
    });
  }
  return { ok: true, value: out };
}

/** Ligne SQL → forme d'API. */
function serializeLocationNoteRow(row) {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    audience_role_slugs: parseRoleSlugList(row.audience_role_slugs),
    audience_group_ids: parseGroupIdList(row.audience_group_ids),
    sort_order: Number(row.sort_order) || 0,
  };
}

const NOTES_SELECT =
  'SELECT id, location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order FROM location_notes';

/**
 * Charge les compléments de plusieurs lieux d'un coup.
 * @returns {Promise<Map<string, Array<object>>>} clé = identifiant de lieu
 */
async function loadLocationNotesMap(db, kind, ids) {
  const out = new Map();
  const list = (Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean);
  if (!list.length || !LOCATION_NOTE_KINDS.includes(kind)) return out;
  const placeholders = list.map(() => '?').join(',');
  const rows = await db.queryAll(
    `${NOTES_SELECT} WHERE location_kind = ? AND location_id IN (${placeholders})
     ORDER BY location_id ASC, sort_order ASC, id ASC`,
    [kind, ...list],
  );
  for (const row of rows) {
    const key = String(row.location_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(serializeLocationNoteRow(row));
  }
  return out;
}

/** Pose `notes` sur une entité (tableau vide si le lieu n'en a aucun). */
function attachNotesToEntity(entity, notes) {
  if (!entity || typeof entity !== 'object') return entity;
  return { ...entity, notes: Array.isArray(notes) ? notes : [] };
}

/**
 * Remplace la liste des compléments d'un lieu (supprimer puis réinsérer).
 * L'ordre fait partie de la donnée et les identifiants n'ont aucune valeur pour l'auteur.
 */
async function replaceLocationNotes(db, kind, locationId, notes) {
  if (!LOCATION_NOTE_KINDS.includes(kind)) return;
  const id = String(locationId || '');
  if (!id) return;
  await db.execute('DELETE FROM location_notes WHERE location_kind = ? AND location_id = ?', [
    kind,
    id,
  ]);
  const list = Array.isArray(notes) ? notes : [];
  for (let index = 0; index < list.length; index += 1) {
    const note = list[index];
    await db.execute(
      `INSERT INTO location_notes
         (location_kind, location_id, title, body, audience_role_slugs, audience_group_ids, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        kind,
        id,
        String(note.title ?? ''),
        String(note.body),
        serializeRoleSlugList(note.audience_role_slugs),
        serializeGroupIdList(note.audience_group_ids),
        index,
      ],
    );
  }
}

/**
 * Nettoyage à la suppression d'un lieu : la cible étant polymorphe, aucune clé étrangère ne
 * peut s'en charger. Vaut pour la carte **et** la visite, qui partagent l'identifiant.
 */
async function deleteLocationNotes(db, kind, locationId) {
  if (!LOCATION_NOTE_KINDS.includes(kind)) return;
  const id = String(locationId || '');
  if (!id) return;
  await db.execute('DELETE FROM location_notes WHERE location_kind = ? AND location_id = ?', [
    kind,
    id,
  ]);
}

/** Vérifie l'existence des groupes cités par les compléments d'une écriture. */
async function assertLocationNotesGroupsExist(db, notes, { field = 'notes' } = {}) {
  const list = Array.isArray(notes) ? notes : [];
  for (let index = 0; index < list.length; index += 1) {
    const check = await assertKnownGroupIds(db, list[index]?.audience_group_ids, {
      field: `${field}[${index}].audience_group_ids`,
    });
    if (!check.ok) return check;
  }
  return { ok: true };
}

module.exports = {
  LOCATION_NOTE_KINDS,
  LOCATION_NOTES_MAX,
  NOTE_TITLE_MAX_LENGTH,
  NOTE_BODY_MAX_LENGTH,
  normalizeLocationNotesInput,
  serializeLocationNoteRow,
  loadLocationNotesMap,
  attachNotesToEntity,
  replaceLocationNotes,
  deleteLocationNotes,
  assertLocationNotesGroupsExist,
};
