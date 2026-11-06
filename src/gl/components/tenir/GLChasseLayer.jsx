import { useMemo } from 'react';
import { GLKraaWitness } from './GLKraaWitness.jsx';

const VERDICT_LABELS = {
  froid: 'froid',
  tiede: 'tiède',
  chaud: 'chaud',
  zone: 'une page',
  deja_trouvee: 'déjà trouvée',
};

/**
 * Calque de chasse sur le plateau (« Tenir à deux », spec § 5) : empreintes des fouilles
 * (visibles de toute la classe), contours des pages révélées / pâlies / trouvées / tenues,
 * oiseau témoin. **Jamais de polygone** : le serveur ne sert que le centre des pages dont le
 * contour est public.
 */
export function GLChasseLayer({ carnet, teams = [], prefersReducedMotion = false }) {
  const teamColor = useMemo(() => {
    const map = new Map();
    for (const t of teams || []) map.set(Number(t.id), t.color || '#22c55e');
    return map;
  }, [teams]);
  if (!carnet) return null;
  const empreintes = Array.isArray(carnet.empreintes) ? carnet.empreintes : [];
  const contours = (carnet.pages || []).filter((p) => p.contour);
  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="gl-chasse-layer"
        data-testid="gl-chasse-layer"
        aria-hidden="true"
      >
        {contours.map((p) => (
          <circle
            key={`contour-${p.zoneKey}`}
            className={`gl-chasse-contour gl-chasse-contour--${p.etat}`}
            cx={Number(p.contour.x) * 100}
            cy={Number(p.contour.y) * 100}
            r="3.2"
            data-zone-key={p.zoneKey}
          />
        ))}
        {empreintes.map((e) => (
          <circle
            key={`empreinte-${e.id}`}
            className={`gl-chasse-empreinte gl-chasse-empreinte--${e.verdict}`}
            cx={Number(e.x) * 100}
            cy={Number(e.y) * 100}
            r="1.1"
            style={{ '--gl-team-color': teamColor.get(Number(e.teamId)) || '#64748b' }}
            data-verdict={e.verdict}
          >
            <title>{VERDICT_LABELS[e.verdict] || e.verdict}</title>
          </circle>
        ))}
      </svg>
      <GLKraaWitness kraa={carnet.kraa} prefersReducedMotion={prefersReducedMotion} />
    </>
  );
}
