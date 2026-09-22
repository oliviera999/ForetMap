'use strict';

/**
 * Notions des programmes officiels (migration 273) — référentiel partagé entre le quiz,
 * le glossaire et le routeur `/api/curriculum`.
 *
 * Règle centrale, valable partout : **une question de quiz hérite des notions de sa
 * catégorie**. Les 17 catégories sont rattachées une fois pour toutes (42 liaisons) ;
 * rattacher les ~500 questions une à une aurait laissé orpheline chaque question ajoutée
 * ensuite. `quiz_question_notions` ne sert qu'à l'exception : `ajout` pour une notion que
 * la catégorie n'a pas, `exclusion` pour une notion héritée qui ne correspond pas.
 *
 *   notions effectives = (notions de la catégorie − exclusions) ∪ ajouts
 *
 * Le glossaire, lui, n'a pas d'héritage : ses catégories (`ecologie`, `sol`…) sont des
 * familles de vocabulaire, pas des entrées de programme.
 */

/** Niveaux scolaires de l'ENUM `curriculum_notions.niveau`, dans l'ordre de la scolarité. */
const CURRICULUM_NIVEAUX = Object.freeze([
  { value: 'cycle3', label: 'Cycle 3 (CM1–6e)' },
  { value: 'cycle4', label: 'Cycle 4 (5e–3e)' },
  { value: 'seconde', label: 'Seconde' },
  { value: 'premiere_spe', label: 'Première — spécialité SVT' },
  { value: 'terminale_spe', label: 'Terminale — spécialité SVT' },
  { value: 'es_premiere', label: 'Première — enseignement scientifique' },
  { value: 'es_terminale', label: 'Terminale — enseignement scientifique' },
]);

const NIVEAU_LABEL_BY_VALUE = new Map(CURRICULUM_NIVEAUX.map((n) => [n.value, n.label]));

/** Valeur d'ENUM canonique, ou `null` si le niveau est absent / hors liste. */
function normalizeCurriculumNiveau(raw) {
  const value = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  return NIVEAU_LABEL_BY_VALUE.has(value) ? value : null;
}

/** Libellé affichable d'un niveau, ou la valeur brute si elle n'est pas connue. */
function curriculumNiveauLabel(raw) {
  const value = normalizeCurriculumNiveau(raw);
  return value ? NIVEAU_LABEL_BY_VALUE.get(value) : String(raw == null ? '' : raw);
}

/**
 * Identifiant de notion normalisé (majuscules, sans espaces), ou `null`.
 * Les identifiants du référentiel sont des chaînes saisies (`2-BIODIV`, `C4-VIV`) : la
 * casse d'un paramètre d'URL ne doit pas décider d'un 404.
 */
function normalizeNotionId(raw) {
  const value = String(raw == null ? '' : raw)
    .trim()
    .toUpperCase();
  if (!value || value.length > 32) return null;
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(value) ? value : null;
}

/** Liste d'identifiants de notions dédoublonnée, dans l'ordre d'apparition. */
function normalizeNotionIdList(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  for (const entry of source) {
    const id = normalizeNotionId(entry);
    if (id) seen.add(id);
  }
  return [...seen];
}

/**
 * Condition SQL portant sur une notion (alias `n`) : par identifiant, par niveau, ou les
 * deux. Retourne `null` quand aucun critère n'est demandé — l'appelant n'ajoute alors
 * aucun filtre.
 */
function buildNotionCriteria({ notionId, niveau } = {}) {
  const conditions = [];
  const params = [];
  const id = normalizeNotionId(notionId);
  if (id) {
    conditions.push('n.id = ?');
    params.push(id);
  }
  const level = normalizeCurriculumNiveau(niveau);
  if (level) {
    conditions.push('n.niveau = ?');
    params.push(level);
  }
  if (conditions.length === 0) return null;
  return { sql: conditions.join(' AND '), params };
}

/**
 * Fragment `AND EXISTS (…)` filtrant les questions de quiz sur une notion, héritage de
 * catégorie compris. `alias` est le nom sous lequel `quiz_questions` est désigné dans la
 * requête appelante (`q` pour `/api/quiz/questions`, `quiz_questions` pour le tirage, qui
 * n'en donne pas).
 *
 * @returns {{ sql: string, params: unknown[] }|null}
 */
function buildQuizQuestionNotionFilter({ notionId, niveau, alias = 'quiz_questions' } = {}) {
  const criteria = buildNotionCriteria({ notionId, niveau });
  if (!criteria) return null;
  const sql = `
    AND EXISTS (
      SELECT 1 FROM curriculum_notions n
       WHERE ${criteria.sql}
         AND (
           EXISTS (
             SELECT 1 FROM quiz_category_notions qcn
              WHERE qcn.categorie_slug = ${alias}.categorie_slug
                AND qcn.notion_id = n.id
                AND NOT EXISTS (
                  SELECT 1 FROM quiz_question_notions qqx
                   WHERE qqx.question_code = ${alias}.question_code
                     AND qqx.notion_id = n.id
                     AND qqx.mode = 'exclusion'
                )
           )
           OR EXISTS (
             SELECT 1 FROM quiz_question_notions qqa
              WHERE qqa.question_code = ${alias}.question_code
                AND qqa.notion_id = n.id
                AND qqa.mode = 'ajout'
           )
         )
    )`;
  return { sql, params: criteria.params };
}

/**
 * Fragment `AND EXISTS (…)` filtrant les **catégories** de quiz sur une notion : c'est ce
 * qui permet de ne proposer, après le choix d'une notion, que les catégories qui la
 * traitent — au lieu d'une liste complète dont la plupart des entrées ne tireraient rien.
 */
function buildQuizCategoryNotionFilter({ notionId, niveau, alias = 'quiz_categories' } = {}) {
  const criteria = buildNotionCriteria({ notionId, niveau });
  if (!criteria) return null;
  const sql = `
    AND EXISTS (
      SELECT 1 FROM quiz_category_notions qcn
        JOIN curriculum_notions n ON n.id = qcn.notion_id
       WHERE qcn.categorie_slug = ${alias}.slug
         AND ${criteria.sql}
    )`;
  return { sql, params: criteria.params };
}

/** Même fragment pour les termes de glossaire (sans héritage). */
function buildGlossaryTermNotionFilter({ notionId, niveau, alias = 'glossary_terms' } = {}) {
  const criteria = buildNotionCriteria({ notionId, niveau });
  if (!criteria) return null;
  const sql = `
    AND EXISTS (
      SELECT 1 FROM glossary_term_notions gtn
        JOIN curriculum_notions n ON n.id = gtn.notion_id
       WHERE gtn.glossary_code = ${alias}.glossary_code
         AND ${criteria.sql}
    )`;
  return { sql, params: criteria.params };
}

const NOTION_SELECT = `
  SELECT id, niveau, discipline, theme, notion, sort_order
    FROM curriculum_notions
`;

/** Ajoute le libellé de niveau à une ligne de `curriculum_notions`. */
function decorateNotionRow(row) {
  if (!row) return row;
  return { ...row, niveau_label: curriculumNiveauLabel(row.niveau) };
}

/**
 * Référentiel complet, ordonné par progression scolaire. Filtrage par niveau en SQL :
 * la liste est courte, mais un niveau demandé ne doit pas remonter les autres.
 */
async function listCurriculumNotions(db, { niveau } = {}) {
  const level = normalizeCurriculumNiveau(niveau);
  const rows = await db.queryAll(
    `${NOTION_SELECT}${level ? ' WHERE niveau = ?' : ''} ORDER BY sort_order ASC, id ASC`,
    level ? [level] : [],
  );
  return rows.map(decorateNotionRow);
}

/** Une notion par son identifiant, ou `null`. */
async function getCurriculumNotion(db, notionId) {
  const id = normalizeNotionId(notionId);
  if (!id) return null;
  const row = await db.queryOne(`${NOTION_SELECT} WHERE id = ? LIMIT 1`, [id]);
  return row ? decorateNotionRow(row) : null;
}

/**
 * Effectif de questions actives et de termes de glossaire par notion, en deux requêtes
 * agrégées. Une requête par notion (douze aujourd'hui, davantage demain) multiplierait
 * les allers-retours pour une page qui s'affiche d'un bloc.
 */
async function countContentByNotion(db) {
  const questionRows = await db.queryAll(`
    SELECT n.id AS notion_id, COUNT(DISTINCT q.question_code) AS total
      FROM curriculum_notions n
      LEFT JOIN quiz_questions q
        ON q.statut = 'actif'
       AND (
         EXISTS (
           SELECT 1 FROM quiz_category_notions qcn
            WHERE qcn.categorie_slug = q.categorie_slug
              AND qcn.notion_id = n.id
              AND NOT EXISTS (
                SELECT 1 FROM quiz_question_notions qqx
                 WHERE qqx.question_code = q.question_code
                   AND qqx.notion_id = n.id
                   AND qqx.mode = 'exclusion'
              )
         )
         OR EXISTS (
           SELECT 1 FROM quiz_question_notions qqa
            WHERE qqa.question_code = q.question_code
              AND qqa.notion_id = n.id
              AND qqa.mode = 'ajout'
         )
       )
     GROUP BY n.id
  `);
  const termRows = await db.queryAll(`
    SELECT n.id AS notion_id, COUNT(DISTINCT t.glossary_code) AS total
      FROM curriculum_notions n
      LEFT JOIN glossary_term_notions gtn ON gtn.notion_id = n.id
      LEFT JOIN glossary_terms t ON t.glossary_code = gtn.glossary_code AND t.statut = 'actif'
     GROUP BY n.id
  `);
  const questionCounts = new Map(
    questionRows.map((row) => [String(row.notion_id), Number(row.total || 0)]),
  );
  const termCounts = new Map(
    termRows.map((row) => [String(row.notion_id), Number(row.total || 0)]),
  );
  return { questionCounts, termCounts };
}

/** Catégories de quiz rattachées à une notion (celles dont les questions héritent). */
async function listNotionQuizCategories(db, notionId) {
  const id = normalizeNotionId(notionId);
  if (!id) return [];
  return db.queryAll(
    `SELECT c.slug, c.nom, c.emoji, c.theme
       FROM quiz_category_notions qcn
       JOIN quiz_categories c ON c.slug = qcn.categorie_slug
      WHERE qcn.notion_id = ?
      ORDER BY c.order_index ASC, c.nom ASC`,
    [id],
  );
}

/** Notions rattachées à un terme de glossaire. */
async function listGlossaryTermNotions(db, glossaryCode) {
  const code = String(glossaryCode == null ? '' : glossaryCode).trim();
  if (!code) return [];
  const rows = await db.queryAll(
    `SELECT n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order
       FROM glossary_term_notions gtn
       JOIN curriculum_notions n ON n.id = gtn.notion_id
      WHERE gtn.glossary_code = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [code],
  );
  return rows.map(decorateNotionRow);
}

/**
 * Notions d'une question : ce qu'elle hérite de sa catégorie, ce qui lui est ajouté, ce
 * qui lui est retiré, et le résultat. Les quatre listes sont renvoyées telles quelles :
 * un écran de rattachement doit pouvoir montrer *pourquoi* une notion s'applique.
 */
async function describeQuestionNotions(db, questionCode) {
  const code = String(questionCode == null ? '' : questionCode).trim();
  if (!code) return null;
  const question = await db.queryOne(
    'SELECT question_code, categorie_slug FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [code],
  );
  if (!question) return null;

  const inheritedRows = await db.queryAll(
    `SELECT n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order
       FROM quiz_category_notions qcn
       JOIN curriculum_notions n ON n.id = qcn.notion_id
      WHERE qcn.categorie_slug = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [question.categorie_slug],
  );
  const overrideRows = await db.queryAll(
    `SELECT n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order, qqn.mode
       FROM quiz_question_notions qqn
       JOIN curriculum_notions n ON n.id = qqn.notion_id
      WHERE qqn.question_code = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [question.question_code],
  );

  const inherited = inheritedRows.map(decorateNotionRow);
  const added = overrideRows.filter((r) => r.mode === 'ajout').map(decorateNotionRow);
  const excluded = overrideRows.filter((r) => r.mode === 'exclusion').map(decorateNotionRow);
  const excludedIds = new Set(excluded.map((r) => r.id));

  const effectiveById = new Map();
  for (const row of inherited) {
    if (!excludedIds.has(row.id)) effectiveById.set(row.id, row);
  }
  for (const row of added) effectiveById.set(row.id, row);
  const effective = [...effectiveById.values()].sort(
    (a, b) =>
      Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)),
  );

  return {
    question_code: question.question_code,
    categorie_slug: question.categorie_slug,
    inherited,
    added,
    excluded,
    effective,
  };
}

module.exports = {
  CURRICULUM_NIVEAUX,
  normalizeCurriculumNiveau,
  curriculumNiveauLabel,
  normalizeNotionId,
  normalizeNotionIdList,
  buildQuizQuestionNotionFilter,
  buildQuizCategoryNotionFilter,
  buildGlossaryTermNotionFilter,
  listCurriculumNotions,
  getCurriculumNotion,
  countContentByNotion,
  listNotionQuizCategories,
  listGlossaryTermNotions,
  describeQuestionNotions,
};
