/**
 * Navigation haute du chemin n3boss en TROIS PÔLES (audit UI, D-4) : Contenus / Suivi /
 * Administration, chacun déployant sa rangée d'onglets — les 17 onglets ne défilent plus
 * hors écran dans une barre unique au débordement invisible.
 *
 * Composant feuille purement piloté par props : l'onglet actif, les permissions et les
 * modules restent calculés dans `App` (aucun état déplacé — le pôle actif est DÉRIVÉ de
 * l'onglet courant, rien de nouveau n'est persisté). Cliquer un pôle ouvre son premier
 * onglet visible. Le compteur « à valider » devient un badge (pôle Suivi + onglet Tâches)
 * au lieu d'allonger le libellé dans une barre en nowrap.
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"`, le pôle actif
 * `aria-current="true"` ; les icônes (src/shared/icons.jsx) sont décoratives.
 */
import {
  IconAbout,
  IconAudit,
  IconBiodiv,
  IconFoodweb,
  IconForum,
  IconGlossary,
  IconMap,
  IconMascotPacks,
  IconMediaLibrary,
  IconPoleAdmin,
  IconPoleContents,
  IconPoleTracking,
  IconProfiles,
  IconQuiz,
  IconSettings,
  IconStats,
  IconTasks,
  IconTuto,
  IconVisit,
} from '../../shared/icons.jsx';

const POLES = [
  { id: 'contents', label: 'Contenus', Icon: IconPoleContents },
  { id: 'tracking', label: 'Suivi', Icon: IconPoleTracking },
  { id: 'admin', label: 'Administration', Icon: IconPoleAdmin },
];

function TopTab({ id, tab, onTabChange, children }) {
  const isActive = tab === id;
  return (
    <button
      className={`top-tab ${isActive ? 'active' : ''}`}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onTabChange(id)}
    >
      {children}
    </button>
  );
}

function PendingBadge({ count }) {
  if (!(count > 0)) return null;
  return (
    <span className="top-tab__badge" aria-label={`${count} à valider`} title={`${count} à valider`}>
      {count}
    </span>
  );
}

export function TeacherTopTabs({
  tab,
  onTabChange,
  shouldUseDesktopSplit,
  teacherPendingValidationCount,
  tutorialsModuleEnabled,
  statsEnabled,
  visitEnabled,
  canAccessForum,
  isN3Affiliated,
  hasPermission,
  hasPermissionInRole,
}) {
  const pendingCount = teacherPendingValidationCount > 0 ? teacherPendingValidationCount : 0;
  const tasksText = tutorialsModuleEnabled ? 'Tâches et tuto' : 'Tâches';
  const mapTasksText = tutorialsModuleEnabled ? 'Cartes, tâches et tuto' : 'Cartes & tâches';

  /* Visibilité pilotée par permissions (profil Prof de classe inclus). */
  const canMap = hasPermission('zones.manage') || hasPermission('map.manage_markers');
  const canPlants = hasPermission('plants.manage');
  const canTasks = hasPermission('tasks.manage') || hasPermission('tasks.validate');
  const canVisit = hasPermission('visit.manage');
  const canTutorials = hasPermission('tutorials.manage');
  const canMedia = hasPermission('media.manage') || hasPermission('teacher.access');
  const canStats =
    statsEnabled && (hasPermission('stats.read.all') || hasPermission('stats.read.group'));
  const tabsSpec = [
    {
      id: 'maptasks',
      pole: 'contents',
      Icon: IconMap,
      label: mapTasksText,
      badge: true,
      visible: shouldUseDesktopSplit && (canMap || canTasks),
    },
    { id: 'map', pole: 'contents', Icon: IconMap, label: 'Carte & Zones', visible: canMap },
    { id: 'plants', pole: 'contents', Icon: IconBiodiv, label: 'Biodiversité', visible: canPlants },
    { id: 'quiz', pole: 'contents', Icon: IconQuiz, label: 'Quiz', visible: canPlants },
    /* Le glossaire est rendu pour les deux branches par `PedagoTabs`, mais seule la barre
       élève l'exposait : côté prof, l'onglet n'était atteignable qu'en cliquant un terme
       auto-lié (`openPedagoGlossaryTerm`). */
    {
      id: 'glossary',
      pole: 'contents',
      Icon: IconGlossary,
      label: 'Glossaire',
      visible: canPlants,
    },
    {
      id: 'foodweb',
      pole: 'contents',
      Icon: IconFoodweb,
      label: 'Réseau trophique',
      visible: canPlants,
    },
    {
      id: 'tuto',
      pole: 'contents',
      Icon: IconTuto,
      label: 'Tuto',
      visible: tutorialsModuleEnabled && canTutorials,
    },
    {
      id: 'visit',
      pole: 'contents',
      Icon: IconVisit,
      label: 'Visite',
      visible: visitEnabled && canVisit,
    },
    {
      id: 'mascot_packs',
      pole: 'contents',
      Icon: IconMascotPacks,
      label: 'Packs mascotte',
      visible: visitEnabled && canVisit,
    },
    {
      id: 'media_library',
      pole: 'contents',
      Icon: IconMediaLibrary,
      label: 'Médiathèque',
      visible: canMedia,
    },
    {
      id: 'tasks',
      pole: 'tracking',
      Icon: IconTasks,
      label: tasksText,
      badge: true,
      visible: canTasks,
    },
    { id: 'stats', pole: 'tracking', Icon: IconStats, label: 'Stats', visible: canStats },
    { id: 'forum', pole: 'tracking', Icon: IconForum, label: 'Forum', visible: canAccessForum },
    {
      id: 'audit',
      pole: 'tracking',
      Icon: IconAudit,
      label: 'Audit',
      visible: hasPermission('audit.read'),
    },
    {
      id: 'profiles',
      pole: 'admin',
      Icon: IconProfiles,
      label: isN3Affiliated ? 'n3boss & utilisateurs' : 'Profils & utilisateurs',
      visible:
        hasPermissionInRole('admin.roles.manage') ||
        hasPermissionInRole('admin.users.assign_roles') ||
        hasPermissionInRole('stats.export') ||
        hasPermissionInRole('students.import') ||
        hasPermissionInRole('students.delete') ||
        hasPermissionInRole('users.create') ||
        hasPermissionInRole('groups.manage') ||
        hasPermissionInRole('groups.read'),
    },
    /* `tours.manage` ouvre l'onglet sans `admin.settings.read` : un prof à qui l'on
       délègue la réécriture des visites guidées n'y voit que ce sous-onglet. */
    {
      id: 'settings',
      pole: 'admin',
      Icon: IconSettings,
      label: 'Paramètres',
      visible: hasPermissionInRole('admin.settings.read') || hasPermissionInRole('tours.manage'),
    },
    { id: 'about', pole: 'admin', Icon: IconAbout, label: 'À propos', visible: true },
  ];

  const visibleTabs = tabsSpec.filter((t) => t.visible);
  const activePoleId = tabsSpec.find((t) => t.id === tab)?.pole ?? 'contents';
  const firstTabOfPole = (poleId) => visibleTabs.find((t) => t.pole === poleId)?.id;

  return (
    <nav className="teacher-nav" aria-label="Navigation professeur">
      <div className="top-tabs app-tabs-surface teacher-nav__poles">
        {POLES.map(({ id, label, Icon }) => {
          const isActive = activePoleId === id;
          const first = firstTabOfPole(id);
          if (!first) return null;
          return (
            <button
              key={id}
              type="button"
              className={`top-tab top-tab--pole ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                if (!isActive) onTabChange(first);
              }}
            >
              <Icon size={16} /> {label}
              {id === 'tracking' && <PendingBadge count={pendingCount} />}
            </button>
          );
        })}
      </div>
      <div className="top-tabs app-tabs-surface top-tabs--secondary">
        {visibleTabs
          .filter((t) => t.pole === activePoleId)
          .map(({ id, Icon, label, badge }) => (
            <TopTab key={id} id={id} tab={tab} onTabChange={onTabChange}>
              <Icon size={15} /> {label}
              {badge && <PendingBadge count={pendingCount} />}
            </TopTab>
          ))}
      </div>
    </nav>
  );
}
