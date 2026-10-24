/** Plafond : le zoom plateau est borné à 800 ms ; au-delà on présente quand même. */
const BEFORE_PRESENT_TIMEOUT_MS = 2500;

/**
 * Attend l'étape facultative qui précède l'affichage d'un popover d'arrivée (zoom du plateau,
 * `useGLBoardFocus`). Décorative : son échec ou un dépassement de délai n'empêche jamais la
 * présentation (un `restore` pendant le vol ne doit pas laisser l'arrivée bloquée).
 * @param {((target: object) => unknown)|null|undefined} beforePresent
 * @param {object} target repère ou zone présenté
 * @param {{ timeoutMs?: number }} [options]
 */
export async function awaitBeforePresent(
  beforePresent,
  target,
  { timeoutMs = BEFORE_PRESENT_TIMEOUT_MS } = {},
) {
  if (typeof beforePresent !== 'function') return;
  try {
    const result = beforePresent(target);
    if (!result || typeof result.then !== 'function') return;
    const ms = Number(timeoutMs);
    if (!(ms > 0) || !Number.isFinite(ms)) {
      await result;
      return;
    }
    await Promise.race([
      result,
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    ]);
  } catch {
    /* zoom décoratif */
  }
}
