/**
 * Illustration d'une question QCM : image + mention de crédit/licence (et, en contexte
 * d'administration seulement, la légende saisie par le professeur).
 *
 * Deux règles délibérées, valables partout où une question est posée :
 *
 * - `alt` reste **vide**. Décrire l'image donnerait la réponse (« Quel est cet animal ? »
 *   sur une photo dont l'alternative textuelle dirait « Abeille ») ; l'énoncé, lui, est
 *   bien lu par les lecteurs d'écran.
 * - `photo_legende` n'est affichée **que** si `showLegende` est demandé. Dans le catalogue
 *   livré, cette légende est le plus souvent le nom du sujet photographié — donc la réponse.
 *   Elle est utile au professeur qui relit sa fiche, jamais à l'élève avant de répondre.
 */
export function QcmQuestionPhoto({
  presentation,
  showLegende = false,
  figureClassName = '',
  imgClassName = '',
  captionClassName = '',
}) {
  const url = presentation?.photoUrl;
  if (!url) return null;

  const credit = [presentation.photoCredit, presentation.photoLicence].filter(Boolean).join(' — ');
  const legende = showLegende ? String(presentation.photoLegende || '').trim() : '';

  return (
    <figure className={figureClassName || undefined}>
      <img src={url} alt="" className={imgClassName || undefined} />
      {legende || credit ? (
        <figcaption className={captionClassName || undefined}>
          {legende ? <span className="qcm-photo__legende">{legende}</span> : null}
          {legende && credit ? ' — ' : null}
          {credit || null}
        </figcaption>
      ) : null}
    </figure>
  );
}
