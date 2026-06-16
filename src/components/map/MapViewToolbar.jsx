import React from 'react';

import { Tooltip } from '../Tooltip';
import { HelpPanel } from '../HelpPanel';
import { useHelp } from '../../hooks/useHelp';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../../constants/help';
import { getContentText } from '../../utils/content';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';

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
  canManageMarkerPositions,
  markerPositionUnlocked,
  onToggleMarkerPositionLock,
  isCoarsePointer,
  mobileInteractionsActive,
  onToggleMapInteraction,
  showLabels,
  onToggleLabels,
  containerRef,
  txRef,
  fitMap,
  animateZoomTowardScale,
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
  const helpMap = HELP_PANELS.map;
  const helpHintPrefix = getContentText(publicSettings, 'help.hint_prefix', 'Astuce :');
  const helpPanelTitlePrefix = getContentText(publicSettings, 'help.panel_title_prefix', '💡');
  const helpPanelCloseCta = getContentText(publicSettings, 'help.panel_close_cta', 'Fermer');
  const helpPanelDismissCta = getContentText(
    publicSettings,
    'help.panel_dismiss_cta',
    'Ne plus afficher',
  );
  const mapQuickTip = getContentText(
    publicSettings,
    'help.map_quick_tip',
    'Clique une zone ou un repère puis ouvre ? pour les actions guidées.',
  );
  const tooltipText = (entry) => resolveRoleText(entry, isTeacher);

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
                  style={{
                    background: activeMapId === mp.id ? 'var(--forest)' : 'transparent',
                    color: activeMapId === mp.id ? 'white' : 'var(--soil)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 11px',
                    cursor: 'pointer',
                    fontFamily: 'DM Sans,sans-serif',
                    fontSize: '.82rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
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
            ['view', '🖐️ Nav'],
            ...(isTeacher && mode !== 'edit-points'
              ? [
                  [
                    'draw-zone',
                    `🖊️ Zone${mode === 'draw-zone' && drawPointsCount > 0 ? ` (${drawPointsCount})` : ''}`,
                  ],
                  ['add-marker', '📍 Repère'],
                ]
              : []),
          ].map(([m, label]) => (
            <button
              key={m}
              style={{
                background: mode === m ? 'var(--forest)' : 'transparent',
                color: mode === m ? 'white' : 'var(--soil)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 11px',
                cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif',
                fontSize: '.82rem',
                fontWeight: 600,
                transition: 'all .15s',
                whiteSpace: 'nowrap',
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
                ✅ Terminer
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onUndoPoint}>
              ↩ Undo
            </button>
            <button className="btn btn-danger btn-sm" onClick={onCancelDraw}>
              ✕
            </button>
          </div>
        )}
        {mode === 'edit-points' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span
              style={{
                fontSize: '.8rem',
                color: 'var(--leaf)',
                fontWeight: 700,
                background: '#f0fdf4',
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid var(--mint)',
              }}
            >
              ✏️ {editZoneName}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!editCanUndo}
              onClick={onUndoEditPoints}
              title="Annuler la dernière modification (Ctrl+Z ou Cmd+Z)"
            >
              ↩ Annuler
            </button>
            <button className="btn btn-primary btn-sm" onClick={onSaveEditPoints}>
              💾 Sauver
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onExitEditPoints}>
              ✕
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {canManageMarkerPositions && (
            <button
              aria-label={
                markerPositionUnlocked
                  ? 'Verrouiller la position des repères'
                  : 'Déverrouiller la position des repères'
              }
              onClick={onToggleMarkerPositionLock}
              style={{
                background: markerPositionUnlocked ? '#ecfdf3' : 'transparent',
                border: '1.5px solid var(--mint)',
                color: markerPositionUnlocked ? '#166534' : 'var(--forest)',
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '.78rem',
                fontWeight: 700,
                minHeight: 36,
              }}
            >
              {markerPositionUnlocked ? '🔓 Repères' : '🔒 Repères'}
            </button>
          )}
          {isCoarsePointer && mode === 'view' && (
            <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleGestures)}>
              <button
                className={`map-gesture-toggle ${mobileInteractionsActive ? 'is-on' : ''}`}
                onClick={onToggleMapInteraction}
                aria-label={
                  mobileInteractionsActive
                    ? 'Désactiver les gestes carte'
                    : 'Activer les gestes carte'
                }
              >
                {mobileInteractionsActive ? '🔓 Gestes' : '🔒 Gestes'}
              </button>
            </Tooltip>
          )}
          <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleLabels)}>
            <button
              aria-label={showLabels ? 'Masquer les noms' : 'Afficher les noms'}
              onClick={onToggleLabels}
              style={{
                background: showLabels ? 'var(--mint)' : 'transparent',
                border: '1.5px solid var(--mint)',
                color: 'var(--forest)',
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '.9rem',
              }}
            >
              🏷️
            </button>
          </Tooltip>
          <div
            style={{
              display: 'flex',
              background: 'var(--parchment)',
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            {[
              ['＋', 1.28, HELP_TOOLTIPS.map.zoomIn, 'Zoomer la carte'],
              ['－', 0.78, HELP_TOOLTIPS.map.zoomOut, 'Dézoomer la carte'],
              ['⊡', 0, HELP_TOOLTIPS.map.zoomReset, 'Recentrer la carte'],
            ].map(([label, factor, helpEntry, ariaLabel]) => (
              <Tooltip key={label} text={tooltipText(helpEntry)}>
                <button
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
                        ? Math.min(txRef.current.s * factor, 6)
                        : Math.max(txRef.current.s * factor, 0.15);
                    animateZoomTowardScale(ns, mx, my);
                  }}
                  aria-label={ariaLabel}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--soil)',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    borderRadius: 7,
                  }}
                >
                  {label}
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
