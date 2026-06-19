// Logique pure du panneau d'édition des questions Quiz ForetMap.

export const TEXTAREA_FIELDS = new Set([
  'question',
  'notes_pedagogiques',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'photo_legende',
]);

export const EMPTY_FORM = {
  question_code: '',
  categorie_slug: '',
  numero_dans_categorie: '1',
  question: '',
  choix_a: '',
  choix_b: '',
  choix_c: '',
  choix_d: '',
  choix_e: '',
  reponse_correcte: 'A',
  reponse_texte: '',
  niveau: 'college',
  difficulte: '',
  difficulte_label: '',
  notes_pedagogiques: '',
  tags: '',
  photo_url: '',
  photo_credit: '',
  photo_licence: '',
  photo_legende: '',
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
  'categorie_slug',
  'numero_dans_categorie',
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
  'tags',
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
];

/**
 * @param {object|null|undefined} question
 * @returns {object}
 */
export function questionToForm(question) {
  if (!question) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    next[key] = question[key] != null ? String(question[key]) : '';
  }
  if (!next.numero_dans_categorie) next.numero_dans_categorie = '1';
  if (!next.reponse_correcte) next.reponse_correcte = 'A';
  if (!next.niveau) next.niveau = 'college';
  if (!next.statut) next.statut = 'actif';
  return next;
}

/**
 * @param {object} form
 * @returns {object}
 */
export function formToPayload(form) {
  return {
    ...form,
    question_code: String(form.question_code || '')
      .trim()
      .toUpperCase(),
    categorie_slug: String(form.categorie_slug || '')
      .trim()
      .toLowerCase(),
    numero_dans_categorie: Number(form.numero_dans_categorie) || 1,
    difficulte: form.difficulte === '' ? null : Number(form.difficulte),
  };
}

/**
 * @param {Array} items
 * @param {{ filterTheme?: string, filterCategorie?: string, filterQ?: string }} filters
 * @returns {Array}
 */
export function filterQuizItems(items, { filterTheme = '', filterCategorie = '', filterQ = '' } = {}) {
  const q = filterQ.trim().toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (filterTheme && item.theme !== filterTheme) return false;
    if (filterCategorie && item.categorie_slug !== filterCategorie) return false;
    if (!q) return true;
    const hay = `${item.question_code} ${item.question} ${item.categorie_slug} ${item.tags || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/**
 * @param {Array} items
 * @param {string} sortBy
 * @returns {Array}
 */
export function sortQuizItems(items, sortBy) {
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
    case 'theme':
    default:
      return rows.sort((a, b) => {
        const th = String(a.theme || '').localeCompare(String(b.theme || ''));
        if (th !== 0) return th;
        const cat = String(a.categorie_slug).localeCompare(String(b.categorie_slug));
        if (cat !== 0) return cat;
        return (Number(a.numero_dans_categorie) || 0) - (Number(b.numero_dans_categorie) || 0);
      });
  }
}
