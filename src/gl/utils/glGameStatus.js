const STATUS_LABELS = {
  draft: 'Brouillon',
  live: 'En cours',
  paused: 'Pause',
  ended: 'Terminée',
};

const STATUS_TONES = {
  draft: 'neutral',
  live: 'success',
  paused: 'info',
  ended: 'danger',
};

export function formatGameStatus(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_LABELS[key] || key || '—';
}

export function gameStatusTone(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_TONES[key] || 'neutral';
}

export function canEditGameChapter(status) {
  const key = String(status || '').toLowerCase();
  return key === 'draft' || key === 'paused';
}

export function canEditGameClass(status) {
  return String(status || '').toLowerCase() === 'draft';
}

export function gameLifecycleAction(status, action) {
  const key = String(status || '').toLowerCase();
  if (action === 'start') return key === 'draft' || key === 'paused';
  if (action === 'pause') return key === 'live';
  if (action === 'end') return key === 'live' || key === 'paused';
  return false;
}
