/**
 * Convention médiathèque des scènes de récit de chapitre — source unique
 * partagée client (src/gl/assets) et serveur (lib/glMediaKeysAudit,
 * lib/mediaLibraryUsage, lib/glChapterScenes).
 *
 * Clés : `recit_00-prologue_*` (prologue) et `recit_0N-chapN_*` (pays 1–5).
 * Les feuillets de Sélène utilisent le préfixe dédié `recit_feuillet-action_*`.
 */

export const GL_CHAPTER_RECIT_MIN = 0;
export const GL_CHAPTER_RECIT_MAX = 5;
export const GL_FEUILLET_RECIT_PREFIX = 'recit_feuillet-action_';

/** Préfixe de clé média des scènes d'un chapitre (0 = prologue), ou null hors plage. */
export function chapterRecitPrefix(chapterNumber) {
  if (chapterNumber === null || chapterNumber === undefined || chapterNumber === '') return null;
  const n = Number(chapterNumber);
  if (!Number.isInteger(n) || n < GL_CHAPTER_RECIT_MIN || n > GL_CHAPTER_RECIT_MAX) return null;
  if (n === 0) return 'recit_00-prologue_';
  return `recit_0${n}-chap${n}_`;
}

/** Références { ref, prefix, chapterNumber } du prologue et des chapitres 1–5. */
export function chapterRecitRefs() {
  const refs = [{ ref: 'prologue', prefix: chapterRecitPrefix(0), chapterNumber: 0 }];
  for (let n = 1; n <= GL_CHAPTER_RECIT_MAX; n += 1) {
    refs.push({ ref: `chap${n}`, prefix: chapterRecitPrefix(n), chapterNumber: n });
  }
  return refs;
}

/** Numéro de chapitre (0 = prologue) d'une clé scène de récit, ou null. */
export function parseChapterRecitKey(stableKey) {
  const key = String(stableKey || '').trim().toLowerCase();
  if (!key) return null;
  for (const { prefix, chapterNumber } of chapterRecitRefs()) {
    if (prefix && key.startsWith(prefix)) return chapterNumber;
  }
  return null;
}

/**
 * Clés `recit*` suspectes : elles ressemblent à une scène de récit mais ne
 * matchent ni un chapitre valide ni un feuillet — typiquement une faute de
 * frappe qui rend l'image invisible en jeu.
 */
export function findSuspectRecitKeys(keys) {
  return (Array.isArray(keys) ? keys : [])
    .map((key) => String(key || '').trim())
    .filter((key) => /^recit[_-]/i.test(key))
    .filter((key) => !key.toLowerCase().startsWith(GL_FEUILLET_RECIT_PREFIX))
    .filter((key) => parseChapterRecitKey(key) === null)
    .sort();
}
