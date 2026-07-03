// Cœur partagé des modules de formulaire d'édition de questions QCM/Quiz.
// Les trois éditeurs (QCM biomes GL, QCM lore GL, Quiz ForetMap) partagent la même
// logique pure (normalisation formulaire ↔ payload, filtres, tris) ; seuls varient
// les champs, leurs valeurs par défaut et la clé de regroupement du tri par défaut.
// Chaque module produit (`glQcmEditorForm.js`, `glQcmLoreEditorForm.js`,
// `fmQuizEditorForm.js`) conserve ses exports publics via ces fabriques.

/**
 * Fabrique le convertisseur question serveur → état formulaire (chaînes).
 *
 * @param {object} options
 * @param {Record<string, string>} options.emptyForm — formulaire vide de référence
 * @param {Record<string, string>} options.defaults — valeurs réappliquées quand le champ est vide
 * @returns {(question: object|null|undefined) => object}
 */
export function createQuestionToForm({ emptyForm, defaults = {} }) {
  return function questionToForm(question) {
    if (!question) return { ...emptyForm };
    const next = { ...emptyForm };
    for (const key of Object.keys(emptyForm)) {
      next[key] = question[key] != null ? String(question[key]) : '';
    }
    for (const [key, value] of Object.entries(defaults)) {
      if (!next[key]) next[key] = value;
    }
    return next;
  };
}

/**
 * Fabrique le convertisseur état formulaire → payload API.
 *
 * @param {object} options
 * @param {string[]} options.slugFields — champs normalisés en minuscules (trim)
 * @param {(payload: object, form: object) => object} [options.transform] — retouche finale
 * @returns {(form: object) => object}
 */
export function createFormToPayload({ slugFields = [], transform } = {}) {
  return function formToPayload(form) {
    const payload = {
      ...form,
      question_code: String(form.question_code || '')
        .trim()
        .toUpperCase(),
      numero_dans_categorie: Number(form.numero_dans_categorie) || 1,
      difficulte: form.difficulte === '' ? null : Number(form.difficulte),
    };
    for (const key of slugFields) {
      payload[key] = String(form[key] || '')
        .trim()
        .toLowerCase();
    }
    return transform ? transform(payload, form) : payload;
  };
}

/**
 * Fabrique le filtre client de la liste de questions.
 * La recherche plein texte (code, question, catégorie, tags) est commune à tous les éditeurs.
 *
 * @param {object} options
 * @param {Array<{ filterKey: string, itemKey: string }>} options.matchers — égalités strictes
 * @returns {(items: Array, filters?: object) => Array}
 */
export function createFilterItems({ matchers = [] } = {}) {
  return function filterItems(items, filters = {}) {
    const q = String(filters.filterQ || '')
      .trim()
      .toLowerCase();
    return (Array.isArray(items) ? items : []).filter((item) => {
      for (const { filterKey, itemKey } of matchers) {
        const wanted = filters[filterKey];
        if (wanted && item[itemKey] !== wanted) return false;
      }
      if (!q) return true;
      const hay =
        `${item.question_code} ${item.question} ${item.categorie_slug} ${item.tags || ''}`.toLowerCase();
      return hay.includes(q);
    });
  };
}

function compareByCategorieThenNumero(a, b) {
  const cat = String(a.categorie_slug).localeCompare(String(b.categorie_slug));
  if (cat !== 0) return cat;
  return (Number(a.numero_dans_categorie) || 0) - (Number(b.numero_dans_categorie) || 0);
}

/**
 * Fabrique le tri client de la liste de questions.
 * Tris communs : `code`, `code_desc`, `category`, `difficulte` ; le tri par défaut regroupe
 * par `groupKey` (biome, chapitre, thème…) puis catégorie / numéro.
 *
 * @param {object} options
 * @param {string} options.groupKey — champ de regroupement du tri par défaut
 * @param {Record<string, (a: object, b: object) => number>} [options.extraComparators]
 * @returns {(items: Array, sortBy: string) => Array}
 */
export function createSortItems({ groupKey, extraComparators = {} }) {
  return function sortItems(items, sortBy) {
    const rows = [...(Array.isArray(items) ? items : [])];
    switch (sortBy) {
      case 'code':
        return rows.sort((a, b) => String(a.question_code).localeCompare(String(b.question_code)));
      case 'code_desc':
        return rows.sort((a, b) => String(b.question_code).localeCompare(String(a.question_code)));
      case 'category':
        return rows.sort(compareByCategorieThenNumero);
      case 'difficulte':
        return rows.sort((a, b) => {
          const da = a.difficulte == null ? 999 : Number(a.difficulte);
          const db = b.difficulte == null ? 999 : Number(b.difficulte);
          if (da !== db) return da - db;
          return String(a.question_code).localeCompare(String(b.question_code));
        });
      default: {
        const extra = extraComparators[sortBy];
        if (extra) return rows.sort(extra);
        return rows.sort((a, b) => {
          const group = String(a[groupKey] || '').localeCompare(String(b[groupKey] || ''));
          if (group !== 0) return group;
          return compareByCategorieThenNumero(a, b);
        });
      }
    }
  };
}
