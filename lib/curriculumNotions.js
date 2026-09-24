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
 *   notions effectives = (notions de la catégorie **au palier du contenu** − exclusions) ∪ ajouts
 *
 * **Garde de palier** (lib/pedagoScales.js) : une question de lycée n'hérite pas des notions
 * de cycle 3 ou 4 de sa catégorie. Sans elle, un tirage « cycle 4 » — celui des deux
 * séances collège publiées — sortait près d'une question de lycée sur trois. Une question
 * de collège, elle, garde les notions de lycée de sa catégorie (révision possible).
 *
 * Le glossaire suit le **même modèle** depuis la migration 290 : ses catégories
 * (`ecologie`, `sol`…) sont rattachées à des notions dans `glossary_category_notions`, la
 * profondeur du terme (`base` / `approfondissement` / `avance`) fixe son palier d'entrée,
 * et `glossary_term_notions` porte les exceptions. Sans héritage, cette table était restée
 * vide et le filtre « notion » du glossaire ne rendait jamais rien.
 */

const {
  QUIZ_NIVEAU_ENTRY,
  GLOSSARY_NIVEAU_ENTRY,
  parseNotionNiveauFilter,
  sortCurriculumNiveaux,
  quizNiveauEntryPalier,
  glossaryNiveauEntryPalier,
  contentMayInheritNotion,
  inheritanceExclusionsFor,
} = require('./pedagoScales');

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
 *
 * `niveau` suit `parseNotionNiveauFilter` (lib/pedagoScales.js) : un niveau scolaire, une
 * étape (`college` = cycles 3 et 4, `lycee` = seconde → terminale) ou une liste séparée par
 * des virgules. Une valeur invalide est ignorée ici — les routes la refusent en 400 avant.
 */
function buildNotionCriteria({ notionId, niveau } = {}) {
  const conditions = [];
  const params = [];
  const id = normalizeNotionId(notionId);
  if (id) {
    conditions.push('n.id = ?');
    params.push(id);
  }
  const parsed = Array.isArray(niveau)
    ? { niveaux: sortCurriculumNiveaux(niveau) }
    : parseNotionNiveauFilter(niveau);
  const niveaux = parsed && !parsed.error ? parsed.niveaux : [];
  if (niveaux.length === 1) {
    conditions.push('n.niveau = ?');
    params.push(niveaux[0]);
  } else if (niveaux.length > 1) {
    conditions.push(`n.niveau IN (${niveaux.map(() => '?').join(', ')})`);
    params.push(...niveaux);
  }
  if (conditions.length === 0) return null;
  return { sql: conditions.join(' AND '), params };
}

/**
 * Les deux contenus rattachés aux notions, décrits une fois. Même modèle des deux côtés :
 * héritage de la catégorie, filtré par palier, corrigé par des exceptions `ajout` /
 * `exclusion`. Noms de tables et de colonnes constants (jamais issus d'une requête).
 */
const QUIZ_CONTENT = Object.freeze({
  categoryLinks: 'quiz_category_notions',
  categoryLinkColumn: 'categorie_slug',
  categoryColumn: 'categorie_slug',
  overrides: 'quiz_question_notions',
  codeColumn: 'question_code',
  entryMap: QUIZ_NIVEAU_ENTRY,
});

const GLOSSARY_CONTENT = Object.freeze({
  categoryLinks: 'glossary_category_notions',
  categoryLinkColumn: 'categorie',
  categoryColumn: 'categorie',
  overrides: 'glossary_term_notions',
  codeColumn: 'glossary_code',
  entryMap: GLOSSARY_NIVEAU_ENTRY,
});

/**
 * Garde de palier en SQL : `NOT ((alias.niveau = 'lycee' AND n.niveau IN ('cycle3', …)) OR …)`,
 * déduite de `inheritanceExclusionsFor` — la règle n'est écrite qu'une fois, en JS.
 */
function entryPalierGuardSql(content, alias) {
  const rules = inheritanceExclusionsFor(content.entryMap);
  if (rules.length === 0) return { sql: '1 = 1', params: [] };
  const params = [];
  const parts = rules.map((rule) => {
    params.push(rule.contentNiveau, ...rule.notionNiveaux);
    return `(${alias}.niveau = ? AND n.niveau IN (${rule.notionNiveaux.map(() => '?').join(', ')}))`;
  });
  return { sql: `NOT (${parts.join(' OR ')})`, params };
}

/**
 * Condition « la notion `n` s'applique au contenu `alias` » :
 *
 *   (hérité de la catégorie ET palier compatible ET non exclu) OU ajouté explicitement
 *
 * Un ajout explicite passe outre le palier : c'est un geste de professeur, pas une règle.
 */
function notionAppliesSql(content, alias) {
  const guard = entryPalierGuardSql(content, alias);
  const sql = `(
           (
             EXISTS (
               SELECT 1 FROM ${content.categoryLinks} cl
                WHERE cl.${content.categoryLinkColumn} = ${alias}.${content.categoryColumn}
                  AND cl.notion_id = n.id
             )
             AND ${guard.sql}
             AND NOT EXISTS (
               SELECT 1 FROM ${content.overrides} ox
                WHERE ox.${content.codeColumn} = ${alias}.${content.codeColumn}
                  AND ox.notion_id = n.id
                  AND ox.mode = 'exclusion'
             )
           )
           OR EXISTS (
             SELECT 1 FROM ${content.overrides} oa
              WHERE oa.${content.codeColumn} = ${alias}.${content.codeColumn}
                AND oa.notion_id = n.id
                AND oa.mode = 'ajout'
           )
         )`;
  return { sql, params: guard.params };
}

function buildContentNotionFilter(content, { notionId, niveau, alias }) {
  const criteria = buildNotionCriteria({ notionId, niveau });
  if (!criteria) return null;
  const applies = notionAppliesSql(content, alias);
  const sql = `
    AND EXISTS (
      SELECT 1 FROM curriculum_notions n
       WHERE ${criteria.sql}
         AND ${applies.sql}
    )`;
  return { sql, params: [...criteria.params, ...applies.params] };
}

/**
 * Fragment `AND EXISTS (…)` filtrant les questions de quiz sur une notion, héritage de
 * catégorie et garde de palier compris. `alias` est le nom sous lequel `quiz_questions` est
 * désigné dans la requête appelante (`q` pour `/api/quiz/questions`, `quiz_questions` pour
 * le tirage, qui n'en donne pas).
 *
 * @returns {{ sql: string, params: unknown[] }|null}
 */
function buildQuizQuestionNotionFilter({ notionId, niveau, alias = 'quiz_questions' } = {}) {
  return buildContentNotionFilter(QUIZ_CONTENT, { notionId, niveau, alias });
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

/** Même fragment pour les termes de glossaire (héritage par catégorie depuis la migration 290). */
function buildGlossaryTermNotionFilter({ notionId, niveau, alias = 'glossary_terms' } = {}) {
  return buildContentNotionFilter(GLOSSARY_CONTENT, { notionId, niveau, alias });
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
 * les allers-retours pour une page qui s'affiche d'un bloc. Même règle que les filtres :
 * héritage, garde de palier, exceptions.
 */
async function countContentByNotion(db) {
  const questionApplies = notionAppliesSql(QUIZ_CONTENT, 'q');
  const questionRows = await db.queryAll(
    `
    SELECT n.id AS notion_id, COUNT(DISTINCT q.question_code) AS total
      FROM curriculum_notions n
      LEFT JOIN quiz_questions q
        ON q.statut = 'actif'
       AND ${questionApplies.sql}
     GROUP BY n.id
  `,
    questionApplies.params,
  );
  const termApplies = notionAppliesSql(GLOSSARY_CONTENT, 't');
  const termRows = await db.queryAll(
    `
    SELECT n.id AS notion_id, COUNT(DISTINCT t.glossary_code) AS total
      FROM curriculum_notions n
      LEFT JOIN glossary_terms t
        ON t.statut = 'actif'
       AND ${termApplies.sql}
     GROUP BY n.id
  `,
    termApplies.params,
  );
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

/** Catégories de glossaire rattachées à une notion (celles dont les termes héritent). */
async function listNotionGlossaryCategories(db, notionId) {
  const id = normalizeNotionId(notionId);
  if (!id) return [];
  const rows = await db.queryAll(
    `SELECT categorie
       FROM glossary_category_notions
      WHERE notion_id = ?
      ORDER BY categorie ASC`,
    [id],
  );
  return rows.map((row) => String(row.categorie));
}

const NOTION_COLUMNS = 'n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order';

function sortNotionRows(rows) {
  return rows.sort(
    (a, b) =>
      Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)),
  );
}

/**
 * Décomposition commune à une question et à un terme : ce qui est hérité de la catégorie
 * (au bon palier), ce que le palier écarte, les ajouts, les exclusions et le résultat. Les
 * listes sont renvoyées telles quelles : un écran de rattachement doit pouvoir montrer
 * *pourquoi* une notion s'applique — ou pourquoi elle ne s'applique pas.
 */
function composeNotionDescription({ categoryRows, overrideRows, entryPalier }) {
  const inheritedAll = categoryRows.map(decorateNotionRow);
  const inherited = inheritedAll.filter((row) => contentMayInheritNotion(entryPalier, row.niveau));
  const outOfLevel = inheritedAll.filter(
    (row) => !contentMayInheritNotion(entryPalier, row.niveau),
  );
  const added = overrideRows.filter((r) => r.mode === 'ajout').map(decorateNotionRow);
  const excluded = overrideRows.filter((r) => r.mode === 'exclusion').map(decorateNotionRow);
  const excludedIds = new Set(excluded.map((r) => r.id));

  const effectiveById = new Map();
  for (const row of inherited) {
    if (!excludedIds.has(row.id)) effectiveById.set(row.id, row);
  }
  for (const row of added) effectiveById.set(row.id, row);
  const effective = sortNotionRows([...effectiveById.values()]);
  return { inherited, out_of_level: outOfLevel, added, excluded, effective };
}

/**
 * Notions d'une question : héritées de sa catégorie (au palier de la question), écartées
 * par le palier, ajoutées, exclues, et le résultat.
 */
async function describeQuestionNotions(db, questionCode) {
  const code = String(questionCode == null ? '' : questionCode).trim();
  if (!code) return null;
  const question = await db.queryOne(
    'SELECT question_code, categorie_slug, niveau FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [code],
  );
  if (!question) return null;

  const categoryRows = await db.queryAll(
    `SELECT ${NOTION_COLUMNS}
       FROM quiz_category_notions qcn
       JOIN curriculum_notions n ON n.id = qcn.notion_id
      WHERE qcn.categorie_slug = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [question.categorie_slug],
  );
  const overrideRows = await db.queryAll(
    `SELECT ${NOTION_COLUMNS}, qqn.mode
       FROM quiz_question_notions qqn
       JOIN curriculum_notions n ON n.id = qqn.notion_id
      WHERE qqn.question_code = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [question.question_code],
  );

  return {
    question_code: question.question_code,
    categorie_slug: question.categorie_slug,
    niveau: question.niveau,
    ...composeNotionDescription({
      categoryRows,
      overrideRows,
      entryPalier: quizNiveauEntryPalier(question.niveau),
    }),
  };
}

/** Même décomposition pour un terme de glossaire (héritage de sa catégorie, migration 290). */
async function describeGlossaryTermNotions(db, glossaryCode) {
  const code = String(glossaryCode == null ? '' : glossaryCode).trim();
  if (!code) return null;
  const term = await db.queryOne(
    'SELECT glossary_code, categorie, niveau FROM glossary_terms WHERE glossary_code = ? LIMIT 1',
    [code],
  );
  if (!term) return null;

  const categoryRows = await db.queryAll(
    `SELECT ${NOTION_COLUMNS}
       FROM glossary_category_notions gcn
       JOIN curriculum_notions n ON n.id = gcn.notion_id
      WHERE gcn.categorie = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [term.categorie],
  );
  const overrideRows = await db.queryAll(
    `SELECT ${NOTION_COLUMNS}, gtn.mode
       FROM glossary_term_notions gtn
       JOIN curriculum_notions n ON n.id = gtn.notion_id
      WHERE gtn.glossary_code = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [term.glossary_code],
  );

  return {
    glossary_code: term.glossary_code,
    categorie: term.categorie,
    niveau: term.niveau,
    ...composeNotionDescription({
      categoryRows,
      overrideRows,
      entryPalier: glossaryNiveauEntryPalier(term.niveau),
    }),
  };
}

/** Notions effectives d'un terme de glossaire (fiche du terme). */
async function listGlossaryTermNotions(db, glossaryCode) {
  const described = await describeGlossaryTermNotions(db, glossaryCode);
  return described ? described.effective : [];
}

/** Notions rattachées à une catégorie de glossaire (celles dont ses termes héritent). */
async function listGlossaryCategoryNotions(db, categorie) {
  const slug = String(categorie == null ? '' : categorie).trim();
  if (!slug) return [];
  const rows = await db.queryAll(
    `SELECT ${NOTION_COLUMNS}
       FROM glossary_category_notions gcn
       JOIN curriculum_notions n ON n.id = gcn.notion_id
      WHERE gcn.categorie = ?
      ORDER BY n.sort_order ASC, n.id ASC`,
    [slug],
  );
  return rows.map(decorateNotionRow);
}

module.exports = {
  CURRICULUM_NIVEAUX,
  normalizeCurriculumNiveau,
  curriculumNiveauLabel,
  normalizeNotionId,
  normalizeNotionIdList,
  parseNotionNiveauFilter,
  buildNotionCriteria,
  buildQuizQuestionNotionFilter,
  buildQuizCategoryNotionFilter,
  buildGlossaryTermNotionFilter,
  listCurriculumNotions,
  getCurriculumNotion,
  countContentByNotion,
  listNotionQuizCategories,
  listNotionGlossaryCategories,
  listGlossaryTermNotions,
  listGlossaryCategoryNotions,
  describeQuestionNotions,
  describeGlossaryTermNotions,
};
