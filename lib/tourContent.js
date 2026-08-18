const { z } = require('zod');
const { queryOne, execute } = require('../database');

/**
 * Surcharges éditoriales des visites guidées (`DISCOVERY_TOURS`).
 *
 * ## Pourquoi une surcharge par clé, et pas un corpus en base
 *
 * Un parcours est fait de deux matières de nature différente : de la **structure**
 * (sélecteurs CSS, placement de la bulle, rôle) et du **texte**. La structure n'est
 * pas de l'éditorial — un sélecteur saisi à la main dans un formulaire est un moyen
 * simple de faire disparaître une étape sans message d'erreur (une étape dont la
 * cible est absente du DOM est ignorée silencieusement). Elle reste donc en code.
 *
 * Ne circule ici que ce qui se relit : trois champs de texte par étape, rangés sous
 * des clés plates `<parcours>.<étape>.<champ>`. Le corpus par défaut n'est **pas**
 * dupliqué côté serveur : il vit dans `src/constants/discoveryTour.js` et c'est le
 * client qui applique la surcharge par-dessus (`applyTourOverrides`). Conséquence
 * utile : améliorer un texte versionné reste visible partout où personne n'a
 * réécrit ce champ précis — la même propriété que le dégel du registre d'aide
 * (v1.95.1), obtenue ici par construction.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §7.1 et §11.4.
 */

const TOUR_REGISTRY_KEY = 'content.tour.registry';

/** Champs de texte éditables — miroir de `TOUR_EDITABLE_FIELDS` côté client. */
const TOUR_EDITABLE_FIELDS = ['title', 'body', 'bodyTeacher'];

/** Longueur maximale d'un texte de bulle. Aligné sur les items de panneau d'aide. */
const MAX_TEXT_LENGTH = 500;

/**
 * Nombre maximal de clés stockées. Le corpus compte 21 étapes × 3 champs ; la marge
 * couvre l'ajout de parcours sans laisser le réglage grossir sans limite.
 */
const MAX_ENTRIES = 200;

/**
 * Forme d'une clé de surcharge : `<parcours>.<étape>.<champ>`.
 *
 * Les identifiants de parcours et d'étape ne sont **pas** validés contre le corpus :
 * le serveur ne le connaît pas, et une clé orpheline est inoffensive (le client ne
 * lit que les clés des étapes qu'il rend). La forme, elle, est vérifiée — c'est ce
 * qui empêche d'utiliser ce réglage comme un dépotoir de chaînes arbitraires.
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
 * Normalise un registre brut : ne conserve que les clés bien formées et les textes
 * non vides après rognage.
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

/** Registre stocké, ou `{}` si aucune ligne n'existe ou si la valeur est illisible. */
async function getTourRegistryFromDb() {
  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ?', [
    TOUR_REGISTRY_KEY,
  ]);
  if (!row || !row.value_json) return {};
  try {
    const parsed = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return normalizeTourRegistry(parsed);
  } catch (_) {
    // Valeur corrompue : on rend le corpus versionné plutôt que de casser l'aide.
    return {};
  }
}

/** Écrit le registre normalisé. Un registre vide efface toute personnalisation. */
async function saveTourRegistryToDb(registry, actor = {}) {
  const normalized = normalizeTourRegistry(registry);
  await execute(
    `INSERT INTO app_settings
      (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at)
     VALUES (?, 'public', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      value_json = VALUES(value_json),
      updated_by_user_type = VALUES(updated_by_user_type),
      updated_by_user_id = VALUES(updated_by_user_id),
      updated_at = NOW()`,
    [TOUR_REGISTRY_KEY, JSON.stringify(normalized), actor.userType || null, actor.userId || null],
  );
  return normalized;
}

module.exports = {
  TOUR_REGISTRY_KEY,
  TOUR_EDITABLE_FIELDS,
  MAX_TEXT_LENGTH,
  MAX_ENTRIES,
  OVERRIDE_KEY_RE,
  tourRegistrySchema,
  normalizeTourRegistry,
  getTourRegistryFromDb,
  saveTourRegistryToDb,
};
