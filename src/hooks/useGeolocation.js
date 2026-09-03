/**
 * Acquisition de la position de l'appareil — **alias historique**.
 *
 * Le hook vit désormais dans la plateforme partagée
 * (`src/shared/platform/useGeolocation.js`, lot 6) : le Plan Lyautey s'en sert aussi, et
 * `src/shared` ne peut pas importer de code produit.
 */
export { useGeolocation } from '../shared/platform/useGeolocation.js';
