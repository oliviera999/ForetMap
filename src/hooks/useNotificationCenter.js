import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_LEVEL,
  NOTIFICATION_PREFS_DEFAULTS,
} from '../constants/notifications';

const MAX_ITEMS = 80;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_COOLDOWN_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function safeJsonRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeJsonWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage indisponible/non critique
  }
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
    ...safeJsonRead(prefsStorageKey, {}),
  }));
  const [metrics, setMetrics] = useState(() => safeJsonRead(metricsStorageKey, {
    created: 0,
    opened: 0,
    actions: 0,
  }));
  const lastSeenKeysRef = useRef({});
  const lastTeacherProposalsSignatureRef = useRef('');
  const firstMountRef = useRef(true);

  const bumpMetric = useCallback((field) => {
    setMetrics((prev) => ({
      ...prev,
      [field]: (prev[field] || 0) + 1,
    }));
  }, []);

  const persistItems = useCallback((nextItems) => {
    safeJsonWrite(notificationsStorageKey, nextItems);
  }, [notificationsStorageKey]);

  const persistPrefs = useCallback((nextPrefs) => {
    safeJsonWrite(prefsStorageKey, nextPrefs);
  }, [prefsStorageKey]);

  useEffect(() => {
    const loaded = safeJsonRead(notificationsStorageKey, []);
    const cutoff = Date.now() - KEEP_MS;
    const sanitized = (Array.isArray(loaded) ? loaded : []).filter((item) => {
      const ts = Date.parse(item?.createdAt || '');
      return Number.isFinite(ts) && ts >= cutoff;
    }).slice(0, MAX_ITEMS);
    setItems(sanitized);
    for (const item of sanitized) {
      if (!item?.key) continue;
      lastSeenKeysRef.current[item.key] = Date.parse(item.createdAt || '') || Date.now();
    }
  }, [notificationsStorageKey]);

  useEffect(() => {
    safeJsonWrite(metricsStorageKey, metrics);
  }, [metrics, metricsStorageKey]);

  const isCategoryEnabled = useCallback((category) => {
    if (!category) return true;
    return prefs[category] !== false;
  }, [prefs]);

  const addNotification = useCallback((payload) => {
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
    setItems((prev) => {
      const next = [item, ...prev].slice(0, MAX_ITEMS);
      persistItems(next);
      return next;
    });
    bumpMetric('created');
    return true;
  }, [bumpMetric, isCategoryEnabled, persistItems]);

  const markAllRead = useCallback(() => {
    setItems((prev) => {
      const next = prev.map((item) => ({ ...item, read: true }));
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const markAsRead = useCallback((id) => {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, read: true } : item));
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const removeNotification = useCallback((id) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const clearRead = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((item) => !item.read);
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const updatePreference = useCallback((category, enabled) => {
    setPrefs((prev) => {
      const next = { ...prev, [category]: !!enabled };
      persistPrefs(next);
      return next;
    });
  }, [persistPrefs]);

  const trackOpenedPanel = useCallback(() => {
    bumpMetric('opened');
  }, [bumpMetric]);

  const trackActionClick = useCallback(() => {
    bumpMetric('actions');
  }, [bumpMetric]);

  const resetMetrics = useCallback(() => {
    setMetrics({ created: 0, opened: 0, actions: 0 });
  }, []);

  // Règles de génération: prof
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
    const proposedCount = proposedTasks.length;
    const proposedTitles = proposedTasks
      .map((task) => String(task?.title || task?.name || '').trim())
      .filter(Boolean);
    const proposedSignature = proposedTasks
      .map((task) => {
        if (task?.id != null) return `id:${task.id}`;
        if (task?.task_id != null) return `task_id:${task.task_id}`;
        const title = String(task?.title || '').trim().toLowerCase();
        return `title:${title}`;
      })
      .sort()
      .join('|');
    const lastSignature = lastTeacherProposalsSignatureRef.current;
    if (proposedSignature === lastSignature) return;
    lastTeacherProposalsSignatureRef.current = proposedSignature;
    if (proposedCount > 0) {
      const message = proposedCount === 1
        ? `1 proposition de tâche à examiner : "${proposedTitles[0] || 'Sans titre'}".`
        : `${proposedCount} proposition(s) de tâche à examiner. Exemples : ${proposedTitles.slice(0, 2).map((t) => `"${t}"`).join(', ')}${proposedTitles.length > 2 ? ', …' : ''}.`;
      addNotification({
        key: `teacher-proposed-${proposedCount}-${proposedSignature || 'none'}`,
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.PROPOSALS,
        title: 'Propositions élèves',
        message,
        action: { tab: 'tasks' },
      });
    }
  }, [addNotification, isTeacher, tasksForActiveMap]);

  // Règles de génération: élève
  useEffect(() => {
    if (isTeacher || !student) return;
    const first = String(student.first_name || '').trim().toLowerCase();
    const last = String(student.last_name || '').trim().toLowerCase();
    const mine = tasksForActiveMap.filter((task) => (
      (task.status === 'available' || task.status === 'in_progress')
      && Array.isArray(task.assignments)
      && task.assignments.some((a) => (
        String(a.student_first_name || '').trim().toLowerCase() === first
        && String(a.student_last_name || '').trim().toLowerCase() === last
      ))
    ));
    let soonCount = 0;
    let overdueCount = 0;
    for (const task of mine) {
      if (!task?.due_date) continue;
      const due = new Date(task.due_date);
      if (Number.isNaN(due.getTime())) continue;
      const diffDays = Math.floor((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0) overdueCount += 1;
      else if (diffDays <= 1) soonCount += 1;
    }
    if (soonCount > 0) {
      addNotification({
        key: `student-deadline-soon-${soonCount}`,
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Échéance proche',
        message: `${soonCount} tâche(s) à faire d'ici demain.`,
        action: { tab: 'tasks' },
      });
    }
    if (overdueCount > 0) {
      addNotification({
        key: `student-deadline-overdue-${overdueCount}`,
        level: NOTIFICATION_LEVEL.CRITICAL,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Tâches en retard',
        message: `${overdueCount} tâche(s) sont déjà en retard.`,
        action: { tab: 'tasks' },
      });
    }
  }, [addNotification, isTeacher, student, tasksForActiveMap]);

  // Règles de génération: opérations
  useEffect(() => {
    if (serverDown) {
      addNotification({
        key: 'server-down',
        level: NOTIFICATION_LEVEL.CRITICAL,
        category: NOTIFICATION_CATEGORY.OPERATIONS,
        title: 'Serveur indisponible',
        message: 'Synchronisation ralentie, réessai automatique en cours.',
        action: { tab: 'map' },
      });
    }
  }, [addNotification, serverDown]);

  useEffect(() => {
    if (isTeacher && rtStatus === 'offline') {
      addNotification({
        key: 'teacher-realtime-offline',
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.OPERATIONS,
        title: 'Temps réel hors ligne',
        message: 'Le mode secours par rafraîchissement est actif.',
      });
    }
  }, [addNotification, isTeacher, rtStatus]);

  useEffect(() => {
    if (!isTeacher && sessionValidationError) {
      addNotification({
        key: 'student-session-unverified',
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.SECURITY,
        title: 'Session non vérifiée',
        message: 'Certaines informations peuvent être périmées.',
        action: { type: 'retryStudentValidation' },
      });
    }
  }, [addNotification, isTeacher, sessionValidationError]);

  useEffect(() => {
    if (!isAdmin) return;
    if (publicSettings?.auth?.allow_google_student === false && publicSettings?.auth?.allow_google_teacher === false) {
      addNotification({
        key: 'admin-google-disabled',
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.SECURITY,
        title: 'OAuth Google désactivé',
        message: 'La connexion Google est coupée pour élèves et professeurs.',
        action: { tab: 'settings' },
      });
    }
    const modulesDisabled = ['tutorials_enabled', 'visit_enabled', 'stats_enabled', 'observations_enabled']
      .filter((key) => publicSettings?.modules?.[key] === false).length;
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
        if (next.length !== prev.length) persistItems(next);
        return next;
      });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [persistItems]);

  // Évite de générer du bruit immédiatement au premier rendu
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    // no-op, garde l'intention explicite
  }, [items.length]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const criticalCount = useMemo(
    () => items.filter((item) => !item.read && item.level === NOTIFICATION_LEVEL.CRITICAL).length,
    [items]
  );
  const latestCritical = useMemo(
    () => items.find((item) => !item.read && item.level === NOTIFICATION_LEVEL.CRITICAL) || null,
    [items]
  );

  return {
    roleKey,
    items,
    unreadCount,
    criticalCount,
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
