import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

function startGoogleAuth(mode) {
  const safeMode = mode === 'teacher' ? 'teacher' : 'student';
  window.location.assign(`/api/auth/google/start?mode=${encodeURIComponent(safeMode)}`);
}

function PinModal({ onSuccess, onClose }) {
  const [authMode, setAuthMode] = useState('pin'); // pin | email
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const checkPin = async () => {
    if (!pin.trim()) return setErr('Code requis');
    const currentToken = localStorage.getItem('foretmap_auth_token') || localStorage.getItem('foretmap_teacher_token');
    if (!currentToken) return setErr('Connectez-vous d’abord avant d’entrer un PIN');
    setInfo('');
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/auth/elevate', 'POST', { pin: pin.trim() });
      if (!data || !data.token) {
        setErr('Réponse serveur invalide');
        setLoading(false);
        return;
      }
      localStorage.setItem('foretmap_auth_token', data.token);
      localStorage.setItem('foretmap_teacher_token', data.token);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Code incorrect');
      setPin('');
    }
    setLoading(false);
  };

  const loginByEmail = async () => {
    if (!email.trim() || !password) return setErr('Email et mot de passe requis');
    setInfo('');
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/auth/teacher/login', 'POST', { email: email.trim(), password });
      if (!data || !data.token) {
        setErr('Réponse serveur invalide');
        setLoading(false);
        return;
      }
      localStorage.setItem('foretmap_auth_token', data.token);
      localStorage.setItem('foretmap_teacher_token', data.token);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Connexion impossible');
    }
    setLoading(false);
  };

  const requestReset = async () => {
    if (!forgotEmail.trim()) return setErr('Email requis');
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api('/api/auth/teacher/forgot-password', 'POST', { email: forgotEmail.trim() });
      setInfo(data?.message || 'Si un compte existe, un email a été envoyé.');
    } catch (e) {
      setErr(e.message || 'Impossible d’envoyer l’email');
    }
    setLoading(false);
  };

  const doReset = async () => {
    if (!resetToken.trim() || !newPassword) return setErr('Token et nouveau mot de passe requis');
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      await api('/api/auth/teacher/reset-password', 'POST', {
        token: resetToken.trim(),
        password: newPassword,
      });
      setInfo('Mot de passe professeur réinitialisé. Vous pouvez vous connecter.');
      setResetToken('');
      setNewPassword('');
    } catch (e) {
      setErr(e.message || 'Réinitialisation impossible');
    }
    setLoading(false);
  };

  return (
    <div className="pin-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pin-card fade-in">
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
        <h3>Mode professeur</h3>
        <p>Utilisez le PIN ou un compte prof email/mot de passe.</p>
        <div className="auth-tabs" style={{ marginBottom: 12 }}>
          <button
            className={`auth-tab ${authMode === 'pin' ? 'active' : ''}`}
            onClick={() => { setAuthMode('pin'); setErr(''); setInfo(''); }}
          >
            PIN
          </button>
          <button
            className={`auth-tab ${authMode === 'email' ? 'active' : ''}`}
            onClick={() => { setAuthMode('email'); setErr(''); setInfo(''); }}
          >
            Email
          </button>
        </div>
        {info && <div className="auth-success">{info}</div>}
        {err && <div className="pin-error">{err}</div>}
        {authMode === 'pin' ? (
          <>
            <input
              className="pin-input" type="password" maxLength={4}
              value={pin} onChange={e => { setPin(e.target.value); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && !loading && checkPin()}
              placeholder="••••" autoFocus
            />
            <button className="btn btn-primary btn-full" onClick={checkPin} disabled={loading}>
              {loading ? 'Vérification…' : 'Entrer'}
            </button>
          </>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Email professeur</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && loginByEmail()}
                placeholder="prof@exemple.com"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && loginByEmail()}
                placeholder="••••"
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={loginByEmail} disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Mot de passe oublié (email)</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="prof@exemple.com"
              />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={requestReset} disabled={loading}>
                Envoyer un lien de réinitialisation
              </button>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Réinitialiser avec token</label>
              <input
                value={resetToken}
                onChange={e => setResetToken(e.target.value)}
                placeholder="Token reçu par email"
              />
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nouveau mot de passe"
                style={{ marginTop: 6 }}
              />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={doReset} disabled={loading}>
                Réinitialiser le mot de passe
              </button>
            </div>
          </>
        )}
        <button
          className="btn btn-ghost btn-full"
          style={{ marginTop: 8 }}
          onClick={() => startGoogleAuth('teacher')}
          disabled={loading}
        >
          Continuer avec Google (@pedagolyautey.org / @lyceelyautey.org)
        </button>
        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

function AuthScreen({ onLogin, appVersion, onVisitGuest }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [identifier, setIdentifier] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotRole, setForgotRole] = useState('student'); // student | teacher
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPass, setResetPass] = useState('');
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const resetTokenFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('resetToken') || '',
      type: params.get('resetType') || '',
    };
  }, []);

  useEffect(() => {
    if (resetTokenFromUrl.token) {
      setShowForgot(true);
      setResetToken(resetTokenFromUrl.token);
      if (resetTokenFromUrl.type === 'teacher') setForgotRole('teacher');
    }
  }, [resetTokenFromUrl]);

  const submit = async () => {
    setInfo('');
    setErr('');
    if (mode === 'login' && (!identifier.trim() || !pass)) return setErr('Identifiant et mot de passe requis');
    if (mode === 'register' && (!first.trim() || !last.trim() || !pass)) return setErr('Tous les champs sont requis');
    if (mode === 'register' && pass !== pass2) return setErr('Les mots de passe ne correspondent pas');
    if (mode === 'register' && pass.length < 4) return setErr('Mot de passe trop court (min 4 caractères)');
    if (mode === 'register' && pseudo.trim() && !/^[A-Za-z0-9_.-]{3,30}$/.test(pseudo.trim())) {
      return setErr('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    }
    if (mode === 'register' && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setErr('Email invalide');
    }
    if (mode === 'register' && description.trim().length > 300) {
      return setErr('Description trop longue (max 300 caractères)');
    }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login'
        ? { identifier: identifier.trim(), password: pass }
        : { firstName: first.trim(), lastName: last.trim(), password: pass };
      if (mode === 'register') {
        payload.pseudo = pseudo.trim() || null;
        payload.email = email.trim() || null;
        payload.description = description.trim() || null;
      }
      const student = await api(endpoint, 'POST', payload);
      if (student?.authToken) {
        localStorage.setItem('foretmap_auth_token', student.authToken);
      }
      localStorage.setItem('foretmap_student', JSON.stringify(student));
      onLogin(student);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const requestPasswordReset = async () => {
    if (!forgotEmail.trim()) return setErr('Email requis');
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const endpoint = forgotRole === 'teacher' ? '/api/auth/teacher/forgot-password' : '/api/auth/forgot-password';
      const data = await api(endpoint, 'POST', { email: forgotEmail.trim() });
      setInfo(data?.message || 'Si un compte existe, un email de réinitialisation a été envoyé.');
    } catch (e) {
      setErr(e.message || 'Impossible d’envoyer la demande');
    }
    setLoading(false);
  };

  const confirmResetPassword = async () => {
    if (!resetToken.trim() || !resetPass) return setErr('Token et nouveau mot de passe requis');
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const endpoint = forgotRole === 'teacher' ? '/api/auth/teacher/reset-password' : '/api/auth/reset-password';
      await api(endpoint, 'POST', { token: resetToken.trim(), password: resetPass });
      setInfo('Mot de passe réinitialisé. Vous pouvez vous connecter.');
      setResetPass('');
    } catch (e) {
      setErr(e.message || 'Réinitialisation impossible');
    }
    setLoading(false);
  };

  const onKey = e => e.key === 'Enter' && submit();

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🌿</div>
        <h1>ForêtMap</h1>
        <p className="sub">Atelier forêt comestible — Lycée Lyautey</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setErr(''); setInfo(''); }}>
            Connexion
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setErr(''); setInfo(''); }}>
            Créer un compte
          </button>
        </div>

        {info && <div className="auth-success">{info}</div>}
        {err && <div className="auth-error">⚠️ {err}</div>}

        {mode === 'login' ? (
          <div className="field">
            <label>Identifiant (pseudo ou email)</label>
            <input
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="momo_lyautey ou moi@exemple.com"
              autoFocus
              onKeyDown={onKey}
            />
          </div>
        ) : (
          <div className="row">
            <div className="field"><label>Prénom</label>
              <input value={first} onChange={e => setFirst(e.target.value)} placeholder="Mohamed" autoFocus onKeyDown={onKey} />
            </div>
            <div className="field"><label>Nom</label>
              <input value={last} onChange={e => setLast(e.target.value)} placeholder="El Farrai" onKeyDown={onKey} />
            </div>
          </div>
        )}
        <div className="field"><label>Mot de passe</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••" onKeyDown={onKey} />
        </div>
        {mode === 'register' && (
          <>
            <div className="field"><label>Pseudo (optionnel)</label>
              <input value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="momo_lyautey" onKeyDown={onKey} />
            </div>
            <div className="field"><label>Email (optionnel)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="moi@exemple.com" onKeyDown={onKey} />
            </div>
            <div className="field"><label>Description (optionnel)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Je participe souvent à l'arrosage."
                onKeyDown={onKey}
              />
            </div>
            <div className="field"><label>Confirmer le mot de passe</label>
              <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••" onKeyDown={onKey} />
            </div>
          </>
        )}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading} style={{ marginTop: 4 }}>
          {loading ? '...' : mode === 'login' ? 'Se connecter 🌱' : 'Créer le compte'}
        </button>
        <button
          className="btn btn-ghost btn-full"
          onClick={() => startGoogleAuth('student')}
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          Continuer avec Google (@pedagolyautey.org / @lyceelyautey.org)
        </button>
        {mode === 'login' && (
          <button
            className="btn btn-ghost btn-full"
            onClick={() => { setShowForgot(v => !v); setErr(''); setInfo(''); }}
            style={{ marginTop: 8 }}
          >
            {showForgot ? 'Masquer mot de passe oublié' : 'Mot de passe oublié'}
          </button>
        )}
        {showForgot && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="auth-tabs" style={{ marginBottom: 8 }}>
              <button
                className={`auth-tab ${forgotRole === 'student' ? 'active' : ''}`}
                onClick={() => setForgotRole('student')}
              >
                Élève
              </button>
              <button
                className={`auth-tab ${forgotRole === 'teacher' ? 'active' : ''}`}
                onClick={() => setForgotRole('teacher')}
              >
                Professeur
              </button>
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="moi@exemple.com" />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={requestPasswordReset} disabled={loading}>
                Envoyer un lien de réinitialisation
              </button>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Réinitialiser avec token</label>
              <input value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Token reçu par email" />
              <input type="password" value={resetPass} onChange={e => setResetPass(e.target.value)} placeholder="Nouveau mot de passe" style={{ marginTop: 6 }} />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={confirmResetPassword} disabled={loading}>
                Valider la réinitialisation
              </button>
            </div>
          </div>
        )}
        {onVisitGuest && (
          <button className="btn btn-ghost btn-full" onClick={onVisitGuest} style={{ marginTop: 8 }}>
            🧭 Visiter sans connexion
          </button>
        )}
        {appVersion != null && <p className="auth-version">Version {appVersion}</p>}
      </div>
    </div>
  );
}

export { PinModal, AuthScreen };
