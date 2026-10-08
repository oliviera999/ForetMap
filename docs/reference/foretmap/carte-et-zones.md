# ForetMap — La carte et les zones

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

La carte est le cœur de ForetMap : c'est le plan du jardin, sur lequel on retrouve
les **zones** (potager, buttes, mare, ruches…) et les **repères** ponctuels (un arbre
remarquable, une cuve, un point d'intérêt). Chaque élément de la carte porte sa fiche :
ce qui y pousse, son état, ses photos, son histoire, et les tâches qui s'y rattachent.
La carte sert donc à la fois de plan d'orientation, de mémoire du jardin et de porte
d'entrée vers le travail à faire.

## Qui l'utilise

- **L'élève** consulte : il se repère, ouvre les fiches des zones et des repères,
  regarde les photos et prend en charge les tâches liées à un lieu.
- **Le professeur** édite tout : il dessine les zones, pose les repères, met à jour
  les fiches, gère les photos et relie tâches et tutoriels aux lieux.
- **L'administrateur** gère les **plans** eux-mêmes (ajout d'une carte, image de fond,
  calage GPS) dans les réglages.

## Les plans (les cartes du jardin)

L'application peut afficher **plusieurs plans** : par exemple la forêt comestible et
le potager. Quand il y a plusieurs plans, un sélecteur apparaît en haut de la carte
(boutons côte à côte, ou liste déroulante s'il y en a beaucoup).

Dans les réglages, un administrateur peut :

- **créer un plan** : un identifiant court, un nom affiché, un ordre de tri ;
- **changer l'image de fond** en téléversant une nouvelle image (l'ancienne est
  remplacée) ;
- **activer ou désactiver** un plan ;
- choisir le **plan ouvert par défaut** — un réglage distinct existe pour les élèves,
  pour les professeurs et pour le mode Visite (voir « Quel plan s'ouvre à l'arrivée ? »
  juste en dessous) ;
- **caler le plan sur le GPS** (optionnel) : on indique trois points du plan et leurs
  coordonnées réelles. Une fois ce calage fait et la géolocalisation activée pour ce
  plan, un bouton « Me suivre » apparaît sur la carte : la mascotte suit alors la
  position réelle de l'utilisateur sur le plan (avec des messages clairs si la
  localisation est refusée, si le signal est faible ou si l'on est hors du plan).

### Quel plan s'ouvre à l'arrivée ?

Deux règles, dans cet ordre :

1. **Le dernier plan que la personne a consulté sur cet appareil.** Dès qu'un utilisateur
   choisit un plan — dans le sélecteur au-dessus de la carte, dans le premier champ des
   filtres de tâches ou dans la Visite — ce choix est retenu par le navigateur et rouvert
   à la connexion suivante. Le choix vaut pour **toutes les surfaces** : un plan choisi
   dans la Visite est rouvert sur la carte de travail, et inversement. La mémoire est
   propre à l'appareil et au navigateur (elle ne suit pas le compte), et elle disparaît
   si l'utilisateur efface les données du site.
2. **Sinon, le plan ouvert par défaut réglé par l'administrateur**, selon le contexte :
   élève, professeur ou visite publique.

Conséquence pratique : changer le réglage « plan ouvert par défaut » ne déplace pas les
utilisateurs qui ont déjà choisi un plan sur leur appareil — leur dernier choix reste
prioritaire. Le nouveau réglage s'applique aux arrivées suivantes (nouvel appareil,
navigateur vidé, personne qui n'a jamais changé de plan). Pour déplacer tout le monde
d'office, désactiver le plan que l'on veut quitter : les utilisateurs qui y étaient sont
alors réorientés vers le plan par défaut.

Un cas prime sur les deux règles : un élève **rattaché à un seul plan** (affiliation) ne
voit que celui-là, quels que soient la mémoire de l'appareil et le réglage.

### Comment saisir les coordonnées du calage

Les trois points sont posés **en cliquant sur le plan**, puis leurs coordonnées réelles
sont saisies (ou capturées sur le terrain avec « Ma position »). La saisie est tolérante :

- **séparateur décimal au choix** : `48.8534` comme `48,8534` — inutile de corriger la
  virgule que le clavier ou le téléphone insère ;
- **hémisphère en lettre** accepté : `48.8534 N`, `7.5898 O` (Ouest), `W 7.5898` ;
- **degrés-minutes-secondes** acceptés : `48°51'12"N`, `2°17'40"E` ;
- **paire collée** : coller `48.8534, 2.3488` — ou un lien Google Maps / OpenStreetMap —
  dans l'un des deux champs remplit **latitude et longitude** d'un coup.

À la sortie du champ, la valeur est réaffichée sous sa forme normalisée (degrés décimaux
avec un point). Une coordonnée illisible ou hors bornes (latitude au-delà de ±90,
longitude au-delà de ±180) est signalée en rouge sous la ligne, et la saisie est
conservée telle quelle pour être corrigée.

> Les trois points ne doivent pas être **alignés** : il faut un vrai triangle sur le plan,
> sinon le calage est refusé.

Une fois les trois points complets, l'outil affiche l'**échelle déduite** du calage
(« plan ≈ L m × H m ») : si ces dimensions ne ressemblent pas au terrain (un plan de
collège annoncé à 4 mètres de large…), un point est mal renseigné. Deux incohérences sont
**refusées à l'enregistrement**, avec un message explicite :

- des points **GPS alignés ou confondus** (il faut un vrai triangle sur le terrain aussi,
  pas seulement sur le plan) ;
- des **distances GPS incompatibles avec les distances sur le plan** (par exemple deux
  points à 80 % du plan l'un de l'autre mais à 4 mètres sur le terrain, quand une autre
  paire implique 50 mètres) — signe typique d'une coordonnée mal saisie.

> ⚠️ **Point d'attention** — Il n'existe pas de bouton pour **supprimer** un plan :
> on peut seulement le désactiver. C'est prudent (les zones existantes ne sont pas
> perdues), mais un plan créé par erreur reste visible dans la liste des réglages.

## Les zones

Une zone est une **forme libre** dessinée sur le plan (au moins trois points, autant
qu'on veut). Sa fiche rassemble :

- un **nom** et un **emoji** (choisi dans une palette ou saisi librement) ;
- une **couleur** de remplissage : la **même palette prédéfinie de dix teintes** que pour
  les catégories, complétée par la pastille de sélection du système et la saisie directe
  du code hexadécimal (transparence comprise) — voir « Catégories de lieux » plus bas ;
- la liste des **êtres vivants** présents (choisis dans le catalogue biodiversité —
  plusieurs espèces possibles, l'ordre choisi est conservé à l'affichage). Une espèce placée
  dans une zone est **présente sur le site** pour toute l'application (catalogue, fiche,
  Groupes emboîtés, réseau trophique, visite) — voir « Présente sur ce site » dans
  [Plantes et biodiversité](plantes-et-biodiversite.md) ;
- une ou plusieurs **catégories** (Verger, Compostage, Zone pédagogique…), créées par
  l'administrateur et utilisables comme filtre sur la carte — voir « Catégories de
  lieux » plus bas ;
- une **description** libre (avec mise en forme) ;
- un réglage **« Qui peut voir ce lieu »** et des **compléments réservés** (voir plus bas) ;
- des **photos** avec légende, que le professeur peut réordonner et supprimer ;
- des **textes publics** (sous-titre, accroche, bloc dépliable, images) : ce que le grand
  public lira au même endroit, pendant une visite **comme sur le Plan Lyautey** ;
- des **alias de recherche** (autres noms séparés par `;`) et un choix de **surfaces
  d'affichage** : voir « Où apparaît un lieu » plus bas ;
- des **commentaires** contextuels (observations des élèves et du professeur), si le
  module est activé ;
- un bouton **« Signaler une observation ici »** (compte connecté) : l'élève signale une
  espèce vue dans ce lieu, que le professeur validera — le lieu est déjà choisi dans le
  formulaire. Un bouton voisin, **« Mes observations »**, montre les siennes et leur statut.
  Même chose sur la fiche d'un repère. Détail : « Signaler une observation » dans
  [Plantes et biodiversité](plantes-et-biodiversite.md).

**Surface de la zone (plans calés GPS).** Sur un plan qui a été calé sur trois points
GPS, les professeurs et administrateurs voient, sous le nom de la zone sélectionnée, une
ligne **« Surface : ≈ 1 234 m² »** (en hectares au-delà de 10 000 m², par exemple
« ≈ 1,23 ha »). C'est une **estimation** tirée du calage du plan. Les élèves ne la voient
pas, et elle n'apparaît pas sur un plan non calé. La même surface s'affiche **en direct**
dans le bandeau du bas pendant le tracé d'une nouvelle zone (dès le troisième point) et
pendant la retouche du contour.

## Les repères

Un repère est un **point** posé sur le plan, complémentaire des zones. Il porte un
**emoji**, un **nom**, une **note** libre, le même réglage **« Qui peut voir ce lieu »**
et les mêmes **compléments réservés** que les zones, ses **photos** (mêmes possibilités que
les zones), ses **espèces associées**, ses **catégories** (mêmes catégories que les
zones) et, comme les zones, ses textes pour le mode Visite, ses tâches et tutoriels liés.

Pour éviter les déplacements accidentels, la position des repères est **verrouillée**
par défaut : le professeur clique sur le cadenas « Repères » de la barre d'outils pour
pouvoir les faire glisser, puis reverrouille.

## Catégories de lieux

Les catégories classent les zones **et** les repères, et servent de filtre sur la carte.
Elles remplacent l'ancien couple « état de culture » (Vide / En croissance / Prêt à
récolter) et case « zone spéciale ».

Une catégorie porte un **libellé**, un **emoji**, une **couleur**, une **description**
(infobulle) et un **ordre d'affichage**. L'ordre se règle dans **Réglages administrateur →
Catégories de lieux** : boutons ↑ ↓, **glisser-déposer** une ligne de la liste, ou champ
numérique « Ordre »
lors de la création / édition. Cet ordre pilote les filtres, les pastilles et la priorité des
repères au dézoom (plus petit = plus important). La couleur se choisit de trois façons — les mêmes
que pour une zone, le champ est identique partout : en cliquant sur une pastille de la
**palette prédéfinie** (dix teintes), avec la **pastille de sélection** (nuancier du
système), ou en tapant directement le code hexadécimal dans le champ voisin. Les deux
derniers caractères de ce code règlent la **transparence** — utile pour que le plan reste
lisible sous la zone — et le sélecteur les conserve quand on change seulement la teinte. Une catégorie est :

- soit **globale** — utilisable sur toutes les cartes (cas le plus courant : Compostage,
  Verger, Zone pédagogique) ;
- soit **rattachée à une carte** — proposée uniquement sur ce plan (ex. « Salles » sur un
  plan de bâtiment).

Elle peut aussi être restreinte aux **zones seules**, aux **repères seuls**, ou valoir
pour **les deux** (par défaut).

Une case **« Infrastructure »** distingue les lieux qui ne sont pas des cultures (mare,
ruches, compostage, cuve…). Elle reprend exactement le comportement de l'ancienne case
« zone spéciale » : ces lieux n'affichent pas de section Biodiversité en mode Visite et ne
sont jamais proposés comme cible de mission ou de tutoriel. Leur contour est tracé en trait
continu sur la carte, comme celui de toutes les autres zones. Les zones qui étaient marquées « spéciales » ont été
automatiquement reprises dans une catégorie **Infrastructure**.

Une catégorie peut être **désactivée** plutôt que supprimée : elle reste posée sur les
lieux mais disparaît des filtres et des formulaires. La supprimer la retire en revanche
de toutes les zones et de tous les repères qui la portaient.

**Où les créer** : Paramètres → Cartographie → Catégories de lieux. Il faut la
permission « Gestion zones ». Un n3boss qui a cette permission (sans être
administrateur des réglages) ouvre quand même Paramètres et n'y voit que la
Cartographie.

**Où les poser** : dans la fiche d'une zone ou d'un repère, onglet « Modifier », bloc
« Catégories » (cases à cocher — plusieurs catégories possibles sur un même lieu).

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Carte**. Il peut zoomer, se déplacer, afficher ou masquer
   les noms des zones, **ajuster la taille du texte sur la carte** (bouton « Aa » dans
   la barre d'outils : Normal, Grand, Très grand — mémorisé sur l'appareil), passer en
   plein écran. Sur téléphone, un bouton « Gestes » évite de déclencher la carte en
   faisant défiler la page. Les gestes sont ceux de toutes les cartes de la plateforme
   (carte, visite, plateaux Gnomes & Licornes) : **le plan ne sort jamais du cadre**
   (butée souple qui ramène la vue en place), **pincer** zoome et déplace dans le même
   geste, un **double-tap** zoome sur le point touché (un second double-tap réajuste le
   plan), un glisser rapide continue sur sa lancée, et la molette ou les boutons +/−
   gardent le point visé sous le pointeur. Si une **mascotte** est affichée, un clic sur le
   plan — y compris **hors** de toute zone ou repère — la fait marcher jusqu'au point
   touché ; un clic sur un lieu l'y amène aussi en ouvrant la fiche.
2. Il **touche une zone ou un repère** : la fiche s'ouvre avec ses onglets — Tâches,
   Tutoriels, Info, Photos (l'onglet Tâches ou Tutoriels n'apparaît que s'il y a
   quelque chose à montrer). Tant que la fiche d'une **zone** est ouverte, cette zone
   reste **mise en avant** sur le plan (remplissage plus marqué) et les autres zones
   sont **légèrement estompées**, pour repérer d'un coup d'œil où l'on se trouve —
   sans cadre ni contour noir autour de la forme.
3. Dans l'onglet **Tâches**, il coche une ou plusieurs tâches disponibles à cet
   endroit et les **prend en charge** directement.
4. Un bouton permet aussi d'**ouvrir l'onglet Tâches de l'application filtré sur ce
   lieu**, pour voir tout ce qui s'y rattache.
5. Dans l'onglet **Info**, il lit la description, les espèces présentes (avec renvoi
   vers leurs fiches biodiversité), et peut laisser un commentaire d'observation. Quand l'**accroche de visite** reprend mot pour mot la
   description du lieu — ce que fait la recopie « carte → visite » —, elle n'est
   affichée qu'**une seule fois** : plus de paragraphe en double dans l'onglet Info.

## Comment ça se passe — côté professeur

1. **Dessiner une zone** : bouton « Zone » de la barre d'outils, puis clics successifs
   sur le plan pour poser les points du contour (avec annulation du dernier point).
   À partir de trois points, « Terminer » ouvre la fenêtre de création : nom, êtres
   vivants, catégories, couleur…
2. **Poser un repère** : bouton « Repère », puis clic à l'endroit voulu ; on renseigne
   ensuite nom, emoji et note.
3. **Modifier une fiche** : ouvrir la zone ou le repère, onglet « Modifier ». On y
   change tout (nom, espèces, catégories, couleur, description, textes publics, emoji,
   alias de recherche, surfaces d'affichage). Un
   bouton dédié permet de **retoucher le contour** de la zone (voir « Retoucher le
   contour d'une zone » plus bas), puis de sauvegarder.
4. **Dupliquer une zone** : un bouton dans l'en-tête de la fiche crée une copie, utile
   pour des parcelles semblables.
5. **Gérer les photos** : onglet Photos — ajout avec légende, réorganisation par
   glisser-déposer, suppression.
6. **Lier tâches et tutoriels** : depuis les onglets Tâches et Tutoriels de la fiche,
   on associe ou dissocie les tâches et tutoriels existants ; la liste des tutoriels
   propose toutes les fiches actives pas déjà liées à ce lieu. Un tutoriel peut être
   présent sur plusieurs cartes à la fois. Les élèves les retrouvent ensuite au même
   endroit.
7. **Supprimer** une zone ou un repère : la fiche, ses photos et son contenu de visite
   sont retirés ensemble. C'est le seul endroit où l'on supprime un lieu : la Visite
   reflète exactement les zones et repères de la carte (création, renommage, forme,
   position et emoji sont repris aussitôt).

### Les parcours

Un **parcours** enchaîne des lieux dans un ordre choisi, avec un titre, un public visé et, pour
chaque étape, un texte court facultatif. Il se gère dans _Réglages → **Parcours**_, et sert de
feuille de séance sur la **carte** ForetMap, de visite fléchée en **Visite**, et de parcours
guidé sur le **Plan** Lyautey (barre d'étape en bas, carte restée utilisable).

Composer un parcours :

1. Choisir la **carte** : un parcours appartient à une carte, et ne propose que ses lieux.
2. Donner un **titre** (obligatoire), et si besoin un public visé, une description, un ordre
   d'affichage. L'**identifiant du lien** se déduit du titre — le renseigner à la main sert
   surtout à garder un QR code déjà imprimé valable après un changement de titre.
3. Ajouter les étapes : le champ **« Ajouter un lieu »** cherche parmi les zones et les repères
   de la carte, y compris par leurs **alias de recherche**. Un clic sur un résultat l'ajoute en
   fin de liste ; un lieu déjà présent n'est pas proposé une seconde fois.
4. Réordonner : **glisser-déposer** une étape, ou utiliser les boutons **↑** et **↓** (la voie
   au clavier). Chaque étape peut recevoir un titre propre — sinon c'est le nom du lieu qui
   s'affiche — et une phrase à lire sur place.
5. **Créer le parcours**. Il reste modifiable ensuite par le bouton « Éditer » de la liste.

À savoir :

- Un parcours naît **brouillon** : il n'apparaît nulle part tant que la case « Publié » n'est
  pas cochée — pas même pour qui connaîtrait son adresse.
- Les cases **« proposé sur »** décident des surfaces, comme pour les lieux. Un parcours neuf
  vise par défaut la **Carte**, la **Visite** et le **Plan** ; on peut retirer celles qui ne
  conviennent pas, ou ajouter le **Plan des personnels**. Chaque surface n'affiche que les
  parcours qui la ciblent, avec une barre d'étape en bas et la carte restée utilisable. Un
  parcours publié sans Carte ni Visite n'apparaît **pas** dans ForetMap — l'éditeur le rappelle.
  La Visite ne sert que les cartes de terrain (pas le plan de l'établissement réservé à
  planlyautey) : créez le parcours sur la même carte que celle ouverte en Visite.
- **Quitter n'efface pas l'avancement** : le bouton « Reprendre le parcours » revient à l'étape
  où l'on s'était arrêté, sur les trois surfaces, et **même après un rechargement de page**.
  Relancer le parcours depuis la liste, lui, repart de la première étape. L'avancement vit sur
  l'appareil, et sur lui seul : il n'est ni enregistré côté serveur, ni transmis à quiconque.
  Un parcours dépublié entre-temps ne laisse pas de bouton qui ne mènerait nulle part.
- Rien n'est dupliqué : une étape **pointe** vers un lieu existant. Renommer le lieu renomme
  l'étape ; supprimer le lieu laisse une étape signalée « lieu introuvable », à retirer.
- Une étape dont le lieu est **masqué** sur la surface consultée (Carte, Visite ou Plan — par
  ses surfaces, sa catégorie, ou parce qu'il est réservé à certains profils) n'est pas
  affichée : le compte d'étapes annoncé est celui des étapes réellement visibles, et le texte
  de l'étape masquée n'est pas transmis. Un parcours dont plus aucune étape n'est visible n'est
  pas proposé du tout. L'affiche PDF du professeur continue de lister toutes les étapes.
- Un parcours ne peut pas dépasser **60 étapes**. La description est limitée à 2 000 caractères,
  le texte d'une étape à 4 000.
- Changer l'**identifiant du lien** d'un parcours déjà publié périme les affiches imprimées :
  l'écran le rappelle au moment où le champ change.
- Un parcours reste sur **sa** carte : pour le déplacer, il faut le recréer.
- Le bouton **« Affiche PDF »** télécharge une page imprimable : la liste des étapes et un
  **QR code** vers le parcours, à afficher à l'accueil. Pour que ce QR code mène au plan et non
  à la console, renseigner l'adresse publique du plan dans l'onglet _Réglages → Plan Lyautey_
  (par exemple l'adresse « planlyautey » de l'établissement).
- Rien n'est enregistré du côté des personnes qui suivent un parcours : aucune validation,
  aucune progression, aucun suivi individuel.

#### Suivre un parcours (carte, Visite, plans)

Le déroulé est le même sur les trois surfaces :

1. **Vue d'ensemble.** Ouvrir un parcours (depuis la liste, « Reprendre » mis à part, ou en
   scannant le QR code d'une affiche) montre d'abord **tout le trajet** : la carte se cadre sur
   l'ensemble des étapes, reliées par une ligne munie de **flèches qui indiquent le sens de
   marche**, avec une **pastille numérotée** sur chaque lieu (« Départ » sur la première,
   « Arrivée 🏁 » sur la dernière). La barre du bas résume le parcours et liste ses étapes ;
   toucher l'une d'elles démarre directement à cette étape.
2. **« Commencer le parcours ».** La première étape s'ouvre. Si la carte permet de se situer,
   **« Me situer » s'allume tout seul**. La vue montre alors **à la fois votre position et
   l'étape à atteindre**.
3. **En marchant.** Dès que vous vous êtes éloigné de quelques mètres de votre point de départ,
   la carte **zoome sur votre position** et reste ouverte **vers l'étape** : vous voyez où vous
   êtes, et la ligne fléchée qui mène à l'étape. Près d'un bord du plan, la vue se cale contre
   ce bord plutôt que d'afficher du vide, pour montrer le plus de carte et de trajet possible.
4. Le trajet complet reste dessiné **en fond, discret** : les étapes déjà faites sont grisées
   et cochées ✓, l'étape en cours est mise en avant, et une ligne animée relie votre position
   à cette étape.

Toucher la carte (glisser, zoomer, « Voir tout le plan ») reprend la main : la vue cesse de
suivre jusqu'à l'étape suivante, ou jusqu'à un appui sur « Me situer ». Le bouton 🗺️ de la
barre d'étape ramène à la vue d'ensemble, d'où « Reprendre à l'étape N » revient où l'on en
était. « Reprendre le parcours » (après « Quitter ») va, lui, directement à l'étape quittée.

Ce comportement se règle dans _Réglages → **Parcours guidés**_ (s'applique à la carte, à la
Visite et aux plans) :

- **Vue d'ensemble au démarrage** — sinon le parcours s'ouvre directement sur l'étape 1 ;
- **« Me situer » automatique** au moment de commencer ;
- **Caméra guidée** pendant les étapes — désactivée, la carte se recentre seulement sur chaque
  nouvelle étape, comme auparavant (la vue d'ensemble, elle, montre toujours tout le trajet) ;
- **Zoom pendant la marche** (en % de la carte entière, 300 % par défaut) ;
- **Distance de déclenchement du zoom de marche** (8 m par défaut) ;
- **Anticipation vers l'étape** : à quel point la vue s'ouvre devant soi plutôt que de rester
  centrée sur la position (60 % par défaut, 0 % = toujours centrée) ;
- **Trajet complet visible pendant les étapes** ;
- **Ligne animée** vers l'étape (elle reste fixe de toute façon pour les personnes qui ont
  demandé à leur appareil de réduire les animations).

> ⚠️ **Points d'attention**
>
> - Quand la carte est orientée selon la boussole, c'est l'orientation qui mène la vue : la
>   caméra guidée se met en retrait.
> - Sans position (carte non calée, ou « Me situer » refusé), la vue d'étape cadre l'étape
>   précédente et l'étape en cours, pour montrer le sens à suivre.

### Se situer sur la carte

Quand le plan affiché est **calé** (points de repère GPS posés par un professeur), le bouton
« Me suivre » de la barre d'outils affiche un **point de position** : un point bleu avec un
halo d'autant plus large que le signal est imprécis, et une flèche de cap si l'appareil a une
boussole. Le point s'affiche désormais **même si la mascotte est masquée** : la position et la
mascotte sont deux choses différentes. Quand la mascotte est visible, elle continue de suivre
la position comme avant. Zoomer sur un lieu (une tâche, une recherche, une étape de parcours)
**ne fait plus disparaître** la mascotte : elle garde au moins sa taille habituelle à l'écran.
Elle reste aussi **toujours posée sur le plan** : sur les cartes de l'espace « Cartes & tâches »
(carte seule ou vue scindée carte + tâches), elle se plaçait hors du plan et devenait
invisible ; elle s'affiche désormais à sa place dès l'ouverture de la carte.

Si l'orientation boussole est autorisée (réglage Carte **et** case sur cette carte dans le
calage GPS), le bouton **« Orienter »** fait tourner le plan pour aligner le regard vers le
haut de l'écran. La vue **se recentre sur votre position** et **grossit un peu** pour que le
plan tourné remplisse encore tout l'écran (sinon des bandes vides apparaîtraient sur les côtés).
Chacun peut l'activer ou le couper ; le choix reste sur l'appareil.

Dès que le plan est **calé** (même sans suivi GPS), une **barre d'échelle** et une **rose des
vents** (N) s'affichent en bas à gauche. Un professeur peut les désactiver pour cette carte
dans le calage GPS ; chacun peut aussi les masquer temporairement via le bouton **« Échelle »**
de la barre d'outils (le choix reste sur l'appareil).

La position est calculée dans l'appareil et n'est jamais envoyée au serveur.

### Quand la carte devient trop chargée

Vu de loin, des repères qui se chevauchent sont remplacés par une **pastille chiffrée** :
elle indique combien de repères sont là. La toucher zoome sur le groupe, ou ouvre la fiche du
repère principal si les repères sont exactement au même point. Un bouton de la barre d'outils
de la carte désactive ce regroupement quand on veut voir tous les repères, par exemple pour en
placer un nouveau (le regroupement est d'ailleurs toujours inactif en mode édition).

Deux réglages complètent cela, dans _Réglages → Catégories de lieux_ : **l'ordre des
catégories** sert de priorité (les premières sont nommées en premier et regroupées en
dernier), et **« Visible seulement au zoom »** retire les lieux d'une catégorie tant que la
carte est vue en entier.

Enfin, le **nom d'une zone** s'affiche désormais au point le plus « à l'intérieur » de son
contour, et non plus à son centre géométrique : sur une zone en L ou en croissant, le nom
tombait à côté, parfois sur la zone voisine.

### Qui peut voir un lieu (rôles)

Par défaut, un lieu est **public** : toute personne autorisée à ouvrir la carte (ou la
visite / le plan, selon les surfaces) le voit, avec sa description ou sa note habituelle.

Le professeur peut restreindre la **visibilité du lieu entier** à certains **rôles**
(visiteur, personnel, paliers n3beur, prof de classe, n3boss, administrateur) :

- hors de ces rôles, le lieu est **absent** : pas d'épingle, pas de forme, pas de résultat
  dans la recherche ni dans les listes — on ne le « grise » pas ;
- les comptes qui gèrent les zones ou les repères voient **toujours** tous les lieux, pour
  pouvoir les éditer ;
- la **visite anonyme** et le **Plan Lyautey** ne voient un lieu restreint que si le rôle
  **Visiteur** fait partie de l'audience (sinon le lieu reste réservé aux comptes connectés
  concernés).

### Compléments réservés : un texte par public

Sur la même fiche, le bloc **« Compléments réservés »** permet d'ajouter des textes lus
seulement par certains publics — une consigne de classe, une note d'entretien. Le lieu peut
rester visible pour tout le monde ; seuls ces compléments sont masqués.

Un lieu en accepte **jusqu'à six**, et **chacun a sa propre audience**. C'est ce qui permet
de mettre sur la même fiche la consigne de la 2nde B, la note pour le personnel d'entretien
et le code du cadenas pour l'encadrement : chaque lecteur ne reçoit que ce qui le concerne,
et ignore l'existence du reste.

- Le bouton **« + Ajouter un complément »** en crée un ; les flèches ↑ ↓ les réordonnent,
  la croix en retire un.
- Un **intitulé** facultatif (« Arrosage », « Accès ») coiffe le texte sur la fiche — utile
  dès qu'il y en a plusieurs.
- Le repli **« Qui lit ce complément »** résume l'audience choisie ; on l'ouvre pour cocher
  des rôles ou des groupes.
- **Sans aucune case cochée**, le complément est lu par l'**encadrement** : administrateurs,
  **n3boss** et **profs de classe** (ainsi que tout compte qui gère les zones ou les
  repères). Cocher des rôles ou des groupes remplace ce réglage par défaut — c'est aussi
  ainsi qu'on ouvre un complément à des élèves, au personnel ou aux visiteurs.

Ce cloisonnement s'applique aussi à la **Visite** (lieux de la visite guidée) : un
complément n'y apparaît pas pour un visiteur anonyme, et les compléments d'un lieu y sont
désormais **affichés** aux lecteurs qui y ont droit — jusqu'ici la fiche de visite les
recevait sans jamais les montrer.

Un lieu n'a qu'**un seul jeu** de compléments : celui qu'on modifie depuis la fiche de
visite est le même que celui de la fiche de carte. Copier un lieu de la carte vers la visite
ne recopie donc plus rien, et ne peut plus placer un complément dans un texte public.

### Restreindre à une classe ou à un club (groupes)

À côté des rôles, chaque réglage d'audience propose les **groupes** : classes, clubs,
équipes. C'est ce qu'il faut pour « cette parcelle est celle de la 2nde B » — un rôle ne sait
pas distinguer deux classes.

Les deux listes se **combinent** : il suffit d'avoir le bon rôle **ou** d'être dans l'un des
groupes cochés. Cocher un rôle sans cocher de groupe fonctionne donc comme avant.

- Les groupes proposés sont **ceux que vous voyez déjà** : un prof de classe ne peut
  restreindre qu'à ses propres groupes, un administrateur à tous.
- Un **visiteur anonyme** n'appartient à aucun groupe : un lieu restreint à une classe
  n'apparaît jamais sur la visite publique ni sur le Plan.
- Si un groupe est supprimé, les lieux qui le citaient cessent simplement de correspondre à
  ce critère — rien ne casse, mais pensez à revoir leur audience.

La restriction par groupe vaut pour les **trois** réglages : qui voit le lieu, qui lit
**chaque** complément réservé, et qui voit chaque lien du lieu.

### Audience héritée d'une catégorie

Une **catégorie** de lieux (Infrastructure, Locaux techniques, Parcelles de la 2nde A…) peut
porter une audience, réglée dans la console des catégories. Les lieux de cette catégorie
**qui n'ont pas d'audience propre** en héritent. C'est le moyen de restreindre d'un coup une
famille entière de lieux, sans les reprendre un par un.

Trois règles à retenir :

1. **Le plus précis gagne.** Un lieu qui déclare sa propre audience ignore celle de sa
   catégorie.
2. **Une catégorie sans case cochée est neutre** : elle n'ouvre ni ne ferme rien. Ranger un
   lieu réservé dans une catégorie ordinaire ne le rend donc **pas** public.
3. **Plusieurs catégories s'additionnent** : un lieu rangé dans deux catégories réservées est
   visible par l'audience de l'une **ou** de l'autre.

> ⚠️ C'est le réglage le plus large de l'application : il peut faire disparaître d'un coup
> tous les lieux d'une catégorie, carte, visite et plan compris. La console affiche un
> avertissement dès qu'une case est cochée.

### Liens dans les descriptions

Les descriptions de zones et de repères, les textes de visite **et les compléments réservés**
acceptent des **liens**. Trois formes sont reconnues :

| Ce qu'on écrit                                               | Résultat                                 |
| ------------------------------------------------------------ | ---------------------------------------- |
| `https://…` (ou une adresse collée telle quelle)             | **nouvel onglet**, marqué d'une flèche ↗ |
| `/tutoriels/3`, `/visite?zone=…` — une page de l'application | même onglet, comme un clic normal        |
| `mailto:…`, `tel:…`                                          | ouvre la messagerie ou l'appel           |

Le bouton **« Lien »** de la barre de mise en forme (à déplier avec « Aa Mise en forme »)
fait le travail : on sélectionne le texte, on clique, puis un petit panneau demande le
**texte à afficher** et l'**adresse**. Une adresse tapée sans « https:// » est complétée
toute seule. Une adresse non reconnue est **refusée avec un message** simple (le détail des
formes acceptées est dans « En savoir plus ») au lieu d'être enregistrée à moitié — avant, un
lien interne disparaissait en silence à l'enregistrement.

Un lien écrit dans la **description** est lu par tous ceux qui voient le lieu ; un lien écrit
dans un **complément réservé** ne l'est que par l'audience de ce complément-là. C'est la
façon la plus simple de partager un document confidentiel, sans réglage supplémentaire.

> ⚠️ **Un lien n'est confidentiel que si sa cible l'est.** Mettre une adresse Google Drive
> dans un complément réservé cache l'adresse aux autres comptes ForetMap, mais ne protège
> pas le document : si le partage Drive est « toute personne disposant du lien », quiconque
> obtient l'adresse y accède. Régler les droits **sur le document lui-même**.

### Liens du lieu (boutons, avec audience par lien)

Sous la description, un bloc **« Liens du lieu »** permet d'attacher jusqu'à **12 liens**
présentés en boutons, chacun avec son **libellé** et **sa propre audience**. C'est ce qu'il
faut quand un même lieu porte des ressources de publics différents : la fiche d'activité pour
tout le monde, la procédure d'ouverture des locaux pour les seuls enseignants — sans avoir à
couper le texte en deux blocs.

- **Aucune case cochée** = lien visible par tous ceux qui voient déjà le lieu.
- **Des rôles ou des groupes cochés** = lien réservé, signalé par un 🔒 dans l'écran
  d'édition, avec un résumé de son audience en clair (« Qui voit ce lien : Classe A »).
- Les liens se **réordonnent** (↑ / ↓) et se retirent (✕) ligne par ligne.
- Mêmes adresses acceptées que ci-dessus ; les adresses externes s'ouvrent en nouvel onglet.

Un lien réservé n'est **pas simplement caché à l'écran** : il n'est pas envoyé du tout à un
lecteur qui n'y a pas droit, sur aucune surface — carte, Visite, Plan Lyautey, plan des
personnels. La même règle que pour les compléments réservés.

Les liens du lieu s'affichent sur la **carte de travail** et sur le **Plan**. Sur la Visite,
les liens passent par les textes (description, détails), comme décrit plus haut.

### Où apparaît un lieu (carte, visite, plan)

Un même lieu peut être montré sur plusieurs **surfaces** : la **Carte** de travail des élèves,
la **Visite** guidée grand public, le **Plan Lyautey** (le plan d'établissement sur
téléphone — voir [../plan/presentation.md](../plan/presentation.md)), le **plan des
personnels** et le **plan e-nov** (voir [../plan/plan-enov.md](../plan/plan-enov.md)). Les
lieux ne sont jamais dupliqués : c'est le même lieu, montré ou non à chaque endroit.

Deux réglages se combinent :

- **Par catégorie** — dans _Réglages → Cartographie → Catégories_, chaque catégorie porte une case
  par surface (« Visible sur »). Décocher **Plan** pour « Cultures » retire d'un coup toutes
  les cultures du plan d'établissement, sans rien changer pour les élèves.
- **Par lieu** — dans la fiche d'une zone ou d'un repère, onglet _Modifier_, le bloc
  « Masquer sur » retire **ce lieu précis** d'une surface, quelle que soit sa catégorie.

« Masquer sur : Visite » est respecté par la visite guidée (il ne l'était pas auparavant :
le lieu y restait affiché).

Un lieu **sans catégorie** reste visible partout où il n'est pas explicitement masqué
(exception à ce jour : la Visite le cache dès que des catégories affichées par défaut sont
choisies pour la Visite elle-même, dans Paramètres → Visite — voir les points d'attention de
la page Visite). Si
toutes les surfaces sont cochées dans « Masquer sur », un avertissement prévient que le
lieu ne sera visible nulle part.

La même fiche propose un champ **« Alias de recherche »** : les autres noms sous lesquels on
cherche ce lieu, séparés par des points-virgules (`CDI ; bibliothèque ; docs`). Ces mots ne
s'affichent nulle part ; ils servent à ce que la recherche du plan trouve le lieu quel que
soit le mot employé.

**Label e-nov.** Pour présenter un lieu comme une innovation sur le
[plan e-nov](../plan/plan-enov.md), cochez sa catégorie **« 💡 e-nov »** et remplissez le champ
**« 💡 Description e-nov »** (en quoi ce lieu est une innovation). Ce texte ne s'affiche que
sur le plan e-nov, en tête de la fiche. La catégorie « e-nov » est une **catégorie-label** :
elle n'apparaît que sur le plan e-nov, n'est visible dans ForetMap que des comptes qui
modifient les lieux (administrateur, n3boss), et ne retire jamais le lieu des autres
surfaces — même s'il n'avait aucune autre catégorie. La case « Catégorie-label » de
_Réglages → Cartographie → Catégories_ donne ce comportement à toute autre catégorie.

### Retoucher le contour d'une zone

Depuis la fiche d'une zone, le bouton « Contour », placé en haut de la fiche juste à
côté du bouton « Copie », ouvre un mode d'édition
sur la carte. Le contour apparaît alors avec **une poignée par sommet** (les coins du
tracé), et une petite **poignée pointillée au milieu de chaque côté**. Tout se fait
directement sur le plan ; rien n'est enregistré tant qu'on n'a pas cliqué « Sauver ».
Sur un plan calé GPS, le bandeau du bas indique la **surface estimée** du contour
(« 📐 ≈ 1 234 m² »), mise à jour à chaque déplacement de sommet.

**Le zoom et le cadrage sont conservés** : entrer dans ce mode, tracer une nouvelle zone,
poser un repère, aligner des zones, puis revenir à la consultation (en sauvant ou en
annulant) garde exactement la portion du plan qu'on regardait, au même grossissement. La
carte ne revient à la vue d'ensemble que si l'on appuie sur le bouton de recentrage, ou
quand on change de plan.

- **Déplacer un sommet** : le faire glisser. **Déplacer la zone entière** : glisser
  l'intérieur du contour.
- **Ajouter un sommet** : tirer (ou toucher) une **poignée pointillée** au milieu d'un
  côté — le nouveau sommet naît là et suit le doigt dans le même geste. Pour viser un
  endroit précis d'un côté, activer « ＋ Sommet » puis cliquer sur le contour : le
  sommet se pose exactement sur le trait.
- **Supprimer des sommets** : sélectionner puis appuyer sur la touche Suppr, ou
  utiliser le bouton « 🗑 ». Un contour garde toujours **au moins trois sommets** : en
  dessous, la suppression est refusée.
- **Sélectionner plusieurs sommets** : Maj+clic pour en ajouter un à un. Sur tablette,
  la bascule « Multi » remplace Maj : chaque appui ajoute ou retire un sommet. Les
  sommets sélectionnés sont entourés d'un cercle orange, et **glisser l'un d'eux
  déplace tout le groupe** d'un bloc. Un clic sur le fond désélectionne ; Échap aussi.
- **Déplacer la vue pendant l'édition** : glisser le doigt ou la souris sur le fond
  de carte (hors du contour) déplace le plan, comme en mode consultation. Les **flèches
  du clavier** déplacent la vue lorsqu'aucun sommet n'est sélectionné ; avec une
  sélection, elles ajustent finement la position des sommets (Maj+flèche = pas plus
  large).
- **Aimanter le contour sur l'image** : la bascule « 🧲 Aimant » analyse l'image de
  fond du plan (l'analyse prend un instant la première fois) et **colle le sommet
  déplacé sur la limite visible la plus proche** — un bord de parcelle, un chemin, une
  haie — en **privilégiant les angles droits** (traits horizontaux ou verticaux du plan,
  alignement sur le sommet voisin). Deux curseurs le règlent : le **rayon**, jusqu'à
  quelle distance l'aimant va chercher une limite, et la **sensibilité**, à quel point
  cette limite doit être marquée pour attirer le sommet. Une sensibilité basse ne
  retient que les traits francs ; une sensibilité haute accroche aussi les transitions
  ténues — pratique sur une photo peu contrastée, mais l'aimant y devient bavard. Le
  bouton « 🧲 Coller » applique l'aimantation d'un coup aux sommets sélectionnés (ou à
  tout le contour si rien n'est sélectionné). Maintenir la touche Alt suspend l'aimant
  le temps d'un geste, pour placer un sommet à la main.
- **Coller aux zones voisines** : la bascule « Voisins » (disponible en **tracé** d'une
  nouvelle zone et en **retouche** de contour) colle chaque sommet au contour d'une
  zone déjà proche — sommet ou côté. En tracé, si deux points successifs touchent le
  **même** voisin, l'outil peut **suivre automatiquement le meilleur côté partagé**
  (il reprend les coins intermédiaires du voisin). L'accroche voisins a priorité sur
  l'aimant image quand les deux sont actifs.
- **Aligner plusieurs zones d'un coup** : en navigation, le bouton « Aligner » ouvre un
  mode de sélection. On clique les zones **proches** à corriger (≥ 2), puis « Aperçu »
  montre le rendu global (contours pointillés orange) **sans rien enregistrer**. On peut
  rejeter l'aperçu, ou « Enregistrer » pour appliquer l'alignement des sommets communs.
  Seules les zones sélectionnées qui se touchent (ou presque) sont concernées.
- **Se tromper n'est pas grave** : « ↩ Annuler » (ou Ctrl+Z / Cmd+Z) revient en arrière
  pas à pas, et fermer par « ✕ » abandonne toutes les retouches sans rien enregistrer.

> ⚠️ **Point d'attention** — L'aimant s'appuie sur les **contrastes de l'image de
> fond**. Sur un plan dessiné (traits nets, aplats de couleur), il tombe juste ; sur
> une photo aérienne où deux parcelles voisines se ressemblent, il peut accrocher une
> ombre ou un feuillage plutôt que la limite réelle — c'est là que **baisser la
> sensibilité** aide : l'aimant ne retient alors que les limites franches, quitte à ne
> rien accrocher du tout. Il reste une aide : le tracé final est celui qu'on valide à
> l'œil. Pour coller proprement **deux zones entre elles**, préférez « Voisins » ou
> « Aligner » plutôt que l'aimant image. Par ailleurs, si l'image de fond du plan est
> hébergée sur un autre site, le navigateur interdit d'en lire les couleurs : le bouton
> affiche alors « Indispo. » et l'édition continue normalement sans aimant.

Toute modification est visible **en temps réel** chez les autres utilisateurs
connectés, sans recharger la page.

## Retrouver une zone ou un repère

En **mode consultation** (carte ouverte sans tracé ni édition de contour), une
**barre de recherche** apparaît au-dessus du plan. Elle permet de filtrer les
**zones** et les **repères** déjà chargés sur la carte active :

- **Recherche libre** : tapez un nom, un mot de la description, une espèce, un mot
  des textes visite… Plusieurs mots peuvent être combinés (tous doivent correspondre).
- **Filtres** (bouton ⚙️) : type (zones seules, repères seuls), **catégories** (plusieurs
  cases cochables — un lieu sort dès qu'il porte l'une d'elles), infrastructures
  uniquement, espèce présente, présence de **tâches actives** ou de tutoriels liés. Sur
  téléphone, les filtres s'ouvrent dans la **feuille basse** commune (poignée, mi-hauteur
  ou plein écran, glisser vers le bas ou bouton retour pour fermer, « Voir la carte » pour
  revenir au plan).
  Contrairement à l'ancien filtre « état », les catégories s'appliquent **aussi aux
  repères** : cocher une catégorie ne fait plus disparaître les repères de la carte.

### Catégories affichées par défaut et catégories cachées (par carte)

Dans **Paramètres → Cartographie → Cartes**, chaque carte de la liste porte deux choix de
catégories. Seules sont proposées les catégories **qui concernent cette carte** : celles
créées pour toutes les cartes et celles créées pour cette carte-là (et visibles sur la
carte de travail). Ce sous-onglet « Cartes » demande le droit de **consulter les
réglages** : une personne qui gère seulement les zones ou les repères ne le voit pas.

- **Catégories affichées par défaut** : elles sont cochées d'office dans les filtres à
  l'ouverture de la carte — les lieux qui n'en portent aucune apparaissent estompés.
  Chacun peut ensuite changer ses filtres librement. Aucune case cochée = tous les lieux
  sont mis en avant. Le choix est refait à chaque changement de carte : passer de la
  Forêt au N3 applique les catégories du N3.
- **Catégories cachées** : elles disparaissent des filtres de cette carte, et un lieu qui
  **n'a que** des catégories cachées n'apparaît plus du tout sur cette carte de travail
  (ni sur le plan, ni dans la recherche). Un lieu qui garde au moins une autre catégorie
  reste affiché ; un lieu sans catégorie aussi.

Une même catégorie ne peut pas être à la fois affichée par défaut et cachée : une fois
cochée d'un côté, elle n'est plus proposée de l'autre.

Ces deux réglages ne concernent que la **carte de travail** (onglet Carte). La Visite garde
son propre choix de catégories affichées par défaut (Paramètres → Visite), et les plans
(Plan Lyautey, plan des personnels, plan e-nov) leurs propres catégories cochées et
masquées.

> ⚠️ **Points d'attention**
>
> - Cacher une catégorie retire ses lieux de la carte **pour tout le monde**, gestionnaires
>   compris : un lieu qui n'a que des catégories cachées ne se modifie plus depuis la carte.
>   Pour le retoucher, décocher la catégorie cachée le temps de la modification, ou passer
>   par l'inventaire « Zones & repères ».
> - Cacher n'est pas protéger : c'est un désencombrement de l'affichage. Pour réserver un
>   lieu à certains publics, utiliser l'audience du lieu ou de sa catégorie.
> - L'ancien réglage unique « Catégories de lieux affichées par défaut sur la carte » (commun
>   à toutes les cartes) a été remplacé : sa valeur a été recopiée sur chaque carte, en n'y
>   gardant que les catégories qui la concernent.

> L'**affichage** du plan en consultation (zones, repères, regroupements au dézoom,
> boutons zoom / « Me suivre ») est aligné sur le Plan Lyautey et la Visite. La carte de
> travail garde en revanche sa **barre d'outils** et ses **filtres de lieux** — sans les
> puces de recherche ni de catégories du Plan.
> Seules les tâches **encore en jeu** comptent sur la carte : terminées (en attente
> de validation), validées, archivées, ou rattachées à un projet terminé/validé n'affichent
> plus de pastille de tâche et ne font plus hériter leurs tutoriels au lieu. Les tutoriels
> **directement** liés à une zone ou un repère restent visibles.

### Pastilles colorées des tâches

Sur la carte, un **point coloré** signale qu'une zone ou un repère porte au moins une tâche
encore en jeu. Il se place **en haut à droite** du repère, ou à côté du nom de la zone :

| Point                    | Ce qu'il veut dire                                    |
| ------------------------ | ----------------------------------------------------- |
| 🔴 **rouge clignotant**  | au moins une tâche **à faire** (des places restent)   |
| 🟠 **orange clignotant** | au moins une tâche **en cours**                       |
| 🟢 **vert fixe**         | les tâches du lieu sont **terminées** ou **validées** |

Quand un lieu cumule plusieurs tâches, c'est la plus **actionnable** qui l'emporte
(à faire > en cours > terminée) : un élève voit d'un coup d'œil où il reste quelque chose à
prendre. Les tâches **en attente** (« on hold ») et celles détachées de leur lieu n'affichent
aucun point.

Quand des repères proches sont regroupés au dézoom (la pastille chiffrée décrite plus haut),
**le groupe porte le point du lieu le plus actionnable qu'il contient** : l'état des tâches
reste lisible à l'arrivée sur la carte, sans avoir à zoomer pour le découvrir.

Ces pastilles sont **toujours visibles**, sans réglage à activer : elles n'ont pas de rapport
avec le point violet des tutoriels décrit ci-dessous.

### Pastille violette des tutoriels

Sur la carte, un **petit point violet** peut signaler qu'une zone ou un repère est lié à
au moins un tutoriel (en bas à gauche du repère, ou à côté du nom de la zone).

Ce témoin est **éteint par défaut**. Un administrateur l'allume dans
_Réglages → Cartographie → Cartes_ (« Afficher le point violet sur les zones et repères liés à un
tutoriel »). Les liens tutoriel ↔ lieu restent inchangés : seuls le filtre « tutoriels liés »
et l'onglet Tutoriels de la fiche permettent de les retrouver quand le point est masqué.

- **Raccourci clavier** : touche **/** ou **Ctrl+K** (Cmd+K sur Mac) place le curseur
  dans le champ de recherche.

Quand un filtre est actif :

- les lieux **correspondants** restent visibles normalement ;
- les autres lieux sont **atténués** sur le plan (ils restent visibles mais moins
  lisibles, et ne s'ouvrent plus au clic) ;
- une **liste de résultats** sous la barre permet de **cliquer** sur un lieu : la
  fiche s'ouvre et la carte se **centre** doucement sur ce point.

Le compteur indique combien de zones et de repères correspondent. Un bouton ✕ ou
« Tout effacer » remet la carte en vue complète. Élèves et professeurs utilisent
la même recherche en lecture seule.

## L'inventaire admin « Zones & repères »

Dans **Réglages administrateur → Cartographie → Zones & repères**, un inventaire
liste **toutes les zones et tous les repères, toutes cartes confondues** — là où la
recherche de la carte ne couvre que le plan affiché. C'est l'outil de relecture
d'ensemble : repérer les doublons, les fiches sans description, les lieux restés sur
la mauvaise carte. Les personnes qui ont seulement le droit de gérer les zones ou les
repères voient cet onglet Cartographie et cet inventaire (sans les réglages généraux ni le
sous-onglet « Cartes »).

- **Recherche libre** : même moteur que la barre de la carte (nom, espèces,
  catégories, textes de visite, note d'un repère — plusieurs mots combinables).
- **Filtres** : type (zones seules / repères seuls) et carte.
- **Surface des zones** : pour chaque zone d'un plan calé GPS, la ligne affiche sa
  surface estimée (« 📐 ≈ 1 234 m² »). Le compteur en tête de liste additionne la
  surface des zones affichées qui se trouvent sur un plan calé (« ≈ 3 400 m² sur les
  cartes calées »). Les zones des plans non calés n'ont pas de surface.

### Édition directe, sans bouton « Modifier »

Chaque ligne est un mini-formulaire **toujours éditable** : on clique dans un champ,
on tape, et l'enregistrement part **à la sortie du champ** (Entrée valide, Échap
annule la frappe en cours). On peut ainsi enchaîner un grand nombre de corrections
sans jamais ouvrir de fiche :

- **emoji** et **nom** (zone comme repère) ;
- **carte** (liste déroulante — déplacer un lieu vers un autre plan) ;
- **description** (zone) ou **note** (repère) ;
- **espèces** : pastilles à retirer d'un ✕, champ « + espèce » avec suggestions du
  catalogue biodiversité ;
- **catégories** : pastilles à activer/désactiver d'un clic (seules les catégories
  applicables au type et à la carte du lieu sont proposées) ;
- dépliant **« Visite & détails »** : les quatre textes du mode Visite (sous-titre,
  accroche, titre et contenu du bloc dépliable), plus la **couleur** d'une zone et la
  **position X/Y (%)** d'un repère.

Seuls le tracé des zones, le déplacement fin des repères à la souris, les photos et
les blocs d'images de visite restent du ressort de la fiche, sur la carte.

### Édition par lot

Des **cases à cocher** (et un « Tout sélectionner » sur la liste filtrée) ouvrent une
barre d'actions qui s'applique à toute la sélection :

- **ajouter / retirer une catégorie** (les lieux qui la portent déjà, ou auxquels
  elle ne s'applique pas, sont ignorés et comptés) ;
- **ajouter / retirer une espèce** ;
- **déplacer vers une carte** ;
- **définir l'emoji** (champ emoji des repères, préfixe du nom des zones) ;
- **rechercher / remplacer** dans les noms (et, sur option, dans les descriptions
  et notes) — remplacement littéral de toutes les occurrences ;
- **supprimer les lieux** sélectionnés, après confirmation explicite (photos et
  contenus de visite partent avec — irréversible).

Le bouton « Appliquer » annonce **combien de lieux sont réellement concernés** avant
d'agir, une progression s'affiche pendant le traitement, et le bilan distingue les
lieux mis à jour, ceux déjà conformes et les éventuels échecs.

Le sous-onglet est ouvert à qui peut consulter les réglages **ou** gérer les zones ou les
repères ; l'enregistrement demande « Gestion zones » pour une zone et « Gestion repères »
pour un repère.

## « Messages reçus sur les lieux »

**Réglages administrateur → Cartographie → Messages.** Un journal de ce que les
utilisateurs écrivent **sur un lieu**, tous lieux confondus, du plus récent au plus
ancien :

- les **commentaires** déposés sur une zone ou un repère depuis la carte ;
- les **signalements** envoyés depuis le plan des personnels, par le bouton
  « Signaler un problème ou proposer une correction » d'une fiche de lieu (voir
  [Plan des personnels](../plan/plan-des-personnels.md)).

Chaque ligne indique le lieu concerné (avec son emoji), le type — zone ou repère —,
la date, l'auteur, le texte et le nombre de photos. Un lieu supprimé entre-temps
laisse son message dans la liste, sous la mention « Lieu supprimé » : le message a
été écrit, l'effacer d'office réécrirait l'histoire.

Cet écran sert à **prendre connaissance** et à **classer**, pas à répondre : pour
répondre, modérer ou supprimer un message, ouvrez le lieu concerné sur la carte — le
message y vit, avec les réactions et le signalement habituels.

### Classer un message : « pris en compte », « traité », « sans suite »

Chaque message porte un état, affiché en pastille. Il naît **Nouveau** et se classe en
un clic :

- **Pris en compte** — c'est lu, quelqu'un s'en occupe ;
- **Traité** — c'est fait ;
- **Sans suite** — non, et c'est assumé. Dire « non, et c'est vu » vaut mieux que
  laisser un message ouvert pour l'éternité, et c'est la seule alternative à la
  suppression, qui efface l'information au lieu de la clore.

Le compteur « à traiter » en tête de liste et la case **« À traiter seulement »**
permettent de vider la pile sans relire ce qui est déjà classé. Reclasser un message
(de « traité » à « sans suite », par exemple) est une correction, pas un historique :
seul le dernier état est conservé, et le journal d'audit garde la trace des passages.

**Qui peut classer ?** Les comptes portant la permission **« Traitement des messages
de lieux »**, accordée au seul profil **Administrateur** à la livraison. Elle
s'attribue ensuite à n'importe quel profil depuis « Profils RBAC » — le jour où
l'établissement désigne des référents. Les autres voient les états sans pouvoir les
changer : aucun bouton ne leur est proposé.

**Et l'auteur ?** Il lit l'état de ses propres messages sur la fiche du lieu, dans le
plan des personnels (bloc « Mes signalements sur ce lieu »). Il voit _que_ c'est
traité, jamais _par qui_.

Ce qui est arrivé depuis votre dernière visite est marqué « nouveau » et compté en
tête de liste ; « Tout marquer comme lu » remet le compteur à zéro. **Ce repère de
lecture est propre à l'appareil** : il ne dit pas à vos collègues que vous avez lu, et
il ne suit pas d'un ordinateur à l'autre.

Enfin, chaque message reçu sur un lieu arrive aussi dans la **cloche de notifications**
(rubrique « Messages ») de toutes les personnes qui traitent ces messages, **même si la
console n'était pas ouverte**, avec le nom du lieu, la carte, l'auteur et le début du
texte. Un clic sur la notification **ouvre la carte concernée, centrée sur le lieu, avec
sa fenêtre ouverte sur les messages**. Dans l'autre sens, l'auteur est prévenu quand son
message est pris en compte, traité ou classé sans suite, et le même clic le ramène au lieu.

## La vue grand écran « Cartes & tâches »

Sur un écran suffisamment large (ordinateur, tableau interactif), les onglets Carte et
Tâches fusionnent en une vue unique : **la carte à gauche, la liste des tâches à
côté**. L'onglet s'appelle alors « Cartes, tâches et tuto » (ou « Cartes & tâches » si
le module tutoriels est désactivé). C'est la vue idéale pour lancer une séance : on
montre le jardin et on distribue le travail sans changer d'écran. Sur écran étroit,
les onglets restent séparés.

La carte occupe **toute la hauteur disponible** de la vue, à côté de la colonne des
tâches qui défile pour elle seule : plus l'écran est haut, plus le plan est grand.

## ⚠️ Points d'attention sur l'existant

> ℹ️ **Changement (septembre 2026)** — L'**historique des cultures** a été retiré de la
> fiche des zones. Il ne s'alimentait plus depuis que les espèces d'une zone se choisissent
> dans une liste (il ne retenait que l'ancien champ « plante actuelle », vide partout), et
> il présentait comme une date de récolte la simple date d'une modification. La section
> « Historique cultures » a donc disparu de l'onglet **Info**, et retirer une espèce d'une
> zone n'archive plus rien. Les rares lignes anciennes sont conservées à part, le temps de
> leur export, avant la suppression définitive.
>
> De même, l'ancien champ **« plante actuelle »** d'une zone (ou d'un repère) n'est plus
> affiché : seules comptent les espèces choisies dans la liste « Êtres vivants ». Les
> repères qui portaient encore un nom dans ce champ ont été rattachés à la fiche
> correspondante quand elle existait sans ambiguïté.

> ⚠️ **Point d'attention** — Les fiches des zones et repères mélangent deux usages :
> les informations de travail (état, espèces, description) et les **textes du mode
> Visite** (sous-titre, accroche, bloc dépliable). C'est pratique pour tout éditer au
> même endroit, mais le formulaire « Modifier » est long, et il faut comprendre que
> les champs marqués « (visite) » ne s'affichent que dans le parcours grand public.

> ⚠️ **Point d'attention** — Le bouton « Me suivre » (suivi GPS) n'apparaît que si un
> administrateur a calé le plan sur trois points GPS **et** activé la géolocalisation
> pour ce plan. Sans ce calage, rien ne signale que la fonction existe — pensez à le
> faire pour les plans utilisés sur le terrain.

> ⚠️ **Point d'attention** — La **surface des zones** n'est qu'une estimation : sa
> justesse dépend entièrement de la qualité du calage GPS du plan (trois points bien
> écartés, coordonnées précises). Un calage approximatif donne des surfaces fausses sans
> que rien ne le signale. Sur un plan non calé, aucune surface n'est affichée.

Pendant le suivi, une bannière sous la barre d'outils indique l'état : suivi actif (avec
la précision en mètres), localisation refusée, **position indisponible ou délai dépassé**
(le message d'échec s'affiche au lieu d'un « Acquisition… » sans fin), position hors du
plan, signal trop imprécis, ou **calage du plan incohérent** — dans ce dernier cas, le
message invite à le signaler à un professeur : c'est le calage qui est à refaire, pas la
position de l'élève qui est en cause. La position reste entièrement sur l'appareil : elle
n'est jamais envoyée au serveur.

## Lisibilité des noms sur la carte

Les **emojis et noms** affichés sur le plan s'adaptent à la **taille du plateau** à
l'écran : plus la carte est petite (téléphone, vue « Cartes & tâches » avec panneau
latéral), plus l'application garantit un **minimum de lisibilité** plutôt que de réduire
le texte jusqu'à l'illisible. Sur tablette et téléphone, les étiquettes sont légèrement
**agrandies** automatiquement. Un **nom de zone** et un **nom de repère** s'écrivent de
la même façon (même police, même graisse, même halo) : seule la place change — le nom
d'une zone est dans la forme, celui d'un repère juste sous l'épingle.

**Le dessin des emojis dépend de l'appareil, volontairement.** Sur iPhone, iPad et Mac,
ce sont les emojis d'Apple qui s'affichent — les mêmes que dans les messages et les
applications du téléphone. Partout ailleurs (Android, Windows, Chromebook), l'application
fournit elle-même un jeu d'emojis unique, pour que deux élèves sur deux machines
différentes voient le même dessin. Un emoji peut donc ne pas avoir exactement la même
allure d'un appareil à l'autre : c'est normal, et c'est ce qui garantit qu'il s'affiche
toujours, y compris pendant un zoom sur la carte.

**Côté utilisateur** : le bouton **Aa** de la barre d'outils carte permet trois niveaux
locaux (Normal / Grand / Très grand), mémorisés sur l'appareil. Le même bouton est
disponible dans le bandeau du plan de **Visite**, et le niveau choisi s'applique aussi
aux libellés des plateaux Gnomes & Licornes.

L'**emoji d'une zone** est désormais enregistré à part du nom (le sélecteur d'emoji du
formulaire fait foi) : son affichage sur le plan et dans la fiche ne dépend plus de la
présence d'une espace après l'emoji ni de la liste d'emojis configurée. Les zones
existantes continuent d'afficher l'emoji écrit en tête de leur nom.

Un **nom de zone trop long** pour la place disponible n'est plus « compressé » en
déformant les lettres : il est d'abord légèrement réduit, puis coupé avec « … » si
nécessaire — le nom complet reste lisible en ouvrant la fiche de la zone (et au survol
du libellé sur ordinateur).

**Côté administrateur** (Réglages → modules), des curseurs permettent d'ajuster pour
toute l'établissement :

- **taille des emojis** et **taille des noms** sur zones et repères (pourcentage par
  rapport à un affichage de référence) ;
- **écart entre emoji et nom** ;
- **grossissement des étiquettes au zoom** (0 % = taille constante quand on zoome,
  100 % = grossit linéairement avec le zoom ; la valeur par défaut est intermédiaire) ;
  Pour un **tableau interactif** ou des élèves ayant besoin de caractères plus grands,
  monter les pourcentages emoji/nom (par exemple 150 %) dans les réglages admin.

**Placement de l'emoji et du nom d'une zone.** L'emoji est posé au point le plus
« intérieur » de la forme — celui qui est le plus loin de tous ses bords, tel qu'on le voit
à l'écran, même sur un plan très allongé — et le nom s'écrit juste en dessous. L'emoji
reste donc à la même place quand le nom apparaît ou disparaît. Une zone sans emoji a son
nom centré sur ce point. Les pastilles d'état (tâche à faire, tutoriel) se placent en coin,
autour de l'emoji (ou du nom) sans le recouvrir.

**Quand la place est prise.** Avant de masquer quoi que ce soit, l'application cherche une
autre place :

- si l'emoji tombe sur celui d'une zone voisine ou sous l'épingle d'un repère (ou une
  pastille de groupe de repères), il se décale vers un autre point bien à l'intérieur de sa
  zone ;
- si le nom ne tient pas sous l'emoji, il se met **à droite**, puis **à gauche**, puis
  **au-dessus** de l'emoji ; à défaut, l'emoji et son nom essaient ensemble un autre point
  de la zone.

Les repères restent toujours visibles et cliquables : une étiquette les évite quand elle le
peut, mais un repère ne fait jamais disparaître une étiquette.

**Quand la place manque.** Les étiquettes ne se chevauchent jamais : quand deux zones sont
trop proches à l'écran, l'application garde d'abord les **emojis** (le repère visuel le plus
utile), puis les noms, en privilégiant les grandes zones. Un emoji ou un nom masqué
réapparaît dès qu'on **zoome**. La zone sélectionnée garde toujours son emoji et son nom.
Un nom dont l'emoji est masqué est masqué aussi, pour ne jamais laisser un nom orphelin.
Le nom complet reste accessible en ouvrant la fiche. Le **mode édition** du plan applique
exactement les mêmes règles que la consultation (les emojis restent visibles même quand les
noms sont désactivés).

> **⚠️ Points d'attention**
>
> - Le réglage « **masquage nom de zone : côté minimal** » est toujours présent dans les
>   réglages, mais il **n'a plus d'effet** : le masquage suit désormais uniquement la place
>   réellement disponible à l'écran. Il sera retiré dans un lot ultérieur.
> - Sur un plan chargé et vu de loin, certains emojis peuvent être masqués alors qu'ils
>   s'affichaient tous (en se superposant) auparavant : il suffit de zoomer.
> - Comme l'emoji évite les repères, il n'est pas toujours au centre visuel du bâtiment :
>   sur un bâtiment long couvert d'épingles, il peut se trouver vers une extrémité.
> - Ne pas recopier l'emoji au début du nom d'une zone ou d'un repère : il est déjà affiché
>   à part, et le nom, plus long, gêne ses voisins. Les noms existants qui commençaient par
>   leur propre emoji ont été nettoyés automatiquement.

## Pour aller plus loin

- Retour au [sommaire de la documentation](../README.md) ;
- [Présentation générale de ForetMap](presentation.md) ;
- [Plantes et biodiversité](plantes-et-biodiversite.md) — le catalogue d'espèces que
  l'on associe aux zones et repères ;
- Les tâches liées aux lieux sont détaillées dans le document « tâches, tutoriels et
  validation » (voir sommaire) ; le parcours grand public dans « visite et mascottes ».
