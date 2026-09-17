import ReactDOM from 'react-dom/client';
// Feuilles communes aux produits (le plan ne charge jamais src/index.css ni les styles GL).
import '../shared/styles/typography-tokens.css';
import '../shared/styles/spacing-tokens.css';
import '../shared/styles/state-inks.css';
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

document.body.classList.add('plan-body');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppDialogsProvider>
      <AppPlan />
    </AppDialogsProvider>
  </ErrorBoundary>,
);
