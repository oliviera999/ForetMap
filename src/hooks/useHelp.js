import { useCallback, useMemo, useState } from 'react';

const HELP_SEEN_STORAGE_KEY = 'foretmap_help_seen';
const HELP_METRICS_STORAGE_KEY = 'foretmap_help_metrics';

function readSeenSections() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(HELP_SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistSeenSections(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, JSON.stringify(next || {}));
  } catch (_) {
    // Ignore quota/storage errors.
  }
}

function readHelpMetrics() {
  if (typeof window === 'undefined') {
    return { panelOpenCount: 0, panelDismissCount: 0, bySection: {}, lastEventAt: null };
  }
  try {
    const raw = window.localStorage.getItem(HELP_METRICS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      return { panelOpenCount: 0, panelDismissCount: 0, bySection: {}, lastEventAt: null };
    }
    return {
      panelOpenCount: Number(parsed.panelOpenCount || 0),
      panelDismissCount: Number(parsed.panelDismissCount || 0),
      bySection: parsed.bySection && typeof parsed.bySection === 'object' ? parsed.bySection : {},
      lastEventAt: parsed.lastEventAt || null,
    };
  } catch (_) {
    return { panelOpenCount: 0, panelDismissCount: 0, bySection: {}, lastEventAt: null };
  }
}

function persistHelpMetrics(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HELP_METRICS_STORAGE_KEY, JSON.stringify(next || {}));
  } catch (_) {
    // Ignore quota/storage errors.
  }
}

function useHelp({ publicSettings, isTeacher }) {
  const [seenSections, setSeenSections] = useState(() => readSeenSections());
  const [metrics, setMetrics] = useState(() => readHelpMetrics());

  const isHelpEnabled = publicSettings?.modules?.help_enabled !== false;
  const roleKey = isTeacher ? 'teacher' : 'student';

  const markSectionSeen = useCallback((sectionId) => {
    if (!sectionId) return;
    setSeenSections((prev) => {
      const next = { ...(prev || {}), [sectionId]: true };
      persistSeenSections(next);
      return next;
    });
  }, []);

  const hasSeenSection = useCallback((sectionId) => {
    if (!sectionId) return false;
    return !!seenSections?.[sectionId];
  }, [seenSections]);

  const resetHelp = useCallback(() => {
    setSeenSections({});
    persistSeenSections({});
  }, []);

  const trackPanelOpen = useCallback((sectionId) => {
    setMetrics((prev) => {
      const key = String(sectionId || 'unknown');
      const next = {
        panelOpenCount: Number(prev?.panelOpenCount || 0) + 1,
        panelDismissCount: Number(prev?.panelDismissCount || 0),
        bySection: {
          ...(prev?.bySection || {}),
          [key]: {
            openCount: Number(prev?.bySection?.[key]?.openCount || 0) + 1,
            dismissCount: Number(prev?.bySection?.[key]?.dismissCount || 0),
          },
        },
        lastEventAt: new Date().toISOString(),
      };
      persistHelpMetrics(next);
      return next;
    });
  }, []);

  const trackPanelDismiss = useCallback((sectionId) => {
    setMetrics((prev) => {
      const key = String(sectionId || 'unknown');
      const next = {
        panelOpenCount: Number(prev?.panelOpenCount || 0),
        panelDismissCount: Number(prev?.panelDismissCount || 0) + 1,
        bySection: {
          ...(prev?.bySection || {}),
          [key]: {
            openCount: Number(prev?.bySection?.[key]?.openCount || 0),
            dismissCount: Number(prev?.bySection?.[key]?.dismissCount || 0) + 1,
          },
        },
        lastEventAt: new Date().toISOString(),
      };
      persistHelpMetrics(next);
      return next;
    });
  }, []);

  const resetHelpMetrics = useCallback(() => {
    const next = { panelOpenCount: 0, panelDismissCount: 0, bySection: {}, lastEventAt: null };
    setMetrics(next);
    persistHelpMetrics(next);
  }, []);

  return useMemo(() => ({
    isHelpEnabled,
    roleKey,
    hasSeenSection,
    markSectionSeen,
    resetHelp,
    metrics,
    trackPanelOpen,
    trackPanelDismiss,
    resetHelpMetrics,
  }), [
    hasSeenSection,
    isHelpEnabled,
    markSectionSeen,
    metrics,
    resetHelp,
    resetHelpMetrics,
    roleKey,
    trackPanelDismiss,
    trackPanelOpen,
  ]);
}

export { useHelp };
