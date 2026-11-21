/**
 * Serveur injoignable après les nouvelles tentatives : les phrases dites à l'utilisateur,
 * communes à ForetMap (`src/services/api.js`) et à Gnomes & Licornes
 * (`src/gl/services/apiGL.js`). Module pur : chaque produit dit lui-même qui est connecté.
 */
import { PUBLIC_SERVER_RESTART_MESSAGE } from './apiTransport.js';

/**
 * Message pour un ÉLÈVE (audit du 25/09/2026, § 1.4.6) : court, tutoyé, concret. L'ancien texte
 * comptait 37 mots et parlait de « passerelle réseau » et d'« administrateur de la plateforme »
 * à des élèves de 11 ans sur le terrain.
 */
export const NETWORK_FAILURE_USER_MESSAGE =
  'Pas de réseau pour l’instant. Réessaie dans un moment ; si ça dure, préviens ton professeur.';

/**
 * Même situation, pour un compte personnel (prof, admin) : c'est lui qu'on prévient, il
 * reçoit donc les pistes de diagnostic que le message élève ne porte plus.
 */
export const NETWORK_FAILURE_STAFF_MESSAGE =
  'Pas de réseau pour l’instant : le serveur ne répond pas. Réessayez dans un moment ; si ça ' +
  'dure, vérifiez la connexion de l’établissement — le site peut aussi être en maintenance.';

/**
 * La phrase selon le public : personnel, visiteur sans compte (la phrase simple du
 * redémarrage, audit UI/UX du 19/11/2026, U2), ou élève.
 * @param {{ staff?: boolean, publicAudience?: boolean }} [options]
 */
export function networkFailureMessageFor({ staff = false, publicAudience = false } = {}) {
  if (staff) return NETWORK_FAILURE_STAFF_MESSAGE;
  return publicAudience ? PUBLIC_SERVER_RESTART_MESSAGE : NETWORK_FAILURE_USER_MESSAGE;
}
