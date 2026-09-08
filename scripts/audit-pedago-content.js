#!/usr/bin/env node
/**
 * Audit pédagogique / scientifique en LECTURE SEULE.
 * Usage : npm run audit:pedago
 * Code 0 : rapport affiché (même s'il y a des alertes non bloquantes)
 * Code 1 : base injoignable ou anomalies bloquantes
 */
require('dotenv').config();

const { queryAll } = require('../database');
const { analyzePedagoSnapshot, formatAuditReport } = require('../lib/pedagoContentAudit');

async function loadSnapshot() {
  const [
    glSpecies,
    plants,
    quizQuestions,
    glQcmQuestions,
    glossaryTerms,
    glGlossaryTerms,
    quizGlossaryLinks,
    glQcmGlossaryLinks,
    glossarySpecies,
    glossaryInteractions,
    speciesInteractions,
    glSpeciesInteractions,
  ] = await Promise.all([
    queryAll('SELECT id, species_code, nom_commun, nom_scientifique FROM gl_species'),
    queryAll('SELECT id, name, scientific_name FROM plants'),
    queryAll(
      `SELECT question_code, categorie_slug, question, choix_a, choix_b, choix_c, choix_d, choix_e,
              reponse_correcte, feedback_correct FROM quiz_questions`,
    ),
    queryAll(
      `SELECT question_code, biome_slug, categorie_slug, question, choix_a, choix_b, choix_c, choix_d, choix_e,
              reponse_correcte, feedback_correct FROM gl_qcm_questions`,
    ),
    queryAll('SELECT glossary_code, terme FROM glossary_terms'),
    queryAll('SELECT glossary_code, terme FROM gl_glossary_terms'),
    queryAll(
      `SELECT question_code, resource_ref AS glossary_code
         FROM resource_question_links
        WHERE resource_type = 'glossary' AND status = 'approved'`,
    ),
    queryAll(
      `SELECT question_code, resource_ref AS glossary_code
         FROM gl_resource_question_links
        WHERE question_dataset = 'qcm' AND resource_type = 'glossary' AND status = 'approved'`,
    ),
    queryAll('SELECT glossary_code, plant_id FROM glossary_term_species'),
    queryAll('SELECT glossary_code, interaction_id FROM glossary_term_interactions'),
    queryAll(
      'SELECT id, from_plant_id AS from_id, to_plant_id AS to_id, interaction_type FROM species_interactions',
    ),
    queryAll(
      'SELECT id, from_species_id, to_species_id, interaction_type FROM gl_species_interactions',
    ),
  ]);

  return {
    glSpecies,
    plants,
    quizQuestions,
    glQcmQuestions,
    glossaryTerms,
    glossarySpecies,
    glossaryInteractions,
    quizGlossaryLinks,
    glQcmGlossaryLinks,
    speciesInteractions,
    glSpeciesInteractions,
    glossaryCodes: glossaryTerms.map((row) => row.glossary_code),
    glGlossaryCodes: glGlossaryTerms.map((row) => row.glossary_code),
  };
}

async function main() {
  let snapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (err) {
    console.error('[audit:pedago] Base injoignable :', err.message);
    process.exit(1);
  }
  const result = analyzePedagoSnapshot(snapshot);
  console.log(formatAuditReport(result));
  if (result.isolatedNotions.length) {
    console.log('\nNotions isolées (peu de connexions) :');
    for (const row of result.isolatedNotions.slice(0, 20)) {
      console.log(`  - ${row.notion} (${row.links} lien${row.links > 1 ? 's' : ''})`);
    }
  }
  process.exit(result.blockingCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { loadSnapshot, main };
