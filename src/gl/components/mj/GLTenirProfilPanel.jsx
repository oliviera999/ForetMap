import { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

const SURFACES = [
  ['tableau', 'Tableau'],
  ['hybride', 'Hybride'],
  ['tablette', 'Tablette'],
];

/**
 * Bouton « Profil » de la console MJ (spec § 15) : profil `complet` / `prologue` d'un clic,
 * surface de la partie, et surcharges par partie (vent, voile, Marché, chapardeur, péripéties).
 * Tout passe par `PUT /api/gl/games/:id/tenir/profil` ; le serveur renvoie les réglages résolus.
 */
export function GLTenirProfilPanel({ gameId, tenir, onChanged, showFailure }) {
  const [profil, setProfil] = useState(tenir?.profil || 'complet');
  const [surface, setSurface] = useState(tenir?.surface || 'tableau');
  const [busy, setBusy] = useState(false);
  const overrides = tenir?.settings?.overrides || {};

  useEffect(() => {
    setProfil(tenir?.profil || 'complet');
    setSurface(tenir?.surface || 'tableau');
  }, [tenir?.profil, tenir?.surface]);

  if (!gameId || !tenir?.enabled) return null;

  async function save(next) {
    setBusy(true);
    try {
      await apiGL(`/api/gl/games/${gameId}/tenir/profil`, 'PUT', next);
      await onChanged?.();
    } catch (err) {
      showFailure?.(err.message || 'Profil non enregistré');
    } finally {
      setBusy(false);
    }
  }

  const flagRow = (key, label) => {
    const resolved = tenir?.settings?.[key];
    return (
      <label key={key} className="gl-gameplay-toggle-row">
        <input
          type="checkbox"
          checked={resolved !== false}
          disabled={busy}
          onChange={(event) => save({ overrides: { ...overrides, [key]: event.target.checked } })}
        />
        <span>
          {label}
          {key in overrides ? <small className="gl-hint"> (surcharge de la partie)</small> : null}
        </span>
      </label>
    );
  };

  return (
    <div className="gl-gameplay-block gl-tenir-profil" data-testid="gl-tenir-profil">
      <h3>Profil « Tenir à deux »</h3>
      <div className="gl-inline-actions">
        <label>
          Profil
          <select
            value={profil}
            disabled={busy}
            onChange={(event) => {
              setProfil(event.target.value);
              save({ profil: event.target.value });
            }}
          >
            <option value="complet">Complet</option>
            <option value="prologue">Prologue (pas de voile, de Marché ni de chapardeur)</option>
          </select>
        </label>
        <label>
          Surface
          <select
            value={surface}
            disabled={busy}
            onChange={(event) => {
              setSurface(event.target.value);
              save({ overrides: { ...overrides, surface: event.target.value } });
            }}
          >
            {SURFACES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {flagRow('vent', 'Vent de la caravane')}
      {flagRow('voile', 'Le voile')}
      {flagRow('marche', 'Marché')}
      {flagRow('chapardeur', 'Chapardeur')}
      {flagRow('peripeties', 'Péripéties')}
      {Object.keys(overrides).length ? (
        <GLButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => save({ overrides: {} })}
        >
          Revenir aux réglages du profil
        </GLButton>
      ) : null}
      <p className="gl-hint">
        Dés : {tenir?.settings?.des_mode_effectif || '—'} · Zones :{' '}
        {JSON.stringify(tenir?.settings?.zones_par_plateau || {})}
      </p>
    </div>
  );
}
