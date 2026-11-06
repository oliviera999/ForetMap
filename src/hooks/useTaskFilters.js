import { useEffect, useState } from 'react';
import { readTaskTaxonomyFilters, writeTaskTaxonomyFilters } from '../utils/taskTaxonomyFilters.js';

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
  /**
   * Récurrence : '' = toutes, 'recurring' = toute récurrence, 'weekly'|'biweekly'|'monthly',
   * 'none' = sans récurrence.
   */
  const [filterRecurrence, setFilterRecurrence] = useState('');
  /**
   * Métiers et formats (sélection multiple) et raccourci « J'ai 15 minutes » (migration 329),
   * mémorisés pour la session d'onglet.
   */
  const [taxonomyFilters, setTaxonomyFilters] = useState(readTaskTaxonomyFilters);
  useEffect(() => {
    writeTaskTaxonomyFilters(taxonomyFilters);
  }, [taxonomyFilters]);

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
    filterRecurrence,
    setFilterRecurrence,
    taxonomyFilters,
    setTaxonomyFilters,
  };
}
