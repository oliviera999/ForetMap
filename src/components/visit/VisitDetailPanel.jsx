import { useId, useMemo } from 'react';
import { useDialogA11y } from '../../shared/platform/useDialogA11y.js';
import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { normalizeEditorialBlocks } from '../../utils/visitEditorialBlocks.js';
import { computeVisitLocationAside } from '../../utils/visitLocationAside.js';
import {
  itemSeenKey,
  visitMediaGalleryThumbDisplaySrc,
  visitMediaGalleryLightboxSrc,
  sameVisitImageUrl,
  visitImageIdentityKey,
  mediaMatchesLeadPhoto,
} from '../../utils/visitMediaGallery.js';
// Imports directs (mêmes symboles que les ré-exports du barrel map-views) :
// évite de tirer MarkerModal/ZoneDrawModal/useMapGestures dans le chunk visite.
import { LocationTutorialPreviewList } from '../map/mapModalShared.jsx';
import { VisitBiodiversityPanel } from './VisitBiodiversityPanel.jsx';
import { VisitEditorPanel } from './VisitEditorPanel.jsx';
import { IconCheck, IconEye } from '../../shared/icons.jsx';

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

function VisitEditorialRenderer({
  blocks,
  selectedVisitMedia,
  onOpenLightbox,
  glossaryItems,
  onOpenGlossaryTerm,
  /** Photo carte déjà en tête : exclus des blocs image (toutes formes d'URL). */
  excludeLeadPhoto = null,
  /**
   * Photo carte déjà affichée en `.visit-media-gallery--lead` : masquer le premier bloc
   * image « hero » (single + lg). En prod le média visite est souvent une copie sous
   * `/api/visit/media/N/data` alors que la lead sert `/uploads/...` — même cliché, clés
   * d'identité distinctes ; le filtre URL seul ne suffit pas.
   */
  suppressFirstHeroImage = false,
}) {
  const mediaById = useMemo(() => {
    const m = new Map();
    for (const media of selectedVisitMedia || []) {
      const id = Number(media?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      m.set(id, media);
    }
    return m;
  }, [selectedVisitMedia]);
  let heroSuppressed = false;
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
              <GlossaryMarkdown
                glossaryItems={glossaryItems}
                onOpenGlossaryTerm={onOpenGlossaryTerm}
              >
                {block.markdown}
              </GlossaryMarkdown>
            </div>
          );
        }
        if (block.type === 'image') {
          const images = (block.media_ids || [])
            .map((id) => mediaById.get(Number(id)))
            .filter(Boolean)
            .filter((media) => !mediaMatchesLeadPhoto(media, excludeLeadPhoto));
          if (!images.length) return null;
          const isHero = images.length === 1 && String(block.size || 'md') === 'lg';
          if (suppressFirstHeroImage && !heroSuppressed && isHero) {
            heroSuppressed = true;
            return null;
          }
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
  /**
   * Fermeture demandée au clavier (Échap). Distincte de `onClose` : le parent l'ignore
   * tant qu'une lightbox ou un aperçu de tutoriel est ouvert par-dessus le panneau.
   */
  onRequestClose = null,
  comfortableReading,
  onToggleComfortableReading,
  onOpenLightbox,
  onOpenTutorialPreview,
  seen,
  savingSeen,
  onToggleSeen,
  /** Afficher « Marquer comme vu ». */
  showSeenStatus = true,
  plants = [],
  onOpenPlantCatalogPreview = null,
  /**
   * Index des termes du glossaire (`useGlossaryLinkIndex`) : les textes de visite sont
   * auto-liés comme ceux des tutoriels et des fiches espèces. Vide → rendu markdown normal.
   */
  glossaryItems = [],
  onOpenGlossaryTerm = null,
  /** Contexte carte/missions/catalogue pour l'aside biodiversité + tutos du lieu. */
  mapId,
  mapZones = [],
  mapMarkers = [],
  tasks = [],
  catalogTutorials = [],
  isTeacher = false,
  /**
   * Guidage « Y aller » (`shared/map-guide`) : direction et distance à vol d'oiseau depuis la
   * position, jamais un itinéraire. `canGuide` faux (géolocalisation désactivée sur la carte,
   * plan non calé, appareil sans position) → le bouton n'est pas affiché du tout : un bouton
   * éteint promettait une action que la carte ne peut pas rendre.
   */
  canGuide = false,
  onGoTo = null,
  isGuideTarget = false,
  guideDistanceLabel = '',
  /** Édition visite : prof hors « aperçu comme élève ». */
  canEditVisit = false,
  onSaved,
  onForceLogout,
  roleTerms,
  markerEmojis,
}) {
  const visitDetailPanelTitleId = useId();
  /**
   * `aria-modal` sans piège de focus laissait la tabulation repartir dans la carte derrière
   * le panneau, et le focus n'était pas rendu à la zone/au repère à la fermeture.
   * Même coque a11y que les autres dialogues (`useDialogA11y` : focus initial, piège Tab,
   * Échap, restitution du focus).
   */
  const dialogRef = useDialogA11y(() => (onRequestClose || onClose)?.());

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
  const mapLeadPhoto = selected.map_lead_photo?.image_url ? selected.map_lead_photo : null;
  const mapLeadUrl = mapLeadPhoto?.image_url || '';
  const firstVisitPhoto = selectedVisitMedia[0] || null;
  const firstVisitDuplicatesMapLead =
    firstVisitPhoto &&
    sameVisitImageUrl(firstVisitPhoto.image_url || firstVisitPhoto.thumb_url, mapLeadUrl);
  /** Première photo visite en « lead » sous l'intro seulement si elle n'est pas déjà la photo carte. */
  const showFirstVisitAsLead = Boolean(firstVisitPhoto && !firstVisitDuplicatesMapLead);
  const restVisitPhotos = selectedVisitMedia
    .slice(showFirstVisitAsLead ? 1 : 0)
    .filter((m) => !sameVisitImageUrl(m.image_url || m.thumb_url, mapLeadUrl));
  /**
   * Autres photos de la galerie carte : la photo lead et les médias visite déjà affichés
   * plus haut sont écartés (même cliché servi sous deux formes d'URL, cf.
   * `visitImageIdentityKey`).
   */
  const alreadyShownImageKeys = new Set(
    [
      mapLeadUrl,
      ...(showFirstVisitAsLead ? [firstVisitPhoto.image_url || firstVisitPhoto.thumb_url] : []),
      ...restVisitPhotos.map((m) => m.image_url || m.thumb_url),
    ]
      .map((url) => visitImageIdentityKey(url))
      .filter(Boolean),
  );
  const mapExtraPhotos = (
    Array.isArray(selected.map_extra_photos) ? selected.map_extra_photos : []
  ).filter((ph) => !alreadyShownImageKeys.has(visitImageIdentityKey(ph.image_url || ph.thumb_url)));
  const visitDetailsTextTrim = selected.visit_details_text
    ? String(selected.visit_details_text).trim()
    : '';
  const showVisitDetailsBlock = !!(
    visitDetailsTextTrim ||
    restVisitPhotos.length > 0 ||
    mapExtraPhotos.length > 0
  );

  return (
    <>
      {/* Voile : sur grand écran le panneau est une carte centrée — sans lui, la carte
          restait cliquable sous un dialogue `aria-modal` (un clic ouvrait une autre zone
          ou déplaçait la mascotte derrière le panneau). */}
      <div
        className="visit-detail-panel__scrim"
        data-testid="visit-detail-panel-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={visitDetailPanelTitleId}
        tabIndex={-1}
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
            aria-label="Lecture confortable (Aa)"
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
          {mapLeadPhoto && (
            <div className="visit-media-gallery visit-media-gallery--lead">
              <VisitMediaGalleryThumb
                media={{
                  image_url: mapLeadPhoto.image_url,
                  thumb_url: mapLeadPhoto.thumb_url,
                  caption: mapLeadPhoto.caption,
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
              glossaryItems={glossaryItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              excludeLeadPhoto={mapLeadPhoto}
              suppressFirstHeroImage={Boolean(mapLeadPhoto)}
            />
          ) : (
            <>
              {selected.visit_short_description && (
                <GlossaryMarkdown
                  glossaryItems={glossaryItems}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                >
                  {selected.visit_short_description}
                </GlossaryMarkdown>
              )}
              {showFirstVisitAsLead && (
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
                    <GlossaryMarkdown
                      className="visit-details__body"
                      glossaryItems={glossaryItems}
                      onOpenGlossaryTerm={onOpenGlossaryTerm}
                    >
                      {selected.visit_details_text}
                    </GlossaryMarkdown>
                  ) : null}
                </details>
              )}
            </>
          )}
          {visitLocationAside.showBiodiversity && (
            <VisitBiodiversityPanel
              locationKind={visitLocationAside.locationKind}
              names={visitLocationAside.primaryLivingNames}
              species={visitLocationAside.primaryLivingSpecies}
              plants={plants}
              namesOnlyOnTasks={visitLocationAside.livingBeingsOnlyOnTasks}
              onOpenPlant={onOpenPlantCatalogPreview}
            />
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
          {onGoTo && canGuide ? (
            <div className="visit-detail-panel__go">
              <button
                type="button"
                className="btn btn-primary btn-sm visit-detail-panel__go-btn"
                data-testid="visit-detail-go"
                title="Afficher la direction et la distance depuis votre position"
                onClick={() => onGoTo(selected)}
              >
                {isGuideTarget ? 'Revoir la direction' : 'Y aller'}
              </button>
              <p className="visit-detail-panel__go-hint section-sub">
                {isGuideTarget && guideDistanceLabel
                  ? `À ${guideDistanceLabel} à vol d’oiseau. La fiche se referme : le guidage reste en bas.`
                  : 'Direction à vol d’oiseau, pas un itinéraire. La fiche se referme.'}
              </p>
            </div>
          ) : null}
          {showSeenStatus ? (
            <button className="btn btn-primary btn-sm" disabled={savingSeen} onClick={onToggleSeen}>
              {seen.has(itemSeenKey(selectedType, selected.id)) ? (
                <>
                  <IconCheck size={14} /> Marqué comme vu
                </>
              ) : (
                <>
                  <IconEye size={14} /> Marquer comme vu
                </>
              )}
            </button>
          ) : null}
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
    </>
  );
}
