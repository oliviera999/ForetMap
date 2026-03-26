import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { withAppBase } from './services/api';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if ('serviceWorker' in navigator) {
  let hasReloadedForUpdate = false;

  const triggerReloadOnControllerChange = () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    try {
      sessionStorage.setItem('foretmap_sw_updated', '1');
    } catch (_) {}
    window.location.reload();
  };

  const activateWaitingWorker = registration => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  navigator.serviceWorker.addEventListener('controllerchange', triggerReloadOnControllerChange);

  navigator.serviceWorker.register(withAppBase('/sw.js'))
    .then(registration => {
      activateWaitingWorker(registration);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // Le SW est prêt et attend l'activation : on l'active immédiatement.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            activateWaitingWorker(registration);
          }
        });
      });

      // Forcer une vérification d'update au retour au premier plan.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    })
    .catch(() => {});
}
