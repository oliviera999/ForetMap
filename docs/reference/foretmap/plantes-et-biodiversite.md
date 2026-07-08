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

- **Tout le monde** (y compris les simples visiteurs) peut consulter le catalogue.
- **L'élève connecté** filtre, lit les fiches et enregistre ses observations.
- **Le professeur** crée et enrichit les fiches, avec des aides puissantes :
  pré-remplissage automatique, identification par photo, import en masse.

## La fiche espèce

Chaque fiche peut porter (tous les champs sont facultatifs sauf le nom) :

- les **noms** : nom usuel, deuxième nom, nom scientifique, et un **emoji** ;
- la **classification** : règne, grand groupe, famille, genre ;
- l'**écologie** : habitat, milieu, rôle dans l'écosystème, rôle trophique,
  origine géographique, cycle de vie / longévité, taille, reproduction ;
- l'**usage humain** : caractère **comestible** (oui / non / non renseigné), utilité,
  partie récoltée, valeur nutritive, plante ornementale ou non ;
- la **culture** : conseils de plantation, températures supportées, acidité du sol
  préférée, nutriments préférés ;
- des **remarques** libres (trois champs) et une description générale ;
- des **photos multiples**, rangées en six cases : illustration principale, espèce,
  feuille, fleur, fruit, partie récoltée — chaque case peut contenir plusieurs images
  (téléversées ou par lien) ;
- les **sources** des informations (liens et références).

La fiche affiche aussi automatiquement ses liens avec le reste de l'application : les
**mini-cartes** des zones et repères où l'espèce est présente, ses interactions du
réseau trophique (« qui mange qui, qui aide qui »), les termes du glossaire et les
questions de quiz qui s'y rapportent.

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Biodiversité** : la liste des fiches, avec une **recherche**
   par nom et un filtre par **règne**. Des **filtres avancés** affinent par grand
   groupe, famille, habitat, rôle trophique, milieu, et par **présence sur la carte**
   (espèces liées à au moins une zone ou un repère, ou au contraire sans lieu).
2. Il ouvre une fiche et découvre photos, informations et mini-cartes d'emplacement.
3. S'il a vu l'espèce dans le jardin, il clique sur le bouton d'**observation** : il
   confirme avoir observé l'espèce sur le terrain **et** lu sa fiche. L'application
   compte alors une observation de plus.
4. Après la confirmation, l'application peut lui proposer d'**enrichir son
   observation** d'un commentaire et de photos, rattachés à la fiche.
5. La fiche affiche deux compteurs : **ses** observations et celles de **tout le
   site**. Les espèces déjà découvertes par l'élève sont signalées dans le catalogue.

Si le professeur a rattaché des **questions de quiz « verrou »** à une fiche, la
**première** observation n'est acceptée qu'après avoir répondu correctement à ces
questions (les observations suivantes de la même espèce ne redemandent rien).

## Comment ça se passe — côté professeur

### Créer et modifier une fiche

Le professeur ajoute une fiche depuis l'onglet Biodiversité et remplit le formulaire
(seul le nom est obligatoire). Il peut modifier ou supprimer une fiche à tout moment ;
les changements apparaissent en temps réel chez les utilisateurs connectés.

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
  du jardin ;
- Le réseau trophique, le glossaire et les quiz reliés aux fiches sont détaillés dans
  le document « pédagogie : quiz, glossaire, réseau » (voir sommaire).
