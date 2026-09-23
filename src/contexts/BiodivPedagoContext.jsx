import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { usePublicSettings } from './PublicSettingsContext.jsx';
import {
  resolveBiodivPedagoLevel,
  canShowBiodivFeature,
  biodivFeatureVisibility,
  foodWebTypesForPedagoLevel,
  curriculumNiveauxForPedagoLevel,
  PEDAGO_LEVELS,
  PEDAGO_LEVEL_LABELS,
  normalizePedagoLevel,
} from '../utils/biodivPedagoLevel.js';

const PREVIEW_STORAGE_KEY = 'foretmap.biodivPedagoPreview';

const BiodivPedagoContext = createContext(null);

/**
 * Fournit le niveau pédagogique biodiversité effectif et les helpers de masquage.
 *
 * @param {object} props
 * @param {boolean} [props.isGuestVisit]
 * @param {string|null} [props.userPreference] — `users.biodiv_pedago_level`
 * @param {string|null} [props.mapLevel] — `maps.pedago_level` de la carte active
 * @param {string[]} [props.groupLevels] — niveaux des groupes dont l'utilisateur est membre
 * @param {boolean} [props.canTeacherPreview] — affiche le sélecteur « Voir comme »
 * @param {import('react').ReactNode} props.children
 */
export function BiodivPedagoProvider({
  isGuestVisit = false,
  userPreference = null,
  mapLevel = null,
  groupLevels = [],
  canTeacherPreview = false,
  children,
}) {
  const publicSettings = usePublicSettings();
  const [teacherPreview, setTeacherPreviewState] = useState(() => {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      return normalizePedagoLevel(sessionStorage.getItem(PREVIEW_STORAGE_KEY));
    } catch {
      return null;
    }
  });

  const setTeacherPreview = useCallback((next) => {
    const normalized = normalizePedagoLevel(next);
    setTeacherPreviewState(normalized);
    try {
      if (normalized) sessionStorage.setItem(PREVIEW_STORAGE_KEY, normalized);
      else sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!canTeacherPreview && teacherPreview) setTeacherPreview(null);
  }, [canTeacherPreview, teacherPreview, setTeacherPreview]);

  const siteDefault = publicSettings?.biodiv?.pedago_level_default ?? 'lycee';
  const prefCanRaise = Boolean(publicSettings?.biodiv?.pedago_pref_can_raise);

  const level = useMemo(() => {
    // Prof / admin : vue gestion complète sauf aperçu « voir comme un élève ».
    if (canTeacherPreview && !teacherPreview) return 'universite';
    return resolveBiodivPedagoLevel({
      isGuestVisit,
      siteDefault,
      mapLevel,
      groupLevels,
      userPreference,
      prefCanRaise,
      teacherPreview: canTeacherPreview ? teacherPreview : null,
    });
  }, [
    isGuestVisit,
    siteDefault,
    mapLevel,
    groupLevels,
    userPreference,
    prefCanRaise,
    canTeacherPreview,
    teacherPreview,
  ]);

  const value = useMemo(
    () => ({
      level,
      teacherPreview: canTeacherPreview ? teacherPreview : null,
      setTeacherPreview: canTeacherPreview ? setTeacherPreview : () => {},
      canTeacherPreview,
      canShow: (feature) => canShowBiodivFeature(feature, level),
      visibility: (feature) => biodivFeatureVisibility(feature, level),
      foodWebTypes: (allTypes) => foodWebTypesForPedagoLevel(level, allTypes),
      curriculumNiveaux: curriculumNiveauxForPedagoLevel(level),
      levels: PEDAGO_LEVELS,
      labels: PEDAGO_LEVEL_LABELS,
    }),
    [level, teacherPreview, setTeacherPreview, canTeacherPreview],
  );

  return <BiodivPedagoContext.Provider value={value}>{children}</BiodivPedagoContext.Provider>;
}

const FALLBACK = Object.freeze({
  level: 'lycee',
  teacherPreview: null,
  setTeacherPreview: () => {},
  canTeacherPreview: false,
  canShow: () => true,
  visibility: () => 'show',
  foodWebTypes: (all) => (Array.isArray(all) ? all : []),
  curriculumNiveaux: null,
  levels: PEDAGO_LEVELS,
  labels: PEDAGO_LEVEL_LABELS,
});

export function useBiodivPedago() {
  return useContext(BiodivPedagoContext) || FALLBACK;
}

export { BiodivPedagoContext };
