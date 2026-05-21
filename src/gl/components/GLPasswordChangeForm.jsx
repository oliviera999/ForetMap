import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLPasswordChangeForm({ isAdmin, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const endpoint = isAdmin ? '/api/gl/auth/staff/change-password' : '/api/gl/auth/change-password';
      await apiGL(endpoint, 'POST', { currentPassword, newPassword: nextPassword });
      setCurrentPassword('');
      setNextPassword('');
      setInfo('Mot de passe mis a jour.');
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Modification impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="gl-form gl-panel" onSubmit={submit}>
      <h3>{isAdmin ? 'Mot de passe staff' : 'PIN / mot de passe joueur'}</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-profile-ok">{info}</p> : null}
      <label>
        Mot de passe actuel
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={nextPassword}
          onChange={(event) => setNextPassword(event.target.value)}
          autoComplete="new-password"
        />
      </label>
      <button type="submit" disabled={busy}>{busy ? '...' : 'Mettre a jour'}</button>
    </form>
  );
}
