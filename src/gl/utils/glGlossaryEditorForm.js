// Logique pure de l'éditeur de glossaire GL (GLGlossaryEditorPanel).
// Formulaire vierge, conversion terme↔formulaire↔payload, options de biomes,
// filtrage de la liste. Aucune dépendance React.

/** Formulaire vierge d'un terme de glossaire. */
export const EMPTY_FORM = {
  glossary_code: '',
  terme: '',
  variantes: '',
  categorie: 'ecologie',
  niveau: 'base',
  definition_courte: '',
  definition_complete: '',
  exemple: '',
  etymologie: '',
  present_dans_qcm: '',
  illustration_idee: '',
  all_biomes: true,
  biome_slugs: [],
  termes_lies: '',
  statut: 'actif',
};

/**
 * Construit les valeurs de formulaire à partir d'une fiche terme.
 * Renvoie une copie du formulaire vierge si le terme est absent.
 */
export function termToForm(term) {
  if (!term) return { ...EMPTY_FORM };
  return {
    glossary_code: term.glossary_code || '',
    terme: term.terme || '',
    variantes: term.variantes || '',
    categorie: term.categorie || 'ecologie',
    niveau: term.niveau || 'base',
    definition_courte: term.definition_courte || '',
    definition_complete: term.definition_complete || '',
    exemple: term.exemple || '',
    etymologie: term.etymologie || '',
    present_dans_qcm: term.present_dans_qcm || '',
    illustration_idee: term.illustration_idee || '',
    all_biomes: !!term.all_biomes,
    biome_slugs: Array.isArray(term.biome_slugs) ? [...term.biome_slugs] : [],
    termes_lies: Array.isArray(term.related_codes) ? term.related_codes.join(', ') : '',
    statut: term.statut || 'actif',
  };
}

/**
 * Construit le payload d'API à partir des valeurs de formulaire.
 * Le code est élidé (undefined) s'il est vide après trim ; les biomes ne sont
 * envoyés que lorsque la portée n'est pas « tous les biomes ».
 */
export function formToPayload(form) {
  return {
    glossary_code: form.glossary_code.trim() || undefined,
    terme: form.terme,
    variantes: form.variantes,
    categorie: form.categorie,
    niveau: form.niveau,
    definition_courte: form.definition_courte,
    definition_complete: form.definition_complete,
    exemple: form.exemple,
    etymologie: form.etymologie,
    present_dans_qcm: form.present_dans_qcm,
    illustration_idee: form.illustration_idee,
    all_biomes: form.all_biomes,
    biome_slugs: form.all_biomes ? [] : form.biome_slugs,
    termes_lies: form.termes_lies,
    statut: form.statut,
  };
}

/**
 * Options du sélecteur multi-biomes : { value: slug, label: nom || slug }.
 */
export function buildBiomeOptions(biomes) {
  return (biomes || []).map((b) => ({ value: b.slug, label: b.nom || b.slug }));
}

/**
 * Filtre la liste des termes par catégorie puis par recherche texte
 * (terme + code + définition courte, insensible à la casse).
 */
export function filterGlossaryItems(items, { filterCategorie = '', filterQ = '' } = {}) {
  let list = items || [];
  if (filterCategorie) list = list.filter((row) => row.categorie === filterCategorie);
  const needle = (filterQ || '').trim().toLowerCase();
  if (needle) {
    list = list.filter((row) => {
      const hay = `${row.terme} ${row.glossary_code} ${row.definition_courte || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return list;
}
