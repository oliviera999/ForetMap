import React, { useEffect, useId, useState } from 'react';
import { withAppBase } from '../../services/api.js';
import { apiGL } from '../services/apiGL.js';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée).',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_claims_invalid: 'Connexion Google refusée (compte non vérifié).',
  oauth_email_not_allowed: 'Adresse Google non autorisée.',
  oauth_gl_staff_denied: 'Ce compte Google n’a pas accès MJ / Admin Gnomes & Licornes.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google.',
};

function startGlGoogleAuth() {
  window.location.assign(withAppBase('/api/gl/auth/google/start'));
}

export function GLAuthView({ onLogin, oauthNotice }) {
  const [authTab, setAuthTab] = useState('player'); // player | staff
  const [pseudo, setPseudo] = useState('');
  const [pin, setPin] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [platformTitle, setPlatformTitle] = useState('Gnomes & Licornes');
  const [platformSubtitle, setPlatformSubtitle] = useState('');
  const [allowGoogleStaff, setAllowGoogleStaff] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldIdPrefix = useId();
  const fieldIds = {
    pseudo: `${fieldIdPrefix}-pseudo`,
    pin: `${fieldIdPrefix}-pin`,
    identifier: `${fieldIdPrefix}-identifier`,
    password: `${fieldIdPrefix}-password`,
  };

  useEffect(() => {
    apiGL('/api/gl/auth/config')
      .then((data) => {
        if (data?.title) setPlatformTitle(String(data.title));
        if (data?.subtitle) setPlatformSubtitle(String(data.subtitle));
        setAllowGoogleStaff(data?.allowGoogleStaff !== false && !!data?.allowGoogleStaff);
      })
      .catch(() => {
        setAllowGoogleStaff(false);
      });
  }, []);

  useEffect(() => {
    if (oauthNotice?.error) {
      setError(OAUTH_ERROR_MESSAGES[oauthNotice.error] || 'Connexion Google refusée.');
      setAuthTab('staff');
    }
    if (oauthNotice?.success) {
      setInfo('Connexion Google réussie.');
      setError('');
    }
  }, [oauthNotice]);

  async function loginPlayer(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/auth/login', 'POST', { pseudo, pin });
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  }

  async function loginStaff(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/auth/staff/login', 'POST', {
        identifier: identifier.trim(),
        password,
      });
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  }

  const onKeyPlayer = (e) => e.key === 'Enter' && loginPlayer(e);
  const onKeyStaff = (e) => e.key === 'Enter' && loginStaff(e);

  return (
    <main className="gl-auth auth-wrap">
      <div className="auth-card fade-in gl-card">
        <h1>{platformTitle}</h1>
        {platformSubtitle ? <p className="sub">{platformSubtitle}</p> : null}
        <p className="sub">Choisis ton mode de connexion.</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${authTab === 'player' ? ' active' : ''}`}
            onClick={() => { setAuthTab('player'); setError(''); setInfo(''); }}
          >
            Joueur
          </button>
          <button
            type="button"
            className={`auth-tab${authTab === 'staff' ? ' active' : ''}`}
            onClick={() => { setAuthTab('staff'); setError(''); setInfo(''); }}
          >
            MJ / Admin
          </button>
        </div>

        {info ? <div className="auth-success">{info}</div> : null}
        {error ? <p className="gl-error auth-error">⚠️ {error}</p> : null}

        {authTab === 'player' ? (
          <form onSubmit={loginPlayer} className="gl-form">
            <p className="gl-hint">Équipe en jeu : pseudo et PIN fournis par le maître du jeu.</p>
            <label htmlFor={fieldIds.pseudo}>
              Pseudo
              <input
                id={fieldIds.pseudo}
                value={pseudo}
                onChange={(event) => setPseudo(event.target.value)}
                autoComplete="username"
                onKeyDown={onKeyPlayer}
              />
            </label>
            <label htmlFor={fieldIds.pin}>
              PIN
              <input
                id={fieldIds.pin}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                autoComplete="current-password"
                type="password"
                onKeyDown={onKeyPlayer}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
              {busy ? '…' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form onSubmit={loginStaff} className="gl-form">
            <p className="gl-hint">
              Compte ForetMap (enseignant / administrateur) : même identifiant et mot de passe que sur ForetMap.
              Les administrateurs ForetMap obtiennent automatiquement l’accès admin G&amp;L.
            </p>
            <label htmlFor={fieldIds.identifier}>
              Identifiant (email ou pseudo)
              <input
                id={fieldIds.identifier}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                onKeyDown={onKeyStaff}
              />
            </label>
            <label htmlFor={fieldIds.password}>
              Mot de passe
              <input
                id={fieldIds.password}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                onKeyDown={onKeyStaff}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
              {busy ? '…' : 'Se connecter'}
            </button>
            {allowGoogleStaff ? (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 8 }}
                onClick={startGlGoogleAuth}
                disabled={busy}
              >
                Continuer avec Google
              </button>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
