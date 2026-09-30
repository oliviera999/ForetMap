import './shared/zodJitless.js';
import ReactDOM from 'react-dom/client';
import './shared/fonts/foretmapFonts.js';
import './shared/styles/tooltip.css';
import './shared/styles/floating-dock.css';
import './shared/styles/presence-badge.css';
import './index.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ImageLightboxProvider } from './shared/components/ImageLightboxProvider.jsx';
import { withAppBase } from './services/api';
import { registerServiceWorker } from './shared/pwa/registerServiceWorker.js';
import { isPrivacyNoticePath } from './shared/privacy/privacyNoticePath.js';
import { PrivacyNoticePage } from './shared/privacy/PrivacyNoticePage.jsx';

// Notice « Vos données » (`/confidentialite`) : page publique, montée à la place de
// l'application pour être lisible sans compte ni session (audit RGPD du 30/09/2026, RG1).
const showPrivacyNotice = isPrivacyNoticePath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    {showPrivacyNotice ? (
      <PrivacyNoticePage product="foret" />
    ) : (
      <ImageLightboxProvider>
        <App />
      </ImageLightboxProvider>
    )}
  </ErrorBoundary>,
);

// Politique de mise à jour : annonce (bandeau) plutôt que rechargement d'autorité.
// Détail et raisons dans `src/shared/pwa/registerServiceWorker.js`.
registerServiceWorker({ swUrl: withAppBase('/sw.js') });
