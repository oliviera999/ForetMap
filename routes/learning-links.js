'use strict';

// API prof — gestion des liens « ressource <-> question » et de la politique de
// conditionnement du marquage (ForetMap). Backbone structurel : ces reglages sont
// inertes tant que learning.gating.enabled = false (aucun branchement runtime ici).
// Permission : plants.manage (gestion de contenu pedagogique, comme le quiz).
// O8 — erreurs : tous les try/catch etaient generiques (logRouteError + respondInternalError,
// soit 500 { error: 'Erreur serveur' }) ; ils sont remplaces par asyncHandler -> gestionnaire
// central de server.js, qui produit exactement la meme reponse.

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { getSettingValue } = require('../lib/settings');
const core = require('../lib/shared/resourceQuestionGatingCore');
const tutorialMatch = require('../lib/shared/tutorialQuestionMatch');

const router = express.Router();
const managePermission = requirePermission('plants.manage');

const ALLOWED = core.FORETMAP_RESOURCE_TYPES;

function actor(req) {
  const a = req.auth || {};
  return { userType: a.userType || 'teacher', userId: a.userId || a.canonicalUserId || null };
}

async function getSiteGating() {
  return {
    enabled: await getSettingValue('learning.gating.enabled', false),
    autoMarkOnCorrect: await getSettingValue('learning.gating.auto_mark_on_correct', true),
    defaultMode: await getSettingValue('learning.gating.default_mode', 'any'),
    defaultRequiredCorrect: await getSettingValue('learning.gating.default_required_correct', 1),
  };
}

async function questionExists(code) {
  const row = await queryOne(
    'SELECT question_code FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [code],
  );
  return !!row;
}

/** GET /api/learning-links — liste filtree (resourceType, resourceRef, questionCode, status). */
router.get(
  '/',
  managePermission,
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    if (req.query.resourceType && !rt)
      return res.status(400).json({ error: 'Type de ressource invalide' });
    if (rt) {
      where.push('resource_type = ?');
      params.push(rt);
      const ref = core.normalizeResourceRef(req.query.resourceRef);
      if (ref) {
        where.push('resource_ref = ?');
        params.push(ref);
      }
    }
    const qc = core.normalizeQuestionCode(req.query.questionCode);
    if (qc) {
      where.push('question_code = ?');
      params.push(qc);
    }
    const status = req.query.status ? core.normalizeStatus(req.query.status, null) : null;
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const sql = `SELECT * FROM resource_question_links
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY resource_type, resource_ref, question_code
                 LIMIT 1000`;
    const rows = await queryAll(sql, params);
    return res.json({ links: rows });
  }),
);

/** POST /api/learning-links — creer/mettre a jour un lien (idempotent sur la cle unique). */
router.post(
  '/',
  managePermission,
  asyncHandler(async (req, res) => {
    const parsed = core.sanitizeLinkInput(req.body || {}, { allowedResourceTypes: ALLOWED });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (!(await questionExists(v.question_code))) {
      return res.status(404).json({ error: 'Question introuvable' });
    }
    const who = actor(req);
    await execute(
      `INSERT INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note,
         created_by_user_type, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_gating = VALUES(is_gating), weight = VALUES(weight), origin = VALUES(origin),
         confidence = VALUES(confidence), status = VALUES(status), note = VALUES(note),
         updated_at = NOW()`,
      [
        v.resource_type,
        v.resource_ref,
        v.question_code,
        v.is_gating,
        v.weight,
        v.origin,
        v.confidence == null ? null : v.confidence,
        v.status,
        v.note,
        who.userType,
        who.userId,
      ],
    );
    const row = await queryOne(
      `SELECT * FROM resource_question_links
        WHERE resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
      [v.resource_type, v.resource_ref, v.question_code],
    );
    return res.status(201).json({ link: row });
  }),
);

/** PATCH /api/learning-links/:id — modifier is_gating / weight / status / note. */
router.patch(
  '/:id',
  managePermission,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return res.status(400).json({ error: 'Identifiant invalide' });
    const sets = [];
    const params = [];
    const body = req.body || {};
    if (body.is_gating !== undefined) {
      sets.push('is_gating = ?');
      params.push(body.is_gating ? 1 : 0);
    }
    if (body.weight !== undefined) {
      const w = Number(body.weight);
      if (!Number.isFinite(w) || w < 0) return res.status(400).json({ error: 'Poids invalide' });
      sets.push('weight = ?');
      params.push(Math.floor(w));
    }
    if (body.status !== undefined) {
      const s = core.normalizeStatus(body.status, null);
      if (!s) return res.status(400).json({ error: 'Statut invalide' });
      sets.push('status = ?');
      params.push(s);
    }
    if (body.note !== undefined) {
      sets.push('note = ?');
      params.push(body.note == null ? null : String(body.note).trim().slice(0, 255) || null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Aucune modification' });
    params.push(id);
    const result = await execute(
      `UPDATE resource_question_links SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params,
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    const row = await queryOne('SELECT * FROM resource_question_links WHERE id = ? LIMIT 1', [id]);
    return res.json({ link: row });
  }),
);

/** DELETE /api/learning-links/:id */
router.delete(
  '/:id',
  managePermission,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return res.status(400).json({ error: 'Identifiant invalide' });
    const result = await execute('DELETE FROM resource_question_links WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({ success: true });
  }),
);

/** GET /api/learning-links/policy?resourceType=&resourceRef= — politique brute + effective. */
router.get(
  '/policy',
  managePermission,
  asyncHandler(async (req, res) => {
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(req.query.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const perResource = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const site = await getSiteGating();
    const effective = core.resolveEffectivePolicy({ perResource, site });
    return res.json({ policy: perResource || null, effective, site });
  }),
);

/** PUT /api/learning-links/policy — definir la politique d'une ressource. */
router.put(
  '/policy',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rt = core.normalizeResourceType(body.resource_type ?? body.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(body.resource_ref ?? body.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const mode = core.normalizeMode(body.mode) || 'inherit';
    const requiredCorrect = core.clampRequiredCorrect(
      body.required_correct ?? body.requiredCorrect,
      1,
    );
    const enabled = body.enabled ? 1 : 0;
    const who = actor(req);
    await execute(
      `INSERT INTO resource_gating_policy
        (resource_type, resource_ref, mode, required_correct, enabled, updated_by_user_type, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mode = VALUES(mode), required_correct = VALUES(required_correct), enabled = VALUES(enabled),
         updated_by_user_type = VALUES(updated_by_user_type), updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = NOW()`,
      [rt, ref, mode, requiredCorrect, enabled, who.userType, who.userId],
    );
    const perResource = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const site = await getSiteGating();
    return res.json({
      policy: perResource,
      effective: core.resolveEffectivePolicy({ perResource, site }),
    });
  }),
);

/** GET /api/learning-links/config — reglages site effectifs (lecture seule ; ecriture via /api/settings). */
router.get(
  '/config',
  managePermission,
  asyncHandler(async (req, res) => {
    return res.json({ gating: await getSiteGating(), resource_types: ALLOWED });
  }),
);

/** Plafonds de l'appariement automatique : bornent le travail et la reponse. */
const SUGGEST_MAX_PER_QUESTION = 10;
const SUGGEST_MAX_CANDIDATES = 2000;

/**
 * GET /api/learning-links/resources?type=tutorial
 * Ressources rattachables, avec leur nombre de liens — de quoi peupler un menu
 * deroulant cote prof plutot que de lui faire saisir un identifiant a la main.
 */
router.get(
  '/resources',
  managePermission,
  asyncHandler(async (req, res) => {
    const type = core.normalizeResourceType(req.query.type, ALLOWED) || 'tutorial';
    if (type !== 'tutorial') {
      // Les autres types (plante, glossaire) ont deja leurs propres ecrans de
      // catalogue ; seul le tutoriel manquait d'un point d'entree.
      return res.status(400).json({ error: 'Seul le type « tutorial » est listé ici' });
    }
    const rows = await queryAll(
      `SELECT t.id, t.title, t.type, t.is_active,
              COUNT(l.id) AS links_count,
              SUM(CASE WHEN l.status = 'approved' AND l.is_gating = 1 THEN 1 ELSE 0 END) AS gating_count,
              SUM(CASE WHEN l.status = 'suggested' THEN 1 ELSE 0 END) AS suggested_count
         FROM tutorials t
         LEFT JOIN resource_question_links l
           ON l.resource_type = 'tutorial'
          -- CAST(... AS CHAR) sort en utf8mb4_general_ci alors que resource_ref est en
          -- utf8mb4_unicode_ci : sans COLLATE explicite, MariaDB refuse la comparaison
          -- (ER_CANT_AGGREGATE_2COLLATIONS) des que la connexion applicative s'en mele.
          AND l.resource_ref = CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci
        GROUP BY t.id
        ORDER BY t.sort_order ASC, t.title ASC`,
    );
    return res.json({
      resource_type: 'tutorial',
      resources: rows.map((r) => ({
        ref: String(r.id),
        label: r.title,
        tutorial_type: r.type,
        is_active: Number(r.is_active) === 1,
        links_count: Number(r.links_count) || 0,
        gating_count: Number(r.gating_count) || 0,
        suggested_count: Number(r.suggested_count) || 0,
      })),
    });
  }),
);

/** Cle d'unicite d'un couple ressource/question, alignee sur l'index unique. */
function linkKey(resourceType, resourceRef, questionCode) {
  return `${resourceType}|${resourceRef}|${questionCode}`;
}

/** Couples deja lies, tous statuts confondus (y compris rejetes : ne pas re-proposer). */
async function loadExistingTutorialLinks() {
  const rows = await queryAll(
    `SELECT resource_ref, question_code FROM resource_question_links
      WHERE resource_type = 'tutorial'`,
  );
  return new Set(rows.map((r) => linkKey('tutorial', r.resource_ref, r.question_code)));
}

/**
 * Liens editoriaux quiz_question_tutorials pas encore repris dans le modele unifie.
 *
 * La migration 144 a fait cette reprise UNE FOIS ; tout rattachement editorial
 * cree depuis est reste invisible du conditionnement. Ces liens-la sont saisis a
 * la main par un professeur : ils valent bien mieux qu'une correspondance
 * textuelle, d'ou origin='import' et confiance maximale.
 */
async function loadUnmirroredEditorialLinks(existing) {
  const rows = await queryAll(
    `SELECT qqt.tutorial_id, qqt.question_code, t.title
       FROM quiz_question_tutorials qqt
       JOIN tutorials t ON t.id = qqt.tutorial_id
       JOIN quiz_questions q ON q.question_code = qqt.question_code`,
  );
  const out = [];
  for (const row of rows) {
    const ref = String(row.tutorial_id);
    if (existing.has(linkKey('tutorial', ref, row.question_code))) continue;
    out.push({
      resource_type: 'tutorial',
      resource_ref: ref,
      question_code: row.question_code,
      confidence: 1,
      origin: 'import',
      status: 'suggested',
      reason: 'lien éditorial « questions liées » déjà saisi',
      matched_terms: [],
      resource_label: row.title,
    });
  }
  return out;
}

/**
 * POST /api/learning-links/suggest
 * Rapproche automatiquement questions et tutoriels a partir de leurs CONTENUS.
 *
 * Simulation par defaut (`apply` absent ou faux) : rien n'est ecrit, le prof voit
 * d'abord ce qui serait cree. Avec `apply: true`, les candidats sont inseres en
 * status='suggested' — ils restent donc sans effet sur les eleves tant qu'ils
 * n'ont pas ete approuves.
 *
 * Corps : { apply?, minConfidence?, maxPerQuestion?, includeEditorial?, questionCodes?, resourceRefs? }
 */
router.post(
  '/suggest',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const apply = body.apply === true || body.apply === 'true';
    const includeEditorial = body.includeEditorial !== false;

    const rawMin = Number(body.minConfidence);
    const minConfidence = Number.isFinite(rawMin) ? Math.min(1, Math.max(0, rawMin)) : 0.5;
    const rawMax = Number(body.maxPerQuestion);
    const maxPerQuestion = Number.isFinite(rawMax)
      ? Math.min(SUGGEST_MAX_PER_QUESTION, Math.max(1, Math.floor(rawMax)))
      : 3;

    const questionCodes = (Array.isArray(body.questionCodes) ? body.questionCodes : [])
      .map((c) => core.normalizeQuestionCode(c))
      .filter(Boolean);
    const resourceRefs = (Array.isArray(body.resourceRefs) ? body.resourceRefs : [])
      .map((r) => core.normalizeResourceRef(r))
      .filter(Boolean);

    const tutorials = await queryAll(
      `SELECT id, title, summary, html_content FROM tutorials
        WHERE is_active = 1
        ${resourceRefs.length ? `AND id IN (${resourceRefs.map(() => '?').join(', ')})` : ''}`,
      resourceRefs,
    );
    const questions = await queryAll(
      `SELECT question_code AS code, question AS text, reponse_texte, tags, feedback_correct
         FROM quiz_questions
        WHERE statut = 'actif'
        ${questionCodes.length ? `AND question_code IN (${questionCodes.map(() => '?').join(', ')})` : ''}`,
      questionCodes,
    );

    const existing = await loadExistingTutorialLinks();
    const editorial = includeEditorial ? await loadUnmirroredEditorialLinks(existing) : [];
    // Un couple repris de l'editorial ne doit pas etre re-propose par le texte.
    const seen = new Set(existing);
    for (const link of editorial) {
      seen.add(linkKey('tutorial', link.resource_ref, link.question_code));
    }

    const textual = tutorialMatch.suggestTutorialLinks({
      questions,
      tutorials,
      existing: seen,
      minConfidence,
      maxPerQuestion,
    });

    const candidates = [...editorial, ...textual].slice(0, SUGGEST_MAX_CANDIDATES);
    const truncated = editorial.length + textual.length > candidates.length;

    let inserted = 0;
    if (apply) {
      for (const c of candidates) {
        const result = await execute(
          `INSERT IGNORE INTO resource_question_links
            (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note,
             created_by_user_type, created_by_user_id)
           VALUES ('tutorial', ?, ?, 1, 1, ?, ?, 'suggested', ?, ?, ?)`,
          [
            c.resource_ref,
            c.question_code,
            c.origin,
            c.confidence,
            String(c.reason || '').slice(0, 255) || null,
            actor(req).userType,
            actor(req).userId,
          ],
        );
        inserted += result.affectedRows ? 1 : 0;
      }
    }

    return res.json({
      applied: apply,
      inserted,
      truncated,
      stats: {
        tutorials: tutorials.length,
        questions: questions.length,
        existing_links: existing.size,
        editorial_candidates: editorial.length,
        textual_candidates: textual.length,
      },
      candidates,
    });
  }),
);

/** POST /api/learning-links/review — valider/rejeter en masse (phase 2 : liens auto-suggeres). */
router.post(
  '/review',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const action = String(body.action || '').trim();
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Action attendue: 'approve' ou 'reject'" });
    }
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return res.status(400).json({ error: 'Aucun identifiant fourni' });
    const status = action === 'approve' ? 'approved' : 'rejected';
    const placeholders = ids.map(() => '?').join(', ');
    const result = await execute(
      `UPDATE resource_question_links SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
      [status, ...ids],
    );
    return res.json({ success: true, status, updated: result.affectedRows });
  }),
);

module.exports = router;
