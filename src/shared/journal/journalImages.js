/** Repli neutre : aucun produit ne fournit de réécriture d'images. */
export function useHtmlAsIs(html) {
  return html;
}

/**
 * Illustrations à montrer en vignettes sous le texte : celles que le texte n'affiche pas déjà.
 * « Ajouter une image » insère l'image dans le corps de l'article ET l'enregistre comme
 * illustration ; la carte de lecture la montrait donc deux fois. Les illustrations sans place
 * dans le texte (anciennes observations reprises, image retirée du texte mais gardée) restent
 * en vignettes. La comparaison ignore la requête d'une URL signée (G&L), qui change d'un
 * chargement à l'autre.
 *
 * @param {Array<{ url?: string }>} assets
 * @param {string} bodyMarkdown
 * @returns {Array<object>}
 */
export function assetsNotInBody(assets, bodyMarkdown) {
  const list = Array.isArray(assets) ? assets : [];
  const body = String(bodyMarkdown || '');
  if (!body) return list;
  return list.filter((a) => {
    const path = String(a?.url || '').split('?')[0];
    return !path || !body.includes(path);
  });
}
