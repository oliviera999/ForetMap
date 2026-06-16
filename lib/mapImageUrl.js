/**
 * URLs d’image de plan : garde-fous historiques pour foret / n3,
 * sinon renvoie l’URL fournie ou un repli générique.
 */
function normalizeMapImageUrl(mapId, mapImageUrl) {
  const raw = (mapImageUrl || '').trim();
  if (mapId === 'foret') {
    if (
      !raw ||
      raw === '/maps/map-foret.png' ||
      raw === '/maps/map-foret.svg' ||
      raw === '/map.png'
    ) {
      return '/map.png';
    }
    return raw;
  }
  if (mapId === 'n3') {
    if (
      !raw ||
      raw === '/maps/map-n3.png' ||
      raw === '/maps/map-n3.svg' ||
      raw === '/maps/plan n3.jpg'
    ) {
      return '/maps/plan%20n3.jpg';
    }
    return raw;
  }
  return raw || '/map.png';
}

module.exports = { normalizeMapImageUrl };
