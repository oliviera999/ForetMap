'use strict';

/**
 * Notions des programmes officiels (migration 273).
 *
 * Lecture **publique**, comme le quiz et le glossaire qu'elle sert à parcourir : un élève
 * qui voit « Seconde — Biodiversité, résultat et étape de l'évolution » sous une question
 * sait à quoi il travaille, et la visite invitée n'a pas de session. Rien ici n'expose de
 * bonne réponse — le référentiel ne contient que des intitulés de programme.
 *
 * Écriture sous `plants.manage`, la permission qui gouverne déjà le catalogue de quiz et
 * la base biodiversité : rattacher une catégorie à une notion est un geste de gestion de
 * contenu, pas d'administration de comptes.
 */

const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { normalizeQuestionCode } = require('../lib/shared/questionRouteHelpers');
const {
  CURRICULUM_NIVEAUX,
  parseNotionNiveauFilter,
  normalizeNotionId,
  normalizeNotionIdList,
  listCurriculumNotions,
  getCurriculumNotion,
  countContentByNotion,
  listNotionQuizCategories,
  listNotionGlossaryCategories,
  listGlossaryCategoryNotions,
  describeQuestionNotions,
  describeGlossaryTermNotions,
} = require('../lib/curriculumNotions');
const { etapeForCurriculumNiveau, curriculumPalier } = require('../lib/pedagoScales');

const router = express.Router();
const db = { queryAll, queryOne, execute };
const manageNotions = requirePermission('plants.manage');

/**
 * Les effectifs par notion croisent tout le catalogue de questions ; la liste des notions,
 * elle, s'affiche à l'ouverture de l'onglet Quiz de chaque élève. Un cache court suffit :
 * un rattachement posé par un professeur est visible à la requête suivante (le cache est
 * invalidé par les écritures de ce routeur).
 */
const notionsCache = getNamedMemoryTtlCache('curriculum:notions:v1', {
  ttlMs: 60_000,
  maxEntries: 2,
});
const NOTIONS_CACHE_KEY = 'all-with-counts';

function invalidateNotionsCache() {
  notionsCache.delete(NOTIONS_CACHE_KEY);
}

/** Référentiel complet + effectifs, mis en cache puis filtré en mémoire. */
async function loadNotionsWithCounts() {
  const cached = notionsCache.get(NOTIONS_CACHE_KEY);
  if (cached) return cached;
  const [notions, counts] = await Promise.all([
    listCurriculumNotions(db),
    countContentByNotion(db),
  ]);
  const items = notions.map((notion) => ({
    ...notion,
    question_count: counts.questionCounts.get(String(notion.id)) || 0,
    glossary_count: counts.termCounts.get(String(notion.id)) || 0,
  }));
  notionsCache.set(NOTIONS_CACHE_KEY, items);
  return items;
}

/**
 * GET /api/curriculum/niveaux — niveaux scolaires, nombre de notions de chacun, et leur
 * projection sur les autres échelles (étape `college` / `lycee`, palier 1 → 5).
 */
router.get(
  '/niveaux',
  asyncHandler(async (_req, res) => {
    const notions = await loadNotionsWithCounts();
    const byNiveau = new Map();
    for (const notion of notions) {
      byNiveau.set(notion.niveau, (byNiveau.get(notion.niveau) || 0) + 1);
    }
    return res.json({
      niveaux: CURRICULUM_NIVEAUX.map((niveau) => ({
        ...niveau,
        etape: etapeForCurriculumNiveau(niveau.value),
        palier: curriculumPalier(niveau.value),
        notion_count: byNiveau.get(niveau.value) || 0,
      })),
    });
  }),
);

/**
 * GET /api/curriculum/notions?niveau=&counts=0 — `niveau` : niveau scolaire, étape
 * (`college` / `lycee`) ou liste séparée par des virgules (lib/pedagoScales.js).
 */
router.get(
  '/notions',
  asyncHandler(async (req, res) => {
    const parsed = parseNotionNiveauFilter(normalizeOptionalString(req.query?.niveau));
    if (parsed?.error) return res.status(400).json({ error: 'niveau invalide' });
    const niveaux = parsed?.niveaux || null;
    const withCounts = String(req.query?.counts ?? '1') !== '0';

    const all = withCounts ? await loadNotionsWithCounts() : await listCurriculumNotions(db);
    const items = niveaux ? all.filter((notion) => niveaux.includes(notion.niveau)) : all;
    return res.json({ items });
  }),
);

/** GET /api/curriculum/notions/:id — notion, catégories de quiz rattachées, effectifs. */
router.get(
  '/notions/:id',
  asyncHandler(async (req, res) => {
    const id = normalizeNotionId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant de notion invalide' });
    const notion = await getCurriculumNotion(db, id);
    if (!notion) return res.status(404).json({ error: 'Notion introuvable' });

    const [categories, glossaryCategories, all] = await Promise.all([
      listNotionQuizCategories(db, id),
      listNotionGlossaryCategories(db, id),
      loadNotionsWithCounts(),
    ]);
    const counted = all.find((row) => row.id === id);
    return res.json({
      ...notion,
      etape: etapeForCurriculumNiveau(notion.niveau),
      question_count: counted?.question_count || 0,
      glossary_count: counted?.glossary_count || 0,
      quizCategories: categories,
      glossaryCategories,
    });
  }),
);

/**
 * Vérifie que tous les identifiants demandés existent, pour renvoyer un 400 explicite
 * plutôt qu'une violation de clé étrangère en 500.
 */
async function assertNotionsExist(notionIds) {
  if (notionIds.length === 0) return null;
  const rows = await queryAll(
    `SELECT id FROM curriculum_notions WHERE id IN (${notionIds.map(() => '?').join(', ')})`,
    notionIds,
  );
  const known = new Set(rows.map((row) => String(row.id)));
  const unknown = notionIds.filter((id) => !known.has(id));
  return unknown.length > 0 ? `Notion inconnue : ${unknown.join(', ')}` : null;
}

/** GET /api/curriculum/quiz-categories/:slug/notions */
router.get(
  '/quiz-categories/:slug/notions',
  asyncHandler(async (req, res) => {
    const slug = normalizeOptionalString(req.params?.slug);
    if (!slug) return res.status(400).json({ error: 'Catégorie invalide' });
    const category = await queryOne('SELECT slug FROM quiz_categories WHERE slug = ? LIMIT 1', [
      slug,
    ]);
    if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
    const items = await queryAll(
      `SELECT n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order
         FROM quiz_category_notions qcn
         JOIN curriculum_notions n ON n.id = qcn.notion_id
        WHERE qcn.categorie_slug = ?
        ORDER BY n.sort_order ASC, n.id ASC`,
      [slug],
    );
    return res.json({ categorie_slug: slug, items });
  }),
);

/**
 * PUT /api/curriculum/quiz-categories/:slug/notions — remplace l'ensemble des notions
 * d'une catégorie. Remplacement plutôt qu'ajout/retrait unitaires : l'écran de gestion
 * présente des cases à cocher, et deux professeurs qui enregistrent la même liste
 * obtiennent le même état.
 */
router.put(
  '/quiz-categories/:slug/notions',
  manageNotions,
  asyncHandler(async (req, res) => {
    const slug = normalizeOptionalString(req.params?.slug);
    if (!slug) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!Array.isArray(req.body?.notion_ids)) {
      return res.status(400).json({ error: 'notion_ids attendu (tableau)' });
    }
    const category = await queryOne('SELECT slug FROM quiz_categories WHERE slug = ? LIMIT 1', [
      slug,
    ]);
    if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });

    const notionIds = normalizeNotionIdList(req.body.notion_ids);
    const unknown = await assertNotionsExist(notionIds);
    if (unknown) return res.status(400).json({ error: unknown });

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM quiz_category_notions WHERE categorie_slug = ?', [slug]);
      for (const notionId of notionIds) {
        await tx.execute(
          'INSERT INTO quiz_category_notions (categorie_slug, notion_id) VALUES (?, ?)',
          [slug, notionId],
        );
      }
    });
    invalidateNotionsCache();
    return res.json({ ok: true, categorie_slug: slug, notion_ids: notionIds });
  }),
);

/**
 * GET /api/curriculum/quiz-questions/:code/notions — héritage (au palier de la question),
 * notions écartées par le palier (`out_of_level`), ajouts, exclusions, résultat.
 */
router.get(
  '/quiz-questions/:code/notions',
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params?.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const described = await describeQuestionNotions(db, code);
    if (!described) return res.status(404).json({ error: 'Question introuvable' });
    return res.json(described);
  }),
);

/**
 * PUT /api/curriculum/quiz-questions/:code/notions — exceptions d'une question.
 * Corps : `{ ajouts: [...], exclusions: [...] }`. Une notion ne peut pas être des deux
 * côtés : ce serait une consigne contradictoire, refusée plutôt qu'arbitrée en silence.
 */
router.put(
  '/quiz-questions/:code/notions',
  manageNotions,
  asyncHandler(async (req, res) => {
    const code = normalizeQuestionCode(req.params?.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const question = await queryOne(
      'SELECT question_code FROM quiz_questions WHERE question_code = ? LIMIT 1',
      [code],
    );
    if (!question) return res.status(404).json({ error: 'Question introuvable' });

    const ajouts = normalizeNotionIdList(req.body?.ajouts);
    const exclusions = normalizeNotionIdList(req.body?.exclusions);
    const conflict = ajouts.filter((id) => exclusions.includes(id));
    if (conflict.length > 0) {
      return res
        .status(400)
        .json({ error: `Notion à la fois ajoutée et exclue : ${conflict.join(', ')}` });
    }
    const unknown = await assertNotionsExist([...ajouts, ...exclusions]);
    if (unknown) return res.status(400).json({ error: unknown });

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM quiz_question_notions WHERE question_code = ?', [code]);
      for (const notionId of ajouts) {
        await tx.execute(
          "INSERT INTO quiz_question_notions (question_code, notion_id, mode) VALUES (?, ?, 'ajout')",
          [code, notionId],
        );
      }
      for (const notionId of exclusions) {
        await tx.execute(
          "INSERT INTO quiz_question_notions (question_code, notion_id, mode) VALUES (?, ?, 'exclusion')",
          [code, notionId],
        );
      }
    });
    invalidateNotionsCache();
    const described = await describeQuestionNotions(db, code);
    return res.json({ ok: true, ...described });
  }),
);

/**
 * Catégorie de glossaire connue : une catégorie n'a pas de table propre, elle existe dès
 * qu'un terme la porte. Refuser une catégorie absente évite qu'une faute de frappe crée un
 * rattachement que rien n'héritera jamais.
 */
async function glossaryCategoryExists(categorie) {
  const row = await queryOne('SELECT 1 AS ok FROM glossary_terms WHERE categorie = ? LIMIT 1', [
    categorie,
  ]);
  return !!row;
}

/** GET /api/curriculum/glossary-categories/:categorie/notions */
router.get(
  '/glossary-categories/:categorie/notions',
  asyncHandler(async (req, res) => {
    const categorie = normalizeOptionalString(req.params?.categorie);
    if (!categorie) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!(await glossaryCategoryExists(categorie))) {
      return res.status(404).json({ error: 'Catégorie introuvable' });
    }
    const items = await listGlossaryCategoryNotions(db, categorie);
    return res.json({ categorie, items });
  }),
);

/**
 * PUT /api/curriculum/glossary-categories/:categorie/notions — remplace les notions d'une
 * catégorie de glossaire (migration 290). Ses termes en héritent, au palier de leur
 * profondeur : même geste que pour une catégorie de quiz.
 */
router.put(
  '/glossary-categories/:categorie/notions',
  manageNotions,
  asyncHandler(async (req, res) => {
    const categorie = normalizeOptionalString(req.params?.categorie);
    if (!categorie || categorie.length > 64) {
      return res.status(400).json({ error: 'Catégorie invalide' });
    }
    if (!Array.isArray(req.body?.notion_ids)) {
      return res.status(400).json({ error: 'notion_ids attendu (tableau)' });
    }
    if (!(await glossaryCategoryExists(categorie))) {
      return res.status(404).json({ error: 'Catégorie introuvable' });
    }

    const notionIds = normalizeNotionIdList(req.body.notion_ids);
    const unknown = await assertNotionsExist(notionIds);
    if (unknown) return res.status(400).json({ error: unknown });

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM glossary_category_notions WHERE categorie = ?', [categorie]);
      for (const notionId of notionIds) {
        await tx.execute(
          'INSERT INTO glossary_category_notions (categorie, notion_id) VALUES (?, ?)',
          [categorie, notionId],
        );
      }
    });
    invalidateNotionsCache();
    return res.json({ ok: true, categorie, notion_ids: notionIds });
  }),
);

/**
 * GET /api/curriculum/glossary-terms/:code/notions — `items` = notions effectives (forme
 * historique), plus la décomposition héritées / hors palier / ajouts / exclusions.
 */
router.get(
  '/glossary-terms/:code/notions',
  asyncHandler(async (req, res) => {
    const code = normalizeOptionalString(req.params?.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const described = await describeGlossaryTermNotions(db, code);
    if (!described) return res.status(404).json({ error: 'Terme introuvable' });
    return res.json({ ...described, items: described.effective });
  }),
);

/**
 * PUT /api/curriculum/glossary-terms/:code/notions — exceptions d'un terme.
 * Corps : `{ ajouts: [...], exclusions: [...] }`, comme une question de quiz. La forme
 * historique `{ notion_ids: [...] }` (d'avant l'héritage) reste acceptée et vaut `ajouts`.
 */
router.put(
  '/glossary-terms/:code/notions',
  manageNotions,
  asyncHandler(async (req, res) => {
    const code = normalizeOptionalString(req.params?.code);
    if (!code) return res.status(400).json({ error: 'Code invalide' });
    const legacy = Array.isArray(req.body?.notion_ids);
    if (!legacy && !Array.isArray(req.body?.ajouts) && !Array.isArray(req.body?.exclusions)) {
      return res.status(400).json({ error: 'ajouts / exclusions attendus (tableaux)' });
    }
    const term = await queryOne(
      'SELECT glossary_code FROM glossary_terms WHERE glossary_code = ? LIMIT 1',
      [code],
    );
    if (!term) return res.status(404).json({ error: 'Terme introuvable' });

    const ajouts = normalizeNotionIdList(legacy ? req.body.notion_ids : req.body?.ajouts);
    const exclusions = legacy ? [] : normalizeNotionIdList(req.body?.exclusions);
    const conflict = ajouts.filter((id) => exclusions.includes(id));
    if (conflict.length > 0) {
      return res
        .status(400)
        .json({ error: `Notion à la fois ajoutée et exclue : ${conflict.join(', ')}` });
    }
    const unknown = await assertNotionsExist([...ajouts, ...exclusions]);
    if (unknown) return res.status(400).json({ error: unknown });

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM glossary_term_notions WHERE glossary_code = ?', [code]);
      for (const notionId of ajouts) {
        await tx.execute(
          "INSERT INTO glossary_term_notions (glossary_code, notion_id, mode) VALUES (?, ?, 'ajout')",
          [code, notionId],
        );
      }
      for (const notionId of exclusions) {
        await tx.execute(
          "INSERT INTO glossary_term_notions (glossary_code, notion_id, mode) VALUES (?, ?, 'exclusion')",
          [code, notionId],
        );
      }
    });
    invalidateNotionsCache();
    const described = await describeGlossaryTermNotions(db, code);
    return res.json({ ok: true, notion_ids: ajouts, ...described, items: described.effective });
  }),
);

module.exports = router;
