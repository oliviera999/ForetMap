import React from 'react';

/**
 * Configuration de progression/participation d'un profil « palier n3beur » — extraite de
 * `ProfilesAdminView` (O5/O6). Regroupe : montée de niveau automatique + seuil de tâches validées,
 * proposition de tâches (`tasks.propose`), participation forum/commentaires de contexte,
 * et plafond d'inscriptions simultanées. Présentation pure : l'état et les effets restent au parent.
 */
export function ProfilesRoleProgressionConfig({
  role,
  loading = false,
  roleTerms = {},
  isTier = false,
  canEditRoleDefinition = false,
  progressionEnabled = false,
  onToggleProgression,
  minDoneTasks = '',
  onMinDoneTasksChange,
  onSaveMinDoneThreshold,
  proposeEntry = null,
  onTogglePermission,
  onSetForumParticipate,
  onSetContextCommentParticipate,
  maxConcurrentTasks = '',
  onMaxConcurrentChange,
  onSaveMaxConcurrent,
}) {
  if (!role) return null;
  return (
    <>
      <div
        className="profiles-admin-progression-block"
        style={{
          border: '1px solid #e0e7ff',
          background: '#f8fafc',
          borderRadius: 10,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>
          Progression par tâches validées
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: '.84rem',
            cursor: loading ? 'default' : 'pointer',
            marginBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={progressionEnabled}
            onChange={(e) => onToggleProgression(e.target.checked)}
            disabled={loading}
            style={{ marginTop: 3 }}
          />
          <span>
            Activer la montée de niveau automatique : le profil {roleTerms.studentSingular} suit le
            nombre de tâches validées selon les seuils définis pour chaque palier.
          </span>
        </label>
        <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
          Si cette option est désactivée, aucun changement automatique de profil ne s’applique :
          utilisez la section « Attribution des profils » pour les niveaux.
        </p>
        {isTier && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Seuil pour « {role.display_name} »
            </div>
            <label
              style={{ fontSize: '.76rem', color: '#64748b', display: 'block', marginBottom: 6 }}
            >
              Nombre de tâches validées requises pour atteindre ce niveau (palier suivant = seuil
              supérieur ou égal).
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                min={0}
                step={1}
                value={minDoneTasks}
                onChange={(e) => onMinDoneTasksChange(e.target.value)}
                disabled={loading}
                style={{
                  width: 110,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                }}
                aria-label={`Tâches validées requises pour ${role.display_name}`}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onSaveMinDoneThreshold}
                disabled={loading}
              >
                Enregistrer le seuil
              </button>
            </div>
          </div>
        )}
      </div>
      {isTier && (
        <div
          className="profiles-admin-propose-block"
          style={{
            border: '1px solid #d8f3dc',
            background: '#f1fcf4',
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1b4332', marginBottom: 8 }}>
            Proposition de tâches
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: '.84rem',
              cursor: loading ? 'default' : 'pointer',
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={!!proposeEntry}
              onChange={(e) => onTogglePermission('tasks.propose', e.target.checked)}
              disabled={loading}
              style={{ marginTop: 3 }}
            />
            <span>
              Autoriser les {roleTerms.studentPlural} de ce profil à proposer de nouvelles tâches
              (statut « proposée », validation par un {roleTerms.teacherShort}).
            </span>
          </label>
          <p style={{ fontSize: '.72rem', color: '#64748b', margin: '10px 0 0', lineHeight: 1.45 }}>
            Correspond à la permission <code style={{ fontSize: '.7rem' }}>tasks.propose</code>{' '}
            (retirée de la liste ci-dessous pour éviter le doublon).
          </p>
        </div>
      )}
      {isTier && (
        <div
          style={{
            border: '1px solid #e0e7ff',
            background: '#f8fafc',
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>
            Forum et commentaires (tâches, zones…)
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: '.84rem',
              cursor: loading || !canEditRoleDefinition ? 'default' : 'pointer',
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={Number(role.forum_participate) !== 0}
              onChange={(e) => onSetForumParticipate(role.id, e.target.checked)}
              disabled={loading || !canEditRoleDefinition}
              style={{ marginTop: 3 }}
            />
            <span>
              Permettre la <strong>participation au forum</strong> (publier, répondre, réagir, etc.)
              pour les {roleTerms.studentPlural} de ce profil ; décoché = lecture seule.
            </span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: '.84rem',
              cursor: loading || !canEditRoleDefinition ? 'default' : 'pointer',
              marginBottom: 0,
            }}
          >
            <input
              type="checkbox"
              checked={Number(role.context_comment_participate) !== 0}
              onChange={(e) => onSetContextCommentParticipate(role.id, e.target.checked)}
              disabled={loading || !canEditRoleDefinition}
              style={{ marginTop: 3 }}
            />
            <span>
              Permettre les <strong>commentaires contextuels</strong> sur les tâches, projets et
              zones ; décoché = lecture seule sur ces fils (le forum reste régi par la case
              ci-dessus).
            </span>
          </label>
          <p style={{ fontSize: '.72rem', color: '#64748b', margin: '10px 0 0', lineHeight: 1.45 }}>
            Réglages communs à tous les comptes ayant ce profil principal. Le profil visiteur reste
            sans accès forum / commentaires de contexte.
          </p>
        </div>
      )}
      {isTier && (
        <div
          style={{
            border: '1px solid #fde68a',
            background: '#fffbeb',
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
            Inscriptions simultanées aux tâches
          </div>
          <p style={{ fontSize: '.76rem', color: '#78350f', margin: '0 0 10px', lineHeight: 1.45 }}>
            Nombre maximum de tâches <strong>non validées</strong> auxquelles un{' '}
            {roleTerms.studentSingular} peut s’inscrire en même temps (toutes cartes). Une tâche{' '}
            <strong>validée</strong> par un {roleTerms.teacherShort} ne compte plus : le compteur se
            libère. Champ vide = utiliser le plafond défini dans <strong>Paramètres n3boss</strong>{' '}
            (<code style={{ fontSize: '.72rem' }}>tasks.student_max_active_assignments</code>
            ). <strong>0</strong> = pas de limite pour ce profil (même si le réglage global est
            actif).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              value={maxConcurrentTasks}
              onChange={(e) => onMaxConcurrentChange(e.target.value)}
              disabled={loading}
              placeholder="Hériter du réglage global"
              style={{
                width: 200,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid #d97706',
              }}
              aria-label={`Plafond d'inscriptions simultanées pour ${role.display_name}`}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSaveMaxConcurrent}
              disabled={loading}
            >
              Enregistrer le plafond
            </button>
          </div>
        </div>
      )}
    </>
  );
}
