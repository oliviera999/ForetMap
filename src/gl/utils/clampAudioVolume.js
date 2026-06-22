/** Borne le volume HTMLMediaElement dans [0, 1] (évite IndexSizeError en fondu). */
export function clampAudioVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
