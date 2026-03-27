import { useCallback, useMemo, useState } from 'react';

const HELP_SEEN_STORAGE_KEY = 'foretmap_help_seen';

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

function useHelp({ publicSettings, isTeacher }) {
  const [seenSections, setSeenSections] = useState(() => readSeenSections());

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

  return useMemo(() => ({
    isHelpEnabled,
    roleKey,
    hasSeenSection,
    markSectionSeen,
    resetHelp,
  }), [hasSeenSection, isHelpEnabled, markSectionSeen, resetHelp, roleKey]);
}

export { useHelp };
