import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, saveStoredSession, withAppBase } from '../services/api';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { getRoleTerms } from '../utils/n3-terminology';
import { getContentText } from '../utils/content';
import { getAppCredits } from '../utils/appCredits.js';
import { PinModal } from './auth/PinModal.jsx';
import { TotpChallenge, TotpSetupSuggestion } from './auth/TotpChallenge.jsx';
import { startGoogleAuth } from './auth/startGoogleAuth.js';
import { IconWarning } from '../shared/icons.jsx';
import { PrivacyNoticeLink } from '../shared/privacy/PrivacyNoticeLink.jsx';
import { getBuildBrand } from '../shared/brand/brandNames.js';
import { DEFAULT_AUTH_SUBTITLE, stripLeadingAppName } from '../utils/authSubtitle.js';

/**
 * Avis « une séance t'attend » (lien `?seance=`) : rare, chargé à la demande pour tenir le
 * budget de l'écran de connexion (audit UI/UX du 19/11/2026, U1).
 */
const PendingSessionNoticeLazy = lazy(() =>
  import('./pedago/PendingSessionNotice.jsx').then((m) => ({ default: m.PendingSessionNotice })),
);

function AuthScreen({
  onLogin,
  appVersion,
  onVisitGuest,
  uiSettings,
  isN3Affiliated = false,
  oauthFeedback = null,
  onOauthFeedbackDismiss,
  initialMfaChallenge = null,
  onMfaChallengeConsumed,
}) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const fieldIdPrefix = useId();
  const fieldIds = {
    identifier: `${fieldIdPrefix}-identifier`,
    first: `${fieldIdPrefix}-first`,
    last: `${fieldIdPrefix}-last`,
    pass: `${fieldIdPrefix}-pass`,
    pseudo: `${fieldIdPrefix}-pseudo`,
    classCode: `${fieldIdPrefix}-class-code`,
    email: `${fieldIdPrefix}-email`,
    description: `${fieldIdPrefix}-description`,
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
  const [classCode, setClassCode] = useState('');
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
  /**
   * Double authentification : étape du second facteur en cours (mot de passe correct d'un
   * compte administrateur ou n3boss, ou retour Google / Moodle), puis invitation à l'activer
   * (phase de transition) — session déjà ouverte, connexion terminée au choix de la personne.
   */
  const [mfaChallenge, setMfaChallenge] = useState(initialMfaChallenge);
  const [setupSuggestion, setSetupSuggestion] = useState(null);
  /** Évite de réappliquer `default_mode` serveur après un clic utilisateur (sinon re-render = élément détaché côté e2e). */
  const userChoseAuthTabRef = useRef(false);
  const allowRegister = uiSettings?.auth?.allow_register !== false;
  const allowGoogleStudent = uiSettings?.auth?.allow_google_student !== false;
  const allowGuestVisit = uiSettings?.auth?.allow_guest_visit !== false;
  const welcomeMessage = String(uiSettings?.auth?.welcome_message || '').trim();
  // Replis sans marque en dur : le nom affiché vient de la marque du build
  // (`src/shared/brand/brandNames.js`, alimentée par `lib/brand.js`).
  const authTitle = getContentText(uiSettings, 'auth.title', getBuildBrand().appName);
  const authSubtitle = stripLeadingAppName(
    getContentText(uiSettings, 'auth.subtitle', DEFAULT_AUTH_SUBTITLE),
    authTitle,
  );
  const loginTabLabel = getContentText(uiSettings, 'auth.login_tab', 'Connexion');
  const registerTabLabel = getContentText(uiSettings, 'auth.register_tab', 'Créer un compte');
  const guestVisitLabel = getContentText(
    uiSettings,
    'auth.guest_visit_cta',
    '🧭 Découvrir le lieu',
  );
  const credits = getAppCredits(uiSettings);

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
      // Le jeton ne reste ni dans la barre d'adresse ni dans l'historique (CDG-52).
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('resetToken');
        url.searchParams.delete('resetType');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch (_) {
        /* URL non manipulable : sans conséquence fonctionnelle */
      }
    }
  }, [resetTokenFromUrl]);

  useEffect(() => {
    if (!initialMfaChallenge) return;
    setMfaChallenge(initialMfaChallenge);
    if (typeof onMfaChallengeConsumed === 'function') onMfaChallengeConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMfaChallenge]);

  useEffect(() => {
    if (!allowRegister) {
      setMode('login');
      return;
    }
    if (userChoseAuthTabRef.current) return;
    const def = uiSettings?.auth?.default_mode === 'register' ? 'register' : 'login';
    setMode(def);
  }, [uiSettings?.auth?.default_mode, allowRegister]);

  /** Enregistre la session renvoyée par une connexion (mot de passe ou second facteur). */
  const persistLoginSession = (student) => {
    const userType = String(
      student?.auth?.userType || student?.user_type || 'student',
    ).toLowerCase();
    const isTeacher = userType === 'teacher';
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
        default_avatar_url: student?.default_avatar_url || null,
      },
      student: isTeacher ? null : student,
    });
  };

  const submit = async () => {
    setInfo('');
    setErr('');
    // Règles de saisie chargées au premier envoi : hors du paquet de l'écran de connexion
    // (budget du lot 2, audit UI/UX du 19/11/2026, U1).
    const { getAuthSubmitError } = await import('../utils/authRegisterValidation.js');
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
        payload.classCode = classCode.trim().toUpperCase() || null;
      }
      const student = await api(endpoint, 'POST', payload);
      if (mode === 'login' && student?.mfaRequired) {
        // Mot de passe correct, second facteur attendu : aucune session n'est encore émise.
        setPass('');
        setMfaChallenge(student);
        setLoading(false);
        return;
      }
      persistLoginSession(student);
      if (student?.mfaSetupSuggested) {
        setSetupSuggestion(student);
        setLoading(false);
        return;
      }
      onLogin(student);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const completeMfaLogin = (body) => {
    setMfaChallenge(null);
    persistLoginSession(body);
    onLogin(body);
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

  const guestVisitOffered = !!(onVisitGuest && allowGuestVisit);
  /** Barre d'onglets seulement s'il y a un vrai choix (inscription ouverte) — U3. */
  const showAuthTabs = allowRegister;

  // `<main>` : l'écran de connexion n'avait aucun repère principal — `axe` y signalait
  // `landmark-one-main` et `region` sur chaque bloc de contenu (audit §6).
  // Deux portes de poids égal (audit UI/UX du 19/11/2026, U3) : « Découvrir le lieu »
  // pour le public sans compte, « Me connecter » pour les comptes. Côte à côte à partir
  // de 768 px, empilées en dessous (la Visite d'abord : c'est la porte du public).
  return (
    <main className="auth-wrap">
      <div className={`auth-shell fade-in${guestVisitOffered ? ' auth-shell--doors' : ''}`}>
        <header className="auth-head">
          <img
            className="auth-brand-logo"
            src={withAppBase('/app-logo-n3.png')}
            alt=""
            width={72}
            height={72}
            decoding="async"
          />
          <h1>{authTitle}</h1>
          {authSubtitle ? <p className="sub">{authSubtitle}</p> : null}
          {welcomeMessage && <p className="sub auth-welcome">{welcomeMessage}</p>}
          <Suspense fallback={null}>
            <PendingSessionNoticeLazy guestVisitOffered={guestVisitOffered} />
          </Suspense>
        </header>

        <div className="auth-doors">
          {guestVisitOffered && !mfaChallenge && !setupSuggestion ? (
            <section
              className="auth-card auth-door auth-door--visit"
              aria-labelledby={`${fieldIdPrefix}-door-visit`}
              data-testid="auth-door-visit"
            >
              <p className="auth-door__eyebrow">Sans compte</p>
              <h2 id={`${fieldIdPrefix}-door-visit`} className="auth-door__title">
                Découvrir le lieu
              </h2>
              <p className="auth-door__text">
                Parcours la carte, ses lieux et leurs êtres vivants.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-full auth-door__cta"
                onClick={onVisitGuest}
              >
                {guestVisitLabel}
              </button>
            </section>
          ) : null}

          <section
            className="auth-card auth-door auth-door--login"
            aria-labelledby={`${fieldIdPrefix}-door-login`}
            data-testid="auth-door-login"
          >
            {guestVisitOffered ? <p className="auth-door__eyebrow">Avec un compte</p> : null}
            <h2 id={`${fieldIdPrefix}-door-login`} className="auth-door__title">
              Me connecter
            </h2>
            {mfaChallenge ? (
              <TotpChallenge
                challenge={mfaChallenge}
                request={api}
                onComplete={completeMfaLogin}
                onCancel={() => setMfaChallenge(null)}
              />
            ) : setupSuggestion ? (
              <TotpSetupSuggestion
                request={api}
                onLater={() => {
                  const session = setupSuggestion;
                  setSetupSuggestion(null);
                  onLogin(session);
                }}
                onEnrolled={(body) => {
                  // L'activation révoque les autres sessions : le jeton neuf remplace l'ancien.
                  const session = {
                    ...setupSuggestion,
                    authToken: body?.authToken,
                    auth: body?.auth,
                  };
                  persistLoginSession(session);
                  setSetupSuggestion(null);
                  onLogin(session);
                }}
              />
            ) : (
              <>
                {showAuthTabs && (
                  <div className="fm-subtabs fm-subtabs--stretch auth-tabs">
                    <button
                      type="button"
                      className={mode === 'login' ? 'is-active' : ''}
                      onClick={() => {
                        userChoseAuthTabRef.current = true;
                        setMode('login');
                        setErr('');
                        setInfo('');
                      }}
                    >
                      {loginTabLabel}
                    </button>
                    <button
                      type="button"
                      className={mode === 'register' ? 'is-active' : ''}
                      onClick={() => {
                        userChoseAuthTabRef.current = true;
                        setMode('register');
                        setErr('');
                        setInfo('');
                      }}
                    >
                      {registerTabLabel}
                    </button>
                  </div>
                )}

                {info && <div className="auth-success">{info}</div>}
                {(oauthFeedback || err) && (
                  <div className="auth-error" role="alert" data-testid="auth-oauth-feedback">
                    <div className="auth-error-body">
                      <IconWarning size={14} aria-hidden />
                      <span>{oauthFeedback || err}</span>
                    </div>
                    {oauthFeedback && typeof onOauthFeedbackDismiss === 'function' && (
                      <button
                        type="button"
                        className="auth-error-dismiss"
                        onClick={onOauthFeedbackDismiss}
                      >
                        Fermer
                      </button>
                    )}
                  </div>
                )}

                {mode === 'login' ? (
                  <div className="field">
                    <label htmlFor={fieldIds.identifier}>Identifiant (pseudo ou email)</label>
                    <input
                      id={fieldIds.identifier}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="momo_lyautey ou moi@exemple.com"
                      autoComplete="username"
                      autoFocus={!guestVisitOffered}
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
                      <label htmlFor={fieldIds.classCode}>
                        Code de classe (si ton prof t'en a donné un)
                      </label>
                      <input
                        id={fieldIds.classCode}
                        value={classCode}
                        onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                        placeholder="ex. K7RM2XQ4"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={16}
                        onKeyDown={onKey}
                      />
                      <p className="auth-field-hint">
                        Avec un bon code, ton compte rejoint directement ta classe. Sans code, un
                        professeur devra te rattacher à la main.
                      </p>
                    </div>
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
                    {/* Information au moment de la collecte (art. 13 RGPD, audit du 30/09/2026, RG1) :
                      le public est mineur, la phrase reste courte et renvoie à la notice complète. */}
                    <p className="auth-privacy-notice" data-testid="auth-register-privacy">
                      Ton nom, ton e-mail (si tu le donnes) et ce que tu fais dans l’application
                      sont gardés par l’établissement pour les activités de la classe ; tes
                      enseignants voient ta progression.{' '}
                      <PrivacyNoticeLink>En savoir plus : vos données</PrivacyNoticeLink>
                    </p>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-full auth-submit"
                  onClick={submit}
                  disabled={loading}
                >
                  {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
                </button>
                {allowGoogleStudent && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-full auth-secondary-btn"
                    onClick={() => startGoogleAuth('student')}
                    disabled={loading}
                  >
                    Continuer avec Google
                  </button>
                )}
                {mode === 'login' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-full auth-secondary-btn"
                    onClick={() => {
                      setShowForgot((v) => !v);
                      setErr('');
                      setInfo('');
                    }}
                  >
                    {showForgot ? 'Masquer mot de passe oublié' : 'Mot de passe oublié'}
                  </button>
                )}
                {showForgot && (
                  <div className="auth-forgot">
                    <div className="fm-subtabs fm-subtabs--stretch auth-tabs auth-tabs--forgot">
                      <button
                        type="button"
                        className={forgotRole === 'student' ? 'is-active' : ''}
                        onClick={() => setForgotRole('student')}
                      >
                        {roleTerms.studentSingular}
                      </button>
                      <button
                        type="button"
                        className={forgotRole === 'teacher' ? 'is-active' : ''}
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
                        type="button"
                        className="btn btn-ghost btn-full auth-forgot__btn"
                        onClick={requestPasswordReset}
                        disabled={loading}
                      >
                        Envoyer un lien de réinitialisation
                      </button>
                    </div>
                    <div className="field auth-forgot__reset">
                      <label htmlFor={fieldIds.resetToken}>Réinitialiser avec token</label>
                      <input
                        id={fieldIds.resetToken}
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Token reçu par email"
                      />
                      <label htmlFor={fieldIds.resetPass} className="auth-forgot__label">
                        Nouveau mot de passe
                      </label>
                      <input
                        id={fieldIds.resetPass}
                        type="password"
                        value={resetPass}
                        onChange={(e) => setResetPass(e.target.value)}
                        placeholder="Nouveau mot de passe"
                        className="auth-forgot__input"
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-full auth-forgot__btn"
                        onClick={confirmResetPassword}
                        disabled={loading}
                      >
                        Valider la réinitialisation
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="auth-foot">
          <p className="auth-privacy-footer">
            <PrivacyNoticeLink />
          </p>
          {(credits.author || credits.contributor) && (
            <p className="auth-home-credit" data-testid="auth-credits">
              {credits.author && <span>Auteur : {credits.author}</span>}
              {credits.author && credits.contributor && ' · '}
              {credits.contributor && <span>Contributeur : {credits.contributor}</span>}
            </p>
          )}
          {credits.message && (
            <p
              className="auth-home-credit auth-home-credit--message"
              data-testid="auth-credit-message"
            >
              {credits.message}
            </p>
          )}
          {appVersion != null && <p className="auth-version">Version {appVersion}</p>}
        </footer>
      </div>
    </main>
  );
}

export { PinModal, AuthScreen };
