/**
 * Noms de marque côté front — lecture du global posé par le plugin Vite `foretmap-brand-html`
 * (`vite.config.js`), lui-même alimenté par `lib/brand.js`.
 *
 * Pourquoi un global plutôt que les réglages publics : le colophon du carnet et les autres
 * mentions structurelles de l'établissement s'affichent dans les **quatre** produits, dont G&L
 * et le Plan, qui ne consomment pas `publicSettings`. Faire descendre le nom par accessoires
 * depuis chaque racine aurait demandé de traverser des arbres entiers pour une chaîne
 * constante. Le global est écrit au build, avec le reste de l'identité.
 *
 * Les textes **éditables par un administrateur** ne passent pas par ici : ils restent servis
 * par l'API (`publicSettings.content.brand.*`, cf. `lib/settings.js`), qui peut les surcharger
 * en base sans reconstruire le front.
 *
 * Aucun import : ce module vit sous `src/shared/`, dont l'étanchéité interdit de remonter vers
 * `src/utils/`, `src/components/` ou `src/gl/`.
 */

/** Repli quand le global est absent : tests unitaires, rendu hors page (SSR, outillage). */
const EMPTY_BRAND = Object.freeze({
  appName: '',
  appShortName: '',
  orgName: '',
  orgShortName: '',
});

/**
 * Identité de marque du build. Champs toujours présents, éventuellement vides — une
 * installation sans établissement rattaché a un `orgName` vide, et c'est une valeur valide.
 * @returns {{ appName: string, appShortName: string, orgName: string, orgShortName: string }}
 */
export function getBuildBrand() {
  try {
    const injected = globalThis.__FORETMAP_BRAND__;
    if (!injected || typeof injected !== 'object') return EMPTY_BRAND;
    return {
      appName: String(injected.appName || ''),
      appShortName: String(injected.appShortName || ''),
      orgName: String(injected.orgName || ''),
      orgShortName: String(injected.orgShortName || ''),
    };
  } catch {
    // Accès au global refusé (contexte isolé) : la marque n'est jamais critique à l'affichage.
    return EMPTY_BRAND;
  }
}

/** Nom de l'établissement, ou chaîne vide. Raccourci du cas d'usage le plus fréquent. */
export function getBrandOrgName() {
  return getBuildBrand().orgName;
}
