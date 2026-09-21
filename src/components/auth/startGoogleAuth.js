import { withAppBase } from '../../services/api';

/**
 * Modes acceptés par `/api/auth/google/start` : `teacher` (console n3boss), `staff` (plan des
 * personnels — tout compte autorisé, enseignant ou non), `student` par défaut.
 */
const GOOGLE_AUTH_MODES = ['teacher', 'staff'];

/** Démarre le flux OAuth Google (mode élève par défaut). */
export function startGoogleAuth(mode) {
  const safeMode = GOOGLE_AUTH_MODES.includes(mode) ? mode : 'student';
  window.location.assign(
    withAppBase(`/api/auth/google/start?mode=${encodeURIComponent(safeMode)}`),
  );
}
