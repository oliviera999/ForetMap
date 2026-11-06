import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Carte de question « Tenir à deux » (chasse ou lecture) : énoncé, choix, un bouton. Le
 * retour sert le texte du serveur tel quel (« Pas encore… ») — jamais « faux » ni « raté ».
 */
export function GLTenirQuestionCard({
  question,
  title = 'Question',
  submitLabel = 'Répondre',
  disabled = false,
  feedback = null,
  onAnswer,
  onClose = null,
}) {
  const [choiceId, setChoiceId] = useState(null);
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
      <div className="gl-tenir-question__actions">
        <GLButton
          type="button"
          disabled={disabled || choiceId == null}
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
