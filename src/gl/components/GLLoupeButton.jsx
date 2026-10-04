import { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GL_VOYAGEUR_GAIN_EVENT } from '../services/glVoyageurEvents.js';

/**
 * État du sortilège « Loupe » partagé entre toutes les questions ouvertes : une lecture de
 * `/api/gl/voyageur/me` au plus toutes les 60 s, invalidée par un gain ou un lancer.
 * `null` = indisponible (pas un joueur, module éteint, erreur) : le bouton ne s'affiche pas.
 */
const CACHE_TTL_MS = 60_000;
let cache = { at: 0, promise: null };

function invalidateLoupeCache() {
  cache = { at: 0, promise: null };
}

if (typeof window !== 'undefined') {
  window.addEventListener(GL_VOYAGEUR_GAIN_EVENT, invalidateLoupeCache);
}

export function resetLoupeCacheForTests() {
  invalidateLoupeCache();
}

function loadLoupeState() {
  if (cache.promise && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
  cache.at = Date.now();
  cache.promise = apiGL('/api/gl/voyageur/me')
    .then((view) => (view?.grimoire || []).find((s) => s.code === 'loupe') || null)
    .catch(() => null);
  return cache.promise;
}

/**
 * Bouton « 🔍 Loupe » (S3) : pendant une question, écarte une mauvaise réponse. Ne s'affiche
 * que si le sortilège est ouvert pour ce joueur ; rechargé, il le dit au lieu de disparaître.
 */
export function GLLoupeButton({ presentationToken, onEliminate, disabled = false }) {
  const [spell, setSpell] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [usedOnToken, setUsedOnToken] = useState(null);

  useEffect(() => {
    let alive = true;
    loadLoupeState().then((state) => {
      if (alive) setSpell(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setMessage('');
  }, [presentationToken]);

  if (!spell?.unlocked || !presentationToken) return null;

  const usedHere = usedOnToken === presentationToken;
  const cast = async () => {
    setBusy(true);
    setMessage('');
    try {
      const out = await apiGL('/api/gl/voyageur/spells/loupe/cast', 'POST', {
        target: presentationToken,
      });
      invalidateLoupeCache();
      setSpell(out?.spell || { ...spell, charged: false });
      setUsedOnToken(presentationToken);
      if (out?.effect?.eliminatedChoiceId != null) onEliminate?.(out.effect.eliminatedChoiceId);
      setMessage('🔍 Une mauvaise réponse est écartée.');
    } catch (err) {
      setMessage(err?.message || 'La Loupe n’a pas fonctionné.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gl-loupe">
      {spell.charged && !usedHere ? (
        <button
          type="button"
          className="gl-loupe__btn"
          onClick={cast}
          disabled={busy || disabled}
          title="Sortilège du voyageur : écarte une mauvaise réponse"
        >
          <span className="foretmap-emoji-text-mixed" aria-hidden>
            🔍
          </span>{' '}
          Loupe
        </button>
      ) : !usedHere ? (
        <span className="gl-loupe__hint">
          🔍 Loupe : encore {spell.pointsToRecharge} point(s) pour la recharger
        </span>
      ) : null}
      {message ? (
        <span className="gl-loupe__message" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
