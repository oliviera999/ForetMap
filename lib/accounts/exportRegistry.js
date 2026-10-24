'use strict';

/**
 * Registre de l'export des données personnelles (droit d'accès et de portabilité, RGPD
 * art. 15 et 20 — audit du 28/09/2026, recommandation R4).
 *
 * Même esprit que `lib/accounts/cleanerRegistry.js` : chaque domaine déclare ce qui, dans
 * ses tables, appartient à une personne. Une entrée décrit une requête **figée** (table,
 * clause, colonnes exclues) ; les noms de tables et de colonnes ne viennent jamais d'une
 * entrée utilisateur.
 *
 *   - `section`  : clé de la section dans `donnees.json` ;
 *   - `label`    : libellé lisible (repris dans le LISEZMOI) ;
 *   - `table`, `where`, `params(subject)` : la sélection ;
 *   - `exclude`  : colonnes jamais exportées (secrets : hachages, jetons, compteurs de
 *                  révocation) ;
 *   - `files(row)` : chemins relatifs sous `uploads/` à joindre à l'archive.
 *
 * Deux familles : `FORET_EXPORT_ENTRIES` (sujet = compte `users`) et `GL_EXPORT_ENTRIES`
 * (sujet = joueur G&L). L'export d'un compte ForetMap inclut la partie G&L de ses joueurs
 * liés ; l'export d'un joueur G&L reste dans son produit.
 */

const { assignmentIdentityMatch } = require('../tasks/assignmentIdentityMatch');

function pathsFromJson(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string' && p) : [];
  } catch {
    return [];
  }
}

const assignmentMatch = assignmentIdentityMatch('');
function studentRowsParams(subject) {
  return assignmentMatch.params(subject.userId, subject.firstName, subject.lastName);
}

const FORET_EXPORT_ENTRIES = Object.freeze([
  {
    section: 'compte',
    label: 'Compte (identité, profil, préférences)',
    table: 'users',
    where: 'id = ?',
    params: (s) => [s.userId],
    exclude: ['password_hash', 'token_epoch'],
    files: (row) => [row.avatar_path],
  },
  {
    section: 'profils_attribues',
    label: 'Profils (rôles) attribués',
    table: 'user_roles',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'groupes',
    label: 'Appartenance aux groupes et classes',
    table: 'group_members',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'identites_externes',
    label: 'Comptes externes liés (Moodle, LTI)',
    table: 'external_identities',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'taches_inscriptions',
    label: 'Inscriptions aux tâches',
    table: 'task_assignments',
    where: assignmentMatch.clause,
    params: studentRowsParams,
  },
  {
    section: 'taches_comptes_rendus',
    label: 'Comptes rendus de tâches (commentaires, photos)',
    table: 'task_logs',
    where: assignmentMatch.clause,
    params: studentRowsParams,
    files: (row) => [row.image_path],
  },
  {
    section: 'taches_referent',
    label: 'Tâches dont la personne est référente',
    table: 'task_referents',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'observations_especes',
    label: 'Observations d’espèces',
    table: 'species_observations',
    where: 'observer_user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'observations_especes_photos',
    label: 'Photos des observations d’espèces',
    table: 'species_observation_photos',
    where: 'observation_id IN (SELECT id FROM species_observations WHERE observer_user_id = ?)',
    params: (s) => [s.userId],
    files: (row) => [row.file_path],
  },
  {
    section: 'mesures_individus',
    label: 'Mesures d’arbres et d’individus',
    table: 'individual_measurements',
    where: 'observer_user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'carnet_ancien',
    label: 'Ancien carnet d’observations',
    table: 'observation_logs',
    where: 'student_id = ?',
    params: (s) => [s.userId],
    files: (row) => [row.image_path],
  },
  {
    section: 'carnet_articles',
    label: 'Carnet personnel : articles',
    table: 'user_journal_articles',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'carnet_pieces_jointes',
    label: 'Carnet personnel : pièces jointes',
    table: 'user_journal_article_assets',
    where: 'user_id = ?',
    params: (s) => [s.userId],
    files: (row) => [row.asset_path],
  },
  {
    section: 'carnet_imports',
    label: 'Carnet personnel : ressources importées',
    table: 'user_journal_imports',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'forum_sujets',
    label: 'Forum : sujets ouverts',
    table: 'forum_threads',
    where: 'author_user_type = ? AND author_user_id = ?',
    params: (s) => [s.userType, s.userId],
  },
  {
    section: 'forum_messages',
    label: 'Forum : messages',
    table: 'forum_posts',
    where: 'author_user_type = ? AND author_user_id = ?',
    params: (s) => [s.userType, s.userId],
    files: (row) => pathsFromJson(row.image_paths_json),
  },
  {
    section: 'forum_reactions',
    label: 'Forum : réactions',
    table: 'forum_post_reactions',
    where: 'reactor_user_type = ? AND reactor_user_id = ?',
    params: (s) => [s.userType, s.userId],
  },
  {
    section: 'forum_signalements',
    label: 'Forum : signalements envoyés',
    table: 'forum_reports',
    where: 'reporter_user_type = ? AND reporter_user_id = ?',
    params: (s) => [s.userType, s.userId],
    exclude: ['resolved_by_user_type', 'resolved_by_user_id'],
  },
  {
    section: 'commentaires',
    label: 'Commentaires sur les lieux et contenus',
    table: 'context_comments',
    where: 'author_user_type = ? AND author_user_id = ?',
    params: (s) => [s.userType, s.userId],
    files: (row) => pathsFromJson(row.image_paths_json),
  },
  {
    section: 'commentaires_reactions',
    label: 'Commentaires : réactions',
    table: 'context_comment_reactions',
    where: 'reactor_user_type = ? AND reactor_user_id = ?',
    params: (s) => [s.userType, s.userId],
  },
  {
    section: 'commentaires_signalements',
    label: 'Commentaires : signalements envoyés',
    table: 'context_comment_reports',
    where: 'reporter_user_type = ? AND reporter_user_id = ?',
    params: (s) => [s.userType, s.userId],
  },
  {
    section: 'quiz_reponses',
    label: 'Réponses aux quiz',
    table: 'user_quiz_attempts',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'apprentissages',
    label: 'Notions marquées comme apprises',
    table: 'learning_acknowledgements',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'tutoriels_lus',
    label: 'Tutoriels lus',
    table: 'user_tutorial_reads',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'plantes_observees',
    label: 'Plantes observées',
    table: 'user_plant_observation_events',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'verrous_ressources',
    label: 'Délais d’attente après une mauvaise réponse',
    table: 'resource_gating_cooldowns',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'visite_parcours',
    label: 'Visite : étapes vues',
    table: 'visit_seen_students',
    where: 'student_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'sessions_pedagogiques',
    label: 'Sessions pédagogiques suivies',
    table: 'pedago_session_runs',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'recompenses',
    label: 'Récompenses obtenues',
    table: 'user_rewards',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'notifications',
    label: 'Notifications reçues',
    table: 'notifications',
    where: 'user_id = ?',
    params: (s) => [s.userId],
    exclude: ['dedupe_key'],
  },
  {
    section: 'activite',
    label: 'Journal d’activité (connexions, ouvertures)',
    table: 'user_activity_events',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'visites_applications',
    label: 'Ouvertures des applications',
    table: 'user_product_visits',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'evenements_securite',
    label: 'Événements de sécurité (dont adresse IP et navigateur)',
    table: 'security_events',
    where: 'actor_user_id = ?',
    params: (s) => [s.userId],
  },
  // --- Compléments RG5 (audit RGPD du 30/09/2026) -------------------------------------------
  // `elevation_audit` (ancien mode PIN) n'est pas déclarée : supprimée par la migration 164 et
  // au démarrage (`lib/legacySchemaCleanup.js`). `user_plant_discoveries` et
  // `gl_tutorial_reads`, cités par l'audit, ont été fondues dans `user_plant_observation_events`
  // (section `plantes_observees`) et `gl_learning_acknowledgements` (`gl_apprentissages`).
  {
    section: 'journal_audit_actions',
    label: 'Journal d’audit : actions faites par la personne',
    table: 'audit_log',
    where: 'actor_user_id = ?',
    params: (s) => [s.userId],
    // Le libellé et le détail d'une action d'administration nomment souvent un TIERS (élève
    // créé, dupliqué…) : l'export garde l'action, sa cible et sa date (RGPD art. 15-4).
    exclude: ['details', 'payload_json'],
  },
  {
    section: 'groupes_externes',
    label: 'Appartenance aux groupes synchronisés (Moodle)',
    table: 'external_group_members',
    where: 'user_id = ?',
    params: (s) => [s.userId],
  },
  {
    section: 'synchro_conflits',
    label: 'Synchronisation Moodle : écarts relevés sur le compte',
    table: 'sync_conflicts',
    where: 'user_id = ?',
    params: (s) => [s.userId],
    // L'administrateur qui a tranché n'est pas une donnée de la personne.
    exclude: ['resolved_by_user_id'],
  },
  {
    section: 'synchro_rapprochements',
    label: 'Synchronisation Moodle : fiche reçue et rapprochement du compte',
    table: 'sync_pending_matches',
    where: 'resolved_user_id = ?',
    params: (s) => [s.userId],
    // `candidates_json` décrit d'AUTRES comptes (homonymes candidats) : jamais exporté.
    exclude: ['candidates_json', 'resolved_by_user_id'],
  },
]);

const GL_EXPORT_ENTRIES = Object.freeze([
  {
    section: 'gl_joueur',
    label: 'G&L : fiche joueur',
    table: 'gl_players',
    where: 'id = ?',
    params: (p) => [p.playerId],
    exclude: ['legacy_password_hash'],
    files: (row) => [row.avatar_path],
  },
  {
    section: 'gl_equipes',
    label: 'G&L : appartenance aux équipes',
    table: 'gl_team_members',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_journal_articles',
    label: 'G&L : journal du joueur, articles',
    table: 'gl_player_journal_articles',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_journal_pieces_jointes',
    label: 'G&L : journal du joueur, pièces jointes',
    table: 'gl_player_journal_article_assets',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
    files: (row) => [row.asset_path],
  },
  {
    section: 'gl_journal_imports',
    label: 'G&L : journal du joueur, ressources importées',
    table: 'gl_player_journal_imports',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_feuillets',
    label: 'G&L : feuillets détenus',
    table: 'gl_player_feuillet_states',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_voyageur_sortileges',
    label: 'G&L : sortilèges du voyageur (charges consommées)',
    table: 'gl_voyageur_spell_uses',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_sorts_contributions',
    label: 'G&L : contributions aux sortilèges',
    table: 'gl_spell_cast_contributions',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_marche_echanges',
    label: 'G&L : participations aux échanges du marché',
    table: 'gl_market_trade_sides',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_marche_messages',
    label: 'G&L : messages du marché',
    table: 'gl_market_trade_messages',
    where: 'author_player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_forum_sujets',
    label: 'G&L : forum, sujets ouverts',
    table: 'gl_forum_threads',
    where: "author_user_type = 'gl_player' AND author_user_id = ?",
    params: (p) => [String(p.playerId)],
  },
  {
    section: 'gl_forum_messages',
    label: 'G&L : forum, messages',
    table: 'gl_forum_posts',
    where: "author_user_type = 'gl_player' AND author_user_id = ?",
    params: (p) => [String(p.playerId)],
    files: (row) => pathsFromJson(row.image_paths_json),
  },
  {
    section: 'gl_forum_reactions',
    label: 'G&L : forum, réactions',
    table: 'gl_forum_post_reactions',
    where: "reactor_user_type = 'gl_player' AND reactor_user_id = ?",
    params: (p) => [String(p.playerId)],
  },
  {
    section: 'gl_forum_signalements',
    label: 'G&L : forum, signalements envoyés',
    table: 'gl_forum_reports',
    where: "reporter_user_type = 'gl_player' AND reporter_user_id = ?",
    params: (p) => [String(p.playerId)],
    exclude: ['resolved_by_user_type', 'resolved_by_user_id'],
  },
  {
    section: 'gl_qcm_reponses',
    label: 'G&L : réponses aux QCM',
    table: 'gl_qcm_attempts',
    where: "reader_user_type = 'gl_player' AND reader_user_id = ?",
    params: (p) => [String(p.playerId)],
  },
  {
    section: 'gl_apprentissages',
    label: 'G&L : notions marquées comme apprises',
    table: 'gl_learning_acknowledgements',
    where: "reader_user_type = 'gl_player' AND reader_user_id = ?",
    params: (p) => [String(p.playerId)],
  },
  {
    section: 'gl_verrous_ressources',
    label: 'G&L : délais d’attente après une mauvaise réponse',
    table: 'gl_resource_gating_cooldowns',
    where: "reader_user_type = 'gl_player' AND reader_user_id = ?",
    params: (p) => [String(p.playerId)],
  },
  // --- Compléments RG5 (audit RGPD du 30/09/2026) -------------------------------------------
  {
    section: 'gl_marche_transactions',
    label: 'G&L : échanges du marché (en-têtes)',
    table: 'gl_market_trades',
    where: 'player_low_id = ? OR player_high_id = ? OR initiator_player_id = ?',
    params: (p) => [p.playerId, p.playerId, p.playerId],
  },
  {
    section: 'gl_marche_feuillets_proposes',
    label: 'G&L : feuillets proposés dans les échanges du marché',
    table: 'gl_market_trade_side_feuillets',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_parties_evenements',
    label: 'G&L : événements de partie dont le joueur est l’auteur',
    table: 'gl_game_events',
    where: "actor_type = 'team' AND actor_id = ?",
    params: (p) => [String(p.playerId)],
  },
  {
    section: 'gl_demandes_action',
    label: 'G&L : demandes d’action envoyées au MJ',
    table: 'gl_action_requests',
    where: 'player_id = ?',
    params: (p) => [p.playerId],
  },
  {
    section: 'gl_sorts_brouillons',
    label: 'G&L : sortilèges préparés ou lancés par le joueur',
    table: 'gl_spell_cast_drafts',
    where: 'created_by_player_id = ? OR launched_by_player_id = ?',
    params: (p) => [p.playerId, p.playerId],
  },
]);

/** Colonnes jamais exportées, quelle que soit la table (garde-fou en plus des `exclude`). */
const GLOBAL_SECRET_COLUMNS = Object.freeze([
  'password_hash',
  'legacy_password_hash',
  'pin_hash',
  'token_hash',
  'token_epoch',
]);

module.exports = {
  FORET_EXPORT_ENTRIES,
  GL_EXPORT_ENTRIES,
  GLOBAL_SECRET_COLUMNS,
  pathsFromJson,
};
