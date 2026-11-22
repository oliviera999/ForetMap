import { useCallback, useMemo } from 'react';
import { useBiodivPedago } from '../contexts/BiodivPedagoContext.jsx';
import { INTERACTION_TYPES, interactionTypeLabel } from '../shared/foodWebTypes.js';
import { interactionTypeLabelSimple } from '../shared/enums/biodivEnums.js';
import { foodWebProfile } from '../components/pedago/foodWebProfileModel.js';
import { GRAPH_PRESETS } from '../components/pedago/foodWebGraphModel.js';

/**
 * Profil d'affichage du réseau trophique, lu dans la table de visibilité par le contexte
 * pédagogique (chantier collège, flux C3) :
 *
 * - `collegeMode` : pas de réseau complet par défaut (`foodweb_full_by_default` masqué) —
 *   sélection d'espèces, profondeur 0 à 2, libellés en verbe ;
 * - `allowedTypes` : types d'interaction du palier (`foodWebTypes(...)`, règle
 *   `foodweb_types_cycle4_only` appliquée par le contexte) ;
 * - `typeLabel(type)` : libellé d'un type pour ce profil ;
 * - `defaultPreset` : cadrage d'ouverture (`foodweb_default_preset` : « Tout » au collège) ;
 * - `canGoFurther` / `goFurther` : bouton « Pour aller plus loin » (`foodweb_go_further`) et
 *   son état — activé, le profil devient celui du réseau complet (tous types, sans sélection
 *   obligatoire), libellés en verbe conservés.
 *
 * Hors fournisseur (tests, écran isolé) : réseau complet, comportement historique.
 */
export function useFoodWebProfile({ goFurther = false } = {}) {
  const { canShow, visibility, foodWebTypes } = useBiodivPedago();
  const fullByDefault = canShow('foodweb_full_by_default');
  // « Pour aller plus loin » : proposé au collège seulement (clé de la table, pas de test de
  // niveau ici) ; activé, le réseau complet de la carte, tous types, comme au lycée.
  const canGoFurther = !fullByDefault && canShow('foodweb_go_further');
  const further = canGoFurther && goFurther;
  const palierTypes = useMemo(() => foodWebTypes(INTERACTION_TYPES), [foodWebTypes]);
  const allowedTypes = further ? null : palierTypes;
  const profile = useMemo(
    () => foodWebProfile({ fullByDefault: fullByDefault || further, allowedTypes }),
    [fullByDefault, further, allowedTypes],
  );
  const rawPreset = typeof visibility === 'function' ? visibility('foodweb_default_preset') : null;
  const defaultPreset = Object.hasOwn(GRAPH_PRESETS, rawPreset) ? rawPreset : 'alimentaire';
  // Libellés en verbe tant que l'apprenant est au collège, même « plus loin ».
  const simpleLabels = !fullByDefault;
  const typeLabel = useCallback(
    (type) =>
      simpleLabels
        ? interactionTypeLabelSimple(type, { fallback: interactionTypeLabel(type) })
        : interactionTypeLabel(type),
    [simpleLabels],
  );
  return useMemo(
    () => ({
      ...profile,
      typeLabel,
      defaultPreset,
      canGoFurther,
      goFurther: further,
      palierTypes,
    }),
    [profile, typeLabel, defaultPreset, canGoFurther, further, palierTypes],
  );
}
