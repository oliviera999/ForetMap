'use strict';

const { z } = require('zod');

/**
 * Noyau des **surcharges éditoriales de visites guidées** — partagé ForetMap / G&L.
 *
 * ## Pourquoi une surcharge par clé, et pas un corpus en base
 *
 * Un parcours est fait de deux matières de nature différente : de la **structure**
 * (sélecteurs CSS, placement de la bulle, rôle) et du **texte**. La structure n'est pas
 * de l'éditorial — un sélecteur saisi à la main dans un formulaire est un moyen simple
 * de faire disparaître une étape sans message d'erreur (une étape dont la cible est
 * absente du DOM est ignorée en silence). Elle reste donc en code.
 *
 * Ne circule ici que ce qui se relit : des champs de texte rangés sous des clés plates
 * `<parcours>.<étape>.<champ>`. Le corpus par défaut n'est **pas** dupliqué côté
 * serveur — il vit dans le registre du produit, et c'est le client qui applique la
 * surcharge par-dessus. Conséquence utile : améliorer un texte versionné reste visible
 * partout où personne n'a réécrit ce champ précis.
 *
 * Seule la **persistance** reste chez l'appelant : `app_settings` pour ForetMap,
 * `gl_settings` pour GL — même partage que `lib/shared/jsonDefaultsStore.js`.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §7.1, §11.4 et §16.
 */

/** Champs de texte éditables — miroir de `TOUR_EDITABLE_FIELDS` côté client. */
const TOUR_EDITABLE_FIELDS = Object.freeze(['title', 'body', 'bodyTeacher']);

/** Longueur maximale d'un texte de bulle. Aligné sur les items de panneau d'aide. */
const MAX_TEXT_LENGTH = 500;

/**
 * Nombre maximal de clés stockées. La marge couvre l'ajout de parcours sans laisser le
 * réglage grossir sans limite.
 */
const MAX_ENTRIES = 200;

/**
 * Forme d'une clé de surcharge : `<parcours>.<étape>.<champ>`.
 *
 * Les identifiants de parcours et d'étape ne sont **pas** validés contre le corpus : le
 * serveur ne le connaît pas, et une clé orpheline est inoffensive (le client ne lit que
 * les clés des étapes qu'il rend). La forme, elle, est vérifiée — c'est ce qui empêche
 * d'utiliser ce réglage comme un dépotoir de chaînes arbitraires.
 */
const OVERRIDE_KEY_RE = new RegExp(
  `^[a-zA-Z][a-zA-Z0-9_-]{0,39}\\.[a-zA-Z][a-zA-Z0-9_-]{0,39}\\.(${TOUR_EDITABLE_FIELDS.join('|')})$`,
);

const tourRegistrySchema = z
  .record(z.string().regex(OVERRIDE_KEY_RE), z.string().max(MAX_TEXT_LENGTH))
  .refine((value) => Object.keys(value).length <= MAX_ENTRIES, {
    message: `Au maximum ${MAX_ENTRIES} surcharges de parcours`,
  });

/**
 * Normalise un registre brut : ne conserve que les clés bien formées et les textes non
 * vides après rognage.
 *
 * **Une chaîne vide n'est pas une surcharge, c'est un retour au défaut.** Contrairement
 * au registre d'aide — où vider une ligne est une décision qu'on veut conserver — une
 * bulle de parcours sans texte n'a pas de rendu acceptable. Effacer le champ dans le
 * formulaire est donc l'unique geste pour revenir au texte versionné, et il ne laisse
 * aucune trace en base.
 */
function normalizeTourRegistry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!OVERRIDE_KEY_RE.test(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[key] = trimmed.slice(0, MAX_TEXT_LENGTH);
  }
  return normalized;
}

/** Lit une valeur stockée et la normalise ; toute valeur illisible rend `{}`. */
function resolveStoredTourRegistry(storedValue) {
  if (!storedValue) return {};
  try {
    const parsed = typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue;
    return normalizeTourRegistry(parsed);
  } catch (_) {
    // Valeur corrompue : on rend le corpus versionné plutôt que de casser les visites.
    return {};
  }
}

module.exports = {
  TOUR_EDITABLE_FIELDS,
  MAX_TEXT_LENGTH,
  MAX_ENTRIES,
  OVERRIDE_KEY_RE,
  tourRegistrySchema,
  normalizeTourRegistry,
  resolveStoredTourRegistry,
};
