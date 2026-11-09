/**
 * Numérotation humaine des cases du plateau (« Tenir à deux ») — noyau partagé serveur / client
 * (miroir CJS `lib/shared/glCaseNumeroCore.js`, régénéré par `npm run sync:shared-cores`).
 *
 * Une seule convention partout : le moteur manipule des **rangs** (index 0-based dans le chemin
 * du plateau, `teamPathIndex`, `voile_position`), les écrans et le journal affichent un **numéro**
 * = rang + 1. Le bandeau disait « case 9 » quand le journal disait « jusqu'à la case 8 »
 * (simulation du 7 novembre 2026) : le journal lisait le rang brut.
 */

/** Numéro humain d'un rang de case (0 → 1), `null` si le rang n'est pas un entier ≥ 0. */
export function numeroCase(rang) {
  if (rang == null || rang === '') return null;
  const n = Number(rang);
  if (!Number.isInteger(n) || n < 0) return null;
  return n + 1;
}

/** Libellé « case N », ou `fallback` (défaut « — ») quand le rang est inconnu. */
export function libelleCase(rang, fallback = '—') {
  const numero = numeroCase(rang);
  return numero == null ? fallback : `case ${numero}`;
}

/** Rang (0-based) depuis un numéro humain (1 → 0), `null` si invalide. */
export function rangDepuisNumero(numero) {
  if (numero == null || numero === '') return null;
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) return null;
  return n - 1;
}
