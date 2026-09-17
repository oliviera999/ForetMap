# Plan Lyautey — présentation

> **Public visé : administrateurs et professeurs.** Aucune connaissance technique requise.

## À quoi sert le Plan Lyautey ?

Le **Plan Lyautey** (`planlyautey.olution.info`) est une application à part, très simple :
**un plan de l'établissement, sur téléphone, pour trouver un lieu**. Elle s'adresse aux
élèves, aux familles, aux visiteurs et aux nouveaux personnels.

> **Il existe une seconde version de ce plan, réservée aux personnels** :
> [`proflyautey`](plan-des-personnels.md). Même carte, mêmes fiches, mais elle montre en plus
> les lieux retirés d'ici et les compléments réservés. Ce document-ci décrit ce que voit
> **le public**.

Elle ne demande **aucun compte** et ne conserve **aucune donnée personnelle**. On l'ouvre,
on cherche, on trouve. Il n'y a ni tâche, ni validation, ni progression : ces choses-là
restent dans ForetMap et dans la Visite. L’administrateur peut toutefois consulter des
**compteurs anonymes** de fréquentation (ouvertures, recherches sans résultat…) dans le
suivi d’usage du monorepo — sans jamais identifier un visiteur du plan.

Dans l'onglet du navigateur (et si on installe le plan sur l'écran d'accueil), l'icône
reprend la **charte graphique du Lycée Lyautey** : fond bleu marine et monogramme en traits
légers. L’interface (barre haute, boutons, puces) suit les mêmes bleus. Le **logo officiel**
du lycée apparaît discrètement en bas à gauche du plan.

## Ce que voit un visiteur

1. **Le plan en plein écran.** On le déplace avec un doigt, on zoome à deux doigts ou avec
   les boutons `＋`, `－` et « Voir tout le plan » en bas à droite.
2. **Une barre de recherche en haut.** On tape un mot ; les lieux correspondants
   apparaissent dans une liste qui glisse depuis le bas de l'écran, sans cacher le plan —
   **le plan reste manipulable et le champ garde le curseur** : on peut corriger sa saisie
   sans refermer la liste. La recherche ignore les accents et les majuscules, connaît les
   **autres noms** d'un lieu (les alias saisis par l'établissement) et comprend le
   **vocabulaire courant** : « wc » ou « toilettes » trouvent les _Sanitaires_, « cantine »
   la _Cafétéria_, « bibliothèque » le _CDI_, « photocopie » la _Reprographie_. Elle porte
   sur **tous** les lieux du plan, même ceux qu'un filtre de catégorie masque : un tel
   résultat est signalé « masqué par vos filtres » et s'ouvre quand même, le lieu
   réapparaissant alors sur la carte. Quand un résultat ne vient ni du nom ni d'un alias, la
   liste le dit (« trouvé dans la description »).
3. **Des étiquettes de catégories** juste sous la recherche (Salles, Sport, Administration…),
   dans la même rangée que la puce **Parcours** s'il y en a. En toucher une n'affiche que
   les lieux de cette catégorie ; « Tout » remet tout. Le choix est retenu sur l'appareil
   pour la prochaine visite. Comme la rangée peut être longue, un bouton **« Filtres »**
   ouvre la **liste complète des catégories**, avec le nombre de lieux de chacune et le
   nombre de lieux affichés ; le chiffre porté par le bouton rappelle combien de filtres
   sont actifs. Les lieux **sans catégorie** (entrées, loge, repères de service) restent
   affichés quel que soit le filtre : aucune case à cocher ne pourrait les ramener.
4. **Des lieux regroupés quand c'est trop dense.** Vu de loin, des repères qui se
   chevauchent sont remplacés par une **pastille chiffrée**. La toucher zoome sur le groupe ;
   si les lieux sont exactement au même endroit (deux salles d'un même bâtiment, par
   exemple), la **liste des lieux du groupe** s'ouvre en bas d'écran.
5. **Des noms qui ne se marchent jamais dessus.** Tous les noms — bâtiments comme repères —
   sont écrits **de la même façon** (même police, même taille, même halo) et sont candidats
   à l'affichage dès la vue d'ensemble. Quand deux d'entre eux se recouvriraient, seul le
   plus important est écrit : d'abord le lieu dont la fiche est ouverte, puis l'ordre des
   catégories (voir « Rendre le plan lisible »), puis le plus grand bâtiment. Les noms
   masqués **réapparaissent d'eux-mêmes en zoomant**, sans réglage : les étiquettes gardent
   la même taille à l'écran, c'est le plan qui s'écarte sous elles. Un nom qui ne tient pas
   sur une ligne passe sur **deux lignes** plutôt que de finir en points de suspension ;
   au-delà, il est raccourci et la fiche du lieu en donne toujours le nom complet. Le nom
   écrit sur le plan est aussi une **cible tactile** : le toucher ouvre son lieu, ce qui rend
   les petits bâtiments atteignables au pouce.
6. **La fiche d'un lieu.** Toucher un lieu sur le plan ou dans la liste ouvre une fiche en
   bas d'écran : nom, sous-titre, photo, description, horaires ou précisions. Elle s'ouvre à
   **mi-hauteur**, assez haut pour qu'on lise l'essentiel sans rien faire ; on la fait
   glisser vers le haut pour tout lire, vers le bas pour la réduire puis la refermer.
   **Le plan reste vivant derrière elle** : on peut le déplacer et le zoomer sans fermer la
   fiche, et les commandes de la carte remontent au-dessus d'elle dès qu'il y a la place.
   Pour une **zone**, celle-ci reste mise en avant sur le plan et les autres zones
   s'estompent un peu tant que la fiche est ouverte.
7. **Un message d'accueil**, affiché une seule fois par appareil, dont le texte est réglable.
   Il apparaît **en haut de la carte**, pour ne masquer ni les commandes de zoom ni l'échelle.
8. **Un lien direct par lieu** : l'adresse de la page contient `?lieu=…` quand une fiche est
   ouverte, et la fiche affiche ce lien en toutes lettres. Il peut être partagé ou transformé
   en QR code pour amener quelqu'un directement sur le bon lieu.

### Se situer sur le plan

Quand le plan est **calé** (un professeur a posé ses points de repère GPS, voir la
documentation ForetMap), un bouton **« Me situer »** apparaît en bas à droite. Il a quatre
états successifs :

1. **inactif** : rien n'est affiché ;
2. **recherche** : le navigateur demande la position ;
3. **position affichée** : un repère bleu entouré d'un **halo** d'autant plus large que le
   signal est imprécis. Le repère prend la forme d'une **flèche orientée vers là où l'on va**
   dès qu'une direction est connue — la route suivie quand on marche, la boussole du téléphone
   quand on est à l'arrêt. Sans aucune direction exploitable (ni boussole, ni marche), il reste
   un **disque** : mieux vaut ne rien dire qu'indiquer un côté au hasard ;
4. **suivi** : la carte **glisse** en continu pour garder le repère au centre, au lieu de sauter
   à chaque nouvelle mesure. Déplacer la carte à la main quitte le suivi sans éteindre le
   repère.

Le repère ne tremble plus à l'arrêt : les mesures du téléphone sont **lissées** avant d'être
affichées, et un saut impossible à pied (un « téléport » de cent mètres sur un reflet de signal)
est écarté au lieu d'emporter la carte avec lui. La contrepartie est assumée : quand on se
remet à marcher, le repère peut avoir un ou deux mètres de retard le temps de reprendre la
mesure exacte.

Quand l'établissement l'autorise (réglage Plan **et** case sur la carte dans le calage GPS),
un bouton **« Orienter »** apparaît à côté de « Me situer » une fois la position active. Il fait
**tourner le plan** pour que la direction suivie pointe vers le haut de l'écran (route GPS en
marche, boussole à l'arrêt). La rotation est **continue** : le plan pivote doucement au lieu de
sauter d'un cap à l'autre à chaque frémissement de la boussole.
Tant qu'il est actif, la vue **reste centrée sur votre position** et **grossit un peu** pour
que le plan tourné remplisse l'écran (pas de bandes vides sur les côtés). Chacun peut le couper ;
le choix est retenu sur l'appareil. Sans boussole exploitable, le bouton
reste inactif. En intérieur, la boussole peut être fantaisiste : mieux vaut alors s'en passer.
**Les noms restent droits** quand le plan tourne : seul le fond de plan pivote, les étiquettes
et les pastilles se redressent d'elles-mêmes et restent lisibles quel que soit le cap.

Dès que le plan est **calé** (points GPS posés), une **barre d'échelle** et une **rose des
vents** s'affichent en bas à gauche — sans avoir besoin d'activer « Me situer ». Chacun peut
les masquer via le bouton dédié ; le professeur peut aussi les couper pour cette carte dans le
calage GPS.

> **Points d'attention.** Sur iPhone, le navigateur demande une permission pour la boussole au
> premier « Me situer ». L'orientation ne remplace pas un itinéraire : elle aide à lire le plan
> dans le sens de la marche. Si l'appareil est réglé en **mouvement réduit**, la carte se pose
> directement sur la position au lieu d'y glisser : c'est le réglage du téléphone qui est
> respecté, pas une panne.

Si le visiteur est **hors du plan**, le point ne disparaît pas : il se colle au bord le plus
proche avec une flèche vers l'endroit réel. Les messages d'état (autorisation refusée, signal
faible, calage incohérent, hors plan) s'affichent en petit message passager, pas en bandeau.

Tant que la position est affichée, la **liste de résultats** indique la distance de chaque lieu
— ce qui permet de distinguer d'un coup d'œil plusieurs lieux portant le même nom (les
différents « WC », par exemple) et de choisir le plus proche sans ouvrir les fiches une à une.

Le bouton **« Y aller »** d'une fiche **referme la fiche** et lance le **guidage** : une ligne
droite est tracée entre la position et le lieu, et une **barre d'une ligne** s'installe en bas
de l'écran avec le nom du lieu, la distance et un bouton « Arrêter ». Toucher le nom rouvre la
fiche ; la refermer ne coupe pas le guidage — seul « Arrêter » l'interrompt. Tout le reste de
l'écran est la carte : c'est ce qu'on veut voir en marchant. Auparavant la direction n'existait
que dans la fiche, qui couvrait la moitié basse de l'écran — donc le point bleu — et refermer
la fiche annulait le guidage sans le dire.

Ce n'est pas un itinéraire : le plan ne connaît pas encore les chemins de l'établissement, et
une direction honnête vaut mieux qu'un trajet inventé. Sans calage, le bouton reste désactivé
et dit pourquoi.

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
choisir un affiche une **barre d'étape en bas d'écran**, avec « Précédent » et « Suivant ». La
carte reste utilisable (on peut la déplacer et zoomer) et se recentre sur chaque étape, au-dessus
de la barre, pour que le lieu reste visible. Sans calage GPS, on se repère sur le plan puis on
avance avec « Suivant » ; avec le calage, « Y aller » vise l'étape en cours.

Pendant un parcours, le plan reste **explorable** : toucher un autre lieu (sur la carte ou dans
les résultats de recherche) ouvre sa fiche **en aperçu bas**, avec un bouton **« Revenir à
l'étape »** qui rend la main au parcours. La barre d'étape remonte au-dessus de cette fiche et
reste utilisable : auparavant la fiche la recouvrait entièrement, « Quitter », « Précédent » et
« Suivant » compris.

Rien n'est enregistré **côté serveur** : personne ne coche, personne n'est suivi. On peut
sauter une étape ou quitter le parcours à tout moment. Après avoir quitté, le bouton
**« Reprendre le parcours »** rend la main **à l'étape où l'on s'était arrêté** — et non au
début —, et la puce **Parcours** reste une autre entrée (un court message le rappelle). Cette
position est mémorisée sur l'appareil, et sur lui seul : elle survit à la fermeture de la page,
elle ne quitte jamais le téléphone. Démarrer un parcours depuis la puce repart de l'étape 1 ;
un parcours dépublié entre-temps ne laisse pas de bouton qui ne mènerait nulle part. Un lien direct par parcours (`?parcours=…`) permet d'imprimer
un **QR code** à l'accueil : le visiteur scanne et démarre le parcours. Si l'affiche a survécu au
parcours — dépublié, supprimé, renommé — le plan le **dit** (« Ce parcours n'est plus
disponible. ») plutôt que de s'ouvrir sans rien annoncer.

Quand le plan est protégé par un **code d'accès**, les parcours le sont avec lui : rien de leur
contenu ne sort avant la saisie du code.

Les parcours se créent dans ForetMap, dans _Réglages → Parcours_ (voir la documentation de la
carte) : on cherche les lieux, on les ordonne au glisser-déposer, on **publie**, et on coche les
surfaces (**Plan public**, **Plan personnels**, **Visite**, **carte de travail**) où ils doivent
apparaître. Un parcours brouillon n'apparaît nulle part, pas même via son lien. Un parcours
publié sur les seules surfaces internes — **Plan personnels** ou **carte de travail** — ne
s'ouvre pas non plus par lien direct : il n'est lisible que depuis l'écran auquel il est
destiné, et par qui y a accès. Le QR code d'une affiche n'a donc de sens que pour un parcours
publié sur le Plan public ou la Visite. Le bouton **« Affiche PDF »** produit la page
imprimable avec la liste des étapes et ce QR code (le QR mène au Plan).

### Le plan hors ligne

Le plan est une application installable : une fois ouvert, il garde en mémoire la carte, les
lieux et les parcours. Sans réseau, il s'affiche quand même avec les dernières données connues
et un bandeau **« Hors ligne — plan mémorisé »**. C'est ce qui le rend utilisable dans un
bâtiment où le téléphone ne capte pas.

### Aide intégrée

Un bouton **« ? »** à droite du titre, dans la barre du haut, ouvre une aide courte :
chercher un lieu, filtrer, se déplacer sur la carte, comprendre les pastilles chiffrées, et
se situer quand le plan est calé. Le bouton attire discrètement l'œil tant que l'aide n'a
jamais été ouverte sur cet appareil, puis se calme. C'est le même mécanisme d'aide que dans
ForetMap et dans Gnomes & Licornes.

### Réglages d'établissement

Dans _Réglages → Plan_ (portée publique, sauf le code d'accès) :

| Réglage                     | Effet                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Carte du plan               | quel plan est affiché par défaut                                         |
| Titre                       | le titre en haut de l'écran                                              |
| Message d'accueil           | la phrase montrée une fois par appareil                                  |
| Mention de source           | petite mention en bas du plan (origine du fond de carte)                 |
| Adresse publique du plan    | base des QR codes et liens (ex. adresse du site Plan)                    |
| Catégories cochées d'office | les étiquettes actives à la première ouverture                           |
| Catégories masquées         | catégories jamais proposées sur le plan                                  |
| Mode d'accès                | `public` (par défaut) ou `code` — un code court partagé, retenu 30 jours |
| Code d'accès                | saisi en clair dans les réglages ; seul un empreinte est stockée         |

### Mettre le Plan en service

Avant d'annoncer le plan aux visiteurs, vérifier dans l'ordre :

1. **Adresse sécurisée** — le site du plan s'ouvre en HTTPS avec un certificat reconnu (sinon
   certains téléphones refusent la page, la position et l'installation hors ligne).
2. **Fond de carte** — image assez nette pour zoomer, avec la **mention de source** renseignée
   (licence / origine du dessin).
3. **Carte du plan** — la bonne carte est choisie dans les réglages, et ses lieux utiles sont
   visibles sur la surface **Plan** (catégories et masquages par lieu).
4. **Alias et catégories** — les autres noms de recherche sont saisis ; les détails trop
   denses sont en « visible seulement au zoom ».
5. **Calage GPS** (si on veut « Me situer ») — trois points de calage posés sur cette carte.
6. **Adresse publique** — renseignée pour que les QR des parcours mènent au plan, pas à la
   console.
7. **Parcours** — publiés (pas seulement créés en brouillon), avec des lieux encore visibles
   sur le Plan.
8. **QR aux portes** (recommandé en intérieur) — liens directs `?lieu=…` vers les entrées ;
   sans bon signal GPS, c'est le moyen le plus fiable de se situer.

Un rapport de densité (script de lecture seule côté serveur) aide à prioriser les alias et le
désencombrement sur les données réelles.

## Vie privée

Le plan n'a ni compte, ni cookie de suivi, ni identifiant d'appareil. Des **compteurs
anonymes** sont incrémentés, sans jamais dire qui : ouverture du plan, ouverture d'un lieu,
recherche, recherche restée sans résultat, localisation, démarrage de parcours, etc. La
recherche sans résultat est la plus utile : elle dit quels mots les gens emploient et que le
plan ne connaît pas encore — donc quels **alias de recherche** ajouter.

## ⚠️ Points d'attention

- **Aucun itinéraire n'est calculé.** « Y aller » donne une direction à vol d'oiseau et une
  distance, pas un chemin : les couloirs, les escaliers et les portes ne sont pas connus du
  plan.
- **Sans calage GPS, pas de position.** Le bouton « Me situer » n'apparaît pas tant qu'un
  professeur n'a pas posé les points de repère du plan.
- **Quand une feuille est ouverte** (résultats, fiche, filtres), les commandes de la carte se
  replient en **rangée** juste au-dessus d'elle, et la carte se recadre pour garder le lieu
  concerné dans la bande encore visible. Au cran plein, la feuille occupant tout l'écran, les
  commandes s'effacent : elles reviennent dès qu'on la redescend.
- **En intérieur, le signal est mauvais.** Le halo le dit honnêtement ; les QR codes aux
  portes restent le moyen le plus fiable de savoir où l'on est.
- **Le code d'accès n'est pas un mot de passe.** Il est court, partagé, et retenu 30 jours par
  appareil : il décourage la diffusion large, il ne protège pas des données sensibles — et le
  plan n'en contient pas.
- **Un lieu masqué sur toutes les surfaces disparaît partout**, y compris de la carte des
  élèves. L'avertissement dans la fiche le signale, mais rien ne l'interdit.
