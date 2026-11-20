import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '../../shared/platform/useDialogA11y.js';
import { useExitAnimation } from '../../shared/hooks/useExitAnimation.js';
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
import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';
import { MEDIA } from '../../shared/breakpoints.js';

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
 * « Vu » automatique (audit UI/UX du 19/11/2026, U6 ; décision du 20/11/2026) : un lieu est
 * marqué vu après une lecture réelle — fiche ouverte `delayMs`, ou défilement jusqu'en bas —
 * et l'élève peut annuler. Une annulation vaut pour toute l'ouverture de la fiche : la
 * minuterie ne remarque pas un lieu qu'on vient de démarquer.
 *
 * @param {object} params
 * @param {string|null} params.itemKey clé du lieu ouvert (`zone:12`), `null` sans lieu
 * @param {boolean} params.isSeen le lieu est déjà vu
 * @param {number} params.delayMs délai ; 0 ou moins = jamais automatique
 * @param {(() => void)|null} params.onMark marque le lieu vu
 * @returns {{ autoMarked: boolean, cancelled: boolean, markNow: () => void, cancel: () => void }}
 */
export function useVisitAutoSeen({ itemKey, isSeen, delayMs, onMark }) {
  const [state, setState] = useState({ key: itemKey, autoMarked: false, cancelled: false });
  const current =
    state.key === itemKey ? state : { key: itemKey, autoMarked: false, cancelled: false };
  if (current !== state) setState(current);
  const onMarkRef = useRef(onMark);
  onMarkRef.current = onMark;
  const enabled = !!itemKey && typeof onMark === 'function' && Number(delayMs) > 0;
  const canAutoMark = enabled && !isSeen && !current.cancelled && !current.autoMarked;

  const markNow = useCallback(() => {
    if (!canAutoMark) return;
    setState({ key: itemKey, autoMarked: true, cancelled: false });
    onMarkRef.current?.();
  }, [canAutoMark, itemKey]);

  useEffect(() => {
    if (!canAutoMark) return undefined;
    const timer = setTimeout(markNow, Number(delayMs));
    return () => clearTimeout(timer);
  }, [canAutoMark, delayMs, markNow]);

  const cancel = useCallback(() => {
    setState({ key: itemKey, autoMarked: false, cancelled: true });
  }, [itemKey]);

  return { autoMarked: current.autoMarked, cancelled: current.cancelled, markNow, cancel };
}

/**
 * Fiche d'un lieu de la Visite (zone ou repère), extraite de `VisitView` (O6). Contenu
 * éditorial (blocs ou description + galerie), biodiversité et tutoriels du lieu, statut « vu »
 * et panneau d'édition prof.
 *
 * Mise en page (audit UI/UX du 19/11/2026, U6) — la fiche ne cache plus ce qu'elle décrit :
 *  - **à partir de 1024 px** (`MEDIA.desktop`) : panneau latéral droit, **non modal**, sans
 *    voile ; la carte reste visible et cliquable (cliquer un autre lieu remplace la fiche).
 *    Largeur `--visit-side-panel-w`, haut aligné sur la carte (`--visit-side-panel-top`) ;
 *  - **en dessous** : feuille basse partagée (`shared/ui/BottomSheet.jsx`), non bloquante,
 *    au cran « moitié » — la moitié haute de la carte reste visible.
 * Dans les deux cas : le focus entre dans la fiche à l'ouverture et revient au déclencheur
 * à la fermeture ; Échap ferme ; la tabulation n'est pas piégée (fiche non modale).
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
  /** Marque / démarque un lieu précis (« vu » automatique et son annulation). */
  onSetItemSeen = null,
  /** Délai du « vu » automatique en millisecondes (`ui.visit.auto_seen_delay_seconds`). */
  autoSeenDelayMs = 0,
  /** Afficher le statut « vu ». */
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
  /** Haut du panneau latéral en px (aligné sur la carte) ; `null` = valeur CSS par défaut. */
  sidePanelTop = null,
  /** Édition visite : prof hors « aperçu comme élève ». */
  canEditVisit = false,
  onSaved,
  onForceLogout,
  roleTerms,
  markerEmojis,
}) {
  const visitDetailPanelTitleId = useId();
  const isDesktop = useMediaQuery(MEDIA.desktop);
  const { closing, runExit, onAnimationEnd } = useExitAnimation({
    animationName: 'visitDetailPanelOut',
  });
  const closeAnimated = useCallback(
    () => (isDesktop ? runExit(onClose) : onClose?.()),
    [isDesktop, runExit, onClose],
  );
  const requestClose = useCallback(
    () => (isDesktop ? runExit(onRequestClose || onClose) : (onRequestClose || onClose)?.()),
    [isDesktop, runExit, onRequestClose, onClose],
  );
  // Panneau latéral : Échap seulement (la feuille basse gère le sien). Non modal : ni focus
  // initial imposé au premier contrôle, ni piège de tabulation.
  const sideRef = useDialogA11y(requestClose, { manageFocus: false, active: isDesktop });

  /** Racine du contenu : sert à retrouver le dialogue (latéral ou feuille) et son défilement. */
  const contentRef = useRef(null);
  const hasSelection = !!selected;

  // Focus : entre dans la fiche à l'ouverture, revient au déclencheur à la fermeture. Géré ici
  // et non par `useDialogA11y` : la fiche est non modale (aucun piège), mais le clavier doit
  // quand même y arriver sans parcourir toute la carte.
  useEffect(() => {
    if (!hasSelection || typeof document === 'undefined') return undefined;
    const previous = document.activeElement;
    const dialog = contentRef.current?.closest?.('[role="dialog"]');
    if (dialog && typeof dialog.focus === 'function') dialog.focus();
    return () => {
      if (previous && typeof previous.focus === 'function' && previous.isConnected !== false) {
        previous.focus();
      }
    };
  }, [hasSelection, isDesktop]);

  const itemKey = selected ? itemSeenKey(selectedType, selected.id) : null;
  const isSeen = !!(itemKey && seen?.has?.(itemKey));
  const autoSeen = useVisitAutoSeen({
    itemKey: showSeenStatus ? itemKey : null,
    isSeen,
    delayMs: autoSeenDelayMs,
    onMark:
      typeof onSetItemSeen === 'function' && selected
        ? () => onSetItemSeen(selectedType, selected.id, true)
        : null,
  });
  const { markNow } = autoSeen;

  // Lecture jusqu'en bas = lecture réelle : le « vu » n'attend pas la minuterie.
  useEffect(() => {
    if (!hasSelection) return undefined;
    const root = contentRef.current;
    const scroller = root?.closest?.('.fm-bottom-sheet__body') || root;
    if (!scroller || typeof scroller.addEventListener !== 'function') return undefined;
    const onScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = scroller;
      if (scrollHeight > clientHeight + 8 && scrollTop + clientHeight >= scrollHeight - 8) {
        markNow();
      }
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [hasSelection, isDesktop, markNow]);

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

  const title = selectedType === 'zone' ? selected.name : selected.label;
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

  const readingToggle = (
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
  );

  /**
   * Statut « vu » : automatique et annulable. Le bouton manuel reste pour qui veut marquer
   * tout de suite (ou démarquer un lieu vu lors d'une visite précédente).
   */
  const seenStatus = showSeenStatus ? (
    <div className="visit-seen-status" data-testid="visit-seen-status" aria-live="polite">
      {isSeen ? (
        <>
          <span className="visit-seen-status__label">
            <IconCheck size={14} /> {autoSeen.autoMarked ? 'Marqué comme vu' : 'Déjà vu'}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={savingSeen}
            data-testid="visit-seen-undo"
            onClick={() => {
              autoSeen.cancel();
              if (typeof onSetItemSeen === 'function') {
                onSetItemSeen(selectedType, selected.id, false);
              } else onToggleSeen?.();
            }}
          >
            {autoSeen.autoMarked ? 'Annuler' : 'Marquer comme non vu'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={savingSeen}
          onClick={() => {
            if (typeof onSetItemSeen === 'function') {
              onSetItemSeen(selectedType, selected.id, true);
            } else onToggleSeen?.();
          }}
        >
          <IconEye size={14} /> Marquer comme vu
        </button>
      )}
    </div>
  ) : null;

  const content = (
    <div
      ref={contentRef}
      className="visit-detail-panel__body visit-selection-aside"
      data-testid="visit-detail-body"
    >
      <div className="visit-detail-panel__tools">
        {seenStatus}
        {!isDesktop ? readingToggle : null}
      </div>
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
            <GlossaryMarkdown glossaryItems={glossaryItems} onOpenGlossaryTerm={onOpenGlossaryTerm}>
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
                    <VisitMediaGalleryThumb key={m.id} media={m} onOpenLightbox={onOpenLightbox} />
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
      {/*
        Compléments réservés (`location_notes`, migration 263) : filtrés note par note par
        le serveur ; ce qui arrive est ce que ce lecteur a le droit de lire.
      */}
      {(selected.notes || [])
        .filter((note) => note && String(note.body || '').trim())
        .map((note) => (
          <section className="visit-restricted-note" key={note.id ?? note.body}>
            <h4 className="visit-restricted-note__title">
              <span aria-hidden>🔒</span> {String(note.title || '').trim() || 'Complément réservé'}
            </h4>
            <GlossaryMarkdown glossaryItems={glossaryItems} onOpenGlossaryTerm={onOpenGlossaryTerm}>
              {note.body}
            </GlossaryMarkdown>
          </section>
        ))}
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
            title="Afficher la direction et la distance depuis ta position"
            onClick={() => onGoTo(selected)}
          >
            {isGuideTarget ? 'Revoir la direction' : 'Y aller'}
          </button>
          {/* Une seule ligne d'aide (U6) : la fiche ne se referme plus sur ordinateur, la
              phrase qui l'annonçait n'a plus lieu d'être. */}
          <p className="visit-detail-panel__go-hint section-sub">
            {isGuideTarget && guideDistanceLabel
              ? `À ${guideDistanceLabel} à vol d’oiseau.`
              : 'Direction à vol d’oiseau, pas un itinéraire.'}
          </p>
        </div>
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
  );

  const panelClass = `visit-detail-panel${comfortableReading ? ' visit-detail-panel--comfortable' : ''} visit-detail-panel--tone-paper`;

  if (!isDesktop) {
    return (
      <BottomSheet
        open
        onClose={requestClose}
        title={title}
        blockBackground={false}
        closeOnOverlay={false}
        snapPoints={['peek', 'half', 'full']}
        initialSnap="half"
        testId="visit-detail-panel"
        className={`${panelClass} visit-detail-panel--sheet`}
      >
        {content}
      </BottomSheet>
    );
  }

  return (
    <aside
      ref={sideRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={visitDetailPanelTitleId}
      tabIndex={-1}
      data-testid="visit-detail-panel"
      className={`${panelClass} visit-detail-panel--side${closing ? ' fm-is-exiting' : ''}`}
      style={sidePanelTop != null ? { '--visit-side-panel-top': `${sidePanelTop}px` } : undefined}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="visit-detail-panel__head">
        <h3 id={visitDetailPanelTitleId} className="visit-detail-panel__title">
          {title}
        </h3>
        {readingToggle}
        <button type="button" className="btn btn-ghost btn-sm" onClick={closeAnimated}>
          Fermer
        </button>
      </div>
      {content}
    </aside>
  );
}
