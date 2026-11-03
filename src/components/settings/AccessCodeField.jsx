import { useCallback, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import {
  ACCESS_CODE_MIN_LENGTH,
  ACCESS_SECRET_MAX_LENGTH,
  accessSecretProblem,
  generateAccessCode,
  generateAccessPassword,
} from '../../utils/accessCodeGenerator.js';

/**
 * Formulations par nature de secret : **code d'accès** (secret de diffusion, transmissible par
 * lien et QR code) ou **mot de passe** (alphanumérique, saisi masqué, jamais par lien).
 */
const SECRET_WORDING = Object.freeze({
  code: Object.freeze({
    title: 'Code d’accès',
    newLabel: 'Nouveau code d’accès',
    placeholder: `Nouveau code (${ACCESS_CODE_MIN_LENGTH} caractères minimum)`,
    generate: 'Générer un code',
    save: 'Enregistrer le code',
    clear: 'Effacer le code',
    missing: 'Saisissez un code d’accès.',
    saved: (target) => `Code d’accès ${target} enregistré.`,
    cleared: (target) => `Code d’accès ${target} effacé.`,
    note: 'Notez ce code avant de l’enregistrer : seule son empreinte est conservée, il ne pourra plus être affiché ensuite.',
    generateFailed: 'Génération du code impossible.',
    saveFailed: 'Enregistrement du code impossible.',
    clearFailed: 'Effacement du code impossible.',
  }),
  password: Object.freeze({
    title: 'Mot de passe',
    newLabel: 'Nouveau mot de passe',
    placeholder: `Nouveau mot de passe (${ACCESS_CODE_MIN_LENGTH} caractères, lettres et chiffres)`,
    generate: 'Générer un mot de passe',
    save: 'Enregistrer le mot de passe',
    clear: 'Effacer le mot de passe',
    missing: 'Saisissez un mot de passe.',
    saved: (target) => `Mot de passe ${target} enregistré.`,
    cleared: (target) => `Mot de passe ${target} effacé.`,
    note: 'Notez ce mot de passe avant de l’enregistrer : seule son empreinte est conservée, il ne pourra plus être affiché ensuite.',
    generateFailed: 'Génération du mot de passe impossible.',
    saveFailed: 'Enregistrement du mot de passe impossible.',
    clearFailed: 'Effacement du mot de passe impossible.',
  }),
});

/**
 * Saisie du secret d'un plan (plan public, plan des personnels, plan e-nov), commune aux trois
 * panneaux de réglages : **code d'accès** ou **mot de passe** (`kind`), chacun avec sa route
 * et son empreinte côté serveur (`lib/accessSecret.js`).
 *
 * Le secret n'est jamais relu : le serveur n'en garde que l'empreinte bcrypt. D'où le
 * **générateur** : il propose un code (14 caractères, minuscules et chiffres) ou un mot de
 * passe (14 caractères, majuscules, minuscules et chiffres), affiché en clair pour que
 * l'administrateur le recopie **avant** de l'enregistrer — après, plus personne ne peut
 * l'afficher. Un secret saisi à la main reste masqué.
 *
 * @param {object} props
 * @param {string} props.endpoint route d'enregistrement (`/api/settings/admin/*-access-code`
 *   ou `*-access-password`).
 * @param {string} props.targetLabel complément des messages (« du plan », « du plan e-nov »…).
 * @param {boolean} props.hasCode un secret de cette nature est-il déjà défini ?
 * @param {'code'|'password'} [props.kind='code']
 * @param {boolean} [props.active] ce secret est-il celui que demande le mode d'accès actuel ?
 *   Affiché à côté du titre (« en vigueur ») ; `undefined` = rien d'affiché.
 * @param {boolean} [props.readOnly]
 * @param {(msg: string) => void} [props.onMessage]
 * @param {(msg: string) => void} [props.onError]
 * @param {string} [props.testId]
 * @param {import('react').ReactNode} [props.children] note explicative sous le champ.
 */
export function AccessCodeField({
  endpoint,
  targetLabel,
  hasCode,
  kind = 'code',
  active = undefined,
  readOnly = false,
  onMessage = null,
  onError = null,
  testId = undefined,
  children = null,
}) {
  const isPassword = kind === 'password';
  const wording = isPassword ? SECRET_WORDING.password : SECRET_WORDING.code;
  const [code, setCode] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setCode('');
    setRevealed(false);
  }, []);

  const generate = useCallback(() => {
    if (readOnly) return;
    try {
      setCode(isPassword ? generateAccessPassword() : generateAccessCode());
      setRevealed(true);
    } catch (err) {
      onError?.(err?.message || wording.generateFailed);
    }
  }, [isPassword, onError, readOnly, wording]);

  const save = useCallback(async () => {
    if (readOnly) return;
    const value = String(code || '').trim();
    if (!value) {
      onError?.(wording.missing);
      return;
    }
    // Mot de passe : la règle de composition est vérifiée avant l'envoi (le serveur la
    // redit). Le code garde son seul contrôle serveur, inchangé.
    const problem = isPassword ? accessSecretProblem('password', value) : '';
    if (problem) {
      onError?.(problem);
      return;
    }
    setSaving(true);
    try {
      await api(endpoint, 'POST', { code: value });
      reset();
      onMessage?.(wording.saved(targetLabel));
    } catch (err) {
      onError?.(err?.message || wording.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [code, endpoint, isPassword, onError, onMessage, readOnly, reset, targetLabel, wording]);

  const clear = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await api(endpoint, 'POST', { code: '' });
      reset();
      onMessage?.(wording.cleared(targetLabel));
    } catch (err) {
      onError?.(err?.message || wording.clearFailed);
    } finally {
      setSaving(false);
    }
  }, [endpoint, onError, onMessage, readOnly, reset, targetLabel, wording]);

  const disabled = readOnly || saving;

  return (
    <div className="field" data-testid={testId}>
      <span>
        {wording.title} {hasCode ? '(déjà défini)' : '(aucun)'}
        {active === true ? ' — en vigueur' : null}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type={revealed ? 'text' : 'password'}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={wording.newLabel}
          placeholder={wording.placeholder}
          minLength={ACCESS_CODE_MIN_LENGTH}
          maxLength={isPassword ? ACCESS_SECRET_MAX_LENGTH : undefined}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            // Un secret retouché à la main redevient un secret saisi : il se masque.
            setRevealed(false);
          }}
          disabled={disabled}
          style={{ flex: '1 1 12rem', fontFamily: revealed ? 'monospace' : undefined }}
        />
        <Button variant="secondary" disabled={disabled} onClick={generate}>
          {wording.generate}
        </Button>
        <Button variant="primary" disabled={disabled} onClick={save}>
          {wording.save}
        </Button>
        {hasCode ? (
          <Button variant="secondary" disabled={disabled} onClick={clear}>
            {wording.clear}
          </Button>
        ) : null}
      </div>
      {revealed && code ? (
        <p className="muted" role="status" style={{ marginBottom: 0 }}>
          {wording.note}
        </p>
      ) : null}
      {children ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          {children}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Durée du laissez-passer posé après la saisie du code, en jours. Elle fixe à la fois la durée
 * du cookie et l'**échéance signée** qu'il porte : le serveur refuse un laissez-passer échu,
 * même recopié sur un autre appareil. Une nouvelle durée vaut pour les laissez-passer émis
 * ensuite ; pour fermer la porte à ceux déjà émis, on change le code.
 *
 * @param {object} props
 * @param {string} props.settingKey réglage (`security.*_access_pass_days`).
 * @param {number} props.defaultDays défaut du registre (`lib/settings/plan.js`).
 * @param {number} props.maxDays plafond du registre.
 * @param {(key: string, fallback?: unknown) => unknown} props.get
 * @param {(key: string, value: unknown, okMsg?: string) => Promise<void>} props.saveSetting
 * @param {string} [props.savingKey]
 * @param {boolean} [props.readOnly]
 * @param {string} [props.testId]
 */
export function AccessPassDaysField({
  settingKey,
  defaultDays,
  maxDays,
  get,
  saveSetting,
  savingKey = '',
  readOnly = false,
  testId = undefined,
}) {
  const stored = Math.floor(Number(get(settingKey, defaultDays)));
  const days = Number.isFinite(stored) && stored > 0 ? stored : defaultDays;
  return (
    <label className="field" data-testid={testId}>
      <span>Durée du laissez-passer (jours)</span>
      <input
        type="number"
        aria-label="Durée du laissez-passer (jours)"
        inputMode="numeric"
        min={1}
        max={maxDays}
        step={1}
        defaultValue={days}
        key={`${settingKey}:${days}`}
        disabled={readOnly || savingKey === settingKey}
        onBlur={(e) => {
          const next = Math.floor(Number(e.target.value));
          if (!Number.isFinite(next) || next === days) return;
          saveSetting(settingKey, next, 'Durée du laissez-passer enregistrée');
        }}
        style={{ maxWidth: '8rem' }}
      />
      <small className="muted">
        Après la saisie du code ou du mot de passe, l’appareil reste ouvert pendant cette durée (
        {defaultDays} jours par défaut, {maxDays} au plus), puis il est redemandé. Une nouvelle
        durée vaut pour les entrées suivantes ; pour refermer tout de suite, changez le code ou le
        mot de passe.
      </small>
    </label>
  );
}

/**
 * Avertissement sous le mode d'accès quand le secret qu'il demande n'est pas enregistré. Plan
 * public et plan e-nov : le plan reste alors **ouvert à tous** (on n'enferme personne par
 * accident) ; plan des personnels (`closedWithoutSecret`) : **personne** n'entre par cette voie.
 *
 * @param {object} props
 * @param {string} props.mode valeur de `ui.<plan>.access_mode`.
 * @param {boolean} props.hasCode
 * @param {boolean} props.hasPassword
 * @param {boolean} [props.closedWithoutSecret]
 */
export function AccessSecretModeNotice({
  mode,
  hasCode,
  hasPassword,
  closedWithoutSecret = false,
}) {
  let missing = '';
  if (mode === 'code' && !hasCode) missing = 'Aucun code d’accès enregistré';
  if (mode === 'password' && !hasPassword) missing = 'Aucun mot de passe enregistré';
  if (!missing) return null;
  return (
    <p className="muted" role="status" style={{ marginTop: 0 }}>
      ⚠️ {missing} :{' '}
      {closedWithoutSecret
        ? 'personne ne peut entrer par cette voie tant que vous n’en enregistrez pas un ci-dessous.'
        : 'le plan reste ouvert à tous tant que vous n’en enregistrez pas un ci-dessous.'}
    </p>
  );
}
