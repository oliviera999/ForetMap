import { useState } from 'react';
import { getAuthToken } from '../../services/api';
import { useData } from '../../contexts/DataContext.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { useOverlayHistoryBack } from '../../shared/platform/useOverlayHistoryBack';
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import { IconCamera, IconNotebook } from '../../shared/icons.jsx';
import { DialogShell } from '../DialogShell';
import { SpeciesObservationForm } from './SpeciesObservationForm.jsx';
import { MySpeciesObservations } from './MySpeciesObservations.jsx';
import { OBSERVATION_TEXTS as T } from './observationTexts.js';
import './speciesObservations.css';

/**
 * Boutons « Signaler une observation » et « Mes observations », avec leurs fenêtres.
 * Rien sans session (visite publique), ni module éteint (sauf pour le validateur) ; le
 * signalement est masqué aux profils privés de participation (« Visiteur »), que le serveur
 * refuse de toute façon.
 *
 * @param {object} props
 * @param {string|null} props.mapId carte de l'observation (rien sans carte)
 * @param {{ id: number, name?: string }|null} [props.plant] espèce présélectionnée
 * @param {{ kind: 'zone'|'marker', id: string, label?: string }|null} [props.place] lieu présélectionné
 * @param {string} [props.reportLabel]
 * @param {boolean} [props.filterMineByPlant] « Mes observations » limitées à l'espèce
 * @param {() => void} [props.onForceLogout]
 */
export function SpeciesObservationActions({
  mapId,
  plant = null,
  place = null,
  reportLabel = T.reportButton,
  filterMineByPlant = false,
  onForceLogout = null,
}) {
  const { plants = [], zones = [], markers = [] } = useData();
  const { canParticipateContextComments = true, hasPermission = null } = useSession();
  const publicSettings = usePublicSettings();
  const [formOpen, setFormOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [toast, setToast] = useState('');
  const closeForm = () => setFormOpen(false);
  const closeMine = () => setMineOpen(false);
  useOverlayHistoryBack(formOpen, closeForm);
  useOverlayHistoryBack(mineOpen, closeMine);

  const hasSession = typeof getAuthToken === 'function' && !!getAuthToken();
  if (!hasSession || !mapId) return null;
  // Interrupteur `ui.modules.species_observations_enabled` : éteint, seul le validateur garde
  // les boutons (le serveur répond 503 aux autres).
  const moduleOn = publicSettings?.modules?.species_observations_enabled !== false;
  const isValidator =
    typeof hasPermission === 'function' && Boolean(hasPermission('observations.validate'));
  if (!moduleOn && !isValidator) return null;
  const canReport = canParticipateContextComments !== false;
  const titleSuffix = plant?.name ? ` — ${plant.name}` : place?.label ? ` — ${place.label}` : '';

  return (
    <>
      {toast ? <TimedToast msg={toast} onDone={() => setToast('')} durationMs={3600} /> : null}
      <div className="species-obs-actions" data-testid="species-obs-actions">
        {canReport ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setFormOpen(true)}
          >
            <IconCamera size={14} /> {reportLabel}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMineOpen(true)}>
          <IconNotebook size={14} /> {T.myObservationsButton}
        </button>
      </div>
      <DialogShell
        open={formOpen}
        onClose={closeForm}
        dialogClassName="log-modal fade-in species-obs-dialog"
        ariaLabelledBy="species-obs-form-title"
        showCloseButton
        closeOnOverlay={false}
      >
        <h3 id="species-obs-form-title">
          {T.formTitle}
          {titleSuffix}
        </h3>
        {formOpen ? (
          <SpeciesObservationForm
            mapId={mapId}
            plants={plants}
            zones={zones}
            markers={markers}
            initialPlantId={plant?.id ?? null}
            initialPlace={place ? { kind: place.kind, id: place.id } : null}
            onCancel={closeForm}
            onForceLogout={onForceLogout}
            onDone={(outcome) => {
              setFormOpen(false);
              setToast(outcome?.message || T.sent);
            }}
          />
        ) : null}
      </DialogShell>
      <DialogShell
        open={mineOpen}
        onClose={closeMine}
        dialogClassName="log-modal fade-in species-obs-dialog"
        ariaLabelledBy="species-obs-mine-title"
        showCloseButton
      >
        <h3 id="species-obs-mine-title">
          {T.myListTitle}
          {filterMineByPlant && plant?.name ? ` — ${plant.name}` : ''}
        </h3>
        {mineOpen ? (
          <MySpeciesObservations
            plantId={filterMineByPlant ? (plant?.id ?? null) : null}
            onForceLogout={onForceLogout}
          />
        ) : null}
      </DialogShell>
    </>
  );
}
