import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLSurface } from './ui/GLSurface.jsx';

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
    <GLSurface as="form" className="gl-form gl-animate-in" variant="flat" onSubmit={submit}>
      <h3>{isAdmin ? 'Mot de passe staff' : 'Mot de passe joueur'}</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-profile-ok">{info}</p> : null}
      <GLField label="Mot de passe actuel">
        <GLInput
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </GLField>
      <GLField label="Nouveau mot de passe">
        <GLInput
          type="password"
          value={nextPassword}
          onChange={(event) => setNextPassword(event.target.value)}
          autoComplete="new-password"
        />
      </GLField>
      <GLButton type="submit" loading={busy}>{busy ? '...' : 'Mettre à jour'}</GLButton>
    </GLSurface>
  );
}
