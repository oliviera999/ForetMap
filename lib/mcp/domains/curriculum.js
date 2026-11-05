'use strict';

/**
 * Lectures agrégées du domaine « programme » (notions officielles) pour le connecteur
 * (lot D2) — SQL écrit ici, paramétré, exécuté en transaction READ ONLY (`withReadOnly`).
 * Aucune donnée nominative : des compteurs et des listes de contenus.
 *
 * L'appartenance d'une question ou d'un terme à une notion reprend **la règle de
 * l'application** (`notionAppliesSql` de `lib/curriculumNotions.js`) : héritage de la
 * catégorie filtré par palier, corrigé par les exceptions `ajout` / `exclusion`.
 */

const { withReadOnly } = require('../readDb');
const { notionAppliesSql, QUIZ_CONTENT, GLOSSARY_CONTENT } = require('../../curriculumNotions');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };

/**
 * Fragment de jointure « notion `n` ↔ question `q` » : à placer après
 * `JOIN curriculum_notions n ON`. Renvoie `{ sql, params }`.
 */
function questionNotionJoin(alias = 'q') {
  return notionAppliesSql(QUIZ_CONTENT, alias);
}

/** Même fragment pour un terme de glossaire `t`. */
function termNotionJoin(alias = 't') {
  return notionAppliesSql(GLOSSARY_CONTENT, alias);
}

function n(v) {
  return Number(v || 0);
}

/**
 * Couverture du programme : pour chaque notion, nombre de questions actives, de termes
 * actifs, de tutoriels actifs (rattachés à une question ou à un terme de la notion), de
 * tâches non archivées (par ces tutoriels ou par une séance de la notion) et de séances
 * (`config.notionId`). Les notions sans aucun contenu sont listées à part (orphelines).
 * @param {{ niveau?: string }} [args]
 */
async function curriculumCoverage(args = {}) {
  return withReadOnly(async (db) => {
    const q = (sql, params = []) => db.raw(sql, params, TRUSTED);
    const qj = questionNotionJoin('q');
    const tj = termNotionJoin('t');
    const notions = await q(
      `SELECT n.id, n.niveau, n.discipline, n.theme, n.notion, n.sort_order
         FROM curriculum_notions n
        ${args.niveau ? 'WHERE n.niveau = ?' : ''}
        ORDER BY n.sort_order ASC, n.id ASC`,
      args.niveau ? [String(args.niveau)] : [],
    );
    // Paires (notion, question active) et (notion, terme actif) selon la règle de l'application.
    const qPairs = await q(
      `SELECT n.id AS notion_id, q.question_code
         FROM curriculum_notions n
         JOIN quiz_questions q ON q.statut = 'actif' AND ${qj.sql}`,
      qj.params,
    );
    const tPairs = await q(
      `SELECT n.id AS notion_id, t.glossary_code
         FROM curriculum_notions n
         JOIN glossary_terms t ON t.statut = 'actif' AND ${tj.sql}`,
      tj.params,
    );
    // Tutoriels actifs : liens question ↔ tutoriel approuvés, et termes ↔ tutoriels.
    const tutoQ = await q(
      `SELECT l.question_code, CAST(l.resource_ref AS UNSIGNED) AS tutorial_id
         FROM resource_question_links l
         JOIN tutorials tu ON tu.id = CAST(l.resource_ref AS UNSIGNED) AND tu.is_active = 1
        WHERE l.resource_type = 'tutorial' AND l.status = 'approved'`,
    );
    const tutoT = await q(
      `SELECT gtt.glossary_code, gtt.tutorial_id
         FROM glossary_term_tutorials gtt
         JOIN tutorials tu ON tu.id = gtt.tutorial_id AND tu.is_active = 1`,
    );
    const taskTuto = await q(
      `SELECT tt.task_id, tt.tutorial_id
         FROM task_tutorials tt
         JOIN tasks tk ON tk.id = tt.task_id AND tk.archived_at IS NULL`,
    );
    const sessions = await q(
      `SELECT ps.id, ps.title, ps.is_published,
              JSON_UNQUOTE(JSON_EXTRACT(ps.config_json, '$.notionId')) AS notion_id
         FROM pedago_sessions ps`,
    );
    const sessionTasks = await q(
      `SELECT tk.id AS task_id, tk.pedago_session_id
         FROM tasks tk
        WHERE tk.archived_at IS NULL AND tk.pedago_session_id IS NOT NULL`,
    );

    const groupBy = (rows, key, val) => {
      const m = new Map();
      for (const r of rows) {
        const k = String(r[key]);
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(String(r[val]));
      }
      return m;
    };
    const questionsByNotion = groupBy(qPairs, 'notion_id', 'question_code');
    const termsByNotion = groupBy(tPairs, 'notion_id', 'glossary_code');
    const tutosByQuestion = groupBy(tutoQ, 'question_code', 'tutorial_id');
    const tutosByTerm = groupBy(tutoT, 'glossary_code', 'tutorial_id');
    const tasksByTuto = groupBy(taskTuto, 'tutorial_id', 'task_id');
    const tasksBySession = groupBy(sessionTasks, 'pedago_session_id', 'task_id');
    const sessionsByNotion = new Map();
    for (const s of sessions) {
      if (!s.notion_id || s.notion_id === 'null') continue;
      const k = String(s.notion_id);
      if (!sessionsByNotion.has(k)) sessionsByNotion.set(k, []);
      sessionsByNotion.get(k).push(s);
    }

    const items = notions.map((notion) => {
      const id = String(notion.id);
      const questions = questionsByNotion.get(id) || new Set();
      const terms = termsByNotion.get(id) || new Set();
      const tutorials = new Set();
      for (const code of questions)
        for (const t of tutosByQuestion.get(code) || []) tutorials.add(t);
      for (const code of terms) for (const t of tutosByTerm.get(code) || []) tutorials.add(t);
      const sess = sessionsByNotion.get(id) || [];
      const tasks = new Set();
      for (const t of tutorials) for (const k of tasksByTuto.get(t) || []) tasks.add(k);
      for (const s of sess) for (const k of tasksBySession.get(String(s.id)) || []) tasks.add(k);
      return {
        id: notion.id,
        niveau: notion.niveau,
        discipline: notion.discipline,
        theme: notion.theme,
        notion: notion.notion,
        questions: questions.size,
        glossary_terms: terms.size,
        tutorials: tutorials.size,
        tasks: tasks.size,
        sessions: sess.length,
        sessions_published: sess.filter((s) => n(s.is_published) === 1).length,
      };
    });
    const orphans = items
      .filter((i) => !i.questions && !i.glossary_terms && !i.tutorials && !i.sessions)
      .map((i) => ({ id: i.id, niveau: i.niveau, notion: i.notion }));
    const weak = items
      .filter((i) => !orphans.some((o) => o.id === i.id))
      .filter((i) => !i.tutorials || !i.questions)
      .map((i) => ({
        id: i.id,
        manque: [!i.questions && 'questions', !i.tutorials && 'tutoriels'].filter(Boolean),
      }));
    return {
      perimetre: { niveau: args.niveau || null },
      regle:
        'question ou terme rattaché à une notion : héritage de la catégorie (filtré par palier) ± exceptions ; tutoriels via liens question approuvés ou termes ; tâches via tutoriels ou séance ; séances via config.notionId',
      notions: items,
      orphan_notions: orphans,
      partial_notions: weak,
    };
  }, READ_OPTS);
}

module.exports = { curriculumCoverage, questionNotionJoin, termNotionJoin };
