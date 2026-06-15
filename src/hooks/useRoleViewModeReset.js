import { useEffect } from 'react';

/**
 * Réinitialisation du mode de vue de rôle (extrait de App.jsx, O5).
 *
 * Encapsule l'unique effet inline d'App.jsx qui ramène `roleViewMode` sur
 * `'native'` dès que l'identité effective change : nouveau `roleSlug`, nouvel
 * `userId` (JWT) ou bascule du statut `isTeacher`. Sans cela, un prof/admin
 * resté en « vue élève » ou « vue prof » conserverait ce mode après un
 * changement de session (login, OAuth, prise de contrôle…).
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé.
 * `roleViewMode` (état cœur d'App.jsx, lu par de nombreux memos / le rendu)
 * reste géré par App.jsx ; seul l'effet est encapsulé et `setRoleViewMode`
 * est passé en paramètre. Iso-comportement : mêmes dépendances
 * (`roleSlug`, `userId`, `isTeacher`) et même action que l'ancien `useEffect`.
 *
 * @param {object} params
 * @param {string|null|undefined} params.roleSlug - `authClaims?.roleSlug` courant.
 * @param {string|number|null|undefined} params.userId - `authClaims?.userId` courant.
 * @param {boolean} params.isTeacher - statut enseignant courant.
 * @param {(mode: string) => void} params.setRoleViewMode - setter du mode de vue de rôle.
 */
export function useRoleViewModeReset({ roleSlug, userId, isTeacher, setRoleViewMode }) {
  useEffect(() => {
    setRoleViewMode('native');
  }, [roleSlug, userId, isTeacher, setRoleViewMode]);
}
