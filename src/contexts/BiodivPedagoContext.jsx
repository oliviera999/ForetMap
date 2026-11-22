import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { usePublicSettings } from './PublicSettingsContext.jsx';
import {
  canShowBiodivFeature,
  biodivFeatureVisibility,
  foodWebTypesForPedagoLevel,
  PEDAGO_LEVELS,
  PEDAGO_LEVEL_LABELS,
} from '../utils/biodivPedagoLevel.js';
import { resolveLearnerLevel } from '../utils/learnerLevel.js';
import {
  normalizePreviewLevel,
  PREVIEW_STORAGE_KEY,
  storedPreviewLevel,
} from '../utils/appPreview.js';
import { palierRuleFor } from '../shared/pedagoVisibilityCore.js';

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
 *   de l'en-tête) : une classe de 6e (`cycle3`), de 3e (`cycle4`) ou le lycée ; une étape
 *   mémorisée avant le chantier collège (`college`…) reste acceptée
 * @param {boolean} [props.staff] — compte personnel non élève (prof, admin, personnel…) hors
 *   « vue élève » simulée : sans aperçu ni séance, il suit son **niveau de contenu** (choix du
 *   profil, sinon ses groupes, sinon cycle 3 — demande du 22/11/2026). Faux en « vue élève » :
 *   le niveau suit alors les règles élève.
 * @param {string|null} [props.contentLevel] — `users.pedago_content_level` (choix explicite du
 *   profil d'un compte non élève ; `complet` = vue gestion)
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
  staff = false,
  contentLevel = null,
  children,
}) {
  const publicSettings = usePublicSettings();
  const [teacherPreview, setTeacherPreviewState] = useState(storedPreviewLevel);

  const setTeacherPreview = useCallback((next) => {
    const normalized = normalizePreviewLevel(next);
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

  // Groupes : un compte non élève en tire son niveau par défaut. En « vue élève » simulée, la
  // vue doit montrer ce que voit *un* élève, pas les groupes du compte qui simule.
  const classNiveaux = !staff && canTeacherPreview ? EMPTY_LIST : classCurriculumNiveaux;
  const activePreview = canTeacherPreview ? teacherPreview : null;

  // Niveau hors aperçu : celui que « Quitter l'aperçu » rétablit (le profil, pour un compte
  // non élève). Le niveau effectif ne diffère que par l'aperçu, qui passe devant.
  const baseLearner = useMemo(
    () =>
      resolveLearnerLevel({
        isGuest: isGuestVisit,
        staff,
        contentLevel,
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
      staff,
      contentLevel,
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
  // Défaut d'un compte non élève sans choix explicite : ses groupes, sinon le cycle 3. Affiché
  // par « Mon profil » (« Niveau de mes groupes — … »). Les libellés se calculent dans les
  // écrans chargés à la demande (`staffContentLevelLabel`), pas ici : ce contexte fait partie
  // du bundle de l'écran de connexion (visite invitée), sous budget.
  const staffDefaultLearner = useMemo(
    () =>
      staff ? resolveLearnerLevel({ staff: true, classNiveaux: classCurriculumNiveaux }) : null,
    [staff, classCurriculumNiveaux],
  );
  const learner = useMemo(
    () =>
      activePreview && !isGuestVisit
        ? resolveLearnerLevel({ teacherPreview: activePreview })
        : baseLearner,
    [activePreview, isGuestVisit, baseLearner],
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
      staff,
      // Compte non élève sans aperçu actif : les écrans de **gestion** (onglet Individus,
      // estimations…) restent complets quel que soit son niveau de contenu, qui ne règle que
      // le contenu pédagogique consulté. Un aperçu, simulation assumée, les masque.
      managementView: staff && !isGuestVisit && !activePreview,
      // Niveau hors aperçu d'un compte non élève (l'entrée « sans aperçu » du menu Aperçu) et
      // son défaut sans choix (Mon profil) ; `null` pour un élève.
      staffBaseLearner: staff ? baseLearner : null,
      staffDefaultLearner,
      // Table de visibilité (`src/shared/pedagoVisibilityCore.js`) : le profil se lit sur
      // l'apprenant complet (étape d'affichage) ; les règles de palier sur sa classe.
      canShow: (feature) => canShowBiodivFeature(feature, learner),
      visibility: (feature) => biodivFeatureVisibility(feature, learner),
      palierRule: (rule) => palierRuleFor(rule, learner),
      // Types du réseau : profil d'affichage + règle de palier (symbiose et compétition
      // réservées au cycle 4) — d'où l'apprenant complet, pas seulement l'étape.
      foodWebTypes: (allTypes) => foodWebTypesForPedagoLevel(learner, allTypes),
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
      staff,
      isGuestVisit,
      activePreview,
      baseLearner,
      staffDefaultLearner,
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
  staff: false,
  managementView: false,
  staffBaseLearner: null,
  staffDefaultLearner: null,
  canShow: () => true,
  visibility: () => 'show',
  palierRule: (rule) => palierRuleFor(rule, null),
  foodWebTypes: (all) => (Array.isArray(all) ? all : []),
  curriculumNiveaux: null,
  levels: PEDAGO_LEVELS,
  labels: PEDAGO_LEVEL_LABELS,
});

export function useBiodivPedago() {
  return useContext(BiodivPedagoContext) || FALLBACK;
}

export { BiodivPedagoContext };
