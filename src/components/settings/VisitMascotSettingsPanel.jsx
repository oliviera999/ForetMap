import { useCallback, useEffect, useMemo, useState } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { registryMascotIds, findOrphanMascotIds } from '../../utils/visitMascotAdminSelection.js';
import useVisitMascotCatalogExtras, {
  invalidateVisitMascotCatalogExtras,
} from '../../hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../services/api';

const DEFAULT_KEY = 'ui.visit.mascot.default_id';

/**
 * Réglage des mascottes de visite : **la mascotte par défaut**, et rien d'autre.
 *
 * Ce panneau portait aussi une case « proposée aux visiteurs » par mascotte, qui écrivait
 * `ui.visit.mascot.allowed_ids`. Ce réglage était une liste blanche d'identifiants : dès qu'on
 * en décochait une, la liste se figeait sur les mascottes existant ce jour-là, et toute mascotte
 * ajoutée ensuite — un pack importé — en était absente, donc invisible sans que rien ne le dise.
 *
 * Depuis l'étape 3 de la fusion catalogue / packs, « proposée aux visiteurs » est **l'état de
 * publication de la mascotte**, réglé au studio là où on la modifie. La liste ci-dessous le
 * montre, mais ne l'édite plus : un seul endroit pour un seul geste, et plus de liste à tenir
 * à jour à la main. Voir `lib/visitMascotVisibility.js`.
 *
 * @param {string} defaultValue valeur courante de `ui.visit.mascot.default_id`.
 * @param {(key: string, value: string) => Promise<unknown>} onSave persistance d'un réglage.
 */
export function VisitMascotSettingsPanel({ defaultValue, onSave }) {
  const packExtras = useVisitMascotCatalogExtras();
  const [registry, setRegistry] = useState([]);
  const [registryError, setRegistryError] = useState('');
  const [defaultId, setDefaultId] = useState(() => String(defaultValue || '').trim());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    setDefaultId(String(defaultValue || '').trim());
  }, [defaultValue]);

  const loadRegistry = useCallback(async () => {
    try {
      const res = await api('/api/visit/mascots');
      setRegistry(Array.isArray(res?.mascots) ? res.mascots : []);
      setRegistryError('');
    } catch (e) {
      setRegistryError(e?.message || 'Liste des mascottes indisponible');
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const registryIds = useMemo(() => registryMascotIds(registry), [registry]);
  // Le registre ne liste que les mascottes proposées : un défaut absent d'ici est un défaut
  // orphelin (mascotte dépubliée ou supprimée), et les visiteurs retombent sur la livrée.
  const orphanIds = useMemo(
    () => findOrphanMascotIds(registryIds, [], defaultId),
    [registryIds, defaultId],
  );

  const onChooseDefault = (id) => {
    setSavedMsg('');
    setDefaultId(String(id || '').trim());
  };

  const save = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await onSave(DEFAULT_KEY, defaultId);
      setSavedMsg('Mascotte par défaut enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setSavedMsg('');
    invalidateVisitMascotCatalogExtras();
    await loadRegistry();
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
      }}
    >
      <h3 style={{ marginTop: 0 }}>🦊 Mascottes de visite</h3>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          marginBottom: 10,
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Voici les mascottes <strong>proposées aux visiteurs</strong>. La mascotte{' '}
        <strong>par défaut</strong> s’applique à toutes les cartes ; chaque utilisateur peut en
        changer depuis la visite ou son profil.
        <br />
        Pour en proposer une de plus ou en retirer une, ouvrez-la dans le{' '}
        <strong>studio mascotte</strong> et publiez-la ou retirez-la de la visite. Toute mascotte
        publiée est proposée, y compris celles ajoutées plus tard.
      </p>

      {registryError ? <div className="auth-error">⚠️ {registryError}</div> : null}

      <div className="visit-mascot-admin-grid" data-testid="visit-mascot-admin-grid">
        {registry.map((entry) => {
          const id = String(entry?.id || '').trim();
          return (
            <div
              key={id}
              className={`visit-mascot-admin-card${defaultId === id ? ' is-default' : ''}`}
            >
              <div className="visit-mascot-admin-card__preview" aria-hidden="true">
                <VisitMapMascotRenderer
                  mascotId={id}
                  mascotState={VISIT_MASCOT_STATE.IDLE}
                  extraCatalogEntries={packExtras}
                />
              </div>
              <div className="visit-mascot-admin-card__body">
                <div className="visit-mascot-admin-card__label">{entry.label || id}</div>
                <div className="visit-mascot-admin-card__source">Proposée aux visiteurs</div>
                <label className="visit-mascot-admin-card__check">
                  <input
                    type="radio"
                    name="visit-mascot-default"
                    checked={defaultId === id}
                    onChange={() => onChooseDefault(id)}
                    aria-label={`Définir ${entry.label || id} comme mascotte par défaut`}
                  />
                  <span>Par défaut</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {orphanIds.length > 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: '#b45309', marginTop: 8 }}>
          ⚠️ La mascotte par défaut n’est pas proposée aux visiteurs (
          <code>{orphanIds.join(', ')}</code>) : elle a été retirée de la visite ou supprimée. Les
          visiteurs voient la mascotte livrée par défaut. Republiez-la au studio, ou choisissez-en
          une autre ci-dessus.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={refresh}
          disabled={saving}
          title="Recharger la liste des mascottes proposées"
        >
          Actualiser
        </button>
        {savedMsg ? <span className="auth-success">{savedMsg}</span> : null}
      </div>
    </div>
  );
}

export default VisitMascotSettingsPanel;
