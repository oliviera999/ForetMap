import React, { Component } from 'react';

/** Évite la page blanche en cas d'erreur de rendu */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, error: err };
  }

  componentDidCatch(err, info) {
    console.error('ErrorBoundary:', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'DM Sans',
            color: 'var(--forest)',
            textAlign: 'center',
            maxWidth: 400,
            margin: '40px auto',
          }}
        >
          <p style={{ marginBottom: 16 }}>Une erreur s’est produite.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
