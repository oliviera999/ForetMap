import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAppStatus } from '../appStatusEvents.js';

/** Durée d'affichage des états transitoires (confirmation) avant effacement. */
const TRANSIENT_KIND_TTL_MS = { saved: 2500, recovered: 3000 };

/** Priorité d'affichage quand plusieurs sources sont actives en même temps. */
const KIND_PRIORITY = { error: 4, retrying: 3, saving: 2, recovered: 1, saved: 1 };

const DEFAULT_MESSAGES = {
  saving: 'Enregistrement…',
  saved: 'Enregistré ✓',
  retrying: 'Serveur momentanément indisponible — reconnexion en cours…',
  recovered: 'Connexion au serveur rétablie ✓',
  error: 'Enregistrement impossible',
};

/**
 * Pastille d'état sticky (ForetMap + GL) : fixe en bas d'écran, discrète et
 * toujours visible sans scroller. Agrège les auto-enregistrements
 * (`useDebouncedAutoSave`) et les reconnexions réseau (`fetchJsonWithRetry`)
 * publiés sur le bus `appStatusEvents`.
 */
export function AppStatusSticky() {
  const [entries, setEntries] = useState(() => new Map());
  const timersRef = useRef(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    const clearExpiry = (id) => {
      const t = timers.get(id);
      if (t) {
        clearTimeout(t);
        timers.delete(id);
      }
    };
    const unsubscribe = subscribeAppStatus((detail) => {
      const id = typeof detail.id === 'string' ? detail.id : '';
      const kind = typeof detail.kind === 'string' ? detail.kind : '';
      if (!id || !kind) return;
      clearExpiry(id);
      if (kind === 'clear') {
        setEntries((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        return;
      }
      if (!(kind in KIND_PRIORITY)) return;
      const entry = {
        kind,
        message: String(detail.message || DEFAULT_MESSAGES[kind] || ''),
        attempt: Number.isFinite(detail.attempt) ? detail.attempt : null,
        maxAttempts: Number.isFinite(detail.maxAttempts) ? detail.maxAttempts : null,
        ts: Date.now(),
      };
      setEntries((prev) => {
        const next = new Map(prev);
        next.delete(id); // ré-insertion en fin : la mise à jour redevient « la plus récente »
        next.set(id, entry);
        return next;
      });
      const ttl = TRANSIENT_KIND_TTL_MS[kind];
      if (ttl) {
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            setEntries((prev) => {
              if (prev.get(id)?.kind !== kind) return prev;
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }, ttl),
        );
      }
    });
    return () => {
      unsubscribe();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const current = useMemo(() => {
    let best = null;
    for (const entry of entries.values()) {
      if (!best) {
        best = entry;
        continue;
      }
      const delta = (KIND_PRIORITY[entry.kind] || 0) - (KIND_PRIORITY[best.kind] || 0);
      if (delta > 0 || (delta === 0 && entry.ts >= best.ts)) best = entry;
    }
    return best;
  }, [entries]);

  if (!current) return null;

  const busy = current.kind === 'saving' || current.kind === 'retrying';
  const attemptSuffix =
    current.kind === 'retrying' && current.attempt && current.maxAttempts
      ? ` (tentative ${current.attempt}/${current.maxAttempts})`
      : '';

  return (
    <div
      className={`app-status-sticky app-status-sticky--${current.kind}`}
      role={current.kind === 'error' ? 'alert' : 'status'}
      aria-live={current.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {busy && <span className="app-status-sticky__spinner" aria-hidden="true" />}
      <span className="app-status-sticky__label">
        {current.message}
        {attemptSuffix}
      </span>
    </div>
  );
}
