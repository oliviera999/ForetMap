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

/** Temps laissé à une ligne « première fois » avant que la suivante (ou une autre) la remplace. */
export const OLU_PREMIERE_FOIS_MS = 9000;

const cleDe = (e) => e?.id ?? `${e?.eventType}-${e?.createdAt}`;

/**
 * Olu commentateur (« Tenir à deux », spec § 13) : à chaque nouvel événement du journal, une
 * ligne tirée par `moment` (table servie par `GET /tenir/olu`), variables substituées côté
 * client, repli local. Les lignes `moment = oiseau` attendent la fin de l'animation de
 * l'oiseau (Olu est figé pendant : `useGlNarrator().frozen`).
 *
 * Ensemble unifié (M8) — « première fois » : le serveur désigne, sur l'évènement qui la
 * déclenche, la ou les lignes à dire une seule fois dans la partie (`payload.olu`). Elles
 * passent avant toute autre, se disent une à une, et tiennent la bulle le temps d'être lues.
 * @returns {{ line: null|{ id, texte, expression, moment }, speakerName, frozen }}
 */
export function useGlTenirOlu({ gameId, events = [], teams = [], enabled = true, teamId = null }) {
  const [data, setData] = useState(cache);
  const [line, setLine] = useState(null);
  const lastSeenRef = useRef(null);
  const fileRef = useRef([]);
  const timerRef = useRef(null);
  const tenueJusquaRef = useRef(0);
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

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const teamNames = useMemo(
    () => new Map((teams || []).map((t) => [Number(t.id), t.name])),
    [teams],
  );

  useEffect(() => {
    if (!enabled || !data) return;
    const list = Array.isArray(events) ? events : [];
    const last = list[list.length - 1];
    if (!last) return;
    const key = cleDe(last);
    if (lastSeenRef.current === key) return;
    // Évènements pas encore vus : au premier passage, seul le dernier compte (on ne rejoue pas
    // l'histoire) ; ensuite, tous ceux arrivés depuis — un lot peut en porter plusieurs.
    const vu =
      lastSeenRef.current == null ? -1 : list.findIndex((e) => cleDe(e) === lastSeenRef.current);
    const nouveaux = vu >= 0 ? list.slice(vu + 1) : [last];
    lastSeenRef.current = key;

    // « Première fois » : les lignes désignées par le serveur, mises en file, dites une à une.
    const direSuivante = () => {
      timerRef.current = null;
      const suivante = fileRef.current.shift();
      if (!suivante) return;
      setLine(suivante);
      tenueJusquaRef.current = Date.now() + OLU_PREMIERE_FOIS_MS;
      if (fileRef.current.length) timerRef.current = setTimeout(direSuivante, OLU_PREMIERE_FOIS_MS);
    };
    for (const e of nouveaux) {
      for (const o of Array.isArray(e?.payload?.olu) ? e.payload.olu : []) {
        const ligne = data.lignes.find((l) => l.id === o?.id);
        if (!ligne) continue;
        const equipe = teamNames.get(Number(o.teamId ?? e.payload?.teamId ?? e.teamId)) || '';
        // Une ligne qui nomme une équipe ne se dit pas sans son nom.
        if (/\{equipe\}/.test(ligne.texte) && !equipe) continue;
        fileRef.current.push({
          id: `${ligne.id}-${cleDe(e)}`,
          texte: renderOluLine(ligne.texte, { equipe }),
          expression: ligne.expression || 'neutre',
          moment: 'premiere_fois',
        });
      }
    }
    if (fileRef.current.length) {
      if (!timerRef.current) {
        const attente = tenueJusquaRef.current - Date.now();
        if (attente > 0) timerRef.current = setTimeout(direSuivante, attente);
        else direSuivante();
      }
      return;
    }
    // Une ligne « première fois » encore à l'écran garde la bulle le temps d'être lue.
    if (Date.now() < tenueJusquaRef.current) return;

    const moment = data.moments[String(last.eventType || '')];
    if (!moment || moment === 'erreur') return;
    // E5 : « vos bourses débordent » ne se dit qu'à l'écran de l'équipe concernée (jamais au
    // prof, jamais en projection : ces écrans n'ont pas de `teamId`).
    if (moment === 'bourse_pleine') {
      const cible = Number(last.payload?.teamId ?? last.teamId);
      if (teamId == null || !Number.isFinite(cible) || cible !== Number(teamId)) return;
    }
    const candidates = data.lignes.filter((l) => l.moment === moment);
    // Une ligne désignée par l'évènement (`payload.oluId`, ex. recul de Lumière) passe d'abord.
    const designee = last.payload?.oluId
      ? candidates.find((l) => l.id === last.payload.oluId) || null
      : null;
    const chosen =
      designee || pick(candidates, last.id) || pick(TENIR_OLU_FALLBACK[moment] || [], 0);
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
  }, [events, data, enabled, teamNames, teamId]);

  return { line, speakerName, frozen };
}
