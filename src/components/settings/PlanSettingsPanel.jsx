import { useCallback, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';

const PLAN_KEYS = Object.freeze({
  mapId: 'ui.plan.map_id',
  title: 'ui.plan.title',
  welcomeHint: 'ui.plan.welcome_hint',
  attribution: 'ui.plan.attribution',
  publicBaseUrl: 'ui.plan.public_base_url',
  defaultCategoryIds: 'ui.plan.default_category_ids',
  hiddenCategoryIds: 'ui.plan.hidden_category_ids',
  accessMode: 'ui.plan.access_mode',
  headingUpEnabled: 'ui.plan.heading_up_enabled',
});

/**
 * Réglages regroupés du Plan Lyautey (console ForetMap) : carte, textes, URL publique,
 * catégories, mode d'accès et saisie du code en clair (hashé côté serveur).
 *
 * @param {object} props
 * @param {Array<{ id: string, label?: string }>} [props.maps]
 * @param {(key: string, fallback?: unknown) => unknown} props.get
 * @param {(key: string, value: unknown, okMsg?: string) => Promise<void>} props.saveSetting
 * @param {string} [props.savingKey]
 * @param {(msg: string) => void} [props.onMessage]
 * @param {(msg: string) => void} [props.onError]
 */
export function PlanSettingsPanel({
  maps = [],
  get,
  saveSetting,
  savingKey = '',
  onMessage = null,
  onError = null,
}) {
  const [accessCode, setAccessCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const hasHash = Boolean(String(get('security.plan_access_code_hash', '') || '').trim());
  const accessMode = String(get(PLAN_KEYS.accessMode, 'public') || 'public');

  const saveAccessCode = useCallback(async () => {
    const code = String(accessCode || '').trim();
    if (!code) {
      onError?.('Saisissez un code d’accès.');
      return;
    }
    setSavingCode(true);
    try {
      await api('/api/settings/admin/plan-access-code', 'POST', { code });
      setAccessCode('');
      onMessage?.('Code d’accès du plan enregistré.');
    } catch (err) {
      onError?.(err?.message || 'Enregistrement du code impossible.');
    } finally {
      setSavingCode(false);
    }
  }, [accessCode, onError, onMessage]);

  const clearAccessCode = useCallback(async () => {
    setSavingCode(true);
    try {
      await api('/api/settings/admin/plan-access-code', 'POST', { code: '' });
      setAccessCode('');
      onMessage?.('Code d’accès du plan effacé.');
    } catch (err) {
      onError?.(err?.message || 'Effacement du code impossible.');
    } finally {
      setSavingCode(false);
    }
  }, [onError, onMessage]);

  return (
    <div className="plan-settings-panel" data-testid="plan-settings-panel">
      <p className="muted" style={{ marginTop: 0 }}>
        Ces réglages pilotent le site Plan (recherche de lieux). Les parcours se gèrent dans la
        section Parcours ; les lieux et catégories restent partagés avec la carte.
      </p>

      <label className="field">
        <span>Carte du plan</span>
        <select
          value={String(get(PLAN_KEYS.mapId, 'lyautey') || 'lyautey')}
          disabled={savingKey === PLAN_KEYS.mapId}
          onChange={(e) =>
            saveSetting(PLAN_KEYS.mapId, e.target.value, 'Carte du plan enregistrée')
          }
        >
          {(maps || []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Titre</span>
        <input
          type="text"
          defaultValue={String(get(PLAN_KEYS.title, 'Plan Lyautey') || '')}
          key={`title:${get(PLAN_KEYS.title, '')}`}
          disabled={savingKey === PLAN_KEYS.title}
          onBlur={(e) => saveSetting(PLAN_KEYS.title, e.target.value, 'Titre du plan enregistré')}
        />
      </label>

      <label className="field">
        <span>Message d’accueil</span>
        <input
          type="text"
          defaultValue={String(get(PLAN_KEYS.welcomeHint, '') || '')}
          key={`welcome:${get(PLAN_KEYS.welcomeHint, '')}`}
          disabled={savingKey === PLAN_KEYS.welcomeHint}
          onBlur={(e) =>
            saveSetting(PLAN_KEYS.welcomeHint, e.target.value, 'Message d’accueil enregistré')
          }
        />
      </label>

      <label className="field">
        <span>Mention de source (fond de carte)</span>
        <input
          type="text"
          defaultValue={String(get(PLAN_KEYS.attribution, '') || '')}
          key={`attr:${get(PLAN_KEYS.attribution, '')}`}
          disabled={savingKey === PLAN_KEYS.attribution}
          onBlur={(e) =>
            saveSetting(PLAN_KEYS.attribution, e.target.value, 'Mention de source enregistrée')
          }
        />
      </label>

      <label className="field">
        <span>Adresse publique du plan (QR / liens)</span>
        <input
          type="url"
          placeholder="https://planlyautey.example.org"
          defaultValue={String(get(PLAN_KEYS.publicBaseUrl, '') || '')}
          key={`url:${get(PLAN_KEYS.publicBaseUrl, '')}`}
          disabled={savingKey === PLAN_KEYS.publicBaseUrl}
          onBlur={(e) =>
            saveSetting(
              PLAN_KEYS.publicBaseUrl,
              e.target.value.trim(),
              'Adresse publique du plan enregistrée',
            )
          }
        />
      </label>

      <label className="field">
        <span>Catégories cochées d’office (ids séparés par ;)</span>
        <input
          type="text"
          defaultValue={String(get(PLAN_KEYS.defaultCategoryIds, '') || '')}
          key={`def:${get(PLAN_KEYS.defaultCategoryIds, '')}`}
          disabled={savingKey === PLAN_KEYS.defaultCategoryIds}
          onBlur={(e) =>
            saveSetting(
              PLAN_KEYS.defaultCategoryIds,
              e.target.value,
              'Catégories par défaut enregistrées',
            )
          }
        />
      </label>

      <label className="field">
        <span>Catégories masquées (ids séparés par ;)</span>
        <input
          type="text"
          defaultValue={String(get(PLAN_KEYS.hiddenCategoryIds, '') || '')}
          key={`hid:${get(PLAN_KEYS.hiddenCategoryIds, '')}`}
          disabled={savingKey === PLAN_KEYS.hiddenCategoryIds}
          onBlur={(e) =>
            saveSetting(
              PLAN_KEYS.hiddenCategoryIds,
              e.target.value,
              'Catégories masquées enregistrées',
            )
          }
        />
      </label>

      <label className="field">
        <span>Mode d’accès</span>
        <select
          value={accessMode}
          disabled={savingKey === PLAN_KEYS.accessMode}
          onChange={(e) =>
            saveSetting(PLAN_KEYS.accessMode, e.target.value, 'Mode d’accès du plan enregistré')
          }
        >
          <option value="public">Public</option>
          <option value="code">Code d’accès</option>
        </select>
      </label>

      <label
        className="field"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        data-testid="plan-heading-up-setting"
      >
        <input
          type="checkbox"
          checked={Boolean(get(PLAN_KEYS.headingUpEnabled, false))}
          disabled={savingKey === PLAN_KEYS.headingUpEnabled}
          onChange={(e) =>
            saveSetting(
              PLAN_KEYS.headingUpEnabled,
              e.target.checked,
              e.target.checked
                ? 'Orientation boussole autorisée sur le Plan'
                : 'Orientation boussole désactivée sur le Plan',
            )
          }
        />
        <span>
          Autoriser l’orientation de la carte selon la boussole (bouton « Orienter »). Chaque carte
          doit aussi l’autoriser dans son calage GPS.
        </span>
      </label>

      <div className="field">
        <span>Code d’accès {hasHash ? '(déjà défini)' : '(aucun)'}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nouveau code"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            disabled={savingCode}
            style={{ flex: '1 1 12rem' }}
          />
          <Button variant="primary" disabled={savingCode} onClick={saveAccessCode}>
            Enregistrer le code
          </Button>
          {hasHash ? (
            <Button variant="secondary" disabled={savingCode} onClick={clearAccessCode}>
              Effacer le code
            </Button>
          ) : null}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Le code n’est jamais stocké en clair : seule une empreinte est enregistrée. En mode « code
          » sans empreinte, le plan reste ouvert (évite un verrouillage accidentel).
        </p>
      </div>
    </div>
  );
}
