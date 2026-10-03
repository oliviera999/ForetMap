/**
 * Biome de la musique de plateau d'une partie, d'après la progression des équipes.
 *
 * La musique de plateau est **commune à toute la partie** : elle suit la case la plus avancée
 * jamais atteinte par une équipe (positions actuelles + déplacements du journal), et ne recule
 * jamais. Sur le plateau 4, c'est ce qui fait passer toute la classe de la taïga à l'été
 * polaire, puis à la nuit polaire — irréversible dès qu'une équipe atteint la première case
 * `toundra_hiver`, même si elle recule ensuite.
 *
 * Le biome retenu est le sous-biome de cette case (`gl_chapter_markers.sous_biome_slug`) ; une
 * case sans biome propre (`transition`, vide) garde celui de la case précédente. Sans case
 * atteinte ni sous-biome, on retombe sur le biome du chapitre (comportement historique).
 */
import { sortMarkersByPath } from './glBoardPath.js';
import { resolveBiome } from '../data/biomes.registry.js';

function eventMoveMarkerId(event) {
  const type = String(event?.eventType ?? event?.event_type ?? '').trim();
  if (type !== 'move') return null;
  let payload = event?.payload ?? null;
  if (!payload && typeof event?.payload_json === 'string') {
    try {
      payload = JSON.parse(event.payload_json);
    } catch (_) {
      payload = null;
    }
  }
  const id = payload?.markerId;
  return id != null && Number.isFinite(Number(id)) ? Number(id) : null;
}

/**
 * Index (dans le chemin trié) de la case la plus avancée jamais atteinte, ou `null`.
 * @param {object[]} sortedMarkers repères triés par `sortMarkersByPath`
 * @param {object[]} teams équipes (`position_marker_id`)
 * @param {object[]} events journal de partie (événements `move` avec `payload.markerId`)
 */
export function furthestReachedPathIndex(sortedMarkers = [], teams = [], events = []) {
  const indexById = new Map();
  sortedMarkers.forEach((marker, idx) => {
    const id = Number(marker?.id);
    if (Number.isFinite(id)) indexById.set(id, idx);
  });
  let furthest = null;
  const reach = (markerId) => {
    if (markerId == null) return;
    const idx = indexById.get(Number(markerId));
    if (idx != null && (furthest == null || idx > furthest)) furthest = idx;
  };
  for (const team of Array.isArray(teams) ? teams : []) {
    reach(team?.position_marker_id ?? team?.positionMarkerId ?? null);
  }
  for (const event of Array.isArray(events) ? events : []) {
    reach(eventMoveMarkerId(event));
  }
  return furthest;
}

/**
 * Sous-biome musical à l'index donné : premier sous-biome reconnu par le registre en
 * remontant le chemin (une case-charnière garde la musique du biome d'avant).
 */
export function musicSousBiomeAtPathIndex(sortedMarkers = [], pathIndex = null) {
  if (pathIndex == null || !Number.isFinite(Number(pathIndex))) return null;
  for (let idx = Math.min(Number(pathIndex), sortedMarkers.length - 1); idx >= 0; idx -= 1) {
    const slug = String(sortedMarkers[idx]?.sous_biome_slug ?? '').trim();
    if (slug && resolveBiome(slug)) return slug;
  }
  return null;
}

/**
 * Biome à passer à la musique de plateau pour une partie.
 * @param {{ markers?: object[], teams?: object[], events?: object[] }} gameState
 * @param {string|null} fallbackBiomeSlug biome du chapitre (premier biome rattaché)
 */
export function resolvePlateauMusicBiomeSlug(gameState, fallbackBiomeSlug = null) {
  const sorted = sortMarkersByPath(Array.isArray(gameState?.markers) ? gameState.markers : []);
  if (sorted.length === 0) return fallbackBiomeSlug || null;
  const furthest = furthestReachedPathIndex(sorted, gameState?.teams, gameState?.events);
  return musicSousBiomeAtPathIndex(sorted, furthest) || fallbackBiomeSlug || null;
}
