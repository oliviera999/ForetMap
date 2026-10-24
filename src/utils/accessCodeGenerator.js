/**
 * Générateur de code d'accès des plans (plan public, plan des personnels, plan e-nov).
 *
 * Le code est tiré **dans le navigateur de l'administrateur** (`crypto.getRandomValues`) : il
 * ne transite qu'une fois, au moment de l'enregistrer, et le serveur n'en garde que
 * l'empreinte bcrypt (`POST /api/settings/admin/*-access-code`).
 *
 * Alphabet : minuscules et chiffres, **sans caractères ambigus** (ni `0`/`o`, ni `1`/`i`/`l`) —
 * le code se recopie d'une affiche ou d'un message, souvent au téléphone, où la casse coûte
 * une manipulation de plus. 31 symboles sur 14 positions donnent environ 69 bits d'entropie.
 *
 * Tirage sans biais : un octet n'est retenu que s'il tombe sous le plus grand multiple de la
 * taille de l'alphabet (248 = 8 × 31) ; prendre `octet % 31` sur toute la plage favoriserait
 * les premiers symboles. Même approche que la fonction `randomInt` de Node.js (rejet des
 * valeurs hors plage), https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback.
 */

/** Minuscules sans `i`, `l`, `o` ; chiffres sans `0` ni `1`. */
export const ACCESS_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Longueur minimale exigée par le serveur à l'enregistrement (`routes/settings.js`). */
export const ACCESS_CODE_MIN_LENGTH = 12;

/** Longueur proposée par le générateur (≈ 69 bits). */
export const GENERATED_ACCESS_CODE_LENGTH = 14;

/** Plus grand multiple de la taille de l'alphabet qui tient dans un octet. */
const UNBIASED_BYTE_LIMIT = 256 - (256 % ACCESS_CODE_ALPHABET.length);

/**
 * Tire un code aléatoire.
 * @param {number} [length] longueur voulue (au moins `ACCESS_CODE_MIN_LENGTH`).
 * @param {{ getRandomValues: (buffer: Uint8Array) => Uint8Array }} [cryptoImpl] source
 *   d'aléa (injectable pour les tests) ; par défaut `globalThis.crypto`.
 * @returns {string}
 */
export function generateAccessCode(
  length = GENERATED_ACCESS_CODE_LENGTH,
  cryptoImpl = globalThis.crypto,
) {
  const size = Math.floor(Number(length));
  if (!Number.isFinite(size) || size < ACCESS_CODE_MIN_LENGTH) {
    throw new RangeError(`Un code d’accès fait au moins ${ACCESS_CODE_MIN_LENGTH} caractères`);
  }
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Générateur aléatoire du navigateur indisponible');
  }
  let out = '';
  const buffer = new Uint8Array(size * 2);
  while (out.length < size) {
    cryptoImpl.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      out += ACCESS_CODE_ALPHABET[byte % ACCESS_CODE_ALPHABET.length];
      if (out.length === size) break;
    }
  }
  return out;
}
