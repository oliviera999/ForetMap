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
 * sous-ensemble. Les deux se testent côte à côte (`tests/plan-linked-text.test.js`).
 *
 * MISE EN BLOCS (`splitPlanTextBlocks`)
 * ------------------------------------
 * Les liens ne suffisaient pas. Les compléments réservés d'un lieu (`location_notes`) et les
 * descriptions sont rédigés dans la console, avec la chaîne Markdown complète : paragraphes
 * séparés par une ligne vide, listes à puces `- `. Le Plan rendait tout cela dans un unique
 * `<p>` — et HTML replie les retours à la ligne en espaces. Un encart aéré en trois blocs et
 * cinq puces arrivait donc sur proflyautey en un seul pavé, tirets compris, alors que le même
 * texte s'affichait correctement sur la carte de travail et dans la Visite.
 *
 * On couvre donc ici les trois seules constructions qui portent la mise en forme d'une
 * consigne : la ligne vide (nouveau paragraphe), le retour à la ligne simple (saut de ligne,
 * comme `marked` avec `breaks: true`) et la puce `- ` / `* ` en début de ligne. Le reste du
 * Markdown (gras, titres, tableaux) reste volontairement hors périmètre : ce serait remettre
 * un moteur Markdown dans le bundle qu'on cherche à garder mince.
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

/** Puce de liste en début de ligne : `- ` ou `* `, après une éventuelle indentation. */
const LIST_ITEM_RE = /^\s*[-*]\s+(.*)$/;

/**
 * Découpe un texte en blocs affichables : paragraphes et listes à puces.
 *
 * Les lignes vides séparent les blocs. Une suite de lignes commençant par `- ` (ou `* `) forme
 * une liste ; toute autre suite forme un paragraphe dont chaque ligne est un saut de ligne.
 * Chaque ligne est ensuite découpée en segments par `splitPlanTextLinks`, si bien qu'un lien
 * reste cliquable à l'intérieur d'une puce.
 *
 * @param {string} text
 * @returns {Array<{ type: 'paragraph' | 'list',
 *   lines: Array<ReturnType<typeof splitPlanTextLinks>> }>}
 *   `lines` = les lignes du paragraphe, ou les éléments de la liste (puce retirée).
 */
export function splitPlanTextBlocks(text) {
  const source = String(text ?? '');
  if (!source.trim()) return [];
  const blocks = [];
  let current = null;
  const flush = () => {
    if (current && current.lines.length > 0) blocks.push(current);
    current = null;
  };
  // `\r\n` et `\r` normalisés : un texte collé depuis un traitement de texte Windows ne doit
  // pas produire une ligne vide sur deux.
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (!rawLine.trim()) {
      flush();
      continue;
    }
    const bullet = LIST_ITEM_RE.exec(rawLine);
    const type = bullet ? 'list' : 'paragraph';
    // Une puce qui suit un paragraphe (ou l'inverse) ouvre un bloc, sans ligne vide requise.
    if (!current || current.type !== type) {
      flush();
      current = { type, lines: [] };
    }
    const content = bullet ? bullet[1] : rawLine.trim();
    const segments = splitPlanTextLinks(content);
    // `splitPlanTextLinks('')` rend `[]` : une puce vide (« - ») ne crée pas d'élément muet.
    if (segments.length > 0) current.lines.push(segments);
  }
  flush();
  return blocks;
}
