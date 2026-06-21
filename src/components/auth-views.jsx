import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, saveLegacyStudentSnapshot, saveStoredSession, withAppBase } from '../services/api';
import { safeLocalStorageRemoveItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { getRoleTerms } from '../utils/n3-terminology';
import { getContentText } from '../utils/content';
import { buildAffiliationSelectOptions } from '../utils/affiliationSelectOptions';
import { getAuthSubmitError } from '../utils/authRegisterValidation.js';
import { PinModal } from './auth/PinModal.jsx';
import { startGoogleAuth } from './auth/startGoogleAuth.js';

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
  /** Évite de réappliquer `default_mode` serveur après un clic utilisateur (sinon re-render = élément détaché côté e2e). */
  const userChoseAuthTabRef = useRef(false);
  const allowRegister = uiSettings?.auth?.allow_register !== false;
  const allowGoogleStudent = uiSettings?.auth?.allow_google_student !== false;
  const allowGuestVisit = uiSettings?.auth?.allow_guest_visit !== false;
  const welcomeMessage = String(uiSettings?.auth?.welcome_message || '').trim();
  const authTitle = getContentText(uiSettings, 'auth.title', 'ForêtMap');
  const authSubtitle = getContentText(
    uiSettings,
    'auth.subtitle',
    'ForetMap — Le terrain d’apprentissage vivant du lycée',
  );
  const loginTabLabel = getContentText(uiSettings, 'auth.login_tab', 'Connexion');
  const registerTabLabel = getContentText(uiSettings, 'auth.register_tab', 'Créer un compte');
  const guestVisitLabel = getContentText(
    uiSettings,
    'auth.guest_visit_cta',
    '🧭 Visiter sans compte',
  );

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
    if (!allowRegister) {
      setMode('login');
      return;
    }
    if (userChoseAuthTabRef.current) return;
    const def = uiSettings?.auth?.default_mode === 'register' ? 'register' : 'login';
    setMode(def);
  }, [uiSettings?.auth?.default_mode, allowRegister]);

  const [affiliationMaps, setAffiliationMaps] = useState([]);
  useEffect(() => {
    if (!allowRegister) return;
    api('/api/maps')
      .then((d) => {
        if (Array.isArray(d)) setAffiliationMaps(d);
      })
      .catch(() => setAffiliationMaps([]));
  }, [allowRegister]);

  const affiliationOptions = useMemo(
    () => buildAffiliationSelectOptions(affiliationMaps),
    [affiliationMaps],
  );

  const submit = async () => {
    setInfo('');
    setErr('');
    const validationError = getAuthSubmitError({
      mode,
      identifier,
      pass,
      pass2,
      allowRegister,
      first,
      last,
      pseudo,
      email,
      description,
      affiliation,
      affiliationOptions,
    });
    if (validationError) return setErr(validationError);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
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
        safeLocalStorageSetItem('foretmap_auth_token', student.authToken);
      }
      const userType = String(
        student?.auth?.userType || student?.user_type || 'student',
      ).toLowerCase();
      const isTeacher = userType === 'teacher';
      if (!isTeacher) {
        saveLegacyStudentSnapshot(student);
      } else {
        safeLocalStorageRemoveItem('foretmap_student');
        if (student?.authToken)
          safeLocalStorageSetItem('foretmap_teacher_token', student.authToken);
      }
      saveStoredSession({
        token: student?.authToken || null,
        user: {
          id: student?.auth?.canonicalUserId || student?.id || null,
          userType,
          displayName:
            student?.display_name ||
            student?.pseudo ||
            `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
            (isTeacher ? roleTerms.teacherSingular : roleTerms.studentSingular),
          email: student?.email || null,
          avatar_path: student?.avatar_path || null,
        },
        student: isTeacher ? null : student,
      });
      onLogin(student);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const requestPasswordReset = async () => {
    if (!forgotEmail.trim()) return setErr('Email requis');
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const endpoint =
        forgotRole === 'teacher'
          ? '/api/auth/teacher/forgot-password'
          : '/api/auth/forgot-password';
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
      const endpoint =
        forgotRole === 'teacher' ? '/api/auth/teacher/reset-password' : '/api/auth/reset-password';
      await api(endpoint, 'POST', { token: resetToken.trim(), password: resetPass });
      setInfo('Mot de passe réinitialisé — tu peux te connecter.');
      setResetPass('');
    } catch (e) {
      setErr(e.message || 'Réinitialisation impossible');
    }
    setLoading(false);
  };

  const onKey = (e) => e.key === 'Enter' && submit();

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <img
          className="auth-brand-logo"
          src={withAppBase('/app-logo-n3.png')}
          alt=""
          width={72}
          height={72}
          decoding="async"
        />
        <h1>{authTitle}</h1>
        <p className="sub">{authSubtitle}</p>
        {welcomeMessage && (
          <p className="sub" style={{ marginTop: -4 }}>
            {welcomeMessage}
          </p>
        )}

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              userChoseAuthTabRef.current = true;
              setMode('login');
              setErr('');
              setInfo('');
            }}
          >
            {loginTabLabel}
          </button>
          {allowRegister && (
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                userChoseAuthTabRef.current = true;
                setMode('register');
                setErr('');
                setInfo('');
              }}
            >
              {registerTabLabel}
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
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="momo_lyautey ou moi@exemple.com"
              autoComplete="username"
              autoFocus
              onKeyDown={onKey}
            />
          </div>
        ) : (
          <div className="row">
            <div className="field">
              <label htmlFor={fieldIds.first}>Prénom</label>
              <input
                id={fieldIds.first}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="Mohamed"
                autoFocus
                onKeyDown={onKey}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldIds.last}>Nom</label>
              <input
                id={fieldIds.last}
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="El Farrai"
                onKeyDown={onKey}
              />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor={fieldIds.pass}>Mot de passe</label>
          <input
            id={fieldIds.pass}
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••"
            onKeyDown={onKey}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
        {mode === 'register' && allowRegister && (
          <>
            <div className="field">
              <label htmlFor={fieldIds.pseudo}>Pseudo (optionnel)</label>
              <input
                id={fieldIds.pseudo}
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="momo_lyautey"
                onKeyDown={onKey}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldIds.email}>Email (optionnel)</label>
              <input
                id={fieldIds.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="moi@exemple.com"
                onKeyDown={onKey}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldIds.description}>Description (optionnel)</label>
              <MarkdownTextarea
                id={fieldIds.description}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Je participe souvent à l'arrosage."
                onKeyDown={onKey}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldIds.affiliation}>Mon espace</label>
              <select
                id={fieldIds.affiliation}
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
              >
                <option value="" disabled>
                  -- Choisir --
                </option>
                {affiliationOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={fieldIds.pass2}>Confirmer le mot de passe</label>
              <input
                id={fieldIds.pass2}
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder="••••"
                onKeyDown={onKey}
              />
            </div>
          </>
        )}
        <button
          className="btn btn-primary btn-full"
          onClick={submit}
          disabled={loading}
          style={{ marginTop: 4 }}
        >
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
            onClick={() => {
              setShowForgot((v) => !v);
              setErr('');
              setInfo('');
            }}
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
              <input
                id={fieldIds.forgotEmail}
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="moi@exemple.com"
              />
              <button
                className="btn btn-ghost btn-full"
                style={{ marginTop: 6 }}
                onClick={requestPasswordReset}
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
              <label htmlFor={fieldIds.resetPass} style={{ marginTop: 6 }}>
                Nouveau mot de passe
              </label>
              <input
                id={fieldIds.resetPass}
                type="password"
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
                placeholder="Nouveau mot de passe"
                style={{ marginTop: 6 }}
              />
              <button
                className="btn btn-ghost btn-full"
                style={{ marginTop: 6 }}
                onClick={confirmResetPassword}
                disabled={loading}
              >
                Valider la réinitialisation
              </button>
            </div>
          </div>
        )}
        {onVisitGuest && allowGuestVisit && (
          <button
            className="btn btn-ghost btn-full"
            onClick={onVisitGuest}
            style={{ marginTop: 8 }}
          >
            {guestVisitLabel}
          </button>
        )}
        <p className="auth-home-credit">projet initialement produit Mohammed El Farrai</p>
        {appVersion != null && <p className="auth-version">Version {appVersion}</p>}
      </div>
    </div>
  );
}

export { PinModal, AuthScreen };
