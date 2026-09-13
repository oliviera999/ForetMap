/**
 * Applique un payload `presence:update` sur une liste de lignes stats (id + presence_*).
 * Pur — partagé FM / GL.
 */
export function applyPresenceUpdateToRows(rows, payload) {
  if (!Array.isArray(rows) || !payload?.userId) return rows;
  const uid = String(payload.userId);
  let changed = false;
  const next = rows.map((row) => {
    if (String(row?.id) !== uid) return row;
    changed = true;
    return {
      ...row,
      presence_status: payload.status || row.presence_status,
      presence_label: payload.label || row.presence_label,
      last_seen: payload.lastSeen != null ? payload.lastSeen : row.last_seen,
    };
  });
  return changed ? next : rows;
}
