import { useId, useState } from 'react';

import { Button } from '../ui/Button.jsx';

/**
 * Formulations de l'écran selon la nature du secret demandé (`access_kind` renvoyé par le
 * serveur, `lib/accessSecret.js`).
 */
const GATE_WORDING = Object.freeze({
  code: Object.freeze({
    label: 'Code d’accès',
    empty: 'Saisissez le code fourni par l’établissement.',
    refused: 'Code incorrect.',
  }),
  password: Object.freeze({
    label: 'Mot de passe',
    empty: 'Saisissez le mot de passe fourni par l’établissement.',
    refused: 'Mot de passe incorrect.',
  }),
});

/**
 * Écran de saisie du **code d'accès** ou du **mot de passe** (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.7).
 *
 * Un produit public dont l'établissement veut restreindre la diffusion — le Plan Lyautey, le
 * plan e-nov, la voie secondaire du plan des personnels — demande un secret une seule fois par
 * appareil, puis pose un laissez-passer. Ce composant ne connaît ni le produit ni l'API : il
 * reçoit une fonction de validation qui lève en cas de refus.
 *
 * Deux natures de secret (`kind`) :
 *  - `code` : champ en clair, comme avant (un code se recopie d'une affiche) ;
 *  - `password` : un **vrai champ de mot de passe** — masqué, avec un bouton « Afficher »,
 *    sans majuscules forcées ni correction automatique (la casse compte), et reconnu par le
 *    gestionnaire de mots de passe du navigateur (`autocomplete="current-password"`, plus un
 *    identifiant caché qui nomme le plan, sans quoi le navigateur ne sait pas sous quel nom
 *    l'enregistrer).
 *
 * @param {object} props
 * @param {string} props.title titre de l'écran.
 * @param {string} [props.intro] phrase d'explication.
 * @param {(code: string) => Promise<void>} props.onSubmit lève si le secret est refusé.
 * @param {'code'|'password'} [props.kind='code'] nature du secret demandé.
 * @param {string} [props.label] libellé du champ (défaut selon `kind`).
 * @param {string} [props.className]
 */
export function AccessCodeGate({
  title,
  intro = '',
  onSubmit,
  kind = 'code',
  label = '',
  className = 'fm-access-gate',
}) {
  const inputId = useId();
  const isPassword = kind === 'password';
  const wording = isPassword ? GATE_WORDING.password : GATE_WORDING.code;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) {
      setError(wording.empty);
      return;
    }
    setPending(true);
    setError('');
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err?.status === 401 ? wording.refused : 'Vérification impossible pour le moment.');
    } finally {
      setPending(false);
    }
  };

  const inputProps = isPassword
    ? {
        type: revealed ? 'text' : 'password',
        name: 'password',
        autoComplete: 'current-password',
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
      }
    : {
        type: 'text',
        inputMode: 'text',
        autoComplete: 'off',
        autoCapitalize: 'characters',
      };

  const input = (
    <input
      id={inputId}
      className={`${className}__input`}
      {...inputProps}
      value={code}
      onChange={(event) => setCode(event.target.value)}
      aria-describedby={error ? `${inputId}-error` : undefined}
      aria-invalid={error ? 'true' : undefined}
    />
  );

  return (
    <form className={className} onSubmit={submit}>
      <h1 className={`${className}__title`}>{title}</h1>
      {intro ? <p className={`${className}__intro`}>{intro}</p> : null}
      {isPassword ? (
        // Identifiant du « compte » pour le gestionnaire de mots de passe : le nom du plan.
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={title}
          readOnly
          hidden
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}
      <label className={`${className}__label`} htmlFor={inputId}>
        {label || wording.label}
      </label>
      {isPassword ? (
        <div className="fm-access-gate-secret">
          {input}
          <Button
            variant="secondary"
            aria-controls={inputId}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
      ) : (
        input
      )}
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
