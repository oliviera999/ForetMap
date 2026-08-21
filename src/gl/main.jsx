import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/styles/motion.css';
import '../shared/styles/speech-bubble.css';
import '../shared/styles/mascot-speaker.css';
import '../shared/styles/guided-tour.css';
import '../shared/styles/tour-editor.css';
import '../shared/styles/modal-shell.css';
import '../shared/styles/toast-shell.css';
import '../shared/styles/visit-map-mascot.css';
import './styles/gl-base.css';
import './styles/gl-theme.css';
import { AppGL } from './AppGL.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { ImageLightboxProvider } from '../shared/components/ImageLightboxProvider.jsx';

document.body.classList.add('gl-body');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ImageLightboxProvider>
      <AppGL />
    </ImageLightboxProvider>
  </ErrorBoundary>,
);
