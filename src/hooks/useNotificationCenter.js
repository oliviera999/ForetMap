import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_LEVEL,
  NOTIFICATION_PREFS_DEFAULTS,
} from '../constants/notifications';
import { readJsonStorage, writeJsonStorage } from '../shared/notifications/storage.js';
import { assignmentMatchesStudent } from '../utils/task-assignments.js';
import { daysUntil } from '../utils/badges.jsx';

const MAX_ITEMS = 80;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_COOLDOWN_MS = 10 * 60 * 1000;
/** Préfixe clé notif « proposition n3boss » — dédup forte (pas seulement le cooldown 10 min). */
const TEACHER_PROPOSED_NOTIF_PREFIX = 'teacher-proposed-';

function proposalSuffixFromTeacherNotifKey(key) {
  const s = String(key || '');
  if (!s.startsWith(TEACHER_PROPOSED_NOTIF_PREFIX)) return null;
  return s.slice(TEACHER_PROPOSED_NOTIF_PREFIX.length);
}

function stableProposedTaskKey(task) {
  if (task?.id != null && task.id !== '') return `id:${String(task.id)}`;
  if (task?.task_id != null && task.task_id !== '') return `task_id:${String(task.task_id)}`;
  return `title:${String(task?.title || task?.name || '')
    .trim()
    .toLowerCase()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function roleForStorage({ isAdmin, isTeacher }) {
  if (isAdmin) return 'admin';
  if (isTeacher) return 'teacher';
  return 'student';
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeStoreKey(prefix, roleKey) {
  return `foretmap_notifications_${prefix}_${roleKey}`;
}

function proposerNameFromTask(task) {
  const direct = String(
    task?.proposer || task?.proposed_by || task?.proposed_by_name || task?.proposedBy || '',
  ).trim();
  if (direct) return direct;
  const description = String(task?.description || '');
  const match = description.match(/(?:^|\n)Proposition (?:élève|n3beur):\s*(.+)\s*$/m);
  return String(match?.[1] || '').trim();
}

export function useNotificationCenter({
  isTeacher,
  isAdmin,
  tasksForActiveMap = [],
  student,
  teacherPendingValidationCount = 0,
  rtStatus = 'off',
  serverDown = false,
  sessionValidationError = false,
  publicSettings = null,
}) {
  const roleKey = roleForStorage({ isAdmin, isTeacher });
  const notificationsStorageKey = useMemo(() => makeStoreKey('items', roleKey), [roleKey]);
  const prefsStorageKey = useMemo(() => makeStoreKey('prefs', roleKey), [roleKey]);
  const metricsStorageKey = useMemo(() => makeStoreKey('metrics', roleKey), [roleKey]);

  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(() => ({
    ...(NOTIFICATION_PREFS_DEFAULTS[roleKey] || {}),
    ...readJsonStorage(prefsStorageKey, {}),
  }));
  const [metrics, setMetrics] = useState(() =>
    readJsonStorage(metricsStorageKey, {
      created: 0,
      opened: 0,
      actions: 0,
    }),
  );
  const lastSeenKeysRef = useRef({});
  const lastTeacherProposedKeysRef = useRef(new Set());
  // Vrai tant que `items` reflète encore l'état d'avant chargement (montage ou changement de clé) :
  // l'effet de persistance saute ce tour pour ne pas écraser le storage avec l'état pré-hydratation.
  const skipNextPersistRef = useRef(true);

  const bumpMetric = useCallback((field) => {
    setMetrics((prev) => ({
      ...prev,
      [field]: (prev[field] || 0) + 1,
    }));
  }, []);

  const persistPrefs = useCallback(
    (nextPrefs) => {
      writeJsonStorage(prefsStorageKey, nextPrefs);
    },
    [prefsStorageKey],
  );

  useEffect(() => {
    const loaded = readJsonStorage(notificationsStorageKey, []);
    const cutoff = Date.now() - KEEP_MS;
    const sanitized = (Array.isArray(loaded) ? loaded : [])
      .filter((item) => {
        const ts = Date.parse(item?.createdAt || '');
        return Number.isFinite(ts) && ts >= cutoff;
      })
      .slice(0, MAX_ITEMS);
    const restoredProposedKeys = new Set();
    skipNextPersistRef.current = true;
    setItems(sanitized);
    for (const item of sanitized) {
      if (!item?.key) continue;
      lastSeenKeysRef.current[item.key] = Date.parse(item.createdAt || '') || Date.now();
      const propSuffix = proposalSuffixFromTeacherNotifKey(item.key);
      if (propSuffix) restoredProposedKeys.add(propSuffix);
    }
    // Remontage React / nouvel onglet : retrouver les propositions déjà notifiées (le ref seul ne suffit pas).
    lastTeacherProposedKeysRef.current = restoredProposedKeys;
  }, [notificationsStorageKey]);

  // Persistance des notifications déplacée hors des updaters `setItems` (pas d'effet de bord
  // dans un updater — sûr en StrictMode) : toute mutation de `items` est écrite ici.
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    writeJsonStorage(notificationsStorageKey, items);
  }, [items, notificationsStorageKey]);

  // Rechargement des préférences quand le rôle (donc la clé de stockage) change :
  // sinon les préférences du rôle précédent restent affichées après un passage prof/admin.
  useEffect(() => {
    setPrefs({
      ...(NOTIFICATION_PREFS_DEFAULTS[roleKey] || {}),
      ...readJsonStorage(prefsStorageKey, {}),
    });
  }, [prefsStorageKey, roleKey]);

  // Idem métriques : recharger la valeur du rôle courant et sauter la persistance
  // immédiate, sinon l'effet écrit les métriques de l'ancien rôle dans la clé du nouveau.
  const skipNextMetricsPersistRef = useRef(true);
  useEffect(() => {
    skipNextMetricsPersistRef.current = true;
    setMetrics(readJsonStorage(metricsStorageKey, { created: 0, opened: 0, actions: 0 }));
  }, [metricsStorageKey]);

  useEffect(() => {
    if (skipNextMetricsPersistRef.current) {
      skipNextMetricsPersistRef.current = false;
      return;
    }
    writeJsonStorage(metricsStorageKey, metrics);
  }, [metrics, metricsStorageKey]);

  const isCategoryEnabled = useCallback(
    (category) => {
      if (!category) return true;
      return prefs[category] !== false;
    },
    [prefs],
  );

  const addNotification = useCallback(
    (payload) => {
      const {
        key,
        level = NOTIFICATION_LEVEL.INFO,
        category = null,
        title,
        message,
        action = null,
        force = false,
      } = payload || {};
      if (!title || !message) return false;
      if (!force && !isCategoryEnabled(category)) return false;
      const dedupKey = String(key || `${level}:${title}:${message}`);
      const nowTs = Date.now();
      const lastTs = lastSeenKeysRef.current[dedupKey] || 0;
      // Une proposition ne doit pas repasser après expiration du cooldown si la tâche est encore « proposée ».
      if (!force && dedupKey.startsWith(TEACHER_PROPOSED_NOTIF_PREFIX) && lastTs > 0) return false;
      if (!force && nowTs - lastTs < DEDUP_COOLDOWN_MS) return false;
      lastSeenKeysRef.current[dedupKey] = nowTs;
      const item = {
        id: makeId(),
        key: dedupKey,
        level,
        category,
        title,
        message,
        action,
        read: false,
        createdAt: nowIso(),
      };
      setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS));
      bumpMetric('created');
      return true;
    },
    [bumpMetric, isCategoryEnabled],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const markAsRead = useCallback((id) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, []);

  const removeNotification = useCallback((id) => {
    setItems((prev) => {
      const victim = prev.find((item) => item.id === id);
      if (victim?.key) {
        const suffix = proposalSuffixFromTeacherNotifKey(victim.key);
        if (suffix) lastTeacherProposedKeysRef.current.delete(suffix);
        delete lastSeenKeysRef.current[victim.key];
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clearRead = useCallback(() => {
    setItems((prev) => prev.filter((item) => !item.read));
  }, []);

  /**
   * Clôt une notification « d'état » (serveur indisponible, temps réel hors ligne, session
   * non vérifiée) quand la condition qui l'a produite a disparu : l'item reste dans
   * l'historique mais passe en lu. Sans cela, l'item — persisté 7 jours en localStorage —
   * restait non lu après la reprise, et le bandeau critique d'App.jsx (rendu quand
   * `serverDown` est faux) continuait d'afficher « Serveur indisponible » voyant au vert.
   */
  const resolveNotificationsByKey = useCallback((key) => {
    setItems((prev) => {
      if (!prev.some((item) => item.key === key && !item.read)) return prev;
      return prev.map((item) => (item.key === key && !item.read ? { ...item, read: true } : item));
    });
  }, []);

  const updatePreference = useCallback(
    (category, enabled) => {
      setPrefs((prev) => {
        const next = { ...prev, [category]: !!enabled };
        persistPrefs(next);
        return next;
      });
    },
    [persistPrefs],
  );

  const trackOpenedPanel = useCallback(() => {
    bumpMetric('opened');
  }, [bumpMetric]);

  const trackActionClick = useCallback(() => {
    bumpMetric('actions');
  }, [bumpMetric]);

  const resetMetrics = useCallback(() => {
    setMetrics({ created: 0, opened: 0, actions: 0 });
  }, []);

  // Règles de génération: n3boss
  useEffect(() => {
    if (!isTeacher) return;
    if (teacherPendingValidationCount > 0) {
      addNotification({
        key: `teacher-pending-${teacherPendingValidationCount}`,
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.VALIDATIONS,
        title: 'Validations en attente',
        message: `${teacherPendingValidationCount} tâche(s) attend(ent) une validation.`,
        action: { tab: 'tasks' },
      });
    }
  }, [addNotification, isTeacher, teacherPendingValidationCount]);

  useEffect(() => {
    if (!isTeacher) return;
    const proposedTasks = tasksForActiveMap.filter((task) => task.status === 'proposed');
    for (const task of proposedTasks) {
      const taskKey = stableProposedTaskKey(task);

      if (lastTeacherProposedKeysRef.current.has(taskKey)) continue;

      const taskTitle = String(task?.title || task?.name || '').trim() || 'Tâche sans titre';
      const proposer = proposerNameFromTask(task);
      const added = addNotification({
        key: `${TEACHER_PROPOSED_NOTIF_PREFIX}${taskKey}`,
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.PROPOSALS,
        title: taskTitle,
        message: proposer
          ? `Nouvelle proposition de tâche de ${proposer}.`
          : 'Nouvelle proposition de tâche à examiner.',
        action: { tab: 'tasks' },
      });
      // Ne jamais remplacer le ref par la liste courante : un rafraîchissement vide
      // réinitialisait le set et refaisait une notif pour les mêmes propositions.
      if (added) lastTeacherProposedKeysRef.current.add(taskKey);
    }
  }, [addNotification, isTeacher, tasksForActiveMap]);

  // Règles de génération: n3beur
  useEffect(() => {
    if (isTeacher || !student) return;
    // Matcher partagé (task-assignments) : même normalisation prénom+nom (trim + minuscules)
    // qu'avant, avec en plus le match par `student_id` — aligné sur isStudentAssignedToTask.
    const mine = tasksForActiveMap.filter(
      (task) =>
        (task.status === 'available' || task.status === 'in_progress') &&
        Array.isArray(task.assignments) &&
        task.assignments.some((a) => assignmentMatchesStudent(a, student)),
    );
    let soonCount = 0;
    let overdueCount = 0;
    for (const task of mine) {
      // Même compte à rebours que les puces d'échéance des tuiles (`daysUntil`) : dates
      // nues comparées en heure locale. Une tâche due AUJOURD'HUI (0) est « proche », pas
      // « en retard » — l'ancien calcul en millisecondes la déclarait en retard dès minuit.
      const diffDays = daysUntil(task?.due_date);
      if (diffDays == null) continue;
      if (diffDays < 0) overdueCount += 1;
      else if (diffDays <= 1) soonCount += 1;
    }
    // Règles d'ÉTAT (comme les notifications d'exploitation) : clé stable, et clôture dès
    // que la condition retombe. Avec une clé porteuse du compte, chaque variation créait un
    // item de plus et aucun n'était jamais refermé — la pile restait « 2 tâches en retard »
    // longtemps après leur validation.
    if (soonCount > 0) {
      addNotification({
        key: 'student-deadline-soon',
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Échéance proche',
        message: `${soonCount} tâche(s) à faire d'ici demain.`,
        action: { tab: 'tasks' },
      });
    } else {
      resolveNotificationsByKey('student-deadline-soon');
    }
    if (overdueCount > 0) {
      addNotification({
        key: 'student-deadline-overdue',
        level: NOTIFICATION_LEVEL.CRITICAL,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Tâches en retard',
        message: `${overdueCount} tâche(s) sont déjà en retard.`,
        action: { tab: 'tasks' },
      });
    } else {
      resolveNotificationsByKey('student-deadline-overdue');
    }
  }, [
    addNotification,
    isTeacher,
    notificationsStorageKey,
    resolveNotificationsByKey,
    student,
    tasksForActiveMap,
  ]);

  // Règles de génération: opérations. Chaque règle d'état clôt sa notification quand la
  // condition retombe ; `notificationsStorageKey` en dépendance rejoue la clôture après
  // l'hydratation depuis le storage (montage, changement de rôle) — un item restauré non
  // lu alors que la condition est déjà retombée est clos immédiatement.
  useEffect(() => {
    if (!serverDown) {
      resolveNotificationsByKey('server-down');
      return;
    }
    addNotification({
      key: 'server-down',
      level: NOTIFICATION_LEVEL.CRITICAL,
      category: NOTIFICATION_CATEGORY.OPERATIONS,
      title: 'Serveur indisponible',
      message: 'Synchronisation ralentie, réessai automatique en cours.',
      action: { tab: 'map' },
    });
  }, [addNotification, notificationsStorageKey, resolveNotificationsByKey, serverDown]);

  useEffect(() => {
    if (!isTeacher || rtStatus !== 'offline') {
      resolveNotificationsByKey('teacher-realtime-offline');
      return;
    }
    addNotification({
      key: 'teacher-realtime-offline',
      level: NOTIFICATION_LEVEL.IMPORTANT,
      category: NOTIFICATION_CATEGORY.OPERATIONS,
      title: 'Temps réel hors ligne',
      message: 'Le mode secours par rafraîchissement est actif.',
    });
  }, [addNotification, isTeacher, notificationsStorageKey, resolveNotificationsByKey, rtStatus]);

  useEffect(() => {
    if (isTeacher || !sessionValidationError) {
      resolveNotificationsByKey('student-session-unverified');
      return;
    }
    addNotification({
      key: 'student-session-unverified',
      level: NOTIFICATION_LEVEL.IMPORTANT,
      category: NOTIFICATION_CATEGORY.SECURITY,
      title: 'Session non vérifiée',
      message: 'Certaines informations peuvent être périmées.',
      action: { type: 'retryStudentValidation' },
    });
  }, [
    addNotification,
    isTeacher,
    notificationsStorageKey,
    resolveNotificationsByKey,
    sessionValidationError,
  ]);

  useEffect(() => {
    if (!isAdmin) return;
    if (
      publicSettings?.auth?.allow_google_student === false &&
      publicSettings?.auth?.allow_google_teacher === false
    ) {
      addNotification({
        key: 'admin-google-disabled',
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.SECURITY,
        title: 'OAuth Google désactivé',
        message: 'La connexion Google est coupée pour n3beurs et n3boss.',
        action: { tab: 'settings' },
      });
    }
    const modulesDisabled = [
      'tutorials_enabled',
      'visit_enabled',
      'stats_enabled',
      'observations_enabled',
    ].filter((key) => publicSettings?.modules?.[key] === false).length;
    if (modulesDisabled > 0) {
      addNotification({
        key: `admin-modules-disabled-${modulesDisabled}`,
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.OPERATIONS,
        title: 'Modules désactivés',
        message: `${modulesDisabled} module(s) UI sont désactivés.`,
        action: { tab: 'settings' },
      });
    }
  }, [addNotification, isAdmin, publicSettings]);

  // Événements temps réel (digest)
  useEffect(() => {
    const onRealtime = (event) => {
      const domain = event?.detail?.domain || 'données';
      addNotification({
        key: `realtime-${domain}`,
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.OPERATIONS,
        title: 'Mise à jour reçue',
        message: `Le module "${domain}" vient d'être mis à jour.`,
      });
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [addNotification]);

  // Nettoyage périodique
  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => {
        const cutoff = Date.now() - KEEP_MS;
        const next = prev.filter((item) => {
          const ts = Date.parse(item.createdAt || '');
          return Number.isFinite(ts) && ts >= cutoff;
        });
        // Rien d'expiré → renvoie `prev` pour ne pas re-rendre ni re-persister inutilement.
        return next.length !== prev.length ? next : prev;
      });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const latestCritical = useMemo(
    () => items.find((item) => !item.read && item.level === NOTIFICATION_LEVEL.CRITICAL) || null,
    [items],
  );

  return {
    roleKey,
    items,
    unreadCount,
    latestCritical,
    prefs,
    metrics,
    addNotification,
    updatePreference,
    markAllRead,
    markAsRead,
    removeNotification,
    clearRead,
    trackOpenedPanel,
    trackActionClick,
    resetMetrics,
  };
}
