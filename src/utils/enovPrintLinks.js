/**
 * Liens vers la page d'impression du plan e-nov (`/impression`, servie par l'hôte `enov.*`)
 * depuis la console ForetMap (Réglages → Plan Lyautey → Plan e-nov).
 *
 * La console ne vit pas sur l'hôte du plan e-nov : l'adresse se **déduit** de l'adresse
 * publique du Plan Lyautey (`ui.plan.public_base_url`, ex. `https://planlyautey.olution.info`)
 * ou, à défaut, de l'hôte de la console, en remplaçant le premier label du nom d'hôte par
 * `enov` (`foretmap.olution.info` → `enov.olution.info`) — c'est la convention de domaines des
 * produits (`docs/reference/exploitation/marque-et-domaines.md`). Un hôte sans sous-domaine
 * (`localhost`, poste de développement) est gardé tel quel.
 */

/**
 * Origine du plan e-nov (`https://enov.example.fr`), ou `''` si rien d'exploitable.
 * @param {string} publicPlanBaseUrl réglage `ui.plan.public_base_url` (peut être vide).
 * @param {string} consoleOrigin `window.location.origin`.
 */
export function enovOriginFrom(publicPlanBaseUrl, consoleOrigin) {
  const candidates = [publicPlanBaseUrl, consoleOrigin].map((v) => String(v || '').trim());
  for (const candidate of candidates) {
    if (!candidate) continue;
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    const labels = url.hostname.split('.');
    const isIp = /^\d+(\.\d+){3}$/.test(url.hostname);
    if (labels.length >= 3 && !isIp) labels[0] = 'enov';
    return `${url.protocol}//${labels.join('.')}${url.port ? `:${url.port}` : ''}`;
  }
  return '';
}

/**
 * Adresse de la page d'impression pour une ou plusieurs cartes (vide = toutes les cartes
 * publiées sur le plan e-nov).
 * @param {string} origin résultat de {@link enovOriginFrom}.
 * @param {string[]} [mapIds]
 */
export function enovPrintUrl(origin, mapIds = []) {
  const base = `${String(origin || '').replace(/\/+$/, '')}/impression`;
  const ids = (mapIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  return ids.length ? `${base}?map_id=${ids.map(encodeURIComponent).join(',')}` : base;
}
