#!/usr/bin/env node
'use strict';

/**
 * Génère la migration de contenu D1 du chantier collège (« corrections immédiates ») à partir
 * des fichiers de données `data/college-2026-11/d1/*.json`.
 *
 *   node scripts/college-2026-11/build-d1-migration.js          # écrit la migration
 *   node scripts/college-2026-11/build-d1-migration.js --check  # échoue si elle n'est pas à jour
 *
 * Le fichier cible est celui de `migrations/` qui porte le suffixe
 * `_college_corrections_immediates.sql`, quel que soit son numéro (SI le renumérote) ; à défaut,
 * `379_college_corrections_immediates.sql` est créé.
 *
 * Chaque UPDATE est gardé par la clé naturelle (nom de fiche, code de terme, slug + identifiant
 * d'étape, id de carte) ET par l'ancienne valeur exacte : une modification faite entre-temps dans
 * l'application n'est jamais écrasée, et un second passage ne change rien. Les espèces citées
 * dans les séances sont désignées par leur nom : leur identifiant est résolu à l'exécution
 * (les identifiants diffèrent entre la production et une base fraîche).
 *
 * Outil de chantier : supprimé par SI avec le dossier de coordination s'il n'est plus utile.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'd1');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_corrections_immediates.sql';

function readData(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

/** Littéral SQL (chaîne) : apostrophes doublées, antislashs échappés. */
function q(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/** Comparaison exacte (octet à octet) d'une expression texte avec une valeur attendue. */
function binEq(expr, value) {
  return `CAST(${expr} AS BINARY) = CAST(${q(value)} AS BINARY)`;
}

/** Identifiant de fiche résolu par son nom (NULL si la fiche n'existe pas). */
function plantIdSql(plante) {
  return `(SELECT MIN(p.id) FROM plants p WHERE p.name = ${q(plante.name)})`;
}

function plantExistsSql(plante) {
  return `EXISTS (SELECT 1 FROM plants p WHERE p.name = ${q(plante.name)})`;
}

function jText(i, sub) {
  return `JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[${i}]${sub}'))`;
}

function jRaw(i, sub) {
  return `JSON_EXTRACT(steps_json, '$[${i}]${sub}')`;
}

function payloadGuard(i, key, expected) {
  const sub = `.action.payload.${key}`;
  if (expected === null) return `JSON_TYPE(${jRaw(i, sub)}) = 'NULL'`;
  if (expected && typeof expected === 'object' && expected.plante) {
    return `CAST(${jText(i, sub)} AS UNSIGNED) = ${plantIdSql(expected.plante)}`;
  }
  return binEq(jText(i, sub), expected);
}

function payloadValue(value) {
  if (value === null) return 'NULL';
  if (value && typeof value === 'object' && value.plante) return plantIdSql(value.plante);
  return q(value);
}

function emojiSection(data) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    `-- 1. Emoji trompeurs : ${data.corrections.length} fiches. Garde : nom + ancien emoji (binaire).`,
    '-- ---------------------------------------------------------------------',
  ];
  for (const c of data.corrections) {
    lines.push(
      `UPDATE plants SET emoji = ${q(c.apres)}`,
      ` WHERE name = ${q(c.name)} AND ${binEq('emoji', c.avant)};`,
    );
  }
  return lines.join('\n');
}

function glossaryLevelSection(data) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    `-- 2. Niveaux du glossaire : ${data.changements.length} termes. Garde : code + terme + ancien niveau.`,
    '-- ---------------------------------------------------------------------',
  ];
  for (const c of data.changements) {
    lines.push(
      `UPDATE glossary_terms SET niveau = ${q(c.apres)}`,
      ` WHERE glossary_code = ${q(c.glossary_code)} AND ${binEq('terme', c.terme)} AND niveau = ${q(c.avant)};`,
    );
  }
  return lines.join('\n');
}

function glossaryContentSection(data) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    '-- 3. Glossaire, contenu. Garde : code + terme + ancienne valeur exacte du champ.',
    '-- ---------------------------------------------------------------------',
  ];
  for (const c of [...data.categorie, ...data.definitions]) {
    if (!['categorie', 'definition_complete'].includes(c.champ)) {
      throw new Error(`champ non prévu : ${c.champ}`);
    }
    lines.push(
      `UPDATE glossary_terms SET ${c.champ} = ${q(c.apres)}`,
      ` WHERE glossary_code = ${q(c.glossary_code)} AND ${binEq('terme', c.terme)}`,
      `   AND ${binEq(c.champ, c.avant)};`,
    );
  }
  return lines.join('\n');
}

function mapsSection(data) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    '-- 4. Carte Daya : niveau imposé retiré. Garde : id + ancienne valeur.',
    '-- ---------------------------------------------------------------------',
  ];
  for (const c of data.changements) {
    if (c.champ !== 'pedago_level') throw new Error(`champ non prévu : ${c.champ}`);
    lines.push(
      `UPDATE maps SET pedago_level = ${q(c.apres)}`,
      ` WHERE id = ${q(c.map_id)} AND pedago_level <=> ${q(c.avant)};`,
    );
  }
  return lines.join('\n');
}

function stepGuards(e) {
  const i = e.index;
  const g = [
    `JSON_VALID(steps_json)`,
    binEq(jText(i, '.id'), e.step_id),
    binEq(jText(i, '.title'), e.avant.title),
    binEq(jText(i, '.body'), e.avant.body),
    binEq(jText(i, '.action.type'), e.avant.action_type),
  ];
  for (const [key, expected] of Object.entries(e.avant.payload || {})) {
    g.push(payloadGuard(i, key, expected));
  }
  return g;
}

function sessionsSection(data) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    '-- 5. Séances. Garde : slug + identifiant d’étape + ancienne forme de chaque champ modifié ;',
    '--    espèces et question exigées présentes, sinon rien n’est fait.',
    '-- ---------------------------------------------------------------------',
  ];
  for (const e of data.etapes) {
    const guards = [`slug = ${q(e.slug)}`];
    let setExpr;
    if (e.operation === 'modifier') {
      guards.push(...stepGuards(e));
      const pairs = [];
      if (e.apres.title != null) pairs.push(`'$[${e.index}].title'`, q(e.apres.title));
      if (e.apres.body != null) pairs.push(`'$[${e.index}].body'`, q(e.apres.body));
      for (const [key, value] of Object.entries(e.apres.payload || {})) {
        pairs.push(`'$[${e.index}].action.payload.${key}'`, payloadValue(value));
        if (value && typeof value === 'object' && value.plante) {
          guards.push(plantExistsSql(value.plante));
        }
      }
      setExpr = `JSON_SET(steps_json, ${pairs.join(', ')})`;
    } else if (e.operation === 'inserer') {
      guards.push(`JSON_VALID(steps_json)`, `JSON_LENGTH(steps_json) = ${e.avant.nb_etapes}`);
      e.avant.ids.forEach((id, i) => guards.push(binEq(jText(i, '.id'), id)));
      const payload = Object.entries(e.apres.payload)
        .map(([key, value]) => `${q(key)}, ${payloadValue(value)}`)
        .join(', ');
      for (const value of Object.values(e.apres.payload)) {
        if (value && typeof value === 'object' && value.plante) {
          guards.push(plantExistsSql(value.plante));
        }
      }
      setExpr = [
        `JSON_ARRAY_INSERT(steps_json, '$[${e.index}]', JSON_OBJECT(`,
        `    'id', ${q(e.apres.id)},`,
        `    'title', ${q(e.apres.title)},`,
        `    'body', ${q(e.apres.body)},`,
        `    'action', JSON_OBJECT('type', ${q(e.apres.action_type)}, 'payload', JSON_OBJECT(${payload})),`,
        `    'completeWhen', ${q(e.apres.completeWhen)}))`,
      ].join('\n');
    } else {
      throw new Error(`opération inconnue : ${e.operation}`);
    }
    if (e.question_requise) {
      guards.push(
        `EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.question_code = ${q(e.question_requise)} AND qq.statut = 'actif')`,
      );
    }
    lines.push(
      `-- ${e.slug} · étape ${e.step_id} (${e.operation})`,
      `UPDATE pedago_sessions SET steps_json = ${setExpr}`,
      ` WHERE ${guards.join('\n   AND ')};`,
    );
  }
  return lines.join('\n');
}

function buildSql() {
  const emoji = readData('emoji.json');
  const niveaux = readData('glossaire-niveaux.json');
  const contenu = readData('glossaire-contenu.json');
  const cartes = readData('cartes.json');
  const seances = readData('seances.json');
  const header = [
    'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;',
    '',
    '-- =====================================================================',
    '-- Chantier collège (novembre 2026), flux D1 : corrections immédiates de contenu.',
    '--',
    '-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d1-migration.js à partir de',
    '-- data/college-2026-11/d1/*.json : ne pas l’éditer à la main. Revue détaillée (avant / après,',
    '-- motifs) : fichier de revue D1 du chantier, puis description de la PR.',
    '--',
    '-- 1. Emoji qui suggèrent un autre groupe que celui de la fiche (cloporte en coléoptère,',
    '--    mille-pattes en chenille…) remplacés par un emoji fidèle ou neutre du milieu de vie.',
    '-- 2. Niveaux du glossaire (base / approfondissement / avance) revus contre les programmes',
    '--    et les contenus collège.',
    '-- 3. Glossaire : « champignon » quitte la catégorie faune ; invertébré, reptile, poisson',
    '--    présentés comme des groupes d’usage courant.',
    '-- 4. Carte de la daya : plus de niveau imposé « lycée ».',
    '-- 5. Séances 6e : réseaux centrés sur une espèce familière, question de cycle 3, étape',
    '--    « mangeur de graines ».',
    '--',
    '-- Idempotente : chaque UPDATE est gardé par la clé naturelle et l’ancienne valeur exacte',
    '-- (une modification faite dans l’application n’est jamais écrasée). Une ligne absente',
    '-- (base fraîche) est sautée sans erreur. Ni DDL, ni trigger, ni donnée personnelle.',
    '-- =====================================================================',
  ].join('\n');
  return (
    [
      header,
      emojiSection(emoji),
      glossaryLevelSection(niveaux),
      glossaryContentSection(contenu),
      mapsSection(cartes),
      sessionsSection(seances),
    ].join('\n\n') + '\n'
  );
}

function targetFile() {
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(SUFFIX));
  if (existing.length > 1)
    throw new Error(`plusieurs fichiers *${SUFFIX} : ${existing.join(', ')}`);
  return path.join(MIGRATIONS_DIR, existing[0] || `379${SUFFIX}`);
}

function main() {
  const sql = buildSql();
  const file = targetFile();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== sql) {
      console.error(`[d1] ${path.basename(file)} n'est pas à jour : relancer le générateur.`);
      process.exit(1);
    }
    console.log(`[d1] ${path.basename(file)} à jour.`);
    return;
  }
  fs.writeFileSync(file, sql);
  console.log(`[d1] ${path.relative(ROOT, file)} écrit (${sql.split('\n').length} lignes).`);
}

if (require.main === module) main();

module.exports = { buildSql, SUFFIX };
