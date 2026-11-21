import { separerIdRequete } from '../../utils/glErreurTexte.js';

/**
 * Message d'erreur de la console : la phrase, puis l'identifiant de requête **en petit** quand
 * il y en a un (utile au support, inutile à la lecture). À poser dans une bannière d'erreur.
 */
export function GLErreurTexte({ message }) {
  const { texte, requete } = separerIdRequete(message);
  return (
    <>
      <span>{texte}</span>
      {requete ? (
        <small
          className="gl-erreur-requete"
          title="Identifiant de la requête, à donner si vous signalez le problème"
          data-testid="gl-erreur-requete"
        >
          {' '}
          requête {requete}
        </small>
      ) : null}
    </>
  );
}
