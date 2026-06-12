import React, { useState, useEffect } from 'react';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from '../DialogShell';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { ContextComments } from '../context-comments';
import { CatalogRemarksSection } from '../map-views';
import {
  PlantSpeciesDiscoveryAcknowledgeButton,
  fetchPlantObservationCounts,
} from '../PlantSpeciesDiscoveryAcknowledge';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import { normalizedPlantValue, isGenericPotagerLabel } from '../../utils/plantFormValues.js';
import { plantLinkedToMapMarker, plantLinkedToMapZone } from '../../utils/plantFilters';
import { PlantSummaryBadges, PlantEcosystemHumanLead } from './PlantSummaryBlocks.jsx';
import { PlantBiodivHeroPhoto, PlantMetaSections } from './PlantMetaSections.jsx';
import { PlantLocationPreviewMaps } from './BiodivLocationMaps.jsx';

/**
 * Carte fiche biodiversité (lecture seule), même contenu que le catalogue élève — réutilisée dans
 * le viewer et la modale d’aperçu (comme les tutoriels). Extraite de `foretmap-views.jsx` (O6).
 */
export function PlantBiodiversityCatalogPreviewCard({
  plant,
  zones = [],
  markers = [],
  maps = [],
  myObservationCount = 0,
  siteObservationCount = 0,
  onObservationAcknowledged = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onForceLogout = null,
  showContextComments = true,
  dataBiodivPlantId = null,
}) {
  if (!plant) return null;
  const pZones = zones.filter((z) => plantLinkedToMapZone(plant, z));
  const pMarkers = markers.filter((m) => plantLinkedToMapMarker(plant, m));
  const hasMapLink = pZones.length > 0 || pMarkers.length > 0;
  const dataAttr = dataBiodivPlantId != null && dataBiodivPlantId !== ''
    ? { 'data-biodiv-plant-id': dataBiodivPlantId }
    : {};
  return (
    <article className="biodiv-card fade-in" {...dataAttr}>
      <div className="biodiv-card-head">
        <div className="biodiv-card-title-wrap">
          <span className="biodiv-emoji">{plant.emoji}</span>
          <div className="biodiv-card-title-content">
            <h3>{plant.name}</h3>
            <p className="plant-scientific">
              {normalizedPlantValue(plant.scientific_name) || 'Nom scientifique non renseigne'}
            </p>
          </div>
        </div>
        {normalizedPlantValue(plant.group_2) && (
          <span className="task-chip">{plant.group_2}</span>
        )}
      </div>

      <div className="biodiv-card-body">
        {plant.description ? (
          <MarkdownContent className="plant-row-desc">{plant.description}</MarkdownContent>
        ) : (
          <p className="plant-row-desc"><em style={{ color: '#bbb' }}>Pas de description</em></p>
        )}
        <PlantBiodivHeroPhoto plant={plant} />
        <PlantEcosystemHumanLead plant={plant} />
        <CatalogRemarksSection plant={plant} />
        <div className="task-meta">
          {normalizedPlantValue(plant.habitat) && !isGenericPotagerLabel(plant.habitat) && (
            <span className="task-chip">🏡 {plant.habitat}</span>
          )}
          {normalizedPlantValue(plant.agroecosystem_category) && !isGenericPotagerLabel(plant.agroecosystem_category) && (
            <span className="task-chip">🌍 {plant.agroecosystem_category}</span>
          )}
        </div>
        <PlantSummaryBadges plant={plant} />
        <PlantMetaSections plant={plant} />
        {hasMapLink ? (
          <div>
            <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>Sur la carte</div>
            <PlantLocationPreviewMaps maps={maps} zones={pZones} markers={pMarkers} />
            <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', margin: '10px 0 4px' }}>Zones et repères</div>
            <div className="plant-zones">
              {pZones.map((z) => (
                <span key={`zone-${z.id}`} className="plant-zone-chip">📍 {z.name}</span>
              ))}
              {pMarkers.map((m) => (
                <span key={`marker-${m.id}`} className="plant-zone-chip">📌 {m.label?.trim() ? m.label : 'Repère'}</span>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '.82rem', color: '#bbb', fontStyle: 'italic' }}>Pas encore associé à une zone ni à un repère sur la carte</p>
        )}
        <div className="plant-discovery-ack-row" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <PlantSpeciesDiscoveryAcknowledgeButton
            plantId={plant.id}
            speciesName={plant.name}
            myObservationCount={myObservationCount}
            siteObservationCount={siteObservationCount}
            offerPlantCommentAfterObservation={contextCommentsEnabled && canParticipateContextComments}
            onAcknowledged={(id, next) => {
              onObservationAcknowledged?.(id, next);
            }}
            onForceLogout={onForceLogout}
          />
        </div>
        {showContextComments && contextCommentsEnabled && (
          <ContextComments
            contextType="plant"
            contextId={String(plant.id)}
            title="Commentaires sur cette fiche"
            placeholder="Remarque ou question sur cet être vivant…"
            canParticipateContextComments={canParticipateContextComments}
          />
        )}
      </div>
    </article>
  );
}

/** Aperçu plein écran (portal) d’une fiche catalogue — même principe que `TutorialPreviewModal`. */
export function PlantCatalogPreviewModal({
  plant,
  maps = [],
  onClose,
  onForceLogout = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { zones = [], markers = [] } = useData();
  useOverlayHistoryBack(!!plant, onClose);
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [obs, setObs] = useState({ my: 0, site: 0 });

  useEffect(() => {
    if (!plant?.id) {
      setObs({ my: 0, site: 0 });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const map = await fetchPlantObservationCounts([plant.id]);
      const row = map[String(plant.id)] || map[plant.id];
      if (cancelled || !row) return;
      setObs({
        my: Number(row.my_observation_count) || 0,
        site: Number(row.site_observation_count) || 0,
      });
    })();
    return () => { cancelled = true; };
  }, [plant?.id]);

  if (!plant) return null;
  return (
    <DialogShell
      open={!!plant}
      onClose={onClose}
      overlayClassName="modal-overlay modal-overlay--tuto-preview"
      dialogClassName="log-modal tuto-preview-modal"
      ariaLabelledBy="plant-catalog-preview-title"
      closeOnOverlay
    >
      <div className="tuto-preview-modal__head">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer l’aperçu">✕</button>
        <h3 id="plant-catalog-preview-title">🌱 {plant.name}</h3>
      </div>
      <div className="tuto-preview-modal__body tuto-preview-modal__body--biodiv-scroll">
        <PlantBiodiversityCatalogPreviewCard
          plant={plant}
          zones={zones}
          markers={markers}
          maps={maps}
          myObservationCount={obs.my}
          siteObservationCount={obs.site}
          onObservationAcknowledged={(_id, next) => {
            setObs({
              my: Number(next.my_observation_count) || 0,
              site: Number(next.site_observation_count) || 0,
            });
          }}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          onForceLogout={onForceLogout}
          showContextComments
          dataBiodivPlantId={null}
        />
      </div>
    </DialogShell>
  );
}
