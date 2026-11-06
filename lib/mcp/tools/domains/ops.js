'use strict';

/**
 * `foretmap_ops` — exploitation du site par le connecteur (lot D4). Outil réservé : permission
 * `mcp.ops` (admin) en plus de `mcp.use`, et réglage `mcp.ops_enabled` (drapeau `ops`).
 *
 * Exception assumée à la règle « écritures par le pont API » : ces opérations n'ont pas de
 * route (ou une route protégée par le secret de déploiement) ; l'outil appelle donc les
 * fonctions de `lib/` qui les portent (`lib/mcp/domains/ops.js`, `opsDump.js`), jamais du SQL
 * d'écriture ad hoc. Toutes les actions qui agissent sont `write: true` (portée
 * `foretmap.write`, confirmation selon `mcp.confirm_mode`) et journalisées
 * (`mcp_ops_<action>`, `via: 'mcp'`).
 */

const { z } = require('zod');
const { defineDomainTool, req } = require('./factory');
const ops = require('../../domains/ops');

const TOOL = 'foretmap_ops';

const retentionOnly = z
  .array(z.enum(['desactivations', 'eleves', 'personnels', 'journaux', 'ip', 'mcp_exports']))
  .min(1)
  .max(10)
  .describe('Catégories à traiter (défaut : toutes)');

/** Journal d'audit d'une opération (le contexte MCP ajoute `via: 'mcp'`). */
async function audit(ctx, action, details, payload) {
  const { logAudit } = require('../../../auditLog');
  await logAudit(`mcp_ops_${action}`, 'system', action, details, {
    actorUserType: ctx?.user?.userType || 'teacher',
    actorUserId: String(ctx?.user?.userId || ''),
    payload: { tool: TOOL, ...payload },
  });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'ops',
  title: 'Exploitation (admin) : tâches planifiées, migrations, sauvegarde…',
  intro:
    'Exploitation du serveur (administrateurs, permission mcp.ops) : lancer tout de suite une tâche planifiée quotidienne, appliquer les migrations en attente, demander un redémarrage, produire une sauvegarde de la base (complète, anonymisée ou structure seule, lien signé d’une heure), relevé du stockage (volumes, médias orphelins, cache du relais d’images), état du déploiement, purge de conservation (simulation ou réelle) et vidage des caches.',
  requires: { permission: ['mcp.use', 'mcp.ops'], flag: 'ops' },
  actions: {
    cron_jobs: {
      summary: 'tâches planifiées quotidiennes lançables (nom, libellé)',
      run: () => ({ jobs: ops.listCronJobs() }),
    },
    run_cron: {
      summary:
        'lancer une tâche quotidienne tout de suite (recurring_tasks, auto_archive, notifications_purge, task_deadline_reminders, rewards_evaluate)',
      write: true,
      params: {
        job: req(
          z
            .enum([
              'recurring_tasks',
              'auto_archive',
              'notifications_purge',
              'task_deadline_reminders',
              'rewards_evaluate',
            ])
            .describe('Tâche planifiée'),
        ),
      },
      run: async (args, ctx) => {
        const out = await ops.runCron(args.job);
        await audit(ctx, 'run_cron', `Tâche ${args.job} lancée`, { job: args.job });
        return out;
      },
    },
    migrate: {
      summary:
        'appliquer les migrations en attente (comme npm run db:migrate) ; dry_run : état seulement',
      write: true,
      params: { dry_run: z.boolean().describe('Montrer les migrations en attente sans appliquer') },
      run: async (args, ctx) => {
        const out = await ops.migrate({ dryRun: !!args.dry_run });
        if (out.ran) {
          await audit(ctx, 'migrate', `Migrations ${out.before.current} → ${out.after.current}`, {
            applied: out.applied,
          });
        }
        return out;
      },
    },
    restart: {
      summary: 'redémarrer l’application (touche tmp/restart.txt, pris en compte par Passenger)',
      write: true,
      run: async (_args, ctx) => {
        const out = ops.restart();
        await audit(ctx, 'restart', 'Redémarrage demandé (tmp/restart.txt)', {});
        return out;
      },
    },
    dump: {
      summary:
        'sauvegarde SQL : full (tout, secrets compris), anonymized (élèves pseudonymisés, secrets vidés) ou structure (DDL) ; lien signé d’une heure',
      write: true,
      params: {
        kind: req(z.enum(['full', 'anonymized', 'structure']).describe('Nature de la sauvegarde')),
        engine: z
          .enum(['auto', 'node'])
          .describe('auto : mysqldump s’il est installé, sinon Node ; node : Node pur'),
      },
      run: async (args, ctx) => {
        const { writeDump } = require('../../domains/opsDump');
        const out = await writeDump({ kind: args.kind, engine: args.engine, baseUrl: ctx.baseUrl });
        await audit(ctx, 'dump', `Sauvegarde ${args.kind} (${out.engine})`, {
          kind: args.kind,
          engine: out.engine,
          bytes: out.bytes,
          file: out.file,
        });
        return out;
      },
    },
    storage_report: {
      summary: 'volumes de uploads/, médias orphelins (simulation), cache du relais d’images',
      params: {
        orphans_preview: z.number().int().min(0).max(500).describe('Orphelins listés (défaut 50)'),
      },
      run: (args) => ops.storageReport({ orphansPreview: args.orphans_preview ?? 50 }),
    },
    deploy_status: {
      summary: 'version, révision déployée (Git, build), migrations en attente, redémarrages',
      run: () => ops.deployStatus(),
    },
    retention_preview: {
      summary:
        'simulation de la purge de conservation (comptages par catégorie, rien supprimé ; une ligne au journal de purge)',
      params: { only: retentionOnly },
      run: (args) => ops.retention({ apply: false, only: args.only }),
    },
    retention_run: {
      summary:
        'purge de conservation réelle — exige RETENTION_PURGE_APPLY=1 dans l’environnement du serveur',
      write: true,
      params: { only: retentionOnly },
      run: async (args, ctx) => {
        const out = await ops.retention({ apply: true, only: args.only });
        await audit(ctx, 'retention_run', `Purge de conservation : ${out.outcome}`, {
          run_id: out.runId,
          outcome: out.outcome,
        });
        return out;
      },
    },
    clear_caches: {
      summary: 'vider les caches mémoire (réglages, cartes, espèces, tutoriels, accès…)',
      write: true,
      run: async (_args, ctx) => {
        const out = ops.clearCaches();
        await audit(ctx, 'clear_caches', 'Caches vidés', { cleared: out.cleared.length });
        return out;
      },
    },
  },
});

function buildOpsTool() {
  return tool;
}

module.exports = { buildOpsTool };
