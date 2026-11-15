import { GLSablier } from '../tenir/GLSablier.jsx';

/**
 * Sablier de l'équipe active (surface tableau) : décompte côté client, rien n'est annulé quand
 * il sonne. `seconds` = `tenir_sablier_secondes`. Se réarme quand `resetKey` change (équipe
 * suivante). Avec `onRegler` (prof), un clic ouvre le panneau de réglage (`GLSablier`).
 */
export function GLTourSablier({
  seconds = 180,
  resetKey = null,
  running = true,
  onDone = null,
  reglages = null,
  onRegler = null,
  busy = false,
}) {
  return (
    <GLSablier
      mode="equipe"
      secondes={seconds}
      resetKey={resetKey}
      running={running}
      onDone={onDone}
      reglages={reglages}
      onRegler={onRegler}
      busy={busy}
      testId="gl-tour-sablier"
    />
  );
}
