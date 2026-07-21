import React from 'react';
import { GLLoreGlossaryMarkdown } from '../GLLoreGlossaryMarkdown.jsx';
import { GLGlossaryMarkdown } from '../GLGlossaryMarkdown.jsx';
import { GLFeuilletIllustration } from '../GLFeuilletIllustration.jsx';

/**
 * Aperçu « comme le joueur le verra » d'un feuillet, en lecture seule, à afficher
 * à côté du formulaire d'édition admin. Miroir du reader joueur (GLSeleneCarnetView)
 * sans progression ni boutons : illustration, titre, incipit, corps, ancrage scientifique.
 *
 * @param {{ form: {
 *   feuillet_code?: string, titre?: string, incipit?: string, idee_cle?: string,
 *   texte_accessible?: string, texte?: string, ancrage_scientifique?: string,
 *   image_url?: string, image_coupe_url?: string,
 * } }} props
 */
export function GLFeuilletReaderPreview({ form }) {
  // Aucun contenu exploitable : on invite simplement à remplir le formulaire.
  if (!form || (!form.titre && !form.texte && !form.texte_accessible)) {
    return <p className="gl-hint">Aperçu vide — renseignez le contenu.</p>;
  }

  // Corps : on privilégie le texte accessible, sinon le texte narratif intégral.
  const body = form.texte_accessible || form.texte;

  return (
    <div className="gl-selene-carnet__reader gl-feuillet-preview">
      <GLFeuilletIllustration
        feuilletCode={form.feuillet_code || null}
        fallbackUrl={form.image_url}
        figureClassName="gl-selene-carnet__illu"
      />
      <h3>{form.titre}</h3>
      {form.incipit ? <p className="gl-selene-carnet__incipit">{form.incipit}</p> : null}
      {body ? (
        <GLLoreGlossaryMarkdown
          markdown={body}
          loreGlossaryItems={[]}
          onOpenLoreTerm={undefined}
          className="gl-selene-carnet__text"
        />
      ) : null}
      {form.ancrage_scientifique ? (
        <aside className="gl-selene-carnet__science">
          <h4>Ancrage scientifique</h4>
          <GLGlossaryMarkdown markdown={form.ancrage_scientifique} glossaryItems={[]} />
        </aside>
      ) : null}
    </div>
  );
}
