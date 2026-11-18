import { useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';

/**
 * Le Seuil — « Ma garde-robe » (ensemble unifié, M19).
 *
 * Une parure achetée au comptoir reste à l'élève toute l'année. Ici, il la pose sur la mascotte
 * de son équipe du moment — c'est ainsi qu'elle le suit quand les équipes changent — ou la
 * range. Elle ne s'échange pas et n'a aucun effet de jeu. Rien ne s'affiche tant que la
 * garde-robe est vide. Composant feuille : les données viennent de la vue du Seuil
 * (`gardeRobe`), le geste remonte par `onGeste(code, 'poser' | 'ranger')`.
 */
export function GLSeuilGardeRobe({ gardeRobe, onGeste }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const items = Array.isArray(gardeRobe?.parures) ? gardeRobe.parures : [];
  if (!items.length) return null;

  const geste = async (code, action) => {
    setBusy(code);
    setMessage('');
    try {
      await onGeste?.(code, action);
    } catch (err) {
      setMessage(err?.message || 'Ce geste n’a pas pu se faire. Réessaie.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section
      className="gl-seuil-grimoire gl-seuil-garde-robe"
      aria-labelledby="gl-seuil-garde-robe"
      data-testid="gl-seuil-garde-robe"
    >
      <h3 id="gl-seuil-garde-robe">Ma garde-robe</h3>
      <p className="gl-seuil-grimoire__intro">
        Tes parures sont à toi toute l’année. Pose-les sur la mascotte de ton équipe, ou range-les.
      </p>
      {gardeRobe?.peutPoser ? null : (
        <p className="gl-seuil-spell__status">
          Tu pourras les poser dès que ton équipe sera en route.
        </p>
      )}
      {message ? (
        <p className="gl-seuil-spell__message" role="status">
          {message}
        </p>
      ) : null}
      <ul className="gl-seuil-garde-robe__liste">
        {items.map((p) => (
          <li key={p.code} data-parure={p.code} data-posee={p.posee ? '1' : '0'}>
            <span>
              <strong>{p.nom}</strong>
              {p.rare ? <span className="gl-hint"> · rare</span> : null}
              {p.posee ? <span className="gl-hint"> · sur la mascotte</span> : null}
            </span>
            {gardeRobe?.peutPoser ? (
              <GLButton
                type="button"
                variant={p.posee ? 'ghost' : 'secondary'}
                size="sm"
                disabled={busy === p.code}
                onClick={() => geste(p.code, p.posee ? 'ranger' : 'poser')}
              >
                {p.posee ? 'Ranger' : 'Poser sur la mascotte'}
              </GLButton>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
