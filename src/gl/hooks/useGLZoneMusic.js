import { useCallback, useEffect, useRef } from 'react';

export const GL_ZONE_MUSIC_FADE_MS = 1200;
export const GL_ZONE_MUSIC_MUTED_KEY = 'gl_zone_music_muted';

function readStoredMuted() {
  try {
    return localStorage.getItem(GL_ZONE_MUSIC_MUTED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function writeStoredMuted(muted) {
  try {
    localStorage.setItem(GL_ZONE_MUSIC_MUTED_KEY, muted ? '1' : '0');
  } catch (_) {
    // noop
  }
}

function cancelFade(rafRef) {
  if (rafRef.current != null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
}

function runCrossfade({ outgoing, incoming, outFrom, inTo, durationMs, rafRef, onDone }) {
  cancelFade(rafRef);
  if (durationMs <= 0) {
    if (outgoing) outgoing.volume = 0;
    if (incoming) incoming.volume = inTo;
    onDone?.();
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    if (outgoing) outgoing.volume = outFrom * (1 - t);
    if (incoming) incoming.volume = inTo * t;
    if (t < 1) {
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = null;
      onDone?.();
    }
  };
  rafRef.current = requestAnimationFrame(step);
}

/**
 * Moteur audio à deux pistes avec fondu enchaîné pour la musique de zone GL.
 */
export function useGLZoneMusic({
  enabled = false,
  userMuted = false,
  activeZone = null,
  fadeMs = GL_ZONE_MUSIC_FADE_MS,
  prefersReducedMotion = false,
}) {
  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const activeSlotRef = useRef(null);
  const fadeRafRef = useRef(null);
  const unlockedRef = useRef(false);
  const lastZoneKeyRef = useRef(null);

  const ensureAudios = useCallback(() => {
    if (typeof Audio === 'undefined') return null;
    if (!audioARef.current) {
      const a = new Audio();
      a.loop = true;
      a.preload = 'auto';
      audioARef.current = a;
    }
    if (!audioBRef.current) {
      const b = new Audio();
      b.loop = true;
      b.preload = 'auto';
      audioBRef.current = b;
    }
    return { a: audioARef.current, b: audioBRef.current };
  }, []);

  const stopAll = useCallback(() => {
    cancelFade(fadeRafRef);
    for (const audio of [audioARef.current, audioBRef.current]) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.volume = 0;
    }
    activeSlotRef.current = null;
    lastZoneKeyRef.current = null;
  }, []);

  const unlock = useCallback(() => {
    unlockedRef.current = true;
  }, []);

  const previewUrl = useCallback(
    (url, volume = 0.7) => {
      const audios = ensureAudios();
      if (!audios || !url) return;
      stopAll();
      unlockedRef.current = true;
      const target = audios.a;
      target.src = url;
      target.volume = 0;
      target.play().catch(() => {});
      runCrossfade({
        outgoing: null,
        incoming: target,
        outFrom: 0,
        inTo: Math.max(0, Math.min(1, volume)),
        durationMs: fadeMs,
        rafRef: fadeRafRef,
      });
      activeSlotRef.current = 'a';
      lastZoneKeyRef.current = `preview:${url}`;
    },
    [ensureAudios, fadeMs, stopAll],
  );

  useEffect(() => {
    if (!enabled || prefersReducedMotion) {
      return undefined;
    }

    if (userMuted || !unlockedRef.current) {
      const outgoing =
        activeSlotRef.current === 'a'
          ? audioARef.current
          : activeSlotRef.current === 'b'
            ? audioBRef.current
            : null;
      if (outgoing && !outgoing.paused) {
        const outFrom = outgoing.volume;
        runCrossfade({
          outgoing,
          incoming: null,
          outFrom,
          inTo: 0,
          durationMs: fadeMs,
          rafRef: fadeRafRef,
          onDone: () => {
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
            activeSlotRef.current = null;
            lastZoneKeyRef.current = null;
          },
        });
      }
      return undefined;
    }

    const musicUrl = activeZone?.musicUrl || null;
    const musicVolume = Number(activeZone?.musicVolume ?? 0.7);
    const zoneKey = musicUrl ? `${activeZone?.id}:${musicUrl}` : null;

    if (!musicUrl) {
      const outgoing =
        activeSlotRef.current === 'a'
          ? audioARef.current
          : activeSlotRef.current === 'b'
            ? audioBRef.current
            : null;
      if (outgoing && !outgoing.paused) {
        const outFrom = outgoing.volume;
        runCrossfade({
          outgoing,
          incoming: null,
          outFrom,
          inTo: 0,
          durationMs: fadeMs,
          rafRef: fadeRafRef,
          onDone: () => {
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
            activeSlotRef.current = null;
            lastZoneKeyRef.current = null;
          },
        });
      } else {
        stopAll();
      }
      return undefined;
    }

    if (zoneKey === lastZoneKeyRef.current) return undefined;

    const audios = ensureAudios();
    if (!audios) return undefined;

    const outgoing =
      activeSlotRef.current === 'a' ? audios.a : activeSlotRef.current === 'b' ? audios.b : null;
    const incomingSlot = activeSlotRef.current === 'a' ? 'b' : 'a';
    const incoming = incomingSlot === 'a' ? audios.a : audios.b;

    lastZoneKeyRef.current = zoneKey;
    activeSlotRef.current = incomingSlot;

    incoming.src = musicUrl;
    incoming.volume = 0;
    incoming.play().catch(() => {});

    const targetVol = Math.max(0, Math.min(1, musicVolume));
    const outFrom = outgoing && !outgoing.paused ? outgoing.volume : 0;
    runCrossfade({
      outgoing: outgoing && !outgoing.paused ? outgoing : null,
      incoming,
      outFrom,
      inTo: targetVol,
      durationMs: fadeMs,
      rafRef: fadeRafRef,
      onDone: () => {
        if (outgoing && outgoing !== incoming) {
          outgoing.pause();
          outgoing.removeAttribute('src');
          outgoing.load();
          outgoing.volume = 0;
        }
      },
    });

    return undefined;
  }, [activeZone, enabled, userMuted, prefersReducedMotion, fadeMs, ensureAudios, stopAll]);

  useEffect(
    () => () => {
      stopAll();
    },
    [stopAll],
  );

  return {
    unlock,
    previewUrl,
    stopAll,
  };
}

export { readStoredMuted, writeStoredMuted };
