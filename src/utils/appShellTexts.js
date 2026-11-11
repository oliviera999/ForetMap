import { getContentText } from './content';

/**
 * Textes éditables du shell `App` (réglages `content.app.*`), avec leur valeur par défaut —
 * extraits tels quels d'`App.jsx` (lot 6). Dérivation pure.
 *
 * @param {object|null} publicSettings Réglages publics.
 * @returns {{ loader: string, serverDownNotice: string, retryNow: string,
 *   footerVersionPrefix: string }}
 */
export function resolveAppShellTexts(publicSettings) {
  return {
    loader: getContentText(publicSettings, 'app.loader', 'Chargement de la forêt…'),
    serverDownNotice: getContentText(
      publicSettings,
      'app.server_down_notice',
      'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.',
    ),
    retryNow: getContentText(publicSettings, 'app.retry_now', 'Réessayer maintenant'),
    footerVersionPrefix: getContentText(publicSettings, 'app.footer_version_prefix', 'Version'),
  };
}

/** Vrai sur la page d'arrivée d'un lancement LTI (`/lti/arrivee`, sous-chemin toléré). */
export function isLtiArrivalLocation() {
  return (
    typeof window !== 'undefined' &&
    (() => {
      const p = String(window.location.pathname || '').replace(/\/+$/, '');
      return p === '/lti/arrivee' || p.endsWith('/lti/arrivee');
    })()
  );
}
