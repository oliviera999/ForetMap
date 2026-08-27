import { apiGL } from '../../services/apiGL.js';
import { LearningGatingLocksPanel } from '../../../shared/components/LearningGatingLocksPanel.jsx';

/**
 * Adaptateur GL de l'écran « lecteurs bloqués » (composant partagé avec ForetMap).
 * Un lecteur GL n'a pas toujours de compte : il s'identifie par le couple
 * (type de lecteur, identifiant) — joueur, invité ou MJ.
 */
export function GLLearningLocksPanel() {
  return (
    <LearningGatingLocksPanel
      request={apiGL}
      basePath="/api/gl/learning-links"
      title="Lecteurs bloqués par le conditionnement"
      buildReleaseBody={(lock) => ({
        reader_user_type: lock.learner?.user_type,
        reader_user_id: lock.learner?.user_id,
        resource_type: lock.resource_type,
        resource_ref: lock.resource_ref,
        question_code: lock.locked_question_code || '',
      })}
      classNames={{
        section: 'gl-admin-section fade-in',
        hint: 'gl-hint',
        error: 'gl-error',
        tableWrap: 'gl-admin-table-wrap',
        table: 'gl-admin-table',
        button: 'gl-btn',
      }}
    />
  );
}
