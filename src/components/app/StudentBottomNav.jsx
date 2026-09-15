/**
 * Navigation basse du chemin n3beur — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les drapeaux
 * de modules et le compteur de tâches assignées restent calculés dans `App`
 * (aucun état déplacé, `onTabChange` = setTab). État local : tiroir « Plus ».
 *
 * Mobile / tactile (`layoutMode` compact) : 3–4 onglets primaires + bouton Plus
 * ouvrant un BottomSheet (pattern aligné sur GLMobileNav — audit iPhone 2026-09).
 * Desktop large : barre complète (comportement historique).
 *
 * Icônes : jeu SVG commun (src/shared/icons.jsx, audit D-2) — rendu identique sur tous
 * les appareils ; les emojis restent réservés au contenu métier.
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"` ; l'icône est décorative
 * (`aria-hidden`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { resolveStudentMobilePrimaryIds } from '../../constants/app-runtime.js';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';
import {
  IconAbout,
  IconBiodiv,
  IconFoodweb,
  IconForum,
  IconGlossary,
  IconMap,
  IconNotebook,
  IconProfiles,
  IconQuiz,
  IconStats,
  IconTasks,
  IconTuto,
  IconVisit,
} from '../../shared/icons.jsx';
import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';

const COMPACT_WIDTH_QUERY = '(max-width: 1023px)';
const COMPACT_POINTER_QUERY = '(pointer: coarse)';

function NavButton({ id, tab, onTabChange, icon, children, className = 'nav-btn' }) {
  const isActive = tab === id;
  return (
    <button
      className={`${className}${isActive ? ' active' : ''}`}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onTabChange(id)}
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>{' '}
      {children}
    </button>
  );
}

/**
 * Construit la liste ordonnée des onglets visibles (même ordre que la barre historique).
 * @returns {{ id: string, label: string, icon: import('react').ReactNode }[]}
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
}) {
  const assignedSuffix =
    studentActiveAssignedTasksCount > 0 ? ` (${studentActiveAssignedTasksCount})` : '';
  const items = [];

  if (isVisitor && visitEnabled) {
    items.push({ id: 'visit', label: 'Visite', icon: <IconVisit size={20} /> });
  }
  if (canAccessStudentMapTasks && shouldUseDesktopSplit) {
    items.push({
      id: 'maptasks',
      label: `${tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}${assignedSuffix}`,
      icon: <IconMap size={20} />,
    });
  }
  if (canAccessStudentMapTasks) {
    items.push({ id: 'map', label: 'Carte', icon: <IconMap size={20} /> });
    items.push({
      id: 'tasks',
      label: `${tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}${assignedSuffix}`,
      icon: <IconTasks size={20} />,
    });
  }
  items.push({ id: 'plants', label: 'Biodiversité', icon: <IconBiodiv size={20} /> });
  items.push({ id: 'quiz', label: 'Quiz', icon: <IconQuiz size={20} /> });
  items.push({ id: 'glossary', label: 'Glossaire', icon: <IconGlossary size={20} /> });
  items.push({ id: 'foodweb', label: 'Réseau', icon: <IconFoodweb size={20} /> });
  if (tutorialsModuleEnabled && canAccessTutorials) {
    items.push({ id: 'tuto', label: 'Tuto', icon: <IconTuto size={20} /> });
  }
  if (canViewGeneralStats) {
    items.push({ id: 'stats', label: 'Stats', icon: <IconStats size={20} /> });
  }
  if (canAccessProfiles) {
    items.push({ id: 'profiles', label: profilesLabel, icon: <IconProfiles size={20} /> });
  }
  if (observationsEnabled) {
    items.push({ id: 'notebook', label: 'Carnet', icon: <IconNotebook size={20} /> });
  }
  if (!isVisitor && visitEnabled) {
    items.push({ id: 'visit', label: 'Visite', icon: <IconVisit size={20} /> });
  }
  if (canAccessForum) {
    items.push({ id: 'forum', label: 'Forum', icon: <IconForum size={20} /> });
  }
  items.push({ id: 'about', label: 'À propos', icon: <IconAbout size={20} /> });

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
   * `auto` : compact si max-width 1023px ou pointeur coarse.
   * `compact` / `full` : forçage (tests).
   */
  layoutMode = 'auto',
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef(null);
  const widthCompact = useMediaQuery(COMPACT_WIDTH_QUERY);
  const pointerCompact = useMediaQuery(COMPACT_POINTER_QUERY);
  const isCompact =
    layoutMode === 'compact' || (layoutMode === 'auto' && (widthCompact || pointerCompact));

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

  const primaryItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return primaryIds.map((id) => byId.get(id)).filter(Boolean);
  }, [items, primaryIds]);

  const overflowCount = Math.max(0, items.length - primaryItems.length);
  const showMore = isCompact && overflowCount > 0;
  const showMoreActive = showMore && primaryItems.every((item) => item.id !== tab);
  const barItems = showMore ? primaryItems : items;

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

  return (
    <>
      <nav
        ref={navRef}
        className={`bottom-nav${showMore ? ' bottom-nav--compact' : ''}`}
        aria-label="Navigation principale"
      >
        {barItems.map((item) => (
          <NavButton
            key={item.id}
            id={item.id}
            tab={tab}
            onTabChange={onTabChange}
            icon={item.icon}
          >
            {item.label}
          </NavButton>
        ))}
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
          <div className="fm-nav-drawer-tabs" role="list" aria-label="Tous les onglets">
            {items.map((item) => {
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`fm-nav-drawer-tab${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleSelectFromDrawer(item.id)}
                >
                  <span className="fm-nav-drawer-tab__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="fm-nav-drawer-tab__label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
