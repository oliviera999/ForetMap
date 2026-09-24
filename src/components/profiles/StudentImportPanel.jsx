import { useState } from 'react';
import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../shared/platform/fileToDataUrl.js';
import { ImportPanel } from '../../shared/components/ImportPanel.jsx';
import { IconFileSpreadsheet, IconFileText } from '../../shared/icons.jsx';

/** Traitement d'un compte déjà présent ; '' = réglage de l'établissement. */
const EXISTING_STRATEGY_OPTIONS = [
  { value: '', label: 'Selon les réglages de l’établissement' },
  { value: 'update', label: 'Mettre à jour avec les données du fichier' },
  { value: 'fill', label: 'Compléter seulement les informations manquantes' },
  { value: 'skip', label: 'Ignorer les comptes déjà présents' },
];

/**
 * Panneau « Import {studentPlural} (CSV / XLSX) » (administration des profils).
 * Adaptateur du composant générique `ImportPanel` (audit 2026-07, P1) : fournit
 * le spécifique (endpoints, messages, totaux, carte + permission). Le parent ne
 * fournit que le contexte (`roleTerms`, `canImport`) et les retours (`setErr`/`setMsg`
 * vers les bandeaux, `onImported()` → rechargement).
 */
function StudentImportPanel({ roleTerms, canImport, setErr, setMsg, onImported }) {
  const [existingStrategy, setExistingStrategy] = useState('');

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
        ...(existingStrategy ? { existingStrategy } : {}),
      });
      setReport(result.report || null);
      if ((result.report?.totals?.created || 0) > 0 || (result.report?.totals?.updated || 0) > 0) {
        const created = result.report.totals.created || 0;
        const updated = result.report.totals.updated || 0;
        setMsg(`${created} créé(s), ${updated} mis à jour`);
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
            complétez-le puis importez. Colonne Rôle : le <strong>nom affiché</strong> du profil («{' '}
            {roleTerms.studentSingular} novice », « Prof de classe »…) ou son identifiant technique
            (<code>eleve_novice</code>, <code>prof_classe</code>) — accents, majuscules et espaces
            sont sans effet ; une cellule vide retombe sur le palier d&apos;entrée. Colonne Groupes
            : plusieurs noms ou slugs séparés par <code>|</code> ou <code>;</code>, chemins{' '}
            <code>Parent&gt;Enfant</code> (création automatique si absents). Une même personne sur
            plusieurs lignes est fusionnée (groupes cumulés ; dernière ligne pour le reste) — un
            message d&apos;info le signale. Un compte déjà présent (même prénom, nom et type){' '}
            <strong>garde toujours son profil le plus élevé</strong> : l&apos;import peut le faire
            monter de niveau, jamais redescendre.
          </p>
          <div className="field" style={{ margin: '0 0 10px' }}>
            <label htmlFor="student-import-existing-strategy">
              Comptes déjà présents : que faire des données du fichier ?
            </label>
            <select
              id="student-import-existing-strategy"
              value={existingStrategy}
              onChange={(e) => setExistingStrategy(e.target.value)}
              style={{ minHeight: 44 }}
            >
              {EXISTING_STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value || 'default'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <p
            style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--ink-warning)' }}
          >
            Remplacez ou supprimez les lignes d&apos;exemple avant l&apos;import. Les e-mails du
            fichier ne sont pas limités aux domaines Google / Moodle de l&apos;établissement. À la
            mise à jour, une cellule vide dans le fichier (mot de passe compris) laisse la valeur
            actuelle inchangée.
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
          <strong>{report.totals?.created || 0}</strong> · Mis à jour:{' '}
          <strong>{report.totals?.updated || 0}</strong> · Groupes créés:{' '}
          <strong>{report.totals?.groups_created || 0}</strong> · Rattachements:{' '}
          <strong>{report.totals?.groups_attached || 0}</strong> · Doublons fusionnés:{' '}
          <strong>{report.totals?.merged_duplicates || 0}</strong> · Ignorés (déjà là):{' '}
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
