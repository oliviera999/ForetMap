import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Saisie des faces de dés physiques (`count` dés de 1 à 6) ou tirage serveur, et avance libre
 * du prof (1–12 cases, motif obligatoire). Composant feuille : `onLancer(body)` renvoie la
 * promesse de l'action.
 *
 * L'avance libre est une correction, pas un geste du tour : elle attend derrière « Corriger la
 * position… » (écrans de séance, K6) au lieu d'occuper chaque carte d'équipe en permanence.
 */
export function GLTourDesSaisie({
  count = 2,
  desMode = 'physique',
  allowLibre = false,
  disabled = false,
  onLancer,
}) {
  const [faces, setFaces] = useState(() => Array.from({ length: count }, () => 1));
  const [cases, setCases] = useState(1);
  const [motif, setMotif] = useState('');
  const [libreOuvert, setLibreOuvert] = useState(false);

  return (
    <div className="gl-tour-des" data-testid="gl-tour-des">
      {desMode === 'physique' ? (
        <form
          className="gl-inline-actions"
          onSubmit={(e) => {
            e.preventDefault();
            onLancer?.({ mode: 'physique', faces: faces.map(Number) });
          }}
        >
          {faces.map((f, idx) => (
            <label key={idx} className="gl-tour-des__face">
              <span className="gl-visually-hidden">Dé {idx + 1}</span>
              <select
                value={f}
                disabled={disabled}
                aria-label={`Dé ${idx + 1}`}
                onChange={(e) =>
                  setFaces((prev) => prev.map((v, i) => (i === idx ? Number(e.target.value) : v)))
                }
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <GLButton type="submit" disabled={disabled}>
            Saisir le jet ({faces.reduce((s, v) => s + Number(v), 0)})
          </GLButton>
        </form>
      ) : (
        <GLButton type="button" disabled={disabled} onClick={() => onLancer?.({ mode: 'serveur' })}>
          Lancer {count} dés
        </GLButton>
      )}
      {allowLibre && !libreOuvert ? (
        <GLButton
          type="button"
          variant="ghost"
          size="sm"
          className="gl-tour-des__corriger"
          aria-expanded="false"
          disabled={disabled}
          data-testid="gl-tour-corriger-position"
          onClick={() => setLibreOuvert(true)}
        >
          Corriger la position…
        </GLButton>
      ) : null}
      {allowLibre && libreOuvert ? (
        <form
          className="gl-inline-actions gl-tour-des__libre"
          data-testid="gl-tour-des-libre"
          onSubmit={async (e) => {
            e.preventDefault();
            // Correction faite : le formulaire se referme. Refusée, il garde la saisie.
            const fait = await onLancer?.({ mode: 'libre', cases: Number(cases), motif });
            if (fait) {
              setLibreOuvert(false);
              setMotif('');
            }
          }}
        >
          <label>
            Avance libre
            <input
              type="number"
              min={1}
              max={12}
              value={cases}
              disabled={disabled}
              onChange={(e) => setCases(e.target.value)}
            />
          </label>
          <input
            type="text"
            value={motif}
            disabled={disabled}
            placeholder="Motif (obligatoire)"
            aria-label="Motif de l’avance libre"
            onChange={(e) => setMotif(e.target.value)}
          />
          <GLButton
            type="submit"
            variant="secondary"
            disabled={disabled || motif.trim().length < 3}
          >
            Avancer
          </GLButton>
          <GLButton
            type="button"
            variant="ghost"
            onClick={() => {
              setLibreOuvert(false);
              setMotif('');
            }}
          >
            Annuler
          </GLButton>
        </form>
      ) : null}
    </div>
  );
}
