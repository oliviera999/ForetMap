import { useCallback, useEffect, useId, useState } from 'react';
import { BackupCodesPanel, TotpEnrollment } from './TotpChallenge.jsx';

/** Profils soumis connus du navigateur (le serveur fait foi, via `/api/auth/totp/status`). */
const SUBJECT_ROLE_SLUGS = ['admin', 'prof'];

/** Le compte affiché peut-il être concerné ? Évite une requête pour chaque élève. */
function mayBeSubject(account) {
  const roleSlug = String(account?.auth?.roleSlug || '').toLowerCase();
  const userType = String(account?.user_type || account?.auth?.userType || '').toLowerCase();
  return SUBJECT_ROLE_SLUGS.includes(roleSlug) || userType === 'teacher';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * « Mon profil » — double authentification des comptes administrateur et n3boss : état,
 * activation (ou changement d'appareil), nouveaux codes de secours. N'affiche rien pour un
 * compte non concerné.
 *
 * @param {object} props
 * @param {object} props.account compte affiché (le compte connecté)
 * @param {(path: string, method?: string, body?: object) => Promise<object>} props.request
 * @param {(update: { authToken: string, auth: object }) => void} props.onUpdated jeton neuf
 *   (l'activation révoque les autres sessions et ré-émet celle-ci)
 */
export function TotpProfileSection({ account, request, onUpdated }) {
  const idPrefix = useId();
  const eligible = mayBeSubject(account);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('idle'); // idle | enroll | device | regen
  const [regenCode, setRegenCode] = useState('');
  const [freshCodes, setFreshCodes] = useState(null);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await request('/api/auth/totp/status'));
    } catch (_) {
      setStatus(null);
    }
  }, [request]);

  useEffect(() => {
    if (eligible) load();
  }, [eligible, load]);

  if (!eligible || !status?.subject) return null;

  const finishEnrollment = ({ body }) => {
    if (body?.authToken) onUpdated({ authToken: body.authToken, auth: body.auth });
    setMode('idle');
    setInfo('Double authentification activée.');
    load();
  };

  const regenerate = async () => {
    const clean = regenCode.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return setErr('Saisissez le code à 6 chiffres de l’application.');
    setErr('');
    setBusy(true);
    try {
      const res = await request('/api/auth/totp/backup-codes', 'POST', { code: clean });
      setFreshCodes(res?.backupCodes || []);
      setRegenCode('');
    } catch (e) {
      setErr(e?.message || 'Code refusé');
    }
    setBusy(false);
    return undefined;
  };

  let body;
  if (status.enforcement === 'off') {
    body = <p>Désactivée sur ce serveur par l’administrateur.</p>;
  } else if (freshCodes) {
    body = (
      <BackupCodesPanel
        codes={freshCodes}
        continueLabel="Terminé"
        onContinue={() => {
          setFreshCodes(null);
          setMode('idle');
          load();
        }}
      />
    );
  } else if (mode === 'enroll' || mode === 'device') {
    body = (
      <TotpEnrollment
        request={request}
        currentFactorRequired={mode === 'device'}
        onDone={finishEnrollment}
        onCancel={() => setMode('idle')}
      />
    );
  } else if (mode === 'regen') {
    body = (
      <div>
        <div className="field">
          <label htmlFor={`${idPrefix}-regen`}>Code actuel à 6 chiffres</label>
          <input
            id={`${idPrefix}-regen`}
            value={regenCode}
            onChange={(e) => setRegenCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={busy}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={regenerate} disabled={busy}>
            {busy ? '…' : 'Générer'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>
            Annuler
          </button>
        </div>
      </div>
    );
  } else if (status.enrolled) {
    body = (
      <>
        <p>
          Active depuis le {formatDate(status.enabledAt)}. Codes de secours restants :{' '}
          {status.backupCodesRemaining}.
        </p>
        {status.backupCodesRemaining <= 2 && (
          <p className="totp-profile__warning" role="status">
            Il vous reste peu de codes de secours : générez-en de nouveaux.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMode('regen')}
          >
            Nouveaux codes de secours
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('device')}>
            Changer d’appareil
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p>
          Non activée.{' '}
          {status.required
            ? 'Elle est obligatoire pour votre compte.'
            : 'Elle sera bientôt obligatoire pour votre compte.'}
        </p>
        {status.setupAvailable ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setMode('enroll')}
          >
            Activer la double authentification
          </button>
        ) : (
          <p>Pas encore configurée sur ce serveur : prévenez un administrateur.</p>
        )}
      </>
    );
  }

  return (
    <section className="totp-profile" data-testid="totp-profile-section">
      <h4>Double authentification</h4>
      {info && <div className="auth-success">{info}</div>}
      {err && (
        <div className="auth-error" role="alert">
          {err}
        </div>
      )}
      {body}
    </section>
  );
}
