import { useState } from 'react';

/**
 * Panneau d'import de fichier tableur générique (audit 2026-07, P1).
 *
 * Mutualise l'UI et l'état communs aux panneaux d'import (`TaskImportPanel`,
 * `StudentImportPanel`, `PlantImportPanel`) : conteneur repliable ou carte,
 * boutons « Modèle CSV / XLSX », input fichier (même `accept`), case
 * « Simulation (sans création) », bouton Importer et rapport (totaux +
 * erreurs tronquées). Les adaptateurs ne fournissent que le spécifique :
 * endpoints/appels API (`onImport`), messages, `totalsRenderer` et styles.
 *
 * Deux modes :
 * - flux standard (défaut) : le panneau rend modèles + fichier + simulation +
 *   rapport et pilote `importing`/`report` autour de `onImport` ;
 * - slot `body` (panneaux atypiques, ex. biodiversité) : le panneau fournit le
 *   conteneur et l'état partagé (`file`, `importing`, `report`) et l'adaptateur
 *   rend son propre corps.
 */

/** `accept` commun des imports CSV / XLSX. */
export const SPREADSHEET_IMPORT_ACCEPT =
  '.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';

/** Liste d'erreurs de rapport tronquée (« Ligne N (champ): message » + suffixe). */
export function ImportReportErrors({ errors, limit = 15, moreLabel }) {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return (
    <div style={{ maxHeight: 120, overflow: 'auto', fontSize: '.8rem', color: '#991b1b' }}>
      {errors.slice(0, limit).map((item, idx) => (
        <div key={`${item.row}-${item.field}-${idx}`}>
          Ligne {item.row} ({item.field}): {item.error}
        </div>
      ))}
      {errors.length > limit && <div>{moreLabel(errors.length - limit)}</div>}
    </div>
  );
}

export function ImportPanel({
  /** 'details' (panneau repliable .plant-more) ou 'card' (carte blanche + <h3>). */
  variant = 'details',
  title,
  /** Style du conteneur (variante 'card' uniquement, ex. opacité sans permission). */
  containerStyle,
  /** Style du <h3> (variante 'card' uniquement). */
  titleStyle,
  /** Nœud(s) d'introduction rendus avant la rangée des modèles. */
  intro = null,
  /** Boutons modèles : [{ key?, label, onClick }]. */
  templateButtons = [],
  /** Style additionnel de la rangée des modèles (ex. marginBottom). */
  templateRowStyle,
  /** Désactive les boutons modèles pendant l'import. */
  templatesDisabledWhenBusy = false,
  fileAccept = SPREADSHEET_IMPORT_ACCEPT,
  dryRunLabel = 'Simulation (sans création)',
  importLabel = 'Importer',
  importBusyLabel = 'Import...',
  /** Désactivation additionnelle du bouton Importer (ex. permission manquante). */
  importDisabled = false,
  /** Style du paragraphe « Fichier sélectionné ». */
  selectedFileStyle,
  /** Style du bloc rapport. */
  reportBoxStyle,
  /** Rend la ligne des totaux du rapport : (report) => nœud. */
  totalsRenderer,
  errorLimit = 15,
  /** Libellé du surplus d'erreurs : (count) => texte. */
  errorsMoreLabel,
  /** Appelé quand « Importer » est cliqué sans fichier (toast/erreur d'aide). */
  onMissingFile,
  /** Appelé juste avant l'import (ex. effacer un bandeau d'erreur). */
  onImportStart,
  /** Import de l'adaptateur : async ({ file, dryRun, setReport }) — gère API et messages. */
  onImport,
  /** Slot corps complet : ({ file, setFile, importing, setImporting, report, setReport }) => nœud. */
  body = null,
}) {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  const runImport = async () => {
    if (!file) {
      onMissingFile?.();
      return;
    }
    setImporting(true);
    setReport(null);
    onImportStart?.();
    try {
      await onImport({ file, dryRun, setReport });
    } finally {
      setImporting(false);
    }
  };

  const content = body ? (
    body({ file, setFile, importing, setImporting, report, setReport })
  ) : (
    <>
      {intro}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...(templateRowStyle || {}) }}>
        {templateButtons.map((b) => (
          <button
            key={b.key ?? b.label}
            className="btn btn-ghost btn-sm"
            onClick={b.onClick}
            disabled={templatesDisabledWhenBusy && importing}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="file"
          accept={fileAccept}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setReport(null);
          }}
        />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '.85rem',
            color: '#374151',
          }}
        >
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          {dryRunLabel}
        </label>
        <button
          className="btn btn-primary btn-sm"
          onClick={runImport}
          disabled={importing || importDisabled}
        >
          {importing ? importBusyLabel : importLabel}
        </button>
      </div>
      {file && (
        <p style={selectedFileStyle}>
          Fichier sélectionné: <strong>{file.name}</strong>
        </p>
      )}
      {report && (
        <div style={reportBoxStyle}>
          <div style={{ fontSize: '.85rem', color: '#1f2937', marginBottom: 4 }}>
            {totalsRenderer(report)}
          </div>
          <ImportReportErrors
            errors={report?.errors}
            limit={errorLimit}
            moreLabel={errorsMoreLabel}
          />
        </div>
      )}
    </>
  );

  if (variant === 'card') {
    return (
      <div style={containerStyle}>
        <h3 style={titleStyle}>{title}</h3>
        {content}
      </div>
    );
  }
  return (
    <details className="plant-more" style={{ marginBottom: 10 }}>
      <summary>{title}</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{content}</div>
    </details>
  );
}
