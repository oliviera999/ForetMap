import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../shared/platform/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';
import { IconFileSpreadsheet, IconFileText } from '../../shared/icons.jsx';

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
        setMsg(`${result.report.totals.created} compte(s) créé(s)`);
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
      title={`Import comptes (${roleTerms.studentPlural} et enseignants)`}
      titleStyle={{ margin: '0 0 8px', fontSize: 'var(--text-base)', color: 'var(--forest)' }}
      intro={
        <>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            Téléchargez le modèle (rôles + rattachements à une ou plusieurs classes / sous-groupes),
            complétez-le puis importez. Colonne Groupes : plusieurs noms ou slugs séparés par{' '}
            <code>|</code> ou <code>;</code>, chemins <code>Parent&gt;Enfant</code> (création
            automatique si absents). Une même personne sur plusieurs lignes est fusionnée (groupes
            cumulés ; dernière ligne pour le reste) — un message d&apos;info le signale.
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: '#9a3412' }}>
            Remplacez ou supprimez les lignes d&apos;exemple avant l&apos;import. Les e-mails du
            fichier ne sont pas limités aux domaines Google / Moodle de l&apos;établissement.
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
          onClick: () => downloadStudentsTemplate('csv'),
        },
        {
          label: (
            <>
              <IconFileSpreadsheet size={14} /> Modèle XLSX
            </>
          ),
          onClick: () => downloadStudentsTemplate('xlsx'),
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
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}
      totalsRenderer={(report) => (
        <>
          Reçus: <strong>{report.totals?.received || 0}</strong> · Valides:{' '}
          <strong>{report.totals?.valid || 0}</strong> · Créés:{' '}
          <strong>{report.totals?.created || 0}</strong> · Groupes créés:{' '}
          <strong>{report.totals?.groups_created || 0}</strong> · Rattachements:{' '}
          <strong>{report.totals?.groups_attached || 0}</strong> · Doublons fusionnés:{' '}
          <strong>{report.totals?.merged_duplicates || 0}</strong> · Déjà existants:{' '}
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
