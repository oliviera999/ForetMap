/**
 * Métadonnées d'affichage des réglages admin — extraites de `settings-admin-views.jsx` (O6).
 *
 * `SECTION_DEFS` : sections de la grille de paramètres (titre + ordre d'affichage).
 * `KEY_META` : libellé (statique ou dynamique selon la terminologie des rôles), section et ordre
 * de chaque clé connue ; les clés absentes retombent sur l'inférence par préfixe + humanisation.
 */

export const SECTION_DEFS = {
  auth: { title: 'Accueil & authentification', order: 10 },
  modules: { title: 'Modules UI', order: 20 },
  content: { title: 'Contenus du site', order: 22 },
  tasks: { title: 'Tâches & inscriptions n3beurs', order: 23 },
  progression: { title: 'Progression n3beurs', order: 25 },
  security: { title: 'Sécurité', order: 30 },
  operations: { title: 'Exploitation', order: 40 },
  other: { title: 'Autres paramètres', order: 90 },
};

export const KEY_META = {
  'ui.auth.allow_register': { label: 'Afficher "Créer un compte"', section: 'auth', order: 10 },
  'ui.auth.allow_google_student': { section: 'auth', order: 20, dynamicLabel: 'googleStudent' },
  'ui.auth.allow_google_teacher': { section: 'auth', order: 30, dynamicLabel: 'googleTeacher' },
  'ui.auth.allow_guest_visit': {
    label: 'Afficher "Visiter sans compte"',
    section: 'auth',
    order: 40,
  },
  'ui.auth.default_mode': { label: 'Mode auth par défaut', section: 'auth', order: 50 },
  'ui.auth.welcome_message': {
    label: 'Message d’accueil',
    section: 'auth',
    order: 60,
    multiline: true,
  },
  'content.auth.title': { label: 'Titre écran de connexion', section: 'content', order: 10 },
  'content.auth.subtitle': {
    label: 'Sous-titre écran de connexion',
    section: 'content',
    order: 20,
    multiline: true,
  },
  'content.auth.login_tab': { label: 'Texte onglet connexion', section: 'content', order: 30 },
  'content.auth.register_tab': {
    label: 'Texte onglet création de compte',
    section: 'content',
    order: 40,
  },
  'content.auth.guest_visit_cta': {
    label: 'Bouton visite sans compte',
    section: 'content',
    order: 50,
  },
  'content.app.loader': { label: 'Message global de chargement', section: 'content', order: 60 },
  'content.app.server_down_notice': {
    label: 'Message serveur indisponible',
    section: 'content',
    order: 70,
    multiline: true,
  },
  'content.app.retry_now': { label: 'Bouton réessayer', section: 'content', order: 80 },
  'content.app.footer_version_prefix': {
    label: 'Préfixe version footer',
    section: 'content',
    order: 90,
  },
  'content.visit.title': { label: 'Titre page visite', section: 'content', order: 100 },
  'content.visit.subtitle': {
    label: 'Sous-titre page visite',
    section: 'content',
    order: 110,
    multiline: true,
  },
  'content.visit.empty_selection': {
    label: 'Texte zone non sélectionnée',
    section: 'content',
    order: 120,
    multiline: true,
  },
  'content.visit.tutorials_title': {
    label: 'Titre bloc tutoriels visite',
    section: 'content',
    order: 130,
  },
  'content.visit.tutorials_empty': {
    label: 'Texte tutoriels vides',
    section: 'content',
    order: 140,
    multiline: true,
  },
  'content.about.title': { label: 'Titre page à propos', section: 'content', order: 150 },
  'content.about.subtitle': {
    label: 'Sous-titre page à propos',
    section: 'content',
    order: 160,
    multiline: true,
  },
  'content.about.purpose_title': {
    label: 'Titre carte objet de l’application',
    section: 'content',
    order: 170,
  },
  'content.about.purpose_body': {
    label: 'Texte objet de l’application',
    section: 'content',
    order: 180,
    multiline: true,
  },
  'content.about.docs_title': {
    label: 'Titre carte documentation',
    section: 'content',
    order: 190,
  },
  'content.about.help_title': {
    label: 'Titre carte aide contextuelle',
    section: 'content',
    order: 210,
  },
  'content.about.help_body': {
    label: 'Texte aide contextuelle',
    section: 'content',
    order: 220,
    multiline: true,
  },
  'content.about.help_reenable_cta': {
    label: 'Bouton réactiver aides',
    section: 'content',
    order: 230,
  },
  'content.about.help_reset_metrics_cta': {
    label: 'Bouton reset compteurs aide',
    section: 'content',
    order: 240,
  },
  'content.help.hint_prefix': {
    label: 'Préfixe mini-astuce contextuelle',
    section: 'content',
    order: 245,
  },
  'content.help.panel_title_prefix': {
    label: 'Préfixe titre panneau aide (?)',
    section: 'content',
    order: 246,
  },
  'content.help.panel_close_cta': {
    label: 'Bouton fermer panneau aide (?)',
    section: 'content',
    order: 247,
  },
  'content.help.panel_dismiss_cta': {
    label: 'Bouton masquer panneau aide (?)',
    section: 'content',
    order: 248,
  },
  'content.help.map_quick_tip': {
    label: 'Mini-astuce carte',
    section: 'content',
    order: 249,
    multiline: true,
  },
  'content.help.tasks_quick_tip': {
    label: 'Mini-astuce tâches',
    section: 'content',
    order: 250,
    multiline: true,
  },
  'content.help.visit_quick_tip': {
    label: 'Mini-astuce visite',
    section: 'content',
    order: 251,
    multiline: true,
  },

  'ui.modules.tutorials_enabled': { label: 'Tutoriels', section: 'modules', order: 10 },
  'ui.modules.visit_enabled': { label: 'Visite', section: 'modules', order: 20 },
  'ui.modules.stats_enabled': { label: 'Statistiques', section: 'modules', order: 30 },
  'ui.modules.observations_enabled': {
    label: 'Carnet observations',
    section: 'modules',
    order: 40,
  },
  'ui.modules.help_enabled': {
    label: 'Aide contextuelle (tooltips + panneau ?)',
    section: 'modules',
    order: 45,
  },
  'ui.modules.forum_enabled': { label: 'Forum', section: 'modules', order: 46 },
  'ui.modules.context_comments_enabled': {
    label: 'Commentaires de contexte (zones, tâches, projets, biodiversité, tutoriels)',
    section: 'modules',
    order: 47,
  },
  'ui.modules.reports_enabled': {
    label: 'Signalements (forum et commentaires de contexte)',
    section: 'modules',
    order: 47.05,
  },
  'ui.help.show_context_hints': {
    label: 'Afficher les mini-astuces contextuelles',
    section: 'modules',
    order: 47.1,
  },
  'ui.help.pulse_unseen_panels': {
    label: 'Animer le bouton ? tant que l’aide n’est pas vue',
    section: 'modules',
    order: 47.2,
  },
  'ui.reactions.allowed_emojis': {
    label: 'Emojis de réaction (séparés par espaces)',
    section: 'modules',
    order: 48,
  },
  'ui.map.location_emojis': {
    label:
      'Emojis zones/repères/tâches (séparés par espaces) — catalogue proposé dans les sélecteurs ; le rendu coloré est assuré par la police Noto auto-hébergée (voir npm run fonts:sync-noto-emoji, docs/LOCAL_DEV.md).',
    section: 'modules',
    order: 49,
    multiline: true,
  },
  'ui.map.default_map_student': {
    section: 'modules',
    order: 50,
    dynamicLabel: 'defaultStudentMap',
  },
  'ui.map.default_map_teacher': {
    section: 'modules',
    order: 60,
    dynamicLabel: 'defaultTeacherMap',
  },
  'ui.map.default_map_visit': {
    label: 'Carte par défaut (visite publique)',
    section: 'modules',
    order: 70,
  },
  'ui.map.emoji_label_center_gap': {
    label: 'Carte — écart emoji / nom (zones + repères, 14 = défaut)',
    section: 'modules',
    order: 71,
  },
  'ui.map.overlay_emoji_size_percent': {
    label: 'Carte — taille emojis zones & repères (% du ratio repère/plateau, 100 = réf. ~480 px)',
    section: 'modules',
    order: 72,
  },
  'ui.map.overlay_label_size_percent': {
    label: 'Carte — taille noms sous repères (% du ratio repère/plateau)',
    section: 'modules',
    order: 73,
  },
  'ui.map.overlay_zoom_growth_percent': {
    label:
      'Carte — grossissement des étiquettes au zoom (% : 0 = taille constante, 35 = défaut, 100 = linéaire)',
    section: 'modules',
    order: 73.5,
  },
  'ui.map.plateau_marker_size_percent': {
    label: 'Carte / plateau GL — taille des repères (% du plateau, ForetMap + GL)',
    section: 'modules',
    order: 74,
  },
  'tasks.student_max_active_assignments': {
    label:
      'Plafond par défaut d’inscriptions (tâches non validées par n3boss, toutes cartes ; 0 = illimité). Surclassé par le plafond défini sur chaque profil n3beur dans Profils & utilisateurs lorsqu’il est renseigné. Les affectations par un n3boss ne sont pas plafonnées.',
    section: 'tasks',
    order: 10,
  },
  'tasks.recurring_automation_enabled': {
    label:
      'Duplication automatique des tâches récurrentes (job quotidien). Désactiver pendant les vacances pour bloquer la création auto ; le rattrapage manuel via `npm run tasks:spawn-recurring` reste possible.',
    section: 'tasks',
    order: 20,
  },
  'tasks.auto_archive_enabled': {
    label:
      'Archivage automatique des tâches validées et projets validés anciens (job quotidien). Les éléments en cours ou à faire ne sont jamais concernés ; l’archivage reste réversible.',
    section: 'tasks',
    order: 30,
  },
  'tasks.auto_archive_after_days': {
    label:
      'Délai avant archivage automatique (jours écoulés depuis la validation). Défaut 120 (≈ 4 mois) ; min 7, max 3650.',
    section: 'tasks',
    order: 40,
  },
  'rbac.progression_by_validated_tasks': {
    label: 'Montée de niveau auto. selon les tâches validées',
    section: 'progression',
    order: 5,
  },
  'security.password_min_length': {
    label: 'Longueur min mot de passe',
    section: 'security',
    order: 10,
  },
  'security.jwt_ttl_base_seconds': {
    label: 'Durée session standard (secondes)',
    section: 'security',
    order: 20,
  },
  'integration.google.enabled': {
    label: 'Autoriser OAuth Google côté serveur',
    section: 'security',
    order: 50,
  },

  'system.maintenance_mode': {
    label: 'Activer le mode maintenance',
    section: 'operations',
    order: 10,
  },
  'system.maintenance_message': {
    label: 'Message maintenance',
    section: 'operations',
    order: 20,
    multiline: true,
  },
  'ops.allow_remote_logs': {
    label: 'Autoriser consultation logs',
    section: 'operations',
    order: 30,
  },
  'ops.allow_remote_restart': {
    label: 'Autoriser redémarrage distant',
    section: 'operations',
    order: 40,
  },
};
