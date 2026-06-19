import React from 'react';

import { HelpPanel } from '../HelpPanel';
import { resolveHelpPanelSection } from '../../utils/helpResolve';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { TASK_STATUS_FILTER_OPTIONS } from './taskViewHelpers.js';
import { filterProjectsByMapChoice } from '../../utils/taskSectioning.js';
import { projectStatusLabel, mapLabelFromMaps } from '../../utils/taskListHelpers.js';

/**
 * Barre de filtres de la vue Tâches (extraite de `tasks-views.jsx`, O6) :
 * mode d'affichage (tuiles / liste / condensé), carte, recherche texte, lieu
 * (zones + repères utilisés), projet, groupe (n3boss, avec aide contextuelle),
 * catégorie urgent et statut. Composant contrôlé : l'état reste dans TasksView.
 */
export function TaskFiltersBar({
  viewMode,
  setViewMode,
  filterMap,
  setFilterMap,
  maps = [],
  activeMapId,
  filterText,
  setFilterText,
  filterZone,
  setFilterZone,
  onMapLocationFocusChange = null,
  usedZones = [],
  usedMarkers = [],
  zones = [],
  markers = [],
  filterProject,
  setFilterProject,
  taskProjects = [],
  isTeacher = false,
  filterGroupId,
  setFilterGroupId,
  groupOptions = [],
  isHelpEnabled = false,
  pulseUnseenPanels = false,
  hasSeenSection = () => true,
  markSectionSeen = () => {},
  trackPanelOpen = () => {},
  trackPanelDismiss = () => {},
  helpPanelTitlePrefix,
  helpPanelCloseCta,
  helpPanelDismissCta,
  filterUrgentCategory,
  setFilterUrgentCategory,
  filterStatus,
  setFilterStatus,
  setHasTouchedStatusFilter,
}) {
  const publicSettings = usePublicSettings();
  const helpGroupFilters = resolveHelpPanelSection('groupFilters', publicSettings);
  return (
    <div className="task-filters">
      <div className="tasks-view-switch" role="group" aria-label="Mode d'affichage des tâches">
        <button
          className={`btn btn-sm ${viewMode === 'tiles' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('tiles')}
          type="button"
        >
          🧩 Tuiles
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('list')}
          type="button"
        >
          📄 Liste
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'condensed' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('condensed')}
          type="button"
        >
          📋 Condensé
        </button>
      </div>
      <select value={filterMap} onChange={(e) => setFilterMap(e.target.value)}>
        <option value="active">Carte active ({mapLabelFromMaps(activeMapId, maps)})</option>
        <option value="all">Toutes cartes</option>
        {maps.map((mp) => (
          <option key={mp.id} value={mp.id}>
            {mp.label}
          </option>
        ))}
      </select>
      <input
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        placeholder="🔍 Rechercher une tâche..."
      />
      <select
        value={filterZone}
        onChange={(e) => {
          const v = e.target.value;
          setFilterZone(v);
          if (!v) {
            onMapLocationFocusChange?.(null);
          } else {
            const colon = v.indexOf(':');
            if (colon > 0) {
              const k = v.slice(0, colon);
              const idPart = v.slice(colon + 1);
              if ((k === 'zone' || k === 'marker') && idPart) {
                onMapLocationFocusChange?.({ kind: k, id: idPart });
              } else {
                onMapLocationFocusChange?.(null);
              }
            } else {
              onMapLocationFocusChange?.(null);
            }
          }
        }}
      >
        <option value="">Toutes les zones</option>
        {usedZones.map((zId) => {
          const z = zones.find((zz) => zz.id === zId);
          return (
            <option key={`zone:${zId}`} value={`zone:${zId}`}>
              {z ? z.name : zId}
            </option>
          );
        })}
        {usedMarkers.length > 0 && (
          <option value="" disabled>
            -- Repères --
          </option>
        )}
        {usedMarkers.map((mId) => {
          const marker = markers.find((mm) => mm.id === mId);
          const markerLabel = marker
            ? `${marker.emoji ? `${marker.emoji} ` : '📍 '}${marker.label}`
            : `📍 ${mId}`;
          return (
            <option key={`marker:${mId}`} value={`marker:${mId}`}>
              {markerLabel}
            </option>
          );
        })}
      </select>
      <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
        <option value="">Tous les projets</option>
        {filterProjectsByMapChoice(taskProjects, filterMap, activeMapId).map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {projectStatusLabel(p.status)}
          </option>
        ))}
      </select>
      {isTeacher && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={filterGroupId}
            onChange={(e) => setFilterGroupId(e.target.value)}
            aria-label="Filtrer les tâches par groupe"
          >
            <option value="">Tous les groupes</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="tasks-group-filter"
              title={helpGroupFilters.title}
              entries={helpGroupFilters.items}
              isTeacher={isTeacher}
              isPulsing={pulseUnseenPanels && !hasSeenSection('tasks-group-filter')}
              panelTitlePrefix={helpPanelTitlePrefix}
              closeButtonText={helpPanelCloseCta}
              dismissButtonText={helpPanelDismissCta}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
        </div>
      )}
      <select
        value={filterUrgentCategory}
        onChange={(e) => setFilterUrgentCategory(e.target.value)}
        aria-label="Filtrer par catégorie urgent"
      >
        <option value="">Toutes les catégories</option>
        <option value="urgent">Urgent ! uniquement</option>
        <option value="non_urgent">Hors urgent</option>
      </select>
      <select
        value={filterStatus}
        onChange={(e) => {
          setFilterStatus(e.target.value);
          setHasTouchedStatusFilter(true);
        }}
      >
        <option value="">Tous les statuts</option>
        {TASK_STATUS_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
