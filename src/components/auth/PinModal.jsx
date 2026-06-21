import { useId, useState } from 'react';
import {
  api,
  getAuthToken,
  getStoredSession,
  saveLegacyStudentSnapshot,
  saveStoredSession,
} from '../../services/api';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../utils/browserStorage.js';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { getRoleTerms } from '../../utils/n3-terminology';
import { DialogShell } from '../DialogShell';
import { startGoogleAuth } from './startGoogleAuth.js';

/**
 * Modale « Mode prof » : élévation par PIN, connexion e-mail + mot de passe,
 * réinitialisation de mot de passe et OAuth Google. Relocalisée telle quelle
 * depuis `auth-views.jsx` (O6) — flux de tokens et messages inchangés.
 */
function PinModal({ onSuccess, onClose, uiSettings, isN3Affiliated = false }) {
  useOverlayHistoryBack(true, onClose);
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
    const currentToken = getAuthToken();
    if (!currentToken) return setErr('Connecte-toi d’abord avant d’entrer ton code');
    setInfo('');
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/auth/elevate', 'POST', { pin: pin.trim() });
      if (!data || !data.token) {
        setErr('Réponse inattendue du serveur');
        setLoading(false);
        return;
      }
      const priorAuthToken = getAuthToken();
      // Conserver le JWT élève non élevé pour le retour « désactiver les droits » (évite de réutiliser le JWT élevé si authToken JSON absent).
      try {
        const raw = safeLocalStorageGetItem('foretmap_student', null);
        if (raw && priorAuthToken && priorAuthToken !== data.token) {
          const s = JSON.parse(raw);
          if (s && typeof s === 'object') {
            s.elevationStudentToken = priorAuthToken;
            saveLegacyStudentSnapshot(s);
          }
        }
      } catch (_) {
        /* ignore */
      }
      const currentUser = getStoredSession()?.user || null;
      const sessionUserType =
        data?.auth?.userType === 'teacher' || data?.auth?.userType === 'student'
          ? data.auth.userType
          : currentUser?.userType || 'student';
      /* `getAuthToken()` lit `foretmap_session` en priorité : mettre la session à jour avant les clés legacy,
         sinon une fin tardive de `validateStudentSession` peut lire un JWT encore non élevé et réécraser le bon jeton. */
      saveStoredSession({
        token: data.token,
        user: {
          id: data?.auth?.canonicalUserId || data?.auth?.userId || null,
          userType: sessionUserType,
          displayName: currentUser?.displayName || data?.auth?.roleDisplayName || 'Utilisateur',
          email: currentUser?.email || null,
          avatar_path: currentUser?.avatar_path || null,
        },
      });
      safeLocalStorageSetItem('foretmap_auth_token', data.token);
      safeLocalStorageSetItem('foretmap_teacher_token', data.token);
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
        setErr('Réponse inattendue du serveur');
        setLoading(false);
        return;
      }
      const perms = Array.isArray(data?.auth?.permissions) ? data.auth.permissions : [];
      if (!perms.includes('teacher.access')) {
        setErr(`Ce compte n’a pas les accès ${roleTerms.teacherSingular}.`);
        setLoading(false);
        return;
      }
      safeLocalStorageSetItem('foretmap_auth_token', data.authToken);
      safeLocalStorageSetItem('foretmap_teacher_token', data.authToken);
      saveStoredSession({
        token: data.authToken,
        user: {
          id: data?.auth?.canonicalUserId || data?.auth?.userId || null,
          userType: 'teacher',
          displayName: data?.auth?.roleDisplayName || email.trim(),
          email: data?.email || email.trim(),
          avatar_path: data?.avatar_path || null,
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
      const data = await api('/api/auth/teacher/forgot-password', 'POST', {
        email: forgotEmail.trim(),
      });
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
      setInfo(`Mot de passe ${roleTerms.teacherSingular} réinitialisé — tu peux te connecter.`);
      setResetToken('');
      setNewPassword('');
    } catch (e) {
      setErr(e.message || 'Réinitialisation impossible');
    }
    setLoading(false);
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="pin-overlay"
      dialogClassName="pin-card fade-in"
      ariaLabel={`Mode ${roleTerms.teacherSingular}`}
      closeOnOverlay
    >
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
      <h3>Mode {roleTerms.teacherSingular}</h3>
      <p>Utilise ton code ou un compte {roleTerms.teacherShort} (e-mail + mot de passe).</p>
      <div className="auth-tabs" style={{ marginBottom: 12 }}>
        <button
          className={`auth-tab ${authMode === 'pin' ? 'active' : ''}`}
          onClick={() => {
            setAuthMode('pin');
            setErr('');
            setInfo('');
          }}
        >
          PIN
        </button>
        <button
          className={`auth-tab ${authMode === 'email' ? 'active' : ''}`}
          onClick={() => {
            setAuthMode('email');
            setErr('');
            setInfo('');
          }}
        >
          Email
        </button>
      </div>
      {info && <div className="auth-success">{info}</div>}
      {err && <div className="pin-error">{err}</div>}
      {authMode === 'pin' ? (
        <>
          <input
            className="pin-input"
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && !loading && checkPin()}
            placeholder="••••"
            autoFocus
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
              onChange={(e) => {
                setEmail(e.target.value);
                setErr('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && !loading && loginByEmail()}
              placeholder={`${roleTerms.teacherShort}@exemple.com`}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor={fieldIds.password}>Mot de passe</label>
            <input
              id={fieldIds.password}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErr('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && !loading && loginByEmail()}
              placeholder="••••"
              autoComplete="current-password"
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
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder={`${roleTerms.teacherShort}@exemple.com`}
            />
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 6 }}
              onClick={requestReset}
              disabled={loading}
            >
              Envoyer un lien de réinitialisation
            </button>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={fieldIds.resetToken}>Réinitialiser avec token</label>
            <input
              id={fieldIds.resetToken}
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Token reçu par email"
            />
            <label htmlFor={fieldIds.newPassword} style={{ marginTop: 6 }}>
              Nouveau mot de passe
            </label>
            <input
              id={fieldIds.newPassword}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe"
              style={{ marginTop: 6 }}
            />
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 6 }}
              onClick={doReset}
              disabled={loading}
            >
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
      <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>
        Annuler
      </button>
    </DialogShell>
  );
}

export { PinModal };
