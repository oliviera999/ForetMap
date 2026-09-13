import { useCallback, useEffect, useState } from 'react';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import {
  loadImportedRefs,
  invalidateImportedRefs,
  refsContain,
} from '../../services/userJournalImports';
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

  // Liste mutualisée : une requête par écran, pas une par slot monté (le catalogue
  // biodiversité en affiche un par vignette — cf. `src/services/userJournalImports.js`).
  useEffect(() => {
    let cancelled = false;
    if (!resourceType || resourceRef == null || resourceRef === '') return undefined;
    loadImportedRefs().then((refs) => {
      if (!cancelled && refsContain(refs, resourceType, resourceRef)) setAlreadyImported(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resourceType, resourceRef]);

  const onImported = useCallback(() => {
    setAlreadyImported(true);
    // La liste partagée vient de changer : les prochains écrans la rechargeront.
    invalidateImportedRefs();
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
