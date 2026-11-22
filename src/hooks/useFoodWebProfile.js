import { useCallback, useMemo } from 'react';
import { useBiodivPedago } from '../contexts/BiodivPedagoContext.jsx';
import { INTERACTION_TYPES, interactionTypeLabel } from '../shared/foodWebTypes.js';
import { interactionTypeLabelSimple } from '../shared/enums/biodivEnums.js';
import { foodWebProfile } from '../components/pedago/foodWebProfileModel.js';

/**
 * Profil d'affichage du réseau trophique, lu dans la table de visibilité par le contexte
 * pédagogique (chantier collège, flux C3) :
 *
 * - `collegeMode` : pas de réseau complet par défaut (`foodweb_full_by_default` masqué) —
 *   choix d'une espèce de départ, profondeur 1 extensible à 2, libellés en verbe ;
 * - `allowedTypes` : types d'interaction du palier (`foodWebTypes(...)`, règle
 *   `foodweb_types_cycle4_only` appliquée par le contexte) ;
 * - `typeLabel(type)` : libellé d'un type pour ce profil.
 *
 * Hors fournisseur (tests, écran isolé) : réseau complet, comportement historique.
 */
export function useFoodWebProfile() {
  const { canShow, foodWebTypes } = useBiodivPedago();
  const fullByDefault = canShow('foodweb_full_by_default');
  const allowedTypes = useMemo(() => foodWebTypes(INTERACTION_TYPES), [foodWebTypes]);
  const profile = useMemo(
    () => foodWebProfile({ fullByDefault, allowedTypes }),
    [fullByDefault, allowedTypes],
  );
  const typeLabel = useCallback(
    (type) =>
      profile.collegeMode
        ? interactionTypeLabelSimple(type, { fallback: interactionTypeLabel(type) })
        : interactionTypeLabel(type),
    [profile.collegeMode],
  );
  return useMemo(() => ({ ...profile, typeLabel }), [profile, typeLabel]);
}
