/**
 * Générateurs de code d’accès et de mot de passe des plans (plan public, plan des personnels,
 * plan e-nov).
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

/**
 * Mot de passe des plans (mode d'accès « Mot de passe », `lib/accessSecret.js`) : un vrai mot
 * de passe alphanumérique — majuscules, minuscules et chiffres, toujours les trois —, tiré lui
 * aussi sans caractères ambigus (ni `0`/`O`/`o`, ni `1`/`I`/`l`/`i`). 55 symboles sur 14
 * positions : environ 80 bits.
 */
export const ACCESS_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Longueur proposée par le générateur de mot de passe. */
export const GENERATED_ACCESS_PASSWORD_LENGTH = 14;

/** Longueur maximale acceptée par le serveur (code comme mot de passe). */
export const ACCESS_SECRET_MAX_LENGTH = 64;

/** Plus grand multiple de la taille de l'alphabet du mot de passe qui tient dans un octet. */
const UNBIASED_PASSWORD_BYTE_LIMIT = 256 - (256 % ACCESS_PASSWORD_ALPHABET.length);

const HAS_LOWER_RE = /[a-z]/;
const HAS_UPPER_RE = /[A-Z]/;
const HAS_DIGIT_RE = /[0-9]/;

/**
 * Tire un mot de passe : même tirage sans biais que `generateAccessCode`, recommencé tant
 * qu'il manque une minuscule, une majuscule ou un chiffre (rare : moins d'une fois sur cinq).
 * @param {number} [length]
 * @param {{ getRandomValues: (buffer: Uint8Array) => Uint8Array }} [cryptoImpl]
 * @returns {string}
 */
export function generateAccessPassword(
  length = GENERATED_ACCESS_PASSWORD_LENGTH,
  cryptoImpl = globalThis.crypto,
) {
  const size = Math.floor(Number(length));
  if (!Number.isFinite(size) || size < ACCESS_CODE_MIN_LENGTH) {
    throw new RangeError(`Un mot de passe fait au moins ${ACCESS_CODE_MIN_LENGTH} caractères`);
  }
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Générateur aléatoire du navigateur indisponible');
  }
  const buffer = new Uint8Array(size * 2);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let out = '';
    while (out.length < size) {
      cryptoImpl.getRandomValues(buffer);
      for (const byte of buffer) {
        if (byte >= UNBIASED_PASSWORD_BYTE_LIMIT) continue;
        out += ACCESS_PASSWORD_ALPHABET[byte % ACCESS_PASSWORD_ALPHABET.length];
        if (out.length === size) break;
      }
    }
    if (HAS_LOWER_RE.test(out) && HAS_UPPER_RE.test(out) && HAS_DIGIT_RE.test(out)) return out;
  }
  throw new Error('Génération du mot de passe impossible');
}

/**
 * Miroir de la règle serveur (`validateAccessSecret`, `lib/accessSecret.js`) : vide = rien à
 * signaler ; sinon 12 à 64 caractères et, pour un mot de passe, au moins une lettre et un
 * chiffre. Le serveur reste juge : ce contrôle évite seulement un aller-retour.
 * @param {'code'|'password'} kind
 * @param {string} value
 * @returns {string} message d'erreur, ou `''`.
 */
export function accessSecretProblem(kind, value) {
  const secret = String(value ?? '');
  if (!secret) return '';
  const noun = kind === 'password' ? 'Mot de passe' : 'Code';
  if (secret.length > ACCESS_SECRET_MAX_LENGTH) {
    return `${noun} trop long (${ACCESS_SECRET_MAX_LENGTH} caractères maximum)`;
  }
  if (secret.length < ACCESS_CODE_MIN_LENGTH) {
    return `${noun} trop court (${ACCESS_CODE_MIN_LENGTH} caractères minimum)`;
  }
  if (kind === 'password' && !(/\p{L}/u.test(secret) && /\p{Nd}/u.test(secret))) {
    return 'Le mot de passe doit mêler lettres et chiffres (au moins une lettre et un chiffre)';
  }
  return '';
}
