import { useCallback, useEffect, useState } from 'react';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { FmJournalImportButton } from './FmJournalImportButton.jsx';
import { getImportedRefs, invalidateImportedRefs } from './importedRefsCache.js';

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
    // Liste mutualisée : une requête pour toute la page, quel que soit le nombre de vignettes
    // (`importedRefsCache.js`). Chaque vignette la demandait auparavant pour son seul compte.
    getImportedRefs()
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
    // La liste mémorisée vient de changer : la périmer, sinon une autre vignette de la même
    // page continuerait de se croire non importée.
    invalidateImportedRefs();
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
