import { useId, useState } from 'react';
import { api, saveStoredSession } from '../../services/api';
import { safeLocalStorageSetItem } from '../../utils/browserStorage.js';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { getRoleTerms } from '../../utils/n3-terminology';
import { DialogShell } from '../DialogShell';
import { startGoogleAuth } from './startGoogleAuth.js';

/**
 * Modale « Connexion professeur » : connexion e-mail + mot de passe, réinitialisation de mot de
 * passe et OAuth Google. Un compte prof connecté possède directement les droits de son rôle
 * (l'élévation par PIN a été supprimée).
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
  const allowGoogleTeacher = uiSettings?.auth?.allow_google_teacher !== false;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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
      ariaLabel={`Connexion ${roleTerms.teacherSingular}`}
      closeOnOverlay
    >
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔑</div>
      <h3>Connexion {roleTerms.teacherSingular}</h3>
      <p>Connecte-toi avec ton compte {roleTerms.teacherShort} (e-mail + mot de passe).</p>
      {info && <div className="auth-success">{info}</div>}
      {err && <div className="pin-error">{err}</div>}
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
