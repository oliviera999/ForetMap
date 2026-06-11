/**
 * Helpers de prévisualisation Wikimedia Commons pour les fiches biodiversité
 * — extraits de `foretmap-views.jsx` (O6).
 *
 * Deux fonctions :
 * - `fetchCommonsCategoryPreview` : interroge l'API MediaWiki pour récupérer
 *   la miniature du premier fichier image d'une catégorie Commons.
 * - `findFirstBiodivHeroPhotoCandidate` : parcourt les champs photo prioritaires
 *   d'une fiche et retourne le premier candidat affichable (image directe ou
 *   catégorie Commons).
 *
 * `fetchCommonsCategoryPreview` dépend de `fetch` (global navigateur/Node ≥ 18) ;
 * les deux fonctions sont testables avec un `fetch` mocké.
 * `findFirstBiodivHeroPhotoCandidate` est entièrement pure.
 */

import {
  isHttpLink,
  isLocalUploadsPath,
  isLikelyDirectImageUrl,
  commonsFilePageToDisplaySrc,
  parseCommonsCategoryFromUrl,
} from './plantSourceLinks.js';
import { parseLinkCandidates } from './plantFormValues.js';

/** Champs photo consultés pour la photo principale (ordre de priorité). */
const BIODIV_HERO_PHOTO_KEYS = ['photo', 'photo_species'];

/**
 * Récupère l'URL de la miniature du premier fichier image d'une catégorie
 * Wikimedia Commons via l'API `query/generator=categorymembers`.
 *
 * Retourne `null` si la catégorie est introuvable, vide, ou si la requête échoue.
 *
 * @param {string} urlValue - URL de la page catégorie Commons (ex.
 *   `https://commons.wikimedia.org/wiki/Category:Solanum_lycopersicum`).
 * @returns {Promise<string|null>}
 */
export async function fetchCommonsCategoryPreview(urlValue) {
  const categoryTitle = parseCommonsCategoryFromUrl(urlValue);
  if (!categoryTitle) return null;
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  endpoint.searchParams.set('generator', 'categorymembers');
  endpoint.searchParams.set('gcmtype', 'file');
  endpoint.searchParams.set('gcmtitle', categoryTitle);
  endpoint.searchParams.set('gcmlimit', '1');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url');
  endpoint.searchParams.set('iiurlwidth', '1200');
  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const first = pages[0];
  const info = first?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
}

/**
 * Trouve le premier candidat photo à afficher dans l'en-tête d'une fiche biodiversité
 * (champs `photo` puis `photo_species`, dans cet ordre).
 *
 * Retourne :
 * - `{ kind: 'direct', src: string }` pour une image directement affichable
 *   (URL HTTP d'image, chemin `/uploads/…`, ou URL FilePath Commons).
 * - `{ kind: 'category', categoryUrl: string }` pour une catégorie Commons
 *   (le contenu doit être chargé via `fetchCommonsCategoryPreview`).
 * - `null` si aucun candidat n'est trouvé.
 *
 * @param {Record<string, unknown>} plant - Fiche plante (champs `photo`, `photo_species`…).
 * @returns {{ kind: 'direct', src: string } | { kind: 'category', categoryUrl: string } | null}
 */
export function findFirstBiodivHeroPhotoCandidate(plant) {
  if (!plant || typeof plant !== 'object') return null;
  for (const key of BIODIV_HERO_PHOTO_KEYS) {
    const entries = parseLinkCandidates(plant[key]).filter(
      (e) => isHttpLink(e) || isLocalUploadsPath(e),
    );
    for (const entry of entries) {
      if (isLikelyDirectImageUrl(entry)) return { kind: 'direct', src: entry };
      const fileSrc = commonsFilePageToDisplaySrc(entry);
      if (fileSrc) return { kind: 'direct', src: fileSrc };
      if (parseCommonsCategoryFromUrl(entry))
        return { kind: 'category', categoryUrl: entry };
    }
  }
  return null;
}
