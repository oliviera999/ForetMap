import { useMemo, useState } from 'react';
import { api } from '../../../services/api.js';
import { useCurriculumNotions } from '../../../hooks/useCurriculumNotions.js';
import { groupNotionsByNiveau } from '../../../utils/curriculumNotions.js';

/**
 * Lancer un quiz « par notion du programme » (migration 273).
 *
 * Le professeur qui prépare une séance part de la notion à traiter, pas de la catégorie du
 * catalogue : « Biodiversité, résultat et étape de l'évolution » se travaille dans trois
 * catégories différentes, et rien ne le disait. Le panneau liste le référentiel avec le
 * nombre de questions atteignables (héritage de catégorie compris) et tire une question
 * dans la notion choisie, que la section « Tester comme un élève » affiche aussitôt.
 */
export function FMQuizByNotionPanel({ onQuestionDrawn = null }) {
  const notions = useCurriculumNotions();
  const [pendingNotionId, setPendingNotionId] = useState('');
  const [error, setError] = useState('');

  const groups = useMemo(() => groupNotionsByNiveau(notions), [notions]);

  async function launch(notionId) {
    setPendingNotionId(notionId);
    setError('');
    try {
      const draw = await api(`/api/quiz/draw?notionId=${encodeURIComponent(notionId)}`);
      const code = draw?.question_code;
      if (!code) throw new Error('Aucune question disponible pour cette notion');
      onQuestionDrawn?.(code);
    } catch (err) {
      setError(err.message || 'Aucune question disponible pour cette notion');
    } finally {
      setPendingNotionId('');
    }
  }

  return (
    <section className="card pedago-qcm-admin fade-in">
      <h2 className="section-title">Lancer un quiz par notion du programme</h2>
      <p className="section-sub">
        Une question est tirée parmi celles de la notion choisie — les questions héritent des
        notions de leur catégorie. Le nombre entre parenthèses indique les questions atteignables.
      </p>

      {error ? <p className="section-sub pedago-qcm-admin__error">{error}</p> : null}

      {groups.length === 0 ? (
        <p className="section-sub">Aucune notion de programme n’est enregistrée.</p>
      ) : (
        groups.map((group) => (
          <div key={group.value} className="pedago-remediation" style={{ marginTop: 12 }}>
            <strong>{group.label}</strong>
            <div className="pedago-chip-row">
              {group.notions.map((notion) => {
                const count = Number(notion.question_count || 0);
                return (
                  <button
                    key={notion.id}
                    type="button"
                    className="pedago-chip-btn"
                    title={notion.theme || ''}
                    onClick={() => launch(notion.id)}
                    disabled={count === 0 || pendingNotionId === notion.id}
                  >
                    {pendingNotionId === notion.id ? 'Tirage…' : `${notion.notion} (${count})`}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
