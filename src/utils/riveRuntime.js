import { RuntimeLoader } from '@rive-app/canvas';
import riveWasmUrl from '@rive-app/canvas/rive.wasm?url';
import riveFallbackWasmUrl from '@rive-app/canvas/rive_fallback.wasm?url';

let configured = false;

/**
 * Sert le runtime WebAssembly de Rive depuis notre propre origine au lieu du
 * CDN unpkg interrogé par défaut.
 *
 * Le fetch CDN échoue dans les environnements sans egress externe ou avec
 * interception TLS (CI headless) : `ERR_CERT_AUTHORITY_INVALID`, le runtime ne
 * s'initialise pas et la mascotte Rive ne se peint jamais (cf. issue #54).
 * Bénéfice aussi en production : aucune dépendance tierce au runtime, chargement
 * plus fiable. Vite émet les deux `.wasm` en assets hashés same-origin via
 * l'import `?url`.
 *
 * `RuntimeLoader` est un singleton partagé avec `@rive-app/react-canvas`
 * (installation unique de `@rive-app/canvas`), donc régler l'URL ici suffit pour
 * tous les `useRive`. Idempotent et sûr à appeler plusieurs fois.
 */
export function configureRiveRuntime() {
  if (configured) return;
  configured = true;
  RuntimeLoader.setWasmUrl(riveWasmUrl);
  // Le fallback (build sans SIMD) pointe par défaut vers jsdelivr : on le garde
  // aussi same-origin pour n'avoir aucune dépendance réseau externe.
  if (typeof RuntimeLoader.setWasmFallbackUrl === 'function') {
    RuntimeLoader.setWasmFallbackUrl(riveFallbackWasmUrl);
  }
}
