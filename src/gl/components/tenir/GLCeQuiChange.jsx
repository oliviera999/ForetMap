import { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

/**
 * « Ce qui change » (ensemble unifié, M8) : au camp, trois lignes pour le chapitre suivant —
 * le peuple, les nouveaux sorts, le plateau. Tout vient du serveur
 * (`GET /tenir/ce-qui-change`, calculé depuis les sorts des chapitres et les réglages) ; rien
 * ne s'affiche au dernier plateau, ni si la lecture échoue.
 */
export function GLCeQuiChange({ gameId }) {
  const [lignes, setLignes] = useState(null);
  useEffect(() => {
    if (!gameId) return undefined;
    let annule = false;
    apiGL(`/api/gl/games/${gameId}/tenir/ce-qui-change`)
      .then((data) => {
        if (!annule) setLignes(data?.ceQuiChange?.lignes || null);
      })
      .catch(() => {
        if (!annule) setLignes(null);
      });
    return () => {
      annule = true;
    };
  }, [gameId]);
  if (!lignes?.length) return null;
  return (
    <section
      className="gl-ce-qui-change"
      aria-labelledby="gl-ce-qui-change-titre"
      data-testid="gl-ce-qui-change"
    >
      <h4 id="gl-ce-qui-change-titre">Ce qui change au prochain chapitre</h4>
      <ul>
        {lignes.map((l) => (
          <li key={l.cle} data-ligne={l.cle}>
            <strong>{l.titre}</strong> : {l.texte}
          </li>
        ))}
      </ul>
    </section>
  );
}
