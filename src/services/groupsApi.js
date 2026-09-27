import { api } from './api';

/**
 * Client API des groupes (classes, équipes, unités, clubs) — piste B, étape B7 de l'audit du
 * 25/09/2026. Modèle : `moodleAdminApi.js` — de fines enveloppes autour du transport `api()` :
 * les vues (`groups-views.jsx`, onglet Comptes de `profiles-views.jsx`, import de groupes) ne
 * connaissent plus les URL.
 *
 * Chaque fonction produit EXACTEMENT l'appel que faisait la vue (chemin, méthode, corps).
 * `addMember` transmet son corps tel quel : la vue des groupes l'appelait sans corps, la fiche
 * d'un compte avec `{}` — les deux formes restent possibles.
 */

const BASE = '/api/groups';
const enc = (value) => encodeURIComponent(String(value));

export const groupsApi = {
  /** Liste d'administration : `{ groups, can_manage, can_manage_default_role }`. */
  list: () => api(BASE),
  /** Groupes proposés dans les filtres et les rattachements : `{ groups }`. */
  options: () => api(`${BASE}/options`),
  /** Comptes visiteurs en attente de rattachement. */
  pendingVisitors: () => api(`${BASE}/pending-visitors`),
  create: (body) => api(BASE, 'POST', body),
  update: (groupId, patch) => api(`${BASE}/${enc(groupId)}`, 'PATCH', patch),
  remove: (groupId) => api(`${BASE}/${enc(groupId)}`, 'DELETE'),
  /** Code de classe : `action` = `'generate'` | `'clear'` ; rend `{ class_code }`. */
  classCode: (groupId, action) => api(`${BASE}/${enc(groupId)}/class-code`, 'POST', { action }),
  /** Remplace membres et périmètre : `{ member_user_ids, scope_map_ids, scope_project_ids }`. */
  setMembers: (groupId, body) => api(`${BASE}/${enc(groupId)}/members`, 'PUT', body),
  addMember: (groupId, userId, body) =>
    api(`${BASE}/${enc(groupId)}/members/${enc(userId)}`, 'POST', body),
  removeMember: (groupId, userId) =>
    api(`${BASE}/${enc(groupId)}/members/${enc(userId)}`, 'DELETE'),
  /** Rattachement groupé : rend `{ added, failed, results }`. */
  addMembersBulk: (groupId, userIds) =>
    api(`${BASE}/${enc(groupId)}/members/bulk`, 'POST', { user_ids: userIds }),
  /** Import de groupes : `{ fileName, fileDataBase64, dryRun }`. */
  importGroups: (body) => api(`${BASE}/import`, 'POST', body),
};
