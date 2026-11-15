import { useEffect, useMemo, useState } from 'react';
import {
  EVIDENCE_HYPOTHESIS_DASH,
  EVIDENCE_HYPOTHESIS_OPACITY,
} from '../../../shared/foodWebEdgeStyle.js';

/**
 * Trait d'un lien « incertain » : la convention du réseau trophique de l'app (tirets courts et
 * espacés, trait atténué) sert ici au lien « à discuter » et au lien révélé par un indice.
 */
const TRAIT_INCERTAIN = Object.freeze({
  strokeDasharray: EVIDENCE_HYPOTHESIS_DASH,
  opacity: EVIDENCE_HYPOTHESIS_OPACITY,
});
const estIncertain = (classement) => classement === 'a_discuter' || classement === 'suggestion';

/** Pictogramme et libellé d'un classement : rien n'est porté par la couleur seule. */
export const TRAME_CLASSEMENT_UI = Object.freeze({
  trouvee: { picto: '✓', label: 'Lien trouvé' },
  inversee: { picto: '⇄', label: 'Regarde le sens' },
  a_discuter: { picto: '💬', label: 'À discuter' },
  fixe: { picto: '→', label: 'Lien du réseau' },
});

const ROLE_UI = Object.freeze({
  producteur: { picto: '🌿', label: 'plante' },
  consommateur: { picto: '🐾', label: 'animal' },
  decomposeur: { picto: '🍄', label: 'décomposeur' },
  fil: { picto: '🧵', label: 'fil' },
});

/** Largeur sous laquelle le plateau passe en liste (« relier à… ») : téléphone. */
export const TRAME_LISTE_MAX_PX = 640;

function useModeListe(force) {
  const [liste, setListe] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(`(max-width: ${TRAME_LISTE_MAX_PX}px)`).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(`(max-width: ${TRAME_LISTE_MAX_PX}px)`);
    const onChange = (e) => setListe(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return force == null ? liste : force === 'liste';
}

/** Cartes disposées en ovale : positions en pourcentage du plateau (aucun glisser-déposer). */
export function dispositionEnOvale(codes) {
  const n = Math.max(1, codes.length);
  const out = {};
  codes.forEach((code, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    out[code] = { x: 50 + 40 * Math.cos(angle), y: 50 + 38 * Math.sin(angle) };
  });
  return out;
}

function Carte({ carte, selectionnee, grisee, onToucher, disabled, compacte = false, children }) {
  const role = ROLE_UI[carte.role] || null;
  // Photo qui ne charge pas (Wi-Fi de la classe) : le pictogramme du rôle prend sa place.
  const [photoKo, setPhotoKo] = useState(false);
  return (
    <div className={`gl-trame-carte${grisee ? ' is-grisee' : ''}`}>
      <button
        type="button"
        className={`gl-trame-carte__bouton${selectionnee ? ' is-selectionnee' : ''}`}
        aria-pressed={selectionnee}
        disabled={disabled || grisee}
        onClick={() => onToucher?.(carte.code)}
        data-testid={`gl-trame-carte-${carte.code}`}
      >
        {carte.photoUrl && !photoKo ? (
          <img
            className="gl-trame-carte__photo"
            src={carte.photoUrl}
            alt=""
            loading="lazy"
            onError={() => setPhotoKo(true)}
          />
        ) : role ? (
          <span className="gl-trame-carte__picto" aria-hidden="true">
            {role.picto}
          </span>
        ) : null}
        <span className="gl-trame-carte__nom">{carte.nom}</span>
        {role && carte.role !== 'fil' ? (
          <span className="gl-trame-carte__role gl-hint">{role.label}</span>
        ) : null}
      </button>
      {carte.precision ? (
        <span className="gl-trame-carte__precision gl-hint">{carte.precision}</span>
      ) : null}
      {!compacte && carte.photoCredit ? (
        <span className="gl-trame-carte__credit gl-hint">Photo : {carte.photoCredit}</span>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Plateau de cartes des défis de la Trame (Retisser, La trame altérée, Les fils cachés).
 *
 * Une flèche se pose par **appui sur la carte de départ, puis sur la carte d'arrivée** (au doigt
 * comme au clavier) et se retire par appui. Chaque flèche porte un pictogramme et un libellé
 * selon son classement ; « à discuter » garde une teinte neutre — jamais de rouge. Le compteur
 * dit les liens trouvés, **sans total**.
 *
 * Deux présentations : plateau libre (tablette, projection) et liste « relier à… » (téléphone).
 *
 * @param {object} p
 * @param {Array} p.cartes `{ code, nom, role, photoUrl?, photoCredit?, precision? }`
 * @param {Array} p.fleches `{ de, vers, classement, message }` (flèches de l'élève, classées)
 * @param {Array} [p.liensFixes] `{ de, vers }` du réseau donné tissé (trame altérée)
 * @param {(de: string, vers: string) => void} [p.onAjouter]
 * @param {(de: string, vers: string) => void} [p.onRetirer]
 * @param {string} [p.grisee] code de la carte retirée
 * @param {{ de: string, vers: string }|null} [p.suggestion] lien révélé par un indice (pointillés)
 * @param {'plateau'|'liste'|null} [p.mode] force une présentation (sinon : selon la largeur)
 * @param {(carte: object) => import('react').ReactNode} [p.sousCarte] contenu sous chaque carte
 */
export function GLTrameBoard({
  cartes = [],
  fleches = [],
  liensFixes = [],
  onAjouter = null,
  onRetirer = null,
  grisee = null,
  suggestion = null,
  mode = null,
  sousCarte = null,
  flecheLabel = 'est mangé par',
  disabled = false,
}) {
  const liste = useModeListe(mode);
  const [depart, setDepart] = useState(null);
  const [annonce, setAnnonce] = useState('');
  const nom = useMemo(() => new Map(cartes.map((c) => [c.code, c.nom])), [cartes]);
  const positions = useMemo(() => dispositionEnOvale(cartes.map((c) => c.code)), [cartes]);
  const lecture = !onAjouter;
  // Demi-emprise d'une carte, en pourcentage du plateau (cartes plus petites à partir de 8).
  const demi = cartes.length > 7 ? { x: 10, y: 9 } : { x: 11.5, y: 13 };
  const credits = cartes.filter((c) => c.photoCredit);
  const trouvees = fleches.filter((f) => f.classement === 'trouvee').length;

  // Le classement d'une flèche arrive du serveur : il est dit à voix haute (aria-live).
  const derniere = fleches[fleches.length - 1] || null;
  const cleDerniere = derniere
    ? `${derniere.de}>${derniere.vers}:${derniere.classement}:${fleches.length}`
    : '';
  useEffect(() => {
    if (!derniere?.classement) return;
    setAnnonce(
      `${nom.get(derniere.de) || derniere.de} → ${nom.get(derniere.vers) || derniere.vers} : ${derniere.message || ''}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleDerniere]);

  const toucher = (code) => {
    if (lecture) return;
    if (depart == null) {
      setDepart(code);
      setAnnonce(`${nom.get(code)} : choisis maintenant la carte d’arrivée.`);
      return;
    }
    if (depart === code) {
      setDepart(null);
      setAnnonce('Départ annulé.');
      return;
    }
    onAjouter(depart, code);
    setDepart(null);
  };

  const toutes = [
    ...liensFixes.map((l) => ({ ...l, classement: 'fixe' })),
    ...fleches.filter((f) => TRAME_CLASSEMENT_UI[f.classement]),
  ];

  return (
    <div
      className={`gl-trame-board${liste ? ' is-liste' : ' is-plateau'}`}
      data-testid="gl-trame-board"
      data-mode={liste ? 'liste' : 'plateau'}
    >
      {!lecture ? (
        <p className="gl-trame-board__compteur" data-testid="gl-trame-trouvees">
          Liens trouvés : <strong>{trouvees}</strong>
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" data-testid="gl-trame-annonce">
        {annonce}
      </p>

      {liste ? (
        <ul className="gl-trame-liste">
          {cartes.map((carte) => {
            const sortantes = toutes.filter((f) => f.de === carte.code);
            return (
              <li key={carte.code} className="gl-trame-liste__ligne">
                <Carte carte={carte} grisee={grisee === carte.code} disabled>
                  {sousCarte ? sousCarte(carte) : null}
                </Carte>
                <ul className="gl-trame-liste__fleches">
                  {sortantes.map((f) => (
                    <li key={`${f.de}>${f.vers}`} className={`gl-trame-fleche is-${f.classement}`}>
                      <span aria-hidden="true">{TRAME_CLASSEMENT_UI[f.classement].picto}</span>{' '}
                      {flecheLabel} <strong>{nom.get(f.vers)}</strong>
                      {f.classement !== 'fixe' ? (
                        <span className="gl-hint"> — {f.message}</span>
                      ) : null}
                      {!lecture && f.classement !== 'fixe' ? (
                        <button
                          type="button"
                          className="gl-trame-fleche__retirer"
                          onClick={() => onRetirer?.(f.de, f.vers)}
                          aria-label={`Retirer la flèche de ${nom.get(f.de)} vers ${nom.get(f.vers)}`}
                        >
                          retirer
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {!lecture && grisee !== carte.code ? (
                  <label className="gl-trame-liste__relier">
                    <span>relier à…</span>
                    <select
                      value=""
                      disabled={disabled}
                      onChange={(event) => {
                        if (event.target.value) onAjouter(carte.code, event.target.value);
                      }}
                      data-testid={`gl-trame-relier-${carte.code}`}
                    >
                      <option value="">choisir une carte</option>
                      {cartes
                        .filter((c) => c.code !== carte.code)
                        .map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.nom}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="gl-trame-plateau" data-dense={cartes.length > 7 ? 'true' : undefined}>
          <svg
            className="gl-trame-plateau__fleches"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              {['fixe', 'trouvee', 'inversee', 'a_discuter', 'suggestion'].map((k) => (
                <marker
                  key={k}
                  id={`gl-trame-pointe-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className={`gl-trame-pointe is-${k}`} />
                </marker>
              ))}
            </defs>
            {[...toutes, ...(suggestion ? [{ ...suggestion, classement: 'suggestion' }] : [])].map(
              (f) => {
                const a = positions[f.de];
                const b = positions[f.vers];
                if (!a || !b) return null;
                // La flèche part du bord de la carte et s'arrête au bord de l'autre : la pointe,
                // qui dit le sens, n'est jamais cachée sous une carte.
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const t = Math.min(
                  0.45,
                  demi.x / (Math.abs(dx) || 1e-6),
                  demi.y / (Math.abs(dy) || 1e-6),
                );
                return (
                  <line
                    key={`${f.de}>${f.vers}:${f.classement}`}
                    x1={a.x + dx * t}
                    y1={a.y + dy * t}
                    x2={b.x - dx * t}
                    y2={b.y - dy * t}
                    className={`gl-trame-trait is-${f.classement}`}
                    style={estIncertain(f.classement) ? TRAIT_INCERTAIN : undefined}
                    markerEnd={`url(#gl-trame-pointe-${f.classement})`}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              },
            )}
          </svg>
          {cartes.map((carte) => (
            <div
              key={carte.code}
              className="gl-trame-plateau__case"
              style={{ left: `${positions[carte.code].x}%`, top: `${positions[carte.code].y}%` }}
            >
              <Carte
                carte={carte}
                selectionnee={depart === carte.code}
                grisee={grisee === carte.code}
                onToucher={toucher}
                disabled={disabled || lecture}
                compacte
              />
            </div>
          ))}
        </div>
      )}

      {/* Sur le plateau, ce qui va « sous la carte » est rangé dessous : rien ne se chevauche. */}
      {!liste && sousCarte ? (
        <ul className="gl-trame-sous-cartes">
          {cartes.map((carte) => (
            <li
              key={carte.code}
              className={`gl-trame-sous-cartes__ligne${grisee === carte.code ? ' is-grisee' : ''}`}
            >
              <strong>{carte.nom}</strong>
              {sousCarte(carte)}
            </li>
          ))}
        </ul>
      ) : null}

      {!liste && fleches.length ? (
        <ul className="gl-trame-legende" aria-label="Flèches posées">
          {fleches
            .filter((f) => TRAME_CLASSEMENT_UI[f.classement])
            .map((f) => (
              <li key={`${f.de}>${f.vers}`} className={`gl-trame-fleche is-${f.classement}`}>
                <span aria-hidden="true">{TRAME_CLASSEMENT_UI[f.classement].picto}</span>{' '}
                <strong>{nom.get(f.de)}</strong> → <strong>{nom.get(f.vers)}</strong>
                <span className="gl-hint"> — {f.message}</span>
                {!lecture ? (
                  <button
                    type="button"
                    className="gl-trame-fleche__retirer"
                    onClick={() => onRetirer?.(f.de, f.vers)}
                    aria-label={`Retirer la flèche de ${nom.get(f.de)} vers ${nom.get(f.vers)}`}
                  >
                    retirer
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}
      {!liste && credits.length ? (
        <p className="gl-trame-carte__credit gl-hint" data-testid="gl-trame-credits">
          Photos : {credits.map((c) => `${c.nom} — ${c.photoCredit}`).join(' ; ')}
        </p>
      ) : null}
      {!liste && suggestion ? (
        <p className="gl-hint" data-testid="gl-trame-suggestion">
          En pointillés : un lien à tracer toi-même, de {nom.get(suggestion.de)} vers{' '}
          {nom.get(suggestion.vers)}.
        </p>
      ) : null}
    </div>
  );
}
