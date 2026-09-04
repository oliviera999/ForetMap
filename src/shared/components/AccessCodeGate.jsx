import { useId, useState } from 'react';

import { Button } from '../ui/Button.jsx';

/**
 * Écran de saisie du **code d'accès** (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.7).
 *
 * Un produit public dont l'établissement veut restreindre la diffusion — le Plan Lyautey, la
 * visite invitée — demande un code une seule fois par appareil, puis pose un laissez-passer.
 * Ce composant ne connaît ni le produit ni l'API : il reçoit une fonction de validation qui
 * lève en cas de refus.
 *
 * @param {object} props
 * @param {string} props.title titre de l'écran.
 * @param {string} [props.intro] phrase d'explication.
 * @param {(code: string) => Promise<void>} props.onSubmit lève si le code est refusé.
 * @param {string} [props.label] libellé du champ.
 * @param {string} [props.className]
 */
export function AccessCodeGate({
  title,
  intro = '',
  onSubmit,
  label = 'Code d’accès',
  className = 'fm-access-gate',
}) {
  const inputId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) {
      setError('Saisissez le code fourni par l’établissement.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err?.status === 401 ? 'Code incorrect.' : 'Vérification impossible pour le moment.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={className} onSubmit={submit}>
      <h1 className={`${className}__title`}>{title}</h1>
      {intro ? <p className={`${className}__intro`}>{intro}</p> : null}
      <label className={`${className}__label`} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={`${className}__input`}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-invalid={error ? 'true' : undefined}
      />
      {error ? (
        <p id={`${inputId}-error`} className={`${className}__error`} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" block loading={pending}>
        Entrer
      </Button>
    </form>
  );
}
