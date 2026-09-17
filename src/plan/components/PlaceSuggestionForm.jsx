import { useId, useState } from 'react';

import { Button } from '../../shared/ui/Button.jsx';

/** Bornes du corps d'un commentaire de contexte, côté serveur (`routes/context-comments.js`). */
const MIN_LENGTH = 2;
const MAX_LENGTH = 2000;

/**
 * « Signaler ou proposer » sur la fiche d'un lieu du plan des personnels.
 *
 * Le message part dans les **commentaires de contexte** du lieu (`context_comments`), pas dans
 * une boîte de réception : un administrateur le retrouve attaché au repère concerné, avec la
 * modération, l'historique et le signalement déjà en place. Replié par défaut — la fiche sert
 * d'abord à se repérer.
 *
 * @param {object} props
 * @param {(body: string) => Promise<void>} props.onSubmit lève si l'envoi échoue.
 */
export function PlaceSuggestionForm({ onSubmit }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="plan-place__suggest-done" role="status">
        Message envoyé. Merci — il est attaché à ce lieu.
      </p>
    );
  }

  if (!open) {
    return (
      <p className="plan-place__suggest">
        <button type="button" className="plan-place__suggest-open" onClick={() => setOpen(true)}>
          Signaler un problème ou proposer une correction
        </button>
      </p>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (text.length < MIN_LENGTH) {
      setError('Décrivez en quelques mots ce qui ne va pas.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await onSubmit(text);
      setSent(true);
    } catch (err) {
      setError(err?.message || 'L’envoi n’a pas abouti. Réessayez.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="plan-place__suggest-form" onSubmit={submit}>
      <label htmlFor={fieldId} className="plan-place__suggest-label">
        Signaler ou proposer
      </label>
      <textarea
        id={fieldId}
        className="plan-place__suggest-field"
        value={body}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder="Ex. : la porte est condamnée depuis la rentrée."
        onChange={(event) => setBody(event.target.value)}
        disabled={pending}
      />
      {error ? (
        <p className="plan-place__suggest-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="plan-place__suggest-actions">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer'}
        </Button>
      </div>
    </form>
  );
}
