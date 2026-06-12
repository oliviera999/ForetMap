/**
 * Réglages mascotte de visite (publicSettings) — parsing pur extrait de `visit-views.jsx` (O6).
 */

/** Renderer mascotte par défaut si aucun n'est configuré. */
export const VISIT_MASCOT_DEFAULT_ID = 'renard2-cut-spritesheet';

/**
 * Liste des ids de mascotte autorisés : accepte un tableau ou une chaîne (séparateurs `,`/`;`/saut
 * de ligne). Trimme, retire les vides. Toute autre valeur → `[]`.
 */
export function parseVisitMascotAllowedIds(raw) {
  if (Array.isArray(raw)) return raw.map((id) => String(id || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,\n;]+/g)
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  }
  return [];
}

/** Id de mascotte par défaut : valeur configurée trimée, sinon `VISIT_MASCOT_DEFAULT_ID`. */
export function resolveVisitMascotDefaultId(raw) {
  return String(raw || '').trim() || VISIT_MASCOT_DEFAULT_ID;
}
