import { useEffect, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

const DUREE_S = 30;

/**
 * Péripétie (« Tenir à deux », spec § 13) : affichage plein écran 30 s du texte tiré sur une
 * case événement, bouton « On passe ». Le texte vient du catalogue (`peripeties.json`) : il
 * n'est jamais réécrit ici.
 */
export function GLPeripetieOverlay({ peripetie, teamName = '', onPasser, busy = false }) {
  const [reste, setReste] = useState(DUREE_S);
  useEffect(() => {
    setReste(DUREE_S);
    if (!peripetie) return undefined;
    const t = setInterval(() => setReste((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [peripetie?.id]);
  useEffect(() => {
    if (peripetie && reste === 0) onPasser?.(peripetie);
  }, [reste, peripetie, onPasser]);
  if (!peripetie) return null;
  return (
    <div
      className="gl-peripetie-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gl-peripetie-titre"
      data-testid="gl-peripetie-overlay"
    >
      <div className="gl-peripetie-overlay__panel">
        <h2 id="gl-peripetie-titre">Péripétie{teamName ? ` — ${teamName}` : ''}</h2>
        <p className="gl-peripetie-overlay__texte">{peripetie.texte}</p>
        <p className="gl-hint" aria-live="polite">
          {reste} s
        </p>
        <GLButton type="button" disabled={busy} onClick={() => onPasser?.(peripetie)}>
          On passe
        </GLButton>
      </div>
    </div>
  );
}
