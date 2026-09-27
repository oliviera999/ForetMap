'use strict';

/**
 * Photos des fiches espèces — table `plant_photos` (migration 303, piste C de l'audit du
 * 25/09/2026, § 1.3.6, § 2.3 et § 3.5).
 *
 * Logique pure (aucun accès base) partagée par la lecture (`enrichPlantRow`) et l'écriture
 * (`speciesService`) :
 *
 * - **Source de vérité : la table.** Une ligne par photo (fiche, emplacement, lien, auteur,
 *   licence, provenance, ordre). L'emplacement (`kind`) reprend le nom de l'ancienne colonne
 *   (`photo`, `photo_species`, `photo_leaf`, `photo_flower`, `photo_fruit`,
 *   `photo_harvest_part`).
 * - **Miroir (T2, retiré au T3).** Les 6 colonnes photo et le couple `photo_credit` /
 *   `photo_licence` de `plants` restent écrits à chaque enregistrement, dérivés de la table :
 *   un retour arrière du code retrouve des colonnes à jour.
 * - **Repli de lecture (T1, retiré au T3).** Une fiche sans ligne dans la table, ou dont les
 *   colonnes ne correspondent plus au miroir de ses lignes (écrites par une version
 *   antérieure du code après un retour arrière, par une migration de contenu ou par un
 *   script), est lue depuis ses colonnes. L'attribution photo par photo déjà connue pour un
 *   même lien est conservée.
 *
 * Découpage des anciennes colonnes : celui du code historique (`parseLinkCandidates` —
 * retours à la ligne et virgules), rejoué à l'identique par la migration 303.
 * Attribution héritée : `photo_credit` / `photo_licence` décrivent l'image principale (le
 * premier lien de `photo`) ; toute ligne qui pointe **le même fichier** — même lien, quel
 * que soit l'emplacement — reçoit la même attribution (même fichier, même auteur).
 */

const { asTrimmedString } = require('../shared/stringHelpers');

/** Emplacements photo d'une fiche, dans l'ordre des anciennes colonnes. */
const PHOTO_KINDS = Object.freeze([
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);
const PHOTO_KIND_SET = new Set(PHOTO_KINDS);

const MAX_PHOTO_CREDIT_LENGTH = 255;
const MAX_PHOTO_LICENCE_LENGTH = 64;
const MAX_PHOTO_SOURCE_LENGTH = 32;
const MAX_PHOTO_SOURCE_URL_LENGTH = 1024;
/** Borne du nombre de photos d'une fiche (toutes catégories confondues). */
const MAX_PHOTOS_PER_PLANT = 60;

/** Découpe une ancienne colonne photo (retours à la ligne ou virgules), sans vides. */
function parsePhotoLinks(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/\n|,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalText(value, maxLength) {
  const s = asTrimmedString(value);
  if (!s) return null;
  return maxLength ? s.slice(0, maxLength) : s;
}

/**
 * Provenance déduite du lien, quand aucune n'est fournie : fichier téléversé, Wikimedia
 * Commons, iNaturalist ; `null` sinon.
 */
function inferPhotoSource(url) {
  const u = asTrimmedString(url).toLowerCase();
  if (!u) return null;
  if (u.startsWith('/uploads/')) return 'televersement';
  if (/^https:\/\/(upload|commons)\.wikimedia\.org\//.test(u)) return 'wikimedia_commons';
  if (/inaturalist/.test(u)) return 'inaturalist';
  return null;
}

/** Provenance normalisée : identifiant court en minuscules (`[a-z0-9_]`), sinon `null`. */
function normalizePhotoSource(value) {
  const s = asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_PHOTO_SOURCE_LENGTH);
  return s || null;
}

function kindRank(kind) {
  const idx = PHOTO_KINDS.indexOf(kind);
  return idx < 0 ? PHOTO_KINDS.length : idx;
}

/** Tri canonique : emplacement (ordre des colonnes), puis ordre, puis identifiant. */
function sortPhotoRows(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      Number(a.id || 0) - Number(b.id || 0),
  );
}

/** Forme exposée d'une ligne (JSON des fiches). */
function toPublicPhoto(row) {
  return {
    id: row.id != null ? Number(row.id) : null,
    kind: row.kind,
    url: row.url,
    credit: row.credit ?? null,
    licence: row.licence ?? null,
    source: row.source ?? null,
    source_url: row.source_url ?? null,
    sort_order: Number(row.sort_order || 0),
  };
}

/** Clé d'appariement d'une photo : emplacement + lien. */
function photoKey(kind, url) {
  return `${kind}\u0001${url}`;
}

/**
 * Lignes photo déduites des anciennes colonnes d'une fiche (repli de lecture, écriture par
 * un client historique ou un import). `knownRows` : lignes déjà connues de la fiche, dont
 * l'attribution est conservée pour un même emplacement + lien.
 */
function photoRowsFromColumns(plantRow, knownRows = []) {
  const row = plantRow || {};
  const known = new Map();
  for (const k of knownRows || []) {
    if (k && k.kind && k.url && !known.has(photoKey(k.kind, k.url))) {
      known.set(photoKey(k.kind, k.url), k);
    }
  }
  const mainUrl = parsePhotoLinks(row.photo)[0] || null;
  const mainCredit = optionalText(row.photo_credit, MAX_PHOTO_CREDIT_LENGTH);
  const mainLicence = optionalText(row.photo_licence, MAX_PHOTO_LICENCE_LENGTH);
  const out = [];
  for (const kind of PHOTO_KINDS) {
    parsePhotoLinks(row[kind]).forEach((url, idx) => {
      const prev = known.get(photoKey(kind, url));
      const isMain = mainUrl != null && url === mainUrl;
      out.push({
        id: prev?.id ?? null,
        kind,
        url,
        credit: isMain ? mainCredit : (prev?.credit ?? null),
        licence: isMain ? mainLicence : (prev?.licence ?? null),
        source: prev?.source ?? inferPhotoSource(url),
        source_url: prev?.source_url ?? null,
        sort_order: idx,
      });
    });
  }
  return out;
}

/**
 * Colonnes miroir (6 colonnes photo + `photo_credit` / `photo_licence`) dérivées des lignes.
 * Le crédit « principal » est celui de la première photo de l'emplacement `photo`.
 */
function mirrorColumnsFromPhotoRows(rows) {
  const sorted = sortPhotoRows(rows);
  const out = {};
  for (const kind of PHOTO_KINDS) {
    const urls = sorted.filter((r) => r.kind === kind).map((r) => r.url);
    out[kind] = urls.length > 0 ? urls.join('\n') : null;
  }
  const main = sorted.find((r) => r.kind === 'photo');
  out.photo_credit = main ? optionalText(main.credit, MAX_PHOTO_CREDIT_LENGTH) : null;
  out.photo_licence = main ? optionalText(main.licence, MAX_PHOTO_LICENCE_LENGTH) : null;
  return out;
}

/**
 * Vrai si les colonnes de la fiche sont exactement le miroir de ses lignes : mêmes liens
 * par emplacement (dans l'ordre), même attribution principale. Faux = les colonnes ont été
 * écrites sans la table (retour arrière du code, migration de contenu, script).
 */
function photoColumnsMatchRows(plantRow, rows) {
  const mirror = mirrorColumnsFromPhotoRows(rows);
  for (const kind of PHOTO_KINDS) {
    const a = parsePhotoLinks(plantRow?.[kind]);
    const b = parsePhotoLinks(mirror[kind]);
    if (a.length !== b.length || a.some((url, i) => url !== b[i])) return false;
  }
  const credit = optionalText(plantRow?.photo_credit, MAX_PHOTO_CREDIT_LENGTH);
  const licence = optionalText(plantRow?.photo_licence, MAX_PHOTO_LICENCE_LENGTH);
  return credit === mirror.photo_credit && licence === mirror.photo_licence;
}

/**
 * Photos effectives d'une fiche (lecture T1).
 *
 * @param {object} plantRow ligne `plants`
 * @param {Array<object>|undefined} rows lignes `plant_photos` de la fiche
 * @returns {{ photos: object[], columns: object, origin: 'table'|'colonnes' }} `columns` :
 *   les 8 champs historiques à exposer (compatibilité du JSON)
 */
function resolvePlantPhotos(plantRow, rows) {
  const tableRows = Array.isArray(rows) ? rows : [];
  if (tableRows.length > 0 && photoColumnsMatchRows(plantRow, tableRows)) {
    const sorted = sortPhotoRows(tableRows);
    return {
      photos: sorted.map(toPublicPhoto),
      columns: mirrorColumnsFromPhotoRows(sorted),
      origin: 'table',
    };
  }
  const derived = photoRowsFromColumns(plantRow, tableRows);
  // Ni ligne ni lien dans les colonnes : rien à relire, la fiche n'est pas « en repli ».
  const origin = tableRows.length === 0 && derived.length === 0 ? 'table' : 'colonnes';
  return {
    photos: derived.map(toPublicPhoto),
    columns: {
      ...Object.fromEntries(PHOTO_KINDS.map((kind) => [kind, plantRow?.[kind] ?? null])),
      photo_credit: plantRow?.photo_credit ?? null,
      photo_licence: plantRow?.photo_licence ?? null,
    },
    origin,
  };
}

/**
 * Normalise la liste `photos` envoyée par un client (formulaire de fiche). Renvoie
 * `{ rows }` ou `{ error }` (message pour un 400). Les liens sont validés par
 * `validateLink(kind, url)` (même règle que les anciennes colonnes : image HTTPS directe ou
 * fichier téléversé) ; un doublon emplacement + lien est retiré.
 */
function normalizeClientPhotos(input, validateLink) {
  if (!Array.isArray(input)) return { error: 'photos : liste attendue' };
  if (input.length > MAX_PHOTOS_PER_PLANT) {
    return { error: `photos : ${MAX_PHOTOS_PER_PLANT} photos au plus par fiche` };
  }
  const seen = new Set();
  const perKindCount = new Map();
  const rows = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return { error: 'photos : entrée invalide' };
    const kind = asTrimmedString(entry.kind);
    if (!PHOTO_KIND_SET.has(kind)) return { error: `photos : emplacement inconnu (${kind})` };
    const url = asTrimmedString(entry.url);
    if (!url) continue;
    const linkError = typeof validateLink === 'function' ? validateLink(kind, url) : null;
    if (linkError) return { error: linkError };
    const key = photoKey(kind, url);
    if (seen.has(key)) continue;
    seen.add(key);
    const sourceUrl = optionalText(entry.source_url);
    if (sourceUrl) {
      if (sourceUrl.length > MAX_PHOTO_SOURCE_URL_LENGTH) {
        return { error: `${kind} : lien de la page source trop long` };
      }
      if (!/^https:\/\//i.test(sourceUrl)) {
        return { error: `${kind} : la page source doit être un lien HTTPS` };
      }
    }
    const order = perKindCount.get(kind) || 0;
    perKindCount.set(kind, order + 1);
    rows.push({
      id: null,
      kind,
      url,
      credit: optionalText(entry.credit, MAX_PHOTO_CREDIT_LENGTH),
      licence: optionalText(entry.licence ?? entry.license, MAX_PHOTO_LICENCE_LENGTH),
      source: normalizePhotoSource(entry.source) || inferPhotoSource(url),
      source_url: sourceUrl,
      sort_order: order,
    });
  }
  return { rows };
}

/**
 * Différence entre les lignes existantes et les lignes voulues d'une fiche, appariées par
 * emplacement + lien : `update` (même photo, attribution ou ordre éventuellement changés),
 * `insert` (nouvelle photo), `remove` (identifiants des photos retirées, doublons compris).
 */
function diffPhotoRows(existingRows, wantedRows) {
  const byKey = new Map();
  const remove = [];
  for (const row of existingRows || []) {
    const key = photoKey(row.kind, row.url);
    if (byKey.has(key)) remove.push(row.id);
    else byKey.set(key, row);
  }
  const update = [];
  const insert = [];
  const kept = new Set();
  for (const wanted of wantedRows || []) {
    const key = photoKey(wanted.kind, wanted.url);
    const prev = byKey.get(key);
    if (prev && !kept.has(key)) {
      kept.add(key);
      const changed =
        (prev.credit ?? null) !== (wanted.credit ?? null) ||
        (prev.licence ?? null) !== (wanted.licence ?? null) ||
        (prev.source ?? null) !== (wanted.source ?? null) ||
        (prev.source_url ?? null) !== (wanted.source_url ?? null) ||
        Number(prev.sort_order || 0) !== Number(wanted.sort_order || 0);
      if (changed) update.push({ ...wanted, id: prev.id });
      continue;
    }
    insert.push(wanted);
  }
  for (const [key, row] of byKey) {
    if (!kept.has(key)) remove.push(row.id);
  }
  return { update, insert, remove };
}

/**
 * Ajoute une photo téléversée aux photos d'une fiche : en tête (`prepend`) ou en fin
 * (`append`) de son emplacement, sans doublon. Les ordres de l'emplacement sont renumérotés.
 */
function insertPhotoRow(rows, newRow, position = 'append') {
  const sorted = sortPhotoRows(rows);
  if (sorted.some((r) => r.kind === newRow.kind && r.url === newRow.url)) return sorted;
  const sameKind = sorted.filter((r) => r.kind === newRow.kind);
  const others = sorted.filter((r) => r.kind !== newRow.kind);
  const nextKind = position === 'prepend' ? [newRow, ...sameKind] : [...sameKind, newRow];
  return sortPhotoRows([...others, ...nextKind.map((r, idx) => ({ ...r, sort_order: idx }))]);
}

module.exports = {
  PHOTO_KINDS,
  MAX_PHOTOS_PER_PLANT,
  MAX_PHOTO_CREDIT_LENGTH,
  MAX_PHOTO_LICENCE_LENGTH,
  parsePhotoLinks,
  inferPhotoSource,
  normalizePhotoSource,
  sortPhotoRows,
  toPublicPhoto,
  photoRowsFromColumns,
  mirrorColumnsFromPhotoRows,
  photoColumnsMatchRows,
  resolvePlantPhotos,
  normalizeClientPhotos,
  diffPhotoRows,
  insertPhotoRow,
};
