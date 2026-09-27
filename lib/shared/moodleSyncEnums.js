/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/moodleSyncEnums.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — domaine **synchronisation Moodle** (groupes externes,
 * identités, exécutions, conflits). Voir `enumCore.js`.
 *
 * Les libellés ne nomment jamais le logiciel : « côté application » plutôt que sa marque,
 * qui passe par `lib/brand.js` / `src/shared/brand/brandNames.js`.
 *
 * Miroir CJS : `lib/shared/moodleSyncEnums.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Nature d'un groupe externe. */
const EXTERNAL_GROUP_KIND_ENUM = defineEnum('EXTERNAL_GROUP_KIND_ENUM', {
  values: ['cohort', 'course_group'],
  labels: { cohort: 'Cohorte', course_group: 'Groupe de cours' },
  columns: ['external_groups.kind'],
});

/** Côté qui fait foi pour un groupe externe. */
const EXTERNAL_GROUP_MASTER_ENUM = defineEnum('EXTERNAL_GROUP_MASTER_ENUM', {
  values: ['moodle', 'foretmap'],
  labels: { moodle: 'Moodle', foretmap: 'Application' },
  columns: ['external_groups.master'],
});

/** Provenance d'un membre de groupe externe. */
const EXTERNAL_MEMBER_SOURCE_ENUM = defineEnum('EXTERNAL_MEMBER_SOURCE_ENUM', {
  values: ['sync', 'manual'],
  labels: { sync: 'Synchronisation', manual: 'Ajout manuel' },
  columns: ['external_group_members.source'],
});

/** Origine d'une identité externe : compte créé par la synchro ou compte existant rapproché. */
const EXTERNAL_IDENTITY_ORIGIN_ENUM = defineEnum('EXTERNAL_IDENTITY_ORIGIN_ENUM', {
  values: ['created', 'linked'],
  labels: { created: 'Compte créé', linked: 'Compte rapproché' },
  columns: ['external_identities.origin'],
});

/**
 * Nature d'un conflit de synchronisation. `both_changed` n'est jamais écrit (valeur morte,
 * audit du 25/09/2026, § 3.5) ; il reste tant que l'ENUM SQL le porte.
 */
const SYNC_CONFLICT_KIND_ENUM = defineEnum('SYNC_CONFLICT_KIND_ENUM', {
  values: ['member_added_on_mirror', 'member_removed_on_mirror', 'both_changed', 'name_changed'],
  labels: {
    member_added_on_mirror: 'Ajouté côté application, absent de Moodle',
    member_removed_on_mirror: 'Retiré côté application, toujours dans Moodle',
    both_changed: 'Modifié des deux côtés',
    name_changed: 'Nom du groupe modifié des deux côtés',
  },
  columns: ['sync_conflicts.kind'],
});

/** Décision prise sur un conflit. */
const SYNC_CONFLICT_RESOLUTION_ENUM = defineEnum('SYNC_CONFLICT_RESOLUTION_ENUM', {
  values: ['keep_master', 'apply_other', 'ignore'],
  labels: {
    keep_master: 'Garder Moodle',
    apply_other: 'Appliquer le côté application',
    ignore: 'Ignorer (accepter la divergence)',
  },
  columns: ['sync_conflicts.resolution'],
});

/** Décision prise sur un membre Moodle sans compte rapproché. */
const SYNC_PENDING_RESOLUTION_ENUM = defineEnum('SYNC_PENDING_RESOLUTION_ENUM', {
  values: ['link', 'create', 'ignore'],
  labels: {
    link: 'Rapprocher au compte choisi',
    create: 'Créer un nouveau compte',
    ignore: 'Ignorer ce membre',
  },
  columns: ['sync_pending_matches.resolution'],
});

/** Mode d'une exécution de synchronisation. */
const SYNC_RUN_MODE_ENUM = defineEnum('SYNC_RUN_MODE_ENUM', {
  values: ['dry_run', 'apply'],
  labels: { dry_run: 'Simulation', apply: 'Application' },
  columns: ['sync_runs.mode'],
});

/** État d'une exécution de synchronisation. */
const SYNC_RUN_STATUS_ENUM = defineEnum('SYNC_RUN_STATUS_ENUM', {
  values: ['running', 'succeeded', 'failed', 'aborted', 'undone'],
  labels: {
    running: 'En cours',
    succeeded: 'Terminée',
    failed: 'Échouée',
    aborted: 'Interrompue (seuil)',
    undone: 'Annulée',
  },
  columns: ['sync_runs.status'],
});

module.exports = {
  EXTERNAL_GROUP_KIND_ENUM,
  EXTERNAL_GROUP_MASTER_ENUM,
  EXTERNAL_MEMBER_SOURCE_ENUM,
  EXTERNAL_IDENTITY_ORIGIN_ENUM,
  SYNC_CONFLICT_KIND_ENUM,
  SYNC_CONFLICT_RESOLUTION_ENUM,
  SYNC_PENDING_RESOLUTION_ENUM,
  SYNC_RUN_MODE_ENUM,
  SYNC_RUN_STATUS_ENUM,
};
