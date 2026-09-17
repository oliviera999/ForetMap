/**
 * Texte éditorial du Plan avec ses liens cliquables — pendant **léger** de
 * `MarkdownContent` (ForetMap / Visite).
 *
 * Pourquoi ne pas réutiliser `MarkdownContent` : il embarque `marked` + `DOMPurify`, soit
 * l'essentiel d'un moteur Markdown dans un bundle que le Plan garde volontairement mince —
 * il est chargé sur le téléphone d'un visiteur, souvent en réseau d'établissement. Le besoin
 * réel ici n'est pas le Markdown complet, c'est **le lien** : sans ce module, une description
 * rédigée sur la carte de travail s'affichait sur le Plan sous sa forme brute,
 * `[Fiche PDF](https://…)`, crochets et parenthèses compris.
 *
 * Aucune insertion de HTML : les segments sont rendus en éléments React, donc le texte de
 * l'auteur est échappé par React lui-même. La politique de lien reproduit celle de
 * `src/shared/platform/markdown.js` — externe en nouvel onglet, interne et contact dans
 * l'onglet courant, le reste laissé en texte. Elle n'est pas importée de là : `src/plan/**`
 * ne doit pas tirer la chaîne Markdown, et ce module ne couvre volontairement qu'un
 * sous-ensemble (les liens). Les deux se testent côte à côte
 * (`tests/plan-linked-text.test.js`).
 */

/** `[libellé](cible)` puis URL nue — l'ordre compte : la forme Markdown gagne. */
const LINK_TOKEN_RE = /\[([^\]\n]+)\]\(([^\s)]+)\)|(\bhttps?:\/\/[^\s<>()[\]]+)/g;

/** Ponctuation collée à une URL nue : elle appartient à la phrase, pas au lien. */
const TRAILING_PUNCTUATION_RE = /[.,;:!?»”']+$/;

const EXTERNAL_LINK_HINT = '(ouvre un nouvel onglet)';

/**
 * @param {string} href
 * @returns {'external' | 'internal' | 'contact' | null} `null` = ce n'est pas un lien.
 */
export function classifyPlanHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return 'external';
  if (/^(?:mailto|tel):[^\s<>"'`]+$/i.test(raw)) return 'contact';
  // `//autre-site` et `/\autre-site` valent une origine externe déguisée en chemin.
  if (/^\/(?![/\\])[^\s<>"'`]*$/.test(raw)) return 'internal';
  return null;
}

/**
 * Découpe un texte en segments affichables.
 *
 * @param {string} text
 * @returns {Array<{ type: 'text', value: string }
 *   | { type: 'link', label: string, href: string, kind: 'external'|'internal'|'contact' }>}
 */
export function splitPlanTextLinks(text) {
  const source = String(text ?? '');
  if (!source) return [];
  const out = [];
  let cursor = 0;
  let match;
  LINK_TOKEN_RE.lastIndex = 0;
  while ((match = LINK_TOKEN_RE.exec(source)) !== null) {
    const [whole, mdLabel, mdHref, bareUrl] = match;
    let label = mdLabel;
    let href = mdHref;
    let consumed = whole.length;
    if (bareUrl) {
      // URL nue : on rend la ponctuation finale à la phrase avant de classer.
      const trimmed = bareUrl.replace(TRAILING_PUNCTUATION_RE, '');
      consumed = whole.length - (bareUrl.length - trimmed.length);
      label = trimmed;
      href = trimmed;
    }
    const kind = classifyPlanHref(href);
    if (!kind) continue; // Cible non reconnue : le texte reste tel quel.
    if (match.index > cursor) {
      out.push({ type: 'text', value: source.slice(cursor, match.index) });
    }
    out.push({ type: 'link', label: String(label).trim(), href: String(href).trim(), kind });
    cursor = match.index + consumed;
    LINK_TOKEN_RE.lastIndex = cursor;
  }
  if (cursor < source.length) {
    out.push({ type: 'text', value: source.slice(cursor) });
  }
  return out;
}
