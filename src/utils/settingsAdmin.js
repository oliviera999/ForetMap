/**
 * Utilitaires purs pour l'interface d'administration des parametres.
 * Aucune dependance React ni DOM - testables unitairement.
 */

/** Definition des sections de parametres (titre affiche + ordre de tri). */
export const SECTION_DEFS = {
  auth: { title: 'Accueil & authentification', order: 10 },
  modules: { title: 'Modules UI', order: 20 },
  content: { title: 'Contenus du site', order: 22 },
  tasks: { title: "Taches & inscriptions n3beurs", order: 23 },
  progression: { title: 'Progression n3beurs', order: 25 },
  security: { title: "Securite", order: 30 },
  operations: { title: 'Exploitation', order: 40 },
  other: { title: "Autres parametres", order: 90 },
};

/** Metadonnees (section, ordre, label, multiline) pour chaque cle de parametre connue. */
export const KEY_META = {
  'ui.auth.allow_register': { label: 'Afficher "Creer un compte"', section: 'auth', order: 10 },
  'ui.auth.allow_google_student': { section: 'auth', order: 20, dynamicLabel: 'googleStudent' },
  'ui.auth.allow_google_teacher': { section: 'auth', order: 30, dynamicLabel: 'googleTeacher' },
  'ui.auth.allow_guest_visit': { label: 'Afficher "Visiter sans compte"', section: 'auth', order: 40 },
  'ui.auth.default_mode': { label: "Mode auth par defaut", section: 'auth', order: 50 },
  'ui.auth.welcome_message': { label: "Message d'accueil", section: 'auth', order: 60, multiline: true },
  'content.auth.title': { label: "Titre ecran de connexion", section: 'content', order: 10 },
  'content.auth.subtitle': { label: "Sous-titre ecran de connexion", section: 'content', order: 20, multiline: true },
  'content.auth.login_tab': { label: "Texte onglet connexion", section: 'content', order: 30 },
  'content.auth.register_tab': { label: "Texte onglet creation de compte", section: 'content', order: 40 },
  'content.auth.guest_visit_cta': { label: "Bouton visite sans compte", section: 'content', order: 50 },
  'content.app.loader': { label: "Message global de chargement", section: 'content', order: 60 },
  'content.app.server_down_notice': { label: "Message serveur indisponible", section: 'content', order: 70, multiline: true },
  'content.app.retry_now': { label: "Bouton reessayer", section: 'content', order: 80 },
  'content.app.footer_version_prefix': { label: "Prefixe version footer", section: 'content', order: 90 },
  'content.visit.title': { label: "Titre page visite", section: 'content', order: 100 },
  'content.visit.subtitle': { label: "Sous-titre page visite", section: 'content', order: 110, multiline: true },
  'content.visit.empty_selection': { label: "Texte zone non selectionnee", section: 'content', order: 120, multiline: true },
  'content.visit.tutorials_title': { label: "Titre bloc tutoriels visite", section: 'content', order: 130 },
  'content.visit.tutorials_empty': { label: "Texte tutoriels vides", section: 'content', order: 140, multiline: true },
  'content.about.title': { label: "Titre page a propos", section: 'content', order: 150 },
  'content.about.subtitle': { label: "Sous-titre page a propos", section: 'content', order: 160, multiline: true },
  'content.about.purpose_title': { label: "Titre carte objet de l'application", section: 'content', order: 170 },
  'content.about.purpose_body': { label: "Texte objet de l'application", section: 'content', order: 180, multiline: true },
  'content.about.docs_title': { label: "Titre carte documentation", section: 'content', order: 190 },
  'content.about.help_title': { label: "Titre carte aide contextuelle", section: 'content', order: 210 },
  'content.about.help_body': { label: "Texte aide contextuelle", section: 'content', order: 220, multiline: true },
  'content.about.help_reenable_cta': { label: "Bouton reactiver aides", section: 'content', order: 230 },
  'content.about.help_reset_metrics_cta': { label: "Bouton reset compteurs aide", section: 'content', order: 240 },
  'content.help.hint_prefix': { label: "Prefixe mini-astuce contextuelle", section: 'content', order: 245 },
  'content.help.panel_title_prefix': { label: "Prefixe titre panneau aide (?)", section: 'content', order: 246 },
  'content.help.panel_close_cta': { label: "Bouton fermer panneau aide (?)", section: 'content', order: 247 },
  'content.help.panel_dismiss_cta': { label: "Bouton masquer panneau aide (?)", section: 'content', order: 248 },
  'content.help.map_quick_tip': { label: "Mini-astuce carte", section: 'content', order: 249, multiline: true },
  'content.help.tasks_quick_tip': { label: "Mini-astuce taches", section: 'content', order: 250, multiline: true },
  'content.help.visit_quick_tip': { label: "Mini-astuce visite", section: 'content', order: 251, multiline: true },

  'ui.modules.tutorials_enabled': { label: 'Tutoriels', section: 'modules', order: 10 },
  'ui.modules.visit_enabled': { label: 'Visite', section: 'modules', order: 20 },
  'ui.modules.stats_enabled': { label: 'Statistiques', section: 'modules', order: 30 },
  'ui.modules.observations_enabled': { label: 'Carnet observations', section: 'modules', order: 40 },
  'ui.modules.help_enabled': { label: 'Aide contextuelle (tooltips + panneau ?)', section: 'modules', order: 45 },
  'ui.modules.forum_enabled': { label: 'Forum', section: 'modules', order: 46 },
  'ui.modules.context_comments_enabled': { label: 'Commentaires de contexte (zones, taches, projets, biodiversite, tutoriels)', section: 'modules', order: 47 },
  'ui.help.show_context_hints': { label: 'Afficher les mini-astuces contextuelles', section: 'modules', order: 47.1 },
  'ui.help.pulse_unseen_panels': { label: "Animer le bouton ? tant que l'aide n'est pas vue", section: 'modules', order: 47.2 },
  'ui.reactions.allowed_emojis': { label: "Emojis de reaction (separes par espaces)", section: 'modules', order: 48 },
  'ui.map.location_emojis': {
    label: "Emojis zones/reperes/taches (separes par espaces) - catalogue propose dans les selecteurs ; le rendu colore est assure par la police Noto auto-hebergee (voir npm run fonts:sync-noto-emoji, docs/LOCAL_DEV.md).",
    section: 'modules',
    order: 49,
    multiline: true,
  },
  'ui.map.default_map_student': { section: 'modules', order: 50, dynamicLabel: 'defaultStudentMap' },
  'ui.map.default_map_teacher': { section: 'modules', order: 60, dynamicLabel: 'defaultTeacherMap' },
  'ui.map.default_map_visit': { label: "Carte par defaut (visite publique)", section: 'modules', order: 70 },
  'ui.map.emoji_label_center_gap': {
    label: "Carte - ecart emoji / nom (coefficient x inv ; zones + reperes, 14 = defaut)",
    section: 'modules',
    order: 71,
  },
  'ui.map.overlay_emoji_size_percent': {
    label: "Carte - taille des emojis zones & reperes (%)",
    section: 'modules',
    order: 72,
  },
  'ui.map.overlay_label_size_percent': {
    label: "Carte - taille des noms sous les reperes (%)",
    section: 'modules',
    order: 73,
  },
  'tasks.student_max_active_assignments': {
    label: "Plafond par defaut d'inscriptions (taches non validees par n3boss, toutes cartes ; 0 = illimite). Surclasse par le plafond defini sur chaque profil n3beur dans Profils & utilisateurs lorsqu'il est renseigne. Les affectations par un n3boss ne sont pas plafonnees.",
    section: 'tasks',
    order: 10,
  },
  'tasks.recurring_automation_enabled': {
    label: "Duplication automatique des taches recurrentes (job quotidien). Desactiver pendant les vacances pour bloquer la creation auto ; le rattrapage manuel via `npm run tasks:spawn-recurring` reste possible.",
    section: 'tasks',
    order: 20,
  },
  'rbac.progression_by_validated_tasks': {
    label: "Montee de niveau auto. selon les taches validees",
    section: 'progression',
    order: 5,
  },
  'security.password_min_length': { label: "Longueur min mot de passe", section: 'security', order: 10 },
  'security.jwt_ttl_base_seconds': { label: "Duree session standard (secondes)", section: 'security', order: 20 },
  'security.jwt_ttl_elevated_seconds': { label: "Duree session elevee (secondes)", section: 'security', order: 30 },
  'security.allow_pin_elevation': { label: "Autoriser l'elevation PIN", section: 'security', order: 40 },
  'integration.google.enabled': { label: "Autoriser OAuth Google cote serveur", section: 'security', order: 50 },

  'system.maintenance_mode': { label: "Activer le mode maintenance", section: 'operations', order: 10 },
  'system.maintenance_message': { label: 'Message maintenance', section: 'operations', order: 20, multiline: true },
  'ops.allow_remote_logs': { label: 'Autoriser consultation logs', section: 'operations', order: 30 },
  'ops.allow_remote_restart': { label: 'Autoriser redemarrage distant', section: 'operations', order: 40 },
};

/**
 * Transforme une cle technique (ex. `ui.auth.allow_register`) en libelle lisible par defaut.
 * Prend le dernier segment, remplace les underscores par des espaces, met en majuscule chaque mot.
 * @param {string} key
 * @returns {string}
 */
export function humanizeKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  const last = raw.split('.').pop() || raw;
  return last
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deduit la section d'appartenance d'une cle de parametre depuis son prefixe.
 * @param {string} key
 * @returns {string} identifiant de section (cf. SECTION_DEFS)
 */
export function inferSectionFromKey(key) {
  const normalized = String(key || '').toLowerCase();
  if (normalized.startsWith('ui.auth.')) return 'auth';
  if (normalized.startsWith('content.')) return 'content';
  if (normalized.startsWith('ui.modules.') || normalized.startsWith('ui.map.')) return 'modules';
  if (normalized.startsWith('tasks.')) return 'tasks';
  if (normalized.startsWith('progression.') || normalized.startsWith('rbac.')) return 'progression';
  if (normalized.startsWith('security.') || normalized.startsWith('integration.')) return 'security';
  if (normalized.startsWith('system.') || normalized.startsWith('ops.')) return 'operations';
  return 'other';
}

/**
 * Libelle court pour un scope de parametre.
 * @param {string} scope - 'admin' | 'teacher' | autre
 * @returns {string}
 */
export function scopeLabel(scope) {
  const s = String(scope || '').toLowerCase();
  if (s === 'admin') return 'Admin';
  if (s === 'teacher') return 'n3boss';
  return 'Public';
}

/**
 * Libelle court pour un type de parametre.
 * @param {string} type - 'boolean' | 'number' | 'enum' | 'string' | autre
 * @returns {string}
 */
export function typeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'boolean') return 'booleen';
  if (t === 'number') return 'numerique';
  if (t === 'enum') return 'liste';
  if (t === 'string') return 'texte';
  return t || 'inconnu';
}

/**
 * Construit la chaine d'aide resumant type + contraintes + valeur par defaut d'un parametre.
 * Ne leve jamais d'exception : entree mal formee => chaine partielle.
 * @param {{ type?: string, constraints?: { min?: number|null, max?: number|null, maxLength?: number|null, values?: unknown[] }, default_value?: unknown }} row
 * @returns {string}
 */
export function buildConstraintHelp(row) {
  const parts = ['Type: ' + typeLabel(row?.type)];
  const constraints = row?.constraints || {};
  // Ne pas utiliser Number(null) === 0 : les contraintes absentes arrivent en null depuis l'API.
  if (constraints.min != null && Number.isFinite(Number(constraints.min))) {
    parts.push('min ' + Number(constraints.min));
  }
  if (constraints.max != null && Number.isFinite(Number(constraints.max))) {
    parts.push('max ' + Number(constraints.max));
  }
  if (constraints.maxLength != null && Number.isFinite(Number(constraints.maxLength))) {
    parts.push('max ' + Number(constraints.maxLength) + ' caracteres');
  }
  if (Array.isArray(constraints.values) && constraints.values.length > 0) {
    parts.push('valeurs: ' + constraints.values.map((v) => String(v)).join(', '));
  }
  if (row?.default_value != null && row?.default_value !== '') {
    parts.push('defaut: ' + String(row.default_value));
  }
  return parts.join(' - ');
}

/**
 * Enrichit une liste brute de parametres avec les metadonnees de section/ordre/_multiline,
 * groupe par section et trie selon SECTION_DEFS.
 * Fonction pure : ne modifie pas le tableau d'entree.
 * @param {Array<{ key: string, [k: string]: unknown }>} settings
 * @returns {Array<{ id: string, title: string, order: number, rows: Array }>}
 */
export function buildSettingSections(settings) {
  const rows = settings.map((row) => {
    const meta = KEY_META[row.key] || {};
    const sectionId = meta.section || inferSectionFromKey(row.key);
    const sectionDef = SECTION_DEFS[sectionId] || SECTION_DEFS.other;
    return {
      ...row,
      _sectionId: sectionId,
      _sectionTitle: sectionDef.title,
      _sectionOrder: sectionDef.order,
      _fieldOrder: meta.order ?? 999,
      _multiline: !!meta.multiline,
    };
  });
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row._sectionId)) {
      grouped.set(row._sectionId, {
        id: row._sectionId,
        title: row._sectionTitle,
        order: row._sectionOrder,
        rows: [],
      });
    }
    grouped.get(row._sectionId).rows.push(row);
  }
  const ordered = Array.from(grouped.values())
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  for (const section of ordered) {
    section.rows.sort((a, b) => a._fieldOrder - b._fieldOrder || String(a.key).localeCompare(String(b.key)));
  }
  return ordered;
}

/**
 * Filtre les sections/lignes selon une requete texte (cle, label, scope, contraintes).
 * Retourne toujours un nouveau tableau.
 * @param {Array} sections - resultat de buildSettingSections
 * @param {string} query
 * @param {function(string): string} resolveLabelFn - `(key) => label`
 * @returns {Array}
 */
export function filterSettingSections(sections, query, resolveLabelFn) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => {
      const rows = section.rows.filter((row) => {
        const label = resolveLabelFn(row.key).toLowerCase();
        const key = String(row.key || '').toLowerCase();
        const scope = scopeLabel(row.scope).toLowerCase();
        const help = buildConstraintHelp(row).toLowerCase();
        return label.includes(q) || key.includes(q) || scope.includes(q) || help.includes(q);
      });
      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);
}

/**
 * Resout le libelle d'un parametre depuis KEY_META, en injectant les termes de role dynamiques.
 * @param {string} key
 * @param {{ studentSingular: string, teacherShort: string, teacherSingular: string }} roleTerms
 * @returns {string}
 */
export function resolveSettingLabel(key, roleTerms) {
  const meta = KEY_META[key];
  if (!meta) return humanizeKey(key);
  if (meta.dynamicLabel === 'googleStudent') return 'Afficher "Google ' + roleTerms.studentSingular + '"';
  if (meta.dynamicLabel === 'googleTeacher') return 'Afficher "Google ' + roleTerms.teacherShort + '"';
  if (meta.dynamicLabel === 'defaultStudentMap') return 'Carte par defaut (' + roleTerms.studentSingular + ')';
  if (meta.dynamicLabel === 'defaultTeacherMap') return 'Carte par defaut (' + roleTerms.teacherSingular + ')';
  return meta.label || humanizeKey(key);
}

/**
 * Compte le nombre total de lignes dans un tableau de sections.
 * @param {Array<{ rows: Array }>} sections
 * @returns {number}
 */
export function countSettingRows(sections) {
  let n = 0;
  for (const section of sections) n += section.rows.length;
  return n;
}
