'use strict';

/**
 * Détecteurs pédagogiques / scientifiques en lecture seule.
 * Aucune écriture BDD : les fonctions travaillent sur des instantanés passés par l'appelant.
 */

const TAXON_RANK_VALUES = Object.freeze(['species', 'genus', 'family', 'clade']);

const GRAPH_PRESET_TYPES = Object.freeze({
  alimentaire: Object.freeze(['herbivorie', 'predation', 'decomposition']),
  relations: Object.freeze([
    'pollinisation',
    'plante_hote',
    'symbiose',
    'competition',
    'nitrification',
  ]),
});

/** Nom scientifique d'un seul mot capitalisé, sans « sp. » : genre probable. */
function isProbableGenusName(scientificName) {
  const text = String(scientificName || '').trim();
  if (!text || /\bsp\.?\s*$/i.test(text)) return false;
  return /^[A-ZÀ-Ÿ][A-Za-zÀ-ÿ-]+$/.test(text);
}

function normalizeChoice(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function listQuestionChoices(question) {
  return ['a', 'b', 'c', 'd', 'e']
    .map((letter) => ({
      letter: letter.toUpperCase(),
      text: question[`choix_${letter}`],
    }))
    .filter((row) => row.text != null && String(row.text).trim() !== '');
}

function hasDuplicateChoices(question) {
  const texts = listQuestionChoices(question).map((row) => normalizeChoice(row.text));
  return new Set(texts).size < texts.length;
}

function missingCorrectAnswer(question) {
  const letter = String(question.reponse_correcte || '')
    .trim()
    .toUpperCase();
  if (!['A', 'B', 'C', 'D', 'E'].includes(letter)) return true;
  const key = `choix_${letter.toLowerCase()}`;
  const value = question[key];
  return value == null || String(value).trim() === '';
}

function isEchoFeedback(question) {
  const asked = String(question.question || '').trim();
  const feedback = String(question.feedback_correct || '').trim();
  if (!asked || !feedback) return false;
  return feedback === asked || feedback.includes(asked);
}

function detectGenusLikeNames(rows, { idKey = 'id', nameKey = 'nom_scientifique' } = {}) {
  return (rows || [])
    .filter((row) => isProbableGenusName(row[nameKey] || row.scientific_name))
    .map((row) => ({
      id: row[idKey] ?? row.species_code ?? row.id,
      code: row.species_code || row.glossary_code || null,
      name: row.nom_commun || row.name || null,
      scientific: row[nameKey] || row.scientific_name,
    }));
}

function detectNullTargetInteractions(rows) {
  return (rows || []).filter((row) => row.to_id == null && row.to_species_id == null);
}

function detectQuestionIssues(questions) {
  const findings = [];
  for (const question of questions || []) {
    const code = question.question_code || question.code;
    if (!question.categorie_slug) {
      findings.push({ kind: 'missing_category', code, scope: 'question' });
    }
    if (missingCorrectAnswer(question)) {
      findings.push({ kind: 'missing_correct_answer', code, scope: 'question' });
    }
    if (hasDuplicateChoices(question)) {
      findings.push({ kind: 'duplicate_choices', code, scope: 'question' });
    }
    if (isEchoFeedback(question)) {
      findings.push({ kind: 'echo_feedback', code, scope: 'question' });
    }
  }
  return findings;
}

function detectOrphanLinks(
  links,
  knownTargets,
  { linkKey = 'question_code', targetKey = 'glossary_code' } = {},
) {
  const known = new Set((knownTargets || []).map((value) => String(value)));
  return (links || [])
    .filter((row) => !known.has(String(row[targetKey])))
    .map((row) => ({
      kind: 'orphan_link',
      code: row[linkKey],
      missing: row[targetKey],
    }));
}

function buildPedagoMatrix({
  glossaryTerms = [],
  glossarySpecies = [],
  glossaryInteractions = [],
  quizGlossary = [],
  glQcmGlossary = [],
  quizTutorials = [],
  species = [],
  plants = [],
  interactions = [],
  tutorials = [],
} = {}) {
  const termByCode = new Map(glossaryTerms.map((row) => [String(row.glossary_code), row]));
  const speciesById = new Map(species.map((row) => [Number(row.id), row]));
  const plantById = new Map(plants.map((row) => [Number(row.id), row]));
  const interactionById = new Map(interactions.map((row) => [Number(row.id), row]));

  const rows = [];
  for (const link of quizGlossary) {
    const term = termByCode.get(String(link.glossary_code));
    rows.push({
      notion: term?.terme || link.glossary_code,
      glossary_code: link.glossary_code,
      question_code: link.question_code,
      species_code: null,
      plant_id: null,
      interaction_type: null,
      source: 'quiz_question_glossary',
    });
  }
  for (const link of glQcmGlossary) {
    const term = termByCode.get(String(link.glossary_code));
    rows.push({
      notion: term?.terme || link.glossary_code,
      glossary_code: link.glossary_code,
      question_code: link.question_code,
      species_code: null,
      plant_id: null,
      interaction_type: null,
      source: 'gl_qcm_question_glossary',
    });
  }
  for (const link of glossarySpecies) {
    const term = termByCode.get(String(link.glossary_code));
    const plant = plantById.get(Number(link.plant_id));
    const speciesRow = speciesById.get(Number(link.species_id || link.plant_id));
    rows.push({
      notion: term?.terme || link.glossary_code,
      glossary_code: link.glossary_code,
      question_code: null,
      species_code: speciesRow?.species_code || null,
      plant_id: plant?.id || link.plant_id || null,
      interaction_type: null,
      source: 'glossary_term_species',
    });
  }
  for (const link of glossaryInteractions) {
    const term = termByCode.get(String(link.glossary_code));
    const interaction = interactionById.get(Number(link.interaction_id));
    rows.push({
      notion: term?.terme || link.glossary_code,
      glossary_code: link.glossary_code,
      question_code: null,
      species_code: null,
      plant_id: interaction?.from_plant_id || interaction?.from_id || null,
      interaction_type: interaction?.interaction_type || null,
      source: 'glossary_term_interactions',
    });
  }
  const tutorialById = new Map(tutorials.map((row) => [String(row.id), row]));
  for (const link of quizTutorials) {
    const tutorial = tutorialById.get(String(link.tutorial_id || link.resource_ref));
    rows.push({
      notion: tutorial?.title || tutorial?.slug || link.resource_ref,
      glossary_code: null,
      question_code: link.question_code,
      species_code: null,
      plant_id: null,
      tutorial_slug: tutorial?.slug || null,
      interaction_type: null,
      source: 'resource_question_links_tutorial',
    });
  }
  return rows;
}

function countResourcesWithoutGating({ resources = [], links = [], refKey = 'id' } = {}) {
  const gated = new Set(
    (links || [])
      .filter((row) => Number(row.is_gating) === 1 && String(row.status || '') === 'approved')
      .map((row) => String(row.resource_ref)),
  );
  return (resources || []).filter((row) => !gated.has(String(row[refKey] ?? row.id ?? row.slug)));
}

function isolatedMatrixNotions(matrix) {
  const byNotion = new Map();
  for (const row of matrix || []) {
    const key = String(row.notion || row.glossary_code || '');
    if (!byNotion.has(key)) byNotion.set(key, []);
    byNotion.get(key).push(row);
  }
  return [...byNotion.entries()]
    .filter(([, list]) => {
      const hasQuestion = list.some((row) => row.question_code);
      const hasOrganism = list.some((row) => row.species_code || row.plant_id);
      const hasInteraction = list.some((row) => row.interaction_type);
      return [hasQuestion, hasOrganism, hasInteraction].filter(Boolean).length <= 1;
    })
    .map(([notion, list]) => ({ notion, links: list.length }));
}

function analyzePedagoSnapshot(snapshot = {}) {
  const findings = [];
  findings.push(
    ...detectGenusLikeNames(snapshot.glSpecies || [], { idKey: 'species_code' }).map((row) => ({
      kind: 'genus_as_species',
      scope: 'gl_species',
      ...row,
    })),
  );
  findings.push(
    ...detectGenusLikeNames(snapshot.plants || [], {
      idKey: 'id',
      nameKey: 'scientific_name',
    }).map((row) => ({
      kind: 'genus_as_species',
      scope: 'plants',
      ...row,
    })),
  );
  findings.push(
    ...detectQuestionIssues([
      ...(snapshot.quizQuestions || []),
      ...(snapshot.glQcmQuestions || []),
    ]),
  );
  findings.push(
    ...detectOrphanLinks(snapshot.quizGlossaryLinks || [], snapshot.glossaryCodes || [], {
      linkKey: 'question_code',
      targetKey: 'glossary_code',
    }),
  );
  findings.push(
    ...detectOrphanLinks(snapshot.glQcmGlossaryLinks || [], snapshot.glGlossaryCodes || [], {
      linkKey: 'question_code',
      targetKey: 'glossary_code',
    }),
  );
  const nullTargets = detectNullTargetInteractions([
    ...(snapshot.speciesInteractions || []),
    ...(snapshot.glSpeciesInteractions || []),
  ]);
  const matrix = buildPedagoMatrix({
    glossaryTerms: snapshot.glossaryTerms || [],
    glossarySpecies: snapshot.glossarySpecies || [],
    glossaryInteractions: snapshot.glossaryInteractions || [],
    quizGlossary: snapshot.quizGlossaryLinks || [],
    glQcmGlossary: snapshot.glQcmGlossaryLinks || [],
    quizTutorials: snapshot.quizTutorialLinks || [],
    species: snapshot.glSpecies || [],
    plants: snapshot.plants || [],
    tutorials: snapshot.tutorials || [],
    interactions: snapshot.speciesInteractions || [],
  });
  const isolated = isolatedMatrixNotions(matrix);
  const tutorialsWithoutGating = countResourcesWithoutGating({
    resources: (snapshot.tutorials || []).map((row) => ({ ...row, id: String(row.id) })),
    links: snapshot.tutorialGatingLinks || [],
    refKey: 'id',
  });
  const blocking = findings.filter((row) =>
    ['missing_correct_answer', 'orphan_link', 'duplicate_choices'].includes(row.kind),
  );
  return {
    findings,
    blockingCount: blocking.length,
    nullTargetInteractions: nullTargets.length,
    matrix,
    isolatedNotions: isolated,
    tutorialsWithoutGating,
  };
}

function formatAuditReport(result) {
  const lines = [
    `Anomalies : ${result.findings.length} (bloquantes : ${result.blockingCount})`,
    `Interactions sans cible : ${result.nullTargetInteractions}`,
    `Matrice pédagogique : ${result.matrix.length} liens, ${result.isolatedNotions.length} notions isolées`,
    `Tutoriels sans question bloquante : ${(result.tutorialsWithoutGating || []).length}`,
  ];
  for (const finding of result.findings.slice(0, 40)) {
    lines.push(
      `- ${finding.kind}${finding.scope ? ` [${finding.scope}]` : ''}${
        finding.code || finding.id ? ` ${finding.code || finding.id}` : ''
      }${finding.scientific ? ` (${finding.scientific})` : ''}${
        finding.missing ? ` → ${finding.missing}` : ''
      }`,
    );
  }
  return lines.join('\n');
}

module.exports = {
  TAXON_RANK_VALUES,
  GRAPH_PRESET_TYPES,
  isProbableGenusName,
  hasDuplicateChoices,
  missingCorrectAnswer,
  isEchoFeedback,
  detectGenusLikeNames,
  detectNullTargetInteractions,
  detectQuestionIssues,
  detectOrphanLinks,
  buildPedagoMatrix,
  isolatedMatrixNotions,
  countResourcesWithoutGating,
  analyzePedagoSnapshot,
  formatAuditReport,
};
