/**
 * Navigation basse du chemin n3beur — extraite de `src/App.jsx` (O6), organisée en QUATRE
 * PÔLES depuis le lot 6 de l'audit UI/UX du 19/11/2026 (U10) : Terrain / Vivant / Apprendre /
 * Moi (`STUDENT_NAV_POLE_BY_TAB`). Jusqu'à 19 onglets s'empilaient à plat.
 *
 * Composant feuille purement piloté par props : l'onglet actif, les drapeaux de modules et le
 * compteur de tâches assignées restent calculés dans `App` (aucun état déplacé, `onTabChange`
 * = setTab). Le pôle actif est DÉRIVÉ de l'onglet courant (rien de nouveau n'est persisté),
 * comme pour la barre prof (`TeacherTopTabs`) avec qui il partage `NavPoles.jsx`.
 *
 * Ordinateur (pointeur fin, ≥ `lg`) : rangée des pôles puis onglets du pôle actif, dans la
 * même barre basse. Cliquer un pôle ouvre son premier onglet.
 * Mobile / tactile (`layoutMode` compact) : 3–4 onglets primaires + bouton Plus ouvrant un
 * BottomSheet groupé par pôles (pattern aligné sur GLMobileNav — audit iPhone 2026-09).
 *
 * Icônes : jeu SVG commun (src/shared/icons.jsx, audit D-2), une icône propre par onglet.
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"`, le pôle actif
 * `aria-current="true"` ; les icônes sont décoratives (`aria-hidden`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  resolveStudentMobilePrimaryIds,
  STUDENT_NAV_POLE_BY_TAB,
} from '../../constants/app-runtime.js';
import { MEDIA } from '../../shared/breakpoints.js';
import {
  IconAbout,
  IconBiodiv,
  IconFoodweb,
  IconForum,
  IconGlobe,
  IconGlossary,
  IconIndividuals,
  IconMap,
  IconNestedGroups,
  IconNotebook,
  IconPoleField,
  IconPoleLearn,
  IconPoleLiving,
  IconPoleMe,
  IconProfiles,
  IconQuiz,
  IconSearch,
  IconSessions,
  IconStats,
  IconTasks,
  IconTuto,
  IconVisit,
} from '../../shared/icons.jsx';
import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { NavPoleButtons, NavSheetPoleGroups, resolveNavPoles, useCompactNav } from './NavPoles.jsx';
import { UnreadDot } from './UnreadDot.jsx';

/** Pôles élève, dans l'ordre d'affichage (`STUDENT_NAV_POLE_IDS`). */
export const STUDENT_NAV_POLES = [
  { id: 'field', label: 'Terrain', Icon: IconPoleField },
  { id: 'living', label: 'Vivant', Icon: IconPoleLiving },
  { id: 'learn', label: 'Apprendre', Icon: IconPoleLearn },
  { id: 'me', label: 'Moi', Icon: IconPoleMe },
];

function NavButton({ id, tab, onTabChange, Icon, children, unread = false }) {
  const isActive = tab === id;
  return (
    <button
      className={`nav-btn${isActive ? ' active' : ''}`}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onTabChange(id)}
    >
      <span className="nav-icon" aria-hidden="true">
        <Icon size={20} />
      </span>{' '}
      {children}
      <UnreadDot show={unread} />
    </button>
  );
}

/**
 * Construit la liste des onglets visibles, rangés par pôle (Terrain, Vivant, Apprendre, Moi).
 * Chaque onglet porte son pôle (`STUDENT_NAV_POLE_BY_TAB`).
 * @returns {{ id: string, label: string, Icon: Function, pole: string }[]}
 */
export function buildStudentNavItems({
  canAccessStudentMapTasks,
  isVisitor = false,
  shouldUseDesktopSplit,
  tutorialsModuleEnabled,
  canAccessTutorials = false,
  studentActiveAssignedTasksCount = 0,
  canViewGeneralStats,
  canAccessProfiles = false,
  profilesLabel = 'Classe',
  observationsEnabled,
  visitEnabled,
  canAccessForum,
  showNestedGroups = true,
  showIndividuals = true,
  /*
   * Onglets des modules pédagogiques activables DISPONIBLES pour ce compte : module allumé,
   * ou éteint mais compte gestionnaire (`resolvePedagoModuleAccess`, calculé dans `App`).
   */
  idKeysEnabled = true,
  pedagoSessionsEnabled = true,
  individualsEnabled = true,
  fresqueEnabled = true,
}) {
  const assignedSuffix =
    studentActiveAssignedTasksCount > 0 ? ` (${studentActiveAssignedTasksCount})` : '';
  const items = [];
  const add = (id, label, Icon) =>
    items.push({ id, label, Icon, pole: STUDENT_NAV_POLE_BY_TAB[id] });

  // Terrain — le visiteur commence par la Visite.
  if (isVisitor && visitEnabled) add('visit', 'Visite', IconVisit);
  if (canAccessStudentMapTasks && shouldUseDesktopSplit) {
    add(
      'maptasks',
      `${tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}${assignedSuffix}`,
      IconMap,
    );
  }
  if (canAccessStudentMapTasks) {
    add('map', 'Carte', IconMap);
    add(
      'tasks',
      `${tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}${assignedSuffix}`,
      IconTasks,
    );
  }
  if (!isVisitor && visitEnabled) add('visit', 'Visite', IconVisit);

  // Vivant.
  add('plants', 'Biodiversité', IconBiodiv);
  if (idKeysEnabled) add('id-keys', 'Clés', IconSearch);
  add('foodweb', 'Réseau', IconFoodweb);
  if (showNestedGroups) add('nested-groups', 'Groupes', IconNestedGroups);
  // Deux conditions cumulées : le niveau pédagogique (masqué au collège) ET l'interrupteur.
  if (showIndividuals && individualsEnabled) add('individuals', 'Individus', IconIndividuals);

  // Apprendre.
  add('quiz', 'Quiz', IconQuiz);
  add('glossary', 'Glossaire', IconGlossary);
  if (pedagoSessionsEnabled) add('sessions', 'Séances', IconSessions);
  if (tutorialsModuleEnabled && canAccessTutorials) add('tuto', 'Tuto', IconTuto);
  if (fresqueEnabled) add('fresque', 'Fresque', IconGlobe);

  // Moi.
  if (observationsEnabled) add('notebook', 'Carnet', IconNotebook);
  if (canAccessForum) add('forum', 'Forum', IconForum);
  if (canViewGeneralStats) add('stats', 'Stats', IconStats);
  if (canAccessProfiles) add('profiles', profilesLabel, IconProfiles);
  add('about', 'À propos', IconAbout);

  return items;
}

export function StudentBottomNav({
  tab,
  onTabChange,
  canAccessStudentMapTasks,
  isVisitor = false,
  shouldUseDesktopSplit,
  tutorialsModuleEnabled,
  /** Tutos consultables même sans carte/tâches (visiteur / prof de classe). */
  canAccessTutorials = false,
  studentActiveAssignedTasksCount,
  canViewGeneralStats,
  /** Liste / gestion des élèves de ses groupes (prof de classe). */
  canAccessProfiles = false,
  profilesLabel = 'Classe',
  observationsEnabled,
  visitEnabled,
  canAccessForum,
  /**
   * Onglets Clés / Séances / Individus disponibles pour ce compte (`resolvePedagoModuleAccess`) :
   * module allumé, ou éteint pour les élèves mais compte gestionnaire. Défaut : disponibles.
   */
  idKeysEnabled = true,
  pedagoSessionsEnabled = true,
  individualsEnabled = true,
  fresqueEnabled = true,
  /** Point rouge sur l'onglet Forum : message d'autrui non lu. */
  hasForumUnread = false,
  /**
   * `auto` : compact sous `lg` (`MEDIA.belowDesktop`) ou pointeur grossier.
   * `compact` / `full` : forçage (tests).
   */
  layoutMode = 'auto',
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef(null);
  const isCompact = useCompactNav({ widthQuery: MEDIA.belowDesktop, layoutMode });
  const { canShow } = useBiodivPedago();
  const showNestedGroups = canShow('nested_groups_tab');
  const showIndividuals = canShow('individuals_tab');

  const items = useMemo(
    () =>
      buildStudentNavItems({
        canAccessStudentMapTasks,
        isVisitor,
        shouldUseDesktopSplit,
        tutorialsModuleEnabled,
        canAccessTutorials,
        studentActiveAssignedTasksCount,
        canViewGeneralStats,
        canAccessProfiles,
        profilesLabel,
        observationsEnabled,
        visitEnabled,
        canAccessForum,
        showNestedGroups,
        showIndividuals,
        idKeysEnabled,
        pedagoSessionsEnabled,
        individualsEnabled,
        fresqueEnabled,
      }),
    [
      canAccessStudentMapTasks,
      isVisitor,
      shouldUseDesktopSplit,
      tutorialsModuleEnabled,
      canAccessTutorials,
      studentActiveAssignedTasksCount,
      canViewGeneralStats,
      canAccessProfiles,
      profilesLabel,
      observationsEnabled,
      visitEnabled,
      canAccessForum,
      showNestedGroups,
      showIndividuals,
      idKeysEnabled,
      pedagoSessionsEnabled,
      individualsEnabled,
      fresqueEnabled,
    ],
  );

  const primaryIds = useMemo(
    () =>
      resolveStudentMobilePrimaryIds({
        canAccessStudentMapTasks,
        visitEnabled: Boolean(visitEnabled),
        visibleIds: items.map((item) => item.id),
      }),
    [canAccessStudentMapTasks, visitEnabled, items],
  );

  const navItems = useMemo(
    () =>
      hasForumUnread
        ? items.map((item) => (item.id === 'forum' ? { ...item, unread: true } : item))
        : items,
    [items, hasForumUnread],
  );

  const primaryItems = useMemo(() => {
    const byId = new Map(navItems.map((item) => [item.id, item]));
    return primaryIds.map((id) => byId.get(id)).filter(Boolean);
  }, [navItems, primaryIds]);

  const poles = useMemo(
    () => resolveNavPoles({ poles: STUDENT_NAV_POLES, tabs: navItems, tab }),
    [navItems, tab],
  );

  const overflowCount = Math.max(0, navItems.length - primaryItems.length);
  const showMore = isCompact && overflowCount > 0;
  const showPoles = !isCompact;
  const showMoreActive = showMore && primaryItems.every((item) => item.id !== tab);
  let barItems = navItems;
  if (showMore) barItems = primaryItems;
  else if (showPoles) barItems = poles.tabsOfPole(poles.activePoleId);
  const moreHasUnread =
    showMore && navItems.some((item) => item.unread && !barItems.includes(item));
  const activePoleLabel = STUDENT_NAV_POLES.find((p) => p.id === poles.activePoleId)?.label;

  useEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="page"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [tab, isCompact]);

  function handleSelectFromDrawer(id) {
    onTabChange(id);
    setDrawerOpen(false);
  }

  const tabButtons = barItems.map((item) => (
    <NavButton
      key={item.id}
      id={item.id}
      tab={tab}
      onTabChange={onTabChange}
      Icon={item.Icon}
      unread={Boolean(item.unread)}
    >
      {item.label}
    </NavButton>
  ));

  let navClassName = 'bottom-nav';
  if (showMore) navClassName += ' bottom-nav--compact';
  else if (showPoles) navClassName += ' bottom-nav--poles';

  return (
    <>
      <nav ref={navRef} className={navClassName} aria-label="Navigation principale">
        {showPoles ? (
          <>
            <NavPoleButtons
              polesWithTabs={poles.polesWithTabs}
              activePoleId={poles.activePoleId}
              onTabChange={onTabChange}
              className="bottom-nav__poles"
              buttonClassName="nav-btn nav-btn--pole"
              iconSize={18}
              ariaLabel="Pôles"
            />
            <div
              className="bottom-nav__tabs"
              role="group"
              aria-label={activePoleLabel ? `Onglets ${activePoleLabel}` : undefined}
            >
              {tabButtons}
            </div>
          </>
        ) : (
          tabButtons
        )}
        {showMore ? (
          <button
            type="button"
            className={`nav-btn nav-btn--more${showMoreActive ? ' active' : ''}`}
            aria-label={`Plus d'onglets (${overflowCount} disponibles)`}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="nav-icon" aria-hidden="true">
              ⋯
            </span>{' '}
            Plus
            <UnreadDot show={moreHasUnread} />
          </button>
        ) : null}
      </nav>
      {showMore ? (
        <BottomSheet
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Navigation"
          closeLabel="Fermer le menu"
          className="fm-nav-drawer"
          overlayClassName="fm-nav-drawer-overlay"
          initialSnap="half"
        >
          <NavSheetPoleGroups
            polesWithTabs={poles.polesWithTabs}
            activePoleId={poles.activePoleId}
            tab={tab}
            onSelect={handleSelectFromDrawer}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}
