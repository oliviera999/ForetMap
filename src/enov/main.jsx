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
import { isPrivacyNoticePath } from '../shared/privacy/privacyNoticePath.js';
import { PrivacyNoticePage } from '../shared/privacy/PrivacyNoticePage.jsx';
import { installDragReleaseClickGuard } from '../shared/platform/dragReleaseClickGuard.js';

installDragReleaseClickGuard();

document.body.classList.add(...ENOV_PLAN_VARIANT.bodyClass.split(' ').filter(Boolean));

// Notice « Vos données » (`/confidentialite`), lisible sans code ni compte (audit RGPD du
// 30/09/2026, RG1) — comme sur les deux autres plans.
const showPrivacyNotice = isPrivacyNoticePath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    {showPrivacyNotice ? (
      <PrivacyNoticePage product="enov" />
    ) : (
      <AppDialogsProvider>
        <AppPlan variant={ENOV_PLAN_VARIANT} />
      </AppDialogsProvider>
    )}
  </ErrorBoundary>,
);
