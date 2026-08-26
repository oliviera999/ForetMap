import { apiGL } from '../services/apiGL';
import { useLearningGatingSummary } from '../../shared/hooks/useLearningGatingSummary';

/**
 * Résumé du contrôle de compréhension côté Gnomes & Licornes.
 *
 * Le produit n'avait aucun résumé par lot : aucun écran ne pouvait annoncer le contrôle
 * avant le clic, alors que ForetMap le faisait depuis le lot précédent. Cet adaptateur
 * n'injecte que le client HTTP et le chemin de la route ; la logique est celle du hook
 * commun (`useLearningGatingSummary`).
 *
 * @param {string} resourceType 'species' | 'glossary' | 'tutorial' | 'feuillet' | …
 * @param {Array<number|string>} refs identifiants des ressources affichées
 * @param {boolean} [enabled] faux tant que la session G&L n'est pas établie.
 */
export function useGlGatingSummary(resourceType, refs = [], enabled = true) {
  return useLearningGatingSummary({
    request: apiGL,
    basePath: '/api/gl/learning/gating/summary',
    resourceType,
    refs,
    enabled,
  });
}
