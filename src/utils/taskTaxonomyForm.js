/**
 * État dérivé des champs métier / format / phase du formulaire de tâche (migration 329).
 *
 * - **Création** : métier et format sont pré-remplis par la suggestion automatique
 *   (`taskCategoryGuessCore`) tant que le prof n'a pas touché au champ (mention « suggéré ») ;
 *   ils sont obligatoires pour une tâche créée par la gestion (pas pour une proposition).
 * - **Modification** d'une tâche ancienne sans métier : la suggestion s'affiche à côté du
 *   champ, sans être appliquée ni bloquer l'enregistrement (l'enregistrement automatique ne
 *   doit pas écrire une valeur que personne n'a choisie).
 * - **Récurrence** : format verrouillé sur Routine.
 * - **Garde-fou** : une Séance à 6 élèves ou plus, ou à description très longue, déclenche
 *   une suggestion non bloquante de découpage en projet.
 *
 * Fonctions pures, sans React.
 */
import { guessTaskTaxonomy } from '../shared/taskCategoryGuessCore.js';
import { RECURRING_TASK_FORMAT, taskLooksLikeProject } from '../shared/taskTaxonomyCore.js';

/**
 * @param {{ form: object, isNew: boolean, isProposal?: boolean,
 *           touched?: { category?: boolean, format?: boolean } }} input
 */
export function resolveTaskTaxonomyFormState({ form, isNew, isProposal = false, touched = {} }) {
  const guess = guessTaskTaxonomy({
    title: form?.title,
    description: form?.description,
    required_students: form?.required_students,
    recurrence: form?.recurrence || null,
    project_id: form?.project_id || null,
  });
  const formatLocked = Boolean(form?.recurrence);
  // Pré-remplissage à la création (proposition comprise) ; jamais en modification.
  const prefill = isNew;

  const chosenCategory = form?.category || '';
  const categorySuggested = !chosenCategory && prefill && !touched.category && !!guess.category;
  const category = chosenCategory || (categorySuggested ? guess.category : '');

  const chosenFormat = form?.format || '';
  let format;
  let formatSuggested = false;
  if (formatLocked) {
    format = RECURRING_TASK_FORMAT;
  } else if (chosenFormat) {
    format = chosenFormat;
  } else if (prefill && !touched.format && guess.format) {
    format = guess.format;
    formatSuggested = true;
  } else {
    format = '';
  }

  const requireFields = isNew && !isProposal;
  const missing = [];
  if (requireFields && !category) missing.push('métier');
  if (requireFields && !format) missing.push('format');

  return {
    category,
    format,
    categorySuggested,
    formatSuggested,
    formatLocked,
    /** Suggestion affichée sans être appliquée (modification d'une tâche sans métier). */
    hintCategory: !isNew && !chosenCategory && guess.category ? guess.category : '',
    hintFormat: !isNew && !chosenFormat && !formatLocked && guess.format ? guess.format : '',
    phaseVisible: Boolean(form?.project_id),
    missing,
    missingError: missing.length ? `Choisissez un ${missing.join(' et un ')} pour la tâche` : '',
    looksLikeProject: taskLooksLikeProject({
      format,
      required_students: form?.required_students,
      description: form?.description,
    }),
  };
}
