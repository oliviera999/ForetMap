'use strict';

// =====================================================================
// Phase 2 — Generation de SUGGESTIONS de liens « ressource <-> question ».
// Charge questions + ressources depuis la BDD, applique le moteur textuel
// (lib/shared/resourceQuestionMatch.js) et produit un rapport (dry-run par
// defaut). Avec --apply, insere les candidats en origin='auto', status='suggested'
// (a valider ensuite par le prof/MJ via /api/(gl/)learning-links).
//
// Usage :
//   node scripts/suggest-learning-links.js --product=foretmap [--dataset=quiz]
//   node scripts/suggest-learning-links.js --product=gl --dataset=qcm
//   node scripts/suggest-learning-links.js --product=gl --dataset=qcm_lore
// Options : --min-confidence=0.5  --max-per-question=8  --limit=N  --apply  --verbose
//
// Sécurité : dry-run par defaut (aucune ecriture). Idempotent (INSERT IGNORE sur
// la cle unique) ; ne re-suggere jamais un couple deja present (tous statuts,
// suggested/approved/rejected confondus).
// =====================================================================

const { queryAll, execute, endPool } = require('../database');
const match = require('../lib/shared/resourceQuestionMatch');

function parseArgs(argv) {
  const opts = {
    product: null,
    dataset: null,
    minConfidence: 0.5,
    maxPerQuestion: 8,
    limit: 0,
    apply: false,
    verbose: false,
    types: null,
  };
  for (const arg of argv) {
    const [k, v] = arg.includes('=') ? arg.split('=') : [arg, null];
    if (k === '--product') opts.product = v;
    else if (k === '--dataset') opts.dataset = v;
    else if (k === '--min-confidence') opts.minConfidence = Number(v);
    else if (k === '--max-per-question') opts.maxPerQuestion = Number(v);
    else if (k === '--limit') opts.limit = Number(v);
    else if (k === '--apply') opts.apply = true;
    else if (k === '--verbose') opts.verbose = true;
    else if (k === '--types') {
      opts.types = String(v || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return opts;
}

const ROW = (rows) => (Array.isArray(rows) ? rows : []);

async function safeQuery(label, sql, params = []) {
  try {
    return ROW(await queryAll(sql, params));
  } catch (err) {
    console.warn(`  [skip] ${label}: ${err.code || err.message}`);
    return [];
  }
}

/** Ressources ForetMap, par type. */
async function loadForetmapResources() {
  const glossary = (
    await safeQuery(
      'glossary_terms',
      "SELECT glossary_code AS ref, terme, variantes FROM glossary_terms WHERE statut = 'actif'",
    )
  ).map((r) => ({ type: 'glossary', ref: r.ref, labels: [r.terme, r.variantes] }));

  const plants = (
    await safeQuery('plants', 'SELECT id AS ref, name, second_name, scientific_name FROM plants')
  ).map((r) => ({ type: 'plant', ref: r.ref, labels: [r.name, r.second_name, r.scientific_name] }));

  const tutorials = (
    await safeQuery('tutorials', 'SELECT id AS ref, title FROM tutorials WHERE is_active = 1')
  ).map((r) => ({ type: 'tutorial', ref: r.ref, labels: [r.title] }));

  return [...glossary, ...plants, ...tutorials];
}

/** Ressources GL pertinentes pour un dataset (qcm = ecologie, qcm_lore = narratif). */
async function loadGlResources(dataset) {
  const out = [];
  if (dataset === 'qcm') {
    out.push(
      ...(
        await safeQuery(
          'gl_species',
          "SELECT species_code AS ref, nom_commun, nom_scientifique, mots_cles FROM gl_species WHERE statut = 'actif'",
        )
      ).map((r) => ({
        type: 'species',
        ref: r.ref,
        labels: [r.nom_commun, r.nom_scientifique, r.mots_cles],
      })),
      ...(
        await safeQuery(
          'gl_glossary_terms',
          "SELECT glossary_code AS ref, terme, variantes FROM gl_glossary_terms WHERE statut = 'actif'",
        )
      ).map((r) => ({ type: 'glossary', ref: r.ref, labels: [r.terme, r.variantes] })),
    );
  } else {
    out.push(
      ...(
        await safeQuery(
          'gl_lore_glossary_terms',
          "SELECT lore_code AS ref, terme, variantes FROM gl_lore_glossary_terms WHERE statut = 'actif'",
        )
      ).map((r) => ({ type: 'lore_glossary', ref: r.ref, labels: [r.terme, r.variantes] })),
      ...(
        await safeQuery(
          'gl_lore_feuillets',
          "SELECT feuillet_code AS ref, titre, idee_cle FROM gl_lore_feuillets WHERE statut = 'actif'",
        )
      ).map((r) => ({ type: 'feuillet', ref: r.ref, labels: [r.titre, r.idee_cle] })),
    );
  }
  // Tutoriels GL : pertinents pour les deux datasets.
  out.push(
    ...(
      await safeQuery(
        'gl_tutorials',
        'SELECT id AS ref, title FROM gl_tutorials WHERE is_published = 1',
      )
    ).map((r) => ({ type: 'tutorial', ref: r.ref, labels: [r.title] })),
  );
  return out;
}

async function loadQuestions(product, dataset) {
  if (product === 'foretmap') {
    return (
      await safeQuery(
        'quiz_questions',
        "SELECT question_code AS code, question AS text, tags FROM quiz_questions WHERE statut = 'actif'",
      )
    ).map((r) => ({ code: r.code, text: r.text, tags: r.tags }));
  }
  if (dataset === 'qcm') {
    return (
      await safeQuery(
        'gl_qcm_questions',
        "SELECT question_code AS code, question AS text, tags, mots_cles FROM gl_qcm_questions WHERE statut = 'actif'",
      )
    ).map((r) => ({ code: r.code, text: r.text, tags: r.tags, mots_cles: r.mots_cles }));
  }
  return (
    await safeQuery(
      'gl_qcm_lore_questions',
      "SELECT question_code AS code, question AS text, tags, mots_cles, source_lore FROM gl_qcm_lore_questions WHERE statut = 'actif'",
    )
  ).map((r) => ({
    code: r.code,
    text: r.text,
    tags: r.tags,
    mots_cles: r.mots_cles,
    extra: r.source_lore,
  }));
}

async function loadExisting(product) {
  const set = new Set();
  if (product === 'foretmap') {
    for (const r of await safeQuery(
      'resource_question_links',
      'SELECT resource_type, resource_ref, question_code FROM resource_question_links',
    )) {
      set.add(match.existKeyFor(null, r.resource_type, r.resource_ref, r.question_code));
    }
  } else {
    for (const r of await safeQuery(
      'gl_resource_question_links',
      'SELECT question_dataset, resource_type, resource_ref, question_code FROM gl_resource_question_links',
    )) {
      set.add(
        match.existKeyFor(r.question_dataset, r.resource_type, r.resource_ref, r.question_code),
      );
    }
  }
  return set;
}

function bucket(c) {
  if (c >= 0.8) return '0.80+';
  if (c >= 0.65) return '0.65-0.79';
  if (c >= 0.5) return '0.50-0.64';
  return '<0.50';
}

function report(candidates, opts) {
  const byType = {};
  const byBucket = {};
  for (const c of candidates) {
    byType[c.resource_type] = (byType[c.resource_type] || 0) + 1;
    byBucket[bucket(c.confidence)] = (byBucket[bucket(c.confidence)] || 0) + 1;
  }
  console.log(`\nCandidats: ${candidates.length}`);
  console.log('  par type   :', JSON.stringify(byType));
  console.log('  par conf.  :', JSON.stringify(byBucket));
  const sample = [...candidates]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.verbose ? 50 : 15);
  console.log(`  echantillon (${sample.length}) :`);
  for (const c of sample) {
    console.log(
      `    ${c.question_code} -> ${c.resource_type}:${c.resource_ref}  (${c.confidence}) ${c.reason}`,
    );
  }
}

async function applyForetmap(candidates) {
  let n = 0;
  for (const c of candidates) {
    const res = await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note)
       VALUES (?, ?, ?, 1, 1, 'auto', ?, 'suggested', ?)`,
      [c.resource_type, c.resource_ref, c.question_code, c.confidence, c.reason],
    );
    n += res.affectedRows ? 1 : 0;
  }
  return n;
}

async function applyGl(candidates) {
  let n = 0;
  for (const c of candidates) {
    const res = await execute(
      `INSERT IGNORE INTO gl_resource_question_links
        (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note)
       VALUES (?, ?, ?, ?, 1, 1, 'auto', ?, 'suggested', ?)`,
      [
        c.question_dataset,
        c.resource_type,
        c.resource_ref,
        c.question_code,
        c.confidence,
        c.reason,
      ],
    );
    n += res.affectedRows ? 1 : 0;
  }
  return n;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!['foretmap', 'gl'].includes(opts.product)) {
    console.error(
      'Usage: --product=foretmap|gl [--dataset=quiz|qcm|qcm_lore] [--apply] [--min-confidence=0.5]',
    );
    process.exit(1);
  }
  if (opts.product === 'gl' && !['qcm', 'qcm_lore'].includes(opts.dataset)) {
    console.error('Pour --product=gl, --dataset=qcm ou qcm_lore est requis.');
    process.exit(1);
  }
  const dataset = opts.product === 'gl' ? opts.dataset : null;

  console.log(
    `Suggestion de liens — produit=${opts.product} dataset=${dataset || 'quiz'} ` +
      `seuil=${opts.minConfidence} ${opts.apply ? '[APPLY]' : '[dry-run]'}`,
  );

  const resources =
    opts.product === 'foretmap' ? await loadForetmapResources() : await loadGlResources(dataset);
  const questions = await loadQuestions(opts.product, dataset);
  const existing = await loadExisting(opts.product);
  console.log(
    `  ressources=${resources.length}  questions=${questions.length}  liens existants=${existing.size}`,
  );

  let candidates = match.suggestLinks({
    questions,
    resources,
    existing,
    dataset,
    minConfidence: opts.minConfidence,
    maxPerQuestion: opts.maxPerQuestion,
  });
  if (opts.types && opts.types.length) {
    candidates = candidates.filter((c) => opts.types.includes(c.resource_type));
  }
  if (opts.limit > 0) candidates = candidates.slice(0, opts.limit);

  report(candidates, opts);

  if (opts.apply) {
    const inserted =
      opts.product === 'foretmap' ? await applyForetmap(candidates) : await applyGl(candidates);
    console.log(`\nInseres (status='suggested'): ${inserted}`);
  } else {
    console.log(
      "\n(dry-run : aucune ecriture. Relancer avec --apply pour inserer en 'suggested'.)",
    );
  }
}

main()
  .then(async () => {
    await endPool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Erreur:', err);
    try {
      await endPool();
    } catch (_) {
      /* noop */
    }
    process.exit(1);
  });
