import React from 'react';
import { api } from '../../../services/api.js';
import { LearningGatingLocksPanel } from '../../../shared/components/LearningGatingLocksPanel.jsx';

/**
 * Adaptateur ForetMap de l'écran « élèves bloqués » (composant partagé avec GL).
 * Ici un lecteur est toujours un compte : la levée s'identifie par `user_id`.
 */
export function FMLearningLocksPanel() {
  return (
    <LearningGatingLocksPanel
      request={api}
      basePath="/api/learning-links"
      title="Élèves bloqués par le contrôle de compréhension"
      buildReleaseBody={(lock) => ({
        user_id: lock.learner?.user_id,
        resource_type: lock.resource_type,
        resource_ref: lock.resource_ref,
        question_code: lock.locked_question_code || '',
      })}
    />
  );
}
