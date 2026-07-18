import React from 'react';
import { formatBytesLabel } from '../../../services/apiGLUpload.js';
import { FILE_STATUS_LABEL } from '../../../utils/glContentLibraryDisplay.js';

/**
 * Liste des fichiers sélectionnés pour l'import en masse G&L (nom, taille,
 * statut, progression, erreur). Composant feuille prop-driven : aucun état
 * interne. Affiche un indice si aucun fichier n'est sélectionné.
 *
 * @param {Array} rows lignes de fichiers ({ file, status, progress, error })
 */
export function GLContentLibraryFileList({ rows }) {
  if (rows.length > 0) {
    return (
      <ul className="gl-content-library__file-list">
        {rows.map((row) => (
          <li key={`${row.file.name}-${row.file.size}`} className="gl-content-library__file-item">
            <div className="gl-content-library__file-head">
              <span>{row.file.name}</span>
              <span className="gl-hint">
                {formatBytesLabel(row.file.size)} · {FILE_STATUS_LABEL[row.status] || row.status}
              </span>
            </div>
            {row.status === 'uploading' || row.status === 'analyzing' ? (
              <div
                className="gl-content-library__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.progress}
              >
                <div
                  className="gl-content-library__progress-bar"
                  style={{ width: `${row.progress}%` }}
                />
              </div>
            ) : null}
            {row.error ? <div className="gl-error">{row.error}</div> : null}
          </li>
        ))}
      </ul>
    );
  }
  return <p className="gl-hint">Aucun fichier sélectionné.</p>;
}
