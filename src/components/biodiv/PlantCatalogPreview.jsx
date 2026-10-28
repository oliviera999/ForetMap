import { useState, useEffect, useMemo } from 'react';
import { DialogShell } from '../DialogShell';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { ContextComments } from '../context-comments';
import { CatalogRemarksSection } from '../map-views';
import {
  PlantSpeciesDiscoveryAcknowledgeButton,
  fetchPlantObservationCounts,
} from '../PlantSpeciesDiscoveryAcknowledge';
import { api, getAuthToken } from '../../services/api';
import { useGatingSummary } from '../../hooks/useGatingSummary';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import { plantHasUnconfirmedPhotos } from '../../utils/plantPhotos.js';
import { normalizedPlantValue, isGenericPotagerLabel } from '../../utils/plantFormValues.js';
import { plantLinkedToMapMarker, plantLinkedToMapZone } from '../../utils/plantFilters';
import { describePresenceSources, presenceEntryForPlant } from '../../utils/speciesPresence.js';
import { useMapSpeciesPresence } from '../../hooks/useMapSpeciesPresence.js';
import {
  PlantSummaryBadges,
  PlantEcosystemHumanLead,
  PlantTaxonomyLine,
  PlantSiteNotesBlock,
  PlantPedagoTraitBadges,
  PlantRangeGauges,
  PlantPedagoFetchedSections,
} from './PlantSummaryBlocks.jsx';
import { PlantBiodivHeroPhoto, PlantMetaSections } from './PlantMetaSections.jsx';
import { PlantDeterminationSection } from './PlantDeterminationSection.jsx';
import { PlantCladeBreadcrumb } from './PlantCladeBreadcrumb.jsx';
import { PlantHazardSection, PlantHealthRiskSection } from './PlantHazardSection.jsx';
import { PlantLocationPreviewMaps } from './BiodivLocationMaps.jsx';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { SpeciesObservationSlot } from '../observations/SpeciesObservationSlot.jsx';
import {
  IconBiodiv,
  IconClose,
  IconGlobe,
  IconHabitat,
  IconMarker,
  IconPin,
} from '../../shared/icons.jsx';

/**
 * Carte fiche biodiversité (lecture seule), même contenu que le catalogue élève — réutilisée dans
 * le viewer et la modale d’aperçu (comme les tutoriels). Extraite de `foretmap-views.jsx` (O6).
 */
export function PlantBiodiversityCatalogPreviewCard({
  plant,
  zones = [],
  markers = [],
  maps = [],
  activeMapId = null,
  myObservationCount = 0,
  siteObservationCount = 0,
  onObservationAcknowledged = null,
  /** Résumé du conditionnement pour cette fiche (chargé en lot par la vue). */
  gatingSummary = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onForceLogout = null,
  showContextComments = true,
  dataBiodivPlantId = null,
  onOpenPlant = null,
  onOpenGlossaryTerm = null,
  onOpenQuizQuestion = null,
  onNavigateToFoodWeb = null,
  /**
   * Présence sur la carte active selon le serveur (définition commune : registre, zones,
   * repères). `presenceKnown` faux = pas encore connue : seuls les lieux sont affichés.
   */
  presenceKnown = false,
  presenceEntry = null,
  /** Mise à jour locale après confirmation d'une photo (optionnel). */
  onPlantPhotosUpdated = null,
}) {
  const { visibility, canShow } = useBiodivPedago();
  const { hasPermission = () => false } = useSession();
  const canConfirmPhotos = !!hasPermission?.('plants.manage');
  const latinVisibility = visibility('accepted_name_gbif_latin');
  const showClade = canShow('clade_breadcrumb');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localPlant, setLocalPlant] = useState(plant);
  useEffect(() => {
    setLocalPlant(plant);
  }, [plant]);
  if (!localPlant) return null;
  const displayPlant = localPlant;

  const confirmPhoto = async (photoId) => {
    if (!displayPlant?.id || photoBusy) return;
    setPhotoBusy(true);
    try {
      const res = await api(`/api/plants/${displayPlant.id}/photos/${photoId}/confirm`, 'POST', {});
      if (res?.plant) {
        setLocalPlant(res.plant);
        onPlantPhotosUpdated?.(res.plant);
      } else if (Array.isArray(res?.photos)) {
        const next = { ...displayPlant, photos: res.photos };
        setLocalPlant(next);
        onPlantPhotosUpdated?.(next);
      }
    } catch {
      /* toast optionnel côté parent */
    } finally {
      setPhotoBusy(false);
    }
  };
  const pZones = zones.filter((z) => plantLinkedToMapZone(displayPlant, z));
  const pMarkers = markers.filter((m) => plantLinkedToMapMarker(displayPlant, m));
  const hasMapLink = pZones.length > 0 || pMarkers.length > 0;
  const presenceLine = presenceKnown && presenceEntry ? describePresenceSources(presenceEntry) : '';
  const showMapSection = hasMapLink || !!presenceLine;
  const dataAttr =
    dataBiodivPlantId != null && dataBiodivPlantId !== ''
      ? { 'data-biodiv-plant-id': dataBiodivPlantId }
      : {};
  const usageName = normalizedPlantValue(displayPlant.scientific_name);
  const acceptedName = normalizedPlantValue(displayPlant.accepted_scientific_name);
  const showAccepted = acceptedName && acceptedName.toLowerCase() !== usageName.toLowerCase();
  const gbifKey =
    displayPlant?.taxonomy?.gbifAcceptedKey ||
    displayPlant?.taxonomy?.gbifKey ||
    displayPlant?.gbif_accepted_key ||
    displayPlant?.gbif_key;
  const gbifHref =
    gbifKey != null && Number(gbifKey) > 0
      ? `https://www.gbif.org/species/${Number(gbifKey)}`
      : null;
  const previewMapId = activeMapId || displayPlant.preview_map_id || null;
  return (
    <article className="biodiv-card fade-in" {...dataAttr}>
      <div className="biodiv-card-head">
        <div className="biodiv-card-title-wrap">
          <span className="biodiv-emoji">{displayPlant.emoji}</span>
          <div className="biodiv-card-title-content">
            <h3>{displayPlant.name}</h3>
            {latinVisibility !== 'hide' ? (
              <>
                <p className="plant-scientific">{usageName || 'Nom scientifique non renseigne'}</p>
                {showAccepted && latinVisibility === 'open' ? (
                  <p className="plant-accepted-name">Nom accepté : {acceptedName}</p>
                ) : null}
                {showAccepted && latinVisibility === 'collapsed' ? (
                  <details className="plant-accepted-name-details">
                    <summary>Nom accepté / classification</summary>
                    <p className="plant-accepted-name">Nom accepté : {acceptedName}</p>
                    {gbifHref ? (
                      <p className="plant-gbif-link">
                        <a href={gbifHref} target="_blank" rel="noopener noreferrer">
                          Fiche GBIF
                        </a>
                      </p>
                    ) : null}
                  </details>
                ) : null}
                {latinVisibility === 'open' && gbifHref ? (
                  <p className="plant-gbif-link">
                    <a href={gbifHref} target="_blank" rel="noopener noreferrer">
                      Fiche GBIF
                    </a>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {normalizedPlantValue(displayPlant.group_2) && (
          <span className="task-chip">{displayPlant.group_2}</span>
        )}
      </div>

      <div className="biodiv-card-body">
        {displayPlant.description ? (
          <MarkdownContent className="plant-row-desc">{displayPlant.description}</MarkdownContent>
        ) : (
          <p className="plant-row-desc">
            <em style={{ color: '#bbb' }}>Pas de description</em>
          </p>
        )}
        <PlantBiodivHeroPhoto
          plant={displayPlant}
          canConfirmPhotos={canConfirmPhotos && !photoBusy}
          onConfirmPhoto={confirmPhoto}
        />
        {plantHasUnconfirmedPhotos(displayPlant) ? (
          <p className="plant-photo-pending-banner" role="status">
            Une ou plusieurs photos de cette fiche attendent une confirmation professeur.
          </p>
        ) : null}
        {/* Le danger passe avant tout le reste, et hors d'un <details> : un avertissement
            de toxicité derrière un repli fermé n'avertit personne. */}
        <PlantHazardSection plant={displayPlant} onOpenGlossaryTerm={onOpenGlossaryTerm} />
        {/* Risque sanitaire : encadré distinct, pour ne pas faire passer un animal porteur
            de la rage pour un animal toxique. */}
        <PlantHealthRiskSection plant={displayPlant} onOpenGlossaryTerm={onOpenGlossaryTerm} />
        {/* Placée avant l'écologie : devant l'être vivant, on cherche d'abord ce que c'est. */}
        <PlantDeterminationSection
          plant={displayPlant}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          onOpenPlant={onOpenPlant}
        />
        {showClade ? <PlantCladeBreadcrumb plant={displayPlant} /> : null}
        <PlantEcosystemHumanLead plant={displayPlant} onOpenGlossaryTerm={onOpenGlossaryTerm} />
        <PlantTaxonomyLine plant={displayPlant} />
        <PlantSiteNotesBlock plant={displayPlant} activeMapId={previewMapId} maps={maps} />
        <PlantPedagoTraitBadges plant={displayPlant} />
        <PlantRangeGauges plant={displayPlant} />
        <CatalogRemarksSection plant={displayPlant} />
        <div className="task-meta">
          {normalizedPlantValue(displayPlant.habitat) &&
            !isGenericPotagerLabel(displayPlant.habitat) && (
              <span className="task-chip">
                <IconHabitat size={12} /> {displayPlant.habitat}
              </span>
            )}
          {normalizedPlantValue(displayPlant.agroecosystem_category) &&
            !isGenericPotagerLabel(displayPlant.agroecosystem_category) && (
              <span className="task-chip">
                <IconGlobe size={12} /> {displayPlant.agroecosystem_category}
              </span>
            )}
        </div>
        <PlantSummaryBadges plant={displayPlant} />
        <PlantMetaSections
          plant={displayPlant}
          canConfirmPhotos={canConfirmPhotos && !photoBusy}
          onConfirmPhoto={confirmPhoto}
        />
        <PlantPedagoFetchedSections
          plantId={displayPlant.id}
          onOpenPlant={onOpenPlant}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          onOpenQuizQuestion={onOpenQuizQuestion}
          onNavigateToFoodWeb={onNavigateToFoodWeb}
        />
        {showMapSection ? (
          <div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--fw-bold)',
                color: '#aaa',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Sur la carte
            </div>
            {presenceLine ? (
              <p className="plant-presence-line" data-testid="plant-presence-line">
                Présente sur cette carte : {presenceLine}
              </p>
            ) : null}
            {hasMapLink ? (
              <>
                <PlantLocationPreviewMaps maps={maps} zones={pZones} markers={pMarkers} />
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--fw-bold)',
                    color: '#aaa',
                    textTransform: 'uppercase',
                    margin: '10px 0 4px',
                  }}
                >
                  Zones et repères
                </div>
                <div className="plant-zones">
                  {pZones.map((z) => (
                    <span key={`zone-${z.id}`} className="plant-zone-chip">
                      <IconMarker size={12} /> {z.name}
                    </span>
                  ))}
                  {pMarkers.map((m) => (
                    <span key={`marker-${m.id}`} className="plant-zone-chip">
                      <IconPin size={12} /> {m.label?.trim() ? m.label : 'Repère'}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p style={{ fontSize: 'var(--text-sm)', color: '#bbb', fontStyle: 'italic' }}>
            {presenceKnown
              ? 'Pas encore signalée sur cette carte'
              : 'Pas encore associé à une zone ni à un repère sur la carte'}
          </p>
        )}
        <div
          className="plant-discovery-ack-row"
          style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
        >
          <PlantSpeciesDiscoveryAcknowledgeButton
            plantId={displayPlant.id}
            speciesName={displayPlant.name}
            myObservationCount={myObservationCount}
            siteObservationCount={siteObservationCount}
            gatingSummary={gatingSummary}
            offerPlantCommentAfterObservation={
              contextCommentsEnabled && canParticipateContextComments
            }
            onAcknowledged={(id, next) => {
              onObservationAcknowledged?.(id, next);
            }}
            onForceLogout={onForceLogout}
          />
        </div>
        <SpeciesObservationSlot
          plant={displayPlant}
          presenceEntry={presenceKnown ? presenceEntry : null}
          mapId={previewMapId}
          onForceLogout={onForceLogout}
        />
        {showContextComments && contextCommentsEnabled && (
          <ContextComments
            contextType="plant"
            contextId={String(displayPlant.id)}
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
  onOpenPlant = null,
  onOpenGlossaryTerm = null,
  onOpenQuizQuestion = null,
  onNavigateToFoodWeb = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const {
    zones = [],
    markers = [],
    plants: dataPlants,
    activeMapId = null,
    // Présence déjà connue de l'écran appelant (contenu de visite, `site_species`).
    mapSpeciesPresence = null,
  } = useData();
  // Présence sur la carte active : même définition que le catalogue (serveur). Rafraîchie
  // quand zones, repères ou fiches sont rechargés ; partagée avec le catalogue ouvert.
  const presence = useMapSpeciesPresence(activeMapId, {
    watch: [zones, markers, dataPlants],
    enabled: !!plant,
    species: Array.isArray(mapSpeciesPresence) ? mapSpeciesPresence : null,
  });
  const presenceKnown = presence.byPlantId instanceof Map;
  const presenceEntry = presenceEntryForPlant(presence.byPlantId, plant);
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  /**
   * Commentaires de fiche : route authentifiée. La fiche est désormais ouvrable depuis la
   * visite **invitée** (biodiversité des lieux) — sans session, le fil de commentaires
   * n'aurait récolté qu'un 401 affiché en erreur.
   */
  const hasSession = typeof getAuthToken === 'function' && !!getAuthToken();
  const [obs, setObs] = useState({ my: 0, site: 0 });
  // L'aperçu plein écran n'annonçait rien : l'élève y découvrait le contrôle après coup.
  const plantIds = useMemo(() => (plant?.id ? [plant.id] : []), [plant?.id]);
  const { summaries: gatingSummaries } = useGatingSummary('plant', plantIds);

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
    return () => {
      cancelled = true;
    };
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
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Fermer l’aperçu"
        >
          <IconClose size={16} />
        </button>
        <h3 id="plant-catalog-preview-title">
          <IconBiodiv size={16} /> {plant.name}
        </h3>
      </div>
      <div className="tuto-preview-modal__body tuto-preview-modal__body--biodiv-scroll">
        <PlantBiodiversityCatalogPreviewCard
          plant={plant}
          zones={zones}
          markers={markers}
          maps={maps}
          presenceKnown={presenceKnown}
          presenceEntry={presenceEntry}
          gatingSummary={gatingSummaries.get(String(plant.id)) || null}
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
          showContextComments={hasSession}
          dataBiodivPlantId={null}
          onOpenPlant={onOpenPlant}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          onOpenQuizQuestion={onOpenQuizQuestion}
          onNavigateToFoodWeb={onNavigateToFoodWeb}
        />
      </div>
    </DialogShell>
  );
}
