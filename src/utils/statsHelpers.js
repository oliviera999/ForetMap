/**
 * Calculs purs liés aux statistiques n3beurs et au classement enseignant.
 *
 * Extraits de `src/components/stats-views.jsx` (O6) : logique métier pure, sans React ni I/O,
 * donc testable unitairement (`tests-ui/utils/statsHelpers.test.js`) et réutilisable.
 */

// ─── Agrégats enseignant ──────────────────────────────────────────────────────

/** Somme des tâches validées sur l'ensemble des élèves. */
export function computeTotalValidated(students) {
  return (Array.isArray(students) ? students : []).reduce((s, d) => s + (d?.stats?.done ?? 0), 0);
}

/** Somme des tâches en cours sur l'ensemble des élèves. */
export function computeTotalPending(students) {
  return (Array.isArray(students) ? students : []).reduce((s, d) => s + (d?.stats?.pending ?? 0), 0);
}

/** Nombre d'élèves ayant pris au moins une tâche. */
export function computeActiveStudents(students) {
  return (Array.isArray(students) ? students : []).filter((d) => (d?.stats?.total ?? 0) > 0).length;
}

// ─── Classement (leaderboard) ─────────────────────────────────────────────────

/** Score maximum validé parmi la liste (minimum 1 pour éviter la division par zéro). */
export function computeMaxDone(students) {
  return Math.max(...(Array.isArray(students) ? students : []).map((s) => s?.stats?.done ?? 0), 1);
}

/**
 * Médaille/numéro de rang pour l'index donné (0-based).
 * Renvoie 🥇/🥈/🥉 pour les trois premiers, puis « n. ».
 */
export function rankIcon(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}.`;
}

/** Classe CSS de rang : 'gold' | 'silver' | 'bronze' | '' */
export function rankClass(index) {
  if (index === 0) return 'gold';
  if (index === 1) return 'silver';
  if (index === 2) return 'bronze';
  return '';
}

/**
 * Taux de complétion en pourcentage arrondi (0 si `total` vaut 0).
 * Formule : Math.round((done / total) * 100)
 */
export function computeCompletionRate(done, total) {
  if (!total || total <= 0) return 0;
  return Math.round(((done ?? 0) / total) * 100);
}

// ─── Décoration des paliers (RANKS) ──────────────────────────────────────────

/** Couleur par défaut pour un palier selon son index dans la liste triée. */
const DEFAULT_RANK_COLORS = ['#94a3b8', '#52b788', '#1a4731'];

const DEFAULT_ICON_BY_SLUG = {
  eleve_novice: '🪨',
  eleve_avance: '🌿',
  eleve_chevronne: '🏆',
};

/**
 * Ajoute `color` et `icon` à chaque palier déjà trié.
 * @param {Array} sortedSteps - paliers déjà triés (résultat de sortProgressionSteps).
 * @returns {Array} paliers avec color + icon résolus.
 */
export function decorateRanks(sortedSteps) {
  return (Array.isArray(sortedSteps) ? sortedSteps : []).map((step, i) => ({
    ...step,
    color: DEFAULT_RANK_COLORS[i] ?? '#1a4731',
    icon: String(step.emoji || '').trim()
      || DEFAULT_ICON_BY_SLUG[String(step.roleSlug || '').toLowerCase()]
      || '🌿',
  }));
}

// ─── Alignement profil / palier tâches ───────────────────────────────────────

/**
 * Indique si le profil attribué est en avance sur le palier calculé par les tâches.
 */
export function isProfileAheadOfTasks(autoProgressionEnabled, actualIndex, taskTierIndex) {
  return (
    !!autoProgressionEnabled
    && actualIndex >= 0
    && taskTierIndex >= 0
    && actualIndex > taskTierIndex
  );
}

/**
 * Indique si le profil attribué est en retard sur le palier calculé par les tâches.
 */
export function isProfileBehindTasks(autoProgressionEnabled, actualIndex, taskTierIndex) {
  return (
    !!autoProgressionEnabled
    && actualIndex >= 0
    && taskTierIndex >= 0
    && actualIndex < taskTierIndex
  );
}

/**
 * Nombre de tâches restantes pour atteindre le palier suivant.
 * Renvoie 0 si `nextRank` est null (palier maximum).
 */
export function computeTasksRemaining(done, nextRank) {
  if (!nextRank) return 0;
  return Math.max(0, (nextRank.min ?? 0) - (done ?? 0));
}

// ─── Validation profil ────────────────────────────────────────────────────────

/** Taille approximative en octets d'un data-URL base64. */
export function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
  return Math.floor((payload.length * 3) / 4) - padding;
}

/**
 * Valide le pseudo.
 * @returns {string} message d'erreur, ou '' si valide.
 */
export function validatePseudo(pseudo) {
  const trimmed = String(pseudo || '').trim();
  if (!trimmed) return '';
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(trimmed)) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  return '';
}

/**
 * Valide l'email.
 * @returns {string} message d'erreur, ou '' si valide.
 */
export function validateEmail(email) {
  const trimmed = String(email || '').trim();
  if (!trimmed) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Email invalide';
  }
  return '';
}

/**
 * Valide la description (max 300 caractères).
 * @returns {string} message d'erreur, ou '' si valide.
 */
export function validateDescription(description) {
  if (String(description || '').trim().length > 300) {
    return 'Description trop longue (max 300 caractères)';
  }
  return '';
}

// ─── Formatage des observations ───────────────────────────────────────────────

/** Construit le nom affiché d'un auteur d'observation. */
export function formatObservationAuthor(entry) {
  return `${entry?.first_name || ''} ${entry?.last_name || ''}`.trim() || 'n3beur';
}

/** Construit le libellé de date d'une observation (locale fr-FR), ou '' si absente. */
export function formatObservationDate(createdAt) {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleString('fr-FR');
}

// ─── Dérivation du type de profil ─────────────────────────────────────────────

/**
 * Déduit le libellé de type de profil d'un utilisateur.
 * @param {object} student - objet étudiant/utilisateur.
 * @param {object} roleTerms - termes de rôle (getRoleTerms()).
 * @returns {string}
 */
export function deriveProfileType(student, roleTerms) {
  const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin') return 'admin';
  if (roleSlug.startsWith('prof')) return roleTerms.teacherShort;
  if (roleSlug.startsWith('eleve')) return roleTerms.studentSingular;
  const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
  if (userType === 'teacher' || userType === 'user') return roleTerms.teacherShort;
  if (userType === 'student') return roleTerms.studentSingular;
  return roleTerms.studentSingular;
}

// ─── Endpoint de sauvegarde du profil ────────────────────────────────────────

/**
 * Détermine l'endpoint API à appeler pour la mise à jour du profil.
 * @param {object} student
 * @returns {string}
 */
export function resolveProfileEndpoint(student) {
  const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
  const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
  const isTeacherLike =
    roleSlug === 'admin'
    || roleSlug.startsWith('prof')
    || userType === 'teacher'
    || userType === 'user';
  return isTeacherLike ? '/api/auth/me/profile' : `/api/students/${student.id}/profile`;
}
