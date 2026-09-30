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
- **L'élève connecté** filtre, lit les fiches, enregistre ses observations et peut
  **signaler une observation** de terrain, qu'un professeur vérifie.
- **Le professeur** crée et enrichit les fiches, avec des aides puissantes :
  pré-remplissage automatique, identification par photo, import en masse.

## La fiche espèce

Chaque fiche peut porter (tous les champs sont facultatifs sauf le nom) :

- les **noms** : nom usuel, **autres noms** courants, nom scientifique d’usage, et un
  **emoji** ;
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
- la **détermination** : critères d'identification, **sosies** (autres fiches du catalogue
  avec lesquelles l'espèce se confond), confusions possibles, période d'observation (voir
  ci-dessous) ;
- le **danger** (ce que l'espèce fait à qui la touche ou la mange) et le **risque
  sanitaire** (ce qu'elle peut transmettre), en deux blocs distincts ;
- des **remarques** libres (une seule zone de texte ; une ligne vide sépare deux
  remarques) et une description générale ;
- des **photos multiples**, rangées en six cases : illustration principale, espèce,
  feuille, fleur, fruit, partie récoltée — chaque case peut contenir plusieurs images
  (téléversées ou par lien), et **chaque photo porte son auteur et sa licence** ;
- les **sources** des informations (liens et références).

La fiche affiche aussi automatiquement ses liens avec le reste de l'application : sa
**présence sur la carte ouverte** et d'où elle vient (voir ci-dessous), les **mini-cartes**
des zones et repères où l'espèce se trouve, ses interactions du réseau trophique (« qui
mange qui, qui aide qui »), les termes du glossaire et les questions de quiz qui s'y
rapportent (celles approuvées dans l'écran « Rattacher des questions aux contenus »).

### « Présente sur ce site » : une seule définition

Une espèce est **présente sur une carte** dès qu'une de ces trois choses est vraie :

- elle est **au registre du site** : le professeur a coché cette carte dans la fiche de
  l'espèce (c'est le cas des espèces connues sur le site sans lieu précis, un oiseau de
  passage par exemple) ;
- elle figure **dans une zone** de la carte ;
- elle figure **sur un repère** de la carte.

Depuis le 25 septembre 2026, **tous les écrans donnent la même réponse** à cette question :
le filtre « Présente sur cette carte » du catalogue, la pastille « Sur la carte » des
vignettes (élève comme professeur), la fiche de l'espèce, le tirage au sort des **Groupes
emboîtés**, le **réseau trophique** d'une carte et la **visite**. Avant, chaque écran avait
sa propre règle. Sur la forêt comestible (base de référence de septembre 2026), les Groupes
emboîtés ne tiraient que parmi les 27 espèces du registre, la visite ne connaissait que les
61 espèces placées dans une zone ou sur un repère, le réseau trophique en comptait 75, et la
pastille des vignettes du professeur ignorait le registre. Aujourd'hui, les 75 espèces de la
forêt comestible sont présentes partout.

La fiche dit **d'où vient la présence**, sobrement, sous « Sur la carte » : par exemple
« Présente sur cette carte : au registre du site · dans 2 zones · sur 1 repère ». Une
espèce seulement au registre n'a pas de mini-carte : elle est connue sur le site sans lieu
précis. Une espèce absente de la carte ouverte porte la mention « Pas encore signalée sur
cette carte ».

**« Confirmée sur le site »** (depuis septembre 2026) : quand un professeur **valide** une
observation signalée par un élève (voir « Signaler une observation » plus bas), l'espèce est
inscrite au registre de la carte si elle n'y était pas, et la fiche affiche la pastille
**« Confirmée sur le site »** sous les boutons d'observation. La date de l'observation et son
auteur sont gardés comme **première mention** sur le site, sauf si une première mention
était déjà connue : elle n'est jamais remplacée. Une confirmation ne se perd pas quand une
autre observation de la même espèce n'est pas retenue.

Deux précisions :

- les **anciens noms de lieu** (quand une zone ou un repère ne portait qu'un nom de plante
  tapé à la main, avant le choix dans le catalogue) ne comptent plus : seules les espèces
  choisies dans le catalogue font foi. Sur la base de référence, les trois anciens noms
  encore renseignés avaient tous leur équivalent choisi dans le catalogue — rien n'a disparu ;
- une espèce présente **seulement dans une zone réservée** (« Qui peut voir ce lieu ») reste
  présente pour tout le monde, mais la zone n'est nommée qu'à ceux qui peuvent la voir : les
  autres lisent « dans une zone », sans son nom.

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
des espèces (ou en tire au sort sur une carte, parmi les espèces **présentes sur cette carte**
— au registre, dans une zone ou sur un repère — et rangées dans l’arbre) ; l’application
calcule le plus petit arbre
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
  courant entouré d’un double anneau et amené automatiquement à l’écran. On avance en
  touchant l’énoncé d’une branche qui part de ce couplet, ou en choisissant parmi les
  propositions du couplet, reprises en toutes lettres sous le schéma. Le chemin déjà
  parcouru est surligné. Les images associées aux propositions apparaissent sur le
  schéma quand elles sont renseignées. Un bouton **Ajuster à l’écran** / **Taille
  réelle** permet de voir toute la clé d’un coup d’œil ou de zoomer.

Dans les deux modes :

- le **chemin parcouru** est rappelé au fil de la lecture ; à l’arrivée, il devient la
  liste des **caractères observés** qui ont mené à l’espèce, et le bouton **Retour**
  reste disponible pour revenir sur un choix ;
- sur le schéma, les espèces restent **masquées** (« ? », « À trouver ») tant qu’on ne
  les a pas atteintes : le schéma ne donne pas la réponse. Les enseignants qui gèrent
  les clés disposent d’un bouton **Montrer toutes les espèces** pour vérifier leur clé ;
- quand une même suite de questions sert à plusieurs endroits, le schéma ne la dessine
  qu’une fois et renvoie vers elle par une étiquette « → Couplet N » ;
- une proposition encore incomplète (qui ne mène ni à un couplet ni à une espèce) est
  affichée « à compléter » et ne peut pas être choisie. Les enseignants voient en plus,
  sous le schéma, les propositions à compléter et les couplets qui ne sont reliés à
  rien — les élèves ne les verront jamais ;
- tout se pilote aussi **au clavier** (Tab pour passer d’une proposition à l’autre,
  Entrée ou Espace pour la choisir), et l’énoncé complet d’une branche s’affiche au
  survol quand il est trop long pour le schéma.

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

Qui voit quoi : un arbre n'est visible que si sa **carte** l'est pour la personne qui
consulte (carte de la visite publique pour un visiteur, cartes de sa classe pour un élève) ;
un élève ne peut saisir une mesure que sur un arbre d'une carte de sa classe. Les
**remarques** (celle de la fiche et celles des mesures), ainsi que l'auteur et le groupe
de chaque mesure, ne sont montrés qu'aux professeurs et administrateurs ; les élèves et
visiteurs voient les mesures elles-mêmes, la courbe et les estimations.

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
La fiche porte donc une section **Détermination**, dédiée à l'identification rigoureuse :

- **Critères de détermination** — ce qu'il faut observer pour être sûr : silhouette,
  taille, couleurs, nervures, nombre de pattes, lames, odeur, traces…
- **Sosies** — les autres fiches du catalogue avec lesquelles l'espèce se confond, chacune
  avec le critère qui permet de les distinguer. Sur la fiche, chaque sosie s'affiche
  « **Ne pas confondre avec** … », et un clic sur son nom ouvre sa fiche. Un sosie vaut
  dans les deux sens : ajouté sur la fiche de la laitue, la laitue vireuse affiche à son
  tour « Ne pas confondre avec la laitue ».
- **Confusions possibles** — texte libre : les espèces ressemblantes et le critère qui
  tranche, en particulier celles qui n'ont **pas** de fiche au catalogue.
- **Quand l'observer** — saison, moment de la journée, stade (floraison, fructification,
  mue…), c'est-à-dire la période où la détermination est réellement possible.

Ces champs sont écrits pour **tous les êtres vivants du catalogue**, pas seulement les
plantes : le catalogue mêle végétaux, animaux, champignons, micro-organismes et
fiches-ressources. On parle donc de « caractères observables » et de « stade », jamais de
feuille ni de fleur.

Les **sosies** et les **confusions possibles** s'affichent dans un **encadré d'alerte**, visuellement
distinct du reste de la fiche. C'est voulu : la forêt est comestible et les élèves
récoltent. Une ressemblance avec une espèce toxique ou piquante ne doit pas se lire comme
une ligne de métadonnée parmi d'autres.

La section est **repliée par défaut**, comme les autres sections de la fiche, et placée
juste après la photo : devant l'être vivant, on cherche d'abord à savoir ce que c'est. Un
site peut la faire afficher **dépliée d'office** pour tout le monde : Réglages → Modules
UI → « Fiches espèces — section « Détermination » toujours dépliée ».

La section n'apparaît que si le professeur a renseigné au moins un de ces éléments. Elle
reste donc invisible sur les fiches non documentées, plutôt que d'ajouter un bandeau vide
sur tout le catalogue. Ces champs ne sont **pas** remplis par le pré-remplissage
automatique : les bases naturalistes interrogées ne fournissent pas de critères de
détermination. Ils se saisissent à la main (les sosies depuis le formulaire, section
« Détermination » → « Sosies dans le catalogue »), ou par l'import en masse pour les textes.

> ⚠️ **Point d'attention — les sosies sont à renseigner.** Au passage à cette version,
> aucun sosie n'existe encore : une vingtaine de fiches parlent de ressemblance dans leurs
> **remarques** (« ressemble à… », « se distingue de… »). Les transformer en sosies — et
> déplacer les mises en garde vers l'encadré « Danger » — est un travail de relecture,
> fiche par fiche, que l'application ne fait pas à la place d'une personne.

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

**Chaque photo** de la fiche porte le **nom de son auteur** et sa **licence** : sous la
photo principale, et sous chaque vignette de la galerie (« Auteur — Licence », avec un lien
« Source » vers la page d'origine quand il est connu). Ce n'est pas une politesse : les
licences en présence au catalogue — CC BY-SA 3.0, CC BY-SA 4.0, CC BY — imposent toutes de
nommer l'auteur de chaque image affichée.

L'attribution de la photo principale de **195 fiches** a été récupérée automatiquement
depuis Wikimedia Commons ; elle vaut aussi pour les copies de cette même photo rangées dans
une autre case (souvent « espèce »). Les autres photos se créditent à la main, dans la
section « Photos » du formulaire : chaque photo y a sa ligne — lien, **auteur**,
**licence**. Le pré-remplissage garde désormais l'auteur et la licence des photos qu'il
propose. Une photo téléversée arrive **sans** auteur ni licence : le formulaire le rappelle,
et une nouvelle photo principale n'hérite plus du crédit de l'ancienne.

> ⚠️ **Point d'attention — photos encore sans attribution.** Sur la copie de travail du
> catalogue, environ **120 photos** (sur ≈ 490) n'ont ni auteur ni licence enregistrés —
> surtout des photos secondaires (feuille, fleur, fruit, partie récoltée). Elles restent
> affichées, avec le lien vers leur page Wikimedia quand l'adresse le permet ; les créditer
> dans le formulaire met l'établissement en règle.

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
   présentes sur cette carte — au registre du site, dans une zone ou sur un repère ; ou
   absentes ; ou toutes les fiches). Les vignettes des espèces présentes portent la
   pastille **« Sur la carte »**. Pendant le bref chargement de la présence, ou si le
   serveur ne répond pas, le filtre ne retire rien (une note le signale en cas de panne)
   plutôt que d'afficher un catalogue vide. Une **recherche** (qui trouve aussi les
   **autres noms** d'une espèce : « dent-de-lion » trouve le pissenlit) et un filtre par
   **règne** complètent la surface. Des pastilles rapides permettent de
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

### Signaler une observation (espèce vue sur le terrain)

« Espèce observée » ci-dessus est un **acquis d'apprentissage** : l'élève dit qu'il a vu et
lu. **Signaler une observation** est autre chose : c'est une **donnée de terrain**, qu'un
professeur vérifie avant qu'elle compte pour le site.

1. Depuis la **fiche d'une espèce** (bouton **« Signaler une observation »**) ou depuis la
   fiche d'une **zone** ou d'un **repère** de la carte (bouton **« Signaler une observation
   ici »**), l'élève ouvre un court formulaire : l'espèce (déjà choisie depuis une fiche ;
   « Je ne sais pas » est possible), le lieu (déjà choisi depuis la carte), la date (celle du
   jour par défaut), la façon dont il l'a repérée (vue, chant ou cri, trace, indice, de nuit),
   ce qu'il a vu, et une **photo** facultative. Le formulaire rappelle la règle : **on observe
   sans toucher ni prélever** — on regarde, on écoute, on photographie.
2. L'observation part **« En attente de validation »**. L'élève retrouve toutes les siennes
   dans **« Mes observations »** (même bouton, à côté), avec leur statut — **Validée** ou
   **Non retenue** — et la note éventuelle du professeur. Il peut supprimer une observation
   tant qu'elle n'est pas validée ; il peut ajouter ou retirer sa photo tant qu'elle attend.
3. **Sans réseau sur le terrain**, l'observation est **gardée sur l'appareil** et part toute
   seule au retour du réseau (« Pas de réseau : ton observation est gardée sur l'appareil et
   partira toute seule »). La **photo**, trop lourde pour l'appareil, ne peut pas attendre :
   l'élève en est prévenu, son texte part seul. Une observation renvoyée deux fois n'est
   enregistrée qu'**une** fois ; sur une tablette partagée, elle ne part que sous le compte
   de son auteur. Dans « Mes observations », elle apparaît « En attente de réseau » jusqu'à
   son envoi.

Les photos d'observation sont **privées** : seuls leur auteur et les professeurs habilités
les voient ; les informations cachées dans la photo (lieu GPS, appareil) sont effacées à
l'envoi. Un compte « Visiteur » ne peut pas signaler d'observation.

## Comment ça se passe — côté professeur

### Valider les observations des élèves

Dans l'onglet **Biodiversité** du professeur, l'encadré repliable **« Observations à
valider »** (avec leur nombre) liste les observations signalées sur la carte active — ou sur
toutes les cartes, et par statut : à valider (les plus anciennes d'abord), validées, non
retenues. Chaque observation montre l'élève, la date, le lieu, la façon dont l'espèce a été
repérée, le texte et les photos.

- Le professeur choisit l'**espèce retenue** (celle proposée par l'élève, ou une autre s'il
  s'est trompé ou ne savait pas), écrit s'il le souhaite une **note pour l'élève**, puis
  **Valider** ou **Ne pas retenir**. On ne peut pas valider sans espèce.
- **Valider** confirme la présence de l'espèce sur la carte : la fiche affiche « Confirmée sur
  le site » (voir « Présente sur ce site » plus haut), et l'espèce compte partout où la
  présence est utilisée.
- La décision est **définitive** : une observation validée ne peut plus être refusée ni
  supprimée (elle sert de preuve), une observation non retenue ne peut plus être validée.
  Chaque décision est inscrite au **journal d'audit**.
- **Preuve d'une relation du réseau trophique** : sous une observation, le professeur peut la
  rattacher à une relation où figure l'espèce (« la coccinelle mange le puceron »). Dès que
  l'observation est validée, la relation passe à **« Observé sur le site »** dans le réseau
  trophique ; ce niveau de preuve ne redescend jamais tout seul.

Le droit de valider est une permission dédiée, **« Validation des observations
d'espèces »**, accordée d'office à l'administrateur et au n3boss, pas au prof de classe (valider
écrit dans le registre de biodiversité du site).

### Créer et modifier une fiche

Le professeur ajoute une fiche depuis l'onglet Biodiversité et remplit le formulaire
(seul le nom est obligatoire). Il peut aussi cocher les **cartes** sur lesquelles
l'espèce est présente sans être liée à une zone ou un repère précis : c'est le **registre
du site**, l'une des trois façons d'être « présente sur ce site ». Enregistrer la fiche ne
touche pas aux cartes déjà cochées (leurs informations de suivi sont conservées). Il voit le
même catalogue en vignettes que les élèves — la pastille « Sur la carte » y suit la même
règle que chez eux —, avec deux boutons par vignette : **modifier**
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
ressemblantes », « Risques de confusion », « Quand l'observer »). Les remarques
s'importent dans une colonne « remarques » (les trois anciennes colonnes restent
acceptées) ; le crédit et la licence de la photo principale ont leurs colonnes dans le
modèle complet. Les sosies ne s'importent pas : ils se choisissent dans le formulaire.

### Les autres noms et les alias de noms

Une même espèce peut être désignée par plusieurs noms (« pomme de terre » /
« patate »). Le formulaire a un champ **Autres noms** (séparés par des virgules) :
ils s'affichent sur la fiche et la **recherche du catalogue** les trouve. Un nom ne peut
désigner qu'**une** fiche : si un autre nom est déjà celui d'une autre fiche (ou son nom
tout court), il n'est pas rattaché — il reste écrit et affiché, mais il faudra trancher
(fiches en double ? nom à retirer ?).

L'application connaît aussi des **variantes** de noms, apportées avec le contenu
(pluriels, formes courtes, anciens noms) : quand un nom alternatif est associé à une
fiche, l'utiliser — par exemple dans la liste des êtres vivants d'une zone — retrouve
automatiquement la bonne fiche, et la recherche le trouve aussi.

## ⚠️ Points d'attention sur l'existant

> ⚠️ **Point d'attention** — Les **variantes de noms** n'ont **aucun écran de gestion**
> dans l'application : elles ne peuvent être créées ou consultées que par une opération
> technique menée hors application (import préparé par un administrateur). Seuls les
> **autres noms** se gèrent depuis le formulaire de la fiche. Sur la copie de travail du
> catalogue, un seul autre nom attend une décision : « Abeille charpentière », écrit dans
> les autres noms du Xylocope violet alors qu'une fiche porte déjà ce nom.

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

> ⚠️ **Point d'attention** — **Décocher une carte** dans le formulaire d'une fiche retire
> l'espèce du registre de cette carte, **sauf si sa présence y a été confirmée** par une
> observation validée : dans ce cas la carte reste cochée à l'enregistrement et la pastille
> « Confirmée sur le site » demeure. Une confirmation ne se défait pas depuis la fiche.

> ⚠️ **Point d'attention** — Deux gestes voisins cohabitent sur la fiche : **« Espèce
> observée »** (compteur personnel d'apprentissage, sans vérification) et **« Signaler une
> observation »** (donnée de terrain validée par un professeur). Seul le second peut
> confirmer une espèce sur le site.

L’affichage du catalogue et des outils associés suit le **niveau pédagogique** : en
Collège, le nom accepté, le lien GBIF et la classification latine sont masqués, ainsi que
le fil des groupes emboîtés, l’onglet Groupes emboîtés et le suivi des individus ; en
Lycée, les détails scientifiques sont repliés — voir
[Niveaux pédagogiques biodiversité](niveaux-pedagogiques-biodiversite.md).

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
