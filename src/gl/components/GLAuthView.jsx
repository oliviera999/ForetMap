import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLAuthView({ onLogin }) {
  const [pseudo, setPseudo] = useState('');
  const [pin, setPin] = useState('');
  const [googleToken, setGoogleToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loginPlayer(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiGL('/api/gl/auth/login', 'POST', { pseudo, pin });
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  }

  async function loginGoogle(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiGL('/api/gl/auth/google', 'POST', { idToken: googleToken });
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Connexion Google impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gl-auth">
      <section className="gl-card">
        <h1>Entrer dans le jeu</h1>
        <p>Connexion joueur par equipe (pseudo + PIN).</p>
        <form onSubmit={loginPlayer} className="gl-form">
          <label>
            Pseudo
            <input value={pseudo} onChange={(event) => setPseudo(event.target.value)} autoComplete="username" />
          </label>
          <label>
            PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              autoComplete="current-password"
              type="password"
            />
          </label>
          <button type="submit" disabled={busy}>Connexion joueur</button>
        </form>
      </section>
      <section className="gl-card">
        <h2>Connexion MJ / Admin (Google)</h2>
        <p>Collez ici un ID Token Google pour la phase initiale.</p>
        <form onSubmit={loginGoogle} className="gl-form">
          <label>
            idToken Google
            <textarea value={googleToken} onChange={(event) => setGoogleToken(event.target.value)} rows={4} />
          </label>
          <button type="submit" disabled={busy}>Connexion Google</button>
        </form>
      </section>
      {error ? <p className="gl-error">{error}</p> : null}
    </main>
  );
}
