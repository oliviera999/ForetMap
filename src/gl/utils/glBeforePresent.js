/**
 * Attend l'étape facultative qui précède l'affichage d'un popover d'arrivée (zoom du plateau,
 * `useGLBoardFocus`). Décorative : son échec n'empêche jamais la présentation.
 * @param {((target: object) => unknown)|null|undefined} beforePresent
 * @param {object} target repère ou zone présenté
 */
export async function awaitBeforePresent(beforePresent, target) {
  if (typeof beforePresent !== 'function') return;
  try {
    await beforePresent(target);
  } catch {
    /* zoom décoratif */
  }
}
