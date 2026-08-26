import { api, getAuthToken } from '../services/api';
import { useLearningGatingSummary } from '../shared/hooks/useLearningGatingSummary';

/**
 * Résumé du contrôle de compréhension côté ForetMap.
 *
 * Adaptateur mince au-dessus du hook commun (`useLearningGatingSummary`) : il n'injecte
 * que le client HTTP, le chemin de la route et l'événement de session propres au produit.
 * Toute la logique — clé stable, silence en cas d'échec, plafond de références — est
 * partagée avec Gnomes & Licornes.
 *
 * @param {string} resourceType 'tutorial' | 'plant'
 * @param {Array<number|string>} refs identifiants des ressources affichées
 * @returns {{ summaries: Map<string, object>, refresh: () => Promise<void> }}
 */
export function useGatingSummary(resourceType, refs = []) {
  const hasSession = typeof getAuthToken !== 'function' || !!getAuthToken();
  return useLearningGatingSummary({
    request: api,
    basePath: '/api/learning/gating/summary',
    resourceType,
    refs,
    enabled: hasSession,
    sessionEventName: 'foretmap_session_changed',
  });
}
