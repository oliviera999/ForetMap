import React from 'react';

/**
 * Empilement des commandes flottantes du coin bas-droit — partagé ForetMap + G&L.
 *
 * Les enfants ne se positionnent **pas** : ils sont posés dans un `flex` en
 * `column-reverse`, qui garantit leur ordre et leur espacement (voir
 * `src/shared/styles/floating-dock.css`). C'est ce qui supprime la classe de défaut plutôt
 * que de la régler au cas par cas — jusqu'ici chaque commande choisissait son `bottom` sans
 * connaître les autres, et deux d'entre elles se chevauchaient.
 *
 * Effet de bord voulu : une commande jusque-là **dans le flux** du contenu (le « ? » d'aide
 * de G&L) devient fixe, donc sa position ne dépend plus de la longueur de l'onglet affiché.
 *
 * Le dock ne rend rien quand il n'a aucun enfant : un conteneur fixe vide capterait le
 * pointeur sur une colonne entière pour ne rien afficher.
 */
export function FloatingDock({ children, className = '', label = 'Actions rapides' }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className={`fm-floating-dock ${className}`.trim()} role="group" aria-label={label}>
      {items}
    </div>
  );
}
