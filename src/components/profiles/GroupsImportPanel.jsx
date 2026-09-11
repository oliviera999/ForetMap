import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../shared/platform/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';
import { IconFileSpreadsheet, IconFileText } from '../../shared/icons.jsx';

/**
 * Panneau d'import de groupes / sous-groupes (CSV / XLSX).
 */
function GroupsImportPanel({ canImport, setErr, setMsg, onImported }) {
  const downloadTemplate = async (format) => {
    try {
      await downloadApiFile(
        `/api/groups/import/template?format=${encodeURIComponent(format)}`,
        format === 'xlsx' ? 'foretmap-modele-groupes.xlsx' : 'foretmap-modele-groupes.csv',
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors du téléchargement du modèle');
    }
  };

  const importGroups = async ({ file, dryRun, setReport }) => {
    try {
      const base64 = await fileToDataUrl(file);
      const result = await api('/api/groups/import', 'POST', {
        fileName: file.name,
        fileDataBase64: base64,
        dryRun,
      });
      setReport(result.report || null);
      if ((result.report?.totals?.created || 0) > 0) {
        setMsg(`${result.report.totals.created} groupe(s) créé(s)`);
      } else if (dryRun) {
        setMsg('Simulation terminée');
      } else {
        setMsg('Import groupes terminé');
      }
      await onImported?.();
    } catch (e) {
      setErr('Erreur import groupes: ' + (e.message || 'inconnue'));
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
      title="Import groupes / sous-groupes (CSV / XLSX)"
      titleStyle={{ margin: '0 0 8px', fontSize: 'var(--text-base)', color: 'var(--forest)' }}
      intro={
        <>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            Téléchargez le modèle (classes, sous-groupes avec parent, clubs…), complétez-le puis
            importez. Les groupes absents sont créés ; un parent peut être désigné par nom ou slug.
            Une même classe répétée sur plusieurs lignes est fusionnée (dernière ligne pour le
            reste) ; un groupe déjà présent est mis à jour.
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: '#9a3412' }}>
            Remplacez ou supprimez les lignes d&apos;exemple avant l&apos;import réel.
          </p>
        </>
      }
      templateButtons={[
        {
          label: (
            <>
              <IconFileText size={14} /> Modèle CSV
            </>
          ),
          onClick: () => downloadTemplate('csv'),
        },
        {
          label: (
            <>
              <IconFileSpreadsheet size={14} /> Modèle XLSX
            </>
          ),
          onClick: () => downloadTemplate('xlsx'),
        },
      ]}
      templateRowStyle={{ marginBottom: 10 }}
      importBusyLabel="Import…"
      importDisabled={!canImport}
      selectedFileStyle={{
        margin: '8px 0 0',
        fontSize: 'var(--text-sm)',
        color: 'var(--ink-soft)',
      }}
      reportBoxStyle={{
        marginTop: 10,
        padding: 10,
        background: '#f8fafc',
        borderRadius: 8,
        fontSize: 'var(--text-sm)',
      }}
      onImport={importGroups}
      totalsRenderer={(report) => (
        <div>
          Reçues : {report.totals?.received ?? 0} · Valides : {report.totals?.valid ?? 0} · Créés :{' '}
          {report.totals?.created ?? 0} · Mis à jour : {report.totals?.updated_existing ?? 0} ·
          Doublons fusionnés : {report.totals?.merged_duplicates ?? 0} · Ignorées :{' '}
          {report.totals?.skipped_invalid ?? 0}
        </div>
      )}
    />
  );
}

export { GroupsImportPanel };
