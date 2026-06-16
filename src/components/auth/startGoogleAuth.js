import { withAppBase } from '../../services/api';

/** Démarre le flux OAuth Google (mode élève par défaut, prof si demandé). */
export function startGoogleAuth(mode) {
  const safeMode = mode === 'teacher' ? 'teacher' : 'student';
  window.location.assign(
    withAppBase(`/api/auth/google/start?mode=${encodeURIComponent(safeMode)}`),
  );
}
