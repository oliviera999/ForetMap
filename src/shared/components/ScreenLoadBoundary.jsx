import { Component } from 'react';
import { isScreenLoadError, resetFailedScreens } from '../lazyScreen.jsx';
import { isDeviceOffline } from '../networkStatus.js';

export const SCREEN_OFFLINE_MESSAGE =
  'Cet écran n’est pas encore disponible hors ligne. Il s’ouvrira au retour du réseau.';
export const SCREEN_LOAD_FAILED_MESSAGE = 'Impossible de charger cet écran pour l’instant.';

/**
 * Limite d'erreur des écrans chargés à la demande (`lazyScreen`) : un téléchargement raté
 * affiche un message à la place de l'écran — au lieu de la page d'erreur globale — et
 * réessaie seul au retour du réseau. Toute autre erreur remonte telle quelle.
 */
export class ScreenLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(_prevProps, prevState) {
    if (this.state.error && !prevState.error && typeof window !== 'undefined') {
      window.addEventListener('online', this.retry);
    }
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.retry);
  }

  retry() {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.retry);
    resetFailedScreens();
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isScreenLoadError(error)) throw error;
    return (
      <div className="screen-load-error" role="status" style={{ padding: '24px 16px' }}>
        <p className="section-sub" style={{ marginBottom: 12 }}>
          {isDeviceOffline() ? SCREEN_OFFLINE_MESSAGE : SCREEN_LOAD_FAILED_MESSAGE}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 44 }}
          onClick={this.retry}
        >
          Réessayer
        </button>
      </div>
    );
  }
}
