import { useState } from 'react';

import { AccessCodeField, AccessPassDaysField } from './AccessCodeField.jsx';
import { CategoryIdsMultiSelect } from './CategoryIdsMultiSelect.jsx';
import { MapIdsMultiSelect } from './MapIdsMultiSelect.jsx';
import { parseCategoryIdsSetting } from '../../utils/categoryIdsSetting.js';

const ENOV_KEYS = Object.freeze({
  title: 'ui.enov_plan.title',
  welcomeHint: 'ui.enov_plan.welcome_hint',
  attribution: 'ui.enov_plan.attribution',
  selectableMapIds: 'ui.enov_plan.selectable_map_ids',
  defaultCategoryIds: 'ui.enov_plan.default_category_ids',
  hiddenCategoryIds: 'ui.enov_plan.hidden_category_ids',
  highlightCategoryIds: 'ui.enov_plan.highlight_category_ids',
  highlightColor: 'ui.enov_plan.highlight_color',
  badgeEnabled: 'ui.enov_plan.badge_enabled',
  innovationsLabel: 'ui.enov_plan.innovations_label',
  accessMode: 'ui.enov_plan.access_mode',
});

/** Miroir de `ENOV_DEFAULT_HIGHLIGHT_COLOR` (`lib/enovPlan.js`). */
const DEFAULT_HIGHLIGHT_COLOR = '#faba38';

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Réglages du plan e-nov (`enov.*`, migration 315).
 *
 * Comme le plan des personnels, il n'a **pas** de réglage de carte : il montre la carte du
 * plan public (`ui.plan.map_id`). Ne se règlent ici que sa ligne éditoriale, sa porte
 * d'entrée (public ou code de diffusion propre) et la **mise en avant** des innovations —
 * quelles catégories, quelle couleur, pastille ou non.
 *
 * Un lieu ressort sur ce plan parce qu'il porte une catégorie de mise en avant (par défaut la
 * catégorie « e-nov ») ; son texte e-nov se saisit dans sa fiche (onglet Modifier).
 *
 * @param {object} props
 * @param {Array<{ id: string, label?: string, is_active?: number|boolean }>} [props.maps]
 * @param {(key: string, fallback?: unknown) => unknown} props.get
 * @param {(key: string, value: unknown, okMsg?: string) => Promise<void>} props.saveSetting
 * @param {string} [props.savingKey]
 * @param {boolean} [props.canWrite]
 * @param {(msg: string) => void} [props.onMessage]
 * @param {(msg: string) => void} [props.onError]
 */
export function EnovPlanSettingsPanel({
  maps = [],
  get,
  saveSetting,
  savingKey = '',
  canWrite = true,
  onMessage = null,
  onError = null,
}) {
  /**
   * Couleur en cours de choix : le sélecteur émet un événement à chaque déplacement du
   * curseur, on n'enregistre qu'à la sortie du champ (sinon une écriture par pixel parcouru).
   */
  const [colorDraft, setColorDraft] = useState(null);
  const hasHash = Boolean(String(get('security.enov_plan_access_code_hash', '') || '').trim());
  const accessMode = String(get(ENOV_KEYS.accessMode, 'public') || 'public');
  const storedColor = String(get(ENOV_KEYS.highlightColor, DEFAULT_HIGHLIGHT_COLOR) || '');
  const highlightColor = HEX_COLOR_RE.test(storedColor) ? storedColor : DEFAULT_HIGHLIGHT_COLOR;
  const readOnly = !canWrite;

  return (
    <div className="plan-settings-panel" data-testid="enov-plan-settings-panel">
      <p className="muted" style={{ marginTop: 0 }}>
        Le plan e-nov (enov) affiche la <strong>même carte</strong> que le plan public, et y fait
        ressortir les lieux labellisés : halo coloré, autres lieux estompés, puce « Innovations »
        qui les liste. Un lieu est mis en avant s’il porte une des catégories choisies ci-dessous
        (par défaut « e-nov », visible sur ce seul plan) ; son texte e-nov se saisit dans sa fiche,
        onglet <em>Modifier</em>, et s’affiche en tête de fiche.
      </p>

      <h4 style={{ margin: '0 0 4px' }}>Mise en avant des innovations</h4>

      <CategoryIdsMultiSelect
        label="Catégories mises en avant"
        value={get(ENOV_KEYS.highlightCategoryIds, 'cat-enov')}
        disabled={readOnly || savingKey === ENOV_KEYS.highlightCategoryIds}
        hint="Les lieux de ces catégories ressortent sur le plan e-nov. Sélection multiple — enregistrée immédiatement."
        testId="enov-plan-highlight-category-ids"
        requireSurface="enov"
        onSave={(next) =>
          saveSetting(
            ENOV_KEYS.highlightCategoryIds,
            next,
            'Catégories mises en avant enregistrées',
          )
        }
      />

      <label className="field" data-testid="enov-plan-highlight-color">
        <span>Couleur du halo</span>
        <input
          type="color"
          value={colorDraft ?? highlightColor}
          disabled={readOnly || savingKey === ENOV_KEYS.highlightColor}
          onChange={(e) => setColorDraft(e.target.value)}
          onBlur={() => {
            if (colorDraft && colorDraft !== highlightColor) {
              saveSetting(ENOV_KEYS.highlightColor, colorDraft, 'Couleur du halo enregistrée');
            }
            setColorDraft(null);
          }}
          style={{ width: 64, height: 44, padding: 2 }}
        />
        <p className="muted" style={{ marginBottom: 0 }}>
          Préférez une couleur vive et claire : la pastille et la puce écrivent en sombre dessus.
        </p>
      </label>

      <label
        className="field"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        data-testid="enov-plan-badge-setting"
      >
        <input
          type="checkbox"
          checked={Boolean(get(ENOV_KEYS.badgeEnabled, false))}
          disabled={readOnly || savingKey === ENOV_KEYS.badgeEnabled}
          onChange={(e) =>
            saveSetting(
              ENOV_KEYS.badgeEnabled,
              e.target.checked,
              e.target.checked ? 'Pastille « e-nov » activée' : 'Pastille « e-nov » désactivée',
            )
          }
        />
        <span>
          Afficher une pastille « e-nov » à côté des lieux mis en avant (en plus du halo).
        </span>
      </label>

      <label className="field">
        <span>Intitulé de la liste des innovations</span>
        <input
          type="text"
          maxLength={40}
          defaultValue={String(get(ENOV_KEYS.innovationsLabel, 'Innovations') || '')}
          disabled={readOnly || savingKey === ENOV_KEYS.innovationsLabel}
          onBlur={(e) =>
            saveSetting(ENOV_KEYS.innovationsLabel, e.target.value, 'Intitulé enregistré')
          }
        />
      </label>

      <hr />

      <label className="field">
        <span>Titre</span>
        <input
          type="text"
          maxLength={120}
          defaultValue={String(get(ENOV_KEYS.title, '') || '')}
          disabled={readOnly || savingKey === ENOV_KEYS.title}
          onBlur={(e) => saveSetting(ENOV_KEYS.title, e.target.value, 'Titre enregistré')}
        />
      </label>

      <label className="field">
        <span>Message d’accueil</span>
        <textarea
          rows={2}
          maxLength={400}
          defaultValue={String(get(ENOV_KEYS.welcomeHint, '') || '')}
          disabled={readOnly || savingKey === ENOV_KEYS.welcomeHint}
          onBlur={(e) =>
            saveSetting(ENOV_KEYS.welcomeHint, e.target.value, 'Message d’accueil enregistré')
          }
        />
      </label>

      <label className="field">
        <span>Mention en pied de page</span>
        <input
          type="text"
          maxLength={240}
          defaultValue={String(get(ENOV_KEYS.attribution, '') || '')}
          disabled={readOnly || savingKey === ENOV_KEYS.attribution}
          onBlur={(e) => saveSetting(ENOV_KEYS.attribution, e.target.value, 'Mention enregistrée')}
        />
      </label>

      <MapIdsMultiSelect
        label="Autres plans proposés"
        value={get(ENOV_KEYS.selectableMapIds, '')}
        maps={maps}
        disabled={readOnly || savingKey === ENOV_KEYS.selectableMapIds}
        hint="La carte d’accueil reste celle du plan public. Seules les cartes déclarées ici peuvent s’ouvrir sur le plan e-nov."
        testId="enov-plan-selectable-map-ids"
        onSave={(next) =>
          saveSetting(ENOV_KEYS.selectableMapIds, next, 'Plans proposés enregistrés')
        }
      />

      <CategoryIdsMultiSelect
        label="Catégories cochées d’office"
        value={get(ENOV_KEYS.defaultCategoryIds, '')}
        disabled={readOnly || savingKey === ENOV_KEYS.defaultCategoryIds}
        hint="Sélection multiple — enregistrée immédiatement. Vide = tout afficher à l’ouverture."
        testId="enov-plan-default-category-ids"
        requireSurface="enov"
        excludeIds={parseCategoryIdsSetting(get(ENOV_KEYS.hiddenCategoryIds, ''))}
        onSave={(next) =>
          saveSetting(ENOV_KEYS.defaultCategoryIds, next, 'Catégories par défaut enregistrées')
        }
      />

      <CategoryIdsMultiSelect
        label="Catégories masquées"
        value={get(ENOV_KEYS.hiddenCategoryIds, '')}
        disabled={readOnly || savingKey === ENOV_KEYS.hiddenCategoryIds}
        hint="Retirées des filtres, et les lieux qui n’appartenaient qu’à elles disparaissent du plan. Masquer la catégorie e-nov des filtres n’éteint pas la mise en avant."
        testId="enov-plan-hidden-category-ids"
        requireSurface="enov"
        excludeIds={parseCategoryIdsSetting(get(ENOV_KEYS.defaultCategoryIds, ''))}
        onSave={(next) =>
          saveSetting(ENOV_KEYS.hiddenCategoryIds, next, 'Catégories masquées enregistrées')
        }
      />

      <hr />

      <h4 style={{ margin: '0 0 4px' }}>Accès</h4>

      <label className="field" data-testid="enov-plan-access-mode">
        <span>Mode d’accès</span>
        <select
          value={accessMode}
          disabled={readOnly || savingKey === ENOV_KEYS.accessMode}
          onChange={(e) =>
            saveSetting(
              ENOV_KEYS.accessMode,
              e.target.value,
              'Mode d’accès du plan e-nov enregistré',
            )
          }
        >
          <option value="public">Public</option>
          <option value="code">Code d’accès</option>
        </select>
      </label>

      <AccessPassDaysField
        settingKey="security.enov_plan_access_pass_days"
        defaultDays={30}
        maxDays={90}
        get={get}
        saveSetting={saveSetting}
        savingKey={savingKey}
        readOnly={readOnly}
        testId="enov-plan-access-pass-days"
      />

      <AccessCodeField
        endpoint="/api/settings/admin/enov-plan-access-code"
        targetLabel="du plan e-nov"
        hasCode={hasHash}
        readOnly={readOnly}
        onMessage={onMessage}
        onError={onError}
        testId="enov-plan-access-code"
      >
        Code propre au plan e-nov : il n’ouvre pas le plan public, et inversement. Il n’est jamais
        stocké en clair. En mode « code » sans code défini, le plan reste ouvert. Le lien du plan
        peut porter le code (<code>?code=…</code>) pour un QR code remis à un jury.
      </AccessCodeField>
    </div>
  );
}
