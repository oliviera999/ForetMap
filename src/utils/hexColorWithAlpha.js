/**
 * Couleurs hexadécimales avec canal alpha optionnel — logique pure.
 *
 * Les couleurs de catégories de lieux (et les couleurs de zones) sont stockées en
 * `#rrggbb` **ou** `#rrggbbaa` : la transparence fait partie du rendu sur la carte
 * (un remplissage opaque masquerait le plan). Or `<input type="color">` ne sait
 * afficher et produire que du `#rrggbb` sur 6 chiffres.
 *
 * Ces helpers font le pont : le sélecteur n'expose que la teinte, et l'alpha déjà
 * saisi dans le champ texte est reconduit tel quel.
 */

/** Couleur de repli quand la saisie n'est pas exploitable par le sélecteur. */
export const DEFAULT_PICKER_HEX = '#86efac';

const HEX_WITH_OPTIONAL_ALPHA_RE = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
const SHORT_HEX_RE = /^#([0-9a-f]{3})$/i;

/** Découpe une couleur en `{ rgb, alpha }` ; `null` si la forme n'est pas reconnue. */
export function splitHexColor(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const short = SHORT_HEX_RE.exec(raw);
  if (short) {
    // #abc → #aabbcc : le sélecteur natif refuse la forme courte.
    const expanded = short[1]
      .split('')
      .map((c) => c + c)
      .join('');
    return { rgb: `#${expanded}`.toLowerCase(), alpha: '' };
  }

  const match = HEX_WITH_OPTIONAL_ALPHA_RE.exec(raw);
  if (!match) return null;
  return { rgb: `#${match[1]}`.toLowerCase(), alpha: (match[2] || '').toLowerCase() };
}

/**
 * Valeur à donner à `<input type="color">` : la teinte seule, sur 6 chiffres.
 * Une saisie invalide ou en cours de frappe retombe sur `fallback` — le sélecteur
 * natif rejette silencieusement toute autre valeur et afficherait du noir.
 */
export function colorPickerValue(value, fallback = DEFAULT_PICKER_HEX) {
  return splitHexColor(value)?.rgb || fallback;
}

/**
 * Applique la teinte choisie au sélecteur en **conservant l'alpha** de la valeur
 * courante. `#86efac90` + teinte `#fca5a5` → `#fca5a590`.
 */
export function applyPickedHexColor(currentValue, pickedRgb) {
  const picked = splitHexColor(pickedRgb);
  if (!picked) return String(currentValue ?? '');
  const alpha = splitHexColor(currentValue)?.alpha || '';
  return `${picked.rgb}${alpha}`;
}

/** La valeur est-elle une couleur hexadécimale exploitable (avec ou sans alpha) ? */
export function isHexColorWithOptionalAlpha(value) {
  return splitHexColor(value) !== null;
}
