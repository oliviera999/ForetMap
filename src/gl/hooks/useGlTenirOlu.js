import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useGlNarrator } from './useGlNarrator.js';
import { TENIR_OLU_FALLBACK } from '../constants/tenirTextes.js';

let cache = null;
let loading = null;

async function loadOlu(gameId) {
  if (cache) return cache;
  if (!loading) {
    loading = apiGL(`/api/gl/games/${gameId}/tenir/olu`)
      .then((data) => {
        cache = {
          lignes: Array.isArray(data?.lignes) ? data.lignes : [],
          moments: data?.moments && typeof data.moments === 'object' ? data.moments : {},
        };
        return cache;
      })
      .catch(() => {
        cache = { lignes: [], moments: {} };
        return cache;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Test helper. */
export function resetGlTenirOluCache() {
  cache = null;
  loading = null;
}

/** Substitue `{equipe}`, `{n}`, `{biome}` (miroir de `lib/glTenirOlu.js`). */
export function renderOluLine(texte, vars = {}) {
  return String(texte || '').replace(/\{(equipe|n|biome)\}/g, (m, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : m,
  );
}

function pick(list, seed) {
  if (!list?.length) return null;
  const idx = Math.abs(Number(seed) || 0) % list.length;
  return list[idx];
}

/**
 * Olu commentateur (« Tenir à deux », spec § 13) : à chaque nouvel événement du journal, une
 * ligne tirée par `moment` (table servie par `GET /tenir/olu`), variables substituées côté
 * client, repli local. Les lignes `moment = oiseau` attendent la fin de l'animation de
 * l'oiseau (Olu est figé pendant : `useGlNarrator().frozen`).
 * @returns {{ line: null|{ id, texte, expression, moment }, speakerName, frozen }}
 */
export function useGlTenirOlu({ gameId, events = [], teams = [], enabled = true }) {
  const [data, setData] = useState(cache);
  const [line, setLine] = useState(null);
  const lastSeenRef = useRef(null);
  const { speakerName, frozen } = useGlNarrator();

  useEffect(() => {
    if (!gameId || !enabled) return undefined;
    let cancelled = false;
    loadOlu(gameId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, enabled]);

  const teamNames = useMemo(
    () => new Map((teams || []).map((t) => [Number(t.id), t.name])),
    [teams],
  );

  useEffect(() => {
    if (!enabled || !data) return;
    const list = Array.isArray(events) ? events : [];
    const last = list[list.length - 1];
    if (!last) return;
    const key = last.id ?? `${last.eventType}-${last.createdAt}`;
    if (lastSeenRef.current === key) return;
    lastSeenRef.current = key;
    const moment = data.moments[String(last.eventType || '')];
    if (!moment || moment === 'erreur') return;
    const candidates = data.lignes.filter((l) => l.moment === moment);
    const chosen = pick(candidates, last.id) || pick(TENIR_OLU_FALLBACK[moment] || [], 0);
    if (!chosen) return;
    const payload = last.payload || {};
    const vars = {
      equipe: teamNames.get(Number(payload.teamId ?? last.teamId)) || '',
      n: payload.total ?? payload.cases ?? payload.delta ?? payload.n ?? '',
      biome: payload.biome || payload.biomeSlug || '',
    };
    setLine({
      id: chosen.id || `${moment}-${key}`,
      texte: renderOluLine(chosen.texte, vars),
      expression: chosen.expression || 'neutre',
      moment,
    });
  }, [events, data, enabled, teamNames]);

  return { line, speakerName, frozen };
}
