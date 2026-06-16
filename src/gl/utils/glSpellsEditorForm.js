// Logique pure du panneau d'édition des sortilèges GL (GLSpellsEditorPanel).
// Normalisation / transformation / filtrage du formulaire de sort ; aucune dépendance React.

/** Champs rendus en zone de texte (multi-lignes). */
export const TEXTAREA_FIELDS = new Set(['effet_court', 'effet_detaille', 'notes_pedagogiques']);

/** Formulaire vierge (toutes les valeurs en chaînes pour les champs contrôlés). */
export const EMPTY_FORM = {
  spell_code: '',
  category_slug: '',
  nom: '',
  emoji: '',
  cout_gemmes: '0',
  cout_coeurs: '0',
  cout_total_eq: '',
  portee: '',
  cible: '',
  timing: '',
  effet_court: '',
  effet_detaille: '',
  limite_usage: '',
  cumul: '',
  statut: 'officiel',
  source: '',
  notes_pedagogiques: '',
  cree_le: '',
};

/** Ordre d'affichage des champs dans le formulaire. */
export const FORM_FIELDS = [
  'spell_code',
  'category_slug',
  'nom',
  'emoji',
  'cout_gemmes',
  'cout_coeurs',
  'cout_total_eq',
  'portee',
  'cible',
  'timing',
  'effet_court',
  'effet_detaille',
  'limite_usage',
  'cumul',
  'statut',
  'source',
  'notes_pedagogiques',
  'cree_le',
];

/**
 * Convertit une fiche de sort (API) en valeurs de formulaire (chaînes).
 * Les coûts manquants reviennent à '0' ; la date de création est tronquée à AAAA-MM-JJ.
 * @param {object|null|undefined} spell
 * @returns {object} formulaire prêt pour les champs contrôlés
 */
export function spellToForm(spell) {
  if (!spell) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    if (key === 'cout_gemmes' || key === 'cout_coeurs') {
      next[key] = spell[key] != null ? String(spell[key]) : '0';
    } else {
      next[key] = spell[key] != null ? String(spell[key]) : '';
    }
  }
  if (spell.cree_le) next.cree_le = String(spell.cree_le).slice(0, 10);
  return next;
}

/**
 * Transforme le formulaire en charge utile d'API : coûts numériques, code épuré.
 * @param {object} form
 * @returns {object}
 */
export function formToPayload(form) {
  return {
    ...form,
    cout_gemmes: Number(form.cout_gemmes) || 0,
    cout_coeurs: Number(form.cout_coeurs) || 0,
    spell_code: form.spell_code.trim() || undefined,
    id: form.spell_code.trim() || undefined,
  };
}

/**
 * Filtre une liste de sorts par recherche libre (nom + code, insensible à la casse).
 * Renvoie la liste telle quelle si la requête est vide.
 * @param {Array<{nom?: string, spell_code?: string}>} items
 * @param {string} query
 * @returns {Array}
 */
export function filterSpells(items, query) {
  const rows = Array.isArray(items) ? items : [];
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const hay = `${row.nom} ${row.spell_code}`.toLowerCase();
    return hay.includes(needle);
  });
}
