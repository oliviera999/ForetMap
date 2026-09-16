import ReactDOM from 'react-dom/client';
import './shared/styles/tooltip.css';
import './shared/styles/floating-dock.css';
import './shared/styles/presence-badge.css';
import './index.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ImageLightboxProvider } from './shared/components/ImageLightboxProvider.jsx';
import { withAppBase } from './services/api';
import { registerServiceWorker } from './shared/pwa/registerServiceWorker.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ImageLightboxProvider>
      <App />
    </ImageLightboxProvider>
  </ErrorBoundary>,
);

// Politique de mise à jour : annonce (bandeau) plutôt que rechargement d'autorité.
// Détail et raisons dans `src/shared/pwa/registerServiceWorker.js`.
registerServiceWorker({ swUrl: withAppBase('/sw.js') });
