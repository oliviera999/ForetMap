# La carte du royaume — Gnomes & Licornes

> **Public de ce document : professeurs, maîtres du jeu (MJ) et administrateurs.**
> Il décrit ce que le jeu fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

La carte du royaume est le **plateau de jeu** d'un chapitre : c'est là que les
mascottes des équipes se déplacent, que les questions se déclenchent et que l'histoire
avance. Chaque chapitre (chaque biome) a sa propre carte.

## Ce qu'il y a sur le plateau

- **Le fond de carte** : l'illustration du biome du chapitre.
- **Les zones du royaume** : des territoires dessinés sur la carte. Une zone peut
  porter un contenu (texte et images qui s'ouvrent à l'arrivée d'une équipe — une fois
  par partie, une fois par équipe ou à chaque passage, selon le réglage) et une
  **musique d'ambiance** (module activable, avec fondu au passage d'une zone à
  l'autre).
- **Les repères** : des points d'intérêt numérotés. Un repère a un type (départ,
  question, événement, souffle, arrivée…) et des **effets** quand une équipe s'y pose :
  gagner ou perdre des cœurs, des gemmes, du mouvement — et surtout, ces effets peuvent
  être **différents pour une équipe gnome et une équipe licorne** (c'est la mécanique
  que le récit « [Les deux peuples du seuil](lore-deux-peuples.md) » met en histoire :
  « ce lieu est écrit pour l'autre peuple »).
- **Les repères « question »** déclenchent un QCM : une question fixe choisie par le
  MJ, ou un tirage dans le catalogue (QCM biomes ou QCM lore) — voir
  [QCM et pédagogie](qcm-et-pedagogie.md).
- **Le sous-biome d'un repère** dit dans quel milieu se trouve la case : un biome du
  chapitre (« taiga », « toundra »…), une saison de ce biome (« toundra_ete » pour l'été
  polaire, « toundra_hiver » pour la nuit polaire), ou « transition » pour une case-charnière
  entre deux milieux (elle n'appartient à aucun des deux). Le champ propose ces valeurs ;
  une valeur inconnue est refusée à l'enregistrement. Il sert au tirage « Biome de la case »
  des repères question et à la musique de plateau.
- **Les mascottes des équipes** : gnomes et licornes, qui matérialisent la position de
  chaque équipe.
- **La musique de plateau** (distincte de la musique des zones) est **commune à toute la
  partie** : elle suit la case la plus avancée qu'une équipe ait jamais atteinte, d'après le
  sous-biome de cette case. Sur le plateau 4, elle passe de la taïga à l'été polaire, puis à
  la nuit polaire dès qu'une équipe atteint la case 32 « La nuit qui tombe » — et la nuit ne
  se lève plus, même si cette équipe recule ensuite. Une case-charnière garde la musique du
  milieu d'avant. Sans sous-biome sur les cases, la musique reste celle du chapitre.

## Naviguer sur le plateau

Le plateau se manipule comme la carte de ForetMap et la visite : **glisser** pour se
déplacer, **pincer** (ou la molette) pour zoomer en gardant le point visé sous les
doigts, **double-tap** pour zoomer sur un endroit (un second double-tap réajuste le
plateau), boutons **+ / − / ⊡** en bas à droite pour zoomer, dézoomer et recentrer. Le
plateau ne sort jamais de son cadre : au bout de la course, une butée souple le ramène
en place. Le **plein écran** (bouton dédié, Échap ou « Fermer » pour sortir) affiche le
plateau seul, avec les mêmes gestes. Pendant l'édition d'un plateau (repères, zones), le
déplacement par glisser est suspendu pour ne pas gêner le placement.

**Zoom sur le lieu d'arrivée.** Quand une équipe arrive sur un repère qui déclenche quelque
chose (question, effet) ou entre dans une zone qui a un contenu ou un feuillet, la mascotte
termine d'abord son trajet, puis le plateau fait un **zoom bref et fluide** sur ce repère ou
sur toute la zone, et **ensuite seulement** le popover s'ouvre. Quand le dernier popover
d'arrivée est refermé, le plateau revient au **zoom et au centrage d'avant**. Le MJ/admin
règle ce comportement dans _Réglages plateforme → Gameplay → Affichage carte plateau_ : l'activer ou non,
revenir ou non à la vue d'avant, et la durée du zoom (0,35 s par défaut). Trois **effets**
accompagnent ce zoom, chacun désactivable au même endroit (tous actifs par défaut) :

- **l'emoji qui s'envole** : l'emoji du repère grossit très vite en s'effaçant pendant le
  zoom, et revient se poser à sa place au retour (seuls les repères affichés en emoji en ont
  un) ;
- **le projecteur** : le reste du plateau s'assombrit, seul le lieu reste éclairé, tant que le
  popover est ouvert ;
- **les étincelles** : une couronne d'étincelles dorées jaillit du lieu pendant le zoom.

Le mode Découverte des invités suit le comportement par défaut (effets compris). Avec
« réduire les animations », ni zoom animé ni effet, et les popovers apparaissent sans
animation d'entrée.

Les popovers de zone, de QCM et de dés **se referment en fondu** (un bref instant). Ceux de zone
et de QCM prennent la main au clavier dès leur ouverture et la rendent à l'élément d'origine en
se fermant ; Échap ferme toujours le popover du dessus. Le popover de dés, lui, laisse le plateau
utilisable derrière lui. Avec « réduire les animations », la fermeture est immédiate.

Si deux arrivées se chevauchent (une zone qui a à la fois un contenu et un feuillet, par
exemple), **les deux popovers s'ouvrent** : le plus récent garde le zoom, le précédent
s'affiche aussitôt, sans attendre.

> ⚠️ **Points d'attention**
>
> - Pour les personnes qui ont demandé à leur appareil de **réduire les animations**, la
>   mascotte se téléporte, le popover n'attend plus son trajet et le zoom est instantané.
> - Contrairement à ForetMap, le **zoom maximal** du plateau n'est pas réglable : il est fixe.
> - Une zone n'a jamais d'emoji qui s'envole, et un repère sans emoji non plus (ForetMap, lui,
>   montre alors une épingle 📍).

## Qui déplace les mascottes

C'est un **réglage de gameplay** : soit les joueurs déplacent eux-mêmes leur mascotte,
soit le MJ garde la main (mode animation). Avec les **tours** activés, chaque « tour
suivant » ouvre un round où **toutes les équipes rejouent** (le moteur ne désigne pas
d'équipe « au trait ») ; le tour réarme simplement le quota par tour — un déplacement et
un lancer de dé par équipe. Un réglage optionnel déplace automatiquement la mascotte
lorsqu'un effet de repère l'exige (parcours numéroté).

## Ce que règle et construit le MJ/admin

- **Le studio d'édition visuelle** (Contenus → Chapitres) : dessiner les zones du
  royaume, placer les repères, écrire les contenus qui s'ouvrent (textes, images),
  associer les questions, choisir les musiques.
- **Les effets des repères** : pour chaque repère, l'éditeur permet de définir les
  effets neutres et les effets propres à chaque peuple (gnome / licorne).
- **La visibilité** : des réglages d'affichage contrôlent si les joueurs voient les
  repères, les zones, les numéros du plateau, et l'habillage des repères (fond,
  étiquette, emoji).
- **L'import en masse** : chapitres, repères et zones s'importent depuis un tableur
  pour préparer un plateau complet hors de l'écran.

## Vérifier qu'un plateau tient ses promesses

Chaque repère porte **deux choses distinctes** qui se ressemblent beaucoup :

1. un **texte d'effet** (« Bonne réponse : +1 gemme », « Avance de 2 cases ») — c'est ce
   que l'élève **lit** ;
2. des **effets machine** (cœurs, gemmes, déplacement, passe-ton-tour) — c'est ce que le
   jeu **applique**.

Rien ne relie automatiquement les deux : on peut écrire une promesse dans le texte sans
la câbler dans les effets, et l'application ne signalera aucune erreur. L'élève lit
« +1 gemme », son compteur ne bouge pas, et personne ne s'en aperçoit. Pour une classe
de 6ème, c'est le pire des cas : une règle affichée qui ne s'applique pas apprend que le
jeu n'est pas fiable.

Le **contrôle de cohérence des plateaux** compare les deux et liste les écarts, par
chapitre et par repère. Il ne corrige rien : il vous montre où le texte et le moteur
divergent, à vous de décider — câbler l'effet, ou retirer la promesse du texte.

Quatre types d'écart :

- **Promesse conditionnelle non câblée** — la case annonce un gain qui dépend d'une
  issue (« Bonne réponse : +1 gemme », « Si réussi : +1 gemme, sinon −1 cœur », « la
  première équipe arrivée gagne 3 gemmes »). Le jeu ne sait pas exprimer ce genre de
  condition : ses effets se déclinent en neutre / gnome / licorne, jamais en
  bonne réponse / mauvaise réponse. **Rien ne sera appliqué**, quoi qu'il arrive.
- **Promesse non tenue** — la case annonce un effet simple, le moteur n'applique rien.
- **Promesse divergente** — la case annonce un montant, le moteur en applique un autre.
- **Effet non annoncé** — le moteur agit sans que rien ne l'explique à l'élève.

## ⚠️ Points d'attention

> ⚠️ **Point d'attention** — Un plateau riche se prépare **avant** la séance : dessiner
> les zones et régler les effets en direct devant la classe est possible mais
> inconfortable. Le studio et l'import tableur sont faits pour préparer en amont.

> ⚠️ **Point d'attention** — **Il faut être sur place.** Un élève ne déclenche le contenu
> d'une zone que si sa mascotte est réellement dans cette zone, et les effets d'un repère
> que si son équipe est posée dessus. Sinon l'application répond « votre mascotte n'est pas
> dans cette zone » ou « votre équipe n'est pas sur ce repère » : ce n'est pas une panne,
> c'est la règle — sans quoi une classe pourrait encaisser cœurs et gemmes de tout le
> plateau sans jamais se déplacer. **Le MJ, lui, garde la présentation à distance** :
> montrer une zone à la classe ou rattraper une équipe bloquée reste possible depuis la
> console.

> ⚠️ **Point d'attention** — Le déclenchement des contenus de zone dépend du réglage
> de répétition (« une fois par partie » par défaut) : si un popover ne s'ouvre plus,
> ce n'est pas une panne — l'équipe l'a déjà vu. Le réglage se change globalement, et
> peut être surchargé partie par partie depuis la console MJ.

> ⚠️ **Point d'attention** — **Supprimer un chapitre efface aussi ses zones du royaume.**
> Les feuillets qui étaient ancrés à ces zones ne sont **pas** supprimés, mais ils perdent
> leur ancrage carte (le lien direct feuillet ↔ zone repasse à « non ancré »). La suppression
> reste par ailleurs refusée tant qu'une partie s'appuie sur le chapitre. Pour repérer et
> réparer ces feuillets après coup : **Contenus → Carnet de Sélène → Vue d'ensemble** affiche
> un compteur **« ancrage carte perdu »** et un filtre dédié ; le rattachement se rétablit soit
> depuis l'éditeur d'une zone (« Associer » / « Détacher » un feuillet), soit depuis l'éditeur
> de feuillet (champ **Ancrage carte**), y compris **en masse** sur une sélection. Le bouton
> **« Aperçu »** de la vue d'ensemble ouvre directement le feuillet concerné (contenu joueur,
> puis onglet **« Édition »**) : on répare sans changer d'onglet.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Chapitres et progression](chapitres-et-progression.md) · [Les deux peuples du seuil](lore-deux-peuples.md) · [Sommaire](../README.md)
