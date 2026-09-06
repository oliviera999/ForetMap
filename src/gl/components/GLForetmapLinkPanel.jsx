import { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLSurface } from './ui/GLSurface.jsx';

export function GLForetmapLinkPanel({ enabled, profile, onReload }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const linked = profile?.linkedForetmapStudent || null;

  if (!enabled) return null;

  async function linkAccount(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/auth/link-foretmap', 'POST', { identifier, password });
      setIdentifier('');
      setPassword('');
      setInfo('Compte ForetMap rattaché : ton mot de passe est désormais celui de ce compte.');
      onReload?.();
    } catch (err) {
      setError(err.message || 'Liaison impossible');
    } finally {
      setBusy(false);
    }
  }

  async function unlinkAccount(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/auth/link-foretmap', 'DELETE', { currentPassword });
      setCurrentPassword('');
      setInfo('Compte élève détaché : tu gardes ton mot de passe actuel pour le jeu.');
      onReload?.();
    } catch (err) {
      setError(err.message || 'Deliaison impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GLSurface className="gl-form fade-in">
      <h3>Liaison ForetMap</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-profile-ok">{info}</p> : null}
      <p className="gl-hint">
        Ton compte de jeu et ton compte ForetMap ne font qu’un : un seul mot de passe pour les deux.
        Si tu as déjà un compte élève ForetMap, rattache-le ici — c’est son mot de passe qui vaudra
        ensuite partout.
      </p>
      {linked ? (
        <>
          <p className="gl-hint">
            Compte élève ForetMap : {linked.pseudo || linked.email || linked.id}
          </p>
          <form className="gl-form" onSubmit={unlinkAccount}>
            <GLField label="Mot de passe actuel">
              <GLInput
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </GLField>
            <GLButton type="submit" variant="danger" disabled={busy}>
              {busy ? '...' : 'Détacher mon compte élève'}
            </GLButton>
          </form>
        </>
      ) : (
        <form className="gl-form" onSubmit={linkAccount}>
          <GLField label="Identifiant ForetMap élève (e-mail ou pseudo)">
            <GLInput
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
            />
          </GLField>
          <GLField label="Mot de passe ForetMap élève">
            <GLInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </GLField>
          <GLButton type="submit" disabled={busy}>
            {busy ? '...' : 'Rattacher mon compte élève ForetMap'}
          </GLButton>
        </form>
      )}
    </GLSurface>
  );
}
