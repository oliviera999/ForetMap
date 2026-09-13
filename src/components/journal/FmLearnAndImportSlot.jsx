import { useCallback, useEffect, useState } from 'react';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { fetchJournalImportRefs, invalidateJournalImportRefs } from './journalImportRefs.js';
import { FmJournalImportButton } from './FmJournalImportButton.jsx';

/**
 * Composeur : bouton d’import carnet à côté d’un accusé (espèce / glossaire / tuto).
 */
export function FmLearnAndImportSlot({
  resourceType,
  resourceRef,
  title,
  learned = false,
  children,
}) {
  const publicSettings = usePublicSettings();
  const journalEnabled = publicSettings?.modules?.observations_enabled !== false;
  const [alreadyImported, setAlreadyImported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!resourceType || resourceRef == null || resourceRef === '') return undefined;
    const ref = String(resourceRef);
    fetchJournalImportRefs()
      .then((refs) => {
        const found = refs.some(
          (r) => r?.resourceType === resourceType && String(r?.resourceRef) === ref,
        );
        if (!cancelled && found) setAlreadyImported(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resourceType, resourceRef]);

  const onImported = useCallback(() => {
    // La liste partagée vient de changer : le prochain accusé monté doit la relire.
    invalidateJournalImportRefs();
    setAlreadyImported(true);
  }, []);

  return (
    <div className="fm-learn-import">
      {children}
      <FmJournalImportButton
        resourceType={resourceType}
        resourceRef={resourceRef}
        title={title}
        learned={learned}
        alreadyImported={alreadyImported}
        enabled={journalEnabled}
        onImported={onImported}
      />
    </div>
  );
}
