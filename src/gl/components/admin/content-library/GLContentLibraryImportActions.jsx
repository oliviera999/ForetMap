import React from 'react';
import { GLButton } from '../../ui/GLButton.jsx';

/**
 * Barre d'actions de l'import en masse G&L : sélecteur de fichiers/ZIP et
 * boutons Analyser / Appliquer / Tout sélectionner. Composant feuille
 * prop-driven : toute la logique (validation, réseau, état) reste dans le parent.
 *
 * @param {React.RefObject} fileInputRef ref sur l'input fichier
 * @param {boolean} busy traitement en cours (désactive les contrôles)
 * @param {number} fileCount nombre de fichiers sélectionnés
 * @param {number} selectedCount nombre d'entrées cochées
 * @param {number} applyableCount nombre d'entrées applicables
 * @param {(event:Event)=>void} onFileChange gère la sélection de fichiers
 * @param {()=>void} onAnalyze lance l'analyse (dry-run)
 * @param {()=>void} onApply applique la sélection
 * @param {()=>void} onSelectAll coche toutes les entrées applicables
 */
export function GLContentLibraryImportActions({
  fileInputRef,
  busy,
  fileCount,
  selectedCount,
  applyableCount,
  onFileChange,
  onAnalyze,
  onApply,
  onSelectAll,
}) {
  return (
    <div className="gl-content-library__actions">
      <label className="btn btn-secondary btn-sm">
        Choisir fichiers ou ZIP
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,audio/*,video/*,.zip,.xlsx,.xls,.csv"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={onFileChange}
        />
      </label>
      <GLButton type="button" disabled={busy || fileCount === 0} onClick={onAnalyze}>
        Analyser
      </GLButton>
      <GLButton
        type="button"
        variant="primary"
        disabled={busy || selectedCount === 0}
        onClick={onApply}
      >
        Appliquer la sélection
      </GLButton>
      <GLButton type="button" disabled={busy || applyableCount === 0} onClick={onSelectAll}>
        Tout sélectionner (applicables)
      </GLButton>
    </div>
  );
}
