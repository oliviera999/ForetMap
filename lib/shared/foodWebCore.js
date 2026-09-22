'use strict';

/**
 * Noyau partagé « réseau trophique » (interactions biotiques).
 *
 * Source de vérité unique des types d'interaction + logique CRUD générique,
 * réutilisable par ForetMap (`species_interactions` ↔ `plants`) ET par
 * Gnomes & Licornes (`gl_species_interactions` ↔ `gl_species`). Seule la
 * configuration de table change ; la validation et les règles métier restent
 * communes (cf. `docs/GL_ARCHITECTURE.md`, couche « Noyaux »).
 */

/**
 * Types communs aux deux produits — l'ENUM de `gl_species_interactions`.
 *
 * GL s'arrête ici : les cinq types ajoutés par la migration 272 n'existent que dans
 * `species_interactions` (ForetMap). Les accepter côté GL insérerait une valeur absente de
 * son ENUM, donc une erreur SQL à l'écriture — ou, pire, une troncature silencieuse. C'est
 * `allowedTypes` (cf. `makeFoodWebStore`) qui tient cette frontière, pas une seconde ENUM.
 */
const INTERACTION_TYPES_CORE = Object.freeze([
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'nitrification',
  'symbiose',
  'competition',
  'detritivorie',
  'frugivorie',
  'granivorie',
  'parasitisme',
  'excretion',
  'assimilation',
]);

/** Types ForetMap : le socle commun, plus les cinq de la migration 272. */
const INTERACTION_TYPES = Object.freeze([
  ...INTERACTION_TYPES_CORE,
  'mutualisme',
  'commensalisme',
  'mycophagie',
  'allelopathie',
  'facilitation',
]);

const INTERACTION_TYPE_LABELS = Object.freeze({
  pollinisation: 'Pollinisation',
  herbivorie: 'Herbivorie',
  predation: 'Prédation',
  plante_hote: 'Plante hôte',
  decomposition: 'Décomposition',
  nitrification: 'Nitrification',
  symbiose: 'Symbiose',
  competition: 'Compétition',
  detritivorie: 'Détritivorie',
  frugivorie: 'Frugivorie',
  granivorie: 'Granivorie',
  parasitisme: 'Parasitisme',
  excretion: 'Excrétion',
  assimilation: 'Assimilation',
  mutualisme: 'Mutualisme',
  commensalisme: 'Commensalisme',
  mycophagie: 'Mycophagie',
  allelopathie: 'Allélopathie',
  facilitation: 'Facilitation',
});

const INTERACTION_TYPE_SET = new Set(INTERACTION_TYPES);

const MAX_DESCRIPTION_LEN = 255;
const MAX_SOURCE_REF_LEN = 255;

/**
 * Niveau de preuve d'un lien (migration 272).
 *
 * Un lien relevé dans la cour et un lien recopié d'une flore ne valent pas la même chose, et
 * rien ne les distinguait : la colonne le dit, l'affichage le montre (trait pointillé pour une
 * hypothèse, trait renforcé pour une observation de terrain).
 */
const EVIDENCE_LEVELS = Object.freeze(['bibliographie', 'observe_site', 'hypothese']);

const EVIDENCE_LEVEL_LABELS = Object.freeze({
  bibliographie: 'Documenté',
  observe_site: 'Observé sur le site',
  hypothese: 'Hypothèse',
});

const DEFAULT_EVIDENCE_LEVEL = 'bibliographie';

/**
 * Efficacité d'un pollinisateur — tous les visiteurs d'une fleur ne la pollinisent pas.
 * Ne s'applique qu'à `pollinisation` : ailleurs, la valeur doit rester nulle.
 */
const POLLINATION_EFFICACIES = Object.freeze([
  'efficace',
  'accessoire',
  'visiteur',
  'voleur_nectar',
]);

const POLLINATION_EFFICACY_LABELS = Object.freeze({
  efficace: 'Pollinisateur efficace',
  accessoire: 'Pollinisateur accessoire',
  visiteur: 'Simple visiteur',
  voleur_nectar: 'Voleur de nectar',
});

/** Seul type auquel `pollination_efficacy` s'applique. */
const POLLINATION_TYPE = 'pollinisation';

/**
 * Métadonnées d'orientation par type d'interaction.
 *
 * Convention de saisie : `from` = l'espèce qui réalise l'action (l'acteur),
 * `to` = l'espèce cible. Le sens d'affichage de la flèche suit en revanche la
 * convention écologique du réseau trophique : la flèche pointe dans le sens du
 * flux d'énergie/matière, c'est-à-dire « est mangée par » (de la ressource
 * consommée vers le consommateur).
 *
 * - `directed`  : la flèche va de `from` vers `to` (l'acteur agit sur la cible).
 * - `consumed`  : INVERSÉ — la flèche va de `to` vers `from` (l'énergie remonte
 *                 de la proie/ressource vers le consommateur = `from`).
 * - `mutual`    : relation symétrique (double sens), aucun « mangeur » désigné.
 */
/**
 * Sens du flux de MATIÈRE, distinct du sens d'affichage de la flèche.
 *
 * Les deux ne coïncident pas, et c'est la source de confusion que `matterFlow` lève.
 * La convention de saisie est uniforme — `from` = acteur, `to` = cible — mais selon le
 * type, la matière remonte ou descend ce lien :
 *
 *   `to_from`  la matière va de la cible vers l'acteur : le puceron pompe la sève, le
 *              cloporte mange la litière. C'est le cas trophique ordinaire.
 *   `from_to`  la matière va de l'acteur vers la cible : le poisson excrète l'ammonium
 *              que la bactérie consomme, la bactérie produit le nitrate que la plante
 *              assimile. Le lien se lit dans l'autre sens, et c'est ce qui rendait
 *              `nitrification` illisible tant qu'il mélangeait les deux.
 *   `none`     pas de transfert de matière significatif : pollinisation, hébergement,
 *              compétition sont des services ou des rapports, pas des flux.
 *
 * `orientation` en découle et doit rester cohérent : `to_from` ⇒ `consumed`,
 * `from_to` ⇒ `directed`, `none` ⇒ `directed` ou `mutual`. Un test le vérifie
 * (`tests/food-web-matter-flow.test.js`) plutôt qu'une colonne SQL de plus : la
 * duplication entre ce fichier et son miroir ESM est déjà une de trop.
 */
const INTERACTION_TYPE_META = Object.freeze({
  pollinisation: { orientation: 'directed', relation: 'pollinise', matterFlow: 'none' },
  herbivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  predation: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  plante_hote: { orientation: 'directed', relation: 'héberge', matterFlow: 'none' },
  decomposition: { orientation: 'consumed', relation: 'est décomposée par', matterFlow: 'to_from' },
  nitrification: { orientation: 'directed', relation: 'enrichit', matterFlow: 'from_to' },
  symbiose: { orientation: 'mutual', relation: 'en symbiose avec', matterFlow: 'none' },
  competition: { orientation: 'mutual', relation: 'en compétition avec', matterFlow: 'none' },
  detritivorie: { orientation: 'consumed', relation: 'est fragmentée par', matterFlow: 'to_from' },
  frugivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  granivorie: { orientation: 'consumed', relation: 'est mangée par', matterFlow: 'to_from' },
  parasitisme: { orientation: 'consumed', relation: 'est parasitée par', matterFlow: 'to_from' },
  excretion: {
    orientation: 'directed',
    relation: 'enrichit par ses déjections',
    matterFlow: 'from_to',
  },
  assimilation: { orientation: 'directed', relation: 'est assimilé par', matterFlow: 'from_to' },
  // Migration 272. Quatre services ou rapports (aucun transfert de matière) et une
  // consommation : la mycophagie est un flux trophique, contrairement à la détritivorie
  // dans laquelle elle était rangée — un collembole qui broute un mycélium mange un être
  // vivant, pas de la matière morte.
  mutualisme: { orientation: 'mutual', relation: 'en mutualisme avec', matterFlow: 'none' },
  commensalisme: { orientation: 'directed', relation: 'profite de', matterFlow: 'none' },
  mycophagie: { orientation: 'consumed', relation: 'est consommée par', matterFlow: 'to_from' },
  allelopathie: {
    orientation: 'directed',
    relation: 'inhibe par ses substances',
    matterFlow: 'none',
  },
  facilitation: {
    orientation: 'directed',
    relation: 'facilite l’installation de',
    matterFlow: 'none',
  },
});

const DEFAULT_INTERACTION_META = Object.freeze({
  orientation: 'directed',
  relation: 'interagit avec',
  matterFlow: 'none',
});

/** Métadonnées (orientation + libellé de relation) d'un type, avec repli neutre. */
function interactionTypeMeta(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_META[key] || DEFAULT_INTERACTION_META;
}

/**
 * Oriente une interaction pour l'affichage (sens écologique de la flèche).
 *
 * @returns {{ tailId: number|null, headId: number|null, symmetric: boolean, relation: string }}
 *   `tailId` = origine de la flèche (sans tête), `headId` = pointe de la flèche.
 */
function orientInteraction(fromId, toId, type) {
  const meta = interactionTypeMeta(type);
  const from = fromId == null ? null : Number(fromId);
  const to = toId == null ? null : Number(toId);
  if (meta.orientation === 'consumed') {
    return { tailId: to, headId: from, symmetric: false, relation: meta.relation };
  }
  return {
    tailId: from,
    headId: to,
    symmetric: meta.orientation === 'mutual',
    relation: meta.relation,
  };
}

/** Libellé FR d'un type, avec repli sur la valeur brute. */
function interactionTypeLabel(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_LABELS[key] || type || 'Interaction';
}

/** Sens du flux de matière d'un type (`to_from` / `from_to` / `none`). */
function interactionMatterFlow(type) {
  return interactionTypeMeta(type).matterFlow || 'none';
}

/** Libellé FR d'un niveau de preuve, avec repli sur « Documenté ». */
function evidenceLevelLabel(level) {
  const key = String(level || '')
    .trim()
    .toLowerCase();
  return EVIDENCE_LEVEL_LABELS[key] || EVIDENCE_LEVEL_LABELS[DEFAULT_EVIDENCE_LEVEL];
}

/** Libellé FR d'une efficacité de pollinisation (chaîne vide si non renseignée). */
function pollinationEfficacyLabel(efficacy) {
  const key = String(efficacy || '')
    .trim()
    .toLowerCase();
  return POLLINATION_EFFICACY_LABELS[key] || '';
}

function isInteractionType(type, allowedTypes = INTERACTION_TYPES) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  if (allowedTypes === INTERACTION_TYPES) return INTERACTION_TYPE_SET.has(key);
  return (allowedTypes || INTERACTION_TYPES).includes(key);
}

/** Valeur d'ENUM normalisée (minuscules, chaîne vide ⇒ null). */
function normalizeEnumValue(value) {
  const text = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  return text === '' ? null : text;
}

/**
 * Normalise + valide une saisie d'interaction (indifférent au produit).
 * Accepte les clés snake_case (`from_id`) ou camelCase (`fromId`).
 *
 * @param {object} raw saisie brute
 * @param {{ allowedTypes?: string[], quality?: boolean }} [options]
 *   `allowedTypes` restreint le vocabulaire (GL : les 14 types communs) ;
 *   `quality` ajoute les champs de qualité du lien (migration 272, ForetMap seul).
 * @returns {{ value: { fromId: number, toId: number|null, type: string, description: string|null,
 *   evidenceLevel?: string, pollinationEfficacy?: string|null, sourceRef?: string|null },
 *   errors: string[] }}
 */
function normalizeInteractionInput(raw = {}, options = {}) {
  const allowedTypes = options.allowedTypes || INTERACTION_TYPES;
  const withQuality = options.quality !== false;
  const errors = [];
  const fromId = Number(raw.from_id ?? raw.fromId);
  const toRaw = raw.to_id ?? raw.toId;
  const type = String(raw.interaction_type ?? raw.interactionType ?? '')
    .trim()
    .toLowerCase();

  if (!Number.isInteger(fromId) || fromId <= 0) {
    errors.push('Espèce source invalide');
  }

  let toId = null;
  if (toRaw != null && String(toRaw).trim() !== '') {
    toId = Number(toRaw);
    if (!Number.isInteger(toId) || toId <= 0) errors.push('Espèce cible invalide');
  }

  if (Number.isInteger(fromId) && fromId > 0 && toId != null && toId === fromId) {
    errors.push('Une espèce ne peut pas interagir avec elle-même');
  }

  if (!isInteractionType(type, allowedTypes)) {
    errors.push('Type d’interaction invalide');
  }

  let description = raw.description == null ? null : String(raw.description).trim();
  if (description === '') description = null;
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    description = description.slice(0, MAX_DESCRIPTION_LEN);
  }

  const value = { fromId, toId, type, description };
  if (!withQuality) return { value, errors };

  const evidenceRaw = normalizeEnumValue(raw.evidence_level ?? raw.evidenceLevel);
  if (evidenceRaw != null && !EVIDENCE_LEVELS.includes(evidenceRaw)) {
    errors.push('Niveau de preuve invalide');
  }
  value.evidenceLevel = EVIDENCE_LEVELS.includes(evidenceRaw)
    ? evidenceRaw
    : DEFAULT_EVIDENCE_LEVEL;

  const efficacyRaw = normalizeEnumValue(raw.pollination_efficacy ?? raw.pollinationEfficacy);
  if (efficacyRaw != null && !POLLINATION_EFFICACIES.includes(efficacyRaw)) {
    errors.push('Efficacité de pollinisation invalide');
  } else if (efficacyRaw != null && type !== POLLINATION_TYPE) {
    // Une « efficacité de pollinisation » sur une prédation ne veut rien dire : la refuser
    // plutôt que l'effacer en silence, pour que la saisie soit corrigée à la source.
    errors.push('L’efficacité de pollinisation ne s’applique qu’à la pollinisation');
  }
  value.pollinationEfficacy =
    type === POLLINATION_TYPE && POLLINATION_EFFICACIES.includes(efficacyRaw) ? efficacyRaw : null;

  let sourceRef = raw.source_ref ?? raw.sourceRef;
  sourceRef = sourceRef == null ? null : String(sourceRef).trim();
  if (sourceRef === '') sourceRef = null;
  if (sourceRef && sourceRef.length > MAX_SOURCE_REF_LEN) {
    sourceRef = sourceRef.slice(0, MAX_SOURCE_REF_LEN);
  }
  value.sourceRef = sourceRef;

  return { value, errors };
}

/**
 * Fabrique un magasin CRUD pour une table d'interactions donnée.
 *
 * Les noms de table/colonnes proviennent d'une configuration interne (jamais
 * d'une entrée utilisateur) : l'interpolation SQL est donc sûre.
 *
 * @param {{ queryOne: Function, execute: Function }} db helpers base de données
 * @param {{ table: string, fromCol: string, toCol: string, refTable: string, refIdCol?: string,
 *   allowedTypes?: string[], quality?: boolean }} config
 *   `allowedTypes` borne le vocabulaire accepté (GL : `INTERACTION_TYPES_CORE`) ;
 *   `quality` (défaut : faux) active les colonnes de qualité du lien, que seule
 *   `species_interactions` porte.
 */
function makeFoodWebStore(db, config) {
  const { queryOne, execute } = db || {};
  if (typeof queryOne !== 'function' || typeof execute !== 'function') {
    throw new Error('makeFoodWebStore: db.queryOne et db.execute requis');
  }
  const { table, fromCol, toCol, refTable } = config || {};
  const refIdCol = config?.refIdCol || 'id';
  if (!table || !fromCol || !toCol || !refTable) {
    throw new Error('makeFoodWebStore: configuration de table incomplète');
  }
  const allowedTypes = config?.allowedTypes || INTERACTION_TYPES;
  const withQuality = config?.quality === true;
  const normalizeOptions = { allowedTypes, quality: withQuality };
  const QUALITY_COLUMNS = ', evidence_level, pollination_efficacy, source_ref';
  /** Colonnes de qualité d'un enregistrement normalisé, dans l'ordre des requêtes. */
  const qualityValues = (value) =>
    withQuality ? [value.evidenceLevel, value.pollinationEfficacy, value.sourceRef] : [];

  async function refExists(id) {
    if (!Number.isInteger(id) || id <= 0) return false;
    const row = await queryOne(
      `SELECT ${refIdCol} AS id FROM ${refTable} WHERE ${refIdCol} = ? LIMIT 1`,
      [id],
    );
    return !!row;
  }

  async function getById(id) {
    return queryOne(
      `SELECT id, ${fromCol} AS from_id, ${toCol} AS to_id, interaction_type, description${
        withQuality ? QUALITY_COLUMNS : ''
      }
         FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  /** @returns {Promise<{ id:number }|null>} l'éventuel doublon (from/to/type), to NULL inclus. */
  async function findDuplicate(fromId, toId, type, excludeId = null) {
    return queryOne(
      `SELECT id FROM ${table}
        WHERE ${fromCol} = ? AND ${toCol} <=> ? AND interaction_type = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
      [fromId, toId, type, excludeId, excludeId],
    );
  }

  async function create(rawInput) {
    const { value, errors } = normalizeInteractionInput(rawInput, normalizeOptions);
    if (errors.length) return { ok: false, status: 400, error: errors[0], errors };
    if (!(await refExists(value.fromId))) {
      return { ok: false, status: 400, error: 'Espèce source introuvable' };
    }
    if (value.toId != null && !(await refExists(value.toId))) {
      return { ok: false, status: 400, error: 'Espèce cible introuvable' };
    }
    if (await findDuplicate(value.fromId, value.toId, value.type)) {
      return { ok: false, status: 409, error: 'Interaction déjà existante' };
    }
    const result = await execute(
      `INSERT INTO ${table} (${fromCol}, ${toCol}, interaction_type, description${
        withQuality ? QUALITY_COLUMNS : ''
      })
       VALUES (?, ?, ?, ?${withQuality ? ', ?, ?, ?' : ''})`,
      [value.fromId, value.toId, value.type, value.description, ...qualityValues(value)],
    );
    return { ok: true, status: 201, row: await getById(result.insertId) };
  }

  async function update(id, rawInput) {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, status: 400, error: 'Identifiant invalide' };
    }
    const existing = await getById(id);
    if (!existing) return { ok: false, status: 404, error: 'Interaction introuvable' };
    const { value, errors } = normalizeInteractionInput(rawInput, normalizeOptions);
    if (errors.length) return { ok: false, status: 400, error: errors[0], errors };
    if (!(await refExists(value.fromId))) {
      return { ok: false, status: 400, error: 'Espèce source introuvable' };
    }
    if (value.toId != null && !(await refExists(value.toId))) {
      return { ok: false, status: 400, error: 'Espèce cible introuvable' };
    }
    if (await findDuplicate(value.fromId, value.toId, value.type, id)) {
      return { ok: false, status: 409, error: 'Interaction déjà existante' };
    }
    await execute(
      `UPDATE ${table}
          SET ${fromCol} = ?, ${toCol} = ?, interaction_type = ?, description = ?${
            withQuality ? ', evidence_level = ?, pollination_efficacy = ?, source_ref = ?' : ''
          }
        WHERE id = ?`,
      [value.fromId, value.toId, value.type, value.description, ...qualityValues(value), id],
    );
    return { ok: true, status: 200, row: await getById(id) };
  }

  async function remove(id) {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, status: 400, error: 'Identifiant invalide' };
    }
    const existing = await getById(id);
    if (!existing) return { ok: false, status: 404, error: 'Interaction introuvable' };
    await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return { ok: true, status: 200, row: existing };
  }

  return { getById, create, update, remove, refExists };
}

module.exports = {
  INTERACTION_TYPES,
  INTERACTION_TYPES_CORE,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPE_META,
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  DEFAULT_EVIDENCE_LEVEL,
  POLLINATION_EFFICACIES,
  POLLINATION_EFFICACY_LABELS,
  POLLINATION_TYPE,
  MAX_DESCRIPTION_LEN,
  MAX_SOURCE_REF_LEN,
  interactionTypeLabel,
  interactionTypeMeta,
  interactionMatterFlow,
  evidenceLevelLabel,
  pollinationEfficacyLabel,
  orientInteraction,
  isInteractionType,
  normalizeInteractionInput,
  makeFoodWebStore,
};
