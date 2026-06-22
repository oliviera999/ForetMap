import { useCallback, useEffect, useRef } from 'react';
import { zoneMusicUrls, zoneMusicVolume } from '../../utils/glZoneAtPct.js';
import { clampAudioVolume } from '../utils/clampAudioVolume.js';

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
  const safeOutFrom = clampAudioVolume(outFrom);
  const safeInTo = clampAudioVolume(inTo);
  if (durationMs <= 0) {
    if (outgoing) outgoing.volume = 0;
    if (incoming) incoming.volume = safeInTo;
    onDone?.();
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    if (outgoing) outgoing.volume = clampAudioVolume(safeOutFrom * (1 - t));
    if (incoming) incoming.volume = clampAudioVolume(safeInTo * t);
    if (t < 1) {
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = null;
      onDone?.();
    }
  };
  rafRef.current = requestAnimationFrame(step);
}

function buildZoneKey(activeZone, urls) {
  if (!activeZone?.id || !urls?.length) return null;
  return `${activeZone.id}:${urls.join('|')}`;
}

/**
 * Moteur audio à deux pistes avec fondu enchaîné pour la musique de zone GL.
 * Supporte une playlist de pistes qui s'enchaînent (boucle sur la liste).
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
  const playlistRef = useRef([]);
  const trackIndexRef = useRef(0);
  const volumeRef = useRef(0.7);
  const endedHandlerRef = useRef(null);

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

  const detachEndedHandler = useCallback((audio) => {
    if (!audio || !endedHandlerRef.current) return;
    audio.removeEventListener('ended', endedHandlerRef.current);
  }, []);

  const stopAll = useCallback(() => {
    cancelFade(fadeRafRef);
    for (const audio of [audioARef.current, audioBRef.current]) {
      if (!audio) continue;
      detachEndedHandler(audio);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.volume = 0;
      audio.loop = false;
    }
    activeSlotRef.current = null;
    lastZoneKeyRef.current = null;
    playlistRef.current = [];
    trackIndexRef.current = 0;
  }, [detachEndedHandler]);

  const fadeOutActive = useCallback(
    (onDone) => {
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
            detachEndedHandler(outgoing);
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
            outgoing.loop = false;
            activeSlotRef.current = null;
            lastZoneKeyRef.current = null;
            playlistRef.current = [];
            trackIndexRef.current = 0;
            onDone?.();
          },
        });
      } else {
        stopAll();
        onDone?.();
      }
    },
    [detachEndedHandler, fadeMs, stopAll],
  );

  const playTrack = useCallback(
    ({ url, volume, loop, resetZoneKey = false }) => {
      const audios = ensureAudios();
      if (!audios || !url) return;

      const outgoing =
        activeSlotRef.current === 'a' ? audios.a : activeSlotRef.current === 'b' ? audios.b : null;
      const incomingSlot = activeSlotRef.current === 'a' ? 'b' : 'a';
      const incoming = incomingSlot === 'a' ? audios.a : audios.b;

      if (resetZoneKey) {
        lastZoneKeyRef.current = null;
      }

      detachEndedHandler(outgoing);
      detachEndedHandler(incoming);
      activeSlotRef.current = incomingSlot;

      incoming.loop = loop;
      incoming.src = url;
      incoming.volume = 0;
      incoming.play().catch(() => {});

      const targetVol = Math.max(0, Math.min(1, volume));
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
            detachEndedHandler(outgoing);
            outgoing.pause();
            outgoing.removeAttribute('src');
            outgoing.load();
            outgoing.volume = 0;
            outgoing.loop = false;
          }
        },
      });
    },
    [detachEndedHandler, ensureAudios, fadeMs],
  );

  const bindPlaylistEnded = useCallback(
    (audio) => {
      const urls = playlistRef.current;
      if (urls.length <= 1 || !audio) return;
      detachEndedHandler(audio);
      const handler = () => {
        if (playlistRef.current.length <= 1) return;
        const nextUrls = playlistRef.current;
        const nextIndex = (trackIndexRef.current + 1) % nextUrls.length;
        trackIndexRef.current = nextIndex;
        playTrack({
          url: nextUrls[nextIndex],
          volume: volumeRef.current,
          loop: false,
        });
        const audios = ensureAudios();
        const active =
          activeSlotRef.current === 'a'
            ? audios?.a
            : activeSlotRef.current === 'b'
              ? audios?.b
              : null;
        if (active) bindPlaylistEnded(active);
      };
      endedHandlerRef.current = handler;
      audio.addEventListener('ended', handler);
    },
    [detachEndedHandler, ensureAudios, playTrack],
  );

  const startPlaylist = useCallback(
    (urls, volume, zoneKey) => {
      playlistRef.current = urls;
      trackIndexRef.current = 0;
      volumeRef.current = volume;
      lastZoneKeyRef.current = zoneKey;

      const loopSingle = urls.length <= 1;
      playTrack({
        url: urls[0],
        volume,
        loop: loopSingle,
      });

      if (!loopSingle) {
        const audios = ensureAudios();
        const active =
          activeSlotRef.current === 'a'
            ? audios?.a
            : activeSlotRef.current === 'b'
              ? audios?.b
              : null;
        if (active) bindPlaylistEnded(active);
      }
    },
    [bindPlaylistEnded, ensureAudios, playTrack],
  );

  const unlock = useCallback(() => {
    unlockedRef.current = true;
  }, []);

  const previewUrl = useCallback(
    (urlOrUrls, volume = 0.7) => {
      const urls = Array.isArray(urlOrUrls)
        ? urlOrUrls.map((url) => String(url || '').trim()).filter(Boolean)
        : urlOrUrls
          ? [String(urlOrUrls).trim()]
          : [];
      if (urls.length === 0) return;
      stopAll();
      unlockedRef.current = true;
      startPlaylist(urls, volume, `preview:${urls.join('|')}`);
    },
    [startPlaylist, stopAll],
  );

  useEffect(() => {
    if (!enabled || prefersReducedMotion) {
      return undefined;
    }

    if (userMuted || !unlockedRef.current) {
      fadeOutActive();
      return undefined;
    }

    const musicUrls = zoneMusicUrls(activeZone);
    const musicVolume = zoneMusicVolume(activeZone);
    const zoneKey = buildZoneKey(activeZone, musicUrls);

    if (musicUrls.length === 0) {
      fadeOutActive();
      return undefined;
    }

    if (zoneKey === lastZoneKeyRef.current) return undefined;

    startPlaylist(musicUrls, musicVolume, zoneKey);

    return undefined;
  }, [activeZone, enabled, userMuted, prefersReducedMotion, fadeOutActive, startPlaylist]);

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
