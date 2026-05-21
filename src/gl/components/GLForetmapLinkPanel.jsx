import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';

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
      setInfo('Compte ForetMap lie.');
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
      setInfo('Liaison retiree.');
      onReload?.();
    } catch (err) {
      setError(err.message || 'Deliaison impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-panel gl-form">
      <h3>Liaison ForetMap</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-profile-ok">{info}</p> : null}
      {linked ? (
        <>
          <p className="gl-hint">Lie a : {linked.pseudo || linked.email || linked.id}</p>
          <form className="gl-form" onSubmit={unlinkAccount}>
            <label>
              Mot de passe GL actuel
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="gl-btn-danger" disabled={busy}>
              {busy ? '...' : 'Retirer la liaison'}
            </button>
          </form>
        </>
      ) : (
        <form className="gl-form" onSubmit={linkAccount}>
          <label>
            Identifiant ForetMap eleve (email ou pseudo)
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Mot de passe ForetMap eleve
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={busy}>{busy ? '...' : 'Lier mon compte ForetMap'}</button>
        </form>
      )}
    </section>
  );
}
