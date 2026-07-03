import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';
import { resolveMascotDialogLine } from '../utils/visitMascotDialogApply.js';
import { VISIT_MASCOT_INTERACTION_EVENT } from '../utils/visitMascotInteractionEvents.js';
import { resolveVisitMascotInteraction } from '../utils/visitMascotInteractionApply.js';
import { getTapActions, runBehaviorAction } from '../utils/mascotBehaviorEngine.js';
import useAmbientMascotBehavior from './useAmbientMascotBehavior.js';
import useVisitMascotStateMachine from './useVisitMascotStateMachine.js';
import {
  loadVisitMascotPositionPct,
  saveVisitMascotPositionPct,
} from '../utils/visitMascotPositionPersistence.js';
import { computeVisitMascotStartPct } from '../utils/visitMascotPlacement.js';
import { parseVisitMascotAllowedIds } from '../utils/visitViewStatus.js';
import { clampVisitMascotPctForViewport } from '../utils/visitMascotGeometry.js';

export const VISIT_MAP_MASCOT_MOVE_MS = 560;
export const VISIT_MAP_MASCOT_HAPPY_MS = 1800;
export const VISIT_MASCOT_DIALOG_MS = 2600;
export const VISIT_MASCOT_DIALOG_MOVE_COOLDOWN_MS = 4200;

/**
 * Contrôleur de la mascotte du plan de visite.
 *
 * Extraction iso-comportement de VisitViewImpl (visit-views.jsx) : regroupe les
 * états (position %, orientation, marche, joie, bulle de dialogue), les minuteries
 * (déplacement, joie, bulle, cooldown des bulles « move », ouverture différée du
 * panneau lieu) et les effets associés (placement initial par carte, reset au
 * changement de carte, nettoyage à l'unmount). Les timings sont préservés à
 * l'identique (cf. constantes exportées).
 *
 * @param {object} params
 * @param {string} params.mapId carte courante.
 * @param {boolean} params.loading chargement visite en cours (suspend le placement).
 * @param {{ map_id?: string, markers?: Array, mascot_packs?: Array }} params.content contenu visite.
 * @param {boolean} params.prefersReducedMotion préférence utilisateur (mouvement réduit).
 * @param {string|null} params.profileVisitMascotId mascotte du profil (prioritaire).
 * @param {{ current: { height?: number }|null }} params.visitMapFitRef rect « contain » courant (lecture impérative).
 * @param {number} params.viewportFitHeight hauteur du rect « contain » (état — pilote le clamp du rendu).
 * @param {(item: object|null) => void} params.setSelected sélection du panneau détail.
 * @param {(type: ('zone'|'marker')|null) => void} params.setSelectedType type de sélection.
 */
export function useVisitMapMascotController({
  mapId,
  loading,
  content,
  prefersReducedMotion,
  profileVisitMascotId,
  visitMapFitRef,
  viewportFitHeight,
  setSelected,
  setSelectedType,
}) {
  const publicSettings = usePublicSettings();
  const visitMascotAllowedIds = useMemo(
    () => parseVisitMascotAllowedIds(publicSettings?.visit?.mascot?.allowed_ids),
    [publicSettings?.visit?.mascot?.allowed_ids],
  );
  const visitMascotDefaultId =
    String(publicSettings?.visit?.mascot?.default_id || '').trim() || 'renard2-cut-spritesheet';

  const [visitMapMascotPct, setVisitMapMascotPct] = useState({ xp: 50, yp: 50 });
  const [visitMapMascotFaceRight, setVisitMapMascotFaceRight] = useState(true);
  const [visitMapMascotWalking, setVisitMapMascotWalking] = useState(false);
  const [visitMapMascotHappy, setVisitMapMascotHappy] = useState(false);
  const [visitMascotDialog, setVisitMascotDialog] = useState('');
  const [visitMascotDialogVisible, setVisitMascotDialogVisible] = useState(false);
  const visitMapMascotPctRef = useRef({ xp: 50, yp: 50 });
  const visitMapMascotMoveTimeoutRef = useRef(null);
  /** Ouverture du panneau lieu après la fin du déplacement mascotte (mode vue). */
  const visitDetailPanelAfterMoveTimeoutRef = useRef(null);
  const visitMapMascotHappyTimeoutRef = useRef(null);
  const visitMascotDialogTimeoutRef = useRef(null);
  const visitMascotMoveDialogCooldownUntilRef = useRef(0);
  const visitMascotStartPlacedForMapRef = useRef(null);

  const visitMascotCatalogExtras = useMemo(
    () => buildVisitMascotCatalogExtrasFromContent(content.mascot_packs),
    [content.mascot_packs],
  );

  const {
    visitMascotId,
    visitMascotOptions,
    visitMascotAnimationState,
    activeMascotEntry,
    onChangeVisitMascotId,
    triggerMascotTransientState,
    resetMascotTransientState,
  } = useVisitMascotStateMachine({
    walking: visitMapMascotWalking,
    happy: visitMapMascotHappy,
    extraCatalogEntries: visitMascotCatalogExtras,
    preferredMascotId: profileVisitMascotId,
    allowedMascotIds: visitMascotAllowedIds,
    defaultMascotId: visitMascotDefaultId,
  });

  /** Changement de carte : coupe minuteries et états transitoires (la vue gère sa part transform/mode). */
  useEffect(() => {
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    if (visitDetailPanelAfterMoveTimeoutRef.current) {
      clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      visitDetailPanelAfterMoveTimeoutRef.current = null;
    }
    if (visitMapMascotHappyTimeoutRef.current) {
      clearTimeout(visitMapMascotHappyTimeoutRef.current);
      visitMapMascotHappyTimeoutRef.current = null;
    }
    if (visitMascotDialogTimeoutRef.current) {
      clearTimeout(visitMascotDialogTimeoutRef.current);
      visitMascotDialogTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
    setVisitMapMascotHappy(false);
    resetMascotTransientState();
    setVisitMascotDialogVisible(false);
  }, [mapId, resetMascotTransientState]);

  const visitMascotMarkerPlacementKey = useMemo(() => {
    const markers = Array.isArray(content.markers) ? content.markers : [];
    return markers
      .map(
        (m) =>
          `${m.id ?? ''}:${m.x_pct ?? ''}:${m.y_pct ?? ''}:${String(m.label ?? '')
            .trim()
            .toLowerCase()}`,
      )
      .join('|');
  }, [content.markers]);

  useLayoutEffect(() => {
    visitMascotStartPlacedForMapRef.current = null;
  }, [mapId, visitMascotMarkerPlacementKey]);

  useLayoutEffect(() => {
    if (loading) return;
    if (content.map_id != null && String(content.map_id) !== String(mapId)) return;
    if (visitMascotStartPlacedForMapRef.current === mapId) return;
    visitMascotStartPlacedForMapRef.current = mapId;
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
    setVisitMapMascotHappy(false);
    const stored = loadVisitMascotPositionPct(mapId);
    const fallback = computeVisitMascotStartPct(mapId, content.markers || []);
    const start = stored ?? fallback;
    visitMapMascotPctRef.current = start;
    setVisitMapMascotPct(start);
    saveVisitMascotPositionPct(mapId, start);
  }, [mapId, loading, content.map_id, content.markers]);

  useEffect(() => {
    visitMapMascotPctRef.current = visitMapMascotPct;
  }, [visitMapMascotPct]);

  /** Unmount : coupe toutes les minuteries mascotte. */
  useEffect(
    () => () => {
      if (visitMapMascotMoveTimeoutRef.current) clearTimeout(visitMapMascotMoveTimeoutRef.current);
      if (visitDetailPanelAfterMoveTimeoutRef.current)
        clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      if (visitMapMascotHappyTimeoutRef.current)
        clearTimeout(visitMapMascotHappyTimeoutRef.current);
      if (visitMascotDialogTimeoutRef.current) clearTimeout(visitMascotDialogTimeoutRef.current);
    },
    [],
  );

  const mascotDialogSettings = useMemo(
    () => publicSettings?.visit?.mascot?.dialog || null,
    [publicSettings?.visit?.mascot?.dialog],
  );

  const showMascotDialog = useCallback(
    (eventKey, { force = false } = {}) => {
      const now = Date.now();
      if (!force && eventKey === 'move' && now < visitMascotMoveDialogCooldownUntilRef.current)
        return;
      const text = resolveMascotDialogLine(eventKey, {
        mascotId: visitMascotId,
        extraCatalogEntries: visitMascotCatalogExtras,
        globalDefaults: mascotDialogSettings?.defaults || null,
        catalogOverrides: mascotDialogSettings?.catalogOverrides || null,
      });
      if (!text) return;
      if (eventKey === 'move') {
        visitMascotMoveDialogCooldownUntilRef.current = now + VISIT_MASCOT_DIALOG_MOVE_COOLDOWN_MS;
      }
      if (visitMascotDialogTimeoutRef.current) clearTimeout(visitMascotDialogTimeoutRef.current);
      setVisitMascotDialog(text);
      setVisitMascotDialogVisible(true);
      visitMascotDialogTimeoutRef.current = window.setTimeout(() => {
        setVisitMascotDialogVisible(false);
        visitMascotDialogTimeoutRef.current = null;
      }, VISIT_MASCOT_DIALOG_MS);
    },
    [visitMascotId, visitMascotCatalogExtras, mascotDialogSettings],
  );

  /** Affiche une bulle à partir de lignes brutes (déclencheurs personnalisés du pack). */
  const showMascotDialogLines = useCallback((lines) => {
    const arr = Array.isArray(lines) ? lines.filter((l) => String(l || '').trim()) : [];
    if (!arr.length) return;
    const text = String(arr[Math.floor(Math.random() * arr.length)] || '').trim();
    if (!text) return;
    if (visitMascotDialogTimeoutRef.current) clearTimeout(visitMascotDialogTimeoutRef.current);
    setVisitMascotDialog(text);
    setVisitMascotDialogVisible(true);
    visitMascotDialogTimeoutRef.current = window.setTimeout(() => {
      setVisitMascotDialogVisible(false);
      visitMascotDialogTimeoutRef.current = null;
    }, VISIT_MASCOT_DIALOG_MS);
  }, []);

  const triggerMascotHappy = useCallback(() => {
    if (visitMapMascotHappyTimeoutRef.current) {
      clearTimeout(visitMapMascotHappyTimeoutRef.current);
      visitMapMascotHappyTimeoutRef.current = null;
    }
    setVisitMapMascotHappy(true);
    visitMapMascotHappyTimeoutRef.current = window.setTimeout(() => {
      setVisitMapMascotHappy(false);
      visitMapMascotHappyTimeoutRef.current = null;
    }, VISIT_MAP_MASCOT_HAPPY_MS);
  }, []);

  /**
   * Émetteur déclaratif : un événement d'interaction nommé est résolu via le
   * profil du pack actif (`interactionProfile`, défaut = comportement historique)
   * puis appliqué. Découple les vues des états/durées câblés en dur.
   */
  const emitMascotEvent = useCallback(
    (eventKey) => {
      const resolved = resolveVisitMascotInteraction(eventKey, {
        mascotId: visitMascotId,
        extraCatalogEntries: visitMascotCatalogExtras,
      });
      if (resolved?.kind === 'happy') {
        triggerMascotHappy();
      } else if (resolved?.kind === 'transient' && resolved.state) {
        triggerMascotTransientState(resolved.state, resolved.durationMs);
      }
    },
    [visitMascotId, visitMascotCatalogExtras, triggerMascotHappy, triggerMascotTransientState],
  );

  const moveVisitMapMascotTo = useCallback(
    (xp, yp) => {
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return;
      const target = clampVisitMascotPctForViewport(xp, yp, visitMapFitRef.current?.height || 0);
      const nx = target.xp;
      const ny = target.yp;
      const prev = visitMapMascotPctRef.current;
      const dist = Math.hypot(nx - prev.xp, ny - prev.yp);
      if (dist < 0.08) return;

      const dx = nx - prev.xp;
      if (Math.abs(dx) > 0.12) setVisitMapMascotFaceRight(dx > 0);

      if (visitMapMascotMoveTimeoutRef.current) {
        clearTimeout(visitMapMascotMoveTimeoutRef.current);
        visitMapMascotMoveTimeoutRef.current = null;
      }

      if (prefersReducedMotion) {
        setVisitMapMascotWalking(false);
      } else {
        setVisitMapMascotWalking(true);
        if (dist > 15) {
          emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE);
          showMascotDialog('running');
        } else if (dist > 9) {
          emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_LARGE);
          showMascotDialog('surprise');
        }
        if (dist > 4) showMascotDialog('move');
        visitMapMascotMoveTimeoutRef.current = window.setTimeout(() => {
          setVisitMapMascotWalking(false);
          visitMapMascotMoveTimeoutRef.current = null;
        }, VISIT_MAP_MASCOT_MOVE_MS);
      }

      visitMapMascotPctRef.current = { xp: nx, yp: ny };
      setVisitMapMascotPct({ xp: nx, yp: ny });
      saveVisitMascotPositionPct(mapId, { xp: nx, yp: ny });
    },
    [mapId, prefersReducedMotion, showMascotDialog, emitMascotEvent, visitMapFitRef],
  );

  /**
   * Ouvre le panneau lieu une fois le déplacement mascotte terminé (même durée que `VISIT_MAP_MASCOT_MOVE_MS`).
   * @param {{ xp: number, yp: number }} moveFromPct position mascotte **avant** `moveVisitMapMascotTo` (snapshot ref).
   */
  const scheduleVisitDetailPanelOpen = useCallback(
    (item, itemType, targetXp, targetYp, moveFromPct) => {
      if (visitDetailPanelAfterMoveTimeoutRef.current) {
        clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
        visitDetailPanelAfterMoveTimeoutRef.current = null;
      }
      const prev =
        moveFromPct && Number.isFinite(moveFromPct.xp) && Number.isFinite(moveFromPct.yp)
          ? moveFromPct
          : visitMapMascotPctRef.current;
      const target = clampVisitMascotPctForViewport(
        targetXp,
        targetYp,
        visitMapFitRef.current?.height || 0,
      );
      const dist = Math.hypot(target.xp - prev.xp, target.yp - prev.yp);
      const delay = dist < 0.08 || prefersReducedMotion ? 0 : VISIT_MAP_MASCOT_MOVE_MS;

      const applySelection = () => {
        visitDetailPanelAfterMoveTimeoutRef.current = null;
        setSelected(item);
        setSelectedType(itemType);
      };

      if (delay === 0) {
        applySelection();
      } else {
        visitDetailPanelAfterMoveTimeoutRef.current = window.setTimeout(applySelection, delay);
      }
    },
    [prefersReducedMotion, setSelected, setSelectedType, visitMapFitRef],
  );

  /** Annule une ouverture différée du panneau lieu (fermeture de sélection, changement de carte). */
  const cancelScheduledDetailPanelOpen = useCallback(() => {
    if (visitDetailPanelAfterMoveTimeoutRef.current) {
      clearTimeout(visitDetailPanelAfterMoveTimeoutRef.current);
      visitDetailPanelAfterMoveTimeoutRef.current = null;
    }
  }, []);

  const visitMapMascotRenderPct = useMemo(
    () =>
      clampVisitMascotPctForViewport(visitMapMascotPct.xp, visitMapMascotPct.yp, viewportFitHeight),
    [visitMapMascotPct.xp, visitMapMascotPct.yp, viewportFitHeight],
  );

  const onMascotSeenCelebration = useCallback(() => {
    emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN_HAPPY);
    emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MARKER_MARKED_SEEN);
    showMascotDialog('mark_seen', { force: true });
  }, [emitMascotEvent, showMascotDialog]);

  // Comportements ambiants data-driven (déclencheurs `periodic` du pack actif).
  useAmbientMascotBehavior({
    entry: activeMascotEntry,
    triggerTransientState: triggerMascotTransientState,
    enabled: !prefersReducedMotion,
    prefersReducedMotion,
    showDialog: showMascotDialogLines,
  });

  /** Tap/clic direct sur la mascotte : déclencheur général `mascotTap` + déclencheurs `tap` du pack. */
  const onMascotTap = useCallback(() => {
    emitMascotEvent(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_TAP);
    for (const action of getTapActions(activeMascotEntry)) {
      runBehaviorAction(action, {
        playState: triggerMascotTransientState,
        showDialog: showMascotDialogLines,
      });
    }
  }, [emitMascotEvent, activeMascotEntry, triggerMascotTransientState, showMascotDialogLines]);

  return {
    visitMascotId,
    visitMascotOptions,
    visitMascotAnimationState,
    onChangeVisitMascotId,
    visitMascotCatalogExtras,
    visitMapMascotRenderPct,
    visitMapMascotFaceRight,
    visitMapMascotWalking,
    visitMapMascotHappy,
    visitMascotDialog,
    visitMascotDialogVisible,
    visitMapMascotPctRef,
    moveVisitMapMascotTo,
    scheduleVisitDetailPanelOpen,
    cancelScheduledDetailPanelOpen,
    emitMascotEvent,
    showMascotDialog,
    onMascotSeenCelebration,
    onMascotTap,
  };
}
