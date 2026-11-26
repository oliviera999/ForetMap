import { useEffect, useState } from 'react';

import { api } from '../services/api';

/** Délai idle avant de charger les n3beurs assignables (quick-assign tuiles). */
export const ASSIGNABLES_IDLE_MS = 500;

/**
 * Données prof de la vue Tâches (P2, extrait de tasks-views.jsx) :
 * options de groupes (`GET /api/groups/options`), liste des n3beurs affectables triée fr
 * (`GET /api/tasks/assignable-students`, filtrée par groupe) et candidats référents
 * (`GET /api/tasks/referent-candidates`). Rien n'est chargé hors mode prof.
 *
 * Lot perf 3 : référents seulement si le formulaire est ouvert ; assignables après un
 * court idle pour ne pas concurrencer la première paint de la liste.
 *
 * @param {boolean} isTeacher
 * @param {string} filterGroupId
 * @param {(msg: string) => void} setToast
 * @param {{ loadReferents?: boolean }} [options]
 */
export function useTeacherTaskData(
  isTeacher,
  filterGroupId,
  setToast,
  { loadReferents = false } = {},
) {
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [referentCandidates, setReferentCandidates] = useState([]);
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);

  useEffect(() => {
    if (!isTeacher) return undefined;
    let cancelled = false;
    api('/api/groups/options')
      .then((payload) => {
        if (!cancelled) {
          setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []);
        }
      })
      .catch(() => {
        if (!cancelled) setGroupOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher) return undefined;
    let cancelled = false;
    let idleId = 0;
    const loadTeacherStudents = async () => {
      setLoadingTeacherStudents(true);
      try {
        const payload = await api(
          `/api/tasks/assignable-students${
            filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''
          }`,
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
    // Premier paint de la liste avant le lot HTTP assignables (Wi‑Fi scolaire).
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          if (!cancelled) void loadTeacherStudents();
        },
        { timeout: ASSIGNABLES_IDLE_MS },
      );
    } else {
      idleId = window.setTimeout(() => {
        if (!cancelled) void loadTeacherStudents();
      }, ASSIGNABLES_IDLE_MS);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isTeacher, filterGroupId, setToast]);

  useEffect(() => {
    if (!isTeacher || !loadReferents) {
      if (!loadReferents) setReferentCandidates([]);
      return undefined;
    }
    let cancelled = false;
    const loadReferentsList = async () => {
      try {
        const rows = await api('/api/tasks/referent-candidates');
        if (cancelled) return;
        setReferentCandidates(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setReferentCandidates([]);
      }
    };
    void loadReferentsList();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, loadReferents]);

  return { teacherStudents, groupOptions, referentCandidates, loadingTeacherStudents };
}
