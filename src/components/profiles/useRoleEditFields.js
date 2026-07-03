import { useEffect, useState } from 'react';
import { normalizeRoleEditFields } from '../../utils/profilesRbacHelpers.js';

/**
 * Champs d'édition du profil sélectionné (admin des profils) — regroupe les états
 * `roleEmoji` / `roleMinDoneTasks` / `roleDisplayOrder` / `roleMaxConcurrentTasks`
 * et l'effet de resynchronisation à chaque changement de `selectedRole` (§6.1),
 * auparavant portés par `ProfilesAdminView`. Comportement inchangé.
 */
export function useRoleEditFields(selectedRole) {
  const [roleEmoji, setRoleEmoji] = useState('');
  const [roleMinDoneTasks, setRoleMinDoneTasks] = useState('');
  const [roleDisplayOrder, setRoleDisplayOrder] = useState('');
  const [roleMaxConcurrentTasks, setRoleMaxConcurrentTasks] = useState('');

  useEffect(() => {
    const fields = normalizeRoleEditFields(selectedRole);
    setRoleEmoji(fields.emoji);
    setRoleMinDoneTasks(fields.minDoneTasks);
    setRoleDisplayOrder(fields.displayOrder);
    setRoleMaxConcurrentTasks(fields.maxConcurrentTasks);
  }, [selectedRole]);

  return {
    roleEmoji,
    setRoleEmoji,
    roleMinDoneTasks,
    setRoleMinDoneTasks,
    roleDisplayOrder,
    roleMaxConcurrentTasks,
    setRoleMaxConcurrentTasks,
  };
}
