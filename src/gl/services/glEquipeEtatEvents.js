/**
 * Plusieurs appareils par équipe (ensemble unifié, M13) : évènement de fenêtre émis quand un
 * geste est refusé parce que l'écran était périmé (`ETAT_PERIME`) ou qu'un autre appareil de
 * l'équipe tient la main (`MAIN_AILLEURS`). Les écrans de partie l'écoutent et rechargent :
 * « Voici où vous en êtes. » Un seul point d'émission : `services/apiGL.js`.
 */
export const GL_EQUIPE_ETAT_EVENT = 'gl:equipe-etat';

export const CODES_EQUIPE_ETAT = Object.freeze(['ETAT_PERIME', 'MAIN_AILLEURS']);
