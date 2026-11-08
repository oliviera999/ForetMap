'use strict';

/**
 * Chargement de l'instantané nécessaire aux contrôles (`checks.js`) et outils MCP d'audit.
 *
 * Seules les parties demandées par les contrôles lancés sont lues, en lecture seule et sur
 * la liste blanche (`withReadOnly`). Les colonnes lues sont explicites : aucune colonne
 * nominative n'entre dans l'instantané.
 */

const { z } = require('zod');
const { withReadOnly } = require('../readDb');
const { CHECKS, CHECK_NAMES, runCheck } = require('./checks');
const { READ_ONLY, READ_REQUIRES } = require('../tools/common');

/** Requêtes par partie d'instantané (lecture complète bornée à 20 000 lignes). */
const SNAPSHOT_SQL = Object.freeze({
  plants: `SELECT id, name, emoji, scientific_name, photo, photo_credit, photo_licence,
                  description, ecosystem_role, remarks FROM plants ORDER BY id`,
  plantPhotos: 'SELECT id, plant_id, kind, credit, licence FROM plant_photos ORDER BY id',
  plantAliases: 'SELECT alias, plant_id FROM plant_name_aliases ORDER BY plant_id',
  zones: 'SELECT id, map_id, name, emoji, special FROM zones ORDER BY id',
  markers: 'SELECT id, map_id, label, emoji FROM map_markers ORDER BY id',
  zoneSpecies: 'SELECT zone_id, plant_id FROM zone_species ORDER BY zone_id, plant_id',
  markerSpecies: 'SELECT marker_id, plant_id FROM marker_species ORDER BY marker_id, plant_id',
  mapSpecies: 'SELECT map_id, plant_id FROM map_species ORDER BY map_id, plant_id',
  idKeys: 'SELECT id, map_id, is_published FROM id_keys ORDER BY id',
  idKeyCouplets: 'SELECT id, key_id, number FROM id_key_couplets ORDER BY id',
  idKeyLeads:
    'SELECT id, couplet_id, sort_order, next_couplet_id, plant_id FROM id_key_leads ORDER BY id',
  tutorials:
    'SELECT id, title, summary, html_content FROM tutorials WHERE is_active = 1 ORDER BY id',
  glossaryTerms:
    'SELECT glossary_code, terme, variantes, definition_courte FROM glossary_terms ORDER BY glossary_code',
  glossaryTermSpecies: 'SELECT glossary_code, plant_id FROM glossary_term_species',
  glossaryTermTutorials: 'SELECT glossary_code, tutorial_id FROM glossary_term_tutorials',
  quizQuestions: `SELECT question_code, categorie_slug, question, choix_a, choix_b, choix_c, choix_d,
                         choix_e, reponse_correcte, niveau, difficulte, feedback_correct, feedback_a,
                         feedback_b, feedback_c, feedback_d, feedback_e, photo_url, photo_credit,
                         photo_licence, statut FROM quiz_questions ORDER BY question_code`,
  quizQuestionSpecies: 'SELECT question_code, plant_id FROM quiz_question_species',
  resourceQuestionLinks: `SELECT id, resource_type, resource_ref, question_code, status, origin
                            FROM resource_question_links ORDER BY id`,
  glSpecies: `SELECT id, species_code, nom_commun, nom_scientifique, photo_url, photo_credit,
                     photo_licence, description_courte, role_ecologique, adaptations_cles, anecdote
                FROM gl_species ORDER BY id`,
  glSpeciesInteractions:
    'SELECT id, from_species_id, to_species_id FROM gl_species_interactions ORDER BY id',
  glGlossaryTerms: `SELECT glossary_code, terme, variantes, definition_courte
                      FROM gl_glossary_terms ORDER BY glossary_code`,
  glLoreGlossaryTerms:
    'SELECT lore_code, terme, variantes FROM gl_lore_glossary_terms ORDER BY lore_code',
  glQcmQuestions: `SELECT question_code, biome_slug, categorie_slug, question, choix_a, choix_b,
                          choix_c, choix_d, choix_e, reponse_correcte, niveau, difficulte,
                          feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d,
                          feedback_e, photo_url, photo_credit, photo_licence, tags, mots_cles,
                          statut FROM gl_qcm_questions ORDER BY question_code`,
  glQcmLoreQuestions: `SELECT question_code, question, choix_a, choix_b, choix_c, choix_d, choix_e,
                              reponse_correcte, niveau, difficulte, feedback_correct, feedback_a,
                              feedback_b, feedback_c, feedback_d, feedback_e, statut
                         FROM gl_qcm_lore_questions ORDER BY question_code`,
  glResourceQuestionLinks: `SELECT id, question_dataset, resource_type, resource_ref,
                                   question_code, status, origin
                              FROM gl_resource_question_links ORDER BY id`,
  glChapterMarkers: `SELECT id, chapter_id, order_index, event_type, label, effet_mecanique,
                            qcm_question_code, event_config_json FROM gl_chapter_markers ORDER BY id`,
  glChapters: 'SELECT id, slug, plateau_number FROM gl_chapters ORDER BY id',
  glLoreFeuillets:
    'SELECT feuillet_code, titre, incipit, texte, texte_accessible FROM gl_lore_feuillets',
});

/** Partie calculée : liens glossaire que l'appariement par mots-clés produirait aujourd'hui. */
function computeExpectedImportLinks(glQcmQuestions, glGlossaryTerms) {
  const { buildGlossaryLookupMap, matchGlossaryTermsForSpecies } = require('../../glossaryMatch');
  const active = (glGlossaryTerms || []).filter((t) => (t.statut || 'actif') === 'actif');
  const lookup = buildGlossaryLookupMap(active);
  const out = new Map();
  for (const q of glQcmQuestions || []) {
    const keywords = [q.tags, q.mots_cles].filter(Boolean).join(', ');
    const matched = matchGlossaryTermsForSpecies(keywords, lookup);
    out.set(q.question_code, new Set(matched.map((m) => m.glossary_code)));
  }
  return out;
}

async function tableExists(db, name) {
  const rows = await db.raw(
    `SELECT TABLE_NAME AS t FROM information_schema.tables
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [name],
    { allowInformationSchemaTables: true },
  );
  return rows.length > 0;
}

/**
 * Lit les parties d'instantané demandées.
 * @param {string[]} needs
 */
async function loadSnapshot(needs) {
  const wanted = new Set(needs);
  if (wanted.has('expectedImportLinks')) {
    wanted.add('glQcmQuestions');
    wanted.add('glGlossaryTerms');
  }
  return withReadOnly(
    async (db) => {
      const snapshot = {};
      for (const part of wanted) {
        if (SNAPSHOT_SQL[part]) snapshot[part] = await db.selectAll(SNAPSHOT_SQL[part]);
      }
      if (wanted.has('glGlossaryTerms')) {
        // `statut` pour l'appariement (le SELECT d'instantané reste minimal).
        const statut = await db.selectAll(
          'SELECT glossary_code, statut FROM gl_glossary_terms ORDER BY glossary_code',
        );
        const byCode = new Map(statut.map((r) => [r.glossary_code, r.statut]));
        for (const t of snapshot.glGlossaryTerms) t.statut = byCode.get(t.glossary_code);
      }
      if (wanted.has('legacyGlQcmQuestionGlossary')) {
        snapshot.legacyGlQcmQuestionGlossary = (await tableExists(db, 'gl_qcm_question_glossary'))
          ? await db.selectAll(
              'SELECT question_code, glossary_code FROM gl_qcm_question_glossary ORDER BY question_code',
            )
          : null;
      }
      if (wanted.has('expectedImportLinks')) {
        snapshot.expectedImportLinks = computeExpectedImportLinks(
          snapshot.glQcmQuestions,
          snapshot.glGlossaryTerms,
        );
      }
      return snapshot;
    },
    { timeoutMs: 15000 },
  );
}

async function runAudit(name) {
  const snapshot = await loadSnapshot(CHECKS[name].needs);
  return runCheck(name, snapshot);
}

async function runAllAudits() {
  const needs = [...new Set(CHECK_NAMES.flatMap((n) => CHECKS[n].needs))];
  const started = Date.now();
  const snapshot = await loadSnapshot(needs);
  const results = CHECK_NAMES.map((n) => {
    const r = runCheck(n, snapshot);
    return { check: r.check, count: r.count, sample_ids: r.sample_ids.slice(0, 5) };
  });
  return {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    total_findings: results.reduce((acc, r) => acc + r.count, 0),
    checks: results,
    note: 'Détail d’un contrôle (50 identifiants, description, piste) : foretmap_audit avec `check`.',
  };
}

function buildAuditTools() {
  return [
    {
      name: 'foretmap_audit',
      title: 'Audit de cohérence du corpus',
      description:
        'Lance UN contrôle de cohérence du contenu pédagogique et renvoie {check, description, count, sample_ids (≤ 50), hint}. Contrôles : ' +
        CHECK_NAMES.map((n) => `${n} (${CHECKS[n].description})`).join(' ; ') +
        '. Lecture seule.',
      inputSchema: z.strictObject({
        check: z.enum(CHECK_NAMES).describe('Contrôle à lancer'),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: (args) => runAudit(args.check),
    },
    {
      name: 'foretmap_audit_all',
      title: 'Tableau de bord des audits',
      description:
        'Lance tous les contrôles de cohérence en une fois et renvoie un tableau de bord compact (nombre de constats et 5 exemples par contrôle). Point de départ recommandé pour une revue du corpus.',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: runAllAudits,
    },
  ];
}

module.exports = {
  SNAPSHOT_SQL,
  buildAuditTools,
  computeExpectedImportLinks,
  loadSnapshot,
  runAllAudits,
  runAudit,
};
