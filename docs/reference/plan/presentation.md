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
   exemple), la **liste des lieux du groupe** s'ouvre en bas d'écran. Les noms des repères
   n'apparaissent qu'une fois zoomé, en commençant par les catégories prioritaires ; le nom
   du lieu sélectionné reste toujours affiché.
5. **La fiche d'un lieu.** Toucher un lieu sur le plan ou dans la liste ouvre une fiche en
   bas d'écran : nom, sous-titre, photo, description, horaires ou précisions. On la fait
   glisser vers le haut pour tout lire, vers le bas pour la refermer.
6. **Un message d'accueil**, affiché une seule fois par appareil, dont le texte est réglable.
7. **Un lien direct par lieu** : l'adresse de la page contient `?lieu=…` quand une fiche est
   ouverte. Ce lien peut être partagé ou transformé en QR code pour amener quelqu'un
   directement sur le bon lieu.

Le bouton **« Y aller »** est présent sur chaque fiche mais **désactivé** : la position du
visiteur sur le plan arrive dans un prochain lot. Il est affiché pour annoncer la
fonctionnalité, jamais pour la simuler.

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

- **L'ordre des catégories** sert de **priorité**. Une catégorie placée en tête est celle dont
  les repères sont nommés en premier et regroupés en dernier. Mettre les entrées et les
  bâtiments avant les sanitaires suffit à rendre un plan chargé lisible.
- **« Visible seulement au zoom »** retire les lieux de la catégorie tant que le plan est vu
  en entier. Ils réapparaissent dès qu'on zoome. C'est la case à cocher pour les sanitaires,
  les points d'eau, les locaux techniques.
- **Les catégories cochées d'office** (réglage d'établissement, ci-dessous) décident de ce qui
  est visible à la première ouverture. Un plan lisible commence par montrer peu.

Pour régler ces choix sur des données réelles plutôt qu'au jugé, un administrateur peut
demander un **rapport de densité** : nombre de repères par catégorie, cellules du plan qui en
contiennent plusieurs, et paires de repères pratiquement superposées. C'est un script de
lecture seule, lancé côté serveur (`scripts/report-marker-density.js`).

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

- **La position n'existe pas encore.** « Y aller » est désactivé et le restera jusqu'au lot
  dédié. Aucun itinéraire n'est calculé.
- **Le code d'accès n'est pas encore branché.** Le réglage `Mode d'accès` accepte la valeur
  `code`, mais la demande du code arrive dans un lot ultérieur : aujourd'hui le plan est
  public dès qu'on connaît l'adresse.
- **Un lieu masqué sur toutes les surfaces disparaît partout**, y compris de la carte des
  élèves. L'avertissement dans la fiche le signale, mais rien ne l'interdit.
