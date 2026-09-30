import '../shared/zodJitless.js';
import ReactDOM from 'react-dom/client';
import '../shared/fonts/planFonts.js';
// Feuilles communes aux produits (le plan ne charge jamais src/index.css ni les styles GL).
import '../shared/styles/typography-tokens.css';
import '../shared/styles/spacing-tokens.css';
import '../shared/styles/state-inks.css';
import '../shared/styles/color-tokens.css';
import '../shared/styles/z-layers.css';
import '../shared/styles/motion.css';
import '../shared/styles/shared-controls.css';
// Contrat commun champs / surfaces : le Plan ne l'utilise pas encore, mais un champ ou
// un panneau écrit ici demain doit sortir habillé, pas nu (audit UI « homogénéité »).
import '../shared/styles/form-controls.css';
import '../shared/styles/surfaces.css';
import '../shared/styles/modal-shell.css';
import '../shared/styles/toast-shell.css';
import '../shared/styles/tooltip.css';
import '../shared/styles/map-action.css';
import '../shared/styles/map-overlay-labels.css';
import '../shared/styles/map-scale-compass.css';
import '../shared/styles/pct-map-layers.css';
import '../shared/styles/map-category-chips.css';
import '../shared/styles/bottom-sheet.css';
import './styles/plan.css';
import { AppPlan } from './AppPlan.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { AppDialogsProvider } from '../shared/components/AppDialogsProvider.jsx';
import { isPrivacyNoticePath } from '../shared/privacy/privacyNoticePath.js';
import { PrivacyNoticePage } from '../shared/privacy/PrivacyNoticePage.jsx';

document.body.classList.add('plan-body');

// Notice « Vos données » (`/confidentialite`), lisible sans code ni compte (audit RGPD du
// 30/09/2026, RG1).
const showPrivacyNotice = isPrivacyNoticePath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    {showPrivacyNotice ? (
      <PrivacyNoticePage product="plan" />
    ) : (
      <AppDialogsProvider>
        <AppPlan />
      </AppDialogsProvider>
    )}
  </ErrorBoundary>,
);
