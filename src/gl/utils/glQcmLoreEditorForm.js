// Logique pure du panneau d'édition QCM lore GL.

export const TEXTAREA_FIELDS = new Set([
  'question',
  'notes_pedagogiques',
  'source_lore',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'mots_cles',
  'tags',
]);

export const EMPTY_FORM = {
  question_code: '',
  chapitre_slug: 'tous',
  categorie_slug: '',
  numero_dans_categorie: '1',
  tier_lore: 'recit',
  question: '',
  choix_a: '',
  choix_b: '',
  choix_c: '',
  choix_d: '',
  choix_e: '',
  reponse_correcte: 'A',
  reponse_texte: '',
  niveau: '',
  difficulte: '',
  difficulte_label: '',
  notes_pedagogiques: '',
  source_lore: '',
  tags: '',
  mots_cles: '',
  statut: 'actif',
  feedback_correct: '',
  feedback_a: '',
  feedback_b: '',
  feedback_c: '',
  feedback_d: '',
  feedback_e: '',
};

export const FORM_FIELDS = [
  'question_code',
  'chapitre_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'tier_lore',
  'niveau',
  'difficulte',
  'difficulte_label',
  'statut',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'notes_pedagogiques',
  'source_lore',
  'tags',
  'mots_cles',
];

export function questionToForm(question) {
  if (!question) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    next[key] = question[key] != null ? String(question[key]) : '';
  }
  if (!next.numero_dans_categorie) next.numero_dans_categorie = '1';
  if (!next.reponse_correcte) next.reponse_correcte = 'A';
  if (!next.chapitre_slug) next.chapitre_slug = 'tous';
  if (!next.tier_lore) next.tier_lore = 'recit';
  if (!next.statut) next.statut = 'actif';
  return next;
}

export function formToPayload(form) {
  return {
    ...form,
    question_code: String(form.question_code || '')
      .trim()
      .toUpperCase(),
    chapitre_slug: String(form.chapitre_slug || '')
      .trim()
      .toLowerCase(),
    categorie_slug: String(form.categorie_slug || '')
      .trim()
      .toLowerCase(),
    tier_lore: String(form.tier_lore || 'recit').toLowerCase(),
    numero_dans_categorie: Number(form.numero_dans_categorie) || 1,
    difficulte: form.difficulte === '' ? null : Number(form.difficulte),
  };
}

export function filterQcmItems(
  items,
  { filterChapitre = '', filterCategorie = '', filterTier = '', filterQ = '' } = {},
) {
  const q = filterQ.trim().toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (filterChapitre && item.chapitre_slug !== filterChapitre) return false;
    if (filterCategorie && item.categorie_slug !== filterCategorie) return false;
    if (filterTier && item.tier_lore !== filterTier) return false;
    if (!q) return true;
    const hay =
      `${item.question_code} ${item.question} ${item.categorie_slug} ${item.tags || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

export function sortQcmItems(items, sortBy) {
  const rows = [...(Array.isArray(items) ? items : [])];
  switch (sortBy) {
    case 'code':
      return rows.sort((a, b) => String(a.question_code).localeCompare(String(b.question_code)));
    case 'code_desc':
      return rows.sort((a, b) => String(b.question_code).localeCompare(String(a.question_code)));
    case 'category':
      return rows.sort((a, b) => {
        const cat = String(a.categorie_slug).localeCompare(String(b.categorie_slug));
        if (cat !== 0) return cat;
        return (Number(a.numero_dans_categorie) || 0) - (Number(b.numero_dans_categorie) || 0);
      });
    case 'difficulte':
      return rows.sort((a, b) => {
        const da = a.difficulte == null ? 999 : Number(a.difficulte);
        const db = b.difficulte == null ? 999 : Number(b.difficulte);
        if (da !== db) return da - db;
        return String(a.question_code).localeCompare(String(b.question_code));
      });
    case 'tier':
      return rows.sort((a, b) => {
        const tier = String(a.tier_lore || '').localeCompare(String(b.tier_lore || ''));
        if (tier !== 0) return tier;
        return String(a.question_code).localeCompare(String(b.question_code));
      });
    case 'chapitre':
    default:
      return rows.sort((a, b) => {
        const ch = String(a.chapitre_slug || '').localeCompare(String(b.chapitre_slug || ''));
        if (ch !== 0) return ch;
        const cat = String(a.categorie_slug).localeCompare(String(b.categorie_slug));
        if (cat !== 0) return cat;
        return (Number(a.numero_dans_categorie) || 0) - (Number(b.numero_dans_categorie) || 0);
      });
  }
}
