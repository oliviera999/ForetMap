// Métadonnées des champs de l'éditeur de feuillets (carnet de Sélène) :
// libellés, type de contrôle et options. Source unique partagée par le panneau
// d'édition et ses tests. Aucune dépendance React.

/** Types de feuillet (aligné sur VALID_TYPES de lib/glLoreFeuilletsImport.js). */
export const FEUILLET_TYPE_OPTIONS = [
  'copiste',
  'message',
  'feuillet',
  'reponse',
  'scene',
  'vierge',
];

/** Modes d'apparition (aligné sur VALID_MODES + l'ENUM gl_lore_feuillets). */
export const FEUILLET_MODE_OPTIONS = [
  'cover',
  'preface',
  'insert',
  'boite',
  'band',
  'marginalia',
  'pole',
  'biome',
  'corbeau',
  'ancre_biome',
  'carnet_route',
  'scene',
  'cloture',
];

export const FEUILLET_STATUT_OPTIONS = ['actif', 'inactif'];

/**
 * Sections du formulaire (rendues en `<details>`). `kind` :
 * text | number | textarea | select | biome (select alimenté par /api/gl/biomes).
 */
export const FEUILLET_SECTIONS = [
  {
    id: 'identite',
    title: 'Identité',
    open: true,
    fields: [
      { key: 'feuillet_code', label: 'Code', kind: 'text', readOnly: true },
      { key: 'type', label: 'Type', kind: 'select', options: FEUILLET_TYPE_OPTIONS },
      { key: 'titre', label: 'Titre', kind: 'text' },
      { key: 'liasse', label: 'Liasse', kind: 'text' },
      { key: 'signature', label: 'Signature', kind: 'text' },
      { key: 'statut', label: 'Statut', kind: 'select', options: FEUILLET_STATUT_OPTIONS },
    ],
  },
  {
    id: 'recit',
    title: 'Récit & ordre',
    open: true,
    fields: [
      { key: 'ordre_voyage', label: 'Ordre voyage', kind: 'number' },
      { key: 'ordre_liasse', label: 'Ordre liasse', kind: 'number' },
      { key: 'ordre_recit', label: 'Ordre récit', kind: 'number' },
      {
        key: 'mode_apparition',
        label: "Mode d'apparition",
        kind: 'select',
        options: FEUILLET_MODE_OPTIONS,
      },
      { key: 'incipit', label: 'Incipit', kind: 'textarea', rows: 2 },
      { key: 'idee_cle', label: 'Idée clé', kind: 'textarea', rows: 2 },
      { key: 'contexte', label: 'Contexte', kind: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'localisation',
    title: 'Localisation',
    fields: [
      { key: 'biome_slug', label: 'Biome', kind: 'biome' },
      { key: 'plateau_number', label: 'Plateau (n°)', kind: 'number' },
      { key: 'zone_label', label: 'Zone', kind: 'text' },
      { key: 'visage_label', label: 'Visage', kind: 'text' },
    ],
  },
  {
    id: 'effacement',
    title: 'Effacement & jeu',
    fields: [
      { key: 'vierge', label: 'Vierge', kind: 'select', options: ['non', 'oui'] },
      { key: 'effacement', label: 'Effacement', kind: 'text' },
      { key: 'vitesse_effacement', label: "Vitesse d'effacement", kind: 'text' },
      { key: 'repalissement', label: 'Repâlissement', kind: 'text' },
      { key: 'tenir', label: 'Tenir', kind: 'text' },
      { key: 'lisibilite', label: 'Lisibilité', kind: 'text' },
      { key: 'usage_note', label: "Note d'usage", kind: 'text' },
      { key: 'cout_gemme', label: 'Coût gemme', kind: 'number' },
      { key: 'gain_coeur', label: 'Gain cœur', kind: 'number' },
    ],
  },
  {
    id: 'science',
    title: 'Ancrage scientifique',
    fields: [
      { key: 'themes', label: 'Thèmes', kind: 'textarea', rows: 2 },
      { key: 'ancrage_scientifique', label: 'Ancrage scientifique', kind: 'textarea', rows: 3 },
      {
        key: 'references_scientifiques',
        label: 'Références scientifiques',
        kind: 'textarea',
        rows: 2,
      },
      { key: 'lien_qcm_biome', label: 'Lien QCM biome', kind: 'text' },
    ],
  },
  {
    id: 'liens',
    title: 'Liens (espèce / pays)',
    fields: [
      { key: 'lien_canal', label: 'Canal', kind: 'text' },
      { key: 'lien_ref', label: 'Référence', kind: 'text' },
      { key: 'lien_pays', label: 'Pays (n°)', kind: 'number' },
      { key: 'lien_ordre_recit', label: 'Ordre récit lié', kind: 'number' },
      { key: 'lien_note', label: 'Note de lien', kind: 'textarea', rows: 2 },
    ],
  },
  {
    id: 'textes',
    title: 'Textes',
    fields: [
      { key: 'texte_accessible', label: 'Texte accessible', kind: 'textarea', rows: 4 },
      { key: 'texte', label: 'Texte', kind: 'textarea', rows: 6 },
    ],
  },
  {
    id: 'images',
    title: 'Images',
    fields: [
      { key: 'image_url', label: 'Image (URL)', kind: 'text' },
      { key: 'image_coupe_url', label: 'Image coupe (URL)', kind: 'text' },
    ],
  },
];

/** Colonnes affichées dans le tableau de la liste (caractéristiques principales). */
export const FEUILLET_LIST_COLUMNS = [
  { key: 'feuillet_code', label: 'Code' },
  { key: 'titre', label: 'Titre' },
  { key: 'type', label: 'Type' },
  { key: 'liasse', label: 'Liasse' },
  { key: 'biome_slug', label: 'Biome' },
  { key: 'zone_label', label: 'Zone' },
  { key: 'mode_apparition', label: 'Mode' },
  { key: 'ordre_voyage', label: 'Ordre' },
  { key: 'statut', label: 'Statut' },
];
