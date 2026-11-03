'use strict';

/**
 * Outils MCP d'exploitation : mémoire du connecteur, rapport de santé, consultation des
 * fichiers du serveur et des tâches planifiées. Fonctions d'**observation** : aucune ne
 * modifie le contenu ni la configuration du site (la mémoire n'écrit que dans `mcp_memory`).
 *
 * | Outil                      | Portée / permission                          |
 * | -------------------------- | -------------------------------------------- |
 * | `foretmap_recall`          | read + `mcp.use`                             |
 * | `foretmap_remember`        | read + `mcp.use` (une note de site existante : auteur ou admin) |
 * | `foretmap_forget`          | read + `mcp.use` (auteur ou admin)           |
 * | `foretmap_health_report`   | read + `admin.settings.read`                 |
 * | `foretmap_health_history`  | read + `admin.settings.read`                 |
 * | `foretmap_list_files`      | read + `mcp.write` (admin)                   |
 * | `foretmap_read_file`       | read + `mcp.write` (admin)                   |
 * | `foretmap_grep_files`      | read + `mcp.write` (admin)                   |
 * | `foretmap_cron_status`     | read + `mcp.write` (admin)                   |
 *
 * Fichiers : `mcp.write` est la permission la plus stricte existante (admin seulement, comme
 * `admin.settings.secrets.write`) ; la portée `foretmap.read` suffit — lire un fichier n'écrit
 * rien. Le drapeau `MCP_FILES_ENABLED=false` retire ces quatre outils pour tous.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');
const { READ_ONLY } = require('./common');

const MEMORY_REQUIRES = Object.freeze({ scope: SCOPES.READ, permission: 'mcp.use' });
const HEALTH_REQUIRES = Object.freeze({
  scope: SCOPES.READ,
  permission: ['mcp.use', 'admin.settings.read'],
});
const FILES_REQUIRES = Object.freeze({
  scope: SCOPES.READ,
  permission: ['mcp.use', 'mcp.write'],
  flag: 'files',
});

const WRITE_MEMORY = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const rootName = z
  .string()
  .min(1)
  .max(32)
  .describe('Racine (foretmap_list_files sans argument pour la liste)');
const relPath = z.string().max(500).optional().describe('Chemin relatif à la racine');

function memoryUser(ctx) {
  return { userId: ctx.user?.userId, permissions: ctx.access?.permissions || [] };
}

function buildOpsTools() {
  const memory = () => require('../memory');
  return [
    {
      name: 'foretmap_recall',
      title: 'Consulter la mémoire du connecteur',
      description:
        'À APPELER EN DÉBUT DE TÂCHE. Cherche dans la mémoire persistante du connecteur (notes stables : conventions du dépôt, pièges connus, décisions) par mots du sujet, du texte ou des étiquettes. Sans `query`, renvoie les notes les plus récentes. Une note marquée stale (« à revérifier ») doit être contrôlée avant d’être utilisée, puis réécrite avec foretmap_remember pour la marquer vérifiée.',
      inputSchema: z.strictObject({
        query: z.string().max(200).optional().describe('Mots recherchés (tous requis)'),
        tags: z.array(z.string().max(40)).max(8).optional().describe('Étiquettes exigées'),
        stale_only: z.boolean().optional().describe('Seulement les notes à revérifier'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READ_ONLY,
      requires: MEMORY_REQUIRES,
      handler: (args, ctx) => memory().recall(args, memoryUser(ctx)),
    },
    {
      name: 'foretmap_remember',
      title: 'Enregistrer une note de mémoire',
      description:
        'Enregistre une information STABLE et utile aux prochaines tâches (convention, emplacement, piège, décision), pas un état passager. Même sujet = mise à jour de la note. Portée `site` (défaut, partagée avec les autres comptes du connecteur) ou `user` (personnelle). Contenu de 4 000 caractères au plus ; refusé s’il ressemble à un secret (mot de passe, jeton, clé, hachage) ou contient une adresse e-mail. Ne jamais y mettre de donnée d’élève.',
      inputSchema: z.strictObject({
        subject: z.string().min(1).max(200).describe('Sujet court, clé de mise à jour'),
        content: z.string().min(1).max(4000),
        tags: z.array(z.string().max(40)).max(12).optional(),
        scope: z.enum(['site', 'user']).optional(),
      }),
      annotations: WRITE_MEMORY,
      requires: MEMORY_REQUIRES,
      handler: (args, ctx) => memory().remember(args, memoryUser(ctx)),
    },
    {
      name: 'foretmap_forget',
      title: 'Oublier une note de mémoire',
      description:
        'Supprime une note de mémoire devenue fausse ou inutile (identifiant renvoyé par foretmap_recall). Réservé à l’auteur de la note ou à un administrateur.',
      inputSchema: z.strictObject({ id: z.number().int().positive() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      requires: MEMORY_REQUIRES,
      handler: (args, ctx) => memory().forget(args, memoryUser(ctx)),
    },
    {
      name: 'foretmap_health_report',
      title: 'Rapport de santé du site (admin)',
      description:
        'Construit un rapport de santé structuré avec un statut global vert / orange / rouge selon des règles explicites (renvoyées dans `thresholds`) : version, uptime, mémoire, Node ; base (latence, migrations en retard, plus grosses tables) ; réponses 5xx et 429 sur 24 h et 7 j ; redémarrages ; tâches planifiées ; disque et dossier uploads ; jours avant expiration des certificats TLS ; connexions MCP actives ; résumé des audits du corpus. `store: true` l’ajoute à l’historique (foretmap_health_history).',
      inputSchema: z.strictObject({
        store: z.boolean().optional().describe('Enregistrer le rapport dans l’historique'),
        skip_tls: z.boolean().optional().describe('Ne pas contrôler les certificats'),
        skip_audit: z.boolean().optional().describe('Ne pas lancer les audits du corpus'),
      }),
      annotations: { ...READ_ONLY, idempotentHint: false, openWorldHint: true },
      requires: HEALTH_REQUIRES,
      handler: async (args) => {
        const { buildHealthReport } = require('../health/collect');
        const report = await buildHealthReport({
          skipTls: !!args.skip_tls,
          skipAudit: !!args.skip_audit,
        });
        if (args.store) {
          const { storeReport } = require('../health/store');
          report.stored = await storeReport(report, 'tool');
        }
        return report;
      },
    },
    {
      name: 'foretmap_health_history',
      title: 'Historique des rapports de santé (admin)',
      description:
        'Derniers rapports de santé stockés (tâche quotidienne et appels avec store) et évolution du statut : nombre par statut, changements, série en cours. `id` renvoie un rapport complet.',
      inputSchema: z.strictObject({
        days: z.number().int().min(1).max(730).optional().describe('Fenêtre (défaut 30 j)'),
        limit: z.number().int().min(1).max(200).optional(),
        id: z.number().int().positive().optional().describe('Rapport complet à relire'),
      }),
      annotations: READ_ONLY,
      requires: HEALTH_REQUIRES,
      handler: async (args) => {
        const store = require('../health/store');
        if (args.id) {
          const r = await store.getReport(args.id);
          if (!r) {
            const { McpToolError } = require('../registry');
            throw new McpToolError('Rapport introuvable', 'MCP_NOT_FOUND');
          }
          return r;
        }
        return store.listReports({ days: args.days, limit: args.limit });
      },
    },
    {
      name: 'foretmap_list_files',
      title: 'Lister les fichiers du serveur (admin)',
      description:
        'Sans argument : racines consultables (journaux de la crontab, startup.log, stderr Passenger, tampon Pino, .cpanel.yml, scripts/, docs/, migrations/ ; configurable par MCP_FILE_ROOTS). Avec `root` (et `path`) : contenu d’un dossier (taille, date). Lecture seule.',
      inputSchema: z.strictObject({
        root: rootName.optional(),
        path: relPath,
        recursive: z.boolean().optional().describe('Sous-dossiers (4 niveaux, 500 entrées)'),
      }),
      annotations: READ_ONLY,
      requires: FILES_REQUIRES,
      handler: (args) => require('../files/read').listFiles(args),
    },
    {
      name: 'foretmap_read_file',
      title: 'Lire un fichier du serveur (admin)',
      description:
        'Lit un fichier texte d’une racine : `offset` (1re ligne, défaut 1) et `limit` (≤ 500), ou `tail` (N dernières lignes, pour un journal). Binaires refusés. Secrets reconnaissables masqués ; .env et fichiers apparentés : noms de variables seulement (CLE=****) ; fichiers de clés : jamais transmis. root « pino » : tampon Pino en mémoire.',
      inputSchema: z.strictObject({
        root: rootName,
        path: relPath,
        offset: z.number().int().min(1).max(10_000_000).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        tail: z.number().int().min(1).max(500).optional(),
      }),
      annotations: READ_ONLY,
      requires: FILES_REQUIRES,
      handler: (args) => require('../files/read').readFile(args),
    },
    {
      name: 'foretmap_grep_files',
      title: 'Chercher dans les fichiers du serveur (admin)',
      description:
        'Cherche un motif (texte, ou expression régulière simple avec `regex: true`, 200 caractères au plus) dans les fichiers texte d’une racine, récursivement ; `glob` filtre les noms (ex. *.log). Au plus 300 fichiers parcourus, 200 résultats, 3 s ; lignes renvoyées déjà nettoyées (secrets masqués). Binaires, clés et .env exclus.',
      inputSchema: z.strictObject({
        root: rootName,
        path: relPath,
        pattern: z.string().min(1).max(200),
        regex: z.boolean().optional(),
        ignore_case: z.boolean().optional().describe('Défaut : vrai'),
        glob: z.string().max(60).optional(),
        max_results: z.number().int().min(1).max(200).optional(),
      }),
      annotations: READ_ONLY,
      requires: FILES_REQUIRES,
      handler: (args) => require('../files/read').grepFiles(args),
    },
    {
      name: 'foretmap_cron_status',
      title: 'État des tâches planifiées (admin)',
      description:
        'Dernière exécution, issue et retard de chaque tâche planifiée connue : jobs quotidiens du serveur (tâches récurrentes, archivage, purge des notifications, rappels), rapport de santé, purge de conservation, déploiement, sauvegarde, sonde de disponibilité, Moodle, fichiers orphelins. Lit les traces existantes (tables, journaux logs/*.log) ; la crontab elle-même seulement si MCP_CRON_READ_CRONTAB=true.',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: FILES_REQUIRES,
      handler: () => require('../files/cron').getCronStatus(),
    },
  ];
}

module.exports = { FILES_REQUIRES, HEALTH_REQUIRES, MEMORY_REQUIRES, buildOpsTools };
