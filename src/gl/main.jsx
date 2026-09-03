import ReactDOM from 'react-dom/client';
// Tokens typographiques communs aux deux produits (G&L ne charge jamais src/index.css).
import '../shared/styles/typography-tokens.css';
import '../shared/styles/z-layers.css';
import '../shared/styles/motion.css';
import '../shared/styles/speech-bubble.css';
import '../shared/styles/mascot-speaker.css';
import '../shared/styles/guided-tour.css';
import '../shared/styles/tooltip.css';
import '../shared/styles/floating-dock.css';
import '../shared/styles/tour-editor.css';
import '../shared/styles/modal-shell.css';
import '../shared/styles/toast-shell.css';
import '../shared/styles/status-sticky.css';
import '../shared/styles/learning-gating.css';
import '../shared/styles/shared-controls.css';
import '../shared/styles/visit-map-mascot.css';
import './styles/gl-base.css';
import './styles/gl-theme.css';
import { AppGL } from './AppGL.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { ImageLightboxProvider } from '../shared/components/ImageLightboxProvider.jsx';
import { AppDialogsProvider } from '../shared/components/AppDialogsProvider.jsx';

document.body.classList.add('gl-body');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppDialogsProvider>
      <ImageLightboxProvider>
        <AppGL />
      </ImageLightboxProvider>
    </AppDialogsProvider>
  </ErrorBoundary>,
);
