import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../utils/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';

/**
 * Panneau « Import {studentPlural} (CSV / XLSX) » (administration des profils).
 * Adaptateur du composant générique `ImportPanel` (audit 2026-07, P1) : fournit
 * le spécifique (endpoints, messages, totaux, carte + permission). Le parent ne
 * fournit que le contexte (`roleTerms`, `canImport`) et les retours (`setErr`/`setMsg`
 * vers les bandeaux, `onImported()` → rechargement). Comportement inchangé.
 */
function StudentImportPanel({ roleTerms, canImport, setErr, setMsg, onImported }) {
  const downloadStudentsTemplate = async (format) => {
    try {
      await downloadApiFile(
        `/api/students/import/template?format=${encodeURIComponent(format)}`,
        format === 'xlsx' ? 'foretmap-modele-n3beurs.xlsx' : 'foretmap-modele-n3beurs.csv',
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors du téléchargement du modèle');
    }
  };

  const importStudents = async ({ file, dryRun, setReport }) => {
    try {
      const base64 = await fileToDataUrl(file);
      const result = await api('/api/students/import', 'POST', {
        fileName: file.name,
        fileDataBase64: base64,
        dryRun,
      });
      setReport(result.report || null);
      if ((result.report?.totals?.created || 0) > 0) {
        setMsg(`${result.report.totals.created} ${roleTerms.studentSingular}(s) créé(s)`);
      } else if (dryRun) {
        setMsg('Simulation terminée');
      } else {
        setMsg('Import terminé');
      }
      await onImported();
    } catch (e) {
      setErr('Erreur import: ' + (e.message || 'inconnue'));
    }
  };

  return (
    <ImportPanel
      variant="card"
      containerStyle={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        opacity: canImport ? 1 : 0.65,
      }}
      title={`Import ${roleTerms.studentPlural} (CSV / XLSX)`}
      titleStyle={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--forest)' }}
      intro={
        <>
          <p style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#6b7280' }}>
            Téléchargez un modèle vierge, complétez-le puis importez le fichier.
          </p>
          <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: '#9a3412' }}>
            Le modèle contient une ligne d&apos;exemple: pensez à la remplacer ou la supprimer avant
            l&apos;import.
          </p>
        </>
      }
      templateButtons={[
        { label: '📄 Modèle CSV', onClick: () => downloadStudentsTemplate('csv') },
        { label: '📗 Modèle XLSX', onClick: () => downloadStudentsTemplate('xlsx') },
      ]}
      templateRowStyle={{ marginBottom: 10 }}
      importBusyLabel="Import…"
      importDisabled={!canImport}
      selectedFileStyle={{ margin: '8px 0 0', fontSize: '.8rem', color: '#6b7280' }}
      reportBoxStyle={{
        marginTop: 10,
        padding: 10,
        background: '#f8fafc',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}
      totalsRenderer={(report) => (
        <>
          Reçus: <strong>{report.totals?.received || 0}</strong> · Valides:{' '}
          <strong>{report.totals?.valid || 0}</strong> · Créés:{' '}
          <strong>{report.totals?.created || 0}</strong> · Déjà existants:{' '}
          <strong>{report.totals?.skipped_existing || 0}</strong> · Invalides:{' '}
          <strong>{report.totals?.skipped_invalid || 0}</strong>
        </>
      )}
      errorsMoreLabel={(count) => `… ${count} erreur(s) supplémentaire(s)`}
      onMissingFile={() => setErr('Choisissez un fichier CSV ou XLSX')}
      onImportStart={() => setErr('')}
      onImport={importStudents}
    />
  );
}

export { StudentImportPanel };
