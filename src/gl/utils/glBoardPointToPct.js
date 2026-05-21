export function glBoardPointToPct(event, boardEl) {
  if (!event || !boardEl) return null;
  const rect = boardEl.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const xp = ((event.clientX - rect.left) / rect.width) * 100;
  const yp = ((event.clientY - rect.top) / rect.height) * 100;
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  return {
    xp: Number(Math.max(0, Math.min(100, xp)).toFixed(2)),
    yp: Number(Math.max(0, Math.min(100, yp)).toFixed(2)),
  };
}
