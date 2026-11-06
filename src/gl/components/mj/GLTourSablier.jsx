import { useEffect, useRef, useState } from 'react';

/**
 * Sablier de l'équipe active (surface tableau) : client seul, rien n'est annulé quand il sonne.
 * `seconds` = `tenir_sablier_secondes`. Se réarme quand `resetKey` change (équipe suivante).
 */
export function GLTourSablier({ seconds = 180, resetKey = null, running = true, onDone = null }) {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(false);

  useEffect(() => {
    setLeft(seconds);
    doneRef.current = false;
  }, [seconds, resetKey]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onDone]);

  const mm = String(Math.floor(left / 60)).padStart(1, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div
      className={`gl-tour-sablier${left === 0 ? ' is-done' : ''}`}
      role="timer"
      aria-live="off"
      data-testid="gl-tour-sablier"
    >
      <span className="gl-tour-sablier__time">
        {mm}:{ss}
      </span>
      {left === 0 ? (
        <span className="gl-hint"> — le sablier a sonné (rien n’est annulé)</span>
      ) : null}
    </div>
  );
}
