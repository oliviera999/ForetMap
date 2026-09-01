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
  pour les professeurs et pour le mode Visite ;
- **caler le plan sur le GPS** (optionnel) : on indique trois points du plan et leurs
  coordonnées réelles. Une fois ce calage fait et la géolocalisation activée pour ce
  plan, un bouton « Me suivre » apparaît sur la carte : la mascotte suit alors la
  position réelle de l'utilisateur sur le plan (avec des messages clairs si la
  localisation est refusée, si le signal est faible ou si l'on est hors du plan).

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
- une **couleur** de remplissage (palette de dix couleurs) ;
- la liste des **êtres vivants** présents (choisis dans le catalogue biodiversité —
  plusieurs espèces possibles, l'ordre choisi est conservé à l'affichage) ;
- une ou plusieurs **catégories** (Verger, Compostage, Zone pédagogique…), créées par
  l'administrateur et utilisables comme filtre sur la carte — voir « Catégories de
  lieux » plus bas ;
- une **description** libre (avec mise en forme) ;
- des **photos** avec légende, que le professeur peut réordonner et supprimer ;
- un **historique des cultures** : quand une espèce est retirée de la zone, elle est
  automatiquement archivée avec la date du jour — la fiche garde ainsi la mémoire de
  ce qui y a poussé ;
- des **textes pour le mode Visite** (sous-titre, accroche, bloc dépliable, images) :
  ce que le grand public lira au même endroit pendant une visite ;
- des **commentaires** contextuels (observations des élèves et du professeur), si le
  module est activé.

## Les repères

Un repère est un **point** posé sur le plan, complémentaire des zones. Il porte un
**emoji**, un **nom**, une **note** libre, ses **photos** (mêmes possibilités que les
zones), ses **espèces associées**, ses **catégories** (mêmes catégories que les zones)
et, comme les zones, ses textes pour le mode Visite, ses tâches et tutoriels liés.

Pour éviter les déplacements accidentels, la position des repères est **verrouillée**
par défaut : le professeur clique sur le cadenas « Repères » de la barre d'outils pour
pouvoir les faire glisser, puis reverrouille.

## Catégories de lieux

Les catégories classent les zones **et** les repères, et servent de filtre sur la carte.
Elles remplacent l'ancien couple « état de culture » (Vide / En croissance / Prêt à
récolter) et case « zone spéciale ».

Une catégorie porte un **libellé**, un **emoji**, une **couleur**, une **description**
(infobulle) et un **ordre d'affichage**. Elle est :

- soit **globale** — utilisable sur toutes les cartes (cas le plus courant : Compostage,
  Verger, Zone pédagogique) ;
- soit **rattachée à une carte** — proposée uniquement sur ce plan (ex. « Salles » sur un
  plan de bâtiment).

Elle peut aussi être restreinte aux **zones seules**, aux **repères seuls**, ou valoir
pour **les deux** (par défaut).

Une case **« Infrastructure »** distingue les lieux qui ne sont pas des cultures (mare,
ruches, compostage, cuve…). Elle reprend exactement le comportement de l'ancienne case
« zone spéciale » : ces lieux n'affichent pas de section Biodiversité en mode Visite, ne
sont jamais proposés comme cible de mission ou de tutoriel, et leur contour apparaît en
pointillés sur la carte. Les zones qui étaient marquées « spéciales » ont été
automatiquement reprises dans une catégorie **Infrastructure**.

Une catégorie peut être **désactivée** plutôt que supprimée : elle reste posée sur les
lieux mais disparaît des filtres et des formulaires. La supprimer la retire en revanche
de toutes les zones et de tous les repères qui la portaient.

**Où les créer** : Réglages administrateur → « Catégories de lieux ». Il faut la
permission « Gestion zones ».

**Où les poser** : dans la fiche d'une zone ou d'un repère, onglet « Modifier », bloc
« Catégories » (cases à cocher — plusieurs catégories possibles sur un même lieu).

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Carte**. Il peut zoomer, se déplacer, afficher ou masquer
   les noms des zones, **ajuster la taille du texte sur la carte** (bouton « Aa » dans
   la barre d'outils : Normal, Grand, Très grand — mémorisé sur l'appareil), passer en
   plein écran. Sur téléphone, un bouton « Gestes » évite de déclencher la carte en
   faisant défiler la page.
2. Il **touche une zone ou un repère** : la fiche s'ouvre avec ses onglets — Tâches,
   Tutoriels, Info, Photos (l'onglet Tâches ou Tutoriels n'apparaît que s'il y a
   quelque chose à montrer).
3. Dans l'onglet **Tâches**, il coche une ou plusieurs tâches disponibles à cet
   endroit et les **prend en charge** directement.
4. Un bouton permet aussi d'**ouvrir l'onglet Tâches de l'application filtré sur ce
   lieu**, pour voir tout ce qui s'y rattache.
5. Dans l'onglet **Info**, il lit la description, les espèces présentes (avec renvoi
   vers leurs fiches biodiversité), l'historique des cultures, et peut laisser un
   commentaire d'observation.

## Comment ça se passe — côté professeur

1. **Dessiner une zone** : bouton « Zone » de la barre d'outils, puis clics successifs
   sur le plan pour poser les points du contour (avec annulation du dernier point).
   À partir de trois points, « Terminer » ouvre la fenêtre de création : nom, êtres
   vivants, catégories, couleur…
2. **Poser un repère** : bouton « Repère », puis clic à l'endroit voulu ; on renseigne
   ensuite nom, emoji et note.
3. **Modifier une fiche** : ouvrir la zone ou le repère, onglet « Modifier ». On y
   change tout (nom, espèces, catégories, couleur, description, textes visite, emoji). Un
   bouton dédié permet de **retoucher le contour** de la zone (voir « Retoucher le
   contour d'une zone » plus bas), puis de sauvegarder.
4. **Dupliquer une zone** : un bouton dans l'en-tête de la fiche crée une copie, utile
   pour des parcelles semblables.
5. **Gérer les photos** : onglet Photos — ajout avec légende, réorganisation par
   glisser-déposer, suppression.
6. **Lier tâches et tutoriels** : depuis les onglets Tâches et Tutoriels de la fiche,
   on associe ou dissocie les tâches et tutoriels existants ; les élèves les
   retrouvent ensuite au même endroit.
7. **Supprimer** une zone ou un repère : la fiche, ses photos et son contenu de visite
   sont retirés ensemble.

### Retoucher le contour d'une zone

Depuis la fiche d'une zone, le bouton « Modifier le contour » ouvre un mode d'édition
sur la carte. Le contour apparaît alors avec **une poignée par sommet** (les coins du
tracé), et une petite **poignée pointillée au milieu de chaque côté**. Tout se fait
directement sur le plan ; rien n'est enregistré tant qu'on n'a pas cliqué « Sauver ».

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
- **Se tromper n'est pas grave** : « ↩ Annuler » (ou Ctrl+Z / Cmd+Z) revient en arrière
  pas à pas, et fermer par « ✕ » abandonne toutes les retouches sans rien enregistrer.

> ⚠️ **Point d'attention** — L'aimant s'appuie sur les **contrastes de l'image de
> fond**. Sur un plan dessiné (traits nets, aplats de couleur), il tombe juste ; sur
> une photo aérienne où deux parcelles voisines se ressemblent, il peut accrocher une
> ombre ou un feuillage plutôt que la limite réelle — c'est là que **baisser la
> sensibilité** aide : l'aimant ne retient alors que les limites franches, quitte à ne
> rien accrocher du tout. Il reste une aide : le tracé final est celui qu'on valide à
> l'œil. Par ailleurs, si l'image de fond du plan est
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
  uniquement, espèce présente, présence de **tâches actives** ou de tutoriels liés.
  Contrairement à l'ancien filtre « état », les catégories s'appliquent **aussi aux
  repères** : cocher une catégorie ne fait plus disparaître les repères de la carte.

> Seules les tâches **encore en jeu** comptent sur la carte : terminées (en attente
> de validation), validées, archivées, ou rattachées à un projet terminé/validé n'affichent
> plus de pastille de tâche et ne font plus hériter leurs tutoriels au lieu. Les tutoriels
> **directement** liés à une zone ou un repère restent visibles.

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

## La vue grand écran « Cartes & tâches »

Sur un écran suffisamment large (ordinateur, tableau interactif), les onglets Carte et
Tâches fusionnent en une vue unique : **la carte à gauche, la liste des tâches à
côté**. L'onglet s'appelle alors « Cartes, tâches et tuto » (ou « Cartes & tâches » si
le module tutoriels est désactivé). C'est la vue idéale pour lancer une séance : on
montre le jardin et on distribue le travail sans changer d'écran. Sur écran étroit,
les onglets restent séparés.

## ⚠️ Points d'attention sur l'existant

> ⚠️ **Point d'attention** — L'**historique des cultures** s'alimente tout seul : dès
> qu'une espèce est retirée de la liste d'une zone, elle y est archivée avec **la date
> du jour de la modification**, présentée comme une date de récolte. Si l'on met à
> jour la fiche longtemps après la récolte réelle, ou si l'on retire une espèce saisie
> par erreur, l'historique enregistre quand même une « récolte » à la mauvaise date —
> et il n'existe pas d'écran pour corriger ou supprimer une ligne d'historique.

> ⚠️ **Point d'attention** — Les fiches des zones et repères mélangent deux usages :
> les informations de travail (état, espèces, description) et les **textes du mode
> Visite** (sous-titre, accroche, bloc dépliable). C'est pratique pour tout éditer au
> même endroit, mais le formulaire « Modifier » est long, et il faut comprendre que
> les champs marqués « (visite) » ne s'affichent que dans le parcours grand public.

> ⚠️ **Point d'attention** — Le bouton « Me suivre » (suivi GPS) n'apparaît que si un
> administrateur a calé le plan sur trois points GPS **et** activé la géolocalisation
> pour ce plan. Sans ce calage, rien ne signale que la fonction existe — pensez à le
> faire pour les plans utilisés sur le terrain.

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
**agrandies** automatiquement.

**Côté utilisateur** : le bouton **Aa** de la barre d'outils carte permet trois niveaux
locaux (Normal / Grand / Très grand), mémorisés sur l'appareil.

**Côté administrateur** (Réglages → modules), des curseurs permettent d'ajuster pour
toute l'établissement :

- **taille des emojis** et **taille des noms** sur zones et repères (pourcentage par
  rapport à un affichage de référence) ;
- **écart entre emoji et nom** ;
- **grossissement des étiquettes au zoom** (0 % = taille constante quand on zoome,
  100 % = grossit linéairement avec le zoom ; la valeur par défaut est intermédiaire) ;
- **masquage adaptatif des noms de zone** : sur une zone très petite à l'écran, seul
  l'emoji peut rester visible ; le nom complet reste accessible en ouvrant la fiche.
  Le seuil est réglable (côté minimal en × hauteur du libellé ; **2,5 par défaut** —
  plus bas = noms affichés plus souvent, plus haut = masquage plus strict).

Pour un **tableau interactif** ou des élèves ayant besoin de caractères plus grands,
monter les pourcentages emoji/nom (par exemple 150 %) dans les réglages admin.

Sur les **petites zones**, seul l'emoji peut rester visible si le nom ne tiendrait pas
de façon lisible ; le nom complet reste accessible en ouvrant la fiche. Un administrateur
peut ajuster ce comportement dans les réglages (seuil « masquage nom de zone »).

## Pour aller plus loin

- Retour au [sommaire de la documentation](../README.md) ;
- [Présentation générale de ForetMap](presentation.md) ;
- [Plantes et biodiversité](plantes-et-biodiversite.md) — le catalogue d'espèces que
  l'on associe aux zones et repères ;
- Les tâches liées aux lieux sont détaillées dans le document « tâches, tutoriels et
  validation » (voir sommaire) ; le parcours grand public dans « visite et mascottes ».
