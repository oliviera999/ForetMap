import React from 'react';

/**
 * Placeholder de statut du carnet d'observations élève (O6, extrait de
 * `ObservationNotebook` dans `foretmap-views.jsx`).
 *
 * Rend l'un des trois états transitoires du carnet — chargement, erreur de
 * chargement (avec bouton « Réessayer »), ou carnet vide — et `null` dès qu'il
 * y a au moins une observation à afficher (la liste reste gérée par le parent).
 * DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {boolean} props.loading carnet en cours de chargement → loader
 * @param {string} [props.loadError] message d'erreur de chargement ; non vide → état erreur + bouton réessayer
 * @param {number} [props.entryCount] nombre d'observations chargées ; 0 → carnet vide
 * @param {() => void} props.onRetry relance le chargement (bouton « Réessayer »)
 */
export function ObservationNotebookStatus({ loading, loadError, entryCount = 0, onRetry }) {
  if (loading) {
    return (
      <div className="loader" style={{height:'40vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>
    );
  }
  if (loadError) {
    return (
      <div className="empty">
        <div className="empty-icon">⚠️</div>
        <p>{loadError}</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onRetry}>
          Réessayer
        </button>
      </div>
    );
  }
  if (entryCount === 0) {
    return (
      <div className="empty"><div className="empty-icon">📓</div><p>Ton carnet est vide. Ajoute ta première observation !</p></div>
    );
  }
  return null;
}
