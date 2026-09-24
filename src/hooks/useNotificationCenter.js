import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_LEVEL,
  NOTIFICATION_PREFS_DEFAULTS,
} from '../constants/notifications';
import { api } from '../services/api';
import { readJsonStorage, writeJsonStorage } from '../shared/notifications/storage.js';
import { assignmentMatchesStudent } from '../utils/task-assignments.js';
import { daysUntil } from '../utils/badges.jsx';
import {
  isServerNotificationId,
  notificationFromServer,
  serverIdFromNotificationId,
  sortNotificationsByDateDesc,
} from '../utils/notificationTargets.js';

const MAX_ITEMS = 80;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_COOLDOWN_MS = 10 * 60 * 1000;
/** Rechargement de secours des notifications serveur (le temps réel peut être coupé). */
const SERVER_REFRESH_MS = 2 * 60 * 1000;
const SERVER_PAGE_SIZE = 30;

/** Modules signalés à l'admin quand ils sont coupés (libellés des Réglages). */
const ADMIN_WATCHED_MODULES = [
  ['tutorials_enabled', 'Tutoriels'],
  ['visit_enabled', 'Visite'],
  ['stats_enabled', 'Statistiques'],
  ['observations_enabled', 'Observations'],
];

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

/**
 * Centre de notifications ForetMap.
 *
 * Deux sources fusionnées, triées par date :
 * - **serveur** (`serverEnabled`) : notifications adressées au compte connecté (tâche
 *   proposée, validée, message sur un lieu, réponse au forum, échéance…), chacune avec une
 *   cible précise ; rechargées à l'arrivée d'un événement temps réel personnel, au retour
 *   sur l'onglet et périodiquement ; l'état « lu » est enregistré sur le serveur ;
 * - **locale** : avis « d'état » calculés sur l'appareil (serveur injoignable, temps réel
 *   coupé, validations en attente, échéances, réglages admin), à clé stable, mis à jour en
 *   place et clos quand la condition retombe.
 */
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
  serverEnabled = false,
}) {
  const roleKey = roleForStorage({ isAdmin, isTeacher });
  const notificationsStorageKey = useMemo(() => makeStoreKey('items', roleKey), [roleKey]);
  const prefsStorageKey = useMemo(() => makeStoreKey('prefs', roleKey), [roleKey]);
  const metricsStorageKey = useMemo(() => makeStoreKey('metrics', roleKey), [roleKey]);

  const [items, setItems] = useState([]);
  const [serverItems, setServerItems] = useState([]);
  const serverItemsRef = useRef([]);
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
  // Vrai tant que `items` reflète encore l'état d'avant chargement (montage ou changement de clé) :
  // l'effet de persistance saute ce tour pour ne pas écraser le storage avec l'état pré-hydratation.
  const skipNextPersistRef = useRef(true);

  useEffect(() => {
    serverItemsRef.current = serverItems;
  }, [serverItems]);

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
    skipNextPersistRef.current = true;
    setItems(sanitized);
    for (const item of sanitized) {
      if (!item?.key) continue;
      lastSeenKeysRef.current[item.key] = Date.parse(item.createdAt || '') || Date.now();
    }
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

  // ── Source serveur ──────────────────────────────────────────────────────────
  const refreshServerNotifications = useCallback(async () => {
    try {
      const data = await api(`/api/notifications?limit=${SERVER_PAGE_SIZE}`);
      const rows = Array.isArray(data?.items) ? data.items : [];
      const next = rows.map(notificationFromServer);
      const known = new Set(serverItemsRef.current.map((item) => item.id));
      if (next.some((item) => !known.has(item.id))) bumpMetric('created');
      setServerItems(next);
    } catch (_) {
      /* hors ligne ou session expirée : la liste courante reste affichée */
    }
  }, [bumpMetric]);

  useEffect(() => {
    if (!serverEnabled) {
      setServerItems([]);
      return undefined;
    }
    refreshServerNotifications();
    const onNew = () => refreshServerNotifications();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshServerNotifications();
    };
    window.addEventListener('foretmap_notifications_new', onNew);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(refreshServerNotifications, SERVER_REFRESH_MS);
    return () => {
      window.removeEventListener('foretmap_notifications_new', onNew);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [serverEnabled, refreshServerNotifications]);

  // ── Avis locaux ─────────────────────────────────────────────────────────────
  const addNotification = useCallback(
    (payload) => {
      const {
        key,
        level = NOTIFICATION_LEVEL.INFO,
        category = null,
        title,
        message,
        action = null,
        target = null,
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
        target,
        read: false,
        createdAt: nowIso(),
      };
      setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS));
      bumpMetric('created');
      return true;
    },
    [bumpMetric, isCategoryEnabled],
  );

  /**
   * Avis « d'état » à clé stable : un seul élément par clé, mis à jour en place. Il redevient
   * non lu seulement si son contenu change (nouveau compte, nouveaux modules) — un avis déjà
   * lu et inchangé ne ressonne pas à chaque rendu.
   */
  const upsertStateNotification = useCallback(
    (payload) => {
      const {
        key,
        level = NOTIFICATION_LEVEL.INFO,
        category = null,
        title,
        message,
        action = null,
        target = null,
      } = payload || {};
      if (!key || !title || !message) return;
      if (!isCategoryEnabled(category)) return;
      setItems((prev) => {
        const existing = prev.find((item) => item.key === key);
        if (!existing) {
          lastSeenKeysRef.current[key] = Date.now();
          const item = {
            id: makeId(),
            key,
            level,
            category,
            title,
            message,
            action,
            target,
            read: false,
            createdAt: nowIso(),
          };
          return [item, ...prev].slice(0, MAX_ITEMS);
        }
        const changed = existing.title !== title || existing.message !== message;
        if (!changed && existing.level === level) return prev;
        return prev.map((item) =>
          item.key === key
            ? {
                ...item,
                level,
                category,
                title,
                message,
                action,
                target,
                read: changed ? false : item.read,
                createdAt: changed ? nowIso() : item.createdAt,
              }
            : item,
        );
      });
    },
    [isCategoryEnabled],
  );

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

  // ── Actions utilisateur (les deux sources) ──────────────────────────────────
  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    if (serverItemsRef.current.some((item) => !item.read)) {
      setServerItems((prev) => prev.map((item) => ({ ...item, read: true })));
      api('/api/notifications/read-all', 'POST').catch(() => {});
    }
  }, []);

  const markAsRead = useCallback((id) => {
    if (isServerNotificationId(id)) {
      const current = serverItemsRef.current.find((item) => item.id === id);
      if (!current || current.read) return;
      setServerItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      api(
        `/api/notifications/${encodeURIComponent(serverIdFromNotificationId(id))}/read`,
        'POST',
      ).catch(() => {});
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, []);

  const removeNotification = useCallback((id) => {
    if (isServerNotificationId(id)) {
      setServerItems((prev) => prev.filter((item) => item.id !== id));
      api(
        `/api/notifications/${encodeURIComponent(serverIdFromNotificationId(id))}`,
        'DELETE',
      ).catch(() => {});
      return;
    }
    setItems((prev) => {
      const victim = prev.find((item) => item.id === id);
      if (victim?.key) delete lastSeenKeysRef.current[victim.key];
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clearRead = useCallback(() => {
    setItems((prev) => prev.filter((item) => !item.read));
    const readServer = serverItemsRef.current.filter((item) => item.read);
    if (readServer.length === 0) return;
    setServerItems((prev) => prev.filter((item) => !item.read));
    for (const item of readServer) {
      api(`/api/notifications/${encodeURIComponent(item.serverId)}`, 'DELETE').catch(() => {});
    }
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

  // Règles d'état : n3boss — tâches terminées en attente de validation (clé stable ; le
  // clic ouvre la liste filtrée sur « à valider »).
  useEffect(() => {
    if (!isTeacher || teacherPendingValidationCount <= 0) {
      resolveNotificationsByKey('teacher-pending');
      return;
    }
    const n = teacherPendingValidationCount;
    upsertStateNotification({
      key: 'teacher-pending',
      level: NOTIFICATION_LEVEL.IMPORTANT,
      category: NOTIFICATION_CATEGORY.VALIDATIONS,
      title: 'Validations en attente',
      message:
        n === 1
          ? '1 tâche terminée attend votre validation.'
          : `${n} tâches terminées attendent votre validation.`,
      target: { type: 'task', filter: 'to_validate' },
    });
  }, [
    isTeacher,
    notificationsStorageKey,
    resolveNotificationsByKey,
    teacherPendingValidationCount,
    upsertStateNotification,
  ]);

  // Règles d'état : n3beur — échéances de ses propres tâches.
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
    const soon = [];
    const overdue = [];
    for (const task of mine) {
      // Même compte à rebours que les puces d'échéance des tuiles (`daysUntil`) : dates
      // nues comparées en heure locale. Une tâche due AUJOURD'HUI (0) est « proche », pas
      // « en retard » — l'ancien calcul en millisecondes la déclarait en retard dès minuit.
      const diffDays = daysUntil(task?.due_date);
      if (diffDays == null) continue;
      if (diffDays < 0) overdue.push(task);
      else if (diffDays <= 1) soon.push(task);
    }
    const describe = (list) => {
      if (list.length === 1) return `« ${String(list[0]?.title || 'Tâche').trim()} »`;
      return `${list.length} tâches`;
    };
    // Une seule tâche : l'avis mène directement à elle ; sinon à la liste filtrée.
    const targetFor = (list, filter) =>
      list.length === 1 && list[0]?.id != null
        ? { type: 'task', id: String(list[0].id), filter }
        : { type: 'task', filter };
    if (soon.length > 0) {
      upsertStateNotification({
        key: 'student-deadline-soon',
        level: NOTIFICATION_LEVEL.IMPORTANT,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Échéance proche',
        message: `${describe(soon)} à terminer d'ici demain.`,
        target: targetFor(soon, null),
      });
    } else {
      resolveNotificationsByKey('student-deadline-soon');
    }
    if (overdue.length > 0) {
      upsertStateNotification({
        key: 'student-deadline-overdue',
        level: NOTIFICATION_LEVEL.CRITICAL,
        category: NOTIFICATION_CATEGORY.DEADLINES,
        title: 'Tâches en retard',
        message:
          overdue.length === 1
            ? `${describe(overdue)} est en retard.`
            : `${describe(overdue)} sont en retard.`,
        target: targetFor(overdue, 'overdue'),
      });
    } else {
      resolveNotificationsByKey('student-deadline-overdue');
    }
  }, [
    isTeacher,
    notificationsStorageKey,
    resolveNotificationsByKey,
    student,
    tasksForActiveMap,
    upsertStateNotification,
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

  // Règles d'état : administration (réglages « Accueil & modules »).
  useEffect(() => {
    if (!isAdmin) return;
    if (
      publicSettings?.auth?.allow_google_student === false &&
      publicSettings?.auth?.allow_google_teacher === false
    ) {
      upsertStateNotification({
        key: 'admin-google-disabled',
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.SECURITY,
        title: 'Connexion Google désactivée',
        message: 'La connexion Google est coupée pour tous les comptes.',
        target: { type: 'settings', section: 'accueil' },
      });
    } else {
      resolveNotificationsByKey('admin-google-disabled');
    }
    const disabledLabels = ADMIN_WATCHED_MODULES.filter(
      ([key]) => publicSettings?.modules?.[key] === false,
    ).map(([, label]) => label);
    if (disabledLabels.length > 0) {
      upsertStateNotification({
        key: 'admin-modules-disabled',
        level: NOTIFICATION_LEVEL.INFO,
        category: NOTIFICATION_CATEGORY.OPERATIONS,
        title: 'Modules désactivés',
        message: `Désactivé${disabledLabels.length > 1 ? 's' : ''} : ${disabledLabels.join(', ')}.`,
        target: { type: 'settings', section: 'accueil' },
      });
    } else {
      resolveNotificationsByKey('admin-modules-disabled');
    }
  }, [
    isAdmin,
    notificationsStorageKey,
    publicSettings,
    resolveNotificationsByKey,
    upsertStateNotification,
  ]);

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

  const allItems = useMemo(
    () =>
      sortNotificationsByDateDesc([
        ...serverItems.filter((item) => isCategoryEnabled(item.category)),
        ...items,
      ]),
    [items, serverItems, isCategoryEnabled],
  );
  const unreadCount = useMemo(() => allItems.filter((item) => !item.read).length, [allItems]);
  const latestCritical = useMemo(
    () => allItems.find((item) => !item.read && item.level === NOTIFICATION_LEVEL.CRITICAL) || null,
    [allItems],
  );

  return {
    roleKey,
    items: allItems,
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
    refreshServerNotifications,
    resetMetrics,
  };
}
