import { HelpPanel } from '../HelpPanel';
import { resolveHelpPanelSection } from '../../utils/helpResolve';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { TASK_STATUS_FILTER_OPTIONS } from './taskViewHelpers.js';
import { filterProjectsByMapChoice } from '../../utils/taskSectioning.js';
import { projectStatusLabel, mapLabelFromMaps } from '../../utils/taskListHelpers.js';

/**
 * Champs de filtrage de la vue Tâches : carte, lieu (zones + repères utilisés),
 * projet, groupe (n3boss, avec aide contextuelle), catégorie urgent et statut.
 *
 * **Carte** : le sélecteur change la **carte active** de l'application, il ne filtre pas une
 * liste déjà chargée. Les tâches, zones et repères sont chargés carte par carte
 * (`GET /api/tasks?map_id=…`, `useAppDataSync`) : un filtre qui visait une autre carte que
 * l'active ne pouvait rien trouver — choisir « N3 » depuis la forêt comestible vidait la
 * liste au lieu d'afficher les tâches de N3. Un seul « où suis-je » pour la carte et les
 * tâches supprime ce conflit.
 * Rendu à l'identique dans le panneau inline (écran large) et dans la feuille de
 * filtres (écran compact) — voir `TaskFiltersBar`. Composant contrôlé : l'état
 * reste dans TasksView. La recherche texte n'est pas ici : elle reste visible en
 * permanence dans la barre compacte.
 */
export function TaskFiltersFields({
  filterMap,
  setFilterMap,
  onMapChange = null,
  maps = [],
  activeMapId,
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
  filterRecurrence = '',
  setFilterRecurrence = () => {},
}) {
  const publicSettings = usePublicSettings();
  const helpGroupFilters = resolveHelpPanelSection('groupFilters', publicSettings);
  return (
    <div className="task-filters-fields">
      <select
        value={activeMapId || ''}
        onChange={(e) => {
          const next = e.target.value;
          if (!next || next === activeMapId) return;
          // Le filtre suit la carte : `useTaskFilters` le ramène de toute façon sur 'active'
          // au changement de carte, on le fait ici aussi pour que la liste ne clignote pas.
          setFilterMap('active');
          onMapChange?.(next);
        }}
        aria-label="Carte affichée"
        disabled={!onMapChange || maps.length < 2}
      >
        {maps.length === 0 ? <option value="">{mapLabelFromMaps(activeMapId, maps)}</option> : null}
        {maps.map((mp) => (
          <option key={mp.id} value={mp.id}>
            {mp.label}
          </option>
        ))}
      </select>
      <select
        value={filterZone}
        aria-label="Filtrer les tâches par lieu"
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
      <select
        value={filterProject}
        onChange={(e) => setFilterProject(e.target.value)}
        aria-label="Filtrer les tâches par projet"
      >
        <option value="">Tous les projets</option>
        {filterProjectsByMapChoice(taskProjects, filterMap, activeMapId).map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {projectStatusLabel(p.status)}
          </option>
        ))}
      </select>
      {isTeacher && (
        <div className="task-filters-field-with-help">
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
      {isTeacher && (
        <select
          value={filterRecurrence}
          onChange={(e) => setFilterRecurrence(e.target.value)}
          aria-label="Filtrer les tâches par récurrence"
        >
          <option value="">Toute récurrence</option>
          <option value="recurring">Récurrentes seulement</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="biweekly">Toutes les 2 semaines</option>
          <option value="monthly">Mensuelle</option>
          <option value="none">Sans récurrence</option>
        </select>
      )}
      <select
        value={filterStatus}
        aria-label="Filtrer les tâches par statut"
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
        {isTeacher && <option value="archived">Archivés</option>}
      </select>
    </div>
  );
}
