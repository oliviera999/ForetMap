import { useEffect, useRef, useState } from 'react';
import { GL_VOYAGEUR_GAIN_EVENT } from '../services/glVoyageurEvents.js';
import { playVoyageurSound } from '../utils/glVoyageurSounds.js';

const REGARD_LABELS = {
  proche: { emoji: '🍄', label: 'regard du proche' },
  loin: { emoji: '🦄', label: 'regard du loin' },
};

const CHIP_LIFETIME_MS = 2600;

/** Pastilles à afficher pour un gain `{ proche, loin }` (pure, testable). */
export function gainToChips(gain) {
  const chips = [];
  for (const regard of ['proche', 'loin']) {
    const n = Number(gain?.[regard]) || 0;
    if (n > 0) chips.push({ regard, text: `+${n} ${REGARD_LABELS[regard].label}` });
  }
  return chips;
}

/**
 * « +1 » immédiat (audit expérience joueur, S1) : chaque fois qu'une réponse de l'API
 * signale que le voyageur a grandi (`voyageurGain`, relayé par `apiGL`), une pastille
 * s'envole en bas de l'écran. Annoncée poliment aux lecteurs d'écran.
 */
export function GLVoyageurGainToast() {
  const [chips, setChips] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    const timers = new Set();
    const onGain = (event) => {
      const next = gainToChips(event.detail).map((chip) => {
        seq.current += 1;
        return { ...chip, id: seq.current };
      });
      if (!next.length) return;
      setChips((prev) => [...prev, ...next].slice(-4));
      // Un son par regard gagné, le second légèrement décalé pour qu'ils ne se couvrent pas.
      next.forEach((chip, i) => {
        const play = () => playVoyageurSound(`gain-${chip.regard}`);
        if (i === 0) play();
        else timers.add(setTimeout(play, 220 * i));
      });
      const ids = new Set(next.map((c) => c.id));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setChips((prev) => prev.filter((c) => !ids.has(c.id)));
      }, CHIP_LIFETIME_MS);
      timers.add(timer);
    };
    window.addEventListener(GL_VOYAGEUR_GAIN_EVENT, onGain);
    return () => {
      window.removeEventListener(GL_VOYAGEUR_GAIN_EVENT, onGain);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  return (
    <div className="gl-voyageur-gain" role="status" aria-live="polite">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={`gl-voyageur-gain__chip gl-voyageur-gain__chip--${chip.regard}`}
        >
          <span className="foretmap-emoji-text-mixed" aria-hidden>
            {REGARD_LABELS[chip.regard].emoji}
          </span>{' '}
          {chip.text}
        </span>
      ))}
    </div>
  );
}
