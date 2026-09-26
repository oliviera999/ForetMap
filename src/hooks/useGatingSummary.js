import { api, getAuthToken } from '../services/api';
import { useLearningGatingSummary } from '../shared/hooks/useLearningGatingSummary';
import { withPedagoSessionScope } from '../utils/pedagoSessionScope.js';

/** Le résumé tient compte de la séance en cours : elle impose son niveau (25/09/2026). */
const gatingApi = withPedagoSessionScope(api);

/**
 * Résumé du contrôle de compréhension côté ForetMap.
 *
 * Adaptateur mince au-dessus du hook commun (`useLearningGatingSummary`) : il n'injecte
 * que le client HTTP, le chemin de la route et l'événement de session propres au produit.
 * Toute la logique — clé stable, silence en cas d'échec, lots de 200 refs — est
 * partagée avec Gnomes & Licornes.
 *
 * @param {string} resourceType 'tutorial' | 'plant'
 * @param {Array<number|string>} refs identifiants des ressources affichées
 * @returns {{ summaries: Map<string, object>, refresh: () => Promise<void> }}
 */
export function useGatingSummary(resourceType, refs = []) {
  const hasSession = typeof getAuthToken !== 'function' || !!getAuthToken();
  return useLearningGatingSummary({
    request: gatingApi,
    basePath: '/api/learning/gating/summary',
    resourceType,
    refs,
    enabled: hasSession,
    sessionEventName: 'foretmap_session_changed',
  });
}
