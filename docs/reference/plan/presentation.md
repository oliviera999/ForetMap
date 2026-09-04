# Plan Lyautey — présentation

> **Public visé : administrateurs et professeurs.** Aucune connaissance technique requise.

## À quoi sert le Plan Lyautey ?

Le **Plan Lyautey** (`planlyautey.olution.info`) est une application à part, très simple :
**un plan de l'établissement, sur téléphone, pour trouver un lieu**. Elle s'adresse aux
élèves, aux familles, aux visiteurs et aux nouveaux personnels.

Elle ne demande **aucun compte** et ne conserve **aucune donnée personnelle**. On l'ouvre,
on cherche, on trouve. Il n'y a ni tâche, ni validation, ni progression : ces choses-là
restent dans ForetMap et dans la Visite.

## Ce que voit un visiteur

1. **Le plan en plein écran.** On le déplace avec un doigt, on zoome à deux doigts ou avec
   les boutons `＋`, `－` et « Voir tout le plan » en bas à droite.
2. **Une barre de recherche en haut.** On tape un mot ; les lieux correspondants
   apparaissent dans une liste qui glisse depuis le bas de l'écran, sans cacher le plan.
   La recherche ignore les accents et les majuscules, et connaît les **autres noms** d'un
   lieu (chercher « bibliothèque » trouve le CDI).
3. **Des étiquettes de catégories** juste sous la recherche (Salles, Sport, Administration…).
   En toucher une n'affiche que les lieux de cette catégorie ; « Tout » remet tout.
   Le choix est retenu sur l'appareil pour la prochaine visite.
4. **Des lieux regroupés quand c'est trop dense.** Vu de loin, des repères qui se
   chevauchent sont remplacés par une **pastille chiffrée**. La toucher zoome sur le groupe ;
   si les lieux sont exactement au même endroit (deux salles d'un même bâtiment, par
   exemple), la **liste des lieux du groupe** s'ouvre en bas d'écran.
5. **Des noms qui ne se marchent jamais dessus.** Tous les noms — bâtiments comme repères —
   sont candidats à l'affichage dès la vue d'ensemble. Quand deux d'entre eux se
   recouvriraient, seul le plus important est écrit : d'abord le lieu dont la fiche est
   ouverte, puis l'ordre des catégories (voir « Rendre le plan lisible »), puis le plus grand
   bâtiment. Les noms masqués **réapparaissent d'eux-mêmes en zoomant**, sans réglage : les
   étiquettes gardent la même taille à l'écran, c'est le plan qui s'écarte sous elles. Un nom
   trop long pour son bâtiment est raccourci par des points de suspension ; la fiche du lieu
   en donne toujours le nom complet.
6. **La fiche d'un lieu.** Toucher un lieu sur le plan ou dans la liste ouvre une fiche en
   bas d'écran : nom, sous-titre, photo, description, horaires ou précisions. On la fait
   glisser vers le haut pour tout lire, vers le bas pour la refermer.
7. **Un message d'accueil**, affiché une seule fois par appareil, dont le texte est réglable.
8. **Un lien direct par lieu** : l'adresse de la page contient `?lieu=…` quand une fiche est
   ouverte, et la fiche affiche ce lien en toutes lettres. Il peut être partagé ou transformé
   en QR code pour amener quelqu'un directement sur le bon lieu.

### Se situer sur le plan

Quand le plan est **calé** (un professeur a posé ses points de repère GPS, voir la
documentation ForetMap), un bouton **« Me situer »** apparaît en bas à droite. Il a quatre
états successifs :

1. **inactif** : rien n'est affiché ;
2. **recherche** : le navigateur demande la position ;
3. **position affichée** : un point bleu, entouré d'un **halo** d'autant plus large que le
   signal est imprécis, et d'une flèche de direction si le téléphone a une boussole ;
4. **suivi** : la carte se recentre à chaque nouvelle position. Déplacer la carte à la main
   quitte le suivi sans éteindre le point.

Si le visiteur est **hors du plan**, le point ne disparaît pas : il se colle au bord le plus
proche avec une flèche vers l'endroit réel. Les messages d'état (autorisation refusée, signal
faible, calage incohérent, hors plan) s'affichent en petit message passager, pas en bandeau.

Le bouton **« Y aller »** d'une fiche trace alors une **ligne droite** entre la position et le
lieu, et affiche la distance. Ce n'est pas un itinéraire : le plan ne connaît pas encore les
chemins de l'établissement, et une direction honnête vaut mieux qu'un trajet inventé. Sans
calage, le bouton reste désactivé et dit pourquoi.

La position est calculée **dans le téléphone** et n'est jamais envoyée au serveur.

## Ce que voit un professeur (dans ForetMap)

Le plan n'a **pas de console à lui**. Tout se règle depuis ForetMap, sur les lieux que
l'établissement décrit déjà.

### Choisir où apparaît un lieu

Un même lieu peut être montré sur trois « surfaces » :

| Surface    | Où c'est                                     |
| ---------- | -------------------------------------------- |
| **Carte**  | la carte de travail des élèves dans ForetMap |
| **Visite** | la visite guidée grand public                |
| **Plan**   | le Plan Lyautey                              |

Deux réglages se combinent :

- **Par catégorie** — dans _Réglages → Catégories de lieux_, chaque catégorie porte une case
  par surface (« Visible sur »). Décocher **Plan** pour la catégorie « Cultures » retire d'un
  coup toutes les cultures du plan de l'établissement, sans toucher à la carte des élèves.
- **Par lieu** — dans la fiche d'une zone ou d'un repère, onglet _Modifier_, un bloc
  « Masquer sur » permet de retirer **ce lieu précis** d'une surface, quelle que soit sa
  catégorie. Un avertissement s'affiche si toutes les surfaces sont cochées : le lieu ne
  serait alors visible nulle part.

Un lieu **sans catégorie** reste visible partout où il n'est pas explicitement masqué.

### Donner d'autres noms à un lieu

La même fiche _Modifier_ propose un champ **« Alias de recherche »** : les autres noms sous
lesquels on cherche ce lieu, séparés par des points-virgules (`CDI ; bibliothèque ; docs`).
Ces mots ne sont pas affichés sur le plan ; ils servent uniquement à ce que la recherche
trouve le lieu. C'est le réglage le plus utile pour un plan d'établissement : chacun appelle
les lieux autrement.

### Textes affichés sur le plan

Le plan réutilise les **textes publics** déjà saisis pour la Visite (sous-titre, accroche,
titre et texte du bloc dépliable) ainsi que la première photo du lieu. Écrire une fois sert
donc aux deux produits. Rien de ce qui est réservé aux élèves (espèces, historique de
culture, commentaires) ne sort sur le plan.

### Rendre le plan lisible quand il est dense

Trois réglages, dans _Réglages → Catégories de lieux_ :

- **L'ordre des catégories** sert de **priorité**. Quand deux noms se disputent la même place,
  celui de la catégorie placée en tête est écrit et l'autre attend le zoom ; c'est aussi la
  catégorie regroupée en dernier. Mettre les entrées et les bâtiments avant les sanitaires
  suffit à rendre un plan chargé lisible. Un lieu **sans catégorie** prend un rang
  intermédiaire : il passe après les catégories de tête, mais devant les catégories de détail.
- **« Visible seulement au zoom »** retire les lieux de la catégorie tant que le plan est vu
  en entier. Ils réapparaissent dès qu'on zoome. C'est la case à cocher pour les sanitaires,
  les points d'eau, les locaux techniques.
- **Les catégories cochées d'office** (réglage d'établissement, ci-dessous) décident de ce qui
  est visible à la première ouverture. Un plan lisible commence par montrer peu.

Une étiquette de catégorie **sans aucun lieu** n'est pas proposée au visiteur (elle ne ferait
que vider la carte) ; si un choix mémorisé sur l'appareil ne laisse plus rien à voir, le plan
le dit et propose « Tout afficher ».

Enfin, l'emoji saisi **en tête du nom** d'un lieu (« 📚 CDI ») est reconnu comme tel : il est
dessiné une fois, au-dessus du nom, et pas deux. Il n'y a rien à changer aux noms existants.

Pour régler ces choix sur des données réelles plutôt qu'au jugé, un administrateur peut
demander un **rapport de densité** : nombre de repères par catégorie, cellules du plan qui en
contiennent plusieurs, et paires de repères pratiquement superposées. C'est un script de
lecture seule, lancé côté serveur (`scripts/report-marker-density.js`).

### Les parcours

Un **parcours** est une liste ordonnée de lieux : « le tour des nouveaux professeurs », « la
visite des portes ouvertes ». Sur le plan, une puce **« Parcours »** liste ceux publiés ; en
choisir un affiche l'étape courante en bas d'écran, avec « Précédent » et « Suivant ». La carte
recadre sur chaque étape, et « Y aller » vise l'étape en cours.

Rien n'est enregistré : personne ne coche, personne n'est suivi. On peut sauter une étape ou
quitter le parcours à tout moment. Un lien direct par parcours (`?parcours=…`) permet d'imprimer
un **QR code** à l'accueil : le visiteur scanne et démarre le parcours.

Les parcours se créent dans ForetMap, dans _Réglages → Parcours_ (voir la documentation de la
carte) : on cherche les lieux, on les ordonne au glisser-déposer, on publie. Le bouton
**« Affiche PDF »** produit la page imprimable avec la liste des étapes et ce QR code.

### Le plan hors ligne

Le plan est une application installable : une fois ouvert, il garde en mémoire la carte, les
lieux et les parcours. Sans réseau, il s'affiche quand même avec les dernières données connues
et un bandeau **« Hors ligne — plan mémorisé »**. C'est ce qui le rend utilisable dans un
bâtiment où le téléphone ne capte pas.

### Aide intégrée

Un bouton **« ? »** en haut à droite du plan ouvre une aide courte : chercher un lieu,
filtrer, se déplacer sur la carte, comprendre les pastilles chiffrées, et se situer quand le
plan est calé. Le bouton attire discrètement l'œil tant que l'aide n'a jamais été ouverte sur
l'appareil, puis se calme. C'est le même mécanisme d'aide que dans ForetMap et dans Gnomes &
Licornes.

### Réglages d'établissement

Dans _Réglages_, section du plan (portée publique) :

| Réglage                     | Effet                                                                          |
| --------------------------- | ------------------------------------------------------------------------------ |
| Carte du plan               | quel plan est affiché par défaut                                               |
| Titre                       | le titre en haut de l'écran                                                    |
| Message d'accueil           | la phrase montrée une fois par appareil                                        |
| Mention de source           | petite mention en bas du plan (origine du fond de carte)                       |
| Catégories cochées d'office | les étiquettes actives à la première ouverture                                 |
| Catégories masquées         | catégories jamais proposées sur le plan                                        |
| Mode d'accès                | `public` (par défaut) ou `code` — le code d'accès arrive dans un lot ultérieur |

## Vie privée

Le plan n'a ni compte, ni cookie de suivi, ni identifiant d'appareil. Seuls trois
**compteurs anonymes** sont incrémentés, sans jamais dire qui : ouverture du plan,
ouverture d'un lieu, et recherche restée sans résultat. Ce dernier est le plus utile : il
dit quels mots les gens emploient et que le plan ne connaît pas encore — donc quels
**alias de recherche** ajouter.

## ⚠️ Points d'attention

- **Aucun itinéraire n'est calculé.** « Y aller » donne une direction à vol d'oiseau et une
  distance, pas un chemin : les couloirs, les escaliers et les portes ne sont pas connus du
  plan.
- **Sans calage GPS, pas de position.** Le bouton « Me situer » n'apparaît pas tant qu'un
  professeur n'a pas posé les points de repère du plan.
- **En intérieur, le signal est mauvais.** Le halo le dit honnêtement ; les QR codes aux
  portes restent le moyen le plus fiable de savoir où l'on est.
- **Le code d'accès n'est pas un mot de passe.** Il est court, partagé, et retenu 30 jours par
  appareil : il décourage la diffusion large, il ne protège pas des données sensibles — et le
  plan n'en contient pas.
- **Un lieu masqué sur toutes les surfaces disparaît partout**, y compris de la carte des
  élèves. L'avertissement dans la fiche le signale, mais rien ne l'interdit.
