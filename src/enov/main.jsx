import '../shared/zodJitless.js';
import ReactDOM from 'react-dom/client';
import '../shared/fonts/planFonts.js';
// Mêmes feuilles que le plan public : le plan e-nov est le même écran, pas un autre produit
// visuel. Seul `enov-plan.css` s'ajoute, pour la teinte et la mise en avant des innovations.
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
import './styles/enov-plan.css';
import { AppPlan } from '../plan/AppPlan.jsx';
import { ENOV_PLAN_VARIANT } from '../plan/utils/planVariants.js';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { AppDialogsProvider } from '../shared/components/AppDialogsProvider.jsx';

document.body.classList.add(...ENOV_PLAN_VARIANT.bodyClass.split(' ').filter(Boolean));

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppDialogsProvider>
      <AppPlan variant={ENOV_PLAN_VARIANT} />
    </AppDialogsProvider>
  </ErrorBoundary>,
);
