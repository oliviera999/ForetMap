import { useCallback, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import { CategoryIdsMultiSelect } from './CategoryIdsMultiSelect.jsx';
import { MapIdsMultiSelect } from './MapIdsMultiSelect.jsx';
import { RoleSlugsMultiSelect } from './RoleSlugsMultiSelect.jsx';
import { FORETMAP_AUDIENCE_ROLE_OPTIONS } from '../../shared/ui/LocationAudienceFields.jsx';
import { parseCategoryIdsSetting } from '../../utils/categoryIdsSetting.js';

const STAFF_KEYS = Object.freeze({
  title: 'ui.staff_plan.title',
  welcomeHint: 'ui.staff_plan.welcome_hint',
  attribution: 'ui.staff_plan.attribution',
  selectableMapIds: 'ui.staff_plan.selectable_map_ids',
  defaultCategoryIds: 'ui.staff_plan.default_category_ids',
  hiddenCategoryIds: 'ui.staff_plan.hidden_category_ids',
  allowedRoleSlugs: 'ui.staff_plan.allowed_role_slugs',
  accessMode: 'ui.staff_plan.access_mode',
  codeRoleSlug: 'ui.staff_plan.code_role_slug',
});

/**
 * Réglages du plan des personnels (proflyautey).
 *
 * Il n'y a **pas** de réglage de carte ici : le plan des personnels montre la carte du plan
 * public (`ui.plan.map_id`), et deux réglages à tenir synchronisés à la main seraient une
 * source d'erreur pour aucun gain. Ne se règlent ici que la ligne éditoriale propre à cette
 * surface, les profils autorisés à entrer avec un compte, et sa porte d'entrée secondaire.
 *
 * @param {object} props
 * @param {Array<{ slug: string, label?: string, display_name?: string }>} [props.roles] profils
 *   proposés (défaut : ceux de « Qui peut voir »).
 * @param {Array<{ id: string, label?: string, is_active?: number|boolean }>} [props.maps] cartes
 *   de l'établissement, pour déclarer les plans proposés au changement.
 * @param {(key: string, fallback?: unknown) => unknown} props.get
 * @param {(key: string, value: unknown, okMsg?: string) => Promise<void>} props.saveSetting
 * @param {string} [props.savingKey]
 * @param {boolean} [props.canWrite]
 * @param {(msg: string) => void} [props.onMessage]
 * @param {(msg: string) => void} [props.onError]
 */
export function StaffPlanSettingsPanel({
  // Même vocabulaire que « Qui peut voir » sur une fiche de lieu : le profil endossé par un
  // porteur de code n'a de sens que s'il fait partie des profils que l'audience sait filtrer.
  roles = FORETMAP_AUDIENCE_ROLE_OPTIONS,
  maps = [],
  get,
  saveSetting,
  savingKey = '',
  canWrite = true,
  onMessage = null,
  onError = null,
}) {
  const [accessCode, setAccessCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const hasHash = Boolean(String(get('security.staff_plan_access_code_hash', '') || '').trim());
  const accessMode = String(get(STAFF_KEYS.accessMode, 'disabled') || 'disabled');
  const readOnly = !canWrite;

  const saveAccessCode = useCallback(async () => {
    if (readOnly) return;
    const code = String(accessCode || '').trim();
    if (!code) {
      onError?.('Saisissez un code d’accès.');
      return;
    }
    setSavingCode(true);
    try {
      await api('/api/settings/admin/staff-plan-access-code', 'POST', { code });
      setAccessCode('');
      onMessage?.('Code d’accès du plan des personnels enregistré.');
    } catch (err) {
      onError?.(err?.message || 'Enregistrement du code impossible.');
    } finally {
      setSavingCode(false);
    }
  }, [accessCode, onError, onMessage, readOnly]);

  const clearAccessCode = useCallback(async () => {
    if (readOnly) return;
    setSavingCode(true);
    try {
      await api('/api/settings/admin/staff-plan-access-code', 'POST', { code: '' });
      setAccessCode('');
      onMessage?.('Code d’accès du plan des personnels effacé.');
    } catch (err) {
      onError?.(err?.message || 'Effacement du code impossible.');
    } finally {
      setSavingCode(false);
    }
  }, [onError, onMessage, readOnly]);

  return (
    <div className="plan-settings-panel" data-testid="staff-plan-settings-panel">
      <p className="muted" style={{ marginTop: 0 }}>
        Le plan des personnels (proflyautey) affiche la <strong>même carte</strong> que le plan
        public, sur la surface « Plan personnels » : il montre en plus les lieux qui en sont retirés
        et les compléments réservés des fiches. Cochez ci-dessous les profils qui peuvent y entrer
        avec leur compte <strong>même sans</strong> la permission RBAC. Les profils qui ont déjà «
        Accès plan des personnels » (Profils RBAC) entrent aussi — les cases servent surtout à
        ouvrir un profil supplémentaire sans toucher aux permissions.
      </p>

      <RoleSlugsMultiSelect
        label="Profils autorisés (compte)"
        value={get(STAFF_KEYS.allowedRoleSlugs, 'admin;prof;prof_classe;personnel')}
        disabled={readOnly || savingKey === STAFF_KEYS.allowedRoleSlugs}
        hint="Sélection multiple — enregistrée immédiatement. Complète la permission RBAC « Accès plan des personnels » (union des deux)."
        testId="staff-plan-allowed-role-slugs"
        roles={roles}
        onSave={(next) =>
          saveSetting(STAFF_KEYS.allowedRoleSlugs, next, 'Profils autorisés enregistrés')
        }
      />

      <MapIdsMultiSelect
        label="Autres plans proposés aux personnels"
        value={get(STAFF_KEYS.selectableMapIds, '')}
        maps={maps}
        disabled={readOnly || savingKey === STAFF_KEYS.selectableMapIds}
        hint="Liste propre à cette surface : un lecteur identifié peut ouvrir des plans que le plan public n’offre pas (annexes, locaux techniques). La carte d’accueil reste celle du plan public."
        testId="staff-plan-selectable-map-ids"
        onSave={(next) =>
          saveSetting(STAFF_KEYS.selectableMapIds, next, 'Plans proposés enregistrés')
        }
      />

      <label className="field">
        <span>Titre</span>
        <input
          type="text"
          maxLength={120}
          defaultValue={String(get(STAFF_KEYS.title, '') || '')}
          disabled={readOnly || savingKey === STAFF_KEYS.title}
          onBlur={(e) => saveSetting(STAFF_KEYS.title, e.target.value, 'Titre enregistré')}
        />
      </label>

      <label className="field">
        <span>Message d’accueil</span>
        <textarea
          rows={2}
          maxLength={400}
          defaultValue={String(get(STAFF_KEYS.welcomeHint, '') || '')}
          disabled={readOnly || savingKey === STAFF_KEYS.welcomeHint}
          onBlur={(e) =>
            saveSetting(STAFF_KEYS.welcomeHint, e.target.value, 'Message d’accueil enregistré')
          }
        />
      </label>

      <label className="field">
        <span>Mention en pied de page</span>
        <input
          type="text"
          maxLength={240}
          defaultValue={String(get(STAFF_KEYS.attribution, '') || '')}
          disabled={readOnly || savingKey === STAFF_KEYS.attribution}
          onBlur={(e) => saveSetting(STAFF_KEYS.attribution, e.target.value, 'Mention enregistrée')}
        />
      </label>

      <CategoryIdsMultiSelect
        label="Catégories cochées d’office"
        value={get(STAFF_KEYS.defaultCategoryIds, '')}
        disabled={readOnly || savingKey === STAFF_KEYS.defaultCategoryIds}
        hint="Sélection multiple — enregistrée immédiatement. Vide = tout afficher à l’ouverture."
        testId="staff-plan-default-category-ids"
        requireSurface="staff"
        excludeIds={parseCategoryIdsSetting(get(STAFF_KEYS.hiddenCategoryIds, ''))}
        onSave={(next) =>
          saveSetting(STAFF_KEYS.defaultCategoryIds, next, 'Catégories par défaut enregistrées')
        }
      />

      <CategoryIdsMultiSelect
        label="Catégories masquées"
        value={get(STAFF_KEYS.hiddenCategoryIds, '')}
        disabled={readOnly || savingKey === STAFF_KEYS.hiddenCategoryIds}
        hint="Retirées des filtres, et les lieux qui n’appartenaient qu’à elles disparaissent du plan."
        testId="staff-plan-hidden-category-ids"
        requireSurface="staff"
        excludeIds={parseCategoryIdsSetting(get(STAFF_KEYS.defaultCategoryIds, ''))}
        onSave={(next) =>
          saveSetting(STAFF_KEYS.hiddenCategoryIds, next, 'Catégories masquées enregistrées')
        }
      />

      <hr />

      <h4 style={{ margin: '0 0 4px' }}>Entrée par code partagé</h4>
      <p className="muted" style={{ marginTop: 0 }}>
        Voie <strong>secondaire</strong>, désactivée par défaut, pour les personnels sans compte
        (agent, intervenant, remplaçant). Un code partagé ne dit pas qui entre et se transmet d’une
        capture d’écran : il ne remplace pas un compte. Chaque ouverture est inscrite au journal
        d’audit, et le laissez-passer dure 7 jours.
      </p>

      <label className="field" data-testid="staff-plan-access-mode">
        <span>Mode d’entrée par code</span>
        <select
          value={accessMode}
          disabled={readOnly || savingKey === STAFF_KEYS.accessMode}
          onChange={(e) =>
            saveSetting(
              STAFF_KEYS.accessMode,
              e.target.value,
              e.target.value === 'code' ? 'Entrée par code activée' : 'Entrée par code désactivée',
            )
          }
        >
          <option value="disabled">Désactivée (compte uniquement)</option>
          <option value="code">Compte ou code partagé</option>
        </select>
      </label>

      <label className="field">
        <span>Profil endossé par un porteur de code</span>
        <select
          value={String(get(STAFF_KEYS.codeRoleSlug, 'personnel') || 'personnel')}
          disabled={readOnly || savingKey === STAFF_KEYS.codeRoleSlug}
          onChange={(e) =>
            saveSetting(STAFF_KEYS.codeRoleSlug, e.target.value, 'Profil du code enregistré')
          }
        >
          {(roles || []).map((role) => (
            <option key={role.slug} value={role.slug}>
              {role.label || role.display_name || role.slug}
            </option>
          ))}
        </select>
        <p className="muted" style={{ marginBottom: 0 }}>
          Un porteur de code n’a pas de compte, donc pas de profil : c’est celui-ci qui décide des
          lieux et des compléments réservés qu’il voit. Le laisser bas (« Personnel ») garde les
          lieux réservés à l’encadrement hors de sa portée.
        </p>
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
            disabled={readOnly || savingCode}
            style={{ flex: '1 1 12rem' }}
          />
          <Button variant="primary" disabled={readOnly || savingCode} onClick={saveAccessCode}>
            Enregistrer le code
          </Button>
          {hasHash ? (
            <Button variant="secondary" disabled={readOnly || savingCode} onClick={clearAccessCode}>
              Effacer le code
            </Button>
          ) : null}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Le code n’est jamais stocké en clair : seule une empreinte est enregistrée. Contrairement
          au plan public, le mode « code » <strong>sans</strong> empreinte ne laisse entrer personne
          — cette surface n’a pas de version publique acceptable.
        </p>
      </div>
    </div>
  );
}
