import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampMapMascotPctForViewport } from '../../utils/mapViewMascotMotion.js';
import { isQuestionMarker } from '../../utils/glMarkerEventConfig.js';
import { shouldPresentMarkerOnArrival } from '../../utils/glMarkerEffects.js';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { GLBoardMascot } from './GLBoardMascot.jsx';
import { GLQcmPopover } from './GLQcmPopover.jsx';
import { GLMarkerEffectPopover } from './GLMarkerEffectPopover.jsx';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { useGLBoardMascotMotion } from '../hooks/useGLBoardMascotMotion.js';
import { useGLMarkerArrival } from '../hooks/useGLMarkerArrival.js';
import { useGLZoneContentArrival } from '../hooks/useGLZoneContentArrival.js';
import { useGLLoreFeuilletArrival } from '../hooks/useGLLoreFeuilletArrival.js';
import { useGLFeuilletZoneArrival } from '../hooks/useGLFeuilletZoneArrival.js';
import { GLZoneContentPopover } from './GLZoneContentPopover.jsx';
import { GLFeuilletDiscoveryPopover } from './GLFeuilletDiscoveryPopover.jsx';
import { GLFeuilletPopover } from './GLFeuilletPopover.jsx';
import { GLFeuilletZoneOverlay } from './GLFeuilletZoneOverlay.jsx';
import { GLPlateauMapEditor } from './GLPlateauMapEditor.jsx';
import { apiGL } from '../services/apiGL.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { GLBoardChrome } from './GLBoardChrome.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLGameBoardHud } from './GLGameBoardHud.jsx';
import { plateauBoardImg, chapterIllustration, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { resolveGlBoardImageUrl } from '../utils/glLegacyMediaUrl.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';
import { DialogShell } from '../../components/DialogShell.jsx';
import { GLGameBoardRoster } from './GLGameBoardRoster.jsx';
import {
  buildMarkerPathNumberMap,
  sortMarkersByPath,
} from '../utils/glBoardPath.js';

export function GLGameBoard({
  chapter,
  markers,
  teams,
  gameId,
  watchTeamId,
  onMarkerClick,
  onBoardClick,
  onPlayerActionRequest,
  onSelectTeam,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  onOpenLoreTerm,
  loreGlossaryLinkItems = [],
  loreCarnetEnabled = false,
  onQcmAnswered,
  canMoveMascot,
  boardMovement = null,
  onDiceRollResult = null,
  canRequestAction,
  markerArrivalEnabled = true,
  selectedTeamId,
  currentTeamId,
  mascotStateMachine,
  kingdomZones = [],
  zoneMusicEnabled = false,
  zoneMusicMuted = false,
  onZoneMusicToggle,
  onWatchTeamPctChange,
  onZoneMusicUnlock,
  brandThemeStyle = null,
  canSpellCast = false,
  onLaunchSpell,
  virtualDiceEnabled = false,
  feuilletZones = [],
  feuilletZoneEditMode = false,
  showPlateauMarkers = true,
  showPlateauZones = false,
  roster = [],
  vitalityEnabled = false,
  vitalityByPlayerId = null,
  playerId = null,
}) {
  const assetsReady = useGlAssetsReady();
  const plateauNumber = chapter?.chapter_plateau_number ?? chapter?.plateau_number ?? null;
  const conventionBoard = useMemo(() => {
    if (!assetsReady || !plateauNumber) return null;
    return plateauBoardImg(plateauNumber);
  }, [assetsReady, plateauNumber]);
  const conventionChapter = useMemo(() => {
    if (!assetsReady || plateauNumber == null) return null;
    return chapterIllustration(plateauNumber);
  }, [assetsReady, plateauNumber]);

  const markerPathNumbers = useMemo(() => {
    if (!boardMovement?.showPathNumbers) return null;
    const sorted = sortMarkersByPath(markers);
    return buildMarkerPathNumberMap(sorted, boardMovement.startIndex);
  }, [boardMovement, markers]);
  const imageUrl = useMemo(
    () =>
      resolveGlBoardImageUrl({
        mapImageUrl: chapter?.map_image_url,
        conventionBoard,
        conventionChapter,
        placeholderUrl: GL_ASSET_PLACEHOLDER_URL,
      }),
    [chapter?.map_image_url, conventionBoard, conventionChapter],
  );
  const [pendingMarker, setPendingMarker] = useState(null);
  const [actionType, setActionType] = useState('explore');
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [boardHeightPx, setBoardHeightPx] = useState(0);
  const boardHeightPxRef = useRef(0);
  const mapGestures = useGlPctMapGestures();
  const prefersReducedMotion = usePrefersReducedMotion();

  const {
    popover: questionPopover,
    effectPopover,
    closePopover,
    closeEffectPopover,
    reshuffle,
    setResult,
    schedulePresentOnArrival,
  } = useGLMarkerArrival({
    teams,
    markers,
    gameId,
    watchTeamId,
    enabled: Boolean(gameId && watchTeamId != null && markerArrivalEnabled),
  });

  const { getPositionForTeam, getMotionForTeam, moveTeamTo } = useGLBoardMascotMotion({
    teams,
    boardHeightPx,
    prefersReducedMotion,
  });

  const qcmOpen = Boolean(questionPopover);
  const effectOpen = Boolean(effectPopover);
  const modalOpen = qcmOpen || effectOpen;

  const {
    popover: zoneContentPopover,
    closePopover: closeZoneContentPopover,
    handlePositionChange: handleZoneContentPositionChange,
  } = useGLZoneContentArrival({
    kingdomZones,
    gameId,
    watchTeamId,
    enabled: Boolean(gameId && watchTeamId != null),
    qcmOpen: modalOpen,
  });

  const {
    discovery: feuilletDiscovery,
    closeDiscovery: closeFeuilletDiscovery,
    handlePositionChange: handleFeuilletPositionChange,
    markRead: markFeuilletRead,
  } = useGLLoreFeuilletArrival({
    kingdomZones,
    gameId,
    watchTeamId,
    enabled: loreCarnetEnabled && Boolean(gameId && watchTeamId != null),
    qcmOpen: modalOpen,
  });

  const [presentedFeuilletZoneIds, setPresentedFeuilletZoneIds] = useState([]);
  const [editZones, setEditZones] = useState(feuilletZones);
  const [editableMarkers, setEditableMarkers] = useState(markers);
  const [plateauPlacement, setPlateauPlacement] = useState({
    handleMapClick: null,
    mapCursor: 'default',
    selectedMarkerId: null,
    selectMarker: null,
  });

  useEffect(() => {
    setEditZones(feuilletZones);
  }, [feuilletZones]);

  useEffect(() => {
    setEditableMarkers(Array.isArray(markers) ? markers : []);
  }, [markers]);

  useEffect(() => {
    if (!gameId || watchTeamId == null) {
      setPresentedFeuilletZoneIds([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGL(
          `/api/gl/games/${gameId}/feuillet-zones/presented?teamId=${Number(watchTeamId)}`,
        );
        if (!cancelled) {
          setPresentedFeuilletZoneIds(Array.isArray(data?.zoneIds) ? data.zoneIds : []);
        }
      } catch {
        if (!cancelled) setPresentedFeuilletZoneIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, watchTeamId]);

  const activeFeuilletZones = feuilletZoneEditMode ? editZones : feuilletZones;
  const displayMarkers = feuilletZoneEditMode || showPlateauMarkers;
  const displayFeuilletZones = feuilletZoneEditMode || showPlateauZones;

  const {
    popover: feuilletZonePopover,
    closePopover: closeFeuilletZonePopover,
    handlePositionChange: handleFeuilletZonePositionChange,
  } = useGLFeuilletZoneArrival({
    feuilletZones: activeFeuilletZones,
    gameId,
    watchTeamId,
    presentedZoneIds: presentedFeuilletZoneIds,
    enabled:
      Boolean(gameId && watchTeamId != null && activeFeuilletZones.length > 0) &&
      !feuilletZoneEditMode,
    qcmOpen: modalOpen,
    loreCarnetEnabled,
  });

  useEffect(() => {
    if (!feuilletZonePopover?.zone?.zoneId || feuilletZonePopover?.loading) return;
    setPresentedFeuilletZoneIds((prev) => {
      const id = String(feuilletZonePopover.zone.zoneId);
      return prev.includes(id) ? prev : [...prev, id];
    });
  }, [feuilletZonePopover?.zone?.zoneId, feuilletZonePopover?.loading]);

  const watchPosition = watchTeamId != null ? getPositionForTeam(watchTeamId) : null;

  useEffect(() => {
    if (watchTeamId == null || !watchPosition || typeof onWatchTeamPctChange !== 'function') return;
    onWatchTeamPctChange({ xp: watchPosition.xp, yp: watchPosition.yp });
  }, [watchTeamId, watchPosition?.xp, watchPosition?.yp, onWatchTeamPctChange]);

  useEffect(() => {
    if (watchTeamId == null || !watchPosition) return undefined;
    const cleanupZone = handleZoneContentPositionChange({
      xp: watchPosition.xp,
      yp: watchPosition.yp,
    });
    const cleanupFeuillet = handleFeuilletPositionChange({
      xp: watchPosition.xp,
      yp: watchPosition.yp,
    });
    const cleanupFeuilletZone = handleFeuilletZonePositionChange({
      xp: watchPosition.xp,
      yp: watchPosition.yp,
    });
    return () => {
      cleanupZone?.();
      cleanupFeuillet?.();
      cleanupFeuilletZone?.();
    };
  }, [
    watchTeamId,
    watchPosition?.xp,
    watchPosition?.yp,
    handleZoneContentPositionChange,
    handleFeuilletPositionChange,
    handleFeuilletZonePositionChange,
  ]);

  useEffect(() => {
    if (!mapFullscreen || modalOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMapFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapFullscreen, modalOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const body = document.body;
    if (mapFullscreen) {
      body.classList.add('gl-map-fullscreen-active');
    } else {
      body.classList.remove('gl-map-fullscreen-active');
    }
    return () => {
      body.classList.remove('gl-map-fullscreen-active');
    };
  }, [mapFullscreen]);

  const resolveActiveTeamId = useCallback(() => {
    const list = Array.isArray(teams) ? teams : [];
    if (watchTeamId != null) return Number(watchTeamId);
    if (selectedTeamId != null) return Number(selectedTeamId);
    return list.length > 0 ? Number(list[0].id) : null;
  }, [teams, selectedTeamId, watchTeamId]);

  const handleBoardMove = useCallback(
    (xp, yp) => {
      const teamId = resolveActiveTeamId();
      if (teamId == null) return;
      moveTeamTo(teamId, xp, yp);
      onBoardClick?.({ xp, yp });
    },
    [resolveActiveTeamId, moveTeamTo, onBoardClick],
  );

  const handleMarkerMove = useCallback(
    (marker) => {
      const teamId = resolveActiveTeamId();
      if (teamId == null) return;
      const xp = Number(marker.x_pct);
      const yp = Number(marker.y_pct);
      moveTeamTo(teamId, xp, yp, { triggerHappy: true, arrival: 'marker' });
      onMarkerClick?.(marker);
      if (isQuestionMarker(marker) || shouldPresentMarkerOnArrival(marker)) {
        schedulePresentOnArrival(marker, teamId, { force: true });
      }
    },
    [resolveActiveTeamId, moveTeamTo, onMarkerClick, schedulePresentOnArrival],
  );

  function handleMarkerClick(marker) {
    if (feuilletZoneEditMode) {
      return;
    }
    if (canMoveMascot) {
      handleMarkerMove(marker);
      return;
    }
    if (canRequestAction && !isQuestionMarker(marker)) {
      setPendingMarker(marker);
    }
  }

  const handlePlateauPlacementReady = useCallback((handlers) => {
    setPlateauPlacement(handlers);
  }, []);

  const handleMarkerPositionSave = useCallback(async (markerId, xPct, yPct) => {
    await apiGL(`/api/gl/chapters/admin/markers/${markerId}`, 'PUT', {
      xPct: Number(xPct),
      yPct: Number(yPct),
    });
  }, []);

  function confirmActionRequest() {
    if (!pendingMarker) return;
    onPlayerActionRequest?.({
      marker: pendingMarker,
      actionType: String(actionType || 'explore'),
    });
    setPendingMarker(null);
  }

  const teamList = Array.isArray(teams) ? teams : [];

  const boardShellClass = mapFullscreen
    ? 'gl-board-shell gl-board-shell--fullscreen'
    : 'gl-board-shell';
  const boardClass = mapFullscreen ? 'gl-board gl-board--fullscreen' : 'gl-board';

  const boardShell = (
    <div
      className={boardShellClass}
      data-testid={mapFullscreen ? 'gl-map-fullscreen-layer' : undefined}
    >
      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={chapter?.title || 'Carte du chapitre'}
        mapGestures={mapGestures}
        className={boardClass}
        cursor={feuilletZoneEditMode ? plateauPlacement.mapCursor : undefined}
        onFitLayout={({ height }) => {
          if (!Number.isFinite(height) || height <= 0) return;
          boardHeightPxRef.current = height;
          setBoardHeightPx(height);
        }}
        onMapPointerDown={() => onZoneMusicUnlock?.()}
        onMapClick={(pct, event) => {
          onZoneMusicUnlock?.();
          if (feuilletZoneEditMode) {
            plateauPlacement.handleMapClick?.(pct, event);
            return;
          }
          if (!canMoveMascot) return;
          const clamped = clampMapMascotPctForViewport(pct.x, pct.y, boardHeightPxRef.current);
          handleBoardMove(clamped.xp, clamped.yp);
        }}
      >
        {feuilletZoneEditMode ? (
          <GLPlateauMapEditor
            zones={editZones}
            onZonesChange={setEditZones}
            markers={editableMarkers}
            editableMarkers={editableMarkers}
            onEditableMarkersChange={setEditableMarkers}
            onMarkerSave={handleMarkerPositionSave}
            presentedZoneIds={presentedFeuilletZoneIds}
            mapGestures={mapGestures}
            plateauNumber={plateauNumber}
            showMarkers
            showZones
            panelTitle="Édition plateau"
            onPlacementReady={handlePlateauPlacementReady}
          />
        ) : displayFeuilletZones ? (
          <GLFeuilletZoneOverlay
            zones={activeFeuilletZones}
            presentedZoneIds={presentedFeuilletZoneIds}
            watchPosition={watchPosition}
          />
        ) : null}

        {displayMarkers ? (
          <GLBoardMarkers
            markers={feuilletZoneEditMode ? editableMarkers : markers}
            selectedMarkerId={feuilletZoneEditMode ? plateauPlacement.selectedMarkerId : null}
            markerPathNumbers={markerPathNumbers}
            onMarkerClick={
              feuilletZoneEditMode
                ? (marker) => plateauPlacement.selectMarker?.(marker.id)
                : handleMarkerClick
            }
          />
        ) : null}

        {teamList.map((team) => {
          const position = getPositionForTeam(team.id);
          const motion = getMotionForTeam(team.id);
          const mascotState = mascotStateMachine?.getStateForTeam?.(team.id);
          return (
            <GLBoardMascot
              key={`mascot-${team.id}`}
              team={team}
              position={position}
              motion={motion}
              mascotState={mascotState}
              prefersReducedMotion={prefersReducedMotion}
              zIndex={
                6 + (selectedTeamId != null && Number(selectedTeamId) === Number(team.id) ? 2 : 0)
              }
            />
          );
        })}

        {teamList.map((team) => {
          const position = getPositionForTeam(team.id);
          const isSelected = selectedTeamId != null && Number(selectedTeamId) === Number(team.id);
          const isCurrentTurn = currentTeamId != null && Number(currentTeamId) === Number(team.id);
          const classes = ['gl-board-team-pin'];
          if (isSelected) classes.push('is-selected');
          if (isCurrentTurn) classes.push('is-current-turn');
          return (
            <button
              key={`pin-${team.id}`}
              type="button"
              className={classes.join(' ')}
              style={{
                left: `${position.xp}%`,
                top: `${position.yp}%`,
                '--gl-team-color': team.color || '#22c55e',
              }}
              title={team.name}
              aria-selected={isSelected}
              data-team-id={team.id}
              data-team-mascot={team.mascot_id || ''}
              onClick={(event) => {
                event.stopPropagation();
                onSelectTeam?.(Number(team.id));
              }}
            >
              <span className="gl-board-team-pin-label">{team.name}</span>
            </button>
          );
        })}
      </GLPctMapCanvas>

      <GLBoardChrome
        mapFullscreen={mapFullscreen}
        onCloseFullscreen={() => setMapFullscreen(false)}
        canSpellCast={canSpellCast}
        onLaunchSpell={onLaunchSpell}
        onOpenFullscreen={() => setMapFullscreen(true)}
        virtualDiceEnabled={virtualDiceEnabled}
        onRollResult={onDiceRollResult}
        gameId={gameId}
        themeStyle={brandThemeStyle}
        zoneMusicEnabled={zoneMusicEnabled}
        zoneMusicMuted={zoneMusicMuted}
        onZoneMusicToggle={onZoneMusicToggle}
      />

      <GLZoneContentPopover
        open={Boolean(zoneContentPopover)}
        zone={zoneContentPopover?.zone}
        popoverMarkdown={zoneContentPopover?.popoverMarkdown}
        popoverImages={zoneContentPopover?.popoverImages}
        loading={zoneContentPopover?.loading}
        error={zoneContentPopover?.error}
        onClose={closeZoneContentPopover}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        glossaryLinkItems={glossaryLinkItems}
        themeStyle={brandThemeStyle}
      />

      <GLFeuilletPopover
        open={Boolean(feuilletZonePopover)}
        titre={feuilletZonePopover?.titre}
        popover={feuilletZonePopover?.popover}
        coutGemme={feuilletZonePopover?.coutGemme}
        gainCoeur={feuilletZonePopover?.gainCoeur}
        loading={feuilletZonePopover?.loading}
        error={feuilletZonePopover?.error}
        onClose={closeFeuilletZonePopover}
        themeStyle={brandThemeStyle}
      />

      <GLFeuilletDiscoveryPopover
        open={Boolean(feuilletDiscovery)}
        feuillet={feuilletDiscovery?.feuillet}
        zone={feuilletDiscovery?.zone}
        loading={feuilletDiscovery?.loading}
        error={feuilletDiscovery?.error}
        onClose={closeFeuilletDiscovery}
        onMarkRead={markFeuilletRead}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        onOpenLoreTerm={onOpenLoreTerm}
        glossaryLinkItems={glossaryLinkItems}
        loreGlossaryLinkItems={loreGlossaryLinkItems}
        themeStyle={brandThemeStyle}
      />

      <GLQcmPopover
        open={Boolean(questionPopover)}
        marker={questionPopover?.marker}
        gameId={gameId}
        teamId={questionPopover?.teamId ?? watchTeamId}
        presentation={questionPopover?.presentation}
        questionCode={questionPopover?.questionCode}
        qcmSet={questionPopover?.qcmSet}
        loading={questionPopover?.loading}
        error={questionPopover?.error}
        result={questionPopover?.result}
        onClose={closePopover}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        onOpenLoreTerm={onOpenLoreTerm}
        glossaryLinkItems={glossaryLinkItems}
        loreGlossaryLinkItems={loreGlossaryLinkItems}
        onAnswered={onQcmAnswered}
        onReshuffle={reshuffle}
        onSubmitResult={setResult}
        themeStyle={brandThemeStyle}
      />

      <GLMarkerEffectPopover
        open={Boolean(effectPopover)}
        marker={effectPopover?.marker}
        gameId={gameId}
        teamId={effectPopover?.teamId ?? watchTeamId}
        arrival={effectPopover?.arrival}
        vitality={effectPopover?.vitality}
        loading={effectPopover?.loading}
        error={effectPopover?.error}
        canApplyEffects={canMoveMascot}
        onClose={closeEffectPopover}
        onApplied={onQcmAnswered}
        themeStyle={brandThemeStyle}
      />
    </div>
  );

  const boardShellNode =
    mapFullscreen && typeof document !== 'undefined' && document.body
      ? createPortal(boardShell, document.body)
      : boardShell;

  return (
    <section className={mapFullscreen ? 'gl-panel gl-panel--map-fullscreen-active' : 'gl-panel'}>
      <div className="gl-map-layout">
        <div className="gl-map-layout__board">
          {!mapFullscreen ? (
            <GLGameBoardHud
              chapterTitle={chapter?.title}
              canSpellCast={canSpellCast}
              onLaunchSpell={onLaunchSpell}
              onOpenFullscreen={() => setMapFullscreen(true)}
            />
          ) : null}
          {boardShellNode}
        </div>
        {!mapFullscreen ? (
          <GLGameBoardRoster
            teams={teamList}
            roster={roster}
            vitalityEnabled={vitalityEnabled}
            vitalityByPlayerId={vitalityByPlayerId}
            currentTeamId={currentTeamId}
            selectedTeamId={selectedTeamId}
            playerId={playerId}
          />
        ) : null}
      </div>

      <DialogShell
        open={!!pendingMarker}
        onClose={() => setPendingMarker(null)}
        overlayClassName="fm-modal-overlay"
        dialogClassName="fm-modal-panel animate-pop gl-action-modal-body"
        ariaLabel="Proposer une action"
      >
        <h3>Proposer une action sur « {pendingMarker?.label} »</h3>
        <label>
          Type d’action
          <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
            <option value="explore">Explorer</option>
            <option value="quiz">Répondre à un quiz</option>
            <option value="observe">Observer la biocénose</option>
            <option value="story">Avancer dans l’histoire</option>
          </select>
        </label>
        <div className="gl-inline-actions">
          <GLButton type="button" onClick={confirmActionRequest}>
            Envoyer la demande
          </GLButton>
          <GLButton type="button" variant="secondary" onClick={() => setPendingMarker(null)}>
            Annuler
          </GLButton>
        </div>
      </DialogShell>
    </section>
  );
}
