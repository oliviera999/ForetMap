/**
 * Messages d'état de la position sur le plan (lot 6) — repris des six états de la bannière
 * GPS de ForetMap (`MascotGpsStatusBanner`), mais servis en **toast discret** : sur un plan
 * consulté debout, un bandeau permanent mange l'écran utile.
 *
 * Clés : celles de `useMapPosition().feedback`.
 */
export const PLAN_POSITION_MESSAGES = Object.freeze({
  denied: 'Localisation refusée. Autorisez l’accès à votre position dans le navigateur.',
  bad_georef: 'Le calage de ce plan est incohérent : la position ne peut pas être affichée.',
  out_of_bounds: 'Vous semblez être hors du plan : le point est posé au bord le plus proche.',
  low_accuracy: 'Signal faible : votre position est approximative.',
  acquiring: 'Recherche de votre position…',
  error: 'Position indisponible pour le moment.',
  unavailable: 'Ce plan n’est pas calé pour la localisation.',
  unsupported: 'Votre navigateur ne sait pas donner votre position.',
});
