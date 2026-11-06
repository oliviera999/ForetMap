#!/usr/bin/env node
'use strict';

/**
 * Classement des tâches et projets existants (migration 329) : métier, format, phase, type.
 *
 * Usage :
 *   node scripts/backfill-task-taxonomy.js                     # --dry-run (défaut)
 *   node scripts/backfill-task-taxonomy.js --dry-run --out tmp/proposition.csv
 *   node scripts/backfill-task-taxonomy.js --apply --file tmp/task-taxonomy-proposal.csv
 *   node scripts/backfill-task-taxonomy.js --apply --file … --overwrite
 *
 * - **Dry-run** (défaut) : n'écrit rien en base ; produit `tmp/task-taxonomy-proposal.csv`
 *   (non versionné) — une ligne par tâche ou projet et par champ : valeur actuelle, valeur
 *   proposée, règle appliquée. Le CSV se relit (et se corrige) avant application.
 * - **--apply --file** : n'applique **que** le CSV relu, en SQL paramétré, dans une seule
 *   transaction, et journalise une ligne `audit_log` (`task_taxonomy_backfill`).
 * - Ne remplit que les champs NULL, sauf `--overwrite`. N'écrit jamais `status`,
 *   `validated_at` ni l'avancement.
 *
 * Règles : tâches → suggestion automatique (`lib/tasks/taskCategoryGuess.js`) ; projets et
 * phases → annexe 2 (`scripts/data/task-taxonomy-annex2.json`, préfixes d'identifiants
 * résolus ici : un préfixe ambigu arrête le script). Les tâches de projet absentes de
 * l'annexe restent sans phase. Le script ne transforme aucune tâche en projet : les
 * candidats sont listés à part, à traiter à la main.
 */

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { guessTaskTaxonomy } = require('../lib/tasks/taskCategoryGuess');
const { parseTaxonomyInput, effectiveTaskFormat } = require('../lib/shared/taskTaxonomyCore');
const { csvEscape, parseCsvRowsFromBuffer } = require('../lib/importRows');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'tmp', 'task-taxonomy-proposal.csv');
const ANNEX_FILE = path.join(__dirname, 'data', 'task-taxonomy-annex2.json');
const CSV_COLUMNS = ['kind', 'id', 'title', 'field', 'current', 'proposed', 'rule'];
const TASK_FIELDS = Object.freeze(['category', 'format', 'project_phase']);
const PROJECT_FIELDS = Object.freeze(['project_type']);
const AUDIT_ACTION = 'task_taxonomy_backfill';

class BackfillError extends Error {}

function loadAnnex(file = ANNEX_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Résout un préfixe d'identifiant ; plusieurs correspondances → arrêt. */
function resolvePrefix(rows, prefix, label) {
  const found = rows.filter((r) => String(r.id).startsWith(prefix));
  if (found.length > 1) {
    throw new BackfillError(
      `Préfixe ambigu ${prefix} (${label}) : ${found.length} correspondances — arrêt.`,
    );
  }
  return found[0] || null;
}

/**
 * Construit la proposition à partir de la base (lecture seule).
 * @param {{ queryAll: Function }} db
 * @param {{ annex?: object, overwrite?: boolean }} [options]
 */
async function buildProposal(db, { annex = loadAnnex(), overwrite = false } = {}) {
  const tasks = await db.queryAll(
    `SELECT id, title, CHAR_LENGTH(TRIM(COALESCE(description, ''))) AS description_length,
            required_students, recurrence, project_id, category, format, project_phase
       FROM tasks ORDER BY title, id`,
  );
  const projects = await db.queryAll(
    'SELECT id, title, project_type FROM task_projects ORDER BY title, id',
  );
  const rows = [];
  const warnings = [];
  const unclassified = [];
  const push = (kind, entity, field, proposed, rule) => {
    const current = entity[field] ?? null;
    if (!proposed || proposed === current) return;
    rows.push({
      kind,
      id: entity.id,
      title: entity.title,
      field,
      current: current ?? '',
      proposed,
      rule: current && !overwrite ? `${rule} (déjà renseigné : ignoré sans --overwrite)` : rule,
    });
  };

  // Projets et phases : annexe 2.
  const phaseByTaskId = new Map();
  for (const entry of annex.projects || []) {
    const project = resolvePrefix(projects, entry.prefix, entry.title);
    if (!project) {
      warnings.push(`Projet introuvable : ${entry.prefix} (${entry.title})`);
      continue;
    }
    push('project', project, 'project_type', entry.type, 'annexe 2');
    const projectTasks = tasks.filter((t) => t.project_id === project.id);
    if (entry.allTasksPhase) {
      for (const t of projectTasks) phaseByTaskId.set(t.id, entry.allTasksPhase);
    }
    for (const [phase, prefixes] of Object.entries(entry.phases || {})) {
      for (const prefix of prefixes) {
        const task = resolvePrefix(projectTasks, prefix, `tâche du projet ${entry.title}`);
        if (!task) {
          warnings.push(`Tâche introuvable dans ${entry.title} : ${prefix}`);
          continue;
        }
        phaseByTaskId.set(task.id, phase);
      }
    }
    for (const prefix of entry.unphased || []) {
      const task = resolvePrefix(projectTasks, prefix, `tâche du projet ${entry.title}`);
      if (task) warnings.push(`Sans phase (à préciser) : « ${task.title} » (${entry.title})`);
    }
  }

  // Tâches : suggestion automatique.
  for (const task of tasks) {
    const guess = guessTaskTaxonomy(task);
    if (!guess.category) unclassified.push({ id: task.id, title: task.title });
    push('task', task, 'category', guess.category, guess.rule ? `suggestion : ${guess.rule}` : '');
    const format = effectiveTaskFormat(task.recurrence, guess.format);
    push(
      'task',
      task,
      'format',
      format,
      task.recurrence ? 'récurrence ⇒ routine' : `suggestion : ${guess.rule}`,
    );
    if (task.project_id && phaseByTaskId.has(task.id)) {
      push('task', task, 'project_phase', phaseByTaskId.get(task.id), 'annexe 2');
    }
  }

  for (const suspect of annex.suspectRecurrence || []) {
    for (const t of tasks.filter((x) => x.title === suspect.title && x.recurrence)) {
      warnings.push(`« ${t.title} » (${t.id}) : ${suspect.note}`);
    }
  }
  const candidates = [];
  for (const c of annex.projectCandidates || []) {
    const task = resolvePrefix(tasks, c.prefix, c.title);
    candidates.push({ prefix: c.prefix, id: task?.id || null, title: task?.title || c.title });
  }
  return { rows, warnings, unclassified, candidates, taskCount: tasks.length };
}

function proposalToCsv(rows) {
  const lines = [CSV_COLUMNS.join(';')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(';'));
  return `${lines.join('\n')}\n`;
}

/** Lignes applicables d'un CSV relu (une valeur invalide arrête tout, avant écriture). */
function readProposalCsv(file) {
  const rows = parseCsvRowsFromBuffer(fs.readFileSync(file));
  const out = [];
  rows.forEach((row, idx) => {
    const kind = String(row.kind || '').trim();
    const field = String(row.field || '').trim();
    const id = String(row.id || '').trim();
    const proposed = String(row.proposed || '').trim();
    if (!id || !proposed) return;
    const allowed = kind === 'task' ? TASK_FIELDS : kind === 'project' ? PROJECT_FIELDS : null;
    if (!allowed || !allowed.includes(field)) {
      throw new BackfillError(`Ligne ${idx + 2} : champ « ${kind}.${field} » non modifiable.`);
    }
    const parsed = parseTaxonomyInput(field, proposed);
    if (parsed.error) throw new BackfillError(`Ligne ${idx + 2} : ${parsed.error}`);
    out.push({ kind, id, field, value: parsed.value });
  });
  return out;
}

/**
 * Applique un CSV relu en une transaction. Champs NULL seulement, sauf `overwrite`.
 * @returns {Promise<{ applied: number, skipped: number, byField: object }>}
 */
async function applyProposal(file, { overwrite = false, db = require('../database') } = {}) {
  const entries = readProposalCsv(file);
  const byField = {};
  let applied = 0;
  let skipped = 0;
  await db.withTransaction(async (tx) => {
    for (const e of entries) {
      const table = e.kind === 'task' ? 'tasks' : 'task_projects';
      // Nom de colonne pris dans une liste blanche (TASK_FIELDS / PROJECT_FIELDS), valeur
      // paramétrée. La phase exige une tâche rattachée à un projet.
      const projectGuard = e.field === 'project_phase' ? ' AND project_id IS NOT NULL' : '';
      const nullGuard = overwrite ? '' : ` AND ${e.field} IS NULL`;
      const result = await tx.execute(
        `UPDATE ${table} SET ${e.field} = ? WHERE id = ?${nullGuard}${projectGuard}`,
        [e.value, e.id],
      );
      if (Number(result?.affectedRows) > 0) {
        applied += 1;
        byField[`${e.kind}.${e.field}`] = (byField[`${e.kind}.${e.field}`] || 0) + 1;
      } else {
        skipped += 1;
      }
    }
    await tx.execute(
      `INSERT INTO audit_log (action, target_type, target_id, details, created_at, payload_json)
       VALUES (?, 'task_taxonomy', NULL, ?, NOW(3), ?)`,
      [
        AUDIT_ACTION,
        `Classement des tâches : ${applied} valeur(s) appliquée(s), ${skipped} ignorée(s)`,
        JSON.stringify({ file: path.basename(file), overwrite, applied, skipped, byField }),
      ],
    );
  });
  return { applied, skipped, byField };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(argv = process.argv.slice(2)) {
  const db = require('../database');
  const overwrite = argv.includes('--overwrite');
  try {
    if (argv.includes('--apply')) {
      const file = argValue(argv, '--file');
      if (!file) throw new BackfillError('--apply exige --file <csv relu>.');
      const result = await applyProposal(path.resolve(file), { overwrite, db });
      console.log(
        `Appliqué : ${result.applied} valeur(s), ignoré : ${result.skipped}.`,
        result.byField,
      );
      return result;
    }
    const out = path.resolve(argValue(argv, '--out') || DEFAULT_OUT);
    const proposal = await buildProposal(db, { overwrite });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, proposalToCsv(proposal.rows), 'utf8');
    console.log(`Dry-run : ${proposal.rows.length} proposition(s) → ${out}`);
    console.log(`Tâches non classées (${proposal.unclassified.length}) :`);
    for (const t of proposal.unclassified) console.log(`  - ${t.title} (${t.id})`);
    console.log('Candidats à transformer en projet (à traiter à la main) :');
    for (const c of proposal.candidates) console.log(`  - ${c.title} (${c.id || c.prefix})`);
    if (proposal.warnings.length) console.log('Signalements :');
    for (const w of proposal.warnings) console.log(`  - ${w}`);
    return proposal;
  } finally {
    if (require.main === module) await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof BackfillError ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  AUDIT_ACTION,
  BackfillError,
  buildProposal,
  proposalToCsv,
  readProposalCsv,
  applyProposal,
  loadAnnex,
  main,
};
