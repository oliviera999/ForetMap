import { lazyScreen } from '../../shared/lazyScreen.jsx';

/**
 * Vues d'onglets du shell `App`, chargées à la demande — déplacées telles quelles d'`App.jsx`
 * (lot 6) pour être partagées par `TeacherMainContent` et `StudentMainContent`. Les cibles
 * des `import()` sont inchangées : le découpage en chunks du build reste le même.
 */

export const PlantManagerLazy = lazyScreen(() =>
  import('../foretmap-views').then((m) => ({ default: m.PlantManager })),
);
export const PlantViewerLazy = lazyScreen(() =>
  import('../foretmap-views').then((m) => ({ default: m.PlantViewer })),
);
export const ObservationNotebookLazy = lazyScreen(() =>
  import('../journal/UserJournalView.jsx').then((m) => ({ default: m.UserJournalView })),
);
export const TutorialsViewLazy = lazyScreen(() =>
  import('../tutorials-views').then((m) => ({ default: m.TutorialsView })),
);
export const TeacherStatsLazy = lazyScreen(() =>
  import('../stats-views').then((m) => ({ default: m.TeacherStats })),
);
export const ProfilesAdminViewLazy = lazyScreen(() =>
  import('../profiles-views').then((m) => ({ default: m.ProfilesAdminView })),
);
export const AuditLogLazy = lazyScreen(() =>
  import('../audit-views').then((m) => ({ default: m.AuditLog })),
);
export const SettingsAdminViewLazy = lazyScreen(() =>
  import('../settings-admin-views').then((m) => ({ default: m.SettingsAdminView })),
);
export const MediaLibraryViewLazy = lazyScreen(() =>
  import('../media-library-views').then((m) => ({ default: m.MediaLibraryView })),
);
export const ForumViewLazy = lazyScreen(() =>
  import('../forum-views').then((m) => ({ default: m.ForumView })),
);
export const VisitMascotPackManagerLazy = lazyScreen(() => import('../VisitMascotPackManager.jsx'));

/** Fiche statistiques et éditeur de profil, ouverts en modale depuis l'en-tête. */
export const StudentStatsLazy = lazyScreen(() =>
  import('../stats-views').then((m) => ({ default: m.StudentStats })),
);
export const StudentProfileEditorLazy = lazyScreen(() =>
  import('../stats-views').then((m) => ({ default: m.StudentProfileEditor })),
);
// Modale a la demande : lazy pour que foretmap-views (PlantManager/Viewer/Notebook ~52 Ko) quitte le chunk main.
export const PlantCatalogPreviewModalLazy = lazyScreen(() =>
  import('../foretmap-views').then((m) => ({ default: m.PlantCatalogPreviewModal })),
);
