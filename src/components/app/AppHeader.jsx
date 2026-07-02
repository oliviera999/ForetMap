import React from 'react';
import { NotificationCenter } from '../notifications-center';
import { StudentAvatar } from '../student-avatar';
import { Tooltip } from '../Tooltip';
import { withAppBase } from '../../services/api';
import { resolveRealtimeTooltip } from '../../utils/helpResolve';

/**
 * En-tête applicatif — extrait de `src/App.jsx` (audit §6.1, étape 1).
 *
 * Composant feuille purement piloté par props : logo, badge version,
 * pastille temps réel, centre de notifications, badge utilisateur,
 * boutons rôle / élévation / déconnexion. Aucun état déplacé — les
 * handlers (désélévation, changement de vue rôle, déconnexion…) restent
 * définis dans `App` et sont passés en callbacks.
 */
export function AppHeader({
  // PWA / installation
  isStandaloneMode,
  deferredInstallPrompt,
  onInstallClick,
  // Version & temps réel
  isTeacher,
  effectiveIsTeacher,
  appVersion,
  teacherSyncStatus,
  publicSettings,
  // Centre de notifications
  notificationRoleKey,
  notifications,
  notificationsUnreadCount,
  notificationPrefs,
  notificationMetrics,
  onNotificationTogglePref,
  onNotificationOpenAction,
  onNotificationMarkAsRead,
  onNotificationMarkAllRead,
  onNotificationRemove,
  onNotificationClearRead,
  onNotificationOpenPanel,
  onNotificationResetMetrics,
  // Badge utilisateur & profil
  currentUser,
  currentUserLabel,
  canOpenUserDialogs,
  canOpenTeacherStatsFromBadge,
  roleTerms,
  onOpenStats,
  onOpenTeacherStatsTab,
  onOpenProfile,
  // Bascule de vue rôle (prof / élève / natif)
  roleViewMode,
  canSwitchToStudentView,
  canSwitchToTeacherView,
  onRoleViewModeSelect,
  // Élévation (PIN) & déconnexion
  elevated,
  onDisableElevation,
  onRequestPin,
  onLogout,
  // Aide contextuelle
  helpText,
}) {
  return (
    <header className="app-header">
      <div className="logo">
        <img
          className="app-header-logo"
          src={withAppBase('/app-logo-n3.png')}
          alt=""
          width={28}
          height={28}
          decoding="async"
        />
        <span className="logo-title">ForêtMap</span>
      </div>
      <div className="header-right">
        {!isStandaloneMode && deferredInstallPrompt && (
          <button
            type="button"
            className="lock-btn install-btn"
            aria-label="Installer l'application"
            title="Installer l'application"
            onClick={onInstallClick}
          >
            ⬇️ <span className="lock-label">Installer</span>
          </button>
        )}
        {isTeacher && (
          <span
            className="app-version-badge"
            title={`Version installée: ${appVersion != null ? appVersion : 'chargement...'}`}
            aria-label={`Version ${appVersion != null ? appVersion : 'en chargement'}`}
          >
            <span className="app-version-badge__version">
              v{appVersion != null ? appVersion : '…'}
            </span>
            <span className="app-version-badge__status">à jour</span>
          </span>
        )}
        {effectiveIsTeacher && (
          <span
            className="realtime-prof-wrap"
            title={resolveRealtimeTooltip(teacherSyncStatus, publicSettings)}
            aria-label={
              resolveRealtimeTooltip(teacherSyncStatus, publicSettings) || 'État du temps réel'
            }
            role="status"
          >
            <span className={`realtime-dot realtime-dot--${teacherSyncStatus}`} aria-hidden />
          </span>
        )}
        <NotificationCenter
          roleKey={notificationRoleKey}
          unreadCount={notificationsUnreadCount}
          items={notifications}
          prefs={notificationPrefs}
          metrics={notificationMetrics}
          onTogglePref={onNotificationTogglePref}
          onOpenAction={onNotificationOpenAction}
          onMarkAsRead={onNotificationMarkAsRead}
          onMarkAllRead={onNotificationMarkAllRead}
          onRemove={onNotificationRemove}
          onClearRead={onNotificationClearRead}
          onOpenPanel={onNotificationOpenPanel}
          onResetMetrics={onNotificationResetMetrics}
          helpText={helpText('header.notifications')}
        />
        <Tooltip text={helpText('header.userBadge')}>
          <button
            type="button"
            className="user-badge"
            onClick={() => {
              if (canOpenUserDialogs) {
                onOpenStats();
                return;
              }
              if (canOpenTeacherStatsFromBadge) {
                onOpenTeacherStatsTab();
              }
            }}
            style={{
              cursor: canOpenUserDialogs || canOpenTeacherStatsFromBadge ? 'pointer' : 'default',
            }}
            aria-label={
              canOpenUserDialogs
                ? 'Voir mes statistiques'
                : canOpenTeacherStatsFromBadge
                  ? `Ouvrir les statistiques ${roleTerms.studentPlural}`
                  : 'Badge utilisateur'
            }
          >
            <StudentAvatar student={currentUser} size={20} style={{ border: 'none' }} />
            <span className="user-badge-text">{currentUserLabel}</span>
          </button>
        </Tooltip>
        {canOpenUserDialogs && (
          <Tooltip text={helpText('header.profileEdit')}>
            <button className="lock-btn" aria-label="Modifier mon profil" onClick={onOpenProfile}>
              ✏️
            </button>
          </Tooltip>
        )}
        {isTeacher && (
          <>
            {roleViewMode !== 'native' && (
              <Tooltip text={helpText('header.roleReset')}>
                <button
                  className="lock-btn"
                  aria-label="Revenir au rôle normal"
                  onClick={() => onRoleViewModeSelect('native')}
                >
                  ↩️
                </button>
              </Tooltip>
            )}
            {roleViewMode !== 'student' && canSwitchToStudentView && (
              <Tooltip text={helpText('header.roleStudent')}>
                <button
                  className="lock-btn"
                  aria-label={`Passer en vue ${roleTerms.studentSingular}`}
                  onClick={() => onRoleViewModeSelect('student')}
                >
                  🎓
                </button>
              </Tooltip>
            )}
            {roleViewMode !== 'teacher' && canSwitchToTeacherView && (
              <Tooltip text={helpText('header.roleTeacher')}>
                <button
                  className="lock-btn"
                  aria-label={`Passer en vue ${roleTerms.teacherShort}`}
                  onClick={() => onRoleViewModeSelect('teacher')}
                >
                  🧑‍🏫
                </button>
              </Tooltip>
            )}
          </>
        )}
        <Tooltip text={helpText('header.elevatedMode')}>
          <button
            className={`lock-btn ${elevated ? 'active' : ''}`}
            aria-label={elevated ? 'Désactiver les droits étendus' : 'Activer les droits étendus'}
            onClick={() => {
              if (elevated) {
                onDisableElevation();
              } else {
                onRequestPin();
              }
            }}
          >
            {elevated ? (
              <>
                🔓 <span className="lock-label">Élevé</span>
              </>
            ) : (
              '🔒'
            )}
          </button>
        </Tooltip>
        <Tooltip text={helpText('header.logout')}>
          <button className="lock-btn" aria-label="Déconnexion" onClick={onLogout}>
            ↩️
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
