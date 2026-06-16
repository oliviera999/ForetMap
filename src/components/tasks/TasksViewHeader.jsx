import React from 'react';

import { HelpPanel } from '../HelpPanel';
import { HELP_PANELS } from '../../constants/help';

/**
 * En-tête de la vue Tâches (extrait de `tasks-views.jsx`, O6) : titre, aide
 * contextuelle, actions de création (+ Projet / + Nouvelle tâche côté n3boss,
 * + Proposer côté élève), sous-titre selon le rôle, astuce rapide et bandeau
 * de quota d'inscriptions de l'élève. Composant de présentation : l'état des
 * modales reste dans TasksView (setters passés en props).
 */
export function TasksViewHeader({
  isTeacher = false,
  canSelfAssignTasks = true,
  student = null,
  isHelpEnabled = false,
  showContextHints = false,
  pulseUnseenPanels = false,
  hasSeenSection = () => true,
  markSectionSeen = () => {},
  trackPanelOpen = () => {},
  trackPanelDismiss = () => {},
  helpPanelTitlePrefix,
  helpPanelCloseCta,
  helpPanelDismissCta,
  helpHintPrefix,
  tasksQuickTip,
  setEditProject,
  setShowProjectForm,
  setNewTaskDefaultProjectId,
  setEditTask,
  setDuplicateTask,
  setShowForm,
  setShowProposalForm,
}) {
  const helpTasks = HELP_PANELS.tasks;
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <h2 className="section-title">✅ Tâches</h2>
        {isTeacher && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isHelpEnabled && (
              <HelpPanel
                sectionId="tasks"
                title={helpTasks.title}
                entries={helpTasks.items}
                isTeacher={isTeacher}
                isPulsing={pulseUnseenPanels && !hasSeenSection('tasks')}
                panelTitlePrefix={helpPanelTitlePrefix}
                closeButtonText={helpPanelCloseCta}
                dismissButtonText={helpPanelDismissCta}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditProject(null);
                setShowProjectForm(true);
              }}
            >
              + Projet
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewTaskDefaultProjectId(null);
                setEditTask(null);
                setDuplicateTask(null);
                setShowForm(true);
              }}
            >
              + Nouvelle tâche
            </button>
          </div>
        )}
        {!isTeacher && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isHelpEnabled && (
              <HelpPanel
                sectionId="tasks"
                title={helpTasks.title}
                entries={helpTasks.items}
                isTeacher={isTeacher}
                isPulsing={pulseUnseenPanels && !hasSeenSection('tasks')}
                panelTitlePrefix={helpPanelTitlePrefix}
                closeButtonText={helpPanelCloseCta}
                dismissButtonText={helpPanelDismissCta}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            {canSelfAssignTasks && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNewTaskDefaultProjectId(null);
                  setShowProposalForm(true);
                }}
              >
                + Proposer
              </button>
            )}
          </div>
        )}
      </div>
      <p className="section-sub">
        {isTeacher
          ? 'Piloter les missions, valider les retours et traiter les idées du terrain'
          : canSelfAssignTasks
            ? "Choisis une mission ou propose la tienne, tout le monde peut la lire. Il faut t'inscrire seulement au moment où tu commences la mission pour de vrai."
            : 'Tu consultes la liste en lecture seule'}
      </p>
      {isHelpEnabled && showContextHints && tasksQuickTip ? (
        <p className="section-sub" style={{ marginTop: 6 }}>
          <strong>{helpHintPrefix}</strong> {tasksQuickTip}
        </p>
      ) : null}
      {!isTeacher && student && Number(student.taskEnrollment?.maxActiveAssignments) > 0 && (
        <p
          className="section-sub"
          style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 10,
            background: student.taskEnrollment?.atLimit ? '#fef3c7' : '#f0fdf4',
            color: student.taskEnrollment?.atLimit ? '#92400e' : '#166534',
            fontSize: '.88rem',
            lineHeight: 1.45,
          }}
        >
          {student.taskEnrollment?.atLimit
            ? `Tu es déjà sur le paquet max de missions en cours (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments}, pas encore validées) : libère une place ou attends qu’une mission soit cochée côté n3boss.`
            : `Missions actives pour toi : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (en attente de validation n3boss, toutes cartes).`}
        </p>
      )}
    </>
  );
}
