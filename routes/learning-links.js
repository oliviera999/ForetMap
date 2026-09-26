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
const core = require('../lib/shared/resourceQuestionGatingCore');
const { getFmGatingSite } = require('../lib/learningGatingRuntime');
const gatingAdmin = require('../lib/learningGatingAdmin');
const gatingProgress = require('../lib/learningGatingProgress');
const tutorialMatch = require('../lib/shared/tutorialQuestionMatch');
const labelMatch = require('../lib/shared/resourceQuestionMatch');
const linksBulk = require('../lib/learningLinksBulk');
const { invalidateStrictCodesCache } = require('../lib/learningGatingLockMode');
const policyHelpers = require('../lib/gatingPolicyRouteHelpers');
const layers = require('../lib/shared/gatingPolicyLayersCore');
const learningLinks = require('../lib/pedago/learningLinks');

const router = express.Router();
const managePermission = requirePermission('plants.manage');

/** Plafond d'une liste de liens ; renvoyé au client avec `total` (B5). */
const LINKS_MAX_ROWS = 1000;
const ALLOWED = core.FORETMAP_RESOURCE_TYPES;

function actor(req) {
  const a = req.auth || {};
  return { userType: a.userType || 'teacher', userId: a.userId || a.canonicalUserId || null };
}

/** Reglages de conditionnement du site (catalogue commun). */
async function getSiteGating() {
  return getFmGatingSite();
}

/** `statut` d'une question, ou `null` si elle n'existe pas. */
async function questionStatut(code) {
  const row = await queryOne('SELECT statut FROM quiz_questions WHERE question_code = ? LIMIT 1', [
    code,
  ]);
  return row ? String(row.statut || '') : null;
}

/** GET /api/learning-links — liste filtree (resourceType, resourceRef, questionCode, status). */
router.get(
  '/',
  managePermission,
  asyncHandler(async (req, res) => {
    // Filtre commun aux deux produits (`lib/shared/resourceQuestionGatingCore.js`) : seule la
    // table diffère, et c'est la frontière d'isolement produit — elle reste ici.
    const filtre = core.buildLinksFilter(req.query, { allowedTypes: ALLOWED });
    if (filtre.error) return res.status(400).json({ error: filtre.error });
    const { where, params } = filtre;
    const { links, total } = await learningLinks.listLinks(
      { queryAll, queryOne },
      { whereSql: core.linksWhereClause(where), params, maxRows: LINKS_MAX_ROWS },
    );
    // Plafond annoncé plutôt que muet (B5) : `total` dit ce que le filtre vise vraiment.
    return res.json({
      links,
      total,
      max_rows: LINKS_MAX_ROWS,
      truncated: total > links.length,
    });
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
    const provided = parsed.provided || {};
    const statut = await questionStatut(v.question_code);
    if (statut == null) {
      return res.status(404).json({ error: 'Question introuvable' });
    }
    // Garde-fou : un lien BLOQUANT sur un type que ForetMap ne sait pas valider ne
    // conditionnera jamais rien. Il etait accepte sans un mot, et le professeur croyait
    // avoir conditionne la fiche. Le lien non bloquant, lui, reste permis.
    if (v.is_gating && !linksBulk.isMarkableResourceType('fm', v.resource_type)) {
      return res
        .status(400)
        .json({ error: linksBulk.nonMarkableGatingError('fm', v.resource_type) });
    }
    // Lien existant : le caractère bloquant et l'origine ne sont réécrits que si le corps les
    // fournit (B3) — recréer un couple sans les dire ne doit rien conditionner.
    const row = await learningLinks.upsertLink({ execute, queryOne }, v, {
      provided,
      actor: actor(req),
    });
    invalidateStrictCodesCache();
    // Question inactive : le lien est enregistré mais ne verrouillera rien tant qu'elle n'est
    // pas réactivée — on le dit au professeur au lieu de le laisser croire le contraire
    // (audit du 25/09/2026, § 1.5 ; A5 de docs/AUDIT_VALIDATION_QUIZ_2026-09.md).
    const warning =
      statut !== 'actif'
        ? 'Question inactive : ce lien ne conditionnera rien tant qu’elle n’est pas réactivée.'
        : undefined;
    return res.status(201).json({ link: row, ...(warning ? { warning } : {}) });
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
    const changes = {};
    const body = req.body || {};
    if (body.is_gating !== undefined) {
      if (body.is_gating) {
        const existing = await learningLinks.findLinkById({ queryOne }, id);
        if (!existing) return res.status(404).json({ error: 'Lien introuvable' });
        if (!linksBulk.isMarkableResourceType('fm', existing.resource_type)) {
          return res
            .status(400)
            .json({ error: linksBulk.nonMarkableGatingError('fm', existing.resource_type) });
        }
      }
      changes.is_gating = body.is_gating ? 1 : 0;
    }
    if (body.weight !== undefined) {
      const w = Number(body.weight);
      if (!Number.isFinite(w) || w < 0) return res.status(400).json({ error: 'Poids invalide' });
      changes.weight = Math.floor(w);
    }
    if (body.status !== undefined) {
      const s = core.normalizeStatus(body.status, null);
      if (!s) return res.status(400).json({ error: 'Statut invalide' });
      changes.status = s;
    }
    if (body.note !== undefined) {
      changes.note = body.note == null ? null : String(body.note).trim().slice(0, 255) || null;
    }
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'Aucune modification' });
    const row = await learningLinks.updateLink({ execute, queryOne }, id, changes);
    if (!row) return res.status(404).json({ error: 'Lien introuvable' });
    invalidateStrictCodesCache();
    return res.json({ link: row });
  }),
);

/**
 * GET /api/learning-links/locks?includeExpired=&resourceType=
 * Eleves actuellement bloques par le conditionnement (constat C4 de l'audit :
 * le dispositif pouvait punir sans que personne ne le voie).
 */
router.get(
  '/locks',
  managePermission,
  asyncHandler(async (req, res) => {
    const includeExpired = String(req.query.includeExpired || '') === '1';
    const rt = req.query.resourceType
      ? core.normalizeResourceType(req.query.resourceType, ALLOWED)
      : null;
    if (req.query.resourceType && !rt) {
      return res.status(400).json({ error: 'Type de ressource invalide' });
    }
    const locks = await gatingAdmin.listFmLocks({ queryAll }, { includeExpired, resourceType: rt });
    return res.json({ locks, max_rows: gatingAdmin.MAX_ROWS });
  }),
);

/**
 * DELETE /api/learning-links/locks — leve un verrou.
 * Sans ce geste, l'ecran ne ferait que constater les degats.
 */
router.delete(
  '/locks',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rt = core.normalizeResourceType(body.resource_type ?? body.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(body.resource_ref ?? body.resourceRef);
    const userId = String(body.user_id ?? body.userId ?? '').trim();
    if (!rt || !ref || !userId) return res.status(400).json({ error: 'Verrou invalide' });
    const questionCode = core.normalizeQuestionCode(body.question_code ?? body.questionCode) || '';
    const result = await gatingAdmin.releaseFmLock(
      { execute },
      { userId, resourceType: rt, resourceRef: ref, questionCode },
    );
    if (!result.released) return res.status(404).json({ error: 'Verrou introuvable' });
    return res.json({ success: true, released: result.released });
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
    const deleted = await learningLinks.deleteLinkById({ execute }, id);
    if (!deleted) return res.status(404).json({ error: 'Lien introuvable' });
    invalidateStrictCodesCache();
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
    const site = await getSiteGating();
    const bundle = await policyHelpers.loadPolicyBundle(
      { queryOne },
      {
        table: 'resource_gating_policy',
        resourceType: rt,
        resourceRef: ref,
        site,
        product: 'fm',
      },
    );
    return res.json(bundle);
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
    const existing = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const who = actor(req);
    const perResource = await policyHelpers.upsertGatingPolicy(
      { execute, queryOne },
      {
        table: 'resource_gating_policy',
        resourceType: rt,
        resourceRef: ref,
        body,
        existing,
        actor: who,
      },
    );
    const site = await getSiteGating();
    const typePolicy = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, '*'],
    );
    return res.json(
      layers.formatPolicyResponse({
        policy: perResource,
        typePolicy,
        site,
        product: 'fm',
        resourceType: rt,
      }),
    );
  }),
);

/** GET /api/learning-links/type-policy?resourceType= — préréglage par type (resource_ref='*'). */
router.get(
  '/type-policy',
  managePermission,
  asyncHandler(async (req, res) => {
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    if (!rt) return res.status(400).json({ error: 'Type de ressource invalide' });
    const site = await getSiteGating();
    const policy = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, '*'],
    );
    return res.json(
      layers.formatPolicyResponse({
        policy,
        typePolicy: policy,
        site,
        product: 'fm',
        resourceType: rt,
        effective: layers.resolveEffectiveGatingPolicy({
          typePolicy: policy,
          site,
          product: 'fm',
          resourceType: rt,
        }),
      }),
    );
  }),
);

/** PUT /api/learning-links/type-policy — préréglage par type (resource_ref='*'). */
router.put(
  '/type-policy',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rt = core.normalizeResourceType(body.resource_type ?? body.resourceType, ALLOWED);
    if (!rt) return res.status(400).json({ error: 'Type de ressource invalide' });
    const existing = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, '*'],
    );
    const who = actor(req);
    const perResource = await policyHelpers.upsertGatingPolicy(
      { execute, queryOne },
      {
        table: 'resource_gating_policy',
        resourceType: rt,
        resourceRef: '*',
        body,
        existing,
        actor: who,
      },
    );
    const site = await getSiteGating();
    return res.json(
      layers.formatPolicyResponse({
        policy: perResource,
        typePolicy: perResource,
        site,
        product: 'fm',
        resourceType: rt,
        effective: layers.resolveEffectiveGatingPolicy({
          typePolicy: perResource,
          site,
          product: 'fm',
          resourceType: rt,
        }),
      }),
    );
  }),
);

/** GET /api/learning-links/progress?resourceType=&resourceRef= — agrégats prof (sans noms). */
router.get(
  '/progress',
  managePermission,
  asyncHandler(async (req, res) => {
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(req.query.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const result = await gatingProgress.getFmResourceProgressSummary(
      { queryAll, queryOne, execute },
      { resourceType: rt, resourceRef: ref },
    );
    return res.json(result);
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

    // L'ecran ne listait QUE les tutoriels, et cette route refusait tout autre type :
    // impossible d'y rendre bloquant un lien vers une fiche espece ou un terme de
    // glossaire, alors que le moteur d'appariement les couvre. Les trois types sont
    // desormais servis, avec les memes compteurs (`gating_count` : liens bloquants vers une
    // question ACTIVE ; `inactive_gating_count` a part — service `learningLinks`).
    const resources = await learningLinks.listResourceCoverage({ queryAll }, type);
    if (!resources) return res.status(400).json({ error: 'Type de ressource invalide' });
    return res.json({
      resource_type: type,
      // Un type non validable peut porter des liens documentaires, jamais de lien
      // bloquant : l'ecran le dit au lieu de laisser croire a un conditionnement.
      markable: linksBulk.isMarkableResourceType('fm', type),
      // Ressources qui s'ouvrent librement faute de question active (décision du 25/09/2026 :
      // l'ouverture est gardée, mais rendue visible).
      without_active_gating_count: resources.filter((r) => r.gating_count === 0).length,
      resources,
    });
  }),
);

/**
 * Ressources a LIBELLE court et specifique : plantes et termes de glossaire.
 *
 * Pour celles-la, le bon moteur est `resourceQuestionMatch`, qui cherche le libelle
 * DANS l'enonce — « Menthe », « photosynthese » y apparaissent tels quels. Le moteur
 * de contenu (`tutorialQuestionMatch`) n'a de sens que pour un tutoriel, dont le
 * corps est long et le titre peu present dans les questions.
 */
async function loadLabelledResources(types, refs) {
  const out = [];
  const refFilter = (col) =>
    refs.length ? `AND ${col} IN (${refs.map(() => '?').join(', ')})` : '';
  if (types.includes('plant')) {
    const rows = await queryAll(
      `SELECT id, name, second_name, scientific_name FROM plants WHERE 1=1 ${refFilter('id')}`,
      refs.length ? refs : [],
    );
    out.push(
      ...rows.map((r) => ({
        type: 'plant',
        ref: String(r.id),
        labels: [r.name, r.second_name, r.scientific_name],
      })),
    );
  }
  if (types.includes('glossary')) {
    const rows = await queryAll(
      `SELECT glossary_code, terme, variantes FROM glossary_terms
        WHERE statut = 'actif' ${refFilter('glossary_code')}`,
      refs.length ? refs : [],
    );
    out.push(
      ...rows.map((r) => ({
        type: 'glossary',
        ref: String(r.glossary_code),
        labels: [r.terme, r.variantes],
      })),
    );
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
 * Corps : { apply?, minConfidence?, maxPerQuestion?, questionCodes?, resourceRefs?, resourceTypes? }
 * (`includeEditorial`, historique, est accepte et ignore.)
 */
router.post(
  '/suggest',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const apply = body.apply === true || body.apply === 'true';

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
    // Par defaut les trois types : le rattachement automatique ne couvrait que les
    // tutoriels, laissant fiches especes et glossaire au seul script en ligne de commande.
    const requestedTypes = Array.isArray(body.resourceTypes)
      ? body.resourceTypes.map((t) => core.normalizeResourceType(t, ALLOWED)).filter(Boolean)
      : [...ALLOWED];
    const types = requestedTypes.length ? [...new Set(requestedTypes)] : [...ALLOWED];

    const tutorials = types.includes('tutorial')
      ? await queryAll(
          `SELECT id, title, summary, html_content FROM tutorials
        WHERE is_active = 1
        ${resourceRefs.length ? `AND id IN (${resourceRefs.map(() => '?').join(', ')})` : ''}`,
          resourceRefs,
        )
      : [];
    const questions = await queryAll(
      `SELECT question_code AS code, question AS text, reponse_texte, tags, feedback_correct
         FROM quiz_questions
        WHERE statut = 'actif'
        ${questionCodes.length ? `AND question_code IN (${questionCodes.map(() => '?').join(', ')})` : ''}`,
      questionCodes,
    );

    // Couples deja lies, tous statuts confondus (y compris rejetes : ne pas re-proposer).
    const existing = await learningLinks.listLinkKeys({ queryAll });
    // `includeEditorial` n'a plus d'effet : la reprise des « questions liées » saisies dans
    // `quiz_question_tutorials` est faite une fois pour toutes par la migration 300, et
    // cette table n'est plus lue (temps 1 du retrait, audit du 25/09/2026, § 3.5). Le
    // parametre reste accepte, et `stats.editorial_candidates` vaut toujours 0.
    const seen = new Set(existing);

    // Tutoriels : rapprochement de CONTENU (le titre seul ne suffit pas).
    const textual = tutorials.length
      ? tutorialMatch.suggestTutorialLinks({
          questions,
          tutorials,
          existing: seen,
          minConfidence,
          maxPerQuestion,
        })
      : [];

    // Plantes et glossaire : recherche du LIBELLE dans l'enonce — court et specifique,
    // c'est la direction qui convient a « Menthe » ou « photosynthese ».
    const labelledTypes = types.filter((t) => t !== 'tutorial');
    const labelled = labelledTypes.length
      ? labelMatch
          .suggestLinks({
            questions: questions.map((q) => ({
              code: q.code,
              text: q.text,
              tags: q.tags,
              extra: q.reponse_texte,
            })),
            resources: await loadLabelledResources(labelledTypes, resourceRefs),
            existing: seen,
            minConfidence,
            maxPerQuestion,
          })
          .map((link) => ({ ...link, matched_terms: [], resource_label: null }))
      : [];

    const found = [...textual, ...labelled];
    const candidates = found.slice(0, SUGGEST_MAX_CANDIDATES);
    const truncated = found.length > candidates.length;

    // `suggested`, non bloquant, `INSERT IGNORE` : un couple existant n'est jamais touché.
    const inserted = apply
      ? await learningLinks.insertSuggestedLinks({ execute }, candidates, actor(req))
      : 0;

    return res.json({
      applied: apply,
      inserted,
      truncated,
      stats: {
        resource_types: types,
        tutorials: tutorials.length,
        questions: questions.length,
        existing_links: existing.size,
        editorial_candidates: 0,
        textual_candidates: textual.length,
        labelled_candidates: labelled.length,
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
    const status = action === 'approve' ? 'approved' : 'rejected';

    // Toute une ressource d'un coup. Le rattachement automatique insere en
    // `status = 'suggested'`, que le conditionnement n'accepte pas : sans cette forme, il
    // fallait quarante changements de liste deroulante pour quarante propositions, et
    // personne n'allait au bout — l'ecran produisait des liens que rien n'activait.
    // N'agit que sur le statut : le caractere bloquant reste la decision explicite du
    // professeur, ligne par ligne. Approuver n'est pas conditionner.
    if (!ids.length) {
      const rt = core.normalizeResourceType(body.resourceType ?? body.resource_type, ALLOWED);
      const ref = core.normalizeResourceRef(body.resourceRef ?? body.resource_ref);
      if (!rt || !ref) {
        return res.status(400).json({
          error: 'Aucun identifiant fourni (ou indiquez resourceType + resourceRef)',
        });
      }
      const bulk = await linksBulk.reviewSuggestedLinks(
        { execute },
        { product: 'fm', status, resourceType: rt, resourceRef: ref },
      );
      return res.json({ success: true, status, updated: bulk.updated });
    }

    const bulk = await linksBulk.reviewSuggestedLinks({ execute }, { product: 'fm', status, ids });
    return res.json({ success: true, status, updated: bulk.updated });
  }),
);

/**
 * POST /api/learning-links/gating — rendre bloquantes (ou non) des questions rattachées, en lot.
 * Corps : `{ is_gating, ids? }` ou `{ is_gating, resourceType, resourceRef }` (liens approuvés
 * de la ressource). Le geste explicite qui conditionne, maintenant qu'approuver ne le fait plus.
 */
router.post(
  '/gating',
  managePermission,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rawFlag = body.is_gating ?? body.isGating;
    if (rawFlag == null) return res.status(400).json({ error: 'is_gating attendu' });
    const isGating = rawFlag === true || rawFlag === 1 || rawFlag === '1' || rawFlag === 'true';
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    let rt = null;
    let ref = null;
    if (!ids.length) {
      rt = core.normalizeResourceType(body.resourceType ?? body.resource_type, ALLOWED);
      ref = core.normalizeResourceRef(body.resourceRef ?? body.resource_ref);
      if (!rt || !ref) {
        return res.status(400).json({
          error: 'Aucun identifiant fourni (ou indiquez resourceType + resourceRef)',
        });
      }
    }
    const bulk = await linksBulk.setLinksGating(
      { execute },
      { product: 'fm', isGating, ids, resourceType: rt, resourceRef: ref },
    );
    if (!bulk.ok) return res.status(400).json({ error: bulk.error });
    return res.json({ success: true, is_gating: isGating ? 1 : 0, updated: bulk.updated });
  }),
);

module.exports = router;
