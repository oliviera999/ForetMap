/**
 * Briques du shell **connecté** de ForêtMap, regroupées dans un seul module pour être
 * chargées à la demande par `src/App.jsx` (audit UI/UX du 19/11/2026, U1 — lot à part
 * « découpage d'App.jsx »).
 *
 * Avant ce module, `App.jsx` importait statiquement les tables de rendu prof / élève, les
 * modales globales, l'en-tête… : tout ce code (et ses dépendances : récompenses, catalogue
 * des découpes de sprites, Markdown…) partait avec l'écran de connexion, qui n'en affiche
 * rien. Un seul module, donc un seul chunk et une seule requête : les composants chargés
 * par `lazyScreen` pointent tous vers la même promesse d'import, sans cascade.
 *
 * `AppFooter` n'y figure pas : l'écran de connexion l'affiche aussi.
 */
export { AppProviders } from './AppProviders.jsx';
export { AppPedagoOverlays } from './AppPedagoOverlays.jsx';
export { AppNoticeBanners } from './AppNoticeBanners.jsx';
export { AppGlobalModals } from './AppGlobalModals.jsx';
export { AppHeader } from './AppHeader.jsx';
export { RolePreviewBanners } from './RolePreviewBanners.jsx';
export { TeacherMainContent } from './TeacherMainContent.jsx';
export { StudentMainContent } from './StudentMainContent.jsx';
