'use strict';

/**
 * Service unique des liens question ↔ ressource de ForetMap (audit du 25/09/2026, § 3.2.3).
 *
 * **Une seule table** : `resource_question_links` (RQL). Les tables historiques
 * `quiz_question_species` et `quiz_question_tutorials` ne sont plus ni lues ni écrites
 * (temps 1 et 2 du retrait, § 3.5) : la migration 300 a repris dans RQL les liens qui n'y
 * figuraient pas (`origin = 'editorial'`, non bloquants). Leur `DROP` est une migration
 * future (plan dans le commentaire de `migrations/300_learning_links_single_source.sql`).
 *
 * Toutes les fonctions reçoivent `db` (`{ queryAll, queryOne, execute }`, ou la connexion
 * d'une transaction `withTransaction`) : l'appelant choisit la transaction.
 *
 * Invariants tenus ici :
 *   - un traitement automatique ne purge **que ses propres liens** : le rapprochement par
 *     mots-clés de l'import et de l'édition QCM écrit et purge `origin = 'keyword'`, jamais
 *     un lien relu (`import`), saisi (`manual`), repris (`editorial`) ou produit par un
 *     script (`generated`, `auto`) — règle du lot P0 ;
 *   - un rattachement automatique (`/suggest`) n'écrase jamais un couple existant
 *     (`INSERT IGNORE`, statut `suggested`, non bloquant) ;
 *   - la fiche (`audience: 'sheet'`) montre les liens **approuvés** vers une question
 *     **active**, bloquants ou non — la même règle que la fiche d'un terme du glossaire.
 *
 * Hors de ce service, et volontairement : le moteur de verrouillage (`learningGatingAcknowledge`,
 * `learningGatingCooldown`, `learningGatingLockMode`, `learningLinksBulk`,
 * `learningGatingOrphans`), commun à G&L (tables `gl_*`), qui lit RQL de son côté. Ce service
 * ne touche aucune table `gl_*`.
 */

/** Origines d'un lien. Les quatre premières sont aussi celles de `sanitizeLinkInput`. */
const LINK_ORIGINS = Object.freeze({
  MANUAL: 'manual', // saisi par un professeur dans l'écran des liens
  AUTO: 'auto', // proposition automatique (script `learning:suggest-links`)
  IMPORT: 'import', // livré par migration puis relu (144, 226, 227) — souvent bloquant
  GENERATED: 'generated', // scripts d'enrichissement
  KEYWORD: 'keyword', // rapprochement par mots-clés de l'import / de l'édition QCM (lot P0)
  EDITORIAL: 'editorial', // reprise des tables historiques qqs / qqt (migration 300)
});

/** Statuts d'un lien. Seul `approved` compte pour la fiche et pour le verrouillage. */
const LINK_STATUSES = Object.freeze({
  APPROVED: 'approved',
  SUGGESTED: 'suggested',
  REJECTED: 'rejected',
});

/** Colonnes de question renvoyées sur une fiche, par type de ressource (format historique). */
const SHEET_BASE_COLUMNS = [
  'qq.question_code',
  'qq.question',
  'qq.categorie_slug',
  'qq.niveau',
  'qq.difficulte',
];
const SHEET_COLUMNS = Object.freeze({
  // La fiche espèce affiche aussi l'illustration de la question (`PlantSummaryBlocks.jsx`).
  plant: Object.freeze([...SHEET_BASE_COLUMNS, 'qq.photo_url', 'qq.photo_legende']),
  tutorial: Object.freeze([...SHEET_BASE_COLUMNS]),
  glossary: Object.freeze([...SHEET_BASE_COLUMNS]),
});

const AUDIENCES = Object.freeze(['sheet']);

/** Clé d'unicité d'un couple ressource/question, alignée sur l'index unique de RQL. */
function linkKey(resourceType, resourceRef, questionCode) {
  return `${resourceType}|${resourceRef}|${questionCode}`;
}

/**
 * Questions rattachées à une ressource, pour un public donné.
 *
 * `sheet` : liens approuvés vers une question active, bloquants ou non, dans l'ordre du
 * catalogue (catégorie, numéro). C'est le format de `GET /api/plants/:id/quiz-questions`,
 * de `GET /api/tutorials/:id/quiz-questions` et de `linkedQuizQuestions` du glossaire.
 *
 * @param {{ queryAll: Function }} db
 * @param {{ resourceType: 'plant'|'tutorial'|'glossary', resourceRef: string|number,
 *           audience?: 'sheet' }} options
 * @returns {Promise<object[]>}
 */
async function listQuestionsForResource(db, { resourceType, resourceRef, audience = 'sheet' }) {
  if (!AUDIENCES.includes(audience)) {
    throw new Error(`Public de liens non pris en charge : ${audience}`);
  }
  const columns = SHEET_COLUMNS[resourceType];
  if (!columns) throw new Error(`Type de ressource non pris en charge : ${resourceType}`);
  // Liste de colonnes : constante de ce module, jamais une entrée utilisateur.
  return db.queryAll(
    `SELECT ${columns.join(', ')}
       FROM resource_question_links r
       JOIN quiz_questions qq ON qq.question_code = r.question_code
      WHERE r.resource_type = ? AND r.resource_ref = ?
        AND r.status = 'approved' AND qq.statut = 'actif'
      ORDER BY qq.categorie_slug ASC, qq.numero_dans_categorie ASC`,
    [resourceType, String(resourceRef)],
  );
}

/**
 * Liste filtrée de l'écran des liens (`GET /api/learning-links`).
 *
 * @param {{ queryAll: Function, queryOne: Function }} db
 * @param {{ whereSql: string, params: any[], maxRows: number }} filter clause `WHERE` produite
 *   par `core.linksWhereClause(core.buildLinksFilter(...).where)` (paramétrée)
 * @returns {Promise<{ links: object[], total: number }>}
 */
async function listLinks(db, { whereSql, params, maxRows }) {
  const limit = Math.max(1, Math.floor(Number(maxRows) || 1));
  const links = await db.queryAll(
    `SELECT * FROM resource_question_links
     ${whereSql}
     ORDER BY resource_type, resource_ref, question_code
     LIMIT ${limit}`,
    params,
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS n FROM resource_question_links ${whereSql}`,
    params,
  );
  return { links, total: Number(countRow?.n || 0) };
}

/** Un lien par son identifiant, ou `null`. */
async function findLinkById(db, id) {
  const row = await db.queryOne('SELECT * FROM resource_question_links WHERE id = ? LIMIT 1', [id]);
  return row || null;
}

/** Un lien par sa clé (type, ressource, question), ou `null`. */
async function findLinkByKey(db, { resourceType, resourceRef, questionCode }) {
  const row = await db.queryOne(
    `SELECT * FROM resource_question_links
      WHERE resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
    [resourceType, String(resourceRef), questionCode],
  );
  return row || null;
}

/**
 * Crée ou met à jour un lien saisi par un professeur (idempotent sur la clé unique).
 *
 * Sur un lien existant, le caractère bloquant et l'origine ne sont réécrits que si le corps
 * les fournit (`provided`, B3) : recréer un couple sans les dire ne conditionne rien.
 *
 * @param {{ execute: Function, queryOne: Function }} db
 * @param {object} value sortie `value` de `sanitizeLinkInput`
 * @param {{ provided?: { is_gating?: boolean, origin?: boolean },
 *           actor?: { userType?: string|null, userId?: string|null } }} [options]
 * @returns {Promise<object|null>} le lien relu
 */
async function upsertLink(db, value, { provided = {}, actor = {} } = {}) {
  await db.execute(
    `INSERT INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note,
       created_by_user_type, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_gating = COALESCE(?, is_gating), weight = VALUES(weight),
       origin = COALESCE(?, origin),
       confidence = VALUES(confidence), status = VALUES(status), note = VALUES(note),
       updated_at = NOW()`,
    [
      value.resource_type,
      value.resource_ref,
      value.question_code,
      value.is_gating,
      value.weight,
      value.origin,
      value.confidence == null ? null : value.confidence,
      value.status,
      value.note,
      actor.userType ?? null,
      actor.userId ?? null,
      provided.is_gating ? value.is_gating : null,
      provided.origin ? value.origin : null,
    ],
  );
  return findLinkByKey(db, {
    resourceType: value.resource_type,
    resourceRef: value.resource_ref,
    questionCode: value.question_code,
  });
}

/** Colonnes modifiables d'un lien existant (`PATCH /api/learning-links/:id`). */
const UPDATABLE_COLUMNS = Object.freeze(['is_gating', 'weight', 'status', 'note']);

/**
 * Modifie un lien existant. `changes` est déjà validé par l'appelant ; seules les colonnes
 * de `UPDATABLE_COLUMNS` présentes (valeur `!== undefined`) sont écrites.
 *
 * @returns {Promise<object|null>} le lien relu, ou `null` s'il n'existe pas
 */
async function updateLink(db, id, changes = {}) {
  const sets = [];
  const params = [];
  for (const column of UPDATABLE_COLUMNS) {
    if (changes[column] === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(changes[column]);
  }
  if (!sets.length) throw new Error('Aucune modification');
  params.push(id);
  const result = await db.execute(
    `UPDATE resource_question_links SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
    params,
  );
  if (!result?.affectedRows) return null;
  return findLinkById(db, id);
}

/** Supprime un lien. @returns {Promise<boolean>} `true` s'il existait */
async function deleteLinkById(db, id) {
  const result = await db.execute('DELETE FROM resource_question_links WHERE id = ?', [id]);
  return Number(result?.affectedRows || 0) > 0;
}

/** Couples déjà liés, tous statuts confondus (un couple rejeté n'est pas re-proposé). */
async function listLinkKeys(db) {
  const rows = await db.queryAll(
    'SELECT resource_type, resource_ref, question_code FROM resource_question_links',
  );
  return new Set(rows.map((r) => linkKey(r.resource_type, r.resource_ref, r.question_code)));
}

/**
 * Enregistre des propositions de rattachement : `status = 'suggested'`, non bloquantes, sans
 * jamais toucher un couple existant (`INSERT IGNORE`).
 *
 * @param {{ execute: Function }} db
 * @param {Array<{ resource_type, resource_ref, question_code, origin, confidence, reason? }>} candidates
 * @param {{ userType?: string|null, userId?: string|null }} [actor]
 * @returns {Promise<number>} nombre de liens réellement insérés
 */
async function insertSuggestedLinks(db, candidates, actor = {}) {
  let inserted = 0;
  for (const c of candidates || []) {
    const result = await db.execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note,
         created_by_user_type, created_by_user_id)
       VALUES (?, ?, ?, 0, 1, ?, ?, 'suggested', ?, ?, ?)`,
      [
        c.resource_type,
        c.resource_ref,
        c.question_code,
        c.origin,
        c.confidence,
        String(c.reason || '').slice(0, 255) || null,
        actor.userType ?? null,
        actor.userId ?? null,
      ],
    );
    inserted += result?.affectedRows ? 1 : 0;
  }
  return inserted;
}

/**
 * Remplace les liens glossaire produits par le rapprochement par mots-clés (import et édition
 * QCM). Ne purge **que** `origin = 'keyword'` — la curation relue (migration 227, stockée
 * sous `origin = 'import'` et bloquante), les saisies (`manual`), les reprises (`editorial`)
 * et les liens des scripts (`generated`, `auto`) ne sont jamais touchés (lot P0, audit du
 * 25/09/2026, § 1.3.3). `INSERT IGNORE` : un lien déjà présent (relu, bloquant) n'est pas
 * rétrogradé.
 *
 * @param {{ execute: Function }} db connexion de la transaction de l'import / de l'upsert
 * @param {{ questionCode?: string|null,
 *           links: Array<{ glossaryCode: string, questionCode: string }> }} options
 *   `questionCode` fourni : purge limitée à cette question (édition) ; absent : purge globale
 *   des liens par mots-clés (import du catalogue, recalculés pour les lignes importées).
 * @returns {Promise<number>} nombre de couples soumis à l'insertion
 */
async function replaceKeywordGlossaryLinks(db, { questionCode = null, links = [] } = {}) {
  if (questionCode) {
    await db.execute(
      `DELETE FROM resource_question_links
        WHERE resource_type = 'glossary' AND origin = 'keyword' AND question_code = ?`,
      [questionCode],
    );
  } else {
    await db.execute(
      `DELETE FROM resource_question_links
        WHERE resource_type = 'glossary' AND origin = 'keyword'`,
    );
  }
  for (const link of links) {
    await db.execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, status, origin, is_gating)
       VALUES ('glossary', ?, ?, 'approved', 'keyword', 0)`,
      [link.glossaryCode, link.questionCode],
    );
  }
  return links.length;
}

/**
 * Ressources rattachables et leurs compteurs, pour l'écran de couverture
 * (`GET /api/learning-links/resources`).
 *
 * `gating_count` ne compte que les liens vers une question **active** : c'est ce qui
 * verrouille réellement. Les liens bloquants vers une question désactivée sont comptés à
 * part (`inactive_gating_count`), pour que l'écran reste juste après une désactivation en
 * masse (lot B ; audit du 25/09/2026, § 1.5).
 */
const COVERAGE_SOURCES = Object.freeze({
  tutorial: {
    select: `SELECT t.id AS ref, t.title AS label, t.type AS kind, t.is_active AS active`,
    from: 'FROM tutorials t',
    join: `LEFT JOIN resource_question_links l
             ON l.resource_type = 'tutorial'
            -- CAST(... AS CHAR) sort en utf8mb4_general_ci alors que resource_ref est en
            -- utf8mb4_unicode_ci : sans COLLATE explicite, MariaDB refuse la comparaison
            -- (ER_CANT_AGGREGATE_2COLLATIONS) des que la connexion applicative s'en mele.
            AND l.resource_ref = CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci`,
    group: 'GROUP BY t.id',
    order: 'ORDER BY t.sort_order ASC, t.title ASC',
  },
  plant: {
    select: `SELECT p.id AS ref, p.name AS label, p.scientific_name AS kind, 1 AS active`,
    from: 'FROM plants p',
    join: `LEFT JOIN resource_question_links l
             ON l.resource_type = 'plant'
            AND l.resource_ref = CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci`,
    group: 'GROUP BY p.id',
    order: 'ORDER BY p.name ASC',
  },
  glossary: {
    select: `SELECT g.glossary_code AS ref, g.terme AS label, g.categorie AS kind, 1 AS active`,
    from: 'FROM glossary_terms g',
    join: `LEFT JOIN resource_question_links l
             ON l.resource_type = 'glossary'
            AND l.resource_ref = g.glossary_code COLLATE utf8mb4_unicode_ci`,
    group: "WHERE g.statut = 'actif' GROUP BY g.glossary_code",
    order: 'ORDER BY g.terme ASC',
  },
});

/**
 * @param {{ queryAll: Function }} db
 * @param {'tutorial'|'plant'|'glossary'} resourceType
 * @returns {Promise<object[]|null>} `null` pour un type sans source
 */
async function listResourceCoverage(db, resourceType) {
  const src = COVERAGE_SOURCES[resourceType];
  if (!src) return null;
  const rows = await db.queryAll(
    `${src.select},
            COUNT(l.id) AS links_count,
            SUM(CASE WHEN l.status = 'approved' AND l.is_gating = 1 AND lq.statut = 'actif'
                     THEN 1 ELSE 0 END) AS gating_count,
            SUM(CASE WHEN l.status = 'approved' AND l.is_gating = 1
                      AND (lq.statut IS NULL OR lq.statut <> 'actif')
                     THEN 1 ELSE 0 END) AS inactive_gating_count,
            SUM(CASE WHEN l.status = 'suggested' THEN 1 ELSE 0 END) AS suggested_count
       ${src.from}
       ${src.join}
       LEFT JOIN quiz_questions lq ON lq.question_code = l.question_code
      ${src.group}
      ${src.order}`,
  );
  return rows.map((r) => ({
    ref: String(r.ref),
    label: r.label,
    tutorial_type: r.kind,
    is_active: Number(r.active) === 1,
    links_count: Number(r.links_count) || 0,
    gating_count: Number(r.gating_count) || 0,
    inactive_gating_count: Number(r.inactive_gating_count) || 0,
    suggested_count: Number(r.suggested_count) || 0,
  }));
}

module.exports = {
  LINK_ORIGINS,
  LINK_STATUSES,
  SHEET_COLUMNS,
  UPDATABLE_COLUMNS,
  linkKey,
  listQuestionsForResource,
  listLinks,
  findLinkById,
  findLinkByKey,
  upsertLink,
  updateLink,
  deleteLinkById,
  listLinkKeys,
  insertSuggestedLinks,
  replaceKeywordGlossaryLinks,
  listResourceCoverage,
};
