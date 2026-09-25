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

- les **noms** : nom usuel, deuxième nom, nom scientifique d’usage, et un **emoji** ;
  si le **nom accepté** (référentiel GBIF) diffère, il s’affiche sous le nom d’usage, avec
  un lien vers la fiche GBIF quand une clé est connue ;
- la **classification** : règne, grand groupe, famille, genre ; une **classification
  latine** repliable (embranchement, classe, ordre, famille) issue des vérifications GBIF ;
  un **fil de groupes emboîtés** (« Êtres vivants › Eucaryotes › … ») quand la fiche est
  rattachée à l’arbre pédagogique, chaque groupe montrant son caractère partagé au survol ;
- les **notes de site** : observations propres à une carte (effectifs, nidification…)
  affichées « Sur ce site » quand on ouvre la fiche depuis cette carte ;
- l'**écologie** : habitat, milieu, rôle dans l'écosystème, rôle trophique,
  origine géographique, **statut biogéographique** (indigène / introduit /
  envahissant / endémique / domestique), **statut UICN** (Liste rouge mondiale),
  cycle de vie / longévité, taille, reproduction ;
- l'**usage humain** : caractère **comestible** (oui / non / non renseigné), utilité,
  partie récoltée, valeur nutritive, plante ornementale ou non ;
- la **culture** : conseils de plantation, températures supportées, acidité du sol
  préférée, nutriments préférés ;
- la **détermination** : critères d'identification, confusions possibles, période
  d'observation (voir ci-dessous) ;
- le **danger** (ce que l'espèce fait à qui la touche ou la mange) et le **risque
  sanitaire** (ce qu'elle peut transmettre), en deux blocs distincts ;
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
mangent.

### Le rôle trophique

Chaque fiche peut porter l’un de quatre **rôles trophiques**. La pastille de la fiche en
donne le nom, et sa définition s’affiche quand on la survole :

- **Producteur** — fabrique sa propre matière avec la lumière, l’eau, l’air et les sels
  minéraux (plantes, algues) ;
- **Consommateur** — se nourrit d’autres êtres vivants, plantes ou animaux ;
- **Détritivore** — se nourrit de matière organique morte (feuilles, bois, cadavres)
  qu’il fragmente (vers de terre, cloportes, collemboles, escargots d’eau, iules…) ;
- **Décomposeur** — transforme la matière organique morte en sels minéraux utiles aux
  plantes (bactéries, champignons).

Le rôle **Détritivore** existe depuis le 25 septembre 2026. Avant, les vers de terre, les
cloportes et les autres petits animaux du sol étaient rangés parmi les décomposeurs. Or
ils **fragmentent** la matière morte sans la **transformer en sels minéraux** : c’est le
travail des bactéries et des champignons. Les 14 fiches concernées ont été reclassées
automatiquement ; bactéries et champignons sont restés décomposeurs. La distinction change
aussi le réseau trophique : un oiseau qui mange des vers de terre y apparaît désormais
comme consommateur secondaire, et non plus primaire (voir
[Quiz, glossaire, réseau](pedagogie-quiz-glossaire-reseau.md)).

Le professeur choisit le rôle dans le formulaire de la fiche ; l’élève peut filtrer le
catalogue sur un rôle (filtres avancés, « Rôle trophique ») ou taper « détritivore » dans
la recherche.

> ⚠️ **Point d'attention** — Deux cas restent à trancher avec l’équipe de SVT. Les
> bactéries **nitrifiantes** (Nitrosomonas, Nitrobacter, Nitrospira) sont encore classées
> décomposeurs alors qu’elles fabriquent leur matière à partir de substances minérales. Et
> une question du quiz (« Parmi ces êtres vivants, lequel est un décomposeur ? », réponse
> attendue : le cloporte) contredit désormais la fiche du cloporte : elle est à
> reformuler.

## Groupes emboîtés

L’onglet **Groupes emboîtés** propose une activité de classification : l’enseignant choisit
des espèces (ou en tire au sort sur une carte) ; l’application calcule le plus petit arbre
qui les contient et affiche des **boîtes emboîtées**, chacune portant le caractère partagé
du groupe. En mode élève, on place les espèces dans les groupes puis on lance la
**correction automatique**. Les professeurs qui gèrent la biodiversité peuvent aussi
ajouter, déplacer ou supprimer des groupes (un déplacement qui ferait une boucle est
refusé).

## Clés d’identification

L’onglet **Clés d’identification** propose des parcours dichotomiques jusqu’à la fiche
de l’espèce. Deux modes de lecture, interchangeables à tout moment :

- **Questions** : une fourche à la fois, avec retour en arrière ;
- **Schéma** : l’arbre entier de la clé (couplets et propositions), avec le couplet
  courant mis en évidence ; on avance en touchant une branche depuis ce couplet. Les
  images associées aux propositions apparaissent sur le schéma quand elles sont
  renseignées.

Les énoncés décrivent des **caractères observables** — jamais une invitation à
cueillir, goûter ou manipuler. Les enseignants autorisés créent et publient les clés
(couplets, propositions, image optionnelle par proposition).

## Suivi d’individus (arbres)

L’onglet **Individus** permet de suivre un arbre précis (rattaché à une espèce, une
carte, éventuellement une zone ou un repère). Les élèves saisissent des **mesures**
(circonférence à 1,30 m, hauteur, diamètre de couronne). L’application affiche une
**courbe de croissance** et une estimation pédagogique de biomasse, de carbone et de
CO₂ — clairement présentée comme un **ordre de grandeur** (formule établie pour des
arbres tropicaux).

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
naturellement dans la région, comme le hérisson d’Algérie), **introduite**
(amenée par l’humain, comme le tilapia du Nil en aquaponie ou le figuier de
Barbarie), **envahissante** (introduite et qui menace les espèces locales — la
gambusie et l’élodée en sont des exemples du jardin), **endémique** (qui n’existe
nulle part ailleurs qu’ici : l’arganier, le discoglosse peint du Maroc, le
rougequeue de Moussier) ou **domestique** (les animaux de la ferme : âne, chèvre,
mouton, vache, cheval barbe, mulet, chat). Ce statut apparaît en pastille sur les
vignettes et la fiche, et on peut filtrer le catalogue dessus. Il complète
l’origine géographique (texte libre) sans la remplacer.

Les deux dernières valeurs répondent à un manque : « endémique » était jusqu’ici
confondu avec « indigène », alors que l’arganier n’est pas seulement présent
naturellement au Maroc, il n’existe qu’ici — c’est l’argument de conservation le
plus fort qu’une fiche puisse porter. Et un animal de ferme n’était ni l’un ni
l’autre : le dire « introduit » le rangeait, à tort, avec le tilapia.

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

## L'encadré « Danger »

La détermination répond à « qu'est-ce que c'est ». Elle ne répond pas à « qu'est-ce que ça
peut me faire ». Le ricin, le laurier-rose, le tabac glauque et la jusquiame sont
cartographiés dans la forêt, identifiables sans la moindre ambiguïté — et dangereux quand
même. La fiche porte donc, séparément, quatre champs de **danger** :

- **Niveau de danger** — aucun danger connu, irritation, toxique, potentiellement mortel.
- **Voies d'exposition** — ingestion, contact avec la peau, inhalation, projection dans
  l'œil, piqûre ou morsure, sève ou latex. Plusieurs cases peuvent être cochées.
- **Quel danger, et quoi faire** — la partie dangereuse, les circonstances, la conduite à
  tenir. Ex. : « Graines très toxiques ; ne jamais manipuler les fruits épineux. »
- **Danger relu et validé** — une simple mention, qui n'est plus une case à cocher : la
  validation se fait depuis la file « Dangers à valider », décrite plus bas.

Tout niveau autre que « aucun danger connu » s'affiche en **encadré rouge ou ambre, en tête
de fiche, avant même la description** — et, contrairement à la détermination, **cet encadré
ne se replie pas**. Un avertissement de toxicité derrière une section fermée n'avertit
personne. La couleur suit la gravité.

« Aucun danger connu » est une information utile, pas un encadré : elle distingue une fiche
**vérifiée sans danger** d'une fiche **pas encore regardée**. Elle ne produit donc aucun
bandeau rouge.

### La mention « à valider »

Un premier remplissage a été posé sur **107 fiches** du catalogue à partir de sources
bibliographiques : 6 potentiellement mortelles, 36 toxiques, 51 irritantes, 14 marquées sans
danger. **Ce remplissage n'est pas une validation.** Chaque fiche arrive « à valider », et
l'encadré porte alors cette mention.

Le danger s'affiche quand même, décoché ou non — c'est délibéré. Masquer un avertissement de
toxicité en attendant une relecture serait le seul choix vraiment dangereux des deux. La
relecture reste à faire, fiche par fiche, avant toute utilisation en sortie encadrée.

Cas à regarder en premier, parce qu'ils sont contre-intuitifs : le **laurier-sauce**
(comestible) est le sosie du **laurier-rose** (mortel) ; la **fève** déclenche une crise
grave chez les élèves porteurs d'un déficit en G6PD, fréquent sur le pourtour
méditerranéen ; le latex du **figuier** brûle au soleil ; les glochides du **figuier de
Barbarie** sont presque impossibles à retirer de la peau.

### La file « Dangers à valider »

Relire une centaine de fiches une par une, en ouvrant le catalogue au hasard, n'est pas un
travail tenable. La base biodiversité affiche donc, pour les comptes autorisés, un encadré
repliable **« Dangers à valider »** qui liste exactement les fiches dont le danger ou le
risque sanitaire est renseigné sans avoir été relu, les plus graves en tête. Chaque ligne
porte un bouton **Valider** ; un clic sur le nom ouvre la fiche pour la lire d'abord.
L'encadré disparaît quand la file est vide.

Valider une fiche enregistre **qui** a validé et **quand**. C'est le **seul** moyen de valider :
le formulaire de la fiche avait une case « Danger relu et validé » que tout éditeur de fiches
pouvait cocher, sans que personne d'habilité n'ait relu ni que la date soit notée. Elle a été
retirée (septembre 2026) ; le formulaire indique seulement si la fiche est validée ou « à
valider ». Les fiches qui avaient été cochées ainsi, sans relecteur connu, sont repassées
« à valider » et réapparaissent dans la file.

Surtout : **modifier un champ de danger ou de risque sanitaire remet la fiche « à valider »**,
et efface le nom du relecteur. Le cas n'est pas un abus, c'est l'ordinaire — une fiche validée,
puis un collègue qui corrige la conduite à tenir six mois plus tard, et l'avertissement
repasserait pour relu alors que personne n'a lu la correction. Changer le nom, la photo ou
l'écologie de la fiche ne touche pas à la validation.

Le droit de valider est **séparé** du droit de gérer les fiches : un compte peut renseigner un
danger sans pouvoir certifier qu'il a été relu. Il est accordé d'office à l'administrateur et
au professeur, pas au professeur de classe.

## L'encadré « Risque sanitaire »

La rage, le tétanos, la salmonellose ou la leptospirose ne sont pas de la toxicité. Le renard
n'est pas dangereux à toucher par nature : il peut être **porteur**. Écrire « potentiellement
mortel » sur sa fiche serait faux, et rendrait la pastille de danger illisible sur tout le
catalogue animal.

La fiche porte donc un **second encadré**, distinct et de couleur différente, avec deux champs :

- **Risques identifiés** — rage, tétanos, salmonellose, leptospirose, toxoplasmose, vecteur de
  maladie, allergie. Plusieurs cases peuvent être cochées : le chat cumule rage et
  toxoplasmose.
- **Circonstances et conduite à tenir** — comment le risque se présente et quoi faire. Ex. :
  « Toute morsure ou griffure impose une consultation médicale immédiate. »

Comme l'encadré de danger, il **ne se replie pas**, s'affiche même non relu (avec la mention
« à valider ») et n'apparaît pas du tout si rien n'est renseigné.

**18 fiches** sont déjà renseignées : les carnivores sauvages et le chat (rage), les
deux pipistrelles (virus apparentés à la rage), les tortues (salmonelles), le rat rayé
(leptospirose), le compost et les déjections (tétanos), le moustique et la mouche (vecteurs),
l'olivier, l'oléastre et la pariétaire (pollen allergisant). Ces fiches arrivent, elles aussi,
**à valider**.

## Crédit et licence des photos

Les photos venues de Wikimedia Commons portent désormais le **nom de leur auteur** et leur
**licence**, affichés sous la photo principale de la fiche, avec un lien vers la page du
fichier. Ce n'est pas une politesse : les licences en présence au catalogue — CC BY-SA 3.0,
CC BY-SA 4.0, CC BY — imposent toutes de nommer l'auteur.

L'attribution de **195 fiches** a été récupérée automatiquement depuis Wikimedia Commons.
Les photos ajoutées ensuite sont à créditer à la main, dans la section « Ressources » du
formulaire.

Au passage, **30 fiches pointaient une image supprimée de Wikimedia** (le merle, la figue,
l'escargot petit-gris, la coccinelle à sept points…). Elles affichaient une image cassée ;
le lien mort a été retiré, et **les 30 fiches ont depuis été réillustrées**, chacune avec
son auteur et sa licence.

> ⚠️ **Point d'attention — une photo plausible mais fausse est pire qu'une fiche sans
> image.** Le premier choix automatique de ces 30 photos, fait à partir de l'image de tête
> de l'article Wikipédia, a dû être jeté : il attribuait au **criquet marocain** la photo
> d'une autre espèce de criquet, à l'**arganier** une photo d'huile d'argan, et à neuf
> fiches des planches dessinées du XIXᵉ siècle — exactement le défaut de la fiche Laitue
> décrit ci-dessous.
>
> Les photos ont donc été reprises à partir de la **catégorie Wikimedia de l'espèce**, où
> le classement vaut déjà détermination, en écartant les planches et gravures, les cartes
> de répartition, les bonsaïs et spécimens de musée, les photos de produit (une coopérative
> d'huile d'argan n'est pas un arganier) et les cadres où deux espèces se disputent la
> vedette. **En ajoutant une photo à une fiche, appliquer la même règle :** elle doit
> montrer l'espèce telle qu'un élève la rencontrera sur le terrain.

La fiche **Laitue** était illustrée par une planche de _Lactuca virosa_, la laitue vireuse —
une espèce sauvage toxique — sur une fiche marquée comestible. La photo a été corrigée, et
la confusion est désormais signalée dans les « confusions possibles » de la fiche.

## Comment ça se passe — côté élève

1. L'élève ouvre l'onglet **Biodiversité** : le catalogue s'affiche en **vignettes** —
   photo, nom, nom scientifique, quelques pastilles (rôle trophique, comestibilité,
   milieu, statut biogéographique, statut UICN) et le bouton d'observation. En tête
   de page, il choisit la **carte** : soit **toute la biodiversité du site**, soit une
   carte précise (ce choix de carte précise est le même que sur le plan de l'application).
   Avec une carte précise, il peut aussi filtrer la **présence** (par défaut : espèces
   présentes sur cette carte — zones, repères, ou rattachement direct ; ou absentes ;
   ou toutes les fiches). Une **recherche** et un filtre par **règne** complètent la
   surface. Des pastilles rapides permettent de
   ne garder que les espèces **comestibles**, **UICN menacées**, déjà **observées**
   ou **pas encore**. Un tri par nom (A→Z / Z→A) ou par observations personnelles
   complète le panneau ; les filtres avancés (grand groupe, famille, habitat, rôle,
   milieu, statut biogéographique, UICN précis) restent repliés. La grille montre
   d'abord une **page de vignettes** ; le bouton **Voir plus** charge la suite.
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

**Sans réseau sur le terrain** (depuis septembre 2026) : une observation confirmée alors que
le réseau manque est **gardée sur l'appareil** et envoyée toute seule au retour du réseau ;
l'élève voit « Pas de réseau : ton observation est gardée et partira toute seule. » et son
compteur augmente tout de suite. C'est possible pour une ré-observation, ou pour une fiche
sans questions « verrou » ; une première observation qui demande des questions attend le
réseau. Une observation envoyée deux fois (réponse perdue, appareil qui renvoie) n'est
comptée qu'**une** fois. Sur une tablette partagée, l'observation n'est envoyée que sous le
compte de son auteur, à sa prochaine connexion.

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

> 🔧 **À implémenter :** adapter l’affichage du catalogue et des outils associés
> (groupes emboîtés, suivi d’arbres, détails scientifiques) selon le **niveau
> pédagogique** Collège / Lycée / Université — voir
> [Niveaux pédagogiques biodiversité](niveaux-pedagogiques-biodiversite.md).

## Pour aller plus loin

- Retour au [sommaire de la documentation](../README.md) ;
- [Présentation générale de ForetMap](presentation.md) ;
- [Niveaux pédagogiques biodiversité](niveaux-pedagogiques-biodiversite.md) —
  Collège / Lycée / Université, réglages souhaités (compte, carte, groupe), séances
  types (cahier des charges, pas encore dans l’application) ;
- [La carte et les zones](carte-et-zones.md) — où l'on associe les espèces aux lieux
  du jardin (et, pour les espèces sans lieu précis, directement à la carte) ;
- Le réseau trophique, le glossaire et les quiz reliés aux fiches sont détaillés dans
  le document « pédagogie : quiz, glossaire, réseau » (voir sommaire).
