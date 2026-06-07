import { useCallback, useEffect, useRef, useState } from 'react';
import { introAudio, loadGlAssetRuntime, plateauAudio } from '../assets/index.js';
import { GL_ZONE_MUSIC_FADE_MS, GL_ZONE_MUSIC_MUTED_KEY } from './useGLZoneMusic.js';

function readStoredMuted() {
  try {
    return localStorage.getItem(`${GL_ZONE_MUSIC_MUTED_KEY}_plateau`) === '1';
  } catch (_) {
    return false;
  }
}

function writeStoredMuted(muted) {
  try {
    localStorage.setItem(`${GL_ZONE_MUSIC_MUTED_KEY}_plateau`, muted ? '1' : '0');
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

function resolveTrack(introActive, plateauNumber, biomeSlug, saison) {
  if (introActive) return introAudio();
  if (plateauNumber != null) return plateauAudio(plateauNumber, biomeSlug, saison);
  return { url: null, loop: true, gain: 0.7 };
}

export function useGLPlateauMusic({
  enabled = false,
  plateauNumber = null,
  introActive = false,
  biomeSlug = null,
  biomeSaison = null,
  fadeMs = GL_ZONE_MUSIC_FADE_MS,
}) {
  const [userMuted, setUserMuted] = useState(readStoredMuted);
  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const activeSlotRef = useRef(null);
  const fadeRafRef = useRef(null);
  const unlockedRef = useRef(false);
  const lastTrackKeyRef = useRef(null);

  const ensureAudios = useCallback(() => {
    if (typeof Audio === 'undefined') return null;
    if (!audioARef.current) {
      const a = new Audio();
      a.preload = 'auto';
      audioARef.current = a;
    }
    if (!audioBRef.current) {
      const b = new Audio();
      b.preload = 'auto';
      audioBRef.current = b;
    }
    return { a: audioARef.current, b: audioBRef.current };
  }, []);

  const primeAudio = useCallback(() => {
    unlockedRef.current = true;
  }, []);

  const toggleMuted = useCallback(() => {
    setUserMuted((prev) => {
      const next = !prev;
      writeStoredMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    loadGlAssetRuntime().catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || userMuted || !unlockedRef.current) return undefined;
    const track = resolveTrack(introActive, plateauNumber, biomeSlug, biomeSaison);
    const trackKey = track.url ? `${introActive ? 'intro' : plateauNumber}:${biomeSlug || ''}:${track.url}` : null;

    if (!track.url) {
      const outgoing = activeSlotRef.current === 'a' ? audioARef.current
        : activeSlotRef.current === 'b' ? audioBRef.current
          : null;
      if (outgoing) {
        runCrossfade({
          outgoing,
          incoming: null,
          outFrom: outgoing.volume,
          inTo: 0,
          durationMs: fadeMs,
          rafRef: fadeRafRef,
          onDone: () => {
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
          },
        });
      }
      activeSlotRef.current = null;
      lastTrackKeyRef.current = null;
      return undefined;
    }

    if (trackKey === lastTrackKeyRef.current) return undefined;
    lastTrackKeyRef.current = trackKey;

    const audios = ensureAudios();
    if (!audios) return undefined;

    const incomingSlot = activeSlotRef.current === 'a' ? 'b' : 'a';
    const outgoing = activeSlotRef.current === 'a' ? audios.a
      : activeSlotRef.current === 'b' ? audios.b
        : null;
    const incoming = incomingSlot === 'a' ? audios.a : audios.b;

    incoming.loop = track.loop !== false;
    incoming.volume = 0;
    incoming.src = track.url;
    incoming.play().catch(() => {});

    runCrossfade({
      outgoing,
      incoming,
      outFrom: outgoing?.volume || 0,
      inTo: track.gain ?? 0.7,
      durationMs: fadeMs,
      rafRef: fadeRafRef,
      onDone: () => {
        if (outgoing) {
          outgoing.pause();
          outgoing.removeAttribute('src');
          outgoing.load();
          outgoing.volume = 0;
        }
        activeSlotRef.current = incomingSlot;
      },
    });

    return () => cancelFade(fadeRafRef);
  }, [enabled, userMuted, plateauNumber, introActive, biomeSlug, biomeSaison, fadeMs, ensureAudios]);

  useEffect(() => () => {
    cancelFade(fadeRafRef);
    for (const node of [audioARef.current, audioBRef.current]) {
      if (!node) continue;
      node.pause();
      node.removeAttribute('src');
      node.load();
    }
  }, []);

  return { userMuted, toggleMuted, primeAudio };
}
