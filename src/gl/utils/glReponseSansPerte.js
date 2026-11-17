import { apiGL } from '../services/apiGL.js';

/**
 * Plusieurs appareils par équipe (ensemble unifié, M13) — réponse à une question **déjà à
 * l'écran** (question de case, question d'une page trouvée, question de lecture).
 *
 * La version d'état est un compteur par équipe : elle a pu avancer pour une autre raison que
 * cette question (un geste du prof, une péripétie fermée sur un autre écran). La fouille ou le
 * jet qui a ouvert la question est déjà joué : la jeter coûterait quelque chose à l'équipe. Sur
 * un refus `ETAT_PERIME`, la réponse repart donc **une fois** avec la version que le serveur
 * vient de rendre. Le jeton de présentation est à usage unique et le moteur refuse une page déjà
 * trouvée : rien ne s'applique deux fois.
 */
export async function repondreSansPerte(path, body) {
  try {
    return await apiGL(path, 'POST', body, { perimeSilencieux: true });
  } catch (err) {
    if (err?.code !== 'ETAT_PERIME') throw err;
    return apiGL(path, 'POST', body);
  }
}
