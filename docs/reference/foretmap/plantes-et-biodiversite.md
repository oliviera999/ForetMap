# ForetMap — Plantes et biodiversité

> **Public de ce document : professeurs et administrateurs.**
> Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

L'onglet **Biodiversité** est l'encyclopédie du jardin : un catalogue de **fiches
espèces** très complètes (plantes, mais aussi les autres êtres vivants du jardin).
Ces fiches nourrissent le reste de l'application : ce sont elles que l'on associe aux
zones et repères de la carte, au réseau trophique, au glossaire et aux quiz. C'est
aussi un outil pédagogique en soi : les élèves y explorent les espèces, et déclarent
celles qu'ils ont **observées** sur le terrain.

## Qui l'utilise

- **Tout le monde** (y compris les simples visiteurs) peut consulter le catalogue. Les fiches
  s'ouvrent aussi depuis la **visite** : chaque lieu du plan affiche ses espèces en vignettes
  (voir [Visite et mascottes](visite-et-mascottes.md)).
- **L'élève connecté** filtre, lit les fiches et enregistre ses observations.
- **Le professeur** crée et enrichit les fiches, avec des aides puissantes :
  pré-remplissage automatique, identification par photo, import en masse.

## La fiche espèce

Chaque fiche peut porter (tous les champs sont facultatifs sauf le nom) :

- les **noms** : nom usuel, deuxième nom, nom scientifique, et un **emoji** ;
- la **classification** : règne, grand groupe, famille, genre ;
- l'**écologie** : habitat, milieu, rôle dans l'écosystème, rôle trophique,
  origine géographique, **statut biogéographique** (indigène / introduit /
  envahissant), **statut UICN** (Liste rouge mondiale), cycle de vie / longévité,
  taille, reproduction ;
- l'**usage humain** : caractère **comestible** (oui / non / non renseigné), utilité,
  partie récoltée, valeur nutritive, plante ornementale ou non ;
- la **culture** : conseils de plantation, températures supportées, acidité du sol
  préférée, nutriments préférés ;
- la **détermination** : critères d'identification, confusions possibles, période
  d'observation (voir ci-dessous) ;
- des **remarques** libres (trois champs) et une description générale ;
- des **photos multiples**, rangées en six cases : illustration principale, espèce,
  feuille, fleur, fruit, partie récoltée — chaque case peut contenir plusieurs images
  (téléversées ou par lien) ;
- les **sources** des informations (liens et références).

La fiche affiche aussi automatiquement ses liens avec le reste de l'application : les
**mini-cartes** des zones et repères où l'espèce est présente, ses interactions du
réseau trophique (« qui mange qui, qui aide qui »), les termes du glossaire et les
questions de quiz qui s'y rapportent.

Le catalogue contient aussi quelques **fiches-ressources** qui ne sont pas des êtres
vivants : litière de feuilles, compost, bois mort, biofilm, fruits tombés, carton de
lombricompost, crottes. Elles servent d’exemples de nourriture pour les vers, cloportes
et autres recycleurs, afin que le réseau trophique montre clairement ce qu’ils
décomposent.

S’y ajoutent des **espèces du jardin méditerranéen et marocain** et du potager local :
figuier de Barbarie (différent de l’oponce ornementale), volubilis, figuier, olivier,
caroubier, arganier, citronnier, palmier-dattier, artichaut, pois chiche, fenugrec,
lavande, bougainvillier, jasmin, capucine, souci, fenouil, verveine odorante (louiza),
câprier, tillandsia (fille de l’air, sans terre) — et la faune qui va avec
(cochenille du nopal, hérisson d’Algérie, tarente, chrysope, cigale, criquet
marocain). Si une fiche « Tillandsia aérienne » existait déjà, elle reste ; on
peut aussi chercher « tillandsia » ou « fille des airs ».

Le jardin lycée compte aussi des **auxiliaires** (carabe, perce-oreille, merle,
hirondelle, pipistrelle, crapaud), le **sol** (mycorhizes à Glomus, staphylin,
lombric commun distinct du ver de compost Eisenia), la **mare** (daphnie,
libellule, gerris — la gambusie n’est plus seule) et des **sauvages utiles**
(sureau, lierre, pâquerette, plantain, violette).

Certaines fiches portent un **statut biogéographique** : **indigène** (présente
naturellement dans la région, comme l’arganier ou le hérisson d’Algérie),
**introduite** (amenée par l’humain, comme le tilapia du Nil en aquaponie ou le
figuier de Barbarie), ou **envahissante** (introduite et qui menace les espèces
locales — la gambusie et l’élodée en sont des exemples du jardin). Ce statut
apparaît en pastille sur les vignettes et la fiche, et on peut filtrer le
catalogue dessus. Il complète l’origine géographique (texte libre) sans la
remplacer.

Elles peuvent aussi porter un **statut UICN** (Liste rouge mondiale) : codes
EX, EW, CR, EN, VU, NT, LC, DD ou NE. La pastille affiche par exemple « UICN LC »
(préoccupation mineure). Ce statut mondial est **indépendant** du statut
biogéographique local : la gambusie peut être à la fois « envahissante » ici et
« LC » sur la Liste rouge — un contraste pédagogique utile.

Dans les textes **« rôle dans l'écosystème »** et **« utilité pour l'être humain »**,
les mots qui correspondent à un terme du glossaire deviennent **cliquables
automatiquement** : l'élève qui bute sur un mot ouvre sa définition d'un clic, sans
que le professeur ait rien à saisir. Les termes du glossaire rattachés explicitement à
la fiche restent affichés à part, en pastilles.

## La section « Détermination »

Une description générale ne suffit pas à affirmer qu'on a bien affaire à telle espèce.
La fiche porte donc une section **Détermination**, dédiée à l'identification rigoureuse,
avec trois champs :

- **Critères de détermination** — ce qu'il faut observer pour être sûr : silhouette,
  taille, couleurs, nervures, nombre de pattes, lames, odeur, traces…
- **Confusions possibles** — les espèces ressemblantes et le critère qui tranche.
- **Quand l'observer** — saison, moment de la journée, stade (floraison, fructification,
  mue…), c'est-à-dire la période où la détermination est réellement possible.

Ces champs sont écrits pour **tous les êtres vivants du catalogue**, pas seulement les
plantes : le catalogue mêle végétaux, animaux, champignons, micro-organismes et
fiches-ressources. On parle donc de « caractères observables » et de « stade », jamais de
feuille ni de fleur.

Les **confusions possibles** s'affichent dans un **encadré d'alerte**, visuellement
distinct du reste de la fiche. C'est voulu : la forêt est comestible et les élèves
récoltent. Une ressemblance avec une espèce toxique ou piquante ne doit pas se lire comme
une ligne de métadonnée parmi d'autres.

La section est **repliée par défaut**, comme les autres sections de la fiche, et placée
juste après la photo : devant l'être vivant, on cherche d'abord à savoir ce que c'est. Un
site peut la faire afficher **dépliée d'office** pour tout le monde : Réglages → Modules
UI → « Fiches espèces — section « Détermination » toujours dépliée ».

La section n'apparaît que si le professeur a renseigné au moins un des trois champs. Elle
reste donc invisible sur les fiches non documentées, plutôt que d'ajouter un bandeau vide
sur tout le catalogue. Ces trois champs ne sont **pas** remplis par le pré-remplissage
automatique : les bases naturalistes interrogées ne fournissent pas de critères de
détermination. Ils se saisissent à la main, ou par l'import en masse.

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Biodiversité** : le catalogue s'affiche en **vignettes** —
   photo, nom, nom scientifique, quelques pastilles (rôle trophique, comestibilité,
   milieu, statut biogéographique, statut UICN) et le bouton d'observation. S'y
   ajoutent une **recherche** par nom et un filtre par **règne**, puis des **filtres
   avancés** par grand groupe, famille, habitat, rôle trophique, milieu, statut
   biogéographique, statut UICN, et par **présence sur la carte**. Par défaut, seules
   les espèces **présentes sur la carte active** sont montrées : celles liées à une zone
   ou un repère de cette carte, **ou** rattachées à la carte elle-même (sans lieu précis —
   par exemple les oiseaux du site). L'élève peut élargir à « Toutes les fiches » ou
   n'afficher que les absentes de la carte.
2. Il clique une vignette : la **fiche complète** s'ouvre en fenêtre — photos,
   informations, mini-cartes d'emplacement, interactions, termes de glossaire,
   questions de quiz et commentaires. C'est la même fenêtre que celle ouverte depuis la
   carte, le glossaire, le quiz ou le réseau trophique.
3. S'il a vu l'espèce dans le jardin, il clique sur le bouton d'**observation** : il
   confirme avoir observé l'espèce sur le terrain **et** lu sa fiche. L'application
   compte alors une observation de plus.
4. Après la confirmation, l'application peut lui proposer d'**enrichir son
   observation** d'un commentaire et de photos, rattachés à la fiche.
5. Deux compteurs sont affichés, sur la vignette comme dans la fiche : **ses**
   observations et celles de **tout le site**. Les espèces déjà découvertes par l'élève
   sont signalées dans le catalogue.

Si le professeur a rattaché des **questions de quiz « verrou »** à une fiche, la
**première** observation n'est acceptée qu'après avoir répondu correctement à ces
questions (les observations suivantes de la même espèce ne redemandent rien).

## Comment ça se passe — côté professeur

### Créer et modifier une fiche

Le professeur ajoute une fiche depuis l'onglet Biodiversité et remplit le formulaire
(seul le nom est obligatoire). Il peut aussi cocher les **cartes** sur lesquelles
l'espèce est présente sans être liée à une zone ou un repère précis. Il voit le même
catalogue en vignettes que les élèves, avec deux boutons par vignette : **modifier**
(le formulaire s'ouvre en fenêtre, avec l'enregistrement automatique habituel) et
**supprimer**. Cliquer la vignette elle-même ouvre la fiche telle que les élèves la
voient. Les changements apparaissent en temps réel chez les utilisateurs connectés.

### Le pré-remplissage automatique (multi-sources)

Pour éviter la saisie fastidieuse, le formulaire propose un **pré-remplissage** : on
tape le nom (usuel ou scientifique) et l'application interroge des bases naturalistes
et encyclopédies de référence — Wikipédia (français, avec secours en anglais),
Wikidata, GBIF (classification, descriptions, noms vernaculaires), iNaturalist,
Catalogue of Life, Trefle, et en option une intelligence artificielle (OpenAI). Le
professeur **choisit les sources** à interroger via des cases à cocher.

Le résultat est une **proposition** : chaque champ affiche la valeur trouvée et sa
source, les photos trouvées sont présentées avec leur crédit. Le professeur
**sélectionne** ce qu'il garde, puis **applique** — rien n'est jamais enregistré
automatiquement. Les liens des sources utilisées sont ajoutés au champ « sources »
de la fiche.

### L'identification par photo (Pl@ntNet)

Quand on ne connaît pas l'espèce, on peut partir d'une **photo** : le formulaire
permet d'envoyer une ou plusieurs images (en précisant si possible l'organe
photographié : feuille, fleur, fruit, écorce…) au service **Pl@ntNet**, qui renvoie
une liste d'espèces candidates avec leur degré de confiance. Le professeur choisit la
bonne proposition : le nom scientifique (et le nom usuel s'il est connu) remplit le
formulaire, et les photos envoyées peuvent être conservées comme photos de la fiche.
On peut ensuite enchaîner avec le pré-remplissage automatique pour compléter le reste.

### L'import en masse

Pour constituer le catalogue d'un coup, un **import** accepte un fichier tableur
(ou un lien vers une feuille Google Sheets partagée), jusqu'à 2 000 lignes. Les
en-têtes de colonnes sont reconnus en français comme en anglais, et deux modèles de
fichier (simple et complet) sont téléchargeables. Trois stratégies au choix :

- **mettre à jour par nom** (par défaut) : les fiches existantes portant le même nom
  sont mises à jour, les autres créées ;
- **ajouter seulement** : les noms déjà présents sont ignorés ;
- **tout remplacer** : le catalogue entier est remplacé par le fichier (à manier avec
  précaution).

Un mode **simulation** montre d'abord un rapport (lignes valides, erreurs, aperçu)
sans rien enregistrer ; on lance l'import réel ensuite.

Les champs de détermination s'importent comme les autres : les colonnes « Critères de
détermination », « Confusions possibles » et « Période d'observation » sont reconnues,
avec quelques variantes courantes (« Critères d'identification », « Espèces
ressemblantes », « Risques de confusion », « Quand l'observer »).

### Les alias de noms

Une même espèce peut être désignée par plusieurs noms (« pomme de terre » /
« patate »). L'application gère des **alias** : quand un nom alternatif est associé à
une fiche, l'utiliser — par exemple dans la liste des êtres vivants d'une zone —
retrouve automatiquement la bonne fiche.

## ⚠️ Points d'attention sur l'existant

> ⚠️ **Point d'attention** — Les **alias de noms** n'ont **aucun écran de gestion**
> dans l'application : ils ne peuvent être créés ou consultés que par une opération
> technique menée hors application (import préparé par un administrateur). Un
> professeur ne peut donc ni voir ni corriger les alias existants depuis l'interface.

> ⚠️ **Point d'attention** — Le pré-remplissage dépend de services externes : selon la
> disponibilité de ces services et l'espèce demandée, certains champs peuvent revenir
> vides ou en anglais, et les résultats peuvent varier d'un essai à l'autre. Les
> avertissements affichés (photos filtrées, source injoignable…) sont normaux : il
> faut toujours **relire et trier** avant d'appliquer. La source « intelligence
> artificielle » en particulier peut se tromper avec assurance.

> ⚠️ **Point d'attention** — Un élève peut confirmer plusieurs fois l'observation de
> la même espèce : chaque confirmation **incrémente les compteurs**. C'est voulu
> (plusieurs observations réelles sont possibles), mais rien n'empêche de gonfler son
> compteur en cliquant plusieurs fois — seule la première observation peut être
> protégée par des questions de quiz.

> ⚠️ **Point d'attention** — La **suppression** d'une fiche est immédiate et sans
> corbeille. Les zones et repères qui référençaient l'espèce perdent ce lien.

## Pour aller plus loin

- Retour au [sommaire de la documentation](../README.md) ;
- [Présentation générale de ForetMap](presentation.md) ;
- [La carte et les zones](carte-et-zones.md) — où l'on associe les espèces aux lieux
  du jardin (et, pour les espèces sans lieu précis, directement à la carte) ;
- Le réseau trophique, le glossaire et les quiz reliés aux fiches sont détaillés dans
  le document « pédagogie : quiz, glossaire, réseau » (voir sommaire).
