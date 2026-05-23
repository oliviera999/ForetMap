import React, { useEffect, useId, useState } from 'react';

import { withAppBase } from '../../services/api.js';
import { apiGL } from '../services/apiGL.js';
import { GLBrandHub } from './GLBrandHub.jsx';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée).',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_claims_invalid: 'Connexion Google refusée (compte non vérifié).',
  oauth_email_not_allowed: 'Adresse Google non autorisée.',
  oauth_gl_staff_denied: 'Ce compte Google n’a pas accès Gnomes & Licornes.',
  oauth_gl_player_denied: 'Aucun compte joueur Gnomes & Licornes n’est associé à cette adresse Google.',
  oauth_gl_login_denied: 'Ce compte Google n’a pas accès Gnomes & Licornes.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google.',
};

function startGlGoogleAuth() {
  window.location.assign(withAppBase('/api/gl/auth/google/start'));
}

function readResetParamsFromHash() {
  const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hashRaw) return { token: '', type: '' };
  const params = new URLSearchParams(hashRaw);
  return {
    token: params.get('resetToken') || '',
    type: params.get('resetType') || '',
  };
}

export function GLAuthView({ onLogin, oauthNotice, config }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [platformTitle, setPlatformTitle] = useState('Gnomes & Licornes');
  const [platformSubtitle, setPlatformSubtitle] = useState('');
  const [platformLogoUrl, setPlatformLogoUrl] = useState('');
  const [brandSlots, setBrandSlots] = useState(null);
  const [allowGoogle, setAllowGoogle] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const fieldIdPrefix = useId();
  const fieldIds = {
    identifier: `${fieldIdPrefix}-identifier`,
    password: `${fieldIdPrefix}-password`,
    forgotEmail: `${fieldIdPrefix}-forgot-email`,
    resetToken: `${fieldIdPrefix}-reset-token`,
    resetPassword: `${fieldIdPrefix}-reset-password`,
  };

  useEffect(() => {
    apiGL('/api/gl/auth/config')
      .then((data) => {
        if (data?.title) setPlatformTitle(String(data.title));
        if (data?.subtitle) setPlatformSubtitle(String(data.subtitle));
        if (data?.brand?.logoUrl) setPlatformLogoUrl(String(data.brand.logoUrl));
        if (data?.brand?.slots) setBrandSlots(data.brand.slots);
        const googleReady = !!(data?.allowGoogleStaff || data?.allowGooglePlayer);
        setAllowGoogle(googleReady);
      })
      .catch(() => {
        setAllowGoogle(false);
      });
  }, []);

  useEffect(() => {
    if (!config || typeof config !== 'object') return;
    if (config.title) setPlatformTitle(String(config.title));
    if (config.subtitle) setPlatformSubtitle(String(config.subtitle));
    if (config?.brand?.logoUrl) setPlatformLogoUrl(String(config.brand.logoUrl));
    if (config?.brand?.slots) setBrandSlots(config.brand.slots);
  }, [config]);

  useEffect(() => {
    if (oauthNotice?.error) {
      setError(OAUTH_ERROR_MESSAGES[oauthNotice.error] || 'Connexion Google refusée.');
    }
    if (oauthNotice?.success) {
      setInfo('Connexion Google réussie.');
      setError('');
    }
  }, [oauthNotice]);

  useEffect(() => {
    const { token } = readResetParamsFromHash();
    if (!token) return;
    setShowForgot(true);
    setResetToken(token);
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/auth/login', 'POST', {
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

  async function requestPasswordReset() {
    const email = forgotEmail.trim();
    if (!email) {
      setError('Email requis');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/auth/forgot-password', 'POST', { email });
      setInfo(data?.message || 'Si un compte existe, un email de réinitialisation a été envoyé.');
    } catch (err) {
      setError(err.message || 'Impossible d’envoyer l’email');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPasswordReset() {
    if (!resetToken.trim() || !resetPassword) {
      setError('Token et nouveau mot de passe requis');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/auth/reset-password', 'POST', {
        token: resetToken.trim(),
        password: resetPassword,
      });
      setInfo('Mot de passe réinitialisé — tu peux te connecter.');
      setResetPassword('');
      setShowForgot(false);
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (e) => e.key === 'Enter' && login(e);

  return (
    <main className="gl-auth auth-wrap">
      <GLBrandHub slots={brandSlots || config?.brand?.slots} />

      <div className="auth-card fade-in gl-card">
        {platformLogoUrl ? (
          <div className="gl-auth-logo-wrap">
            <img src={platformLogoUrl} alt="Logo plateforme" className="gl-auth-logo" />
          </div>
        ) : null}

        <h1>{platformTitle}</h1>
        {platformSubtitle ? <p className="sub">{platformSubtitle}</p> : null}
        <p className="sub">
          Connecte-toi avec ton pseudo ou ton identifiant. Ton profil (joueur, MJ ou admin) est déterminé après connexion.
        </p>

        {info ? <div className="auth-success">{info}</div> : null}
        {error ? <p className="gl-error auth-error">⚠️ {error}</p> : null}

        <form onSubmit={login} className="gl-form">
          <label htmlFor={fieldIds.identifier}>
            Identifiant (pseudo ou e-mail)
            <input
              id={fieldIds.identifier}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              onKeyDown={onKeyDown}
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
              onKeyDown={onKeyDown}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
            {busy ? '…' : 'Se connecter'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-full"
            style={{ marginTop: 8 }}
            onClick={() => {
              setShowForgot((v) => !v);
              setError('');
              setInfo('');
            }}
            disabled={busy}
          >
            {showForgot ? 'Masquer mot de passe oublié' : 'Mot de passe oublié ?'}
          </button>
          {allowGoogle ? (
            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={() => startGlGoogleAuth()}
              disabled={busy}
            >
              Continuer avec Google
            </button>
          ) : null}
        </form>

        {showForgot ? (
          <div className="gl-forgot-panel" style={{ marginTop: 12, borderTop: '1px solid var(--line, #ddd)', paddingTop: 12 }}>
            <p className="sub" style={{ marginTop: 0 }}>
              Saisis l’adresse e-mail de ton compte joueur ou MJ/Admin. Si elle est reconnue, un lien de réinitialisation t’est envoyé.
            </p>
            <label htmlFor={fieldIds.forgotEmail}>
              E-mail
              <input
                id={fieldIds.forgotEmail}
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                autoComplete="email"
                placeholder="moi@exemple.com"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={requestPasswordReset}
              disabled={busy}
            >
              Envoyer un lien de réinitialisation
            </button>
            <label htmlFor={fieldIds.resetToken} style={{ marginTop: 12, display: 'block' }}>
              Code reçu par e-mail (si le lien ne s’ouvre pas)
              <input
                id={fieldIds.resetToken}
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                placeholder="Coller le token du mail"
                autoComplete="off"
              />
            </label>
            <label htmlFor={fieldIds.resetPassword}>
              Nouveau mot de passe
              <input
                id={fieldIds.resetPassword}
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={confirmPasswordReset}
              disabled={busy}
            >
              Valider la réinitialisation
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
