import ReactDOM from 'react-dom/client';
// Mêmes feuilles que le plan public : le plan des personnels est le même écran, pas un autre
// produit visuel. Seul `staff-plan.css` s'ajoute, pour la teinte et les blocs réservés.
import '../shared/styles/typography-tokens.css';
import '../shared/styles/spacing-tokens.css';
import '../shared/styles/state-inks.css';
import '../shared/styles/color-tokens.css';
import '../shared/styles/z-layers.css';
import '../shared/styles/motion.css';
import '../shared/styles/shared-controls.css';
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
import '../plan/styles/plan.css';
import './styles/staff-plan.css';
import { AppPlan } from '../plan/AppPlan.jsx';
import { STAFF_PLAN_VARIANT } from '../plan/utils/planVariants.js';
import { consumeStaffOauthHash, staffOauthErrorMessage } from '../plan/staffSession.js';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { AppDialogsProvider } from '../shared/components/AppDialogsProvider.jsx';

// Le retour Google dépose le jeton dans `#oauth=` : on le recueille **avant** de monter
// l'application, pour que le premier appel à `/api/staff-plan/content` parte déjà signé et
// que l'écran de connexion ne clignote pas au retour.
const oauth = consumeStaffOauthHash();
if (oauth.status === 'error') {
  // Pas de toast disponible avant le montage : le message est déposé pour l'écran d'entrée.
  window.sessionStorage?.setItem?.('staffplan:oauth-error', staffOauthErrorMessage(oauth.code));
}

document.body.classList.add(...STAFF_PLAN_VARIANT.bodyClass.split(' ').filter(Boolean));

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppDialogsProvider>
      <AppPlan variant={STAFF_PLAN_VARIANT} />
    </AppDialogsProvider>
  </ErrorBoundary>,
);
