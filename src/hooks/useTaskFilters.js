import { useEffect, useState } from 'react';

/**
 * États des filtres de la vue Tâches (P2, extrait de tasks-views.jsx, iso-comportement) :
 * texte, lieu (zone/marqueur), statut (+ drapeau « touché » pour les sections élève),
 * carte, projet, groupe et catégorie d'urgence. Resynchronisations :
 * - un focus carte (`mapLocationFocus`) présélectionne le filtre lieu ;
 * - un changement de carte active ramène le filtre carte sur `'active'`.
 */
export function useTaskFilters(activeMapId, mapLocationFocus = null) {
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [hasTouchedStatusFilter, setHasTouchedStatusFilter] = useState(false);
  const [filterMap, setFilterMap] = useState('active');
  const [filterProject, setFilterProject] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');
  /** '' = toutes, 'urgent' = importance absolute uniquement, 'non_urgent' = exclure les urgent */
  const [filterUrgentCategory, setFilterUrgentCategory] = useState('');

  const mapLocationFocusKey = mapLocationFocus
    ? `${mapLocationFocus.kind}:${mapLocationFocus.id}`
    : '';
  useEffect(() => {
    if (!mapLocationFocusKey) return;
    setFilterZone(mapLocationFocusKey);
  }, [mapLocationFocusKey]);

  useEffect(() => {
    setFilterMap('active');
  }, [activeMapId]);

  return {
    filterText,
    setFilterText,
    filterZone,
    setFilterZone,
    filterStatus,
    setFilterStatus,
    hasTouchedStatusFilter,
    setHasTouchedStatusFilter,
    filterMap,
    setFilterMap,
    filterProject,
    setFilterProject,
    filterGroupId,
    setFilterGroupId,
    filterUrgentCategory,
    setFilterUrgentCategory,
  };
}
