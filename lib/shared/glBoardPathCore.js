'use strict';

const BOARD_MOVEMENT_MODES = Object.freeze(['free', 'numbered_path']);
const BOARD_PATH_START_INDICES = Object.freeze([0, 1]);

function sortMarkersByPath(markers = []) {
  if (!Array.isArray(markers) || markers.length === 0) return [];
  return [...markers].sort((a, b) => {
    const orderA = Number(a?.order_index ?? a?.orderIndex) || 0;
    const orderB = Number(b?.order_index ?? b?.orderIndex) || 0;
    if (orderA !== orderB) return orderA - orderB;
    return Number(a?.id) - Number(b?.id);
  });
}

function normalizeBoardPathStartIndex(value, fallback = 0) {
  const n = Number(value);
  if (n === 1) return 1;
  if (n === 0) return 0;
  return fallback === 1 ? 1 : 0;
}

function resolveBoardMovementMode(game = {}) {
  const raw = game?.board_movement_mode ?? game?.boardMovementMode ?? null;
  return raw === 'numbered_path' ? 'numbered_path' : 'free';
}

function resolveBoardPathStartIndex(game = {}) {
  const raw = game?.board_path_start_index ?? game?.boardPathStartIndex;
  if (raw == null || raw === '') return 0;
  return normalizeBoardPathStartIndex(raw, 0);
}

function resolveBoardMovementConfig(game = {}) {
  const mode = resolveBoardMovementMode(game);
  const startIndex = resolveBoardPathStartIndex(game);
  return {
    mode,
    startIndex,
    isNumberedPath: mode === 'numbered_path',
  };
}

function buildMarkerPathNumberMap(sortedMarkers, startIndex = 0) {
  const map = new Map();
  const offset = startIndex === 1 ? 1 : 0;
  sortedMarkers.forEach((marker, idx) => {
    const id = Number(marker?.id);
    if (Number.isFinite(id)) map.set(id, idx + offset);
  });
  return map;
}

function teamPathIndex(team, sortedMarkers) {
  const markerId = team?.position_marker_id ?? team?.positionMarkerId;
  if (markerId == null) return null;
  const idx = sortedMarkers.findIndex((marker) => Number(marker.id) === Number(markerId));
  return idx >= 0 ? idx : null;
}

function startMarker(sortedMarkers, startIndex = 0) {
  if (!sortedMarkers.length) return null;
  const idx = Math.max(
    0,
    Math.min(normalizeBoardPathStartIndex(startIndex), sortedMarkers.length - 1),
  );
  return { index: idx, marker: sortedMarkers[idx] };
}

function advancePathIndex(currentIndex, steps, pathLength, startIndex = 0) {
  const safeLength = Math.max(0, Number(pathLength) || 0);
  if (safeLength === 0) return 0;
  const base =
    currentIndex != null ? Number(currentIndex) : normalizeBoardPathStartIndex(startIndex);
  const delta = Math.max(1, Number(steps) || 1);
  const max = safeLength - 1;
  return Math.min(Math.max(0, base) + delta, max);
}

function advancePathIndexSigned(currentIndex, steps, pathLength, startIndex = 0) {
  const safeLength = Math.max(0, Number(pathLength) || 0);
  if (safeLength === 0) return 0;
  const base =
    currentIndex != null ? Number(currentIndex) : normalizeBoardPathStartIndex(startIndex);
  const delta = Number(steps) || 0;
  if (delta === 0) return Math.min(Math.max(0, base), safeLength - 1);
  const max = safeLength - 1;
  return Math.min(Math.max(0, base + delta), max);
}

function targetMarkerAfterDice(sortedMarkers, team, steps, startIndex = 0) {
  if (!sortedMarkers.length) return null;
  const current = teamPathIndex(team, sortedMarkers);
  const nextIdx = advancePathIndex(current, steps, sortedMarkers.length, startIndex);
  return { index: nextIdx, marker: sortedMarkers[nextIdx] };
}

function markersAlongDicePath(sortedMarkers, team, steps, startIndex = 0) {
  if (!sortedMarkers.length) return [];
  const current = teamPathIndex(team, sortedMarkers);
  const base = current != null ? current : normalizeBoardPathStartIndex(startIndex);
  const targetIdx = advancePathIndex(current, steps, sortedMarkers.length, startIndex);
  if (targetIdx <= base) return [];
  return sortedMarkers.slice(base + 1, targetIdx + 1);
}

function targetMarkerAfterPathSteps(sortedMarkers, team, steps, startIndex = 0) {
  if (!sortedMarkers.length) return null;
  const targetIdx = advancePathIndexSigned(
    teamPathIndex(team, sortedMarkers),
    steps,
    sortedMarkers.length,
    startIndex,
  );
  return { index: targetIdx, marker: sortedMarkers[targetIdx] };
}

function markersAlongPathSteps(sortedMarkers, team, steps, startIndex = 0) {
  if (!sortedMarkers.length) return [];
  const current = teamPathIndex(team, sortedMarkers);
  const base = current != null ? current : normalizeBoardPathStartIndex(startIndex);
  const targetIdx = advancePathIndexSigned(current, steps, sortedMarkers.length, startIndex);
  if (targetIdx === base) return [];
  if (targetIdx > base) return sortedMarkers.slice(base + 1, targetIdx + 1);
  return [...sortedMarkers.slice(targetIdx, base)].reverse();
}

module.exports = {
  BOARD_MOVEMENT_MODES,
  BOARD_PATH_START_INDICES,
  sortMarkersByPath,
  normalizeBoardPathStartIndex,
  resolveBoardMovementMode,
  resolveBoardPathStartIndex,
  resolveBoardMovementConfig,
  buildMarkerPathNumberMap,
  teamPathIndex,
  startMarker,
  advancePathIndex,
  advancePathIndexSigned,
  targetMarkerAfterDice,
  markersAlongDicePath,
  targetMarkerAfterPathSteps,
  markersAlongPathSteps,
};
