import React, { useId, useMemo } from 'react';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { normalizeEditorialBlocks } from '../../utils/visitEditorialBlocks.js';
import { computeVisitLocationAside } from '../../utils/visitLocationAside.js';
import {
  itemSeenKey,
  visitMediaGalleryThumbDisplaySrc,
  visitMediaGalleryLightboxSrc,
} from '../../utils/visitMediaGallery.js';
import {
  BiodiversitySpeciesOpenLinks,
  LocationTutorialPreviewList,
  LivingBeingsCatalogPanel,
} from '../map-views';
import { VisitEditorPanel } from './VisitEditorPanel.jsx';

/** Vignette cliquable : aperçu sans rognage (CSS `object-fit: contain`) + lightbox plein écran. */
function VisitMediaGalleryThumb({ media, onOpenLightbox }) {
  const srcThumb = visitMediaGalleryThumbDisplaySrc(media);
  const srcFull = visitMediaGalleryLightboxSrc(media);
  if (!srcThumb || !srcFull) return null;
  const cap = String(media?.caption || '').trim();
  return (
    <figure>
      <button
        type="button"
        className="visit-media-gallery__open"
        onClick={() => onOpenLightbox({ src: srcFull, caption: cap })}
        aria-label={cap ? `Agrandir la photo : ${cap}` : 'Agrandir la photo'}
      >
        <img src={srcThumb} alt="" loading="lazy" decoding="async" />
      </button>
      {cap ? <figcaption>{media.caption}</figcaption> : null}
    </figure>
  );
}

function VisitEditorialRenderer({ blocks, selectedVisitMedia, onOpenLightbox }) {
  const mediaById = useMemo(() => {
    const m = new Map();
    for (const media of selectedVisitMedia || []) {
      const id = Number(media?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      m.set(id, media);
    }
    return m;
  }, [selectedVisitMedia]);
  return (
    <div className="visit-editorial">
      {blocks.map((block) => {
        if (block.type === 'heading') {
          return (
            <h4
              key={block.id}
              className={`visit-editorial-heading visit-editorial-heading--h${block.level || 3}`}
            >
              {block.text}
            </h4>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <div key={block.id} className="visit-editorial-paragraph">
              <MarkdownContent>{block.markdown}</MarkdownContent>
            </div>
          );
        }
        if (block.type === 'image') {
          const images = (block.media_ids || [])
            .map((id) => mediaById.get(Number(id)))
            .filter(Boolean);
          if (!images.length) return null;
          return (
            <div
              key={block.id}
              className={`visit-editorial-image ${images.length === 1 ? 'visit-editorial-image--single' : 'visit-editorial-image--multi'} visit-editorial-image--${block.size || 'md'} visit-editorial-image--${block.align || 'center'}`}
            >
              <div className="visit-media-gallery">
                {images.map((media) => (
                  <VisitMediaGalleryThumb
                    key={`${block.id}-${media.id}`}
                    media={media}
                    onOpenLightbox={onOpenLightbox}
                  />
                ))}
              </div>
              {block.caption ? (
                <p className="visit-editorial-image__caption">{block.caption}</p>
              ) : null}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/**
 * Panneau détail zone/repère de la visite (dialogue bas de carte), extrait de `VisitView` (O6).
 * Contenu éditorial (blocs ou description + galerie), biodiversité et tutoriels du lieu,
 * bouton « vu » et panneau d'édition prof. Comportement inchangé (déplacement pur).
 */
export function VisitDetailPanel({
  selected,
  selectedType,
  onClose,
  comfortableReading,
  onToggleComfortableReading,
  onOpenLightbox,
  onOpenTutorialPreview,
  seen,
  savingSeen,
  onToggleSeen,
  plants = [],
  onOpenPlantCatalogPreview = null,
  /** Contexte carte/missions/catalogue pour l'aside biodiversité + tutos du lieu. */
  mapId,
  mapZones = [],
  mapMarkers = [],
  tasks = [],
  catalogTutorials = [],
  isTeacher = false,
  /** Édition visite : prof hors « aperçu comme élève ». */
  canEditVisit = false,
  onSaved,
  onForceLogout,
  roleTerms,
  markerEmojis,
}) {
  const visitDetailPanelTitleId = useId();

  /** Biodiversité et tutoriels liés au lieu (aligné sur les panneaux zone/repère de la carte). */
  const visitLocationAside = useMemo(
    () =>
      computeVisitLocationAside(selected, selectedType, {
        mapId,
        mapZones,
        mapMarkers,
        tasks,
        catalogTutorials,
        isTeacher,
      }),
    [selected, selectedType, mapId, mapZones, mapMarkers, tasks, catalogTutorials, isTeacher],
  );

  if (!selected) return null;

  const selectedVisitMedia = selected.visit_media || [];
  const selectedEditorialBlocks = normalizeEditorialBlocks(selected.visit_editorial_blocks || []);
  const hasEditorialBlocks = selectedEditorialBlocks.length > 0;
  const firstVisitPhoto = selectedVisitMedia[0] || null;
  const restVisitPhotos = selectedVisitMedia.slice(1);
  const mapExtraPhotos = Array.isArray(selected.map_extra_photos) ? selected.map_extra_photos : [];
  const visitDetailsTextTrim = selected.visit_details_text
    ? String(selected.visit_details_text).trim()
    : '';
  const showVisitDetailsBlock = !!(
    visitDetailsTextTrim ||
    restVisitPhotos.length > 0 ||
    mapExtraPhotos.length > 0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={visitDetailPanelTitleId}
      data-testid="visit-detail-panel"
      className={`visit-detail-panel${comfortableReading ? ' visit-detail-panel--comfortable' : ''} visit-detail-panel--tone-paper`}
    >
      <div className="visit-detail-panel__handle" aria-hidden="true" />
      <div className="visit-detail-panel__head">
        <h3 id={visitDetailPanelTitleId} className="visit-detail-panel__title">
          {selectedType === 'zone' ? selected.name : selected.label}
        </h3>
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${comfortableReading ? 'is-active' : ''}`}
          aria-pressed={comfortableReading}
          title="Basculer le mode lecture confortable"
          onClick={onToggleComfortableReading}
        >
          Aa
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="visit-detail-panel__body visit-selection-aside">
        {selected.visit_subtitle && <p className="visit-subtitle">{selected.visit_subtitle}</p>}
        {selected.map_lead_photo?.image_url && (
          <div className="visit-media-gallery visit-media-gallery--lead">
            <VisitMediaGalleryThumb
              media={{
                image_url: selected.map_lead_photo.image_url,
                caption: selected.map_lead_photo.caption,
              }}
              onOpenLightbox={onOpenLightbox}
            />
          </div>
        )}
        {hasEditorialBlocks ? (
          <VisitEditorialRenderer
            blocks={selectedEditorialBlocks}
            selectedVisitMedia={selectedVisitMedia}
            onOpenLightbox={onOpenLightbox}
          />
        ) : (
          <>
            {selected.visit_short_description && (
              <MarkdownContent>{selected.visit_short_description}</MarkdownContent>
            )}
            {firstVisitPhoto && (
              <div className="visit-media-gallery visit-media-gallery--lead">
                <VisitMediaGalleryThumb media={firstVisitPhoto} onOpenLightbox={onOpenLightbox} />
              </div>
            )}
            {showVisitDetailsBlock && (
              <details className="visit-details">
                <summary>{selected.visit_details_title || 'Détails'}</summary>
                {(restVisitPhotos.length > 0 || mapExtraPhotos.length > 0) && (
                  <div className="visit-media-gallery visit-media-gallery--details-extra">
                    {restVisitPhotos.map((m) => (
                      <VisitMediaGalleryThumb
                        key={m.id}
                        media={m}
                        onOpenLightbox={onOpenLightbox}
                      />
                    ))}
                    {mapExtraPhotos.map((ph) => (
                      <VisitMediaGalleryThumb
                        key={`map-extra-${ph.id}`}
                        media={{
                          image_url: ph.image_url,
                          thumb_url: ph.thumb_url,
                          caption: ph.caption,
                        }}
                        onOpenLightbox={onOpenLightbox}
                      />
                    ))}
                  </div>
                )}
                {visitDetailsTextTrim ? (
                  <MarkdownContent className="visit-details__body">
                    {selected.visit_details_text}
                  </MarkdownContent>
                ) : null}
              </details>
            )}
          </>
        )}
        {visitLocationAside.showBiodiversity && (
          <details className="visit-details">
            <summary>Biodiversité</summary>
            <div className="visit-details__section">
              {visitLocationAside.primaryLivingNames.length > 0 && (
                <div
                  className={`visit-details__subsection${visitLocationAside.livingBeingsOnlyOnTasks.length ? ' visit-details__subsection--with-gap' : ''}`}
                >
                  {visitLocationAside.primaryLivingNames.length > 1 ||
                  visitLocationAside.livingBeingsOnlyOnTasks.length > 0 ? (
                    <h4 className="visit-details__h4">
                      {visitLocationAside.locationKind === 'zone'
                        ? 'Sur cette zone'
                        : 'Sur ce repère'}
                    </h4>
                  ) : null}
                  {onOpenPlantCatalogPreview ? (
                    <BiodiversitySpeciesOpenLinks
                      plants={plants}
                      names={visitLocationAside.primaryLivingNames}
                      showHeading={false}
                      onOpenPlant={onOpenPlantCatalogPreview}
                    />
                  ) : (
                    <LivingBeingsCatalogPanel
                      plants={plants}
                      names={visitLocationAside.primaryLivingNames}
                      showHeading={false}
                    />
                  )}
                </div>
              )}
              {visitLocationAside.livingBeingsOnlyOnTasks.length > 0 && (
                <div>
                  <h4 className="visit-details__h4">Également dans les missions</h4>
                  {onOpenPlantCatalogPreview ? (
                    <BiodiversitySpeciesOpenLinks
                      plants={plants}
                      names={visitLocationAside.livingBeingsOnlyOnTasks}
                      showHeading={false}
                      sectionTitle="Également dans les missions"
                      onOpenPlant={onOpenPlantCatalogPreview}
                    />
                  ) : (
                    <LivingBeingsCatalogPanel
                      plants={plants}
                      names={visitLocationAside.livingBeingsOnlyOnTasks}
                      showHeading={false}
                    />
                  )}
                </div>
              )}
            </div>
          </details>
        )}
        {visitLocationAside.showTutos && (
          <details className="visit-details">
            <summary>Tuto</summary>
            <div className="visit-details__section">
              <LocationTutorialPreviewList
                tutorials={visitLocationAside.tutorialListForPreview}
                locationKind={visitLocationAside.locationKind}
                locationId={selected.id}
                onOpenTutorialPreview={onOpenTutorialPreview}
              />
            </div>
          </details>
        )}
        <button className="btn btn-primary btn-sm" disabled={savingSeen} onClick={onToggleSeen}>
          {seen.has(itemSeenKey(selectedType, selected.id))
            ? '✅ Marqué comme vu'
            : '🔴 Marquer comme vu'}
        </button>
        <VisitEditorPanel
          selected={selected}
          selectedType={selectedType}
          onSaved={onSaved}
          onForceLogout={onForceLogout}
          isTeacher={canEditVisit}
          roleTerms={roleTerms}
          markerEmojis={markerEmojis}
        />
      </div>
    </div>
  );
}
