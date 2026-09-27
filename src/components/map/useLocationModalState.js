/**
 * États et actions communs aux deux modales de lieu (`MarkerModal`, `ZoneInfoModal`) :
 * onglet courant (avec repli quand un onglet disparaît), inscription groupée d'un élève,
 * liaison / déliaison de tâches et de tutoriels par un prof.
 *
 * Écrits à l'identique dans les deux modales jusqu'à l'étape B4 de l'audit du 25/09/2026
 * (§ 3.3 ligne 12) ; seuls les messages de confirmation diffèrent (« …à la zone ✓ » /
 * « …au repère ✓ »), passés en paramètre.
 */
import { useEffect, useState } from 'react';

/**
 * Onglet courant de la modale : retombe sur « Info » quand l'onglet Tâches ou Tutoriels
 * n'est plus proposé (rôle, liste vide). `disabled` : repère en création, sans onglets.
 */
export function useLocationModalTab(initialTab, { showTasksTab, showTutorialsTab, disabled }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (disabled) return;
    if (!showTasksTab && tab === 'tasks') setTab('info');
  }, [disabled, showTasksTab, tab]);
  useEffect(() => {
    if (disabled) return;
    if (!showTutorialsTab && tab === 'tutorials') setTab('info');
  }, [disabled, showTutorialsTab, tab]);
  return [tab, setTab];
}

/**
 * Inscription groupée d'un élève aux tâches du lieu : sélection (nettoyée quand une tâche
 * n'est plus inscriptible) et envoi, avec le message de résultat.
 */
export function useLocationTaskAssignment({ studentAssignableTasks, onAssignTasks, setToast }) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    // Garde la référence quand rien ne change : un nouveau tableau systématique
    // relancerait un rendu à chaque passage (boucle « Maximum update depth exceeded »).
    setSelectedTaskIds((prev) => {
      const next = prev.filter((id) => studentAssignableTasks.some((t) => t.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [studentAssignableTasks]);

  const toggleTask = (id) =>
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const assignSelected = async () => {
    if (!onAssignTasks || selectedTaskIds.length === 0) return;
    setAssigning(true);
    const result = await onAssignTasks(selectedTaskIds);
    if (result.failedCount > 0) {
      const ok = result.assignedCount > 0 ? `${result.assignedCount} tâche(s) prise(s). ` : '';
      setToast(`${ok}${result.failedCount} échec(s) : ${result.firstError || 'erreur inconnue'}`);
    } else {
      setToast(`${result.assignedCount} tâche(s) prise(s) en charge ✓`);
    }
    setSelectedTaskIds([]);
    setAssigning(false);
  };

  return { selectedTaskIds, assigning, toggleTask, assignSelected };
}

/**
 * Liaison d'une tâche ou d'un tutoriel existant au lieu (prof) : identifiant choisi dans la
 * liste, rappels du parent, messages de confirmation.
 *
 * @param {object} options
 * @param {string} options.taskLinkedMessage     ex. « Tâche liée à la zone ✓ »
 * @param {string} options.tutorialLinkedMessage ex. « Tutoriel lié à la zone ✓ »
 */
export function useLocationLinkActions({
  onLinkTask,
  onUnlinkTask,
  onLinkTutorial,
  onUnlinkTutorial,
  setToast,
  taskLinkedMessage,
  tutorialLinkedMessage,
}) {
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  return {
    linkTaskId,
    setLinkTaskId,
    linkTutorialId,
    setLinkTutorialId,
    unlinkTask: async (t) => {
      await onUnlinkTask?.(t);
      setToast('Tâche dissociée');
    },
    linkTask: async (id) => {
      await onLinkTask?.(id);
      setLinkTaskId('');
      setToast(taskLinkedMessage);
    },
    unlinkTutorial: async (tu) => {
      await onUnlinkTutorial?.(tu);
      setToast('Tutoriel dissocié');
    },
    linkTutorial: async (id) => {
      await onLinkTutorial?.(id);
      setLinkTutorialId('');
      setToast(tutorialLinkedMessage);
    },
  };
}
