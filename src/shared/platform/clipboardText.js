/**
 * Copie une chaîne dans le presse-papiers.
 * Préfère `navigator.clipboard` ; repli `document.execCommand('copy')` pour les
 * contextes sans API Clipboard (HTTP local, navigateurs anciens).
 *
 * @param {string} text
 * @returns {Promise<boolean>} `true` si la copie a réussi
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }

  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}
