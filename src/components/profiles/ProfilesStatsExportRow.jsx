import React from 'react';

/**
 * Ligne d'export CSV des statistiques de la vue « Profils & utilisateurs ».
 * Extrait de profiles-views.jsx (O6) — présentationnel pur. DOM/classes/textes inchangés.
 *
 * Le bouton est désactivé tant que l'export n'est pas autorisé (PIN requis) ; le libellé
 * indique alors « (PIN requis) ».
 *
 * @param {object} props
 * @param {boolean} [props.canExport] vrai si l'export CSV est autorisé
 * @param {() => void} [props.onExport] handler de déclenchement de l'export
 */
function ProfilesStatsExportRow({ canExport, onExport }) {
  return (
    <div className="export-row" style={{ marginTop: 12 }}>
      <button className="btn btn-secondary btn-sm" disabled={!canExport} onClick={onExport}>
        📥 Exporter CSV {canExport ? '' : '(PIN requis)'}
      </button>
    </div>
  );
}

export { ProfilesStatsExportRow };
