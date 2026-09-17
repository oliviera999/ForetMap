/**
 * Liens documentaires d'un lieu — affichage sur la fiche (carte de travail).
 *
 * La liste arrive déjà filtrée par le serveur (`projectLocationAudienceForViewer`) : ce qui
 * est ici est ce que ce lecteur a le droit de voir. Le cadenas ne cache donc rien, il
 * **informe l'auteur** que ce lien n'est pas vu par tout le monde — `audience_role_slugs`
 * n'est envoyé qu'aux gestionnaires, si bien qu'un élève ne voit jamais de cadenas.
 *
 * `is_external` est calculé côté serveur à partir de l'URL : c'est lui, et non une analyse
 * refaite ici, qui décide du nouvel onglet — une seule politique de lien pour l'application.
 */
export function LocationLinksBlock({ links, title = 'Liens' }) {
  const list = Array.isArray(links) ? links.filter((l) => l && l.url && l.label) : [];
  if (!list.length) return null;
  return (
    <div className="location-links-block">
      <strong className="location-links-block__title">{title}</strong>
      <ul className="location-links-block__list">
        {list.map((link) => {
          const restricted = Array.isArray(link.audience_role_slugs)
            ? link.audience_role_slugs.length > 0
            : false;
          return (
            <li key={link.id ?? `${link.label}-${link.url}`}>
              <a
                className="location-links-block__link"
                href={link.url}
                {...(link.is_external
                  ? {
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      'aria-label': `${link.label} (ouvre un nouvel onglet)`,
                    }
                  : {})}
              >
                {link.label}
              </a>
              {restricted ? (
                <span className="location-links-block__badge" title="Lien réservé à certains rôles">
                  🔒
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
