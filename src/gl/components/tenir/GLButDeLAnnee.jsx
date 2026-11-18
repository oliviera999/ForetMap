/**
 * Le but de l'année (ensemble unifié, M19) : la Consécration, visible **grisée** dès le
 * chapitre 1, avec son prix. Ce n'est pas un bouton : rien ne s'y lance. Elle dit seulement
 * vers quoi la bourse de gemmes, gardée toute l'année, peut aller. Aucun solde affiché.
 *
 * @param {{ code, nom, emoji, cout, ouverte }|null} but servi par le serveur (`butDeLAnnee`)
 */
export function GLButDeLAnnee({ but }) {
  if (!but?.nom) return null;
  return (
    <div
      className="gl-but-annee"
      data-testid="gl-but-annee"
      data-sort={but.code}
      aria-label={`But de l’année : ${but.nom}, ${but.cout} gemmes`}
    >
      <span className="gl-but-annee__titre">
        <span className="foretmap-emoji-text-mixed" aria-hidden="true">
          {but.emoji || '🏅'}
        </span>{' '}
        {but.nom} · {but.cout} 💎
      </span>
      <span className="gl-hint gl-but-annee__texte">
        {' '}
        {but.ouverte
          ? 'Le but de l’année : elle se demande au troisième trimestre, nous y sommes.'
          : 'Le but de l’année : elle s’ouvre au troisième trimestre.'}
      </span>
    </div>
  );
}
