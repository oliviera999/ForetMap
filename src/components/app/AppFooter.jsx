import React from 'react';

/**
 * Pied de page « Version X » de l'app, affiché aussi bien sur l'écran d'accueil
 * invité que sur le shell authentifié (deux copies identiques dans App.jsx).
 *
 * @param {object} props
 * @param {string} props.versionPrefix Libellé configurable (`app.footer_version_prefix`).
 * @param {string|number|null} [props.appVersion] Version résolue (`…` tant qu'inconnue).
 */
export function AppFooter({ versionPrefix, appVersion }) {
  return (
    <footer className="app-footer">
      {versionPrefix} {appVersion != null ? appVersion : '…'}
    </footer>
  );
}
