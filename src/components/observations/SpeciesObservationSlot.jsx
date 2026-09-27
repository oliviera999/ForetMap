import { useData } from '../../contexts/DataContext.jsx';
import { IconCheck } from '../../shared/icons.jsx';
import { SpeciesObservationActions } from './SpeciesObservationActions.jsx';
import { OBSERVATION_TEXTS as T } from './observationTexts.js';
import './speciesObservations.css';

/** Vrai si la présence de l'espèce sur la carte a été confirmée par une observation validée. */
export function isConfirmedOnSite(presenceEntry) {
  return String(presenceEntry?.validation_status || '') === 'confirme_site';
}

/**
 * Point de montage de la **fiche espèce** : pastille « Confirmée sur le site » quand un
 * enseignant a validé une observation de l'espèce sur la carte active (statut du registre
 * rendu par la présence commune, `GET /api/maps/:id/species`), puis les boutons
 * « Signaler une observation » et « Mes observations » (session requise).
 *
 * @param {object} props
 * @param {{ id: number, name?: string }|null} props.plant
 * @param {{ validation_status?: string|null }|null} [props.presenceEntry]
 * @param {string|null} [props.mapId] carte visée (défaut : la carte active)
 * @param {() => void} [props.onForceLogout]
 */
export function SpeciesObservationSlot({
  plant,
  presenceEntry = null,
  mapId = null,
  onForceLogout = null,
}) {
  const { activeMapId = null } = useData();
  if (!plant?.id) return null;
  const targetMapId = mapId || activeMapId || null;
  const confirmed = isConfirmedOnSite(presenceEntry);
  return (
    <div className="species-obs-slot" data-testid="species-obs-slot">
      {confirmed ? (
        <p style={{ margin: '8px 0 0' }}>
          <span className="species-obs-confirmed" title={T.confirmedOnSiteHint}>
            <IconCheck size={14} /> {T.confirmedOnSite}
          </span>
        </p>
      ) : null}
      <SpeciesObservationActions
        mapId={targetMapId}
        plant={{ id: Number(plant.id), name: plant.name || '' }}
        filterMineByPlant
        onForceLogout={onForceLogout}
      />
    </div>
  );
}
