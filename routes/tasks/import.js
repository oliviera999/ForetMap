const express = require('express');
const crypto = require('node:crypto');
const { queryAll, execute } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const { syncTaskProjectCompletionForProjects } = require('../../lib/syncTaskProjectCompletion');
const {
  buildImportTemplateXlsxBuffer,
  buildImportTemplateCsvString,
  executeTasksProjectsImport,
} = require('../../lib/tasks/taskImport');
const { asTrimmedString } = require('../../lib/taskRouteHelpers');

const router = express.Router();

router.get(
  '/import/template',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
    if (format === 'xlsx') {
      const buffer = await buildImportTemplateXlsxBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="foretmap-modele-taches-projets.xlsx"',
      );
      return res.send(buffer);
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
    }
    const csv = buildImportTemplateCsvString();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="foretmap-modele-taches-projets.csv"',
    );
    res.send(csv);
  }),
);

router.post(
  '/import',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const dryRun = !!req.body?.dryRun;
    const { report } = await executeTasksProjectsImport({
      body: req.body || {},
      dryRun,
      queryAll,
      execute,
      uuidv4: () => crypto.randomUUID(),
      onAudit: (totals) => {
        logAudit(
          'tasks_projects_import',
          'task',
          null,
          `Import ${totals.created_projects} projet(s) / ${totals.created_tasks} tâche(s)`,
          {
            req,
            payload: { report: totals },
          },
        );
      },
      emitTasksChanged,
      syncTaskProjectCompletionForProjects,
    });
    res.json({ report });
  }),
);

module.exports = router;
