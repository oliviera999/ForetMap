'use strict';

/**
 * Script de classement des tâches existantes (`scripts/backfill-task-taxonomy.js`) :
 * le dry-run n'écrit rien en base ; `--apply` est idempotent ; `--overwrite` est nécessaire
 * pour écraser une valeur ; les projets et les phases de l'annexe sont appliqués ; un préfixe
 * ambigu arrête tout ; les candidats « projet » sont listés sans être transformés.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../database');
const {
  buildProposal,
  proposalToCsv,
  applyProposal,
  BackfillError,
  AUDIT_ACTION,
} = require('../scripts/backfill-task-taxonomy');

const { initSchema, queryOne, queryAll, execute } = db;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxo-backfill-'));
let ids;
let annex;

function hexId() {
  return crypto.randomUUID();
}

async function insertTask(id, title, extra = {}) {
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, project_id, required_students, status,
                        recurrence, category, created_at)
     VALUES (?, ?, ?, 'foret', ?, ?, 'available', ?, ?, ?)`,
    [
      id,
      title,
      extra.description || '',
      extra.projectId || null,
      extra.requiredStudents || 1,
      extra.recurrence || null,
      extra.category || null,
      new Date(),
    ],
  );
}

before(async () => {
  await initSchema();
  ids = {
    project: hexId(),
    taskPhase: hexId(),
    taskOther: hexId(),
    taskRecurring: hexId(),
    taskSet: hexId(),
    candidate: hexId(),
  };
  await execute(
    "INSERT INTO task_projects (id, map_id, title, status, created_at) VALUES (?, 'foret', ?, 'active', ?)",
    [ids.project, 'Projet backfill', new Date()],
  );
  await insertTask(ids.taskPhase, 'Concevoir la partie basse du module', {
    projectId: ids.project,
  });
  await insertTask(ids.taskOther, 'Récolte petits pois backfill', { requiredStudents: 2 });
  await insertTask(ids.taskRecurring, 'Arrosage des plantes backfill', { recurrence: 'weekly' });
  await insertTask(ids.taskSet, 'Nettoyer les tables backfill', { category: 'jardinage' });
  await insertTask(ids.candidate, 'Construire une étagère backfill', { requiredStudents: 8 });
  annex = {
    projects: [
      {
        prefix: ids.project.slice(0, 13),
        title: 'Projet backfill',
        type: 'dispositif_technique',
        phases: { concevoir: [ids.taskPhase.slice(0, 13)] },
      },
    ],
    projectCandidates: [{ prefix: ids.candidate.slice(0, 13), title: 'Étagère' }],
    suspectRecurrence: [{ title: 'Arrosage des plantes backfill', note: 'à vérifier' }],
  };
});

function rowFor(rows, id, field) {
  return rows.find((r) => r.id === id && r.field === field);
}

test('dry-run : propose sans rien écrire en base', async () => {
  const before = await queryAll(
    'SELECT id, category, format, project_phase FROM tasks WHERE id IN (?, ?, ?)',
    [ids.taskPhase, ids.taskOther, ids.taskRecurring],
  );
  const proposal = await buildProposal(db, { annex });
  assert.equal(rowFor(proposal.rows, ids.project, 'project_type').proposed, 'dispositif_technique');
  assert.equal(rowFor(proposal.rows, ids.taskPhase, 'project_phase').proposed, 'concevoir');
  assert.equal(rowFor(proposal.rows, ids.taskOther, 'category').proposed, 'jardinage');
  assert.equal(rowFor(proposal.rows, ids.taskOther, 'format').proposed, 'flash');
  assert.equal(rowFor(proposal.rows, ids.taskRecurring, 'format').proposed, 'routine');
  assert.match(rowFor(proposal.rows, ids.taskSet, 'category').rule, /--overwrite/);
  assert.ok(
    proposal.unclassified.some((t) => t.id === ids.taskPhase),
    'titre non reconnu listé',
  );
  assert.deepEqual(
    proposal.candidates.map((c) => c.id),
    [ids.candidate],
  );
  assert.ok(proposal.warnings.some((w) => w.includes('à vérifier')));
  const after = await queryAll(
    'SELECT id, category, format, project_phase FROM tasks WHERE id IN (?, ?, ?)',
    [ids.taskPhase, ids.taskOther, ids.taskRecurring],
  );
  assert.deepEqual(after, before, 'aucune écriture');
  const csv = proposalToCsv(proposal.rows);
  assert.match(csv.split('\n')[0], /^kind;id;title;field;current;proposed;rule$/);
});

test('--apply : CSV relu appliqué, idempotent, NULL seulement sans --overwrite', async () => {
  const proposal = await buildProposal(db, { annex });
  const file = path.join(tmpDir, 'proposal.csv');
  fs.writeFileSync(file, proposalToCsv(proposal.rows));

  const auditBefore = await queryOne('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?', [
    AUDIT_ACTION,
  ]);
  const first = await applyProposal(file, { db });
  assert.ok(first.applied >= 5);
  const project = await queryOne('SELECT project_type FROM task_projects WHERE id = ?', [
    ids.project,
  ]);
  assert.equal(project.project_type, 'dispositif_technique');
  const phased = await queryOne('SELECT project_phase, status FROM tasks WHERE id = ?', [
    ids.taskPhase,
  ]);
  assert.equal(phased.project_phase, 'concevoir');
  assert.equal(phased.status, 'available', 'statut jamais écrit');
  const kept = await queryOne('SELECT category FROM tasks WHERE id = ?', [ids.taskSet]);
  assert.equal(kept.category, 'jardinage', 'valeur existante conservée sans --overwrite');

  const second = await applyProposal(file, { db });
  assert.equal(second.applied, 0, 'idempotent');

  await applyProposal(file, { db, overwrite: true });
  const overwritten = await queryOne('SELECT category FROM tasks WHERE id = ?', [ids.taskSet]);
  assert.equal(overwritten.category, 'entretien', '--overwrite écrase');

  const auditAfter = await queryOne('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?', [
    AUDIT_ACTION,
  ]);
  assert.equal(Number(auditAfter.n) - Number(auditBefore.n), 3, 'une ligne par lot appliqué');
});

test('--apply refuse un champ non autorisé ou une valeur inconnue, sans rien écrire', async () => {
  const bad = path.join(tmpDir, 'bad.csv');
  fs.writeFileSync(
    bad,
    `kind;id;title;field;current;proposed;rule\ntask;${ids.taskOther};x;status;;validated;\n`,
  );
  await assert.rejects(applyProposal(bad, { db }), BackfillError);
  fs.writeFileSync(
    bad,
    `kind;id;title;field;current;proposed;rule\ntask;${ids.taskOther};x;category;;cuisine;\n`,
  );
  await assert.rejects(applyProposal(bad, { db }), /Métier inconnu/);
});

test('préfixe ambigu : arrêt', async () => {
  await assert.rejects(
    buildProposal(db, {
      annex: { projects: [{ prefix: '', title: 'tout', type: 'campagne' }] },
    }),
    BackfillError,
  );
});
