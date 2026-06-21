/**
 * Helpers purs du formulaire biodiversité — extraits de `foretmap-views.jsx` (O6).
 *
 * Choix du nom vernaculaire (heuristique « plutôt français »), clé de pré-saisie photo, et recherche
 * de la première photo « héro » exploitable d'une fiche. Logique sinon noyée dans le JSX, isolée et testée.
 */
import { parseLinkCandidates } from './plantFormValues.js';
import {
  isHttpLink,
  isLocalUploadsPath,
  isLikelyDirectImageUrl,
  commonsFilePageToDisplaySrc,
  parseCommonsCategoryFromUrl,
} from './plantSourceLinks.js';

/** Champs candidats pour la vignette « photo principale » sous la description (ordre de priorité). */
export const BIODIV_HERO_PHOTO_KEYS = ['photo', 'photo_species'];

/**
 * Choisit un nom vernaculaire dans une liste : privilégie ceux « à consonance française »
 * (accents ou articles élidés), sinon le premier. Retourne '' si la liste est vide.
 */
export function pickPlantnetVernacularName(commonNames) {
  const list = Array.isArray(commonNames)
    ? commonNames.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!list.length) return '';
  const frHint = (s) =>
    /[àâäéèêëïîôùûüçœæ]/i.test(s) || /\b(l'|d'|de la |des |le |la |les |du |au )\b/i.test(` ${s} `);
  const scored = list.map((s) => ({ s, score: frHint(s) ? 2 : 0 }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0].s;
  return list[0];
}

/** Clé stable d'un emplacement de pré-saisie photo : `field:idx`. */
export function prefillPhotoSlotKey(field, idx) {
  return `${String(field).trim()}:${Number(idx)}`;
}

/**
 * Première photo « héro » exploitable d'une fiche (champs `photo`/`photo_species`) :
 * image directe, page fichier Commons (→ src), ou catégorie Commons (→ aperçu). `null` si aucune.
 */
export function findFirstBiodivHeroPhotoCandidate(plant) {
  for (const key of BIODIV_HERO_PHOTO_KEYS) {
    const entries = parseLinkCandidates(plant[key]).filter(
      (e) => isHttpLink(e) || isLocalUploadsPath(e),
    );
    for (const entry of entries) {
      if (isLikelyDirectImageUrl(entry)) return { kind: 'direct', src: entry };
      const fileSrc = commonsFilePageToDisplaySrc(entry);
      if (fileSrc) return { kind: 'direct', src: fileSrc };
      if (parseCommonsCategoryFromUrl(entry)) return { kind: 'category', categoryUrl: entry };
    }
  }
  return null;
}
