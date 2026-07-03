import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../utils/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';

/**
 * Panneau n3boss « Import tâches/projets (CSV / XLSX) » de la vue Tâches.
 *
 * Adaptateur du composant générique `ImportPanel` (audit 2026-07, P1) : ne
 * fournit que le spécifique (endpoints, messages, totaux du rapport) — seuls
 * `setToast` et `onRefresh` viennent du parent.
 */
export function TaskImportPanel({ setToast, onRefresh }) {
  const downloadImportTemplate = async (format) => {
    try {
      await downloadApiFile(
        `/api/tasks/import/template?format=${encodeURIComponent(format)}`,
        format === 'xlsx'
          ? 'foretmap-modele-taches-projets.xlsx'
          : 'foretmap-modele-taches-projets.csv',
      );
    } catch (e) {
      setToast('Zut, le modèle ne part pas : ' + (e.message || 'inconnue'));
    }
  };

  const runImportTasksProjects = async ({ file, dryRun, setReport }) => {
    try {
      const fileDataBase64 = await fileToDataUrl(file);
      const result = await api('/api/tasks/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
      });
      setReport(result?.report || null);
      if (dryRun) {
        setToast('Simulation terminée — regarde le rapport ci-dessous ✓');
      } else {
        const createdProjects = Number(result?.report?.totals?.created_projects || 0);
        const createdTasks = Number(result?.report?.totals?.created_tasks || 0);
        setToast(
          `Import OK : ${createdProjects} projet(s), ${createdTasks} tâche(s) — la forêt grossit !`,
        );
        await onRefresh();
      }
    } catch (e) {
      setToast('Import bloqué : ' + (e.message || 'inconnue'));
    }
  };

  return (
    <ImportPanel
      variant="details"
      title="Import tâches/projets (CSV / XLSX)"
      intro={
        <p style={{ margin: 0, fontSize: '.85rem', color: '#6b7280' }}>
          Le fichier peut contenir des lignes de type <strong>project</strong> et{' '}
          <strong>task</strong>.
        </p>
      }
      templateButtons={[
        { label: '📄 Modèle CSV', onClick: () => downloadImportTemplate('csv') },
        { label: '📗 Modèle XLSX', onClick: () => downloadImportTemplate('xlsx') },
      ]}
      templatesDisabledWhenBusy
      importBusyLabel="Import..."
      selectedFileStyle={{ margin: 0, fontSize: '.8rem', color: '#6b7280' }}
      reportBoxStyle={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 10,
      }}
      totalsRenderer={(report) => (
        <>
          Reçues: <strong>{report?.totals?.received || 0}</strong> · Valides:{' '}
          <strong>{report?.totals?.valid || 0}</strong> · Projets créés:{' '}
          <strong>{report?.totals?.created_projects || 0}</strong> · Tâches créées:{' '}
          <strong>{report?.totals?.created_tasks || 0}</strong> · Déjà existants:{' '}
          <strong>{report?.totals?.skipped_existing || 0}</strong> · Invalides:{' '}
          <strong>{report?.totals?.skipped_invalid || 0}</strong>
        </>
      )}
      errorsMoreLabel={(count) => `... ${count} erreur(s) supplémentaire(s)`}
      onMissingFile={() => setToast('Choisis d’abord un fichier CSV ou XLSX, stp.')}
      onImport={runImportTasksProjects}
    />
  );
}
