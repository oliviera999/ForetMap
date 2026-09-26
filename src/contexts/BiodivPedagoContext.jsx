import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { usePublicSettings } from './PublicSettingsContext.jsx';
import {
  canShowBiodivFeature,
  biodivFeatureVisibility,
  foodWebTypesForPedagoLevel,
  PEDAGO_LEVELS,
  PEDAGO_LEVEL_LABELS,
  normalizePedagoLevel,
} from '../utils/biodivPedagoLevel.js';
import { resolveLearnerLevel } from '../utils/learnerLevel.js';

const PREVIEW_STORAGE_KEY = 'foretmap.biodivPedagoPreview';

const BiodivPedagoContext = createContext(null);
const EMPTY_LIST = Object.freeze([]);

/**
 * Fournit le niveau de l'apprenant (échelle unique, `src/utils/learnerLevel.js`, miroir du
 * résolveur serveur) : l'affichage biodiversité et les notions proposées au quiz et au
 * glossaire en découlent.
 *
 * @param {object} props
 * @param {boolean} [props.isGuestVisit]
 * @param {string|null} [props.userPreference] — `users.biodiv_pedago_level` (affichage seul)
 * @param {string|null} [props.mapLevel] — `maps.pedago_level` de la carte active (repli)
 * @param {string[]} [props.groupLevels] — `groups.pedago_level` des groupes de l'utilisateur (repli)
 * @param {string[]} [props.classCurriculumNiveaux] — niveaux de ses classes
 *   (`groups.curriculum_niveau`, hérité du parent) : la source du niveau de l'élève
 * @param {string|null} [props.sessionLevel] — public de la séance en cours (`college`…)
 * @param {string|null} [props.sessionNotionNiveau] — niveau de notion de la séance en cours :
 *   la séance **impose** son niveau (décision du 25/09/2026)
 * @param {boolean} [props.canTeacherPreview] — autorise l'aperçu de niveau (menu « Aperçu »
 *   de l'en-tête)
 * @param {boolean} [props.fullViewByDefault] — sans aperçu choisi, vue gestion complète
 *   (chrome prof). Faux en « vue élève » : le niveau suit alors les règles élève.
 * @param {import('react').ReactNode} props.children
 */
export function BiodivPedagoProvider({
  isGuestVisit = false,
  userPreference = null,
  mapLevel = null,
  groupLevels = EMPTY_LIST,
  classCurriculumNiveaux = EMPTY_LIST,
  sessionLevel = null,
  sessionNotionNiveau = null,
  canTeacherPreview = false,
  fullViewByDefault = canTeacherPreview,
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

  const siteDefault = publicSettings?.biodiv?.pedago_level_default ?? 'college';
  const prefCanRaise = Boolean(publicSettings?.biodiv?.pedago_pref_can_raise);

  // La classe ne compte que pour un élève : un professeur (vue complète ou aperçu d'un
  // niveau) doit voir ce que voit *un* élève de ce niveau, pas de ses propres groupes.
  const classNiveaux = canTeacherPreview ? EMPTY_LIST : classCurriculumNiveaux;

  const learner = useMemo(
    () =>
      resolveLearnerLevel({
        isGuest: isGuestVisit,
        teacherPreview: canTeacherPreview ? teacherPreview : null,
        teacherFullView: canTeacherPreview && fullViewByDefault && !teacherPreview,
        session:
          sessionLevel || sessionNotionNiveau
            ? { level: sessionLevel, notionNiveau: sessionNotionNiveau }
            : null,
        classNiveaux,
        groupLevels,
        mapLevel,
        siteDefault,
        userPreference,
        prefCanRaise,
      }),
    [
      isGuestVisit,
      canTeacherPreview,
      teacherPreview,
      fullViewByDefault,
      sessionLevel,
      sessionNotionNiveau,
      classNiveaux,
      groupLevels,
      mapLevel,
      siteDefault,
      userPreference,
      prefCanRaise,
    ],
  );

  const level = learner.etape;
  const curriculumNiveaux = learner.curriculumNiveaux;

  const value = useMemo(
    () => ({
      level,
      learner,
      teacherPreview: canTeacherPreview ? teacherPreview : null,
      setTeacherPreview: canTeacherPreview ? setTeacherPreview : () => {},
      canTeacherPreview,
      fullViewByDefault: canTeacherPreview && fullViewByDefault,
      canShow: (feature) => canShowBiodivFeature(feature, level),
      visibility: (feature) => biodivFeatureVisibility(feature, level),
      foodWebTypes: (allTypes) => foodWebTypesForPedagoLevel(level, allTypes),
      curriculumNiveaux,
      levels: PEDAGO_LEVELS,
      labels: PEDAGO_LEVEL_LABELS,
    }),
    [
      level,
      learner,
      teacherPreview,
      setTeacherPreview,
      canTeacherPreview,
      fullViewByDefault,
      curriculumNiveaux,
    ],
  );

  return <BiodivPedagoContext.Provider value={value}>{children}</BiodivPedagoContext.Provider>;
}

const FALLBACK = Object.freeze({
  level: 'college',
  learner: null,
  teacherPreview: null,
  setTeacherPreview: () => {},
  canTeacherPreview: false,
  fullViewByDefault: false,
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
