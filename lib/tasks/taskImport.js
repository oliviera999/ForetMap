const { asTrimmedString, normalizeImportHeader } = require('../shared/stringHelpers');
const { parseFirstSheetRows, buildWorkbookBuffer, jsonRowsToAoa } = require('../spreadsheet');

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const IMPORT_TEMPLATE_COLUMNS = [
  'Type (project|task)',
  'Carte (map_id)',
  'Projet',
  'Description projet',
  'Tâche',
  'Description tâche',
  'Date de départ (YYYY-MM-DD)',
  'Date limite (YYYY-MM-DD)',
  'n3beurs requis',
  'Statut (available|in_progress|done|validated|proposed|on_hold)',
  'Récurrence (weekly|biweekly|monthly)',
  'Importance (not_important|low|medium|high|absolute)',
];

const ALLOWED_IMPORT_TASK_STATUSES = new Set([
  'available',
  'in_progress',
  'done',
  'validated',
  'proposed',
  'on_hold',
]);
const ALLOWED_IMPORT_TASK_RECURRENCES = new Set(['weekly', 'biweekly', 'monthly']);
const ALLOWED_TASK_IMPORTANCE_LEVELS = new Set([
  'not_important',
  'low',
  'medium',
  'high',
  'absolute',
]);

const IMPORT_HEADER_ALIASES = new Map([
  ['type', 'entityType'],
  ['type_project_task', 'entityType'],
  ['entity_type', 'entityType'],
  ['row_type', 'entityType'],
  ['carte', 'mapId'],
  ['carte_map_id', 'mapId'],
  ['map', 'mapId'],
  ['map_id', 'mapId'],
  ['projet', 'projectTitle'],
  ['project', 'projectTitle'],
  ['project_title', 'projectTitle'],
  ['description_projet', 'projectDescription'],
  ['project_description', 'projectDescription'],
  ['tache', 'taskTitle'],
  ['tâche', 'taskTitle'],
  ['task', 'taskTitle'],
  ['task_title', 'taskTitle'],
  ['description_tache', 'taskDescription'],
  ['description_tâche', 'taskDescription'],
  ['task_description', 'taskDescription'],
  ['date_de_depart', 'startDate'],
  ['date_de_depart_yyyy_mm_dd', 'startDate'],
  ['date_debut', 'startDate'],
  ['start_date', 'startDate'],
  ['start', 'startDate'],
  ['date_limite', 'dueDate'],
  ['date_limite_yyyy_mm_dd', 'dueDate'],
  ['due_date', 'dueDate'],
  ['deadline', 'dueDate'],
  ['eleves_requis', 'requiredStudents'],
  ['élèves_requis', 'requiredStudents'],
  ['n3beurs_requis', 'requiredStudents'],
  ['required_students', 'requiredStudents'],
  ['statut', 'status'],
  ['statut_available_in_progress_done_validated_proposed_on_hold', 'status'],
  ['status', 'status'],
  ['recurrence', 'recurrence'],
  ['recurrence_weekly_biweekly_monthly', 'recurrence'],
  ['récurrence', 'recurrence'],
  ['importance', 'importanceLevel'],
  ['importance_level', 'importanceLevel'],
  ['degre_importance', 'importanceLevel'],
  ['degre_dimportance', 'importanceLevel'],
]);

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s ? s : null;
}

function normalizeImportEntityType(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  if (['project', 'projet', 'projets', 'task_project'].includes(raw)) return 'project';
  if (['task', 'tache', 'tâche', 'tasks', 'taches', 'tâches'].includes(raw)) return 'task';
  return null;
}

function normalizeImportTaskStatus(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return 'available';
  if (['disponible'].includes(raw)) return 'available';
  if (['en_cours', 'encours', 'en cours'].includes(raw)) return 'in_progress';
  if (['terminee', 'terminée'].includes(raw)) return 'done';
  if (['validee', 'validée'].includes(raw)) return 'validated';
  if (['proposee', 'proposée'].includes(raw)) return 'proposed';
  if (['en_attente', 'en attente', 'attente'].includes(raw)) return 'on_hold';
  return ALLOWED_IMPORT_TASK_STATUSES.has(raw) ? raw : null;
}

function parseTaskImportanceLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw)) return { level: raw };
  return { error: "Degré d'importance invalide" };
}

function normalizeImportTaskRecurrence(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  if (['hebdo', 'hebdomadaire'].includes(raw)) return 'weekly';
  if (['bihebdo', 'bi_hebdo', 'toutes_les_2_semaines'].includes(raw)) return 'biweekly';
  if (['mensuelle', 'mensuel'].includes(raw)) return 'monthly';
  return ALLOWED_IMPORT_TASK_RECURRENCES.has(raw) ? raw : null;
}

function normalizeImportRequiredStudents(value) {
  const raw = asTrimmedString(value);
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) return null;
  return n;
}

function normalizeImportDueDate(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function parseWorkbookRowsFromBuffer(buffer) {
  return parseFirstSheetRows(buffer);
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvRowsFromBuffer(buffer) {
  const text = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = lines[0].split(';').length >= lines[0].split(',').length ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => asTrimmedString(h));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = idx < cells.length ? cells[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function mapImportRow(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    mapped[target] = value;
  }
  return mapped;
}

function buildImportPayload(row = {}) {
  const mapped = mapImportRow(row);
  return {
    entityType: normalizeImportEntityType(mapped.entityType),
    mapId: normalizeOptionalString(mapped.mapId),
    projectTitle: normalizeOptionalString(mapped.projectTitle),
    projectDescription: normalizeOptionalString(mapped.projectDescription),
    taskTitle: normalizeOptionalString(mapped.taskTitle),
    taskDescription: normalizeOptionalString(mapped.taskDescription),
    startDate: normalizeDateOnly(mapped.startDate),
    dueDate: normalizeImportDueDate(mapped.dueDate),
    requiredStudents: normalizeImportRequiredStudents(mapped.requiredStudents),
    status: normalizeImportTaskStatus(mapped.status),
    recurrence: normalizeImportTaskRecurrence(mapped.recurrence),
    importanceLevel: normalizeOptionalString(mapped.importanceLevel)?.toLowerCase() || null,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildImportTemplateWorkbookRows() {
  return [
    {
      [IMPORT_TEMPLATE_COLUMNS[0]]: 'project',
      [IMPORT_TEMPLATE_COLUMNS[1]]: 'foret',
      [IMPORT_TEMPLATE_COLUMNS[2]]: 'Semis printemps',
      [IMPORT_TEMPLATE_COLUMNS[3]]: 'Planifier et suivre les semis de printemps.',
      [IMPORT_TEMPLATE_COLUMNS[4]]: '',
      [IMPORT_TEMPLATE_COLUMNS[5]]: '',
      [IMPORT_TEMPLATE_COLUMNS[6]]: '',
      [IMPORT_TEMPLATE_COLUMNS[7]]: '',
      [IMPORT_TEMPLATE_COLUMNS[8]]: '',
      [IMPORT_TEMPLATE_COLUMNS[9]]: '',
      [IMPORT_TEMPLATE_COLUMNS[10]]: '',
      [IMPORT_TEMPLATE_COLUMNS[11]]: '',
    },
    {
      [IMPORT_TEMPLATE_COLUMNS[0]]: 'task',
      [IMPORT_TEMPLATE_COLUMNS[1]]: 'foret',
      [IMPORT_TEMPLATE_COLUMNS[2]]: 'Semis printemps',
      [IMPORT_TEMPLATE_COLUMNS[3]]: '',
      [IMPORT_TEMPLATE_COLUMNS[4]]: 'Préparer les godets',
      [IMPORT_TEMPLATE_COLUMNS[5]]: 'Nettoyer puis remplir les godets de substrat.',
      [IMPORT_TEMPLATE_COLUMNS[6]]: '2026-04-01',
      [IMPORT_TEMPLATE_COLUMNS[7]]: '2026-04-15',
      [IMPORT_TEMPLATE_COLUMNS[8]]: '2',
      [IMPORT_TEMPLATE_COLUMNS[9]]: 'available',
      [IMPORT_TEMPLATE_COLUMNS[10]]: 'weekly',
      [IMPORT_TEMPLATE_COLUMNS[11]]: 'high',
    },
  ];
}

async function buildImportTemplateXlsxBuffer() {
  const aoa = jsonRowsToAoa(buildImportTemplateWorkbookRows(), IMPORT_TEMPLATE_COLUMNS);
  return buildWorkbookBuffer([{ name: 'taches_projets', aoa }]);
}

function buildImportTemplateCsvString() {
  const rows = buildImportTemplateWorkbookRows();
  const BOM = '\uFEFF';
  const headerLine = IMPORT_TEMPLATE_COLUMNS.map(csvEscape).join(';');
  const csvRows = rows.map((row) =>
    IMPORT_TEMPLATE_COLUMNS.map((col) => csvEscape(row[col])).join(';'),
  );
  return `${BOM}${headerLine}\r\n${csvRows.join('\r\n')}\r\n`;
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES)
    throw new Error('Fichier import trop volumineux (max 8 Mo)');
  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) return parseCsvRowsFromBuffer(buffer);
  return parseWorkbookRowsFromBuffer(buffer);
}

/**
 * Import projets/tâches depuis CSV/XLSX (dry-run ou écriture BDD).
 * @param {object} options
 * @param {object} options.body - corps POST (fileDataBase64, fileName, dryRun)
 * @param {boolean} options.dryRun
 * @param {Function} options.queryAll
 * @param {Function} options.execute
 * @param {Function} options.uuidv4
 * @param {Function} [options.onAudit]
 * @param {Function} [options.emitTasksChanged]
 * @param {Function} [options.syncTaskProjectCompletionForProjects]
 */
async function executeTasksProjectsImport({
  body,
  dryRun,
  queryAll,
  execute,
  uuidv4,
  onAudit,
  emitTasksChanged,
  syncTaskProjectCompletionForProjects,
}) {
  const rawRows = await resolveImportRows(body || {});
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    const err = new Error('Aucune ligne importable détectée');
    err.status = 400;
    throw err;
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    const err = new Error(`Import limité à ${MAX_IMPORT_ROWS} lignes`);
    err.status = 400;
    throw err;
  }

  const report = {
    dryRun,
    totals: {
      received: rawRows.length,
      valid: 0,
      created_projects: 0,
      created_tasks: 0,
      skipped_existing: 0,
      skipped_invalid: 0,
    },
    preview: [],
    errors: [],
  };

  const mapRows = await queryAll('SELECT id FROM maps');
  const knownMapIds = new Set(mapRows.map((m) => String(m.id)));
  const existingProjects = await queryAll('SELECT id, map_id, title FROM task_projects');
  const projectsByMapTitle = new Map();
  for (const p of existingProjects) {
    projectsByMapTitle.set(`${String(p.map_id)}|${String(p.title).toLowerCase()}`, p);
  }
  const existingTasks = await queryAll(
    `SELECT t.id, t.title, t.map_id, t.project_id, tp.title AS project_title, tp.map_id AS project_map_id
       FROM tasks t
       LEFT JOIN task_projects tp ON tp.id = t.project_id`,
  );
  const tasksByIdentity = new Set();
  for (const t of existingTasks) {
    const taskMap = t.project_map_id || t.map_id || '';
    const projectTitle = t.project_title || '';
    const identity = `${String(taskMap)}|${String(projectTitle).toLowerCase()}|${String(t.title).toLowerCase()}`;
    tasksByIdentity.add(identity);
  }

  const projectRows = [];
  const taskRows = [];
  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const payload = buildImportPayload(row);
    const errors = [];

    if (!payload.entityType) {
      errors.push({ row: rowNumber, field: 'type', error: 'Type invalide (project|task)' });
    }
    if (payload.entityType === 'project') {
      if (!payload.mapId)
        errors.push({ row: rowNumber, field: 'map_id', error: 'Carte requise pour un projet' });
      if (!payload.projectTitle)
        errors.push({ row: rowNumber, field: 'project_title', error: 'Nom du projet requis' });
      if (payload.mapId && !knownMapIds.has(payload.mapId)) {
        errors.push({ row: rowNumber, field: 'map_id', error: 'Carte introuvable' });
      }
    }
    if (payload.entityType === 'task') {
      if (!payload.taskTitle)
        errors.push({ row: rowNumber, field: 'task_title', error: 'Nom de tâche requis' });
      if (payload.mapId && !knownMapIds.has(payload.mapId)) {
        errors.push({ row: rowNumber, field: 'map_id', error: 'Carte introuvable' });
      }
      if (payload.requiredStudents == null) {
        errors.push({
          row: rowNumber,
          field: 'required_students',
          error: 'n3beurs requis invalide (1-50)',
        });
      }
      if (!payload.status || !ALLOWED_IMPORT_TASK_STATUSES.has(payload.status)) {
        errors.push({ row: rowNumber, field: 'status', error: 'Statut invalide' });
      }
      if (asTrimmedString(mapImportRow(row).recurrence) && !payload.recurrence) {
        errors.push({
          row: rowNumber,
          field: 'recurrence',
          error: 'Récurrence invalide (weekly|biweekly|monthly)',
        });
      }
      if (asTrimmedString(mapImportRow(row).dueDate) && !payload.dueDate) {
        errors.push({ row: rowNumber, field: 'due_date', error: 'Date limite invalide' });
      }
      if (asTrimmedString(mapImportRow(row).startDate) && !payload.startDate) {
        errors.push({ row: rowNumber, field: 'start_date', error: 'Date de départ invalide' });
      }
      if (payload.importanceLevel) {
        const ip = parseTaskImportanceLevelFromClient(payload.importanceLevel);
        if (ip.error) errors.push({ row: rowNumber, field: 'importance_level', error: ip.error });
      }
    }

    if (errors.length) {
      report.totals.skipped_invalid += 1;
      report.errors.push(...errors);
      return;
    }

    if (payload.entityType === 'project') {
      const key = `${payload.mapId}|${payload.projectTitle.toLowerCase()}`;
      if (projectsByMapTitle.has(key) || projectRows.some((p) => p.identityKey === key)) {
        report.totals.skipped_existing += 1;
        report.errors.push({
          row: rowNumber,
          field: 'project_title',
          error: 'Projet déjà existant (même carte + même nom)',
        });
        return;
      }
      projectRows.push({
        rowNumber,
        identityKey: key,
        mapId: payload.mapId,
        title: payload.projectTitle,
        description: payload.projectDescription,
      });
    } else {
      taskRows.push({
        rowNumber,
        mapId: payload.mapId,
        projectTitle: payload.projectTitle,
        title: payload.taskTitle,
        description: payload.taskDescription,
        startDate: payload.startDate,
        dueDate: payload.dueDate,
        requiredStudents: payload.requiredStudents ?? 1,
        status: payload.status || 'available',
        recurrence: payload.recurrence || null,
        importanceLevel: parseTaskImportanceLevelFromClient(payload.importanceLevel).level,
      });
    }
  });

  const plannedProjectsByMapTitle = new Map(projectRows.map((p) => [p.identityKey, p]));
  const taskRowsResolved = [];
  const seenTaskKeys = new Set();
  for (const row of taskRows) {
    let resolvedProject = null;
    if (row.projectTitle) {
      if (row.mapId) {
        const mapTitleKey = `${row.mapId}|${row.projectTitle.toLowerCase()}`;
        resolvedProject =
          projectsByMapTitle.get(mapTitleKey) || plannedProjectsByMapTitle.get(mapTitleKey) || null;
        if (!resolvedProject) {
          report.totals.skipped_invalid += 1;
          report.errors.push({
            row: row.rowNumber,
            field: 'project_title',
            error: 'Projet introuvable pour cette carte',
          });
          continue;
        }
      } else {
        const projectCandidates = [
          ...existingProjects.filter(
            (p) => String(p.title).toLowerCase() === row.projectTitle.toLowerCase(),
          ),
          ...projectRows.filter(
            (p) => String(p.title).toLowerCase() === row.projectTitle.toLowerCase(),
          ),
        ];
        const uniqueCandidates = [
          ...new Map(projectCandidates.map((p) => [p.id || p.identityKey, p])).values(),
        ];
        if (uniqueCandidates.length !== 1) {
          report.totals.skipped_invalid += 1;
          report.errors.push({
            row: row.rowNumber,
            field: 'project_title',
            error:
              uniqueCandidates.length === 0
                ? 'Projet introuvable (précisez map_id)'
                : 'Projet ambigu (plusieurs cartes, précisez map_id)',
          });
          continue;
        }
        resolvedProject = uniqueCandidates[0];
      }
    }

    const resolvedMapId = row.mapId || resolvedProject?.map_id || resolvedProject?.mapId || null;
    if (!resolvedMapId) {
      report.totals.skipped_invalid += 1;
      report.errors.push({
        row: row.rowNumber,
        field: 'map_id',
        error: 'Carte requise (directement ou via projet)',
      });
      continue;
    }
    const resolvedProjectTitle = resolvedProject?.title || row.projectTitle || '';
    const taskIdentity = `${resolvedMapId}|${resolvedProjectTitle.toLowerCase()}|${row.title.toLowerCase()}`;
    if (tasksByIdentity.has(taskIdentity) || seenTaskKeys.has(taskIdentity)) {
      report.totals.skipped_existing += 1;
      report.errors.push({
        row: row.rowNumber,
        field: 'task_title',
        error: 'Tâche déjà existante (même carte + projet + titre)',
      });
      continue;
    }
    seenTaskKeys.add(taskIdentity);
    taskRowsResolved.push({
      ...row,
      resolvedMapId,
      resolvedProjectTitle,
    });
  }

  const validTotal = projectRows.length + taskRowsResolved.length;
  report.totals.valid = validTotal;
  for (const item of projectRows.slice(0, 10)) {
    report.preview.push({
      row: item.rowNumber,
      type: 'project',
      map_id: item.mapId,
      title: item.title,
    });
  }
  for (const item of taskRowsResolved.slice(0, 10 - report.preview.length)) {
    report.preview.push({
      row: item.rowNumber,
      type: 'task',
      map_id: item.resolvedMapId,
      project_title: item.resolvedProjectTitle || null,
      title: item.title,
    });
  }

  if (dryRun || validTotal === 0) {
    return { report };
  }

  const importMapIds = new Set();
  const importProjectIds = new Set();
  const createdProjectsByMapTitle = new Map();
  for (const project of projectRows) {
    const id = uuidv4();
    await execute(
      'INSERT INTO task_projects (id, map_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, project.mapId, project.title, project.description || null, new Date().toISOString()],
    );
    createdProjectsByMapTitle.set(`${project.mapId}|${project.title.toLowerCase()}`, {
      id,
      map_id: project.mapId,
      title: project.title,
    });
    report.totals.created_projects += 1;
    if (project.mapId != null && String(project.mapId).trim()) {
      importMapIds.add(String(project.mapId).trim());
    }
  }

  for (const task of taskRowsResolved) {
    const projectKey = task.resolvedProjectTitle
      ? `${task.resolvedMapId}|${task.resolvedProjectTitle.toLowerCase()}`
      : null;
    const existingProject = projectKey
      ? projectsByMapTitle.get(projectKey) || createdProjectsByMapTitle.get(projectKey) || null
      : null;
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, status, recurrence, danger_level, difficulty_level, importance_level, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        task.title,
        task.description || '',
        task.resolvedMapId,
        existingProject?.id || null,
        task.startDate || null,
        task.dueDate || null,
        task.requiredStudents || 1,
        task.status || 'available',
        task.recurrence || null,
        null,
        null,
        task.importanceLevel ?? null,
        new Date().toISOString(),
      ],
    );
    report.totals.created_tasks += 1;
    if (task.resolvedMapId != null && String(task.resolvedMapId).trim()) {
      importMapIds.add(String(task.resolvedMapId).trim());
    }
    if (existingProject?.id) importProjectIds.add(String(existingProject.id));
  }

  if (report.totals.created_projects + report.totals.created_tasks > 0) {
    if (typeof onAudit === 'function') {
      onAudit(report.totals);
    }
    const payloadBase = {
      reason: 'tasks_projects_import',
      created_projects: report.totals.created_projects,
      created_tasks: report.totals.created_tasks,
    };
    if (typeof emitTasksChanged === 'function') {
      if (importMapIds.size > 0) {
        for (const mapId of importMapIds) {
          emitTasksChanged({ ...payloadBase, mapId });
        }
      } else {
        emitTasksChanged(payloadBase);
      }
    }
  }
  if (importProjectIds.size > 0 && typeof syncTaskProjectCompletionForProjects === 'function') {
    await syncTaskProjectCompletionForProjects([...importProjectIds]);
  }

  return { report };
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  IMPORT_TEMPLATE_COLUMNS,
  normalizeImportTaskStatus,
  buildImportTemplateWorkbookRows,
  buildImportTemplateXlsxBuffer,
  buildImportTemplateCsvString,
  resolveImportRows,
  executeTasksProjectsImport,
};
