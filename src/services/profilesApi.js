import { api } from './api';

/**
 * Client API de l'administration des profils et des comptes (onglet « Profils & comptes »),
 * piste B, étape B7 de l'audit du 25/09/2026. Modèle : `moodleAdminApi.js` — de fines
 * enveloppes autour du transport `api()` : les vues ne connaissent plus les URL.
 *
 * Chaque fonction produit EXACTEMENT l'appel que faisait la vue (chemin, méthode, corps) :
 * même comportement de rejeu et d'erreur, et les tests qui simulent `api()` restent valables.
 * Les identifiants de compte et de profil sont encodés (`encodeURIComponent`, sans effet sur
 * un UUID ou un entier) ; le type de compte (`teacher` | `student`) est transmis tel quel.
 */

const RBAC = '/api/rbac';
const enc = (value) => encodeURIComponent(String(value));

export const profilesApi = {
  // --- Session de l'administrateur -----------------------------------------------------------
  me: () => api('/api/auth/me'),
  /** Prise de contrôle d'un compte (`admin.impersonate`) : `{ authToken, … }`. */
  impersonate: ({ userType, userId }) =>
    api('/api/auth/admin/impersonate', 'POST', { userType, userId }),

  // --- Profils (rôles RBAC) ------------------------------------------------------------------
  listProfiles: () => api(`${RBAC}/profiles`),
  createProfile: (payload) => api(`${RBAC}/profiles`, 'POST', payload),
  updateProfile: (roleId, patch) => api(`${RBAC}/profiles/${enc(roleId)}`, 'PATCH', patch),
  duplicateProfile: (roleId, payload) =>
    api(`${RBAC}/profiles/${enc(roleId)}/duplicate`, 'POST', payload),
  setProfilePermissions: (roleId, permissions) =>
    api(`${RBAC}/profiles/${enc(roleId)}/permissions`, 'PUT', { permissions }),
  setProgressionByValidatedTasks: (enabled) =>
    api(`${RBAC}/progression-by-validated-tasks`, 'PATCH', { enabled: !!enabled }),
  /** Recalcul des paliers : corps construit par `buildRecomputeBody` (portée, simulation…). */
  recomputeProgression: (body) => api(`${RBAC}/progression/recompute`, 'POST', body),

  // --- Comptes --------------------------------------------------------------------------------
  listUsers: () => api(`${RBAC}/users`),
  createUser: (body) => api(`${RBAC}/users`, 'POST', body),
  userDetail: (userType, userId) => api(`${RBAC}/users/${userType}/${enc(userId)}`),
  updateUser: (userType, userId, patch) =>
    api(`${RBAC}/users/${userType}/${enc(userId)}`, 'PATCH', patch),
  deleteTeacher: (userId) => api(`${RBAC}/users/teacher/${enc(userId)}`, 'DELETE'),
  setUserRole: (userType, userId, roleId) =>
    api(`${RBAC}/users/${userType}/${enc(userId)}/role`, 'PUT', { role_id: roleId }),
  /** Attribution groupée : `{ role_id, users: [{ user_type, id }] }`. */
  bulkSetRole: (payload) => api(`${RBAC}/users/bulk-role`, 'POST', payload),

  // --- Comptes élèves -------------------------------------------------------------------------
  deleteStudent: (studentId) => api(`/api/students/${enc(studentId)}`, 'DELETE'),
  duplicateStudent: (studentId) => api(`/api/students/${enc(studentId)}/duplicate`, 'POST', {}),
  /** Import de comptes : `{ fileName, fileDataBase64, dryRun, existingStrategy? }`. */
  importStudents: (body) => api('/api/students/import', 'POST', body),

  // --- Statistiques de l'onglet Comptes -----------------------------------------------------
  /**
   * Compteurs par n3beur (`GET /api/stats/all`, `{ students, site }`) affichés à côté des
   * comptes. Lecture du domaine des statistiques : à reprendre par un client dédié le jour où
   * il existera.
   */
  accountStats: () => api('/api/stats/all'),
};
