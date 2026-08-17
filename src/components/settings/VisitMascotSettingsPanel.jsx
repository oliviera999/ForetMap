import React, { useCallback, useEffect, useMemo, useState } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { parseVisitMascotAllowedIds } from '../../utils/visitViewStatus.js';
import {
  registryMascotIds,
  isMascotProposed,
  toggleProposedMascotId,
  chooseDefaultMascotId,
  findOrphanMascotIds,
} from '../../utils/visitMascotAdminSelection.js';
import useVisitMascotCatalogExtras, {
  invalidateVisitMascotCatalogExtras,
} from '../../hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../services/api';

const ALLOWED_KEY = 'ui.visit.mascot.allowed_ids';
const DEFAULT_KEY = 'ui.visit.mascot.default_id';

/**
 * Réglage des mascottes de visite, en remplacement des deux champs texte bruts
 * (`ui.visit.mascot.allowed_ids` / `default_id`) qui obligeaient l'admin à saisir des
 * identifiants à la main.
 *
 * Une seule liste : mascottes livrées avec l'application **et** packs publiés au studio,
 * traités à égalité (`GET /api/visit/mascots`). Une case « proposée aux visiteurs » par
 * mascotte, un bouton radio pour la mascotte par défaut — celle-ci s'applique à **toutes
 * les cartes**, chaque utilisateur restant libre d'en changer.
 *
 * @param {string|string[]} allowedValue valeur courante de `ui.visit.mascot.allowed_ids`.
 * @param {string} defaultValue valeur courante de `ui.visit.mascot.default_id`.
 * @param {(key: string, value: string) => Promise<unknown>} onSave persistance d'un réglage.
 */
export function VisitMascotSettingsPanel({ allowedValue, defaultValue, onSave }) {
  const packExtras = useVisitMascotCatalogExtras();
  const [registry, setRegistry] = useState([]);
  const [registryError, setRegistryError] = useState('');
  const [allowedIds, setAllowedIds] = useState(() => parseVisitMascotAllowedIds(allowedValue));
  const [defaultId, setDefaultId] = useState(() => String(defaultValue || '').trim());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    setAllowedIds(parseVisitMascotAllowedIds(allowedValue));
  }, [allowedValue]);
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
  const unrestricted = allowedIds.length === 0;
  const orphanIds = useMemo(
    () => findOrphanMascotIds(registryIds, allowedIds, defaultId),
    [registryIds, allowedIds, defaultId],
  );

  const onToggleProposed = (id) => {
    setSavedMsg('');
    setAllowedIds((prev) => toggleProposedMascotId(prev, registryIds, id));
  };

  const onChooseDefault = (id) => {
    setSavedMsg('');
    const next = chooseDefaultMascotId(allowedIds, id);
    setDefaultId(next.defaultId);
    setAllowedIds(next.allowedIds);
  };

  const save = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await onSave(ALLOWED_KEY, allowedIds.join(','));
      await onSave(DEFAULT_KEY, defaultId);
      setSavedMsg('Réglages mascottes enregistrés.');
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
      <p style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 10, lineHeight: 1.45 }}>
        Les mascottes livrées avec l’application et les packs publiés au studio figurent dans la
        même liste. La mascotte <strong>par défaut</strong> s’applique à toutes les cartes ; chaque
        utilisateur peut en changer depuis la visite ou son profil.
      </p>

      {registryError ? <div className="auth-error">⚠️ {registryError}</div> : null}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          className={`btn btn-sm ${unrestricted ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setSavedMsg('');
            setAllowedIds([]);
          }}
          disabled={unrestricted}
        >
          Proposer toutes les mascottes
        </button>
        <span style={{ fontSize: '.8rem', color: '#6b7280' }}>
          {unrestricted
            ? 'Aucune restriction : toute nouvelle mascotte est proposée automatiquement.'
            : `${allowedIds.length} mascotte(s) proposée(s) aux visiteurs.`}
        </span>
      </div>

      <div className="visit-mascot-admin-grid" data-testid="visit-mascot-admin-grid">
        {registry.map((entry) => {
          const id = String(entry?.id || '').trim();
          const proposed = isMascotProposed(allowedIds, id);
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
                <div className="visit-mascot-admin-card__source">
                  {entry.source === 'pack' ? 'Pack publié' : 'Livrée avec l’app'}
                </div>
                <label className="visit-mascot-admin-card__check">
                  <input
                    type="checkbox"
                    checked={proposed}
                    onChange={() => onToggleProposed(id)}
                    aria-label={`Proposer ${entry.label || id} aux visiteurs`}
                  />
                  <span>Proposée</span>
                </label>
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
        <p style={{ fontSize: '.8rem', color: '#b45309', marginTop: 8 }}>
          ⚠️ Identifiants réglés mais introuvables dans le registre (pack dépublié ou supprimé) :{' '}
          <code>{orphanIds.join(', ')}</code>. Les visiteurs voient alors la mascotte livrée par
          défaut.
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
          title="Recharger les packs publiés"
        >
          Actualiser
        </button>
        {savedMsg ? <span className="auth-success">{savedMsg}</span> : null}
      </div>
    </div>
  );
}

export default VisitMascotSettingsPanel;
