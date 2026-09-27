/**
 * Parties communes des deux modales de lieu (`MarkerModal`, `ZoneInfoModal`), recopiées
 * à l'identique jusqu'à l'étape B4 de l'audit du 25/09/2026 (§ 3.3 ligne 12) : coque de la
 * fenêtre, onglets, raccourci vers l'onglet Tâches, encadré de texte, message « rien à
 * afficher », commentaires du lieu, actions Copie / Supprimer, onglets Tâches et Tutoriels
 * (vue prof), bouton d'enregistrement.
 *
 * Composants sans état : l'état reste dans la modale (ou dans `useLocationModalState.js`).
 * Le rendu est celui d'avant la mise en commun, au nœud près
 * (`tests-ui/components/map/LocationModals.mount.test.jsx`).
 */
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import { DialogShell } from '../DialogShell';
import { ContextComments } from '../context-comments';
import { ZoneTasksStudentPanel, ZoneTasksTeacherPanel } from './ZoneTasksPanel.jsx';
import { ZoneTutorialsTeacherPanel } from './ZoneTutorialsPanel.jsx';
import {
  IconAbout,
  IconCamera,
  IconCheck,
  IconClose,
  IconDelete,
  IconDuplicate,
  IconEdit,
  IconTasks,
  IconTuto,
} from '../../shared/icons.jsx';

/** Onglets d'une modale de lieu existant, dans l'ordre d'affichage. */
export function buildLocationModalTabs({ showTasksTab, showTutorialsTab, isTeacher }) {
  return [
    ...(showTasksTab
      ? [
          {
            id: 'tasks',
            label: (
              <>
                <IconTasks size={14} /> Tâches
              </>
            ),
          },
        ]
      : []),
    ...(showTutorialsTab
      ? [
          {
            id: 'tutorials',
            label: (
              <>
                <IconTuto size={14} /> Tutoriels
              </>
            ),
          },
        ]
      : []),
    {
      id: 'info',
      label: (
        <>
          <IconAbout size={14} /> Info
        </>
      ),
    },
    {
      id: 'photos',
      label: (
        <>
          <IconCamera size={14} /> Photos
        </>
      ),
    },
    ...(isTeacher
      ? [
          {
            id: 'edit',
            label: (
              <>
                <IconEdit size={14} /> Modifier
              </>
            ),
          },
        ]
      : []),
  ];
}

/** Coque de la fenêtre : dialogue accessible, message éphémère, croix de fermeture. */
export function LocationModalShell({
  ariaLabel,
  onClose,
  dialogRef,
  dialogStyle,
  toast,
  onToastDone,
  children,
}) {
  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      dialogStyle={dialogStyle}
      ariaLabel={ariaLabel}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      {toast && <TimedToast msg={toast} onDone={onToastDone} />}
      <button className="modal-close" aria-label="Fermer" onClick={onClose}>
        <IconClose size={16} />
      </button>
      {children}
    </DialogShell>
  );
}

/** Raccourci « Ouvrir l'onglet Tâches filtré sur ce lieu ». */
export function LocationTasksShortcut({ kind, entityId, onNavigate, onClose }) {
  if (!onNavigate || !entityId) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => {
          onNavigate({ kind, id: String(entityId) });
          onClose();
        }}
      >
        <IconCheck size={15} />{' '}
        {kind === 'zone'
          ? 'Ouvrir l’onglet Tâches filtré sur cette zone'
          : 'Ouvrir l’onglet Tâches filtré sur ce repère'}
      </button>
      <p
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-soft)',
          margin: '6px 0 0',
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
      </p>
    </div>
  );
}

/** Encadré vert du texte de travail (description d'une zone, note d'un repère). */
export function LocationTextBox({ children }) {
  return (
    <div
      style={{
        background: 'var(--tint-success)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 12,
        border: '1px solid var(--mint)',
        fontSize: 'var(--text-sm)',
        color: '#333',
        lineHeight: 'var(--lh-relaxed)',
      }}
    >
      {children}
    </div>
  );
}

/** Message affiché quand l'onglet Info n'a rien à montrer. */
export function LocationEmptyInfo({ children }) {
  return (
    <p
      style={{
        color: '#bbb',
        fontSize: 'var(--text-sm)',
        fontStyle: 'italic',
        textAlign: 'center',
        padding: '20px 0',
      }}
    >
      {children}
    </p>
  );
}

/** Commentaires du lieu (dépliés quand la fenêtre est ouverte depuis une notification). */
export function LocationCommentsSection({
  enabled,
  commentsRef,
  kind,
  entityId,
  focusComments,
  canParticipateContextComments,
}) {
  if (!enabled) return null;
  return (
    <div ref={commentsRef}>
      <ContextComments
        contextType={kind}
        contextId={entityId}
        title={kind === 'zone' ? 'Commentaires de la zone' : 'Commentaires du repère'}
        placeholder={
          kind === 'zone'
            ? 'Ajouter une observation sur cette zone…'
            : 'Ajouter une observation sur ce repère…'
        }
        defaultOpen={focusComments}
        canParticipateContextComments={canParticipateContextComments}
      />
    </div>
  );
}

/** Actions prof de l'en-tête : copie (facultative) et suppression. */
export function LocationHeaderActions({
  duplicating,
  onDuplicateClick,
  duplicateTitle,
  deleteAriaLabel,
  onDeleteClick,
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {onDuplicateClick && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={duplicating}
          title={duplicateTitle}
          onClick={onDuplicateClick}
        >
          {duplicating ? (
            '…'
          ) : (
            <>
              <IconDuplicate size={15} /> Copie
            </>
          )}
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger btn-sm"
        aria-label={deleteAriaLabel}
        onClick={onDeleteClick}
      >
        <IconDelete />
      </button>
    </div>
  );
}

/**
 * Onglet Tâches : liaison (prof) ou inscription groupée (élève). `locationKind` n'est transmis
 * aux panneaux que pour le repère, comme avant la mise en commun (la zone est leur défaut).
 */
export function LocationTasksTab({
  kind,
  isTeacher,
  linkedTasks,
  assignableTasks,
  student,
  canSelfAssignTasks,
  canEnroll,
  links,
  assignment,
}) {
  const kindProps = kind === 'marker' ? { locationKind: 'marker' } : {};
  if (isTeacher) {
    return (
      <ZoneTasksTeacherPanel
        {...kindProps}
        linkedTasks={linkedTasks}
        assignableTasks={assignableTasks}
        linkTaskId={links.linkTaskId}
        onChangeLinkTaskId={links.setLinkTaskId}
        onUnlinkTask={links.unlinkTask}
        onLinkTask={links.linkTask}
      />
    );
  }
  return (
    <ZoneTasksStudentPanel
      {...kindProps}
      linkedTasks={linkedTasks}
      student={student}
      canSelfAssignTasks={canSelfAssignTasks}
      canEnroll={canEnroll}
      selectedTaskIds={assignment.selectedTaskIds}
      assigning={assignment.assigning}
      onToggleTask={assignment.toggleTask}
      onAssign={assignment.assignSelected}
    />
  );
}

/** Onglet Tutoriels, vue prof : tutoriels liés (directs, via tâches) et liaison. */
export function LocationTutorialsTeacherTab({
  kind,
  linkedTutorialsDirect,
  tutorialsOnlyViaTasks,
  assignableTutorials,
  links,
}) {
  const kindProps = kind === 'marker' ? { locationKind: 'marker' } : {};
  return (
    <ZoneTutorialsTeacherPanel
      {...kindProps}
      linkedTutorialsDirect={linkedTutorialsDirect}
      tutorialsOnlyViaTasks={tutorialsOnlyViaTasks}
      assignableTutorials={assignableTutorials}
      linkTutorialId={links.linkTutorialId}
      onChangeLinkTutorialId={links.setLinkTutorialId}
      onUnlinkTutorial={links.unlinkTutorial}
      onLinkTutorial={links.linkTutorial}
    />
  );
}

/** Bouton d'enregistrement pleine largeur (« … » pendant l'envoi). */
export function LocationSaveButton({ saving, onClick, icon, label, style }) {
  return (
    <button className="btn btn-primary btn-full" style={style} onClick={onClick} disabled={saving}>
      {saving ? (
        '…'
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </button>
  );
}
