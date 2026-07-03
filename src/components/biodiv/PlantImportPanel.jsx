import { useState } from 'react';
import { api } from '../../services/api';
import { fileToDataUrl } from '../../utils/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';

const PLANTS_IMPORT_TEMPLATE_HEADERS = [
  'name',
  'emoji',
  'description',
  'scientific_name',
  'group_1',
  'sources',
  'photo',
];
const PLANTS_IMPORT_TEMPLATE_HEADERS_FULL = [
  'name',
  'emoji',
  'description',
  'second_name',
  'scientific_name',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  'photo',
  'nutrition',
  'agroecosystem_category',
  'longevity',
  'remark_1',
  'remark_2',
  'remark_3',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];

function downloadCsvTemplate(headers, filename) {
  const csv = `${headers.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Panneau repliable « Import biodiversité (CSV, Excel, Google Sheet) » de `PlantManager`.
 *
 * Adaptateur du composant générique `ImportPanel` (audit 2026-07, P1), via son slot
 * `body` : le flux biodiversité est atypique (source fichier ou Google Sheet, stratégie,
 * confirmation de remplacement, analyse/prévisualisation au lieu de la case simulation,
 * rapport dédié) ; seuls le conteneur repliable et l'état commun (`file`, `importing`,
 * `report`) viennent du générique. Seuls `setToast` et `onRefresh` viennent du parent.
 *
 * @param {object} props
 * @param {(msg: string) => void} props.setToast notification utilisateur
 * @param {() => Promise<void>} props.onRefresh rechargement des données après import réel
 */
export function PlantImportPanel({ setToast, onRefresh }) {
  const [importSource, setImportSource] = useState('file');
  const [importStrategy, setImportStrategy] = useState('upsert_name');
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false);

  const renderBody = ({ file, setFile, importing, setImporting, report, setReport }) => {
    const runImport = async ({ dryRun }) => {
      if (importSource === 'file' && !file) {
        setToast('Choisis un fichier CSV/XLSX.');
        return;
      }
      if (importSource === 'gsheet' && !gsheetUrl.trim()) {
        setToast('Saisis une URL Google Sheet.');
        return;
      }
      if (!dryRun && importStrategy === 'replace_all' && !confirmReplaceAll) {
        setToast('Confirme le remplacement complet avant import.');
        return;
      }

      setImporting(true);
      try {
        const payload = {
          sourceType: importSource,
          strategy: importStrategy,
          dryRun,
        };
        if (importSource === 'file') {
          payload.fileName = file.name;
          payload.fileDataBase64 = await fileToDataUrl(file);
        } else {
          payload.gsheetUrl = gsheetUrl.trim();
        }
        const data = await api('/api/plants/import', 'POST', payload);
        setReport(data?.report || null);
        if (!dryRun) {
          await onRefresh();
          setToast('Import biodiversité terminé ✓');
        }
      } catch (e) {
        setToast('Erreur import : ' + e.message);
      } finally {
        setImporting(false);
      }
    };

    return (
      <>
        <div className="plant-form-grid">
          <div className="field">
            <label>Source</label>
            <select
              value={importSource}
              onChange={(e) => setImportSource(e.target.value)}
              style={{ background: 'white' }}
            >
              <option value="file">Fichier CSV/XLSX</option>
              <option value="gsheet">URL Google Sheet</option>
            </select>
          </div>
          <div className="field">
            <label>Stratégie d'import</label>
            <select
              value={importStrategy}
              onChange={(e) => setImportStrategy(e.target.value)}
              style={{ background: 'white' }}
            >
              <option value="upsert_name">Mettre à jour si même nom, sinon créer</option>
              <option value="insert_only">Créer uniquement, ignorer les doublons</option>
              <option value="replace_all">Remplacer entièrement le catalogue</option>
            </select>
          </div>
        </div>

        {importSource === 'file' ? (
          <div className="field">
            <label>Fichier d'import</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && <small style={{ color: '#666' }}>{file.name}</small>}
          </div>
        ) : (
          <div className="field">
            <label>URL Google Sheet</label>
            <input
              value={gsheetUrl}
              onChange={(e) => setGsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
            />
          </div>
        )}

        {importStrategy === 'replace_all' && (
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: '.85rem',
              color: '#7a3a3a',
            }}
          >
            <input
              type="checkbox"
              checked={confirmReplaceAll}
              onChange={(e) => setConfirmReplaceAll(e.target.checked)}
            />
            Je confirme le remplacement complet de la base biodiversité.
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              downloadCsvTemplate(
                PLANTS_IMPORT_TEMPLATE_HEADERS,
                'plants-import-template-vierge.csv',
              )
            }
            disabled={importing}
          >
            Télécharger template vierge
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              downloadCsvTemplate(
                PLANTS_IMPORT_TEMPLATE_HEADERS_FULL,
                'plants-import-template-complet.csv',
              )
            }
            disabled={importing}
          >
            Télécharger template complet
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => runImport({ dryRun: true })}
            disabled={importing}
          >
            {importing ? 'Analyse...' : 'Analyser (prévisualisation)'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => runImport({ dryRun: false })}
            disabled={importing}
          >
            {importing ? 'Import...' : "Lancer l'import"}
          </button>
        </div>

        {report && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--forest)', marginBottom: 6 }}>
              Rapport d'import
            </div>
            <div style={{ fontSize: '.85rem', color: '#444', lineHeight: 1.6 }}>
              Reçues: {report?.totals?.received ?? 0} · Valides: {report?.totals?.valid ?? 0} ·
              Créées: {report?.totals?.created ?? 0} · Mises à jour: {report?.totals?.updated ?? 0}{' '}
              · Ignorées (doublon): {report?.totals?.skipped_existing ?? 0} · Ignorées (invalides):{' '}
              {report?.totals?.skipped_invalid ?? 0}
            </div>
            {Array.isArray(report?.errors) && report.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#a94442' }}>
                  Erreurs (max 10 affichées)
                </div>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {report.errors.slice(0, 10).map((err, idx) => (
                    <li key={`import-err-${idx}`} style={{ fontSize: '.8rem', color: '#a94442' }}>
                      Ligne {err.row} · {err.field}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <ImportPanel
      variant="details"
      title="Import biodiversité (CSV, Excel, Google Sheet)"
      body={renderBody}
    />
  );
}
