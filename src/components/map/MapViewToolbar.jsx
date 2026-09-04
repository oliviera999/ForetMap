import { Tooltip } from '../../shared/components/Tooltip.jsx';
import { HelpPanel } from '../HelpPanel';
import { useHelp } from '../../hooks/useHelp';
import {
  resolveHelpChrome,
  resolveHelpPanelSection,
  resolveHelpQuickTip,
  resolveTooltipKey,
} from '../../utils/helpResolve';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { MAP_VIEW_SCALE_MIN, MAP_VIEW_SCALE_MAX } from '../../hooks/useMapGestures.js';
import {
  EDGE_SNAP_DEFAULTS,
  EDGE_SNAP_SENSITIVITY_MAX,
  EDGE_SNAP_SENSITIVITY_MIN,
} from '../../utils/edgeSnap.js';
import {
  IconCheck,
  IconClose,
  IconDelete,
  IconDrawZone,
  IconEdit,
  IconFullscreen,
  IconGps,
  IconHand,
  IconLabels,
  IconLock,
  IconMagnet,
  IconMarker,
  IconMultiOff,
  IconMultiOn,
  IconSave,
  IconSignalLow,
  IconSlider,
  IconTarget,
  IconUndo,
  IconUnlock,
  IconWarning,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '../../shared/icons.jsx';

/** Style « pilule » des bascules d'édition de contour (aligné sur le verrou repères). */
function editTogglePillStyle(on) {
  return {
    background: on ? '#ecfdf3' : 'transparent',
    border: '1.5px solid var(--mint)',
    color: on ? '#166534' : 'var(--forest)',
    borderRadius: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    fontWeight: 'var(--fw-bold)',
    minHeight: 36,
    whiteSpace: 'nowrap',
  };
}

/**
 * Barre d'outils de `MapView` + astuce contextuelle : sélecteur de carte, modes
 * (navigation / tracé de zone / repère), contrôles du tracé et de l'édition de
 * contour, verrou repères, gestes mobiles, étiquettes, zoom et panneau d'aide.
 * L'état reste détenu par `MapView` (composant contrôlé) ; seuls les refs de
 * gestes (`containerRef`/`txRef`) sont lus pour le zoom centré.
 */
export function MapViewToolbar({
  maps = [],
  activeMapId,
  onMapChange,
  mode,
  isTeacher,
  drawPointsCount = 0,
  onModeButtonClick,
  onFinishZone,
  onUndoPoint,
  onCancelDraw,
  editZoneName,
  editCanUndo,
  onUndoEditPoints,
  onSaveEditPoints,
  onExitEditPoints,
  editPointsCount = 0,
  selectedPointsCount = 0,
  insertVertexMode = false,
  onToggleInsertVertexMode,
  canRemoveSelection = false,
  onRemoveSelectedPoints,
  multiSelectMode = false,
  onToggleMultiSelectMode,
  snapEnabled = false,
  snapStatus = 'idle',
  onToggleSnap,
  snapRadiusPx = 18,
  onSnapRadiusChange,
  snapSensitivity = EDGE_SNAP_DEFAULTS.sensitivity,
  onSnapSensitivityChange,
  onSnapSelectedPoints,
  canManageMarkerPositions,
  markerPositionUnlocked,
  onToggleMarkerPositionLock,
  isCoarsePointer,
  mobileInteractionsActive,
  onToggleMapInteraction,
  showLabels,
  onToggleLabels,
  clusterMarkersEnabled = true,
  onToggleClusterMarkers = null,
  mapTextSizeLabel = 'Aa',
  onCycleMapTextSize,
  gps,
  containerRef,
  txRef,
  fitMap,
  animateZoomTowardScale,
  onOpenFullscreen,
}) {
  const publicSettings = usePublicSettings();
  const {
    isHelpEnabled,
    showContextHints,
    pulseUnseenPanels,
    hasSeenSection,
    markSectionSeen,
    trackPanelOpen,
    trackPanelDismiss,
  } = useHelp({ publicSettings, isTeacher });
  const helpMap = resolveHelpPanelSection('map', publicSettings);
  const helpChrome = resolveHelpChrome(publicSettings);
  const helpHintPrefix = helpChrome.hintPrefix;
  const helpPanelTitlePrefix = helpChrome.panelTitlePrefix;
  const helpPanelCloseCta = helpChrome.panelCloseCta;
  const helpPanelDismissCta = helpChrome.panelDismissCta;
  const mapQuickTip = resolveHelpQuickTip('map', publicSettings);
  const tooltipText = (path) => resolveTooltipKey(path, publicSettings, isTeacher);

  return (
    <>
      <div
        className="map-view-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          background: 'white',
          borderBottom: '1.5px solid var(--mint)',
          flexShrink: 0,
          minHeight: 50,
        }}
      >
        {maps.length > 1 &&
          (maps.length > 4 ? (
            <select
              className="map-switch-select"
              value={activeMapId}
              onChange={(event) => onMapChange?.(event.target.value)}
              aria-label="Sélection de carte active"
            >
              {maps.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.label}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="map-switch-inline"
              style={{
                display: 'flex',
                gap: 3,
                background: 'var(--parchment)',
                borderRadius: 10,
                padding: 3,
              }}
            >
              {maps.map((mp) => (
                <button
                  key={mp.id}
                  className="map-toolbar-mode-btn"
                  style={{
                    background: activeMapId === mp.id ? 'var(--forest)' : 'transparent',
                    color: activeMapId === mp.id ? 'white' : 'var(--soil)',
                  }}
                  onClick={() => onMapChange?.(mp.id)}
                >
                  {mp.label}
                </button>
              ))}
            </div>
          ))}

        <div
          style={{
            display: 'flex',
            gap: 3,
            background: 'var(--parchment)',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {[
            [
              'view',
              <>
                <IconHand size={15} /> Nav
              </>,
            ],
            ...(isTeacher && mode !== 'edit-points'
              ? [
                  [
                    'draw-zone',
                    <>
                      <IconDrawZone size={15} /> Zone
                      {mode === 'draw-zone' && drawPointsCount > 0 ? ` (${drawPointsCount})` : ''}
                    </>,
                  ],
                  [
                    'add-marker',
                    <>
                      <IconMarker size={15} /> Repère
                    </>,
                  ],
                ]
              : []),
          ].map(([m, label]) => (
            <button
              key={m}
              className="map-toolbar-mode-btn map-toolbar-mode-btn--nav"
              style={{
                background: mode === m ? 'var(--forest)' : 'transparent',
                color: mode === m ? 'white' : 'var(--soil)',
              }}
              onClick={() => onModeButtonClick(m)}
            >
              {label}
            </button>
          ))}
        </div>

        {isTeacher && mode === 'draw-zone' && drawPointsCount > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {drawPointsCount >= 3 && (
              <button className="btn btn-secondary btn-sm" onClick={onFinishZone}>
                <IconCheck size={15} /> Terminer
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onUndoPoint}>
              <IconUndo size={15} /> Annuler
            </button>
            <button
              className="btn btn-danger btn-sm"
              aria-label="Annuler le tracé"
              onClick={onCancelDraw}
            >
              <IconClose size={15} />
            </button>
          </div>
        )}
        {mode === 'edit-points' && (
          <div
            className="map-edit-points-toolbar"
            role="toolbar"
            aria-label="Édition du contour"
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
          >
            <span className="map-edit-zone-badge">
              <IconEdit size={15} /> {editZoneName}
              {editPointsCount ? ` · ${editPointsCount} pts` : ''}
              {selectedPointsCount ? ` (${selectedPointsCount} sél.)` : ''}
            </span>
            <button
              type="button"
              className="map-toolbar-pill"
              style={editTogglePillStyle(insertVertexMode)}
              aria-pressed={insertVertexMode}
              onClick={onToggleInsertVertexMode}
              title="Ajouter un sommet : cliquez ensuite sur un bord du contour. Sans ce mode, tirez une poignée pointillée au milieu d’une arête."
            >
              {insertVertexMode ? (
                <>
                  <IconClose size={15} /> Ajout
                </>
              ) : (
                <>
                  <IconZoomIn size={15} /> Sommet
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canRemoveSelection}
              onClick={onRemoveSelectedPoints}
              aria-label={
                selectedPointsCount > 1
                  ? `Retirer ${selectedPointsCount} sommets`
                  : 'Retirer le sommet'
              }
              title="Retirer les sommets sélectionnés (touche Suppr). Un contour garde au moins 3 sommets."
            >
              <IconDelete size={15} />{' '}
              {selectedPointsCount > 1 ? `${selectedPointsCount} sommets` : 'Sommet'}
            </button>
            <button
              type="button"
              className="map-toolbar-pill"
              style={editTogglePillStyle(multiSelectMode)}
              aria-pressed={multiSelectMode}
              onClick={onToggleMultiSelectMode}
              title="Sélection multiple : chaque appui ajoute ou retire un sommet (équivaut à Maj+clic, pratique au doigt)."
            >
              {multiSelectMode ? <IconMultiOn size={15} /> : <IconMultiOff size={15} />} Multi
            </button>
            <button
              type="button"
              className="map-toolbar-pill"
              style={editTogglePillStyle(snapEnabled && snapStatus !== 'unavailable')}
              aria-pressed={snapEnabled}
              onClick={onToggleSnap}
              title="Aimant : le sommet déplacé se colle au contour le plus contrasté de l'image de fond, en privilégiant les angles droits. Maintenir Alt le désactive le temps d'un geste."
            >
              <IconMagnet size={15} />{' '}
              {snapEnabled && snapStatus === 'loading'
                ? 'Analyse…'
                : snapEnabled && snapStatus === 'unavailable'
                  ? 'Indispo.'
                  : 'Aimant'}
            </button>
            {snapEnabled && snapStatus === 'ready' && (
              <>
                <label
                  className="map-snap-setting map-snap-radius"
                  title="Rayon d’accroche : jusqu’à quelle distance l’aimant va chercher un contour."
                >
                  <IconTarget size={15} />
                  <input
                    type="range"
                    min={6}
                    max={48}
                    step={2}
                    value={snapRadiusPx}
                    aria-label={`Rayon d’accroche de l’aimant : ${snapRadiusPx} pixels`}
                    onChange={(e) => onSnapRadiusChange?.(Number(e.target.value))}
                  />
                  <span>{snapRadiusPx}px</span>
                </label>
                <label
                  className="map-snap-setting map-snap-sensitivity"
                  title="Sensibilité : à quel point un contour doit être marqué pour attirer le sommet. Bas = seules les limites franches ; haut = les transitions ténues aussi (au risque d’accrocher une ombre)."
                >
                  <IconSlider size={15} />
                  <input
                    type="range"
                    min={EDGE_SNAP_SENSITIVITY_MIN}
                    max={EDGE_SNAP_SENSITIVITY_MAX}
                    step={1}
                    value={snapSensitivity}
                    aria-label={`Sensibilité de l’aimant : niveau ${snapSensitivity} sur ${EDGE_SNAP_SENSITIVITY_MAX}`}
                    onChange={(e) => onSnapSensitivityChange?.(Number(e.target.value))}
                  />
                  <span>
                    {snapSensitivity}/{EDGE_SNAP_SENSITIVITY_MAX}
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onSnapSelectedPoints}
                  title="Coller les sommets sélectionnés — ou tout le contour si rien n’est sélectionné — sur les contours de l’image."
                >
                  <IconMagnet size={15} /> Coller
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!editCanUndo}
              onClick={onUndoEditPoints}
              title="Annuler la dernière modification (Ctrl+Z ou Cmd+Z)"
            >
              <IconUndo size={15} /> Annuler
            </button>
            <button className="btn btn-primary btn-sm" onClick={onSaveEditPoints}>
              <IconSave size={15} /> Enregistrer
            </button>
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Quitter l'édition"
              onClick={onExitEditPoints}
            >
              <IconClose size={15} />
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {typeof onOpenFullscreen === 'function' ? (
            <button
              type="button"
              className="fm-map-fullscreen-open"
              data-testid="map-view-fullscreen-open"
              aria-label="Afficher la carte en plein écran"
              onClick={onOpenFullscreen}
            >
              <IconFullscreen size={15} /> Plein écran
            </button>
          ) : null}
          {canManageMarkerPositions && (
            <button
              aria-label={
                markerPositionUnlocked
                  ? 'Verrouiller la position des repères'
                  : 'Déverrouiller la position des repères'
              }
              className="map-toolbar-pill"
              onClick={onToggleMarkerPositionLock}
              style={{
                background: markerPositionUnlocked ? '#ecfdf3' : 'transparent',
                border: '1.5px solid var(--mint)',
                color: markerPositionUnlocked ? '#166534' : 'var(--forest)',
              }}
            >
              {markerPositionUnlocked ? <IconUnlock size={15} /> : <IconLock size={15} />} Repères
            </button>
          )}
          {isCoarsePointer && mode === 'view' && (
            <Tooltip text={tooltipText('map.toggleGestures')}>
              <button
                className={`map-gesture-toggle ${mobileInteractionsActive ? 'is-on' : ''}`}
                onClick={onToggleMapInteraction}
                aria-label={
                  mobileInteractionsActive
                    ? 'Désactiver les gestes carte'
                    : 'Activer les gestes carte'
                }
              >
                {mobileInteractionsActive ? <IconUnlock size={15} /> : <IconLock size={15} />}{' '}
                Gestes
              </button>
            </Tooltip>
          )}
          {gps?.available && mode === 'view' ? (
            <Tooltip text="Faire suivre votre position GPS par la mascotte">
              <button
                type="button"
                className={`map-gps-follow-toggle map-toolbar-pill ${gps.active ? 'is-on' : ''}`}
                onClick={gps.toggle}
                aria-pressed={gps.active}
                aria-label={
                  gps.active ? 'Désactiver le suivi GPS' : 'Suivre ma position avec la mascotte'
                }
                title={
                  !gps.active
                    ? 'Suivre ma position'
                    : gps.status === 'denied'
                      ? 'Localisation refusée — autorisez l’accès'
                      : gps.feedback === 'bad_georef'
                        ? 'Calage GPS du plan incohérent'
                        : gps.feedback === 'out_of_bounds'
                          ? 'Vous semblez hors de la zone du plan'
                          : gps.feedback === 'low_accuracy'
                            ? 'Signal GPS faible'
                            : !gps.feedback && gps.error
                              ? gps.error
                              : gps.status === 'prompt'
                                ? 'Acquisition de la position…'
                                : 'Suivi GPS actif'
                }
                style={{
                  background: gps.active ? 'var(--forest)' : 'transparent',
                  color: gps.active ? 'white' : 'var(--forest)',
                }}
              >
                <IconGps size={15} />{' '}
                {!gps.active ? (
                  'Me suivre'
                ) : gps.status === 'denied' ||
                  gps.feedback === 'out_of_bounds' ||
                  gps.feedback === 'bad_georef' ||
                  (!gps.feedback && gps.error) ? (
                  <IconWarning size={15} />
                ) : gps.feedback === 'low_accuracy' ? (
                  <IconSignalLow size={15} />
                ) : (
                  'Suivi'
                )}
              </button>
            </Tooltip>
          ) : null}
          <Tooltip text="Taille du texte sur la carte (Normal / Grand / Très grand)">
            <button
              type="button"
              className="map-toolbar-text-size-btn"
              aria-label="Changer la taille du texte sur la carte"
              onClick={onCycleMapTextSize ?? (() => {})}
            >
              {mapTextSizeLabel}
            </button>
          </Tooltip>
          <Tooltip text={tooltipText('map.toggleLabels')}>
            <button
              type="button"
              className={`map-toolbar-labels-btn ${showLabels ? 'is-on' : ''}`}
              aria-label={showLabels ? 'Masquer les noms' : 'Afficher les noms'}
              onClick={onToggleLabels}
            >
              <IconLabels size={15} />
            </button>
          </Tooltip>
          {onToggleClusterMarkers ? (
            <Tooltip
              text={
                clusterMarkersEnabled
                  ? 'Repères regroupés au dézoom : afficher tous les repères'
                  : 'Tous les repères affichés : regrouper au dézoom'
              }
            >
              <button
                type="button"
                className={`map-toolbar-labels-btn ${clusterMarkersEnabled ? 'is-on' : ''}`}
                aria-pressed={clusterMarkersEnabled}
                aria-label={
                  clusterMarkersEnabled
                    ? 'Afficher tous les repères sans regroupement'
                    : 'Regrouper les repères au dézoom'
                }
                onClick={onToggleClusterMarkers}
              >
                <span aria-hidden>⛶</span>
              </button>
            </Tooltip>
          ) : null}
          <div className="map-toolbar-zoom-group">
            {[
              [IconZoomIn, 1.28, 'map.zoomIn', 'Zoomer la carte'],
              [IconZoomOut, 0.78, 'map.zoomOut', 'Dézoomer la carte'],
              [IconZoomReset, 0, 'map.zoomReset', 'Recentrer la carte'],
            ].map(([ZoomGlyph, factor, helpEntry, ariaLabel]) => (
              <Tooltip key={helpEntry} text={tooltipText(helpEntry)}>
                <button
                  type="button"
                  className="map-toolbar-zoom-btn"
                  onClick={() => {
                    if (factor === 0) {
                      fitMap();
                      return;
                    }
                    const c = containerRef.current;
                    if (!c) return;
                    const mx = c.clientWidth / 2;
                    const my = c.clientHeight / 2;
                    const ns =
                      factor > 1
                        ? Math.min(txRef.current.s * factor, MAP_VIEW_SCALE_MAX)
                        : Math.max(txRef.current.s * factor, MAP_VIEW_SCALE_MIN);
                    animateZoomTowardScale(ns, mx, my);
                  }}
                  aria-label={ariaLabel}
                >
                  <ZoomGlyph size={15} />
                </button>
              </Tooltip>
            ))}
          </div>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="map"
              title={helpMap.title}
              entries={helpMap.items}
              isTeacher={isTeacher}
              isPulsing={pulseUnseenPanels && !hasSeenSection('map')}
              panelTitlePrefix={helpPanelTitlePrefix}
              closeButtonText={helpPanelCloseCta}
              dismissButtonText={helpPanelDismissCta}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
        </div>
      </div>
      {isHelpEnabled && showContextHints && mapQuickTip ? (
        <p className="section-sub" style={{ margin: '8px 12px 0' }}>
          <strong>{helpHintPrefix}</strong> {mapQuickTip}
        </p>
      ) : null}
    </>
  );
}
