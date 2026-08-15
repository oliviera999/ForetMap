/** Libellés UI alignés sur le modèle XLSX sortilèges (lib/glSpellsImport.js). */

export const GL_SPELL_FIELD_LABELS = {
  spell_code: 'Code sort',
  category_slug: 'Catégorie',
  nom: 'Nom',
  emoji: 'Emoji',
  cout_gemmes: 'Coût gemmes',
  cout_coeurs: 'Coût cœurs',
  cout_total_eq: 'Coût affiché',
  portee: 'Portée',
  cible: 'Cible',
  timing: 'Timing',
  effet_court: 'Effet court',
  effet_detaille: 'Effet détaillé',
  limite_usage: 'Limite d’usage',
  cumul: 'Cumul',
  statut: 'Statut',
  source: 'Source',
  notes_pedagogiques: 'Notes pédagogiques',
  cree_le: 'Créé le',
  caster_kind: 'Lanceurs autorisés',
  approval_mode: 'Validation du MJ',
  cast_scope: 'Portée du lancement',
};

/**
 * Miroir front des ENUM de `lib/glSpellOptions.js`. Libellés seulement : la règle
 * d'autorisation reste côté serveur, l'UI ne fait que la rendre lisible et éviter
 * de proposer un choix qui sera refusé.
 */
export const GL_SPELL_CASTER_KIND_LABELS = {
  any: 'Gnomes et licornes',
  gnome: 'Gnomes uniquement',
  unicorn: 'Licornes uniquement',
};

/** Étiquette courte pour les pastilles de liste / fiche (rien à afficher si `any`). */
export const GL_SPELL_CASTER_KIND_BADGES = {
  gnome: '🧙 Gnomes uniquement',
  unicorn: '🦄 Licornes uniquement',
};

export const GL_SPELL_APPROVAL_MODE_LABELS = {
  auto: 'Lancement immédiat',
  mj_required: 'Validation du MJ requise',
};

export const GL_SPELL_CAST_SCOPE_LABELS = {
  any: 'Libre (seul ou à plusieurs)',
  solo: 'Solo (un seul contributeur)',
  collective: 'Collectif (au moins deux contributeurs)',
};

export const GL_TEAM_TYPE_LABELS = {
  gnome: 'Gnomes',
  unicorn: 'Licornes',
};

/** Pastille de restriction d'un sort, ou `null` s'il est ouvert aux deux peuples. */
export function glSpellCasterKindBadge(casterKind) {
  return GL_SPELL_CASTER_KIND_BADGES[String(casterKind || 'any')] || null;
}

export const GL_SPELL_STATUT_LABELS = {
  officiel: 'Officiel',
  propose: 'Proposé',
};

export const GL_SPELL_CATEGORY_LABELS = {
  vie: 'Vie',
  mouvement: 'Mouvement',
  meta_social: 'Méta / social',
  pedagogique: 'Pédagogique',
};
