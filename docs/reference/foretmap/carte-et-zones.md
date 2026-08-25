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
- un **état** : Vide, En croissance, ou Prêt à récolter ;
- une case **« Zone spéciale »** pour les bâtiments et infrastructures (mare, ruches,
  compostage, pergola…) plutôt que les cultures ;
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
zones), ses **espèces associées** et, comme les zones, ses textes pour le mode Visite,
ses tâches et tutoriels liés.

Pour éviter les déplacements accidentels, la position des repères est **verrouillée**
par défaut : le professeur clique sur le cadenas « Repères » de la barre d'outils pour
pouvoir les faire glisser, puis reverrouille.

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Carte**. Il peut zoomer, se déplacer, afficher ou masquer
   les noms des zones, passer en plein écran. Sur téléphone, un bouton « Gestes »
   évite de déclencher la carte en faisant défiler la page.
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
   vivants, état, couleur, case « zone spéciale »…
2. **Poser un repère** : bouton « Repère », puis clic à l'endroit voulu ; on renseigne
   ensuite nom, emoji et note.
3. **Modifier une fiche** : ouvrir la zone ou le repère, onglet « Modifier ». On y
   change tout (nom, espèces, état, couleur, description, textes visite, emoji). Un
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
- **Sélectionner plusieurs sommets** : Maj+clic pour en ajouter un à un, ou **tracer un
  rectangle** en glissant sur le fond de carte pour attraper tous les sommets qu'il
  contient. Sur tablette, la bascule « Multi » remplace Maj : chaque appui ajoute ou
  retire un sommet. Les sommets sélectionnés sont entourés d'un cercle orange, et
  **glisser l'un d'eux déplace tout le groupe** d'un bloc. Un clic sur le fond
  désélectionne ; Échap aussi.
- **Aimanter le contour sur l'image** : la bascule « 🧲 Aimant » analyse l'image de
  fond du plan (l'analyse prend un instant la première fois) et **colle le sommet
  déplacé sur la limite visible la plus proche** — un bord de parcelle, un chemin, une
  haie — comme l'aimantation d'un logiciel de retouche photo. Un curseur règle la
  distance d'accroche. Le bouton « 🧲 Coller » applique l'aimantation d'un coup aux
  sommets sélectionnés (ou à tout le contour si rien n'est sélectionné). Maintenir la
  touche Alt suspend l'aimant le temps d'un geste, pour placer un sommet à la main.
- **Se tromper n'est pas grave** : « ↩ Annuler » (ou Ctrl+Z / Cmd+Z) revient en arrière
  pas à pas, et fermer par « ✕ » abandonne toutes les retouches sans rien enregistrer.

> ⚠️ **Point d'attention** — L'aimant s'appuie sur les **contrastes de l'image de
> fond**. Sur un plan dessiné (traits nets, aplats de couleur), il tombe juste ; sur
> une photo aérienne où deux parcelles voisines se ressemblent, il peut accrocher une
> ombre ou un feuillage plutôt que la limite réelle. Il reste une aide : le tracé final
> est celui qu'on valide à l'œil. Par ailleurs, si l'image de fond du plan est
> hébergée sur un autre site, le navigateur interdit d'en lire les couleurs : le bouton
> affiche alors « Indispo. » et l'édition continue normalement sans aimant.

Toute modification est visible **en temps réel** chez les autres utilisateurs
connectés, sans recharger la page.

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

## Pour aller plus loin

- Retour au [sommaire de la documentation](../README.md) ;
- [Présentation générale de ForetMap](presentation.md) ;
- [Plantes et biodiversité](plantes-et-biodiversite.md) — le catalogue d'espèces que
  l'on associe aux zones et repères ;
- Les tâches liées aux lieux sont détaillées dans le document « tâches, tutoriels et
  validation » (voir sommaire) ; le parcours grand public dans « visite et mascottes ».
