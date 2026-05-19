import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import './styles/gl-theme.css';
import { AppGL } from './AppGL.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppGL />
  </ErrorBoundary>
);
