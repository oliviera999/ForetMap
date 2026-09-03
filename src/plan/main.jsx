import ReactDOM from 'react-dom/client';
// Feuilles communes aux produits (le plan ne charge jamais src/index.css ni les styles GL).
import '../shared/styles/typography-tokens.css';
import '../shared/styles/z-layers.css';
import '../shared/styles/motion.css';
import '../shared/styles/shared-controls.css';
import '../shared/styles/modal-shell.css';
import '../shared/styles/toast-shell.css';
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
