/**
 * Photos d'une fiche espèce côté client — une photo = un lien, un emplacement (`kind`), un
 * auteur (`credit`), une licence, une provenance (migration 302, `plant_photos` ; piste C de
 * l'audit du 25/09/2026, § 1.3.6).
 *
 * Le serveur expose `plant.photos` ; les anciens champs (`photo`, `photo_species`…,
 * `photo_credit`, `photo_licence`) restent présents dans le JSON pour compatibilité. Les
 * helpers ci-dessous lisent la liste, et ne retombent sur les anciens champs que pour une
 * fiche qui n'a pas de liste (réponse d'un serveur antérieur, fiche fabriquée en test).
 */

/** Emplacements, dans l'ordre des anciennes colonnes. */
export const PHOTO_KIND_ORDER = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];

/** Licences proposées à la saisie (liste libre : toute autre valeur reste acceptée). */
export const COMMON_PHOTO_LICENCES = [
  'CC0',
  'Public domain',
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC BY 3.0',
  'CC BY-SA 3.0',
  'CC BY 2.0',
  'CC BY-SA 2.0',
];

function kindRank(kind) {
  const idx = PHOTO_KIND_ORDER.indexOf(kind);
  return idx < 0 ? PHOTO_KIND_ORDER.length : idx;
}

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Découpe d'une ancienne colonne photo — même règle que `parseLinkCandidates`
 * (`plantFormValues.js`), recopiée pour que ce module ne dépende pas du formulaire.
 */
function parseLinkCandidates(value) {
  const s = text(value);
  if (!s || s === '-') return [];
  return s
    .split(/\n|,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Tri stable par emplacement (l'ordre à l'intérieur d'un emplacement est conservé). */
function sortByKind(list) {
  return list
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => kindRank(a.entry.kind) - kindRank(b.entry.kind) || a.idx - b.idx)
    .map(({ entry }) => entry);
}

/**
 * Photos d'une fiche : `plant.photos` si présent, sinon dérivées des anciens champs (le
 * crédit principal va au premier lien de `photo` et à toute copie du même lien).
 * @returns {Array<{ kind: string, url: string, credit: string|null, licence: string|null,
 *   source: string|null, source_url: string|null }>}
 */
export function plantPhotoList(plant) {
  if (!plant || typeof plant !== 'object') return [];
  if (Array.isArray(plant.photos)) {
    return sortByKind(
      plant.photos
        .filter((p) => p && text(p.url) && PHOTO_KIND_ORDER.includes(p.kind))
        .map((p) => ({
          kind: p.kind,
          url: text(p.url),
          credit: text(p.credit) || null,
          licence: text(p.licence) || null,
          source: text(p.source) || null,
          source_url: text(p.source_url) || null,
        })),
    );
  }
  const mainUrl = parseLinkCandidates(plant.photo)[0] || null;
  const out = [];
  for (const kind of PHOTO_KIND_ORDER) {
    for (const url of parseLinkCandidates(plant[kind])) {
      const isMain = mainUrl != null && url === mainUrl;
      out.push({
        kind,
        url,
        credit: isMain ? text(plant.photo_credit) || null : null,
        licence: isMain ? text(plant.photo_licence) || null : null,
        source: null,
        source_url: null,
      });
    }
  }
  return out;
}

/**
 * Attribution d'une photo affichée, retrouvée par son lien (et son emplacement si connu).
 * @returns {{ credit: string|null, licence: string|null, source_url: string|null } | null}
 */
export function photoAttributionFor(plant, url, kind = null) {
  const u = text(url);
  if (!u) return null;
  const list = plantPhotoList(plant);
  const match =
    (kind ? list.find((p) => p.kind === kind && p.url === u) : null) ||
    list.find((p) => p.url === u);
  if (!match || (!match.credit && !match.licence && !match.source_url)) return null;
  return { credit: match.credit, licence: match.licence, source_url: match.source_url };
}

/** Liste de formulaire (valeurs texte, jamais `null`) tirée d'une fiche. */
export function formPhotosFromPlant(plant) {
  return plantPhotoList(plant).map((p) => ({
    kind: p.kind,
    url: p.url,
    credit: p.credit || '',
    licence: p.licence || '',
    source: p.source || '',
    source_url: p.source_url || '',
  }));
}

/**
 * Ajoute une photo à la liste du formulaire : en tête (`prepend`) ou en fin (`append`) de
 * son emplacement, sans doublon de lien dans l'emplacement. Ne mute pas `list`.
 */
export function addFormPhoto(list, entry, position = 'append') {
  const current = Array.isArray(list) ? list : [];
  const kind = PHOTO_KIND_ORDER.includes(entry?.kind) ? entry.kind : 'photo_species';
  const url = text(entry?.url);
  if (!url) return current;
  if (current.some((p) => p.kind === kind && text(p.url) === url)) return current;
  const row = {
    kind,
    url,
    credit: text(entry.credit),
    licence: text(entry.licence ?? entry.license),
    source: text(entry.source),
    source_url: text(entry.source_url),
  };
  const others = current.filter((p) => p.kind !== kind);
  const sameKind = current.filter((p) => p.kind === kind);
  const nextKind = position === 'prepend' ? [row, ...sameKind] : [...sameKind, row];
  return sortByKind([...others, ...nextKind]);
}

/** Photos d'un emplacement, avec leur index dans la liste complète (édition en place). */
export function photosOfKind(list, kind) {
  return (Array.isArray(list) ? list : [])
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => photo.kind === kind);
}

/** Libellé court d'une attribution : « Auteur — Licence ». */
export function formatPhotoAttribution(attribution) {
  if (!attribution) return '';
  return [text(attribution.credit), text(attribution.licence)].filter(Boolean).join(' — ');
}
