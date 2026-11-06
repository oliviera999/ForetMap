import { useEffect, useState } from 'react';
import { freezeOlu } from '../../utils/glOluFreeze.js';

const ETATS = new Set([
  'froid',
  'tiede',
  'chaud',
  'zone',
  'page_trouvee',
  'page_tenue',
  'deja_trouvee',
]);
const DUREE_MS = 1600;

/**
 * L'oiseau témoin (« Tenir à deux », spec § 5) : silhouette muette, sans nom, sans bulle. Il
 * vole jusqu'au dernier point fouillé (position servie par le serveur, conservée d'un tour à
 * l'autre) et joue un état selon le verdict ; Olu se fige pendant l'animation. Aucun texte
 * rendu : le composant est `aria-hidden`.
 */
export function GLKraaWitness({ kraa, prefersReducedMotion = false }) {
  const [playing, setPlaying] = useState(false);
  const etat = kraa && ETATS.has(kraa.etat) ? kraa.etat : null;
  const at = kraa?.at || null;

  useEffect(() => {
    if (!etat) return undefined;
    setPlaying(true);
    freezeOlu(DUREE_MS);
    const t = setTimeout(() => setPlaying(false), DUREE_MS);
    return () => clearTimeout(t);
  }, [etat, at]);

  if (!kraa || !Number.isFinite(Number(kraa.x)) || !Number.isFinite(Number(kraa.y))) return null;
  const left = `${Math.max(0, Math.min(1, Number(kraa.x))) * 100}%`;
  const top = `${Math.max(0, Math.min(1, Number(kraa.y))) * 100}%`;
  const classes = [
    'gl-kraa',
    etat ? `gl-kraa--${etat}` : '',
    playing ? 'is-playing' : '',
    prefersReducedMotion ? 'gl-kraa--reduced' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={classes}
      style={{ left, top }}
      aria-hidden="true"
      data-testid="gl-kraa"
      data-etat={etat || ''}
    >
      <svg viewBox="0 0 32 32" className="gl-kraa__svg" focusable="false">
        <path
          className="gl-kraa__aile"
          d="M6 14 C 10 8, 16 8, 20 13 L 26 10 C 22 15, 19 17, 16 18 Z"
        />
        <ellipse className="gl-kraa__corps" cx="16" cy="19" rx="7" ry="5" />
        <circle className="gl-kraa__tete" cx="23" cy="14" r="3.2" />
        <path className="gl-kraa__bec" d="M25.5 14 L 29 15 L 25.5 16 Z" />
        <path className="gl-kraa__pattes" d="M13 24 L 12 28 M 18 24 L 19 28" />
      </svg>
    </div>
  );
}
