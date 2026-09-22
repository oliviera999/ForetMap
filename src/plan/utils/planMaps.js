/**
 * Plan affiché : lien profond `?map_id=` et mémoire d'appareil.
 *
 * Un établissement peut publier plusieurs plans (bâtiment principal, annexe, internat…) —
 * l'administrateur déclare lesquels sont proposés (`ui.<surface>.selectable_map_ids`), le
 * serveur les sert sous `maps`, et cet écran-ci en choisit un. Deux exigences :
 *
 *  - **partageable** : le plan choisi vit dans l'adresse, comme `?lieu=` et `?parcours=` —
 *    un QR code d'annexe doit ouvrir l'annexe, et une adresse copiée doit rouvrir le même
 *    plan chez le collègue ;
 *  - **mémorisé** : au prochain déverrouillage, l'agent qui travaille sur l'annexe doit la
 *    retrouver plutôt que de rebasculer sur le bâtiment principal.
 *
 * L'adresse fait foi quand elle porte un identifiant : elle est plus récente et plus
 * explicite que la mémoire de l'appareil.
 */

/** Identifiant de plan porté par l'adresse (`?map_id=`), ou `''`. */
export function readMapIdFromLocation(search) {
  return String(new URLSearchParams(String(search || '')).get('map_id') || '').trim();
}

/**
 * Adresse courante avec `?map_id=` posé (ou retiré si `mapId` est vide). Les autres
 * paramètres sont conservés : changer de plan ne doit pas perdre le lieu ouvert.
 */
export function buildMapUrl(location, mapId) {
  const params = new URLSearchParams(String(location?.search || ''));
  if (mapId) params.set('map_id', mapId);
  else params.delete('map_id');
  const query = params.toString();
  return `${location?.pathname || '/'}${query ? `?${query}` : ''}`;
}
