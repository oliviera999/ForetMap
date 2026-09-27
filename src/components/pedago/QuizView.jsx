import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LearningQuizPopover } from '../../shared/components/LearningQuizPopover.jsx';
import {
  glossaryPropsWhileAnswering,
  showLinkedGlossaryTerms,
} from '../../shared/qcm/quizGlossaryReveal.js';
import { fetchQuizCategories } from '../../services/quizApi';
import { enumOptions } from '../../shared/enums/enumCore.js';
import {
  QUESTION_NIVEAU_ENUM,
  QUIZ_DIFFICULTE_ENUM,
  QUIZ_THEME_ENUM,
} from '../../shared/enums/pedagoEnums.js';
import { useQuizSession } from '../../hooks/useQuizSession.js';
import { PedagoQcmFeedbackBlock } from './PedagoQcmFeedbackBlock.jsx';
import { GlossaryInlineText } from '../GlossaryMarkdown.jsx';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { mergeGlossaryLinkItems } from '../../utils/foretmapGlossaryAutolink.js';
import { IconQuiz } from '../../shared/icons.jsx';
import { oluQuizHeaderSubtitle } from '../../shared/utils/oluLearningVoice.js';
import { useCurriculumNotions } from '../../hooks/useCurriculumNotions.js';
import {
  buildNotionOptions,
  notionNiveauOptionsFor,
  notionsForNiveauFilter,
  resolveNotionNiveaux,
} from '../../utils/curriculumNotions.js';
import { etapeForCurriculumNiveau, parseNotionNiveauFilter } from '../../utils/pedagoScales.js';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';

// Menus lus dans le référentiel partagé (audit du 25/09/2026, § 3.2.5). La difficulté va de
// 1 à 3, comme le corpus : l'ancien menu proposait 1 à 5, et les filtres 4 et 5 ne trouvaient
// rien.
const THEME_OPTIONS = [{ value: '', label: 'Tous thèmes' }, ...enumOptions(QUIZ_THEME_ENUM)];

const NIVEAU_OPTIONS = [{ value: '', label: 'Tous niveaux' }, ...enumOptions(QUESTION_NIVEAU_ENUM)];

const DIFFICULTE_OPTIONS = [
  { value: '', label: 'Toute difficulté' },
  ...enumOptions(QUIZ_DIFFICULTE_ENUM).map((opt) => ({ ...opt, value: String(opt.value) })),
];

/**
 * Niveau de question proposé par défaut : « Collège » quand tout le public est au collège
 * (notions visibles toutes de cycle 3 ou 4). Les échelles se répondent — un élève en
 * affichage Collège ne tire plus par défaut des questions de lycée — mais le filtre reste
 * modifiable. `null` (pas de contexte, professeur en vue complète, lycée) : aucun défaut.
 */
function defaultQuestionNiveau(curriculumNiveaux) {
  if (!Array.isArray(curriculumNiveaux) || curriculumNiveaux.length === 0) return '';
  return curriculumNiveaux.every((n) => etapeForCurriculumNiveau(n) === 'college') ? 'college' : '';
}

/**
 * Niveau de question au montage. **Une séance impose son niveau** (décision du 25/09/2026) :
 * quand le quiz est ouvert depuis une séance (`initialNotionNiveau`), le défaut suit les
 * niveaux de notion de la séance et non l'affichage de l'élève — une séance « lycée » ouverte
 * par un élève en affichage Collège ne servait sinon aucune question de lycée.
 */
function initialQuestionNiveau(initialNotionNiveau, curriculumNiveaux) {
  const raw = initialNotionNiveau != null ? String(initialNotionNiveau).trim() : '';
  const parsed = raw ? parseNotionNiveauFilter(raw) : null;
  if (parsed && !parsed.error && parsed.niveaux.length > 0) {
    return defaultQuestionNiveau(parsed.niveaux);
  }
  return defaultQuestionNiveau(curriculumNiveaux);
}

/** Valeur du paramètre `notionNiveau` : le filtre choisi, resserré aux niveaux du public. */
function notionNiveauParam(filter, curriculumNiveaux) {
  const niveaux = resolveNotionNiveaux(filter, curriculumNiveaux);
  return niveaux ? niveaux.join(',') : '';
}

/** Filtre de notion d'une requête : la notion choisie, sinon le niveau du programme. */
function notionQueryParams(notionId, notionNiveau, curriculumNiveaux) {
  if (notionId) return { notionId };
  return { notionNiveau: notionNiveauParam(notionNiveau, curriculumNiveaux) };
}

export function QuizView({
  onOpenPlant,
  onOpenGlossaryTerm,
  initialQuestionCode = null,
  initialNotionId = null,
  initialNotionNiveau = null,
}) {
  const { curriculumNiveaux } = useBiodivPedago();
  const [theme, setTheme] = useState('');
  const [niveau, setNiveau] = useState(() =>
    initialQuestionNiveau(initialNotionNiveau, curriculumNiveaux),
  );
  const [difficulte, setDifficulte] = useState('');
  const [categorieSlug, setCategorieSlug] = useState('');
  // Notion du programme : le niveau scolaire restreint la liste des notions, la notion
  // restreint ensuite les catégories et le tirage (migration 273).
  const [notionNiveau, setNotionNiveau] = useState(() =>
    initialNotionNiveau != null ? String(initialNotionNiveau).trim() : '',
  );
  const [notionId, setNotionId] = useState(() =>
    initialNotionId != null && String(initialNotionId).trim() !== ''
      ? String(initialNotionId).trim()
      : '',
  );
  const [illustratedOnly, setIllustratedOnly] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  /** Invalide une réponse de catégories périmée (changement de thème/niveau pendant le fetch). */
  const loadCategoriesSeqRef = useRef(0);

  const loadCategories = useCallback(async () => {
    const seq = ++loadCategoriesSeqRef.current;
    setLoadingCategories(true);
    try {
      const data = await fetchQuizCategories({
        theme,
        niveau,
        ...notionQueryParams(notionId, notionNiveau, curriculumNiveaux),
      });
      if (seq !== loadCategoriesSeqRef.current) return;
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
    } catch (_) {
      if (seq !== loadCategoriesSeqRef.current) return;
      setCategories([]);
    } finally {
      if (seq === loadCategoriesSeqRef.current) setLoadingCategories(false);
    }
  }, [theme, niveau, notionId, notionNiveau, curriculumNiveaux]);

  useEffect(() => {
    loadCategories();
    return () => {
      loadCategoriesSeqRef.current += 1;
    };
  }, [loadCategories]);

  // Cycle de vie de la question (tirage, présentation, réponse, remédiation, progression).
  const {
    progress,
    drawing,
    questionCode,
    presentation,
    selectedChoiceId,
    setSelectedChoiceId,
    submitting,
    answerResult,
    remediationTerms,
    remediationPlants,
    error,
    showAnswer,
    showChoices,
    drawQuestion: drawWithParams,
    submitAnswer,
    resetQuestion,
  } = useQuizSession({ initialQuestionCode });

  useEffect(() => {
    if (initialNotionNiveau == null) return;
    setNotionNiveau(String(initialNotionNiveau).trim());
    // Nouvelle séance : son niveau s'impose aussi au filtre de niveau des questions.
    setNiveau(initialQuestionNiveau(initialNotionNiveau, curriculumNiveaux));
    // `curriculumNiveaux` volontairement hors dépendances : seul un changement de séance
    // réinitialise le filtre, pas un rechargement du profil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotionNiveau]);

  useEffect(() => {
    if (initialNotionId != null && String(initialNotionId).trim() !== '') {
      setNotionId(String(initialNotionId).trim());
    }
  }, [initialNotionId]);

  useEffect(() => {
    if (!categorieSlug) return;
    if (!categories.some((c) => c.slug === categorieSlug)) setCategorieSlug('');
  }, [categories, categorieSlug]);

  const notions = useCurriculumNotions();
  // Niveaux du programme : ceux du public (étape d'affichage, resserrée à la classe), et
  // le filtre choisi — niveau, étape entière ou valeur reçue d'une séance.
  const curriculumNiveauOptions = useMemo(
    () => notionNiveauOptionsFor(curriculumNiveaux, notionNiveau),
    [curriculumNiveaux, notionNiveau],
  );
  const visibleNotions = useMemo(
    () => notionsForNiveauFilter(notions, notionNiveau, curriculumNiveaux),
    [notions, notionNiveau, curriculumNiveaux],
  );
  const notionOptions = useMemo(() => buildNotionOptions(visibleNotions), [visibleNotions]);

  // Changer de niveau scolaire ne doit pas laisser une notion d'un autre niveau active :
  // le tirage annoncerait « aucune question » sans qu'on voie pourquoi (même correctif que
  // le filtre de catégorie ci-dessus).
  useEffect(() => {
    if (!notionId) return;
    if (!visibleNotions.some((n) => n.id === notionId)) setNotionId('');
  }, [visibleNotions, notionId]);

  const categorieOptions = useMemo(
    () => [
      { value: '', label: 'Toutes catégories' },
      ...categories.map((c) => ({
        value: c.slug,
        label: `${c.emoji ? `${c.emoji} ` : ''}${c.nom}${c.questionCount != null ? ` (${c.questionCount})` : ''}`,
      })),
    ],
    [categories],
  );

  // Auto-liens : index partagé, complété par les termes déjà liés à la question
  // (comme `QcmPreviewModal` côté GL) — ces termes-là ne sont pas forcément
  // « actifs » dans l'index général.
  const glossaryIndex = useGlossaryLinkIndex();
  const autolinkItems = useMemo(
    () => mergeGlossaryLinkItems(glossaryIndex, remediationTerms),
    [glossaryIndex, remediationTerms],
  );
  // Énoncé et propositions : consultables seulement APRÈS la réponse (cf.
  // `quizGlossaryReveal`) — sinon le glossaire donne la réponse.
  const answeringGlossaryProps = useMemo(
    () =>
      glossaryPropsWhileAnswering({ glossaryItems: autolinkItems, onOpenGlossaryTerm }, showAnswer),
    [autolinkItems, onOpenGlossaryTerm, showAnswer],
  );

  function drawQuestion() {
    return drawWithParams({
      categorieSlug,
      niveau,
      difficulte,
      illustrated: illustratedOnly ? '1' : '',
      ...notionQueryParams(notionId, notionNiveau, curriculumNiveaux),
    });
  }

  const renderQuizBody = (surface) => (
    <>
      {questionCode ? <p className="section-sub">Question {questionCode}</p> : null}

      {showChoices ? (
        <>
          {/* Auto-liaison neutralisée tant que l'élève n'a pas répondu : consulter le
              terme lié donnait la réponse. Le texte, lui, ne change pas. */}
          <GlossaryInlineText
            tag="p"
            className="pedago-quiz__question"
            text={presentation.question}
            {...answeringGlossaryProps}
          />
          {presentation.photoUrl ? (
            <figure className="pedago-quiz__photo-wrap">
              <img src={presentation.photoUrl} alt="" className="pedago-quiz__photo" />
              {presentation.photoCredit || presentation.photoLicence ? (
                <figcaption className="pedago-quiz__photo-credit">
                  {[presentation.photoCredit, presentation.photoLicence]
                    .filter(Boolean)
                    .join(' — ')}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div className="pedago-quiz__choices">
            {presentation.choices.map((choice) => (
              <label key={choice.id} className="pedago-quiz__choice">
                <input
                  type="radio"
                  name={`pedago-quiz-choice-${surface}`}
                  checked={selectedChoiceId === choice.id}
                  onChange={() => setSelectedChoiceId(choice.id)}
                />
                <GlossaryInlineText text={choice.text} {...answeringGlossaryProps} />
              </label>
            ))}
          </div>

          {showLinkedGlossaryTerms(showAnswer) && presentation.glossaryTerms?.length > 0 ? (
            <div className="pedago-remediation">
              <strong>Glossaire utile</strong>
              <div className="pedago-chip-row">
                {presentation.glossaryTerms.map((term) => (
                  <button
                    key={term.glossary_code}
                    type="button"
                    className="pedago-chip-btn"
                    onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                  >
                    {term.terme}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pedago-quiz__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitAnswer}
              disabled={submitting || selectedChoiceId == null}
            >
              {submitting ? 'Envoi…' : 'Valider ma réponse'}
            </button>
          </div>
        </>
      ) : null}

      {showAnswer ? (
        <>
          <PedagoQcmFeedbackBlock
            result={answerResult}
            glossaryItems={autolinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            seed={questionCode}
          />
          {remediationTerms.length > 0 ? (
            <div className="pedago-remediation">
              <strong>Pour approfondir — glossaire</strong>
              <div className="pedago-chip-row">
                {remediationTerms.map((term) => (
                  <button
                    key={term.glossary_code}
                    type="button"
                    className="pedago-chip-btn"
                    onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                  >
                    {term.terme}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {remediationPlants.length > 0 ? (
            <div className="pedago-remediation">
              <strong>Pour approfondir — espèces</strong>
              <div className="pedago-chip-row">
                {remediationPlants.map((plant) => (
                  <button
                    key={plant.id}
                    type="button"
                    className="pedago-chip-btn"
                    onClick={() => onOpenPlant?.(plant.id)}
                  >
                    {plant.emoji ? `${plant.emoji} ` : ''}
                    {plant.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="pedago-quiz__actions">
            <button type="button" className="btn btn-secondary" onClick={resetQuestion}>
              Nouvelle question
            </button>
            <button type="button" className="btn btn-primary" onClick={drawQuestion}>
              Re-tirer
            </button>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <div className="pedago-view pedago-quiz">
      <header className="pedago-view__head">
        <h2 className="section-title">
          <IconQuiz size={20} /> Quiz
        </h2>
        <p className="section-sub">{oluQuizHeaderSubtitle(questionCode)}</p>
        {progress ? (
          <p className="section-sub pedago-quiz__progress">
            Progression : {progress.correct}/{progress.attempts} bonnes réponses
          </p>
        ) : null}
      </header>

      <div className="pedago-filters card">
        <label className="pedago-filter-field">
          <span>Thème</span>
          <select className="form-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Niveau</span>
          <select
            className="form-select"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
          >
            {NIVEAU_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Difficulté</span>
          <select
            className="form-select"
            value={difficulte}
            onChange={(e) => setDifficulte(e.target.value)}
          >
            {DIFFICULTE_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Niveau du programme</span>
          <select
            className="form-select"
            value={notionNiveau}
            onChange={(e) => setNotionNiveau(e.target.value)}
          >
            {curriculumNiveauOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field pedago-filter-field--wide">
          <span>Notion du programme</span>
          <select
            className="form-select"
            value={notionId}
            onChange={(e) => setNotionId(e.target.value)}
          >
            {notionOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Catégorie</span>
          <select
            className="form-select"
            value={categorieSlug}
            onChange={(e) => setCategorieSlug(e.target.value)}
            disabled={loadingCategories}
          >
            {categorieOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field pedago-filter-field--checkbox">
          <span>Illustrées</span>
          <input
            type="checkbox"
            checked={illustratedOnly}
            onChange={(e) => setIllustratedOnly(e.target.checked)}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={drawQuestion} disabled={drawing}>
          {drawing ? 'Tirage…' : 'Tirer une question'}
        </button>
      </div>

      {error ? <p className="pedago-error">{error}</p> : null}

      {!presentation && !drawing && !error ? (
        <p className="section-sub card" style={{ padding: 16 }}>
          Choisis des filtres puis lance un tirage aléatoire.
        </p>
      ) : null}

      {(showChoices || showAnswer) && (
        <article className="card pedago-quiz__card">
          {/* Bouton d'ouverture en popover : l'affichage pleine page reste le mode
              normal, la fenêtre sert à se concentrer sur la question — notamment
              depuis l'écran prof, où la carte est noyée sous le catalogue. */}
          <div className="pedago-quiz__surface-switch">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPopoverOpen(true)}
            >
              ⤢ Ouvrir en fenêtre
            </button>
          </div>
          {renderQuizBody('page')}
        </article>
      )}

      {/* Même contenu, même état : le popover n'est qu'une seconde surface d'affichage.
          Le nom des boutons radio est distinct par surface, sinon les deux jeux de
          boutons se disputeraient le même groupe HTML. */}
      {popoverOpen && (showChoices || showAnswer) ? (
        <LearningQuizPopover
          open
          onClose={() => setPopoverOpen(false)}
          ariaLabel="Question du quiz"
        >
          {renderQuizBody('popover')}
        </LearningQuizPopover>
      ) : null}
    </div>
  );
}
