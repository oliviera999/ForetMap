// Logique pure de l'éditeur de feuillets GL (GLLoreFeuilletsEditorPanel) :
// conversion détail (camelCase, API) ↔ formulaire (snake_case, colonnes BDD) et
// filtrage de la liste. Aucune dépendance React.

/** snake_case → camelCase (feuillet_code → feuilletCode, biome_slug → biomeSlug…). */
export function snakeToCamel(key) {
  return String(key).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Formulaire vierge : toutes les colonnes éditables d'un feuillet. */
export const EMPTY_FORM = {
  feuillet_code: '',
  type: 'feuillet',
  liasse: '',
  titre: '',
  incipit: '',
  biome_slug: '',
  plateau_number: '',
  zone_label: '',
  visage_label: '',
  ordre_voyage: '',
  ordre_liasse: '',
  ordre_recit: '',
  mode_apparition: 'boite',
  usage_note: '',
  lisibilite: '',
  effacement: 'non',
  vierge: 'non',
  vitesse_effacement: '',
  repalissement: '',
  tenir: '',
  cout_gemme: '',
  gain_coeur: '',
  themes: '',
  ancrage_scientifique: '',
  references_scientifiques: '',
  lien_qcm_biome: '',
  lien_canal: '',
  lien_ref: '',
  lien_pays: '',
  lien_ordre_recit: '',
  lien_note: '',
  signature: '',
  idee_cle: '',
  contexte: '',
  texte_accessible: '',
  texte: '',
  image_url: '',
  image_coupe_url: '',
  statut: 'actif',
};

/**
 * Construit le formulaire depuis une fiche feuillet (détail API, camelCase).
 * Booléen `vierge` → 'oui'/'non' ; valeurs nulles → chaîne vide.
 * @param {object|null|undefined} feuillet
 * @returns {object}
 */
export function feuilletToForm(feuillet) {
  if (!feuillet) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const camel = snakeToCamel(key);
    const raw = feuillet[camel] !== undefined ? feuillet[camel] : feuillet[key];
    if (key === 'vierge') {
      next.vierge = raw === true || raw === 1 || raw === 'oui' || raw === '1' ? 'oui' : 'non';
    } else {
      next[key] = raw == null ? '' : String(raw);
    }
  }
  return next;
}

/**
 * Prépare la charge utile envoyée au PUT : copie snake_case du formulaire.
 * Le code (clé) reste porté par l'URL côté serveur ; on l'inclut par robustesse.
 * @param {object} form
 * @returns {object}
 */
export function formToPayload(form) {
  const payload = {};
  for (const key of Object.keys(EMPTY_FORM)) {
    const value = form[key];
    payload[key] = typeof value === 'string' ? value.trim() : value;
  }
  return payload;
}

/**
 * Filtre la liste de feuillets (recherche + type + biome + statut), sans muter
 * la source. Les lignes proviennent de GET /api/gl/lore/admin/feuillets (snake_case).
 * @param {Array<object>} items
 * @param {{ q?: string, type?: string, biome?: string, statut?: string }} [filters]
 * @returns {Array<object>}
 */
export function filterFeuilletItems(items, { q = '', type = '', biome = '', statut = '' } = {}) {
  let list = Array.isArray(items) ? items : [];
  if (type) list = list.filter((row) => row.type === type);
  if (biome) list = list.filter((row) => row.biome_slug === biome);
  if (statut) list = list.filter((row) => (row.statut || 'actif') === statut);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter((row) => {
      const hay = `${row.feuillet_code} ${row.titre || ''} ${row.liasse || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return list;
}
