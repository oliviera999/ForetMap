/**
 * Pastille de présence partagée ForetMap / GL (staff only).
 * Statuts : online | recent | offline — libellés alignés sur `lib/shared/presenceCore.js`.
 */
import { PRESENCE_STATUS, STATUS_LABELS_FR, presenceLabelFr } from '../presenceLabels.js';

const STATUS_CLASS = {
  [PRESENCE_STATUS.ONLINE]: 'fm-presence-badge--online',
  [PRESENCE_STATUS.RECENT]: 'fm-presence-badge--recent',
  [PRESENCE_STATUS.OFFLINE]: 'fm-presence-badge--offline',
};

/**
 * @param {{ status?: string, label?: string, lastSeen?: string|null, className?: string }} props
 */
export function PresenceStatusBadge({
  status = PRESENCE_STATUS.OFFLINE,
  label,
  lastSeen = null,
  className = '',
}) {
  const resolved = STATUS_LABELS_FR[status] ? status : PRESENCE_STATUS.OFFLINE;
  const text = label || presenceLabelFr(resolved);
  let title = text;
  if (lastSeen) {
    try {
      title = `${text} — ${new Date(lastSeen).toLocaleString('fr-FR')}`;
    } catch {
      title = text;
    }
  }
  return (
    <span
      className={`fm-presence-badge ${STATUS_CLASS[resolved] || ''} ${className}`.trim()}
      title={title}
      data-presence={resolved}
      aria-label={title}
    >
      <span className="fm-presence-badge__dot" aria-hidden="true" />
      <span className="fm-presence-badge__label">{text}</span>
    </span>
  );
}

export { PRESENCE_STATUS, presenceLabelFr };
