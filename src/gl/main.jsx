import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/styles/motion.css';
import '../shared/styles/modal-shell.css';
import '../shared/styles/toast-shell.css';
import './styles/gl-base.css';
import './styles/gl-theme.css';
import { AppGL } from './AppGL.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

document.body.classList.add('gl-body');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppGL />
  </ErrorBoundary>
);
