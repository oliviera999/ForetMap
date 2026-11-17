import { useEffect, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { resteDeDebat } from '../../../shared/glMainCore.js';

/**
 * Carte de question « Tenir à deux » (chasse ou lecture) : énoncé, choix, un bouton. Le
 * retour sert le texte du serveur tel quel (« Pas encore… ») — jamais « faux » ni « raté ».
 *
 * `delaiSecondes` (question de case, réglage `tenir_delai_debat_secondes`) : le bouton de
 * réponse ne s'allume qu'après ce délai, le temps que l'équipe se mette d'accord. Un conseil
 * tenu par l'écran : rien n'est retiré, rien n'attend au-delà.
 */
export function GLTenirQuestionCard({
  question,
  title = 'Question',
  submitLabel = 'Répondre',
  disabled = false,
  feedback = null,
  onAnswer,
  onClose = null,
  delaiSecondes = 0,
}) {
  const [choiceId, setChoiceId] = useState(null);
  const cle = question ? `${question.questionCode}:${question.presentationToken || ''}` : '';
  const [reste, setReste] = useState(() => resteDeDebat({ delaiSecondes, ecouleMs: 0 }));
  // Le délai repart à chaque question présentée ; un seul minuteur, arrêté dès qu'il est écoulé.
  useEffect(() => {
    if (!cle || !(Number(delaiSecondes) > 0)) {
      setReste(0);
      return undefined;
    }
    const debut = Date.now();
    setReste(resteDeDebat({ delaiSecondes, ecouleMs: 0 }));
    const timer = setInterval(() => {
      const r = resteDeDebat({ delaiSecondes, ecouleMs: Date.now() - debut });
      setReste(r);
      if (r <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [cle, delaiSecondes]);
  if (!question) return null;
  return (
    <section className="gl-tenir-question" data-testid="gl-tenir-question">
      <h4>{title}</h4>
      <p className="gl-tenir-question__enonce">{question.question}</p>
      <ul className="gl-tenir-question__choix">
        {(question.choices || []).map((c) => (
          <li key={c.id}>
            <label>
              <input
                type="radio"
                name={`q-${question.questionCode}`}
                value={c.id}
                checked={choiceId === c.id}
                disabled={disabled}
                onChange={() => setChoiceId(c.id)}
              />{' '}
              {c.text}
            </label>
          </li>
        ))}
      </ul>
      {feedback ? (
        <p className="gl-tenir-question__feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {reste > 0 ? (
        <p className="gl-hint gl-tenir-question__debat" role="status" data-testid="gl-tenir-debat">
          Mettez-vous d’accord : le bouton s’allume dans {reste} s.
        </p>
      ) : null}
      <div className="gl-tenir-question__actions">
        <GLButton
          type="button"
          disabled={disabled || choiceId == null || reste > 0}
          onClick={() => {
            if (choiceId == null) return;
            const id = choiceId;
            setChoiceId(null);
            onAnswer?.(id);
          }}
        >
          {submitLabel}
        </GLButton>
        {onClose ? (
          <GLButton type="button" variant="ghost" onClick={onClose}>
            Fermer
          </GLButton>
        ) : null}
      </div>
    </section>
  );
}
