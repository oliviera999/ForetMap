import { useCallback, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import { ACCESS_CODE_MIN_LENGTH, generateAccessCode } from '../../utils/accessCodeGenerator.js';

/**
 * Saisie du code d'accès d'un plan (plan public, plan des personnels, plan e-nov), commune
 * aux trois panneaux de réglages.
 *
 * Le code n'est jamais relu : le serveur n'en garde que l'empreinte bcrypt. D'où le
 * **générateur** : il propose un code aléatoire de 14 caractères, affiché en clair pour que
 * l'administrateur le recopie **avant** de l'enregistrer — après, plus personne ne peut
 * l'afficher. Un code saisi à la main reste masqué.
 *
 * @param {object} props
 * @param {string} props.endpoint route d'enregistrement (`/api/settings/admin/*-access-code`).
 * @param {string} props.targetLabel complément des messages (« du plan », « du plan e-nov »…).
 * @param {boolean} props.hasCode un code est-il déjà défini ?
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
  readOnly = false,
  onMessage = null,
  onError = null,
  testId = undefined,
  children = null,
}) {
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
      setCode(generateAccessCode());
      setRevealed(true);
    } catch (err) {
      onError?.(err?.message || 'Génération du code impossible.');
    }
  }, [onError, readOnly]);

  const save = useCallback(async () => {
    if (readOnly) return;
    const value = String(code || '').trim();
    if (!value) {
      onError?.('Saisissez un code d’accès.');
      return;
    }
    setSaving(true);
    try {
      await api(endpoint, 'POST', { code: value });
      reset();
      onMessage?.(`Code d’accès ${targetLabel} enregistré.`);
    } catch (err) {
      onError?.(err?.message || 'Enregistrement du code impossible.');
    } finally {
      setSaving(false);
    }
  }, [code, endpoint, onError, onMessage, readOnly, reset, targetLabel]);

  const clear = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await api(endpoint, 'POST', { code: '' });
      reset();
      onMessage?.(`Code d’accès ${targetLabel} effacé.`);
    } catch (err) {
      onError?.(err?.message || 'Effacement du code impossible.');
    } finally {
      setSaving(false);
    }
  }, [endpoint, onError, onMessage, readOnly, reset, targetLabel]);

  const disabled = readOnly || saving;

  return (
    <div className="field" data-testid={testId}>
      <span>Code d’accès {hasCode ? '(déjà défini)' : '(aucun)'}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type={revealed ? 'text' : 'password'}
          autoComplete="new-password"
          spellCheck={false}
          aria-label="Nouveau code d’accès"
          placeholder={`Nouveau code (${ACCESS_CODE_MIN_LENGTH} caractères minimum)`}
          minLength={ACCESS_CODE_MIN_LENGTH}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            // Un code retouché à la main redevient un secret saisi : il se masque.
            setRevealed(false);
          }}
          disabled={disabled}
          style={{ flex: '1 1 12rem', fontFamily: revealed ? 'monospace' : undefined }}
        />
        <Button variant="secondary" disabled={disabled} onClick={generate}>
          Générer un code
        </Button>
        <Button variant="primary" disabled={disabled} onClick={save}>
          Enregistrer le code
        </Button>
        {hasCode ? (
          <Button variant="secondary" disabled={disabled} onClick={clear}>
            Effacer le code
          </Button>
        ) : null}
      </div>
      {revealed && code ? (
        <p className="muted" role="status" style={{ marginBottom: 0 }}>
          Notez ce code avant de l’enregistrer : seule son empreinte est conservée, il ne pourra
          plus être affiché ensuite.
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
