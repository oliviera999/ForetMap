import { useState } from 'react';
import { getRoleTerms } from '../utils/n3-terminology';
import { useSession } from '../contexts/SessionContext.jsx';
import { IconAudit, IconShield, IconStats, IconUser } from '../shared/icons.jsx';
import { AuditEventsPanel } from './audit/AuditEventsPanel.jsx';
import { UserActivityPanel } from './audit/UserActivityPanel.jsx';
import { VisitStatsPanel } from './audit/VisitStatsPanel.jsx';
import './audit/audit-journal.css';

/**
 * Écran « Audit & Statistiques » : historique des actions, journal de sécurité
 * (administrateurs), activité par utilisateur et indicateurs de visite. Orchestration seule :
 * chaque sous-onglet vit dans `./audit/`.
 */
function AuditLog({ canReadSecurity = false }) {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [subTab, setSubTab] = useState('history');
  const [selectedActor, setSelectedActor] = useState(null);

  // Depuis le détail d'un événement : ouvrir la fiche du compte dans l'onglet Utilisateurs.
  const openActor = (actor) => {
    setSelectedActor(actor || null);
    if (actor) setSubTab('users');
  };

  const tabs = [
    { id: 'history', label: 'Historique', icon: <IconAudit size={14} /> },
    canReadSecurity ? { id: 'security', label: 'Sécurité', icon: <IconShield size={14} /> } : null,
    { id: 'users', label: 'Utilisateurs', icon: <IconUser size={14} /> },
    { id: 'visit-stats', label: 'Stats visite', icon: <IconStats size={14} /> },
  ].filter(Boolean);

  return (
    <div className="fade-in">
      <h2 className="section-title">
        <IconAudit size={20} /> Audit & Statistiques
      </h2>
      <p className="section-sub">
        Historique des actions {roleTerms.teacherShort}, activité par utilisateur et indicateurs de
        visite.
        {canReadSecurity
          ? ' Les administrateurs disposent aussi du journal de sécurité (IP, navigateur).'
          : ''}
      </p>
      <div
        className="fm-subtabs fm-subtabs--scroll audit-subtabs"
        role="tablist"
        aria-label="Sections audit"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={subTab === t.id}
            onClick={() => setSubTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {subTab === 'history' ? (
        <AuditEventsPanel
          key="history"
          source="audit"
          roleTerms={roleTerms}
          onSelectActor={openActor}
          intro={
            <p className="section-sub audit-intro">
              Actions faites dans le site : créations, modifications, suppressions, validations,
              droits… « Principaux » masque la routine ; « Vue étendue » montre tout.
            </p>
          }
        />
      ) : subTab === 'security' && canReadSecurity ? (
        <AuditEventsPanel
          key="security"
          source="security"
          roleTerms={roleTerms}
          onSelectActor={openActor}
          intro={
            <p className="section-sub audit-intro">
              Événements de sécurité avec adresse IP et navigateur, connexions comprises. Réservé
              aux administrateurs. La déconnexion d’un compte n’efface pas cet historique.
            </p>
          }
        />
      ) : subTab === 'users' ? (
        <UserActivityPanel
          canReadSecurity={canReadSecurity}
          roleTerms={roleTerms}
          selectedActor={selectedActor}
          onSelectActor={setSelectedActor}
        />
      ) : (
        <VisitStatsPanel roleTerms={roleTerms} />
      )}
    </div>
  );
}

export { AuditLog };
