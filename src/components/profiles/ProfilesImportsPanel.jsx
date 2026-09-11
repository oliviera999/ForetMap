import { GroupsImportPanel } from './GroupsImportPanel.jsx';
import { StudentImportPanel } from './StudentImportPanel.jsx';
import { ProfilesStatsExportRow } from './ProfilesStatsExportRow.jsx';

/**
 * Sous-onglet Imports & exports : import élèves, import groupes, export stats.
 */
export function ProfilesImportsPanel({
  roleTerms,
  canImport = false,
  canImportGroups = false,
  canExport = false,
  canManageStudents = false,
  canManageProfiles = false,
  setErr,
  setMsg,
  onImported,
  onExport,
}) {
  return (
    <>
      {canManageStudents && <ProfilesStatsExportRow canExport={canExport} onExport={onExport} />}
      {(canManageProfiles || canImportGroups) && (
        <GroupsImportPanel
          canImport={canImportGroups}
          setErr={setErr}
          setMsg={setMsg}
          onImported={onImported}
        />
      )}
      {canManageStudents && (
        <StudentImportPanel
          roleTerms={roleTerms}
          canImport={canImport}
          setErr={setErr}
          setMsg={setMsg}
          onImported={onImported}
        />
      )}
    </>
  );
}
