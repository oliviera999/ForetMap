import React, { useEffect, useId, useMemo, useState } from 'react';
import { api, saveStoredSession, withAppBase } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';

function startGoogleAuth(mode) {
  const safeMode = mode === 'teacher' ? 'teacher' : 'student';
  window.location.assign(withAppBase(`/api/auth/google/start?mode=${encodeURIComponent(safeMode)}`));
}

function PinModal({ onSuccess, onClose, uiSettings, isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const fieldIdPrefix = useId();
  const fieldIds = {
    email: `${fieldIdPrefix}-teacher-email`,
    password: `${fieldIdPrefix}-teacher-password`,
    forgotEmail: `${fieldIdPrefix}-teacher-forgot-email`,
    resetToken: `${fieldIdPrefix}-teacher-reset-token`,
    newPassword: `${fieldIdPrefix}-teacher-new-password`,
  };
  const [authMode, setAuthMode] = useState('pin'); // pin | email
  const allowGoogleTeacher = uiSettings?.auth?.allow_google_teacher !== false;

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
      saveStoredSession({
        token: data.token,
        user: {
          id: data?.auth?.canonicalUserId || data?.auth?.userId || null,
          userType: 'teacher',
          displayName: data?.auth?.roleDisplayName || 'Utilisateur',
        },
      });
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
      const data = await api('/api/auth/login', 'POST', { identifier: email.trim(), password });
      if (!data || !data.authToken) {
        setErr('Réponse serveur invalide');
        setLoading(false);
        return;
      }
      const perms = Array.isArray(data?.auth?.permissions) ? data.auth.permissions : [];
      if (!perms.includes('teacher.access')) {
        setErr(`Ce compte ne possède pas les droits ${roleTerms.teacherSingular}.`);
        setLoading(false);
        return;
      }
      localStorage.setItem('foretmap_auth_token', data.authToken);
      localStorage.setItem('foretmap_teacher_token', data.authToken);
      saveStoredSession({
        token: data.authToken,
        user: {
          id: data?.auth?.canonicalUserId || data?.auth?.userId || null,
          userType: 'teacher',
          displayName: data?.auth?.roleDisplayName || email.trim(),
          email: email.trim(),
        },
      });
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
      setInfo(`Mot de passe ${roleTerms.teacherSingular} réinitialisé. Vous pouvez vous connecter.`);
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
        <h3>Mode {roleTerms.teacherSingular}</h3>
        <p>Utilisez le PIN ou un compte {roleTerms.teacherShort} email/mot de passe.</p>
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
              aria-label="Code PIN"
            />
            <button className="btn btn-primary btn-full" onClick={checkPin} disabled={loading}>
              {loading ? 'Vérification…' : 'Entrer'}
            </button>
          </>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor={fieldIds.email}>Email {roleTerms.teacherSingular}</label>
              <input
                id={fieldIds.email}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && loginByEmail()}
                placeholder={`${roleTerms.teacherShort}@exemple.com`}
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor={fieldIds.password}>Mot de passe</label>
              <input
                id={fieldIds.password}
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && loginByEmail()}
                placeholder="••••"
                autoComplete="new-password"
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={loginByEmail} disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor={fieldIds.forgotEmail}>Mot de passe oublié (email)</label>
              <input
                id={fieldIds.forgotEmail}
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder={`${roleTerms.teacherShort}@exemple.com`}
              />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={requestReset} disabled={loading}>
                Envoyer un lien de réinitialisation
              </button>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor={fieldIds.resetToken}>Réinitialiser avec token</label>
              <input
                id={fieldIds.resetToken}
                value={resetToken}
                onChange={e => setResetToken(e.target.value)}
                placeholder="Token reçu par email"
              />
              <label htmlFor={fieldIds.newPassword} style={{ marginTop: 6 }}>Nouveau mot de passe</label>
              <input
                id={fieldIds.newPassword}
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
        {allowGoogleTeacher && (
          <button
            className="btn btn-ghost btn-full"
            style={{ marginTop: 8 }}
            onClick={() => startGoogleAuth('teacher')}
            disabled={loading}
          >
            Continuer avec Google
          </button>
        )}
        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

function AuthScreen({ onLogin, appVersion, onVisitGuest, uiSettings, isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const fieldIdPrefix = useId();
  const fieldIds = {
    identifier: `${fieldIdPrefix}-identifier`,
    first: `${fieldIdPrefix}-first`,
    last: `${fieldIdPrefix}-last`,
    pass: `${fieldIdPrefix}-pass`,
    pseudo: `${fieldIdPrefix}-pseudo`,
    email: `${fieldIdPrefix}-email`,
    description: `${fieldIdPrefix}-description`,
    affiliation: `${fieldIdPrefix}-affiliation`,
    pass2: `${fieldIdPrefix}-pass2`,
    forgotEmail: `${fieldIdPrefix}-forgot-email`,
    resetToken: `${fieldIdPrefix}-reset-token`,
    resetPass: `${fieldIdPrefix}-reset-pass`,
  };
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [identifier, setIdentifier] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [affiliation, setAffiliation] = useState('');
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
  const allowRegister = uiSettings?.auth?.allow_register !== false;
  const allowGoogleStudent = uiSettings?.auth?.allow_google_student !== false;
  const allowGuestVisit = uiSettings?.auth?.allow_guest_visit !== false;
  const welcomeMessage = String(uiSettings?.auth?.welcome_message || '').trim();

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

  useEffect(() => {
    const def = uiSettings?.auth?.default_mode === 'register' ? 'register' : 'login';
    if (!allowRegister && def === 'register') {
      setMode('login');
      return;
    }
    setMode(def);
  }, [uiSettings?.auth?.default_mode, allowRegister]);

  const submit = async () => {
    setInfo('');
    setErr('');
    if (mode === 'login' && (!identifier.trim() || !pass)) return setErr('Identifiant et mot de passe requis');
    if (mode === 'register' && !allowRegister) return setErr('Inscriptions désactivées');
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
    if (mode === 'register' && !affiliation) {
      return setErr('Choisissez votre espace (N3, Forêt comestible ou les deux)');
    }
    if (mode === 'register' && !['n3', 'foret', 'both'].includes(affiliation)) {
      return setErr('Choix d’espace invalide');
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
        payload.affiliation = affiliation;
      }
      const student = await api(endpoint, 'POST', payload);
      if (student?.authToken) {
        localStorage.setItem('foretmap_auth_token', student.authToken);
      }
      const userType = String(student?.auth?.userType || student?.user_type || 'student').toLowerCase();
      const isTeacher = userType === 'teacher';
      if (!isTeacher) {
        localStorage.setItem('foretmap_student', JSON.stringify(student));
      } else {
        localStorage.removeItem('foretmap_student');
        if (student?.authToken) localStorage.setItem('foretmap_teacher_token', student.authToken);
      }
      saveStoredSession({
        token: student?.authToken || null,
        user: {
          id: student?.auth?.canonicalUserId || student?.id || null,
          userType,
          displayName: student?.display_name || student?.pseudo || `${student?.first_name || ''} ${student?.last_name || ''}`.trim() || (isTeacher ? roleTerms.teacherSingular : roleTerms.studentSingular),
          email: student?.email || null,
        },
        student: isTeacher ? null : student,
      });
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
        {welcomeMessage && <p className="sub" style={{ marginTop: -4 }}>{welcomeMessage}</p>}

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setErr(''); setInfo(''); }}>
            Connexion
          </button>
          {allowRegister && (
            <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setErr(''); setInfo(''); }}>
              Créer un compte
            </button>
          )}
        </div>

        {info && <div className="auth-success">{info}</div>}
        {err && <div className="auth-error">⚠️ {err}</div>}

        {mode === 'login' ? (
          <div className="field">
            <label htmlFor={fieldIds.identifier}>Identifiant (pseudo ou email)</label>
            <input
              id={fieldIds.identifier}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="momo_lyautey ou moi@exemple.com"
              autoComplete="off"
              autoFocus
              onKeyDown={onKey}
            />
          </div>
        ) : (
          <div className="row">
            <div className="field"><label htmlFor={fieldIds.first}>Prénom</label>
              <input id={fieldIds.first} value={first} onChange={e => setFirst(e.target.value)} placeholder="Mohamed" autoFocus onKeyDown={onKey} />
            </div>
            <div className="field"><label htmlFor={fieldIds.last}>Nom</label>
              <input id={fieldIds.last} value={last} onChange={e => setLast(e.target.value)} placeholder="El Farrai" onKeyDown={onKey} />
            </div>
          </div>
        )}
        <div className="field"><label htmlFor={fieldIds.pass}>Mot de passe</label>
          <input id={fieldIds.pass} type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••" onKeyDown={onKey} autoComplete="new-password" />
        </div>
        {mode === 'register' && allowRegister && (
          <>
            <div className="field"><label htmlFor={fieldIds.pseudo}>Pseudo (optionnel)</label>
              <input id={fieldIds.pseudo} value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="momo_lyautey" onKeyDown={onKey} />
            </div>
            <div className="field"><label htmlFor={fieldIds.email}>Email (optionnel)</label>
              <input id={fieldIds.email} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="moi@exemple.com" onKeyDown={onKey} />
            </div>
            <div className="field"><label htmlFor={fieldIds.description}>Description (optionnel)</label>
              <textarea
                id={fieldIds.description}
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Je participe souvent à l'arrosage."
                onKeyDown={onKey}
              />
            </div>
            <div className="field"><label htmlFor={fieldIds.affiliation}>Mon espace</label>
              <select id={fieldIds.affiliation} value={affiliation} onChange={e => setAffiliation(e.target.value)}>
                <option value="" disabled>-- Choisir --</option>
                <option value="both">N3 + Forêt comestible</option>
                <option value="n3">N3 uniquement</option>
                <option value="foret">Forêt comestible uniquement</option>
              </select>
            </div>
            <div className="field"><label htmlFor={fieldIds.pass2}>Confirmer le mot de passe</label>
              <input id={fieldIds.pass2} type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••" onKeyDown={onKey} />
            </div>
          </>
        )}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading} style={{ marginTop: 4 }}>
          {loading ? '...' : mode === 'login' ? 'Se connecter 🌱' : 'Créer le compte'}
        </button>
        {allowGoogleStudent && (
          <button
            className="btn btn-ghost btn-full"
            onClick={() => startGoogleAuth('student')}
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            Continuer avec Google
          </button>
        )}
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
                {roleTerms.studentSingular}
              </button>
              <button
                className={`auth-tab ${forgotRole === 'teacher' ? 'active' : ''}`}
                onClick={() => setForgotRole('teacher')}
              >
                {roleTerms.teacherSingular}
              </button>
            </div>
            <div className="field">
              <label htmlFor={fieldIds.forgotEmail}>Email</label>
              <input id={fieldIds.forgotEmail} type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="moi@exemple.com" />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={requestPasswordReset} disabled={loading}>
                Envoyer un lien de réinitialisation
              </button>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor={fieldIds.resetToken}>Réinitialiser avec token</label>
              <input id={fieldIds.resetToken} value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Token reçu par email" />
              <label htmlFor={fieldIds.resetPass} style={{ marginTop: 6 }}>Nouveau mot de passe</label>
              <input id={fieldIds.resetPass} type="password" value={resetPass} onChange={e => setResetPass(e.target.value)} placeholder="Nouveau mot de passe" style={{ marginTop: 6 }} />
              <button className="btn btn-ghost btn-full" style={{ marginTop: 6 }} onClick={confirmResetPassword} disabled={loading}>
                Valider la réinitialisation
              </button>
            </div>
          </div>
        )}
        {onVisitGuest && allowGuestVisit && (
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
