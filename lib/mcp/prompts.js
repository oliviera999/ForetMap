'use strict';

/**
 * Prompts MCP (`prompts/list`, lot F) : parcours fréquents qui enchaînent les outils de domaine.
 * Chaque prompt renvoie un message utilisateur qui décrit les étapes ; Claude appelle ensuite
 * les outils (avec les droits de la personne connectée). Les arguments sont facultatifs.
 *
 * Mémoire : `seedStableNotes()` sème une fois, de façon idempotente, la note de site
 * « écritures métier par les outils de domaine ».
 */

const { z } = require('zod');

const optText = (desc) => z.string().max(200).optional().describe(desc);

/** Définitions : nom, titre, description, arguments, texte construit à partir des arguments. */
const PROMPTS = Object.freeze([
  {
    name: 'bilan_taches_periode',
    title: 'Bilan des tâches de la période',
    description: 'Bilan chiffré et commenté des tâches sur une période (par carte et projet).',
    args: {
      from: optText('Début de période (AAAA-MM-JJ)'),
      to: optText('Fin de période (AAAA-MM-JJ)'),
      map_id: optText('Carte (facultatif)'),
    },
    text: (a) =>
      [
        `Fais le bilan des tâches${a.from ? ` du ${a.from}` : ''}${a.to ? ` au ${a.to}` : ''}${a.map_id ? ` sur la carte ${a.map_id}` : ''}.`,
        '1. foretmap_tasks action=stats (from, to, map_id) : volumes par statut, carte, projet, mois ; délai de validation ; retard ; remplissage ; abandon.',
        '2. foretmap_task_projects action=list puis action=get sur les projets actifs : avancement.',
        '3. foretmap_tasks action=overdue et action=to_validate : points d’attention.',
        'Rends un bilan court : chiffres clés, tendances, trois actions proposées. Aucune donnée nominative sauf demande explicite.',
      ].join('\n'),
  },
  {
    name: 'taches_a_valider_et_en_retard',
    title: 'Tâches à valider et en retard',
    description: 'Liste priorisée des tâches à valider et des tâches en retard, avec actions.',
    args: { map_id: optText('Carte (facultatif)') },
    text: (a) =>
      [
        `Prépare la liste de travail du jour${a.map_id ? ` pour la carte ${a.map_id}` : ''}.`,
        '1. foretmap_tasks action=to_validate : tâches faites à valider.',
        '2. foretmap_tasks action=overdue : tâches en retard.',
        '3. Pour chaque tâche, foretmap_tasks action=get si un détail est utile.',
        'Présente deux tableaux (à valider, en retard) et propose une action par ligne (valider, relancer, replanifier, archiver). N’écris rien sans accord explicite : valider se fait avec foretmap_tasks action=validate.',
      ].join('\n'),
  },
  {
    name: 'bilan_classe',
    title: 'Bilan d’une classe',
    description: 'Bilan d’un groupe : tâches, quiz par notion, tutoriels, élèves inactifs.',
    args: { group_id: optText('Groupe (classe)') },
    text: (a) =>
      [
        `Fais le bilan de la classe${a.group_id ? ` ${a.group_id}` : ''}.`,
        '1. foretmap_groups action=get puis action=class_report.',
        '2. foretmap_quiz action=stats pour la réussite par notion.',
        '3. foretmap_students action=at_risk (si le bypass RGPD est actif) pour les élèves à suivre.',
        'Rends : points forts, notions fragiles, élèves à accompagner (seulement si le nominatif est autorisé), trois pistes pédagogiques.',
      ].join('\n'),
  },
  {
    name: 'couverture_programme',
    title: 'Couverture du programme par notion',
    description:
      'Pour chaque notion : questions, termes, tutoriels, tâches, séances ; notions orphelines.',
    args: { discipline: optText('Discipline (facultatif)') },
    text: (a) =>
      [
        `Analyse la couverture du programme${a.discipline ? ` en ${a.discipline}` : ''}.`,
        '1. foretmap_curriculum action=coverage.',
        '2. Repère les notions orphelines (aucune ressource) et les notions sur-représentées.',
        'Propose les ressources à créer en priorité (questions, tutoriels, tâches), sans rien écrire sans accord.',
      ].join('\n'),
  },
  {
    name: 'audit_corpus',
    title: 'Audit du corpus',
    description: 'Revue de la qualité du corpus pédagogique (espèces, glossaire, quiz, liens).',
    args: {},
    text: () =>
      [
        'Fais un audit du corpus pédagogique.',
        '1. foretmap_audit_all pour la revue d’ensemble.',
        '2. foretmap_audit sur les familles signalées pour le détail.',
        'Classe les constats par gravité et propose les corrections ; pour un champ de contenu, foretmap_content_change (ou plan → apply selon le réglage).',
      ].join('\n'),
  },
  {
    name: 'sante_du_site',
    title: 'Santé du site',
    description: 'État du site : santé, base, tâches planifiées, migrations, stockage, journaux.',
    args: {},
    text: () =>
      [
        'Fais le point sur la santé du site.',
        '1. foretmap_health_report (et foretmap_health_history pour la tendance).',
        '2. foretmap_ops action=deploy_status et action=storage_report (si autorisé).',
        '3. foretmap_cron_status et foretmap_tail_logs pour les erreurs récentes.',
        'Rends un état vert / orange / rouge par composant, les causes probables et les actions recommandées. N’exécute aucune action d’exploitation sans accord explicite.',
      ].join('\n'),
  },
  {
    name: 'diagnostiquer_partie_gl',
    title: 'Diagnostiquer une partie G&L',
    description:
      'Diagnostic d’une partie Gnomes & Licornes « Tenir à deux » : état, invariants, économie, journal, badges, audits du contenu.',
    args: {
      game_id: optText('Partie (gl_games.id) ; absent : choisir dans la liste'),
      class_id: optText('Classe (gl_classes.id, facultatif)'),
    },
    text: (a) =>
      [
        `Diagnostique la partie Gnomes & Licornes${a.game_id ? ` ${a.game_id}` : ''}${a.class_id ? ` (classe ${a.class_id})` : ''}.`,
        `1. gl_games action=list${a.class_id ? ` class_id=${a.class_id}` : ''} tenir=true : repérer la partie (statut, plateau, surface, tour courant) ; gl_games action=get pour ses équipes.`,
        '2. gl_game_state action=get : réglages résolus, voile, phase du tour, pages du carnet, bourses agrégées par équipe et réserves.',
        '3. gl_game_diagnostic action=get : violations d’invariants, grand livre par cause, réserves, durées des tours, compteurs.',
        '4. gl_game_journal action=list (derniers tours : round, type) : enchaînement des gestes et des évènements, libellés comme dans l’app.',
        '5. gl_rewards action=vitrine : familles × paliers par membre et « à un pas du palier » — sans classement (si les badges ne sont pas livrés : le dire).',
        '6. foretmap_audit check=gl_marker_promises, check=gl_tenir_zones, check=gl_spells_legacy : contenu joué contre les garde-fous.',
        'Rends : un état vert / orange / rouge par composant (tour, pions, voile, carnet, économie, contenu), les invariants violés, l’économie (grand livre par cause, réserves, surplus perdus ?), les textes interdits ou secrets relevés, puis les actions proposées (gl_tour, gl_settings, gl_tenir_catalogues) SANS RIEN ÉCRIRE sans accord explicite. Aucun nom d’élève : identifiants et équipes seulement, sauf bypass RGPD actif ET demande explicite (gl_game_state action=bourses_eleves).',
      ].join('\n'),
  },
]);

/** Inscrit les prompts sur un `McpServer`. */
function registerPrompts(server) {
  for (const p of PROMPTS) {
    server.registerPrompt(
      p.name,
      { title: p.title, description: p.description, argsSchema: p.args },
      (args) => ({
        description: p.description,
        messages: [{ role: 'user', content: { type: 'text', text: p.text(args || {}) } }],
      }),
    );
  }
  return PROMPTS.map((p) => p.name);
}

/** Notes de site stables semées au premier appel (idempotent : `subject_key` unique). */
const STABLE_NOTES = Object.freeze([
  {
    subject: 'Écritures métier : outils de domaine, pas de SQL',
    content:
      'Utiliser foretmap_tasks / foretmap_task_projects / les outils de domaine ou foretmap_api pour toute écriture métier (tâches, projets, inscriptions, validations) : ils appliquent la logique du site. foretmap_sql_execute est réservé aux corrections de données.',
    tags: 'conventions,ecriture',
  },
]);

let seeded = false;

async function seedStableNotes() {
  if (seeded) return;
  seeded = true;
  try {
    const { execute } = require('../../database');
    const { subjectKey } = require('./memory');
    for (const n of STABLE_NOTES) {
      await execute(
        `INSERT IGNORE INTO mcp_memory (scope, user_id, subject, subject_key, content, tags, created_by, verified_at)
         VALUES ('site', NULL, ?, ?, ?, ?, NULL, NOW())`,
        [n.subject, subjectKey('site', null, n.subject), n.content, n.tags],
      );
    }
  } catch (err) {
    seeded = false;
    require('../logger').warn(
      { err, msg: 'mcp_memory_seed_failed' },
      'Note de mémoire MCP non semée',
    );
  }
}

function resetSeedForTests() {
  seeded = false;
}

module.exports = { PROMPTS, STABLE_NOTES, registerPrompts, resetSeedForTests, seedStableNotes };
