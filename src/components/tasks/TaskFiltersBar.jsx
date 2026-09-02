import { useMemo } from 'react';

import { DialogShell } from '../DialogShell.jsx';
import { TaskFiltersFields } from './TaskFiltersFields.jsx';
import { useTaskFiltersPanel } from '../../hooks/useTaskFiltersPanel.js';
import { activeTaskFilterChips } from '../../utils/taskFilterSummary.js';
import {
  IconClose,
  IconFileText,
  IconFilter,
  IconPuzzle,
  IconReports,
} from '../../shared/icons.jsx';

const VIEW_MODE_BUTTONS = [
  { value: 'tiles', icon: IconPuzzle, label: 'Tuiles', ariaLabel: 'Affichage en tuiles' },
  { value: 'list', icon: IconFileText, label: 'Liste', ariaLabel: 'Affichage en liste' },
  { value: 'condensed', icon: IconReports, label: 'Condensé', ariaLabel: 'Affichage condensé' },
];

/**
 * Barre de filtres de la vue Tâches, compacte sur mobile (O6bis) : une seule
 * ligne toujours visible — recherche, bouton « Filtres » (badge du nombre de
 * filtres actifs) et mode d'affichage — puis les chips des filtres posés.
 * Les champs de filtrage vivent dans `TaskFiltersFields`, affichés en panneau
 * inline sur écran large (ouvert par défaut, comme avant) et en feuille modale
 * sur écran compact, pour que les tâches restent visibles sans défiler.
 * Composant contrôlé : l'état des filtres reste dans TasksView.
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
  resultCount = null,
}) {
  const { compact, open, toggle, close } = useTaskFiltersPanel();

  const chips = useMemo(
    () =>
      activeTaskFilterChips({
        filterMap,
        maps,
        filterZone,
        zones,
        markers,
        filterProject,
        taskProjects,
        isTeacher,
        filterGroupId,
        groupOptions,
        filterUrgentCategory,
        filterStatus,
      }),
    [
      filterMap,
      maps,
      filterZone,
      zones,
      markers,
      filterProject,
      taskProjects,
      isTeacher,
      filterGroupId,
      groupOptions,
      filterUrgentCategory,
      filterStatus,
    ],
  );

  const clearFilter = (key) => {
    if (key === 'map') setFilterMap('active');
    if (key === 'zone') {
      setFilterZone('');
      onMapLocationFocusChange?.(null);
    }
    if (key === 'project') setFilterProject('');
    if (key === 'group') setFilterGroupId('');
    if (key === 'urgent') setFilterUrgentCategory('');
    if (key === 'status') {
      setFilterStatus('');
      setHasTouchedStatusFilter(true);
    }
  };

  const clearAllFilters = () => {
    chips.forEach((chip) => clearFilter(chip.key));
  };

  const fields = (
    <TaskFiltersFields
      filterMap={filterMap}
      setFilterMap={setFilterMap}
      maps={maps}
      activeMapId={activeMapId}
      filterZone={filterZone}
      setFilterZone={setFilterZone}
      onMapLocationFocusChange={onMapLocationFocusChange}
      usedZones={usedZones}
      usedMarkers={usedMarkers}
      zones={zones}
      markers={markers}
      filterProject={filterProject}
      setFilterProject={setFilterProject}
      taskProjects={taskProjects}
      isTeacher={isTeacher}
      filterGroupId={filterGroupId}
      setFilterGroupId={setFilterGroupId}
      groupOptions={groupOptions}
      isHelpEnabled={isHelpEnabled}
      pulseUnseenPanels={pulseUnseenPanels}
      hasSeenSection={hasSeenSection}
      markSectionSeen={markSectionSeen}
      trackPanelOpen={trackPanelOpen}
      trackPanelDismiss={trackPanelDismiss}
      helpPanelTitlePrefix={helpPanelTitlePrefix}
      helpPanelCloseCta={helpPanelCloseCta}
      helpPanelDismissCta={helpPanelDismissCta}
      filterUrgentCategory={filterUrgentCategory}
      setFilterUrgentCategory={setFilterUrgentCategory}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      setHasTouchedStatusFilter={setHasTouchedStatusFilter}
    />
  );

  return (
    <div className="task-filters task-filters--compactable">
      <div className="task-filters-bar">
        <input
          className="task-filters-search"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Rechercher une tâche..."
          aria-label="Rechercher une tâche"
        />
        <button
          type="button"
          className={`btn btn-sm task-filters-toggle ${chips.length > 0 ? 'btn-primary' : 'btn-ghost'}`}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={!compact && open ? 'task-filters-panel' : undefined}
          aria-label={
            chips.length > 0
              ? `Filtres (${chips.length} actif${chips.length > 1 ? 's' : ''})`
              : 'Filtres'
          }
        >
          <IconFilter size={14} />
          <span className="task-filters-toggle__label" aria-hidden="true">
            Filtres
          </span>
          {chips.length > 0 && (
            <span className="task-filters-count" aria-hidden="true">
              {chips.length}
            </span>
          )}
        </button>
        <div className="tasks-view-switch" role="group" aria-label="Mode d'affichage des tâches">
          {VIEW_MODE_BUTTONS.map((mode) => (
            <button
              key={mode.value}
              className={`btn btn-sm ${viewMode === mode.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode(mode.value)}
              type="button"
              aria-label={mode.ariaLabel}
              aria-pressed={viewMode === mode.value}
              title={mode.label}
            >
              <span aria-hidden="true">
                <mode.icon size={16} />
              </span>
              <span className="tasks-view-switch__label" aria-hidden="true">
                {mode.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="task-filters-chips" role="group" aria-label="Filtres actifs">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="task-filters-chip"
              onClick={() => clearFilter(chip.key)}
              aria-label={chip.removeLabel}
              title={chip.removeLabel}
            >
              <span>{chip.label}</span>
              <IconClose size={14} />
            </button>
          ))}
          <button
            type="button"
            className="task-filters-chip task-filters-chip--reset"
            onClick={clearAllFilters}
          >
            Tout effacer
          </button>
        </div>
      )}

      {compact ? (
        <DialogShell
          open={open}
          onClose={close}
          overlayClassName="modal-overlay task-filters-sheet-overlay"
          dialogClassName="log-modal task-filters-sheet fade-in"
          ariaLabel="Filtres des tâches"
        >
          <div className="task-filters-sheet__head">
            <h3 className="task-filters-sheet__title">
              <IconFilter size={14} /> Filtres
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={close}
              aria-label="Fermer les filtres"
            >
              <IconClose size={14} />
            </button>
          </div>
          {fields}
          <div className="task-filters-sheet__actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearAllFilters}
              disabled={chips.length === 0}
            >
              Réinitialiser
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={close}>
              {Number.isFinite(resultCount)
                ? `Voir ${resultCount} tâche${resultCount > 1 ? 's' : ''}`
                : 'Voir les tâches'}
            </button>
          </div>
        </DialogShell>
      ) : (
        open && (
          <div className="task-filters-panel" id="task-filters-panel">
            {fields}
          </div>
        )
      )}
    </div>
  );
}
