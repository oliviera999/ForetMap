import React from 'react';
import { formatBytesLabel } from '../../services/apiGLUpload.js';
import { entryKey, kindBadgeClass, previewSummary } from '../../utils/glContentLibraryDisplay.js';

/**
 * Tableau des entrées d'analyse (dry-run) de la bibliothèque de contenus G&L.
 * Composant feuille prop-driven : aucun état interne, tout vient du parent.
 *
 * @param {Array} entries entrées d'analyse
 * @param {Set<string>} selectedKeys clés cochées
 * @param {boolean} busy traitement en cours (désactive les cases)
 * @param {(key:string, checked:boolean)=>void} onToggle bascule une entrée
 * @param {((subTab:string)=>void)|undefined} onOpenSubTab ouvre l'onglet ciblé
 */
export function GLContentLibraryAnalysisTable({
  entries,
  selectedKeys,
  busy,
  onToggle,
  onOpenSubTab,
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="gl-content-library__report">
      <table className="gl-content-library__table">
        <thead>
          <tr>
            <th />
            <th>Fichier</th>
            <th>Nature</th>
            <th>Résumé (dry-run)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const key = entryKey(entry, index);
            const warnings = Array.isArray(entry.warnings) ? entry.warnings : [];
            return (
              <tr key={key}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(key)}
                    disabled={busy || !entry.canApply || !!entry.error}
                    onChange={(event) => onToggle(key, event.target.checked)}
                  />
                </td>
                <td>
                  <strong>{entry.sourceFileName || entry.fileName}</strong>
                  <div className="gl-hint">{formatBytesLabel(entry.size || 0)}</div>
                </td>
                <td>
                  <span className={kindBadgeClass(entry.kind)}>
                    {entry.kindLabel || entry.kind}
                  </span>
                  {entry.mediaType ? <span className="gl-hint"> ({entry.mediaType})</span> : null}
                </td>
                <td>
                  {entry.error ? (
                    <span className="gl-error">{entry.error}</span>
                  ) : (
                    previewSummary(entry)
                  )}
                  {warnings.length ? (
                    <ul className="gl-content-library__warnings">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td>
                  {entry.subTab && onOpenSubTab ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onOpenSubTab(entry.subTab)}
                    >
                      Ouvrir {entry.kindLabel}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
