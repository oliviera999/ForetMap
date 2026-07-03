import { useEffect, useState } from 'react';

import { api } from '../services/api';

/**
 * Données prof de la vue Tâches (P2, extrait de tasks-views.jsx, iso-comportement) :
 * options de groupes (`GET /api/groups/options`), liste des n3beurs triée fr
 * (`GET /api/stats/all`, refiltrée par groupe) et candidats référents
 * (`GET /api/tasks/referent-candidates`). Rien n'est chargé hors mode prof.
 * `setToast` sert uniquement à signaler un échec de chargement de la liste n3beurs.
 */
export function useTeacherTaskData(isTeacher, filterGroupId, setToast) {
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [referentCandidates, setReferentCandidates] = useState([]);
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);

  useEffect(() => {
    if (!isTeacher) return;
    api('/api/groups/options')
      .then((payload) => setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroupOptions([]));
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadTeacherStudents = async () => {
      setLoadingTeacherStudents(true);
      try {
        const payload = await api(
          `/api/stats/all${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`,
        );
        if (cancelled) return;
        const rows = Array.isArray(payload) ? payload : (payload?.students ?? []);
        const list = Array.isArray(rows)
          ? rows
              .slice()
              .sort((a, b) =>
                `${a?.first_name || ''} ${a?.last_name || ''}`
                  .trim()
                  .localeCompare(`${b?.first_name || ''} ${b?.last_name || ''}`.trim(), 'fr'),
              )
          : [];
        setTeacherStudents(list);
      } catch (e) {
        if (!cancelled)
          setToast('Impossible de charger la liste des n3beurs pour l’instant : ' + e.message);
      } finally {
        if (!cancelled) setLoadingTeacherStudents(false);
      }
    };
    loadTeacherStudents();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, filterGroupId, setToast]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadReferents = async () => {
      try {
        const rows = await api('/api/tasks/referent-candidates');
        if (cancelled) return;
        setReferentCandidates(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setReferentCandidates([]);
      }
    };
    loadReferents();
    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  return { teacherStudents, groupOptions, referentCandidates, loadingTeacherStudents };
}
