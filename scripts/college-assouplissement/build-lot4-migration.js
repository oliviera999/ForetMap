#!/usr/bin/env node
'use strict';

/**
 * Génère la migration « college_assouplissement » (assouplissement du profil collège, décisions
 * d'Oliv du 22/11/2026, flux C2) à partir de deux fichiers de données, sources uniques :
 *
 *   - `data/college-assouplissement/lot4_quiz.json` : les 20 questions de cycle 3 (QF9934 à
 *     QF9953), copiées **telles quelles** du fichier du lot 4 (aucune réécriture) ;
 *   - `data/college-assouplissement/assouplissement.json` : clade `tetrapodes`, présences,
 *     textes et `preset` des séances, notion de QF9877, glossaire, noms des fiches liées.
 *
 *   node scripts/college-assouplissement/build-lot4-migration.js          # écrit le fichier
 *   node scripts/college-assouplissement/build-lot4-migration.js --check  # vérifie qu'il est à jour
 *   node scripts/college-assouplissement/build-lot4-migration.js --db     # contrôle aussi la base
 *                                                                         # (.env : DB_NAME)
 *
 * Le numéro de la migration n'apparaît que dans le nom du fichier : le script écrit dans le
 * fichier existant qui porte le suffixe `_college_assouplissement.sql`, quel que soit son numéro
 * (renumérotation à l'intégration) ; à défaut, il crée `388_college_assouplissement.sql`.
 *
 * Contrôles de chaque question (aucune migration écrite si l'un échoue) : quatre choix, bonne
 * réponse au plus 110 % du plus long distracteur, créneau `feedback_<bonne lettre>` à `NULL`, un
 * retour par distracteur, libellé de difficulté dérivé du référentiel, caractères attendus,
 * notion de cycle 3 en ajout, fiches liées connues. Typographie : les espaces ordinaires avant
 * `; : ! ?` et à l'intérieur des « » deviennent des espaces insécables (U+00A0), comme le reste
 * du corpus ; la conversion est faite ici, jamais dans le fichier source.
 */

const fs = require('node:fs');
const path = require('node:path');
const { quizDifficulteLabel } = require('../../lib/shared/pedagoEnums');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-assouplissement');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_assouplissement.sql';
const SUFFIX_RE = /^\d+_college_assouplissement\.sql$/;
const DEFAULT_NUMBER = '388';

const LETTERS = ['A', 'B', 'C', 'D'];
const CATEGORIES = new Set(['environnement_durable', 'ravageurs_auxiliaires']);
const CODE_RANGE = { min: 9934, max: 9953 };
const MAX_RATIO = 1.1;
const NBSP = '\u00a0';
/** Répartition des bonnes réponses du lot (fichier du lot 4 : le corpus penche vers A). */
const EXPECTED_ANSWERS = Object.freeze({ A: 3, B: 5, C: 6, D: 6 });
/** Invitation à cueillir, goûter, toucher, frotter, manipuler ou ramasser (impératif). */
const FORBIDDEN_INVITATION =
  /\b(cueille|cueillez|goûte|goûtez|touche|touchez|frotte|frottez|manipule|manipulez|ramasse|ramassez|attrape|attrapez)\b/i;
const TEXT_FIELDS = [
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'tags',
  'notes_pedagogiques',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function loadData() {
  return { questions: readJson('lot4_quiz.json'), meta: readJson('assouplissement.json') };
}

/**
 * Espaces insécables avant `; : ! ?` et à l'intérieur des guillemets français. Idempotent.
 * @param {string|null} text
 */
function frenchSpaces(text) {
  if (text == null) return text;
  return String(text)
    .replace(/[ \u00a0\u202f]([;:!?])/g, `${NBSP}$1`)
    .replace(/«[ \u00a0\u202f]?/g, `«${NBSP}`)
    .replace(/[ \u00a0\u202f]?»/g, `${NBSP}»`);
}

/** Contrôle de caractères d'un texte (avant conversion typographique). */
function checkChars(label, text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return [`${label} : texte vide`];
  if (text !== text.trim()) errors.push(`${label} : blancs en bord de texte`);
  if (text.normalize('NFC') !== text) errors.push(`${label} : texte non normalisé NFC`);
  // NFKC : seuls « ³ » (n³), « … » et les espaces insécables sont tolérés comme caractères
  // de compatibilité (sans effet sur une migration ; tous deux courants dans le corpus).
  const plain = text.replace(/[\u00a0\u202f]/g, ' ').replace(/[³…]/g, '3');
  if (plain.normalize('NFKC') !== plain) errors.push(`${label} : caractère de compatibilité`);
  if (/[\u0000-\u001f\u007f"\ufffd\u202f]/.test(text))
    errors.push(`${label} : caractère inattendu`);
  if (/\p{Extended_Pictographic}/u.test(text)) errors.push(`${label} : emoji dans un texte`);
  if (/ {2}/.test(text)) errors.push(`${label} : double espace`);
  if (FORBIDDEN_INVITATION.test(text))
    errors.push(`${label} : invitation interdite (${text.match(FORBIDDEN_INVITATION)[0]})`);
  return errors;
}

function answerText(q) {
  return q[`choix_${q.reponse_correcte.toLowerCase()}`];
}

/**
 * Contrôle des 20 questions. `notions` : Map id → niveau (`curriculum_notions`), facultative
 * (contrôle de base). `plantNames` : Set des noms de fiches présents en base, facultatif.
 * @returns {string[]} erreurs
 */
function checkQuestions({ questions, meta }, { notions = null, plantNames = null } = {}) {
  const errors = [];
  if (!Array.isArray(questions) || questions.length !== 20) {
    errors.push(`20 questions attendues, ${questions?.length ?? 0} trouvée(s)`);
    return errors;
  }
  const codes = new Set();
  const answers = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of questions) {
    const tag = q.question_code || '(sans code)';
    const m = /^QF(\d{4})$/.exec(q.question_code || '');
    if (!m || Number(m[1]) < CODE_RANGE.min || Number(m[1]) > CODE_RANGE.max)
      errors.push(`${tag} : code hors de la plage QF${CODE_RANGE.min} à QF${CODE_RANGE.max}`);
    if (codes.has(q.question_code)) errors.push(`${tag} : code en double`);
    codes.add(q.question_code);
    if (!CATEGORIES.has(q.categorie_slug)) errors.push(`${tag} : catégorie ${q.categorie_slug}`);
    if (q.niveau !== 'college') errors.push(`${tag} : niveau ${q.niveau}`);
    if (q.difficulte_label !== quizDifficulteLabel(q.difficulte))
      errors.push(`${tag} : libellé de difficulté non dérivé (${q.difficulte_label})`);
    if ('choix_e' in q && q.choix_e) errors.push(`${tag} : cinquième choix inattendu`);
    if (!LETTERS.includes(q.reponse_correcte)) {
      errors.push(`${tag} : bonne réponse ${q.reponse_correcte}`);
      continue;
    }
    answers[q.reponse_correcte] += 1;
    for (const field of TEXT_FIELDS) {
      const value = q[field];
      if (value == null && field.startsWith('feedback_') && field !== 'feedback_correct') continue;
      errors.push(...checkChars(`${tag} ${field}`, value));
    }
    const good = answerText(q).length;
    const longest = Math.max(
      ...LETTERS.filter((l) => l !== q.reponse_correcte).map(
        (l) => q[`choix_${l.toLowerCase()}`].length,
      ),
    );
    if (good > MAX_RATIO * longest)
      errors.push(`${tag} : bonne réponse trop longue (${good} > 110 % de ${longest})`);
    for (const l of LETTERS) {
      const fb = q[`feedback_${l.toLowerCase()}`];
      if (l === q.reponse_correcte) {
        if (fb !== null)
          errors.push(`${tag} : feedback_${l.toLowerCase()} (bonne réponse) non NULL`);
      } else if (typeof fb !== 'string' || !fb.trim()) {
        errors.push(`${tag} : retour manquant pour le distracteur ${l}`);
      }
    }
    const ajout = Array.isArray(q.notions_ajout) ? q.notions_ajout : [];
    const exclusion = Array.isArray(q.notions_exclusion) ? q.notions_exclusion : [];
    if (!ajout.some((n) => /^C3-/.test(n)))
      errors.push(`${tag} : aucune notion de cycle 3 en ajout`);
    if (notions) {
      for (const n of [...ajout, ...exclusion]) {
        if (!notions.has(n)) errors.push(`${tag} : notion ${n} absente de curriculum_notions`);
      }
      for (const n of ajout) {
        if (/^C3-/.test(n) && notions.get(n) !== 'cycle3')
          errors.push(`${tag} : notion ${n} hors cycle 3`);
      }
    }
    for (const id of q.fiches_liees || []) {
      const name = meta.fiches[String(id)];
      if (!name) errors.push(`${tag} : fiche ${id} sans nom dans assouplissement.json`);
      else if (plantNames && !plantNames.has(name))
        errors.push(`${tag} : fiche « ${name} » absente de la base`);
    }
  }
  for (const l of LETTERS) {
    if (answers[l] !== EXPECTED_ANSWERS[l])
      errors.push(`bonnes réponses ${l} : ${answers[l]} (attendu ${EXPECTED_ANSWERS[l]})`);
  }
  return errors;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function bin(expr) {
  return `CAST(${expr} AS BINARY)`;
}

/** Fiche résolue par nom, seulement si ce nom est unique (convention de la migration de référence). */
function plantByName(alias, name) {
  return `plants ${alias} ON ${alias}.name = ${sqlString(name)} COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants ${alias}x WHERE ${alias}x.name = ${sqlString(name)} COLLATE utf8mb4_unicode_ci) = 1`;
}

function questionRow(q) {
  const t = (field) => sqlString(frenchSpaces(q[field]));
  const numero = Number(q.question_code.slice(2));
  return [
    sqlString(q.question_code),
    sqlString(q.categorie_slug),
    String(numero),
    t('question'),
    t('choix_a'),
    t('choix_b'),
    t('choix_c'),
    t('choix_d'),
    "''",
    sqlString(q.reponse_correcte),
    sqlString(frenchSpaces(answerText(q))),
    sqlString(q.niveau),
    String(Number(q.difficulte)),
    sqlString(q.difficulte_label),
    t('feedback_correct'),
    t('feedback_a'),
    t('feedback_b'),
    t('feedback_c'),
    t('feedback_d'),
    'NULL',
    t('notes_pedagogiques'),
    t('tags'),
    "'actif'",
  ];
}

const QUESTION_COLUMNS = [
  'question_code',
  'categorie_slug',
  'numero_dans_categorie',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'niveau',
  'difficulte',
  'difficulte_label',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'notes_pedagogiques',
  'tags',
  'statut',
];

function unionRows(rows, columns) {
  return rows
    .map((values, i) => {
      if (i > 0) return `    UNION ALL SELECT ${values.join(', ')}`;
      return `    SELECT ${values.map((v, j) => `${v} AS ${columns[j]}`).join(', ')}`;
    })
    .join('\n');
}

function buildCladeSql(clade) {
  const lines = [];
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('-- 1. Clade `tetrapodes` : la boîte « Animaux à quatre membres » revient au collège');
  lines.push(
    "--    (décision 5). L'arbre collège passe à 5 niveaux depuis la racine. Gardes sur les",
  );
  lines.push("--    valeurs d'avant : une saisie faite dans l'application est conservée.");
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('UPDATE clades');
  lines.push(`   SET visible_college = ${Number(clade.visible_college)},`);
  lines.push(`       label_simple = ${sqlString(frenchSpaces(clade.label_simple))},`);
  lines.push(`       attribute_simple = ${sqlString(frenchSpaces(clade.attribute_simple))}`);
  lines.push(` WHERE id = ${sqlString(clade.id)}`);
  lines.push(`   AND name = ${sqlString(clade.name)}`);
  lines.push(`   AND visible_college <=> ${Number(clade.visible_college_avant)}`);
  lines.push('   AND label_simple <=> NULL');
  lines.push('   AND attribute_simple <=> NULL;');
  return lines;
}

function buildPresencesSql(presences) {
  const lines = [];
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('-- 2. Présences confirmées sur le terrain (décision 7) : registre `map_species`,');
  lines.push('--    lignes insérées seulement si absentes ; les lignes des autres cartes et une');
  lines.push('--    ligne déjà présente (quel que soit son statut) ne sont pas touchées.');
  lines.push(
    '--    Identifiants de production : ' +
      presences.map((p) => `${p.map_id}/${p.plant} = ${p.prod_id}`).join(', ') +
      '.',
  );
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('INSERT INTO map_species (map_id, plant_id, validation_status, is_featured)');
  lines.push("SELECT m.id, p.id, 'confirme_site', 0");
  lines.push('  FROM (');
  lines.push(
    unionRows(
      presences.map((p) => [sqlString(p.map_id), sqlString(p.plant)]),
      ['map_id', 'plant'],
    ),
  );
  lines.push('  ) v');
  lines.push('  JOIN maps m ON m.id = v.map_id COLLATE utf8mb4_unicode_ci');
  lines.push('  JOIN plants p ON p.name = v.plant COLLATE utf8mb4_unicode_ci');
  lines.push(
    '   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.plant COLLATE utf8mb4_unicode_ci) = 1',
  );
  lines.push(' WHERE NOT EXISTS (');
  lines.push('         SELECT 1 FROM map_species x WHERE x.map_id = m.id AND x.plant_id = p.id);');
  return lines;
}

function stepGuards(s, prefix) {
  const g = [];
  g.push(
    `   AND ${bin(`JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.id'))`)} = ${bin(sqlString(s.step_id))}`,
  );
  g.push(
    `   AND ${bin(`JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.title'))`)} = ${bin(sqlString(s.title))}`,
  );
  if (s.body_avant != null)
    g.push(
      `   AND ${bin(`JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.body'))`)} = ${bin(sqlString(s.body_avant))}`,
    );
  g.push(
    `   AND ${bin(`JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.action.type'))`)} = ${bin(sqlString(s.action_type))}`,
  );
  g.push(
    `   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.action.payload.highlightPlantId')) AS UNSIGNED) = p.id`,
  );
  if (s.map_id == null)
    g.push(
      `   AND JSON_TYPE(JSON_EXTRACT(s.steps_json, '${prefix}.action.payload.mapId')) = 'NULL'`,
    );
  else
    g.push(
      `   AND ${bin(`JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '${prefix}.action.payload.mapId'))`)} = ${bin(sqlString(s.map_id))}`,
    );
  g.push(`   AND JSON_EXTRACT(s.steps_json, '${prefix}.action.payload.preset') IS NULL;`);
  return g;
}

function buildSeancesSql(seances) {
  const lines = [];
  lines.push('-- ---------------------------------------------------------------------');
  lines.push(
    "-- 3. Séances collège : consignes réécrites pour la sélection d'espèces et le bouton",
  );
  lines.push('--    « Pour aller plus loin », cadrage `preset` des étapes `open_foodweb`. Chaque');
  lines.push(
    "--    étape n'est modifiée que si elle a encore sa forme exacte du 22/11/2026 (id, titre,",
  );
  lines.push('--    consigne, type, espèce, carte, aucun `preset`) : une séance retouchée dans');
  lines.push("--    l'application est laissée telle quelle (le test de contenu le signale).");
  lines.push('-- ---------------------------------------------------------------------');
  for (const s of seances) {
    const prefix = `$[${s.step_index}]`;
    const sets = [];
    if (s.body_apres != null)
      sets.push(`'${prefix}.body', ${sqlString(frenchSpaces(s.body_apres))}`);
    if (s.preset) sets.push(`'${prefix}.action.payload.preset', ${sqlString(s.preset)}`);
    lines.push(
      `-- ${s.slug} · étape ${s.step_id}${s.body_apres != null ? ' : consigne' : ''}${s.preset ? ` ; preset ${s.preset}` : ''}`,
    );
    lines.push('UPDATE pedago_sessions s');
    lines.push(`  JOIN ${plantByName('p', s.highlight_plant)}`);
    lines.push(`   SET s.steps_json = JSON_SET(s.steps_json, ${sets.join(', ')})`);
    lines.push(` WHERE s.slug = ${sqlString(s.slug)}`);
    lines.push('   AND JSON_VALID(s.steps_json)');
    lines.push(...stepGuards(s, prefix));
  }
  return lines;
}

function buildNotionsAndGlossarySql(meta) {
  const lines = [];
  lines.push('-- ---------------------------------------------------------------------');
  lines.push(
    '-- 4. QF9877 (mini-quiz de la séance `6e-eau-de-nos-lieux`, cycle 3) : notion de cycle 3',
  );
  lines.push("--    en ajout, pour qu'elle retrouve le palier d'entrée 1.");
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('INSERT INTO quiz_question_notions (question_code, notion_id, mode)');
  lines.push('SELECT v.question_code, v.notion_id, v.mode');
  lines.push('  FROM (');
  lines.push(
    unionRows(
      meta.notions_questions.map((n) => [
        sqlString(n.question_code),
        sqlString(n.notion_id),
        sqlString(n.mode),
      ]),
      ['question_code', 'notion_id', 'mode'],
    ),
  );
  lines.push('  ) v');
  lines.push(
    '  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci',
  );
  lines.push('  JOIN curriculum_notions cn ON cn.id = v.notion_id COLLATE utf8mb4_unicode_ci');
  lines.push(' WHERE NOT EXISTS (');
  lines.push('         SELECT 1 FROM quiz_question_notions x');
  lines.push('          WHERE x.question_code = v.question_code COLLATE utf8mb4_unicode_ci');
  lines.push('            AND x.notion_id = v.notion_id COLLATE utf8mb4_unicode_ci);');
  lines.push('');
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('-- 5. Glossaire : « matière organique » passe en `base` (notion C3-MAT du cycle 3).');
  lines.push('-- ---------------------------------------------------------------------');
  for (const g of meta.glossaire) {
    lines.push(`UPDATE glossary_terms SET niveau = ${sqlString(g.niveau)}`);
    lines.push(` WHERE glossary_code = ${sqlString(g.glossary_code)}`);
    lines.push(`   AND terme = ${sqlString(g.terme)}`);
    lines.push(`   AND niveau <=> ${sqlString(g.niveau_avant)};`);
  }
  return lines;
}

function buildQuestionsSql({ questions, meta }) {
  const lines = [];
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('-- 6. Vingt questions de cycle 3 (décision 9), QF9934 à QF9953 : catégories');
  lines.push('--    `environnement_durable` et `ravageurs_auxiliaires`. Source unique :');
  lines.push(
    '--    data/college-assouplissement/lot4_quiz.json. Numéro dans la catégorie = partie',
  );
  lines.push(
    '--    numérique du code. Parent : la catégorie ; une question dont le code ou le numéro',
  );
  lines.push('--    est déjà pris est sautée.');
  lines.push('-- ---------------------------------------------------------------------');
  lines.push(`INSERT INTO quiz_questions\n  (${QUESTION_COLUMNS.join(', ')})`);
  lines.push(`SELECT ${QUESTION_COLUMNS.map((c) => `v.${c}`).join(', ')}`);
  lines.push('  FROM (');
  lines.push(
    unionRows(
      questions.map((q) => questionRow(q)),
      QUESTION_COLUMNS,
    ),
  );
  lines.push('  ) v');
  lines.push('  JOIN quiz_categories c ON c.slug = v.categorie_slug COLLATE utf8mb4_unicode_ci');
  lines.push(' WHERE NOT EXISTS (');
  lines.push(
    '         SELECT 1 FROM quiz_questions q WHERE q.question_code = v.question_code COLLATE utf8mb4_unicode_ci)',
  );
  lines.push('   AND NOT EXISTS (');
  lines.push('         SELECT 1 FROM quiz_questions q2');
  lines.push('          WHERE q2.categorie_slug = v.categorie_slug COLLATE utf8mb4_unicode_ci');
  lines.push('            AND q2.numero_dans_categorie = v.numero_dans_categorie);');
  lines.push('');
  lines.push(
    "-- 6b. Notions : cycle 3 en ajout (palier d'entrée 1), notions de lycée héritées de la",
  );
  lines.push('--     catégorie en exclusion. Parents : la question et la notion.');
  const notionRows = [];
  for (const q of questions) {
    for (const n of q.notions_ajout)
      notionRows.push([sqlString(q.question_code), sqlString(n), "'ajout'"]);
    for (const n of q.notions_exclusion)
      notionRows.push([sqlString(q.question_code), sqlString(n), "'exclusion'"]);
  }
  lines.push('INSERT INTO quiz_question_notions (question_code, notion_id, mode)');
  lines.push('SELECT v.question_code, v.notion_id, v.mode');
  lines.push('  FROM (');
  lines.push(unionRows(notionRows, ['question_code', 'notion_id', 'mode']));
  lines.push('  ) v');
  lines.push(
    '  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci',
  );
  lines.push('  JOIN curriculum_notions cn ON cn.id = v.notion_id COLLATE utf8mb4_unicode_ci');
  lines.push(' WHERE NOT EXISTS (');
  lines.push('         SELECT 1 FROM quiz_question_notions x');
  lines.push('          WHERE x.question_code = v.question_code COLLATE utf8mb4_unicode_ci');
  lines.push('            AND x.notion_id = v.notion_id COLLATE utf8mb4_unicode_ci);');
  lines.push('');
  lines.push(
    '-- 6c. Liens non bloquants vers les fiches (source unique : resource_question_links ;',
  );
  lines.push(
    '--     convention de la migration `contenus_terrain_2026_11_20` : fiche résolue par nom',
  );
  lines.push('--     unique, origine `manual`, statut `approved`). Une fiche absente est sautée.');
  const linkRows = [];
  for (const q of questions) {
    for (const id of q.fiches_liees)
      linkRows.push([sqlString(meta.fiches[String(id)]), sqlString(q.question_code)]);
  }
  lines.push('INSERT INTO resource_question_links');
  lines.push(
    '  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)',
  );
  lines.push(
    "SELECT 'plant', CAST(p.id AS CHAR), v.question_code, 0, 1, 'manual', 'approved', NULL",
  );
  lines.push('  FROM (');
  lines.push(unionRows(linkRows, ['ref', 'question_code']));
  lines.push('  ) v');
  lines.push(
    '  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci',
  );
  lines.push('  JOIN plants p ON p.name = v.ref COLLATE utf8mb4_unicode_ci');
  lines.push(
    '   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.ref COLLATE utf8mb4_unicode_ci) = 1',
  );
  lines.push(' WHERE NOT EXISTS (');
  lines.push('         SELECT 1 FROM resource_question_links x');
  lines.push("          WHERE x.resource_type = 'plant'");
  lines.push('            AND x.resource_ref = CAST(p.id AS CHAR)');
  lines.push('            AND x.question_code = v.question_code COLLATE utf8mb4_unicode_ci);');
  return lines;
}

function buildSql(data = loadData()) {
  const { meta } = data;
  const lines = [];
  lines.push('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;');
  lines.push('');
  lines.push('-- =====================================================================');
  lines.push("-- Assouplissement du profil collège (décisions d'Oliv du 22/11/2026, flux C2) :");
  lines.push('-- données seulement.');
  lines.push('--');
  lines.push(
    '-- FICHIER GÉNÉRÉ par scripts/college-assouplissement/build-lot4-migration.js à partir',
  );
  lines.push('-- de data/college-assouplissement/*.json : ne pas modifier à la main.');
  lines.push('--');
  lines.push(
    '--   1. clades                  `tetrapodes` visible au collège (« Animaux à quatre membres »)',
  );
  lines.push(
    '--   2. map_species             six présences confirmées (n3 : 5 espèces ; foret : 1)',
  );
  lines.push('--   3. pedago_sessions         consignes et `preset` de quatre séances 6e');
  lines.push('--   4. quiz_question_notions   QF9877 : C3-ENV en ajout');
  lines.push('--   5. glossary_terms          « matière organique » en `base`');
  lines.push('--   6. quiz_questions, quiz_question_notions, resource_question_links');
  lines.push('--                              20 questions de cycle 3 (QF9934 à QF9953)');
  lines.push('--');
  lines.push("-- Fiches et cartes désignées par leur nom (les identifiants diffèrent d'une base à");
  lines.push(
    "-- l'autre) ; un parent absent fait sauter la ligne sans erreur. Modifications gardées",
  );
  lines.push("-- par la valeur d'avant. Idempotent, rejouable ; aucun DDL, aucun trigger, aucun");
  lines.push('-- DEFINER, aucune donnée personnelle, aucune table `gl_*`.');
  lines.push('-- =====================================================================');
  lines.push('');
  lines.push(...buildCladeSql(meta.clade));
  lines.push('');
  lines.push(...buildPresencesSql(meta.presences));
  lines.push('');
  lines.push(...buildSeancesSql(meta.seances));
  lines.push('');
  lines.push(...buildNotionsAndGlossarySql(meta));
  lines.push('');
  lines.push(...buildQuestionsSql(data));
  lines.push('');
  return lines.join('\n');
}

function findMigrationFile() {
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX_RE.test(f));
  if (existing.length > 1)
    throw new Error(`Plusieurs fichiers *${SUFFIX} : ${existing.join(', ')}`);
  return path.join(MIGRATIONS_DIR, existing[0] || `${DEFAULT_NUMBER}${SUFFIX}`);
}

/** Contrôle de base (`--db`) : notions et noms de fiches lus dans DB_NAME. */
async function loadDbContext() {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
  try {
    const [notionRows] = await conn.query('SELECT id, niveau FROM curriculum_notions');
    const [plantRows] = await conn.query(
      'SELECT name FROM plants GROUP BY name HAVING COUNT(*) = 1',
    );
    return {
      notions: new Map(notionRows.map((r) => [r.id, r.niveau])),
      plantNames: new Set(plantRows.map((r) => r.name)),
    };
  } finally {
    await conn.end();
  }
}

module.exports = {
  loadData,
  checkQuestions,
  checkChars,
  frenchSpaces,
  buildSql,
  findMigrationFile,
  sqlString,
  EXPECTED_ANSWERS,
  SUFFIX_RE,
};

if (require.main === module) {
  (async () => {
    const data = loadData();
    const ctx = process.argv.includes('--db') ? await loadDbContext() : {};
    const errors = checkQuestions(data, ctx);
    if (errors.length) {
      console.error('Données non conformes, migration non générée :');
      for (const e of errors) console.error(` - ${e}`);
      process.exit(1);
    }
    const target = findMigrationFile();
    const sql = buildSql(data);
    if (process.argv.includes('--check')) {
      const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
      if (current !== sql) {
        console.error(`${path.basename(target)} n'est pas à jour : relancer le générateur.`);
        process.exit(1);
      }
      console.log(`${path.basename(target)} à jour.`);
    } else {
      fs.writeFileSync(target, sql);
      console.log(`Écrit : migrations/${path.basename(target)}`);
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
