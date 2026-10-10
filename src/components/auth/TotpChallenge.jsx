import { useId, useState } from 'react';

/**
 * Écrans de la double authentification (TOTP), partagés par l'écran de connexion, la modale
 * de connexion enseignant, « Mon profil » et le plan des personnels.
 *
 * Aucun appel réseau implicite : chaque composant reçoit `request(path, method, body)` (la
 * fonction `api` de ForetMap, ou un équivalent sur le plan des personnels) — ce module ne
 * dépend donc d'aucun client HTTP particulier.
 */

/** Clé Base32 lisible : groupes de 4 caractères. */
function groupSecret(secret) {
  return (
    String(secret || '')
      .match(/.{1,4}/g)
      ?.join(' ') || ''
  );
}

/** Champ « code à 6 chiffres » : clavier numérique, autocomplétion des codes à usage unique. */
function OtpInput({ id, label, value, onChange, onEnter, disabled, autoFocus = false }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && onEnter?.()}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="123 456"
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <div className="auth-error" role="alert">
      <div className="auth-error-body">
        <span>{message}</span>
      </div>
    </div>
  );
}

/**
 * Codes de secours remis **une seule fois** : la personne confirme les avoir notés avant de
 * continuer.
 */
export function BackupCodesPanel({ codes, onContinue, continueLabel = 'Continuer' }) {
  const checkboxId = useId();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const list = Array.isArray(codes) ? codes : [];
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText?.(list.join('\n'));
      setCopied(true);
    } catch (_) {
      setCopied(false);
    }
  };
  return (
    <div className="totp-backup-codes" data-testid="totp-backup-codes">
      <h3>Vos codes de secours</h3>
      <p>
        Chaque code permet de vous connecter <strong>une seule fois</strong> sans votre téléphone.
        Notez-les ou imprimez-les et rangez-les en lieu sûr : ils ne seront plus affichés.
      </p>
      <ul className="totp-backup-codes__list">
        {list.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-full" onClick={copy}>
        {copied ? 'Codes copiés' : 'Copier les codes'}
      </button>
      <div className="totp-backup-codes__confirm">
        <input
          id={checkboxId}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <label htmlFor={checkboxId}>J’ai noté ces codes en lieu sûr</label>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-full"
        disabled={!saved}
        onClick={onContinue}
      >
        {continueLabel}
      </button>
    </div>
  );
}

/**
 * Enrôlement : QR code (et clé à saisir à la main), premier code, puis codes de secours.
 *
 * @param {object} props
 * @param {(path: string, method: string, body?: object) => Promise<object>} props.request
 * @param {string} [props.mfaToken] étape de connexion (`stage: 'enroll'`) ; absent = session
 * @param {boolean} [props.currentFactorRequired] changement d'appareil : code actuel exigé
 * @param {(result: { body: object, backupCodes: string[] }) => void} props.onDone
 * @param {() => void} [props.onCancel]
 * @param {string} [props.cancelLabel]
 */
export function TotpEnrollment({
  request,
  mfaToken = null,
  currentFactorRequired = false,
  onDone,
  onCancel,
  cancelLabel = 'Annuler',
}) {
  const idPrefix = useId();
  const [setup, setSetup] = useState(null);
  const [currentCode, setCurrentCode] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const auth = mfaToken ? { mfaToken } : {};

  const start = async () => {
    setErr('');
    setBusy(true);
    try {
      const current = currentCode.replace(/\s/g, '');
      const proof = currentFactorRequired
        ? /^\d{6}$/.test(current)
          ? { code: current }
          : { backupCode: currentCode.trim() }
        : {};
      setSetup(await request('/api/auth/totp/enroll/start', 'POST', { ...auth, ...proof }));
    } catch (e) {
      setErr(e?.message || 'Activation impossible');
    }
    setBusy(false);
  };

  const confirm = async () => {
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean))
      return setErr('Saisissez les 6 chiffres affichés par l’application.');
    setErr('');
    setBusy(true);
    try {
      const res = await request('/api/auth/totp/enroll/confirm', 'POST', { ...auth, code: clean });
      const { backupCodes, ...body } = res || {};
      setResult({ backupCodes: backupCodes || [], body });
    } catch (e) {
      setErr(e?.message || 'Code refusé');
    }
    setBusy(false);
  };

  if (result) {
    return <BackupCodesPanel codes={result.backupCodes} onContinue={() => onDone(result)} />;
  }

  if (!setup) {
    return (
      <div className="totp-enroll">
        <p>
          Installez une application d’authentification sur votre téléphone (par exemple FreeOTP,
          Aegis, 2FAS, Google Authenticator ou Microsoft Authenticator), puis affichez le QR code à
          scanner.
        </p>
        <ErrorMessage message={err} />
        {currentFactorRequired && (
          <div className="field">
            <label htmlFor={`${idPrefix}-current`}>Code actuel (ou code de secours)</label>
            <input
              id={`${idPrefix}-current`}
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              autoComplete="one-time-code"
              disabled={busy}
            />
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={start}
          disabled={busy || (currentFactorRequired && !currentCode.trim())}
        >
          {busy ? '…' : 'Afficher le QR code'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-full" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="totp-enroll">
      <p>Scannez ce QR code avec votre application, puis saisissez le code qu’elle affiche.</p>
      {setup.qrDataUrl && (
        <img
          className="totp-enroll__qr"
          src={setup.qrDataUrl}
          alt="QR code à scanner avec votre application d’authentification"
          width={200}
          height={200}
        />
      )}
      <p className="totp-enroll__manual">
        Clé à saisir à la main :{' '}
        <code data-testid="totp-manual-secret">{groupSecret(setup.secret)}</code>
      </p>
      <ErrorMessage message={err} />
      <OtpInput
        id={`${idPrefix}-code`}
        label="Code à 6 chiffres"
        value={code}
        onChange={setCode}
        onEnter={confirm}
        disabled={busy}
        autoFocus
      />
      <button type="button" className="btn btn-primary btn-full" onClick={confirm} disabled={busy}>
        {busy ? '…' : 'Activer'}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-ghost btn-full" onClick={onCancel}>
          {cancelLabel}
        </button>
      )}
    </div>
  );
}

/** Saisie du code (ou d'un code de secours) d'un compte déjà enrôlé, à la connexion. */
function TotpVerifyForm({ request, mfaToken, onComplete, onCancel }) {
  const idPrefix = useId();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = code.replace(/\s/g, '');
    if (!useBackup && !/^\d{6}$/.test(clean)) {
      return setErr('Saisissez les 6 chiffres affichés par l’application.');
    }
    if (useBackup && !backupCode.trim()) return setErr('Saisissez un code de secours.');
    setErr('');
    setBusy(true);
    try {
      const body = useBackup
        ? { mfaToken, backupCode: backupCode.trim() }
        : { mfaToken, code: clean };
      const res = await request('/api/auth/totp/verify', 'POST', body);
      setBusy(false);
      onComplete(res);
      return undefined;
    } catch (e) {
      setErr(e?.message || 'Code refusé');
    }
    setBusy(false);
    return undefined;
  };

  return (
    <div className="totp-verify">
      <p>
        {useBackup
          ? 'Saisissez l’un de vos codes de secours (chacun ne sert qu’une fois).'
          : 'Saisissez le code à 6 chiffres affiché par votre application d’authentification.'}
      </p>
      <ErrorMessage message={err} />
      {useBackup ? (
        <div className="field">
          <label htmlFor={`${idPrefix}-backup`}>Code de secours</label>
          <input
            id={`${idPrefix}-backup`}
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="xxxxx-xxxxx"
            disabled={busy}
            autoFocus
          />
        </div>
      ) : (
        <OtpInput
          id={`${idPrefix}-code`}
          label="Code à 6 chiffres"
          value={code}
          onChange={setCode}
          onEnter={submit}
          disabled={busy}
          autoFocus
        />
      )}
      <button type="button" className="btn btn-primary btn-full" onClick={submit} disabled={busy}>
        {busy ? '…' : 'Valider'}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-full"
        onClick={() => {
          setUseBackup((v) => !v);
          setErr('');
        }}
        disabled={busy}
      >
        {useBackup ? 'Utiliser l’application' : 'Utiliser un code de secours'}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-ghost btn-full" onClick={onCancel}>
          Annuler
        </button>
      )}
    </div>
  );
}

/**
 * Étape « second facteur » d'une connexion dont le premier facteur est validé.
 *
 * @param {object} props
 * @param {{ mfaToken: string, stage: 'verify'|'enroll', displayName?: string, setupAvailable?: boolean }} props.challenge
 * @param {(path: string, method: string, body?: object) => Promise<object>} props.request
 * @param {(body: object) => void} props.onComplete corps de session (forme de `POST /api/auth/login`)
 * @param {() => void} [props.onCancel]
 */
export function TotpChallenge({ challenge, request, onComplete, onCancel }) {
  const stage = challenge?.stage === 'enroll' ? 'enroll' : 'verify';
  const name = String(challenge?.displayName || '').trim();
  if (stage === 'enroll') {
    return (
      <section className="totp-challenge" aria-label="Activer la double authentification">
        <h2>Activer la double authentification</h2>
        {name && <p className="sub">Bonjour {name}.</p>}
        <p>
          Votre compte doit être protégé par un second facteur : un code à 6 chiffres, renouvelé
          toutes les 30 secondes sur votre téléphone, en plus du mot de passe.
        </p>
        {challenge?.setupAvailable === false ? (
          <>
            <ErrorMessage message="La double authentification n’est pas encore configurée sur ce serveur : prévenez un administrateur." />
            {onCancel && (
              <button type="button" className="btn btn-ghost btn-full" onClick={onCancel}>
                Retour
              </button>
            )}
          </>
        ) : (
          <TotpEnrollment
            request={request}
            mfaToken={challenge?.mfaToken}
            onDone={({ body }) => onComplete(body)}
            onCancel={onCancel}
          />
        )}
      </section>
    );
  }
  return (
    <section className="totp-challenge" aria-label="Double authentification">
      <h2>Double authentification</h2>
      {name && <p className="sub">Bonjour {name}.</p>}
      <TotpVerifyForm
        request={request}
        mfaToken={challenge?.mfaToken}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </section>
  );
}

/**
 * Invitation à activer la double authentification (phase de transition) : reportable.
 * La session est déjà ouverte ; l'activation passe par les routes authentifiées.
 */
export function TotpSetupSuggestion({ request, onLater, onEnrolled }) {
  const [enrolling, setEnrolling] = useState(false);
  return (
    <section className="totp-challenge" aria-label="Protéger votre compte">
      <h2>Protégez votre compte</h2>
      <p>
        Les comptes administrateur et enseignant doivent activer la double authentification : un
        code à 6 chiffres sur votre téléphone, en plus du mot de passe. Elle deviendra bientôt
        obligatoire.
      </p>
      {enrolling ? (
        <TotpEnrollment
          request={request}
          onDone={({ body }) => onEnrolled(body)}
          onCancel={onLater}
          cancelLabel="Plus tard"
        />
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => setEnrolling(true)}
          >
            Activer la double authentification
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={onLater}>
            Plus tard
          </button>
        </>
      )}
    </section>
  );
}
