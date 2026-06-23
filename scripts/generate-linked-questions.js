'use strict';

// =====================================================================
// Phase 2 — GENERATION de questions liees aux ressources (enrichissement BDD).
// Pour chaque ressource SANS question liee (status='approved'), genere une
// question dont la reponse EST dans la ressource (identite d'espece, definition
// de glossaire, idee-cle de feuillet...) et cree le lien correspondant
// (origin='generated', status='approved', is_gating=1). Les distracteurs sont
// tires des pools reels. La bonne reponse est placee aleatoirement (A..E).
//
// Dry-run par defaut. --apply pour ecrire. Idempotent : ne re-genere jamais pour
// une ressource deja couverte. Tag `auto-genere:<type>` sur les questions creees.
//
// Usage : node scripts/generate-linked-questions.js [--apply] [--limit=N] [--verbose]
// =====================================================================

const { queryAll, queryOne, execute, endPool } = require('../database');

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function parseArgs(argv) {
  const o = { apply: false, limit: 0, verbose: false };
  for (const a of argv) {
    const [k, v] = a.includes('=') ? a.split('=') : [a, null];
    if (k === '--apply') o.apply = true;
    else if (k === '--limit') o.limit = Number(v) || 0;
    else if (k === '--verbose') o.verbose = true;
  }
  return o;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clean = (s) =>
  String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Construit les choix d'un QCM : `correct` + (count-1) distracteurs distincts tires
 * du pool, melanges. Retourne null si pas assez de distracteurs exploitables.
 */
function makeChoices(correct, pool, count) {
  const target = clean(correct);
  if (!target) return null;
  const seen = new Set([target.toLowerCase()]);
  const distractors = [];
  for (const raw of shuffle(pool)) {
    const d = clean(raw);
    if (!d || d.length > 240) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(d);
    if (distractors.length >= count - 1) break;
  }
  if (distractors.length < count - 1) return null;
  const all = shuffle([clean(target).slice(0, 240), ...distractors]);
  const correctIdx = all.findIndex((c) => c === clean(target).slice(0, 240));
  return { choices: all, correctLetter: LETTERS[correctIdx] };
}

// ---------- Allocation de codes & numeros ----------
const codeCounters = {};
async function initCodeCounter(prefix, table) {
  const row = await queryOne(
    `SELECT MAX(CAST(REGEXP_REPLACE(question_code,'[^0-9]','') AS UNSIGNED)) AS m FROM ${table}`,
  );
  codeCounters[prefix] = Number(row?.m || 0);
}
function nextCode(prefix) {
  codeCounters[prefix] += 1;
  return `${prefix}${String(codeCounters[prefix]).padStart(4, '0')}`;
}

const numeroCounters = new Map();
async function nextNumero(table, whereCols, whereVals) {
  const key = `${table}|${whereVals.join('|')}`;
  if (!numeroCounters.has(key)) {
    const cond = whereCols.map((c) => `${c} = ?`).join(' AND ');
    const row = await queryOne(
      `SELECT MAX(numero_dans_categorie) AS m FROM ${table} WHERE ${cond}`,
      whereVals,
    );
    numeroCounters.set(key, Number(row?.m || 0));
  }
  const n = numeroCounters.get(key) + 1;
  numeroCounters.set(key, n);
  return n;
}

// ---------- Insertions ----------
async function insertQuizQuestion(
  apply,
  { code, categorie, numero, question, choices, letter, tag },
) {
  if (!apply) return;
  await execute(
    `INSERT INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, choix_d, reponse_correcte, niveau, tags, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'college', ?, 'actif')`,
    [
      code,
      categorie,
      numero,
      question,
      choices[0],
      choices[1],
      choices[2],
      choices[3] || '',
      letter,
      tag,
    ],
  );
}
async function insertGlQcm(
  apply,
  { code, biome, categorie, numero, question, choices, letter, tag },
) {
  if (!apply) return;
  await execute(
    `INSERT INTO gl_qcm_questions
      (question_code, biome_slug, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, tags, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif')`,
    [
      code,
      biome,
      categorie,
      numero,
      question,
      choices[0],
      choices[1],
      choices[2],
      choices[3],
      choices[4] || '',
      letter,
      tag,
    ],
  );
}
async function insertGlLore(
  apply,
  { code, chapitre, categorie, numero, question, choices, letter, tag },
) {
  if (!apply) return;
  await execute(
    `INSERT INTO gl_qcm_lore_questions
      (question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question, choix_a, choix_b, choix_c, choix_d, reponse_correcte, tags, statut)
     VALUES (?, ?, ?, ?, 'recit', ?, ?, ?, ?, ?, ?, ?, 'actif')`,
    [
      code,
      chapitre,
      categorie,
      numero,
      question,
      choices[0],
      choices[1],
      choices[2],
      choices[3] || '',
      letter,
      tag,
    ],
  );
}
async function linkFm(apply, resourceType, resourceRef, code, note) {
  if (!apply) return;
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note)
     VALUES (?, ?, ?, 1, 1, 'generated', 1.000, 'approved', ?)`,
    [resourceType, String(resourceRef), code, note],
  );
}
async function linkGl(apply, dataset, resourceType, resourceRef, code, note) {
  if (!apply) return;
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note)
     VALUES (?, ?, ?, ?, 1, 1, 'generated', 1.000, 'approved', ?)`,
    [dataset, resourceType, String(resourceRef), code, note],
  );
}

async function ensureQuizCategory(apply) {
  if (!apply) return;
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, emoji, theme, description, order_index)
     VALUES ('glossaire_definitions', 'Vocabulaire & définitions', '📖', 'sciences',
             'Reconnaître la définition des termes du glossaire.', 100)`,
  );
}

// ---------- Cibles de generation ----------
async function genSpecies(apply, limit) {
  const rows = await queryAll(
    `SELECT s.species_code, s.nom_commun, s.nom_scientifique, s.famille, s.type, s.biome_slug
       FROM gl_species s
      WHERE s.statut='actif' AND s.nom_scientifique<>'' AND s.biome_slug<>''
        AND NOT EXISTS (SELECT 1 FROM gl_resource_question_links r
                        WHERE r.resource_type='species' AND r.resource_ref=s.species_code AND r.status='approved')
      ORDER BY s.species_code` + (limit ? ` LIMIT ${limit}` : ''),
  );
  const sciByType = { faune: [], flore: [] };
  const famByType = { faune: [], flore: [] };
  for (const s of await queryAll(
    "SELECT type, nom_scientifique, famille FROM gl_species WHERE statut='actif'",
  )) {
    if (s.nom_scientifique)
      (sciByType[s.type] || (sciByType[s.type] = [])).push(s.nom_scientifique);
    if (s.famille) (famByType[s.type] || (famByType[s.type] = [])).push(s.famille);
  }
  let made = 0;
  let i = 0;
  for (const s of rows) {
    const cat = s.type === 'flore' ? 'flore' : 'faune';
    const useFamille = i % 2 === 1 && s.famille;
    let built;
    let question;
    if (useFamille) {
      question = `À quelle famille appartient « ${clean(s.nom_commun)} » (${clean(s.nom_scientifique)}) ?`;
      built = makeChoices(s.famille, famByType[s.type] || [], 5);
    } else {
      question = `Quel est le nom scientifique de « ${clean(s.nom_commun)} » ?`;
      built = makeChoices(s.nom_scientifique, sciByType[s.type] || [], 5);
    }
    if (!built) built = makeChoices(s.nom_scientifique, sciByType[s.type] || [], 5);
    if (!built) continue;
    const code = nextCode('GQCM');
    const numero = await nextNumero(
      'gl_qcm_questions',
      ['biome_slug', 'categorie_slug'],
      [s.biome_slug, cat],
    );
    await insertGlQcm(apply, {
      code,
      biome: s.biome_slug,
      categorie: cat,
      numero,
      question,
      choices: built.choices,
      letter: built.correctLetter,
      tag: 'auto-genere:espece',
    });
    await linkGl(apply, 'qcm', 'species', s.species_code, code, 'generated:species_identity');
    made += 1;
    i += 1;
  }
  return made;
}

async function genFmGlossary(apply, limit) {
  const rows = await queryAll(
    `SELECT g.glossary_code, g.terme, g.definition_courte
       FROM glossary_terms g
      WHERE g.statut='actif' AND g.definition_courte<>''
        AND NOT EXISTS (SELECT 1 FROM resource_question_links r
                        WHERE r.resource_type='glossary' AND r.resource_ref=g.glossary_code AND r.status='approved')
      ORDER BY g.glossary_code` + (limit ? ` LIMIT ${limit}` : ''),
  );
  const pool = (
    await queryAll(
      "SELECT definition_courte FROM glossary_terms WHERE statut='actif' AND definition_courte<>''",
    )
  ).map((r) => r.definition_courte);
  let made = 0;
  for (const g of rows) {
    const built = makeChoices(g.definition_courte, pool, 4);
    if (!built) continue;
    const code = nextCode('QF');
    const numero = await nextNumero(
      'quiz_questions',
      ['categorie_slug'],
      ['glossaire_definitions'],
    );
    await insertQuizQuestion(apply, {
      code,
      categorie: 'glossaire_definitions',
      numero,
      question: `Que désigne le terme « ${clean(g.terme)} » ?`,
      choices: built.choices,
      letter: built.correctLetter,
      tag: 'auto-genere:glossaire',
    });
    await linkFm(apply, 'glossary', g.glossary_code, code, 'generated:definition');
    made += 1;
  }
  return made;
}

async function genFmPlants(apply, limit) {
  const rows = await queryAll(
    `SELECT p.id, p.name, p.scientific_name, p.taxon_family
       FROM plants p
      WHERE p.scientific_name<>''
        AND NOT EXISTS (SELECT 1 FROM resource_question_links r
                        WHERE r.resource_type='plant' AND r.resource_ref=p.id AND r.status='approved')
      ORDER BY p.id` + (limit ? ` LIMIT ${limit}` : ''),
  );
  const sciPool = (
    await queryAll("SELECT scientific_name FROM plants WHERE scientific_name<>''")
  ).map((r) => r.scientific_name);
  const famPool = (await queryAll("SELECT taxon_family FROM plants WHERE taxon_family<>''")).map(
    (r) => r.taxon_family,
  );
  let made = 0;
  let i = 0;
  for (const p of rows) {
    const useFam = i % 2 === 1 && p.taxon_family;
    const question = useFam
      ? `À quelle famille botanique appartient « ${clean(p.name)} » ?`
      : `Quel est le nom scientifique de « ${clean(p.name)} » ?`;
    const built = useFam
      ? makeChoices(p.taxon_family, famPool, 4)
      : makeChoices(p.scientific_name, sciPool, 4);
    const safe = built || makeChoices(p.scientific_name, sciPool, 4);
    if (!safe) continue;
    const code = nextCode('QF');
    const numero = await nextNumero(
      'quiz_questions',
      ['categorie_slug'],
      ['identification_especes'],
    );
    await insertQuizQuestion(apply, {
      code,
      categorie: 'identification_especes',
      numero,
      question,
      choices: safe.choices,
      letter: safe.correctLetter,
      tag: 'auto-genere:plante',
    });
    await linkFm(apply, 'plant', p.id, code, 'generated:plant_identity');
    made += 1;
    i += 1;
  }
  return made;
}

async function genLoreFromTable(
  apply,
  limit,
  { table, refCol, type, labelCol, answerCol, template, dataset = 'qcm_lore' },
) {
  const rows = await queryAll(
    `SELECT t.${refCol} AS ref, t.${labelCol} AS label, t.${answerCol} AS answer
       FROM ${table} t
      WHERE t.statut='actif' AND t.${answerCol} IS NOT NULL AND t.${answerCol}<>''
        AND NOT EXISTS (SELECT 1 FROM gl_resource_question_links r
                        WHERE r.resource_type='${type}' AND r.resource_ref=t.${refCol} AND r.status='approved')
      ORDER BY t.${refCol}` + (limit ? ` LIMIT ${limit}` : ''),
  );
  const pool = (
    await queryAll(
      `SELECT ${answerCol} AS a FROM ${table} WHERE statut='actif' AND ${answerCol} IS NOT NULL AND ${answerCol}<>''`,
    )
  ).map((r) => r.a);
  let made = 0;
  for (const t of rows) {
    const built = makeChoices(t.answer, pool, 4);
    if (!built) continue;
    const code = nextCode('LQCM');
    const numero = await nextNumero(
      'gl_qcm_lore_questions',
      ['chapitre_slug', 'categorie_slug'],
      ['tous', 'selene_carnet'],
    );
    await insertGlLore(apply, {
      code,
      chapitre: 'tous',
      categorie: 'selene_carnet',
      numero,
      question: template(clean(t.label)),
      choices: built.choices,
      letter: built.correctLetter,
      tag: `auto-genere:${type}`,
    });
    await linkGl(apply, dataset, type, t.ref, code, `generated:${type}`);
    made += 1;
  }
  return made;
}

// Repli feuillets sans idee_cle : reconnaissance par l'incipit (ancre dans le feuillet).
async function genFeuilletsByIncipit(apply, limit) {
  const rows = await queryAll(
    `SELECT f.feuillet_code, f.titre, f.incipit
       FROM gl_lore_feuillets f
      WHERE f.statut='actif' AND f.titre IS NOT NULL AND f.titre<>''
        AND f.incipit IS NOT NULL AND f.incipit<>''
        AND (f.idee_cle IS NULL OR f.idee_cle='')
        AND NOT EXISTS (SELECT 1 FROM gl_resource_question_links r
                        WHERE r.resource_type='feuillet' AND r.resource_ref=f.feuillet_code AND r.status='approved')
      ORDER BY f.feuillet_code` + (limit ? ` LIMIT ${limit}` : ''),
  );
  const titres = (
    await queryAll("SELECT titre FROM gl_lore_feuillets WHERE titre IS NOT NULL AND titre<>''")
  ).map((r) => r.titre);
  let made = 0;
  for (const f of rows) {
    const built = makeChoices(f.titre, titres, 4);
    if (!built) continue;
    const incipit = clean(f.incipit).slice(0, 160);
    const code = nextCode('LQCM');
    const numero = await nextNumero(
      'gl_qcm_lore_questions',
      ['chapitre_slug', 'categorie_slug'],
      ['tous', 'selene_carnet'],
    );
    await insertGlLore(apply, {
      code,
      chapitre: 'tous',
      categorie: 'selene_carnet',
      numero,
      question: `Quel feuillet du carnet de Sélène s'ouvre ainsi : « ${incipit}… » ?`,
      choices: built.choices,
      letter: built.correctLetter,
      tag: 'auto-genere:feuillet-incipit',
    });
    await linkGl(
      apply,
      'qcm_lore',
      'feuillet',
      f.feuillet_code,
      code,
      'generated:feuillet_incipit',
    );
    made += 1;
  }
  return made;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `Generation de questions liees — ${opts.apply ? '[APPLY]' : '[dry-run]'}` +
      (opts.limit ? ` limit/type=${opts.limit}` : ''),
  );
  await initCodeCounter('QF', 'quiz_questions');
  await initCodeCounter('GQCM', 'gl_qcm_questions');
  await initCodeCounter('LQCM', 'gl_qcm_lore_questions');
  await ensureQuizCategory(opts.apply);

  const r = {};
  r.species = await genSpecies(opts.apply, opts.limit);
  r.feuillets = await genLoreFromTable(opts.apply, opts.limit, {
    table: 'gl_lore_feuillets',
    refCol: 'feuillet_code',
    type: 'feuillet',
    labelCol: 'titre',
    answerCol: 'idee_cle',
    template: (label) =>
      `D'après le carnet de Sélène, quelle est l'idée-clé du feuillet « ${label} » ?`,
  });
  r.feuillets_incipit = await genFeuilletsByIncipit(opts.apply, opts.limit);
  r.lore_glossary = await genLoreFromTable(opts.apply, opts.limit, {
    table: 'gl_lore_glossary_terms',
    refCol: 'lore_code',
    type: 'lore_glossary',
    labelCol: 'terme',
    answerCol: 'definition_courte',
    template: (label) => `Dans l'univers de Gnomes & Licornes, que désigne « ${label} » ?`,
  });
  r.fm_glossary = await genFmGlossary(opts.apply, opts.limit);
  r.fm_plants = await genFmPlants(opts.apply, opts.limit);

  const total = Object.values(r).reduce((a, b) => a + b, 0);
  console.log('Questions generees + liees :', JSON.stringify(r));
  console.log(`TOTAL: ${total}`);
  if (!opts.apply) console.log('(dry-run : aucune ecriture. Relancer avec --apply.)');
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
