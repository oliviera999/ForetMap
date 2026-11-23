import {
  choiceShare,
  formatDurationMs,
  formatIndex,
  formatPercent,
} from './fmQuizChoiceStatsModel.js';
import './fmQuizChoiceStats.css';

// Statistiques d'items d'une question du quiz ForetMap, dans l'écran d'édition du professeur
// (migration `quiz_attempt_choice`) : sous chaque choix, la part des réponses qui l'ont
// retenu ; un encart pour la version, la discrimination et le temps médian. Tout est porté
// par du texte : la barre est décorative (aria-hidden), la couleur ne dit rien seule.

/**
 * Barre du pourcentage de choix d'une lettre d'origine, avec badges.
 * @param {{ stat: object|null, letter: string }} props
 */
export function FMQuizChoiceBar({ stat, letter }) {
  if (!stat?.version) return null;
  const share = choiceShare(stat, letter);
  if (!share) return null;
  const known = Number(stat.version.choix_connus) || 0;
  if (known === 0) {
    return (
      <p className="fm-choice-stat fm-choice-stat--empty">
        Pas encore choisi : aucune réponse enregistrée pour cette version.
      </p>
    );
  }
  const attracts = Array.isArray(stat.attracteurs) && stat.attracteurs.includes(letter);
  const dead = Array.isArray(stat.distracteurs_morts) && stat.distracteurs_morts.includes(letter);
  const pct = Number(share.pourcentage) || 0;
  return (
    <div className="fm-choice-stat" data-letter={letter}>
      <div className="fm-choice-stat__track" aria-hidden="true">
        <span
          className={`fm-choice-stat__bar${share.correcte ? ' is-correct' : ''}${attracts ? ' is-attractor' : ''}`}
          style={{ '--fm-choice-pct': `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="fm-choice-stat__text">
        {share.correcte ? 'Bonne réponse — ' : ''}
        Choisi par {formatPercent(share.pourcentage)} des réponses ({share.effectif} sur {known})
      </p>
      {attracts || dead ? (
        <p className="fm-choice-stat__badges">
          {attracts ? (
            <span className="fm-choice-badge fm-choice-badge--attractor">
              ⚠ Attire plus que la bonne réponse
            </span>
          ) : null}
          {dead ? (
            <span className="fm-choice-badge fm-choice-badge--dead">Personne ne le choisit</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Encart de synthèse : version, discrimination, temps médian, seuils non atteints.
 * @param {{ stat: object|null, thresholds?: object }} props
 */
export function FMQuizItemStatsSummary({ stat, thresholds = {} }) {
  const minAnswers = thresholds.distracteur_mort_min_reponses ?? 20;
  if (!stat?.version) {
    return (
      <aside className="fm-item-stats" aria-label="Statistiques de la question">
        <p className="fm-item-stats__line">Aucune réponse enregistrée pour cette question.</p>
      </aside>
    );
  }
  const { version, discrimination = {}, temps_median_ms: times = {} } = stat;
  const previous = Number(version.tentatives_versions_anterieures) || 0;
  const unknown = Number(version.tentatives_sans_version) || 0;
  const median = formatDurationMs(times.global);
  const medianCorrect = formatDurationMs(times.bonnes_reponses);
  return (
    <aside className="fm-item-stats" aria-label="Statistiques de la question">
      <p className="fm-item-stats__line fm-item-stats__version">
        Statistiques de la version actuelle : {version.tentatives} réponse
        {version.tentatives > 1 ? 's' : ''} ({previous} sur les versions précédentes
        {unknown ? `, ${unknown} plus anciennes sans détail du choix` : ''}).
      </p>
      {!stat.distracteurs_morts_evalues ? (
        <p className="fm-item-stats__line fm-item-stats__pending">
          {`Les choix que personne ne prend sont repérés à partir de ${minAnswers} réponses (${version.choix_connus} pour l’instant).`}
        </p>
      ) : null}
      {discrimination.disponible ? (
        <p className="fm-item-stats__line">
          <strong>Discrimination : {formatIndex(discrimination.indice)}</strong>
          {discrimination.negative ? (
            <span className="fm-choice-badge fm-choice-badge--attractor">
              ⚠ Les élèves les plus à l’aise la ratent plus que les autres
            </span>
          ) : null}
        </p>
      ) : (
        <p className="fm-item-stats__line fm-item-stats__pending">
          Discrimination : pas encore calculable ({discrimination.repondants ?? 0} élèves sur{' '}
          {discrimination.seuil_repondants ?? 30} nécessaires).
        </p>
      )}
      <p className="fm-item-stats__help">
        La discrimination compare la réussite des élèves les plus à l’aise sur les autres questions
        à celle des moins à l’aise. Plus elle est haute, mieux la question distingue ceux qui ont
        compris ; négative, la question est souvent ambiguë ou sa bonne réponse est fausse.
      </p>
      <p className="fm-item-stats__line">
        Temps médian de réponse : {median || 'pas encore mesuré'}
        {median && medianCorrect ? ` (bonnes réponses : ${medianCorrect})` : ''}.
      </p>
    </aside>
  );
}
