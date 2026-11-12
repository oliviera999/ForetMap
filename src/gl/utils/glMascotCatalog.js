/**
 * Palette de repli des mascottes Gnomes & Licornes (ex-catalogue Lot 2C, ids `gl-*`).
 *
 * **Depuis novembre 2026, ce fichier n'alimente plus aucune liste de choix** : le catalogue de
 * mascottes G&L est celui des packs publiés du studio ForêtMap (`lib/glUnifiedMascotCatalog.js`).
 * Il ne sert plus qu'à colorer le rendu SVG de repli (`GLMascotAvatar` → `GLMascotFallbackSvg`)
 * d'un éventuel id `gl-*` resté quelque part (la migration 343 a réattribué les équipes).
 *
 * Module ESM consommé par le front seulement (plus aucun import serveur).
 */

export const GL_MASCOT_CATALOG = Object.freeze([
  Object.freeze({
    id: 'gl-gnome-mousse',
    label: 'Gnome Mousse',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'mossy',
    primaryColor: '#16a34a',
    secondaryColor: '#365314',
    description: 'Gnome forestier — tunique de mousse, bonnet brun.',
  }),
  Object.freeze({
    id: 'gl-gnome-flamme',
    label: 'Gnome Flamme',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'fiery',
    primaryColor: '#ef4444',
    secondaryColor: '#7c2d12',
    description: 'Gnome volcanique — tunique ocre, bonnet vermillon.',
  }),
  Object.freeze({
    id: 'gl-gnome-nuit',
    label: 'Gnome Nuit',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'midnight',
    primaryColor: '#312e81',
    secondaryColor: '#1e1b4b',
    description: 'Gnome nocturne — cape sombre, bonnet violet profond.',
  }),
  Object.freeze({
    id: 'gl-gnome-givre',
    label: 'Gnome Givre',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'icy',
    primaryColor: '#0ea5e9',
    secondaryColor: '#0c4a6e',
    description: 'Gnome polaire — tunique cyan, bonnet bleu cristal.',
  }),
  Object.freeze({
    id: 'gl-gnome-soleil',
    label: 'Gnome Soleil',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'sunny',
    primaryColor: '#facc15',
    secondaryColor: '#854d0e',
    description: 'Gnome solaire — tunique ambrée, bonnet jaune éclatant.',
  }),
  Object.freeze({
    id: 'gl-gnome-vague',
    label: 'Gnome Vague',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'wavy',
    primaryColor: '#06b6d4',
    secondaryColor: '#155e75',
    description: 'Gnome côtier — tunique turquoise, bonnet bleu-vert.',
  }),
  Object.freeze({
    id: 'gl-gnome-bois',
    label: 'Gnome Bois',
    type: 'gnome',
    renderer: 'fallback',
    fallbackVariant: 'woody',
    primaryColor: '#a16207',
    secondaryColor: '#451a03',
    description: 'Gnome bûcheron — tunique brune, bonnet ocre.',
  }),
  Object.freeze({
    id: 'gl-licorne-aube',
    label: 'Licorne Aube',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'dawn',
    primaryColor: '#fb7185',
    secondaryColor: '#f9a8d4',
    description: 'Licorne rosée — crinière fuchsia, corne nacrée.',
  }),
  Object.freeze({
    id: 'gl-licorne-emeraude',
    label: 'Licorne Émeraude',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'emerald',
    primaryColor: '#10b981',
    secondaryColor: '#064e3b',
    description: 'Licorne forestière — crinière verte, corne dorée.',
  }),
  Object.freeze({
    id: 'gl-licorne-saphir',
    label: 'Licorne Saphir',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'sapphire',
    primaryColor: '#3b82f6',
    secondaryColor: '#1e3a8a',
    description: 'Licorne céleste — crinière bleu nuit, corne argentée.',
  }),
  Object.freeze({
    id: 'gl-licorne-or',
    label: 'Licorne Or',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'golden',
    primaryColor: '#f59e0b',
    secondaryColor: '#78350f',
    description: 'Licorne solaire — crinière dorée, corne en cristal jaune.',
  }),
  Object.freeze({
    id: 'gl-licorne-prisme',
    label: 'Licorne Prisme',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'prismatic',
    primaryColor: '#a855f7',
    secondaryColor: '#581c87',
    description: 'Licorne magique — crinière irisée, corne arc-en-ciel.',
  }),
  Object.freeze({
    id: 'gl-licorne-foret',
    label: 'Licorne Forêt',
    type: 'unicorn',
    renderer: 'fallback',
    fallbackVariant: 'forest',
    primaryColor: '#15803d',
    secondaryColor: '#052e16',
    description: "Licorne sylvestre — crinière feuillage, corne d'écorce.",
  }),
]);

export function getGlMascotCatalog() {
  return GL_MASCOT_CATALOG;
}

export function getGlMascotById(id) {
  const normalized = String(id || '').trim();
  if (!normalized) return null;
  return GL_MASCOT_CATALOG.find((entry) => entry.id === normalized) || null;
}

export function getGlMascotsByType(type) {
  const normalized = String(type || '')
    .trim()
    .toLowerCase();
  if (!normalized) return GL_MASCOT_CATALOG.slice();
  return GL_MASCOT_CATALOG.filter((entry) => entry.type === normalized);
}

export function countGlMascots() {
  let gnomes = 0;
  let unicorns = 0;
  for (const entry of GL_MASCOT_CATALOG) {
    if (entry.type === 'gnome') gnomes += 1;
    if (entry.type === 'unicorn') unicorns += 1;
  }
  return { gnomes, unicorns, total: GL_MASCOT_CATALOG.length };
}
