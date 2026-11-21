/**
 * Panne réseau dite à une **équipe** (tablette de classe, projection, écran d'équipe ouvert
 * depuis un compte) : la même phrase que celle d'un élève
 * (`src/shared/networkFailureMessages.js`), au « vous » — l'écran parle à l'équipe.
 * Module à part : le test de contenu `tests/content/gl-adresse-ecran-equipe.test.js` le relit
 * (adresse et mots interdits), comme les autres textes d'écran d'équipe.
 */
import { PUBLIC_SERVER_RESTART_MESSAGE } from '../../shared/apiTransport.js';
import {
  NETWORK_FAILURE_STAFF_MESSAGE,
  NETWORK_FAILURE_USER_MESSAGE,
} from '../../shared/networkFailureMessages.js';

export const GL_PANNE_RESEAU_EQUIPE =
  'Pas de réseau pour l’instant. Réessayez dans un moment ; si ça dure, prévenez le prof.';

/** Les phrases de panne réseau qu'`apiGL` peut rendre selon la session ouverte. */
const PHRASES_DE_PANNE = new Set([
  NETWORK_FAILURE_USER_MESSAGE,
  NETWORK_FAILURE_STAFF_MESSAGE,
  PUBLIC_SERVER_RESTART_MESSAGE,
  GL_PANNE_RESEAU_EQUIPE,
]);

/**
 * Message d'erreur à montrer sur un **écran d'équipe**. `apiGL` choisit la phrase de panne
 * réseau d'après la session (un élève : « tu » ; un prof : ses pistes de diagnostic), mais
 * l'écran d'équipe peut être ouvert depuis un compte, et le choix d'équipe par le lien de
 * classe se fait avant toute session d'équipe : là, la panne se dit au « vous ». Tout autre
 * message passe tel quel.
 * @param {unknown} message
 * @returns {string}
 */
export function messagePourEquipe(message) {
  const texte = String(message ?? '');
  return PHRASES_DE_PANNE.has(texte) ? GL_PANNE_RESEAU_EQUIPE : texte;
}
