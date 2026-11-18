import { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

const SURFACES = [
  ['tableau', 'Tableau'],
  ['hybride', 'Hybride'],
  ['tablette', 'Tablette'],
];

/** Ce qu'une marche de l'escalier ouvre, dit au prof (jamais montré à un élève). */
const MODULES_ESCALIER = Object.freeze({
  avancer: 'avancer',
  chercher: 'chercher',
  defi_case: 'le défi de case',
  trame: 'les défis de la Trame',
  tenir: 'tenir une page',
  erreur_du_jour: 'l’erreur du jour d’Olu',
  voile: 'le voile',
  page_temoin: 'la page témoin',
  sorts: 'trois sorts',
  lumiere: 'la jauge de Lumière',
  marche: 'le Marché, trois sorts de plus',
});

/** Réglage de la partie → module de l'escalier qui le tient fermé tant qu'il n'est pas ouvert. */
const MODULE_DU_REGLAGE = Object.freeze({ voile: 'voile', marche: 'marche' });

/**
 * Bouton « Profil » de la console MJ (spec § 15) : profil `complet` / `court` d'un clic,
 * surface de la partie, surcharges par partie (vent, voile, Marché, chapardeur, péripéties), et
 * l'escalier du chapitre 1 (ensemble unifié, M8) : où la classe en est, « Ouvrir la suite », ou
 * le couper. Tout passe par `PUT /api/gl/games/:id/tenir/profil` et
 * `POST /tenir/escalier/suite` ; le serveur renvoie les réglages résolus.
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

  const escalier = tenir?.escalier || null;
  // L'escalier a sa propre case à cocher : « Revenir aux réglages du profil » n'y touche pas
  // (une partie du plateau 1 porte toujours `escalier` dans ses surcharges ; les vider toutes
  // ouvrait d'un coup le voile, le Marché et les sorts).
  const surchargesHorsEscalier = Object.keys(overrides).filter(
    (k) => k !== 'escalier' && k !== 'escalier_pas',
  );

  async function ouvrirLaSuite() {
    setBusy(true);
    try {
      // La séance affichée part avec la demande : un double appui n'ouvre pas deux marches.
      await apiGL(`/api/gl/games/${gameId}/tenir/escalier/suite`, 'POST', {
        pas: escalier?.pas ?? null,
      });
      await onChanged?.();
    } catch (err) {
      showFailure?.(err.message || 'La suite ne s’est pas ouverte');
    } finally {
      setBusy(false);
    }
  }

  const flagRow = (key, label) => {
    const resolved = tenir?.settings?.[key];
    // Un réglage que l'escalier n'a pas encore ouvert ne se coche pas ici : il s'ouvrira seul.
    const moduleFerme =
      escalier && MODULE_DU_REGLAGE[key] && !escalier.modules.includes(MODULE_DU_REGLAGE[key])
        ? MODULE_DU_REGLAGE[key]
        : null;
    return (
      <label key={key} className="gl-gameplay-toggle-row">
        <input
          type="checkbox"
          checked={resolved !== false}
          disabled={busy || !!moduleFerme}
          onChange={(event) => save({ overrides: { ...overrides, [key]: event.target.checked } })}
        />
        <span>
          {label}
          {moduleFerme ? (
            <small className="gl-hint"> (pas encore ouvert par l’escalier)</small>
          ) : key in overrides ? (
            <small className="gl-hint"> (surcharge de la partie)</small>
          ) : null}
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
            <option value="court">Court (Marché et lecture en veillée)</option>
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
      <div className="gl-tenir-escalier" data-testid="gl-tenir-escalier">
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={!!escalier}
            disabled={busy}
            onChange={(event) =>
              save({ overrides: { ...overrides, escalier: event.target.checked } })
            }
            data-testid="gl-tenir-escalier-actif"
          />
          <span>
            Escalier du chapitre 1 : les règles s’ouvrent séance après séance
            {escalier ? (
              <small className="gl-hint" data-testid="gl-tenir-escalier-pas">
                {' '}
                (séance {escalier.pas} sur {escalier.dernier}
                {escalier.monte ? ' : tout est ouvert' : ''})
              </small>
            ) : null}
          </span>
        </label>
        {escalier?.prochaine ? (
          <p className="gl-hint">
            À la séance {escalier.prochaine.seance} s’ouvriront :{' '}
            {escalier.prochaine.modules.map((m) => MODULES_ESCALIER[m] || m).join(', ')}.{' '}
            <GLButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={ouvrirLaSuite}
              data-testid="gl-tenir-escalier-suite"
            >
              Ouvrir la suite
            </GLButton>
          </p>
        ) : null}
      </div>
      {flagRow('vent', 'Vent de la caravane')}
      {flagRow('voile', 'Le voile')}
      {flagRow('marche', 'Marché')}
      {flagRow('chapardeur', 'Chapardeur')}
      {flagRow('peripeties', 'Péripéties')}
      {surchargesHorsEscalier.length ? (
        <GLButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => save({ overrides: overrides.escalier === true ? { escalier: true } : {} })}
          data-testid="gl-tenir-profil-revenir"
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
