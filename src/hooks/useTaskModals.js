import { useEffect, useState } from 'react';

/**
 * États des modales de la vue Tâches (P2, extrait de tasks-views.jsx, iso-comportement) :
 * formulaires (tâche / projet / proposition), édition / duplication, journal (saisie et
 * consultation) et confirmation. Signale au parent (`onTaskFormOverlayOpenChange`)
 * l'ouverture/fermeture d'un overlay, avec remise à `false` au démontage.
 */
export function useTaskModals(onTaskFormOverlayOpenChange = null) {
  const [showForm, setShowForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [duplicateTask, setDuplicateTask] = useState(null);
  const [logTask, setLogTask] = useState(null);
  const [logsTask, setLogsTask] = useState(null);
  const [confirmTask, setConfirmTask] = useState(null);

  useEffect(() => {
    if (!onTaskFormOverlayOpenChange) return;
    const open = !!(
      showForm ||
      editTask ||
      duplicateTask ||
      showProposalForm ||
      showProjectForm ||
      confirmTask ||
      logTask ||
      logsTask
    );
    onTaskFormOverlayOpenChange(open);
  }, [
    showForm,
    editTask,
    duplicateTask,
    showProposalForm,
    showProjectForm,
    confirmTask,
    logTask,
    logsTask,
    onTaskFormOverlayOpenChange,
  ]);

  useEffect(
    () => () => {
      onTaskFormOverlayOpenChange?.(false);
    },
    [onTaskFormOverlayOpenChange],
  );

  return {
    showForm,
    setShowForm,
    showProjectForm,
    setShowProjectForm,
    editProject,
    setEditProject,
    showProposalForm,
    setShowProposalForm,
    editTask,
    setEditTask,
    duplicateTask,
    setDuplicateTask,
    logTask,
    setLogTask,
    logsTask,
    setLogsTask,
    confirmTask,
    setConfirmTask,
  };
}
