# Gnomes & Licornes · « Tenir à deux » · Règles de référence v3

17 novembre 2026 · fait foi pour la construction. Toute règle ci-dessous est soit un comportement fixe, soit un **réglage** (§ 15) avec sa valeur par défaut. Les garde-fous du § 1 priment sur tout le reste.

La v3 applique **l'ensemble unifié** des six audits du 15 novembre : 19 décisions de mécanique (M) et 7 de lore (L), tranchées par Oliv les 16 et 17 novembre. Fil directeur : **on enlève avant d'ajouter**. Elle se livre en cinq PR (1a, 1b, 2, 3, 4 — `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`). Ce document décrit la règle visée ; quand le code d'une règle arrive dans une PR à venir, c'est dit sur place : « _(code : PR 2)_ ». Sans mention, la règle est en place (PR 1a et 1b).

## 0. Décisions prises par Oliv

**Du 30 octobre au 6 novembre (v2), toujours en vigueur**

- Mouture C « Tenir » (voile) avec l'asymétrie et la coopération de B (tenir à deux).
- Pages : zones invisibles à fouiller au clic, question sur le dessin ; **8 zones aux chapitres 1 et 2, 10 aux chapitres 3 et 4** ; pistes de veillée.
- **Tenir par question de lecture** (validation automatique).
- Marché : annonces, échange à deux, dons, parures.
- Pas de limite « un sort par tour » : chaque sort a sa **fenêtre** et sa **limite** propres.
- Rôles changent à chaque cours ; équipes rebrassées à chaque chapitre, peuples inversés 1↔2 et 3↔4.
- Dé du voile lancé par le prof ; vent activable par partie.
- Greffes : péripéties, missions secrètes, Bestiaire des chimères, oiseau chapardeur et témoin, Olu commentateur, titres, farce.

**Les 16 et 17 novembre (ensemble unifié)**

| #   | Décision                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Une seule monnaie, les gemmes**, 3 au départ, plafond 8, gardée toute l'année. Les cœurs sortent de tout écran et de toute règle. La conduite ne passe par aucune monnaie. _(code : PR 4)_                                                                                                   |
| M2  | **Fouilles : 2 par équipe et par tour, 1 sous le voile**, pour les deux peuples. Une zone pâlie ne se fouille que par une équipe gnome. Seule une fouille licorne « pas encore » révèle la zone à la classe.                                                                                   |
| M3  | **Case Souffle : au tour suivant, l'équipe ne lance qu'un dé.** Ni recul, ni tour passé, ni ressource retirée. Cases positives : leur mouvement, sans ressource ; seule la case Trame donne une gemme.                                                                                         |
| M6  | **Grimoire à 19 sorts.** Sortent : Nommer, Héritage, Boussole, Tablette, Musique (et le sort de classe Lumière). Cordée lancée pendant le jeu, effet au prochain tour.                                                                                                                         |
| M7  | **Trois cases Défi par plateau**, à l'arrêt exact : rangs 11, 20 et 29 (30 au plateau 4).                                                                                                                                                                                                      |
| M8  | **Apprendre en jouant** : escalier automatique du chapitre 1, lignes d'Olu « première fois », page témoin, écrans « Maintenant, vous pouvez… » et « Ce qui change », une seule limite de veillée. Remplace le profil `prologue`. _(code : PR 2)_                                               |
| M9  | **Questions de case** : d'abord les questions vives pas encore posées, puis les autres sous un plafond de difficulté par plateau ; à partir du plateau 2, une question sur cinq vient d'un biome déjà traversé.                                                                                |
| M10 | **Cinq rôles, conseillés, jamais bloquants** (§ 2).                                                                                                                                                                                                                                            |
| M12 | Tablette par défaut, dés tirés par l'app, sablier du tour à 8 min ; la surface `hybride` sort des choix proposés.                                                                                                                                                                              |
| M13 | **Plusieurs appareils par équipe** : la main, version d'état, sessions d'équipe protégées, bourses au propriétaire, absent spectateur, délai de débat de 8 s. _(code : PR 3)_                                                                                                                  |
| M14 | **Charge du prof** : sorts du Travail débités tout de suite ; Retrait levé à la clôture du tour ; présences sans confirmation ; bilan Team Spirit « 6 par défaut » ; copier la configuration d'une partie ; mot de passe d'élève réinitialisé en un appui.                                     |
| M16 | **Plateau 4 : une Cordée offerte par équipe** pour le chapitre.                                                                                                                                                                                                                                |
| M17 | **La Lumière, version simple** : jauge commune qui ne descend jamais ; à 100, le voile recule de 5, d'office.                                                                                                                                                                                  |
| M18 | Une séance de Trame par chapitre pour toute la classe (aucune ligne de code).                                                                                                                                                                                                                  |
| M19 | **Gemmes rares** : une page tenue rapporte + 1 gemme à chaque membre présent de l'équipe qui la fait tenir. Parures de 2 à 8 gemmes, gardées toute l'année _(parures : PR 4)_.                                                                                                                 |
| M20 | Une réussite à un défi de la Trame ouvre aussi **une piste** ; en mode équipe, elle ajoute 10 à la Lumière. Jamais de gemme.                                                                                                                                                                   |
| M21 | **Trois défis de la Trame de plus**, ouverts aux deux peuples : « Le bon rôle », « Les fils de l'adaptation », « Le bon pays ». _(code : PR 2)_                                                                                                                                                |
| M22 | **Chaque question de zone trouve sa réponse sur le site** (fiche d'espèce ou terme de glossaire relié à la zone).                                                                                                                                                                              |
| M23 | **Mentorat** : coût 3, jamais remboursé, un seul par séance et par classe, un « pas encore » se retente sans repayer. **Lettre** : coût 2, un « pas encore » se réécrit sans repayer, trois amorces d'Olu. **La Plume sort** du grimoire du voyageur.                                          |
| L2  | La fin de chapitre s'appelle **le camp** ; **le Seuil** reste l'espace personnel de l'élève. Honneur Éclaireurs → **Avant-garde** ; Passeurs → **Compagnons** ; badges Passeur de page → **Porte-page**, Passeur de seuil → **Grand voyageur** ; sceau licorne Éclaireuses → **Révélatrices**. |
| L5  | La zone `cz-p2-08` s'active avec le feuillet `ep-I-06`.                                                                                                                                                                                                                                        |
| L7  | Une Lettre validée est une **page du voyageur, en marge** du carnet : elle ne compte pas pour le carnet complet.                                                                                                                                                                               |

**Non retenues, donc inchangées** : le pâlissement des pages trouvées non tenues (10 % par tour sous le voile, 50 % au plus, sauf Abri) ; le carnet complet = toutes les pages actives (8, 8, 10, 10) ; le Marché garde annonces, échange à deux et dons ; sceaux et badges restent sur l'écran d'équipe. Le voile reste à 3 / 4 / 5 / 6.

## 1. Garde-fous (non négociables)

1. Le Souffle n'est jamais personnifié : un **voile**, une bande grise, des pages qui pâlissent ; il se décrit par ses effets (pâlir, se taire, s'effacer) ; vocabulaire _tenir / résister_ ; jamais monstre, ennemi, attaque, poursuite. Pas de visage, pas de voix, pas d'icône de créature.
2. L'oiseau n'est **jamais nommé** côté élève, ni par Olu, ni dans un indice, ni dans un titre. Dans le code, l'identifiant `kraa` est toléré ; dans toute chaîne visible, c'est « l'oiseau » ou rien.
3. Aucun contenu du tiers `secret` du lore (glossaire, feuillets, visages) dans une question, un indice, un texte de zone, une ligne d'Olu. Un nom de visage n'apparaît pas avant son plateau. Jamais le visage de Sélène.
4. **L'erreur ne punit jamais** : une mauvaise réponse ne coûte **rien** — ni case, ni ressource, ni fouille, ni tour, ni temps d'attente ; elle révèle. Côté élève, jamais « non », « faux », « raté », « perdu » : « pas encore », « la page dort encore ici ».
5. **Le savoir sert à jouer, il ne paie pas** : aucune ressource pour une bonne réponse de case, une fiche lue, un défi réussi, une arrivée, un journal. Les gemmes viennent des pages tenues, de la Trame, du carnet complet, du Marché.
6. Bourses privées : un élève voit sa bourse et celles de son équipe, jamais celles des autres équipes ; le prof voit tout. La distance au voile est publique. Aucun classement d'élèves nulle part.
7. Aucune donnée d'élève dans les logs ni dans les tests ; fixtures anonymes.
8. Isolation G&L / ForetMap respectée (routes `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`).
9. Tout ce qui touche au réel (sorts du Travail et du camp, Retrait, exports) passe par le prof. Le serveur rejoue les droits ; le client grise.
10. Toute écriture de bourse passe par le grand livre (`applyBourseDeltaTx`) ; la réserve par `creditReserveTx` / `debitReserveTx`.
11. **Aucun état d'attente sans sortie automatique** : ce qui attend un geste (jet en suspens, défi, demande, Mentorat) se résout ou s'annule seul au changement de phase, à la clôture du tour ou au camp.
12. Olu dit le geste, jamais de morale. Parité fille / garçon dans tout libellé genré.

## 2. Entités et vocabulaire

- **Partie** = une classe (groupe) × un chapitre (plateau 1 à 4). **Tour** = une séance. **Le camp** = fin de chapitre (la dernière case, puis la clôture). **Le Seuil** = l'espace personnel de l'élève (niveau, grimoire du voyageur, Lettre, Mentorat, badges). Dans le code, la fenêtre des sorts de fin de chapitre garde sa clé `seuil` ; à l'écran, on lit « au camp ».
- **Équipe** : 4 par partie, 2 de peuple `gnome`, 2 de peuple `unicorn`, 5 élèves (4 si besoin). Rebrassage automatique à chaque chapitre ; contrainte dure : chaque élève change de peuple entre les chapitres 1 et 2, puis 3 et 4 ; les joueurs sans historique sont répartis pour équilibrer. Mascotte par équipe, choisie au camp dans le catalogue typé (deux gnomes, deux licornes ; versions masculines et féminines).
- **Rôles** (M10, cartes Job, papier) — **cinq, conseillés, jamais bloquants** : **Gestionnaire** (lance les dés), **Éclaireuse / Éclaireur** (répond à la question de case), **Opératrice / Opérateur** (fouille), **Secrétaire** (lit et fait tenir), **Assistante / Assistant** (jette les sorts ; à quatre, fait aussi l'Éclaireur). Ils changent à chaque cours. L'écran appelle le rôle _(code : PR 2)_, n'importe quel membre peut agir : le serveur ne lit jamais un rôle.
- **Page** = un feuillet du corpus mis en jeu dans une **zone** de chasse. États : `endormie`, `revelee`, `trouvee`, `tenue`, `palie`, `reparee` (puis `tenue`).
- **Bourse** : les **gemmes** (`power_points`), une par élève (§ 8).
- **Voile** : une position (rang de case) par partie, −1 avant le premier dé gris.
- **Surface** d'une partie : `tablette` (défaut) ou `tableau`. La surface `hybride` existe encore dans le moteur, mais n'est plus proposée (M12).

## 3. Le tour

Un tour est un objet serveur à **phases** : `ouverture` → `jeu` → `souffle` → `clos`. Le prof ouvre et ferme les phases. L'ordre des équipes est figé à l'ouverture : **ordre inverse du plateau** (la plus en retard d'abord ; égalité → identifiant croissant). Les cinq gestes d'une équipe : **Jeter** (un sort), **Lancer** (les dés), **Répondre**, **Fouiller**, **Lire** (et, à tout moment pendant `jeu`, les actions de Marché si la surface les permet).

**Permissions par surface** (le prof peut toujours tout faire) :

| Geste                                              | tableau                     | tablette                                                               |
| -------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Jeter                                              | prof (pour l'équipe active) | membre, pendant `jeu`                                                  |
| Lancer                                             | prof                        | membre, pendant `jeu` (dés serveur ou saisie physique soumise au prof) |
| Répondre (case)                                    | prof                        | membre                                                                 |
| Fouiller                                           | prof                        | membre                                                                 |
| Lire / Tenir                                       | prof                        | membre                                                                 |
| Voile (dé gris)                                    | prof                        | prof                                                                   |
| Retrait, avance libre, absences, file des demandes | prof                        | prof                                                                   |

- Au `tableau`, une seule équipe est **active** à la fois (bouton « équipe suivante ») et un **sablier** client (réglage, 180 s) tourne ; rien n'est annulé quand il sonne. Rien ne change au tableau sans décision.
- Sur `tablette`, les équipes agissent **en parallèle** pendant `jeu` ; le moteur accepte des actions simultanées d'équipes différentes (une action par équipe à la fois, verrouillage par équipe). Plusieurs appareils par équipe : la main, la version d'état, les sessions protégées _(code : PR 3)_.
- **Présences sans confirmation** (M14) : **tout le monde est présent par défaut**. Rien n'est à confirmer, rien n'attend. S'il manque quelqu'un, l'équipe ouvre « Il manque quelqu'un ? », touche les absents, puis « C'est bon » ; « Quelqu'un vient d'arriver » remet un retardataire dans le tour. Le prof corrige quand il veut. Un absent ne verse pas au pot, et le gain d'une page tenue ne va qu'aux membres présents (§ 6).
- **Retrait** (conduite, hors économie) : bouton par élève sur l'écran du prof ; un élève en retrait joue, fouille, lit et tient une page, mais ne verse pas au pot et ne voit pas le Marché. **Il se lève tout seul à la clôture du tour** (M14) : un retrait ne dure jamais d'une séance à l'autre. Motif libre, visible du prof seul. Aucun compteur, aucune bourse touchée.
- **Phase `souffle`** : le prof lance le dé gris (§ 7) ; le mot du Passeur (une page de route) s'affiche ; les missions secrètes réussies se déclarent (papier) ; Olu commente.
- **File du prof** : une seule liste de ce qui attend son geste, la plus ancienne en haut — dés à valider, jets en suspens, sorts à honorer, Lettres et chimères à relire, Mentorats à écouter, défis à juger. Rien n'y reste sans sortie (garde-fou 11).
- Toute action écrit un événement (`gl_game_events`) et pousse l'état à tous les écrans (temps réel si disponible, sinon rechargement au clic : la prod est en long-polling).

**Lancer, trois modes** (réglage `des_mode` : `serveur` sur tablette, `physique` au tableau) :

- `serveur` : les dés sont tirés par l'app.
- `physique` : le Gestionnaire lance de vrais dés ; les faces (chacune 1 à 6) sont saisies et journalisées ; sur tablette, la saisie attend un clic du prof (réglage `des_physiques_validation` : `prof` | `auto`).
- **Avance libre** (prof seulement, tout mode) : un nombre de cases de 1 à 12 pour une équipe, journalisé avec motif libre ; applique les effets de case comme un jet.

## 4. Avancer

- Deux dés (réglage `des_count`, défaut 2). Le pion avance du total ; les effets de la case d'arrivée s'appliquent (Trame, Souffle, péripétie, question, défi).
- **Question de case** (réglage `questions_de_case`, défaut `true`) : l'équipe répond ; **juste → +1 case puis relance** (deux dés), **une seule relance par équipe et par tour** (réglage `relances_max_par_tour`, 1 ; 0 = illimité) ; au-delà, une bonne réponse donne +1 case sans relance ; « pas encore » → rien. Aucune ressource, aucun score.
- **Tirage de la question** (M9), dans l'ordre : (1) une **question vive** (`VQCM…`) du biome de la case, pas encore posée dans la partie ; (2) sinon une question du biome, de difficulté inférieure ou égale au plafond du plateau (réglage `questions_difficulte_max_par_plateau` `{1: 2, 2: 3, 3: 3, 4: 3}`), pas encore posée à cette équipe ; (3) à partir du plateau 2, avec la probabilité du réglage `questions_spirale` (20 %, une question sur cinq), le biome est tiré parmi ceux des plateaux déjà traversés. Aucun tirage vide : on relâche d'abord « pas encore posée », puis le plafond. Les bornes de difficulté portées par une case sont ignorées.
- **Case Trame** : **+1 gemme** à chaque membre de l'équipe, quel que soit son peuple, plafonnée. C'est la seule case qui donne une ressource.
- **Case Souffle** (M3) : **au tour suivant, l'équipe ne lance qu'un dé.** Même effet pour les deux peuples et les quatre plateaux. Ni recul, ni tour passé, ni ressource retirée.
  - L'état se pose quand le pion **s'arrête** sur la case (après le jet, la relance ou le +1 d'une question juste) ; Sentier l'empêche.
  - C'est un oui / non par équipe : deux cases Souffle avant le tour suivant ne se cumulent pas.
  - Il se consomme au **premier lancer** du tour suivant (un dé tiré par l'app, ou une seule face saisie) ; la relance d'une question juste se joue à deux dés ; le sort Relance relance ce seul dé.
  - Il s'efface si l'équipe arrive au camp, et à la clôture de la partie.
  - Il s'affiche aussitôt sur l'écran d'équipe, la console et la projection : « Au prochain tour : un seul dé », puis « Ce tour-ci : un seul dé ».
- **Cases positives** du plateau : leur mouvement, sans ressource (réglage `cases_positives` : `neutre` | `brut`, défaut `neutre`). Une case qui faisait reculer ne fait plus reculer.
- **Vérité des cases** : le texte d'effet montré à l'élève à l'arrivée (écran d'équipe, popover, journal, projection) est **calculé depuis l'effet réellement appliqué** et jamais lu dans `effet_mecanique`, champ d'auteur réservé au studio de plateau ; le contrôle `gl_marker_promises` refuse toute promesse affichée que le moteur ne tient pas.
- **Péripéties** : une case événement sans texte, et (réglage `peripeties_cases_neutres`) une case `behavior` sans effet de tonalité négative ou neutre, tire une consigne du fichier `peripeties.json` (par biome) ; la description de la case reste affichée au-dessus ; bouton « on passe ».
- **Cases Défi** (M7) : **trois par plateau**, aux rangs 11, 20 et 29 (30 au plateau 4), à l'arrêt exact (§ 15, « Défi de case »).
- **Vent de la caravane** (réglage `vent`, défaut `true`, `vent_cases` 3) : dès le tour 2, si une seule équipe est dernière, elle avance de `vent_cases` à l'ouverture du tour ; elle joue en premier de toute façon.
- **Arrivée** : la première équipe au camp gagne l'honneur de l'**Avant-garde** ; ensuite, à chaque tour, son jet est appliqué à l'équipe la plus en retard. Elle continue de fouiller, lire, jeter.
- **Le camp** : la partie se clôt quand les quatre équipes sont au camp, ou quand le prof clôt la partie à la date fixée (« la caravane porte les retardataires »). À la clôture : honneurs, titres, sceaux, badges.

## 5. La chasse (fouiller)

- Chaque plateau cache **N zones** (réglage `zones_par_plateau` `{1:8, 2:8, 3:10, 4:10}`). Les 36 zones du catalogue sont actives (L5 : `cz-p2-08` porte le feuillet `ep-I-06`). Une zone = un polygone (coordonnées normalisées 0-1 sur l'image du plateau), un feuillet, un indice d'une ligne, une question fixe (`question_code`) sur le détail dessiné, un thème de secours, un rang de case (case du chemin la plus proche, pour le voile), une à trois fiches d'espèces (`especes`) et, s'il y a lieu, des termes de glossaire (`glossaire`).
- **Le carnet de la classe** liste les N pages : indice, état, pâlissement, et « **révélée par X, trouvée par Y, tenue par Z** ». Les polygones ne sont jamais envoyés aux élèves. En dessous, **en marge**, les Lettres validées (L7), hors du compte.
- **Fouilles par tour** (M2) : `fouilles_par_tour` (2) par équipe, pour les deux peuples ; `fouilles_sous_voile` (1) sous le voile, sauf Abri ou Cordée qui rendent le quota entier ; +1 par Grand Regard. Aucun couple équipe × séance sans fouille possible.
- **Fouiller = cliquer** (x, y normalisés) :
  - dans une zone `endormie` ou `revelee` : une question. Zone jamais tentée dans la partie → sa question fixe ; déjà tentée → une question du thème de secours, en excluant les codes déjà présentés pour cette zone. **Juste** → `trouvee` (découvreuse = l'équipe), carnet personnel des membres présents. **« Pas encore »** → rien n'est retiré ; si c'est une équipe **licorne**, la zone passe `revelee` (contour visible de toute la classe, crédit « révélée par ») ; une fouille gnome « pas encore » ne révèle rien.
  - **La réponse est sur le site** (M22) : après un « pas encore », l'écran dit où la lire — « La réponse se trouve dans la fiche … » ou « … au mot … du glossaire ». Un lien, jamais la réponse.
  - dans une zone `palie` : réservée aux équipes **gnomes** (c'est la réparation) ; une équipe licorne lit « Cette zone a pâli : les Gnomes savent la réparer. », sans perdre sa fouille. Juste → `reparee` (= trouvée, découvreuse = l'équipe).
  - dans une zone `trouvee` / `tenue` : rien (« déjà trouvée »).
  - à côté : verdict `froid` / `tiede` / `chaud` selon la distance au centroïde de la zone endormie ou pâlie la plus proche (réglage `fouille_seuils` `{ chaud: 0.06, tiede: 0.15 }`), une **empreinte** visible de toute la classe sur le plateau.
- **L'oiseau, témoin** : à chaque fouille, la mascotte de l'oiseau vole jusqu'au point cliqué et joue un état selon le résultat. Muet, sans nom, sans bulle.
- **Pistes** : quand un élève étudie entièrement la fiche d'une espèce liée à une page endormie du chapitre, ou réussit un défi de la Trame (M20), une page endormie se **révèle** à la classe. Jamais plus d'une piste par élève et par semaine (réglage `pistes_par_semaine`, 1), toutes sources confondues.
- **Lanterne** (sort licorne) révèle la zone endormie la plus proche du pion.
- **Carnet complet** (toutes les pages actives `tenue`) : +1 gemme à tout le groupe, voile −`recul_carnet_complet` (3), une seule fois.

## 6. Tenir (lire)

- Une page `trouvee` ou `reparee` est **tenue** quand une équipe **de l'autre peuple** que la découvreuse l'ouvre **et répond juste à sa question de lecture** (`questions-lecture.json` : une question par page, 4 choix, sur le contenu de la page ; retentatives illimitées, aucune perte). Un « pas encore » peut porter un retour propre au choix touché.
- À l'instant où elle est tenue (M19) : **+1 gemme à chaque membre présent de l'équipe qui la fait tenir** (les lecteurs), plafond appliqué ; **rien à l'équipe qui l'a trouvée**. En veillée, le gain va aux membres de l'équipe du lecteur.
- Une page ouverte par une équipe du **même** peuple que la découvreuse passe `read` pour elle (lecture), sans gain. Une page tenue reste lisible par tous.
- **Veillée** : un élève connecté peut ouvrir et tenir une page pour son équipe (limite hebdomadaire, § 14).
- Lecture gratuite partout.

## 7. Le voile

- Position par partie, −1 au départ. En phase `souffle`, le prof lance le **dé gris** : 1d6 (serveur ou saisi) + bonus du plateau (réglage `voile_bonus_par_plateau` `{1:3, 2:4, 3:5, 4:6}`). Le prof peut **ne pas lancer** une semaine (bouton « le voile dort »).
- Avance : `position = min(position + total, rang du camp − 1)`.
- **Équipe sous le voile** (rang de son pion ≤ position) : **une fouille par tour** au lieu de deux (sauf Abri ou Cordée) ; ses pages `trouvee` non `read` par elle pâlissent de `palissement_pct` (10) par tour, plafond `palissement_max` (50), sauf Abri ; elle avance, répond, jette, lit, participe au Marché normalement. **Aucune ressource n'est retirée.**
- **Zones** `endormie` / `revelee` dont le rang ≤ position → `palie` (réparables par les Gnomes). **Plancher de pâlissement** : une zone de rang < `palissement_rang_plancher` (8) est traitée comme de rang 8 — les zones proches du départ ne pâlissent pas dès le premier dé gris. 0 = désactivé.
- **Reculs** : carnet complet (3), Lumière (5, d'office au palier), défi de case relevé (2). Jamais en deçà du départ. Rien à remettre au camp : l'état est par partie.
- Rendu : les cases de rang ≤ position en gris semi-transparent, une polyligne grise large le long du chemin, mascotte des équipes sous le voile en état triste sans texte, légende « le voile ».

## 8. La monnaie

- Chaque élève a **une bourse de gemmes** : 3 au départ du chapitre 1, plafond 8 (réglage `max_power_points`), **gardée toute l'année**, visible de lui, de son équipe et du prof.
- **Ce qui en donne** : une page tenue (aux lecteurs présents), une case Trame, le carnet complet, un don ou un échange au Marché. **Ce qui en prend** : un sort, un échange, un don, une parure, l'oiseau chapardeur. Rien d'autre.
- **Pot** d'un sort : réparti à parts égales entre les membres **présents et non en retrait** de l'équipe (reste au plus riche), modifiable avant le lancement ; un membre à 0 ne verse pas.
- **Réserve de la caravane** (réglage `surplus_reserve` true) : un gain qui dépasserait le plafond d'un élève va à la réserve de son équipe, partie par partie. La réserve paie **en premier** le pot des sorts de l'équipe ; elle est visible de l'équipe et du prof (jamais en projection) et s'éteint au camp, sans transfert. La somme du grand livre vaut les bourses **plus** les réserves.
- **Rappel d'Olu** (réglage `olu_bourse_pleine` true) : quand au moins 3 membres d'une équipe sont au plafond, Olu le dit **une fois par séance** à l'écran d'équipe, jamais en projection.
- **Geste exceptionnel du prof** sur une bourse : route existante, motif obligatoire, journalisé, plafonné.
- **La conduite ne passe par aucune monnaie** : cartes Team Spirit (§ 11) et Retrait (§ 3).

> **État du code (jusqu'à la PR 4).** Le moteur porte encore deux bourses : `power_points` (gemmes) et `health_points` (cœurs). Les **gains** sont déjà tous en gemmes (Trame, page tenue, carnet complet), sauf la réparation d'une page pâlie (+1 cœur aux Gnomes de l'équipe). Les **coûts** des sorts suivent encore la ressource du catalogue (`gemmes`, `coeurs`, `peuple` = gemmes pour une Licorne et cœurs pour un Gnome, `choix`). La PR 4 passe tout en gemmes, sort les cœurs de l'écran et convertit les bourses des parties en cours.

## 9. Le Marché

- **La place** : annonces par élève, type `cherche` | `offre` | `propose`, avec ce qui est cherché ou offert (des gemmes, une page par code). Visibles de toute la classe. Répondre à une annonce ouvre l'**échange à deux**, pré-rempli, négociable jusqu'à double acceptation ; l'annonce se ferme à la conclusion ou expire à la clôture de la partie.
- **Don** : bouton, sans accord du receveur, des gemmes ou une copie de page à la fois, immédiat, journalisé, plafond du receveur respecté (le surplus reste au donneur).
- Les pages se copient (le découvreur garde son nom) ; un élève sans ressource peut afficher `cherche` et recevoir ; un élève en retrait ne voit pas la place.
- **Parures** (M19) : un comptoir (catalogue `parures.json`), de **2 à 8 gemmes**, deux ou trois rares ; une parure achetée **reste à l'élève toute l'année** et se rééquipe sur la mascotte de sa nouvelle équipe (« Garde-robe » au Seuil) ; elle ne s'échange pas ; aucun effet de jeu. _(code : PR 4 — aujourd'hui, prix de 2 à 4, parure portée par l'équipe et rendue au camp)_
- Le Marché est disponible en veillée et, pendant `jeu`, sur tablette (réglage `marche_pendant_tour`, défaut `true`). Au chapitre 1, il s'ouvre à la séance 4 (escalier, _code : PR 2_ ; d'ici là, il est éteint au chapitre 1 par une surcharge de la partie, que le prof rallume d'un clic).

## 10. Le grimoire

Chaque sort a : `code`, `nom`, `peuple`, `cout`, `fenetre` (quand il est lançable), `limite` (par tour, par séance, par chapitre, par élève), `cible`, `execution` (`auto` | `prof`), `effet_auto_json`. Le catalogue complet est dans `sorts.json`. **19 sorts** (M6) :

| Famille  | Sort         | Coût | Fenêtre                                                 | Limite                            | Effet                                                                                                           | Exécution |
| -------- | ------------ | ---- | ------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| Commun   | Progression  | 1    | juste après le jet de l'équipe, tant que la case attend | 1/tour/équipe                     | ±1 case **sans appliquer la case d'arrivée** (réglage `progression_applique_case`)                              | auto      |
| Commun   | Relance      | 2    | juste après le jet de l'équipe                          | 1/tour/équipe                     | annule le jet en attente : la mascotte revient, la case ne s'applique pas, l'équipe rejette les dés             | auto      |
| Commun   | Farce        | 1    | phase `jeu`                                             | 1/séance/équipe                   | la mascotte d'une autre équipe danse 10 s                                                                       | auto      |
| Licornes | Lanterne     | 2    | phase `jeu`, avant une fouille                          | 1/tour/équipe                     | la zone endormie la plus proche du pion devient `revelee`                                                       | auto      |
| Licornes | Bourrasque   | 2    | phase `jeu`                                             | 1/tour/équipe, cible autre équipe | +3 cases à la cible, sans effets de case ni tour consommé                                                       | auto      |
| Licornes | Grand Regard | 3    | phase `jeu`                                             | 1/tour/partie                     | +1 fouille à chaque équipe ce tour                                                                              | auto      |
| Gnomes   | Sentier      | 2    | avant le jet                                            | 1/tour/équipe                     | la prochaine case Souffle n'a pas d'effet sur l'équipe                                                          | auto      |
| Gnomes   | Abri         | 2    | phase `jeu`                                             | 1/tour/équipe, cible autre équipe | la cible garde ses fouilles et ne pâlit pas ce tour, même sous le voile                                         | auto      |
| Gnomes   | Relais       | 3    | phase `jeu`                                             | 1/tour/partie                     | l'équipe la plus en retard rejoint la case du lanceur                                                           | auto      |
| Pacte    | Cordée       | 4    | phase `jeu`                                             | 1/tour/partie                     | offerte à une équipe de l'autre peuple : **au prochain tour**, les deux avancent du meilleur de leurs deux jets | auto      |
| Travail  | Question     | 2    | pendant l'activité                                      | 1/séance/équipe                   | poser une question au prof hors cartes                                                                          | prof      |
| Travail  | Conseil      | 2    | activité                                                | 1/séance/équipe                   | 30 s avec une autre équipe                                                                                      | prof      |
| Travail  | Pause        | 3    | activité                                                | 1/séance/équipe                   | cinq minutes de pause d'équipe                                                                                  | prof      |
| Travail  | Rôle         | 2    | activité                                                | 1/séance/équipe                   | choisir son rôle à la séance suivante                                                                           | prof      |
| Camp     | Esquive      | 3    | au camp ou en veillée                                   | 1/trimestre/élève                 | reporter un rendu                                                                                               | prof      |
| Camp     | Mentorat     | 3    | au camp ou en veillée                                   | 1/chapitre/élève                  | expliquer deux minutes à la classe une page ou une espèce (voir plus bas)                                       | prof      |
| Camp     | Lettre       | 2    | au camp ou en veillée                                   | 1/chapitre/élève                  | une page écrite par l'élève entre au carnet de la classe, en marge, après relecture (voir plus bas)             | prof      |
| Camp     | Choix        | 4    | au camp                                                 | 1/chapitre/partie                 | choisir son équipe au prochain chapitre (épingle de composition)                                                | prof      |
| Camp     | Consécration | 8    | 3e trimestre                                            | 1/élève                           | vert + au bulletin ; **visible grisée dès le chapitre 1**, avec son prix, comme but de l'année _(grisé : PR 4)_ | prof      |

- **Sortis du grimoire** (M6) : Nommer, Héritage, Boussole, Tablette, Musique, et le sort de classe Lumière (la Lumière agit d'office, § 11). Ils restent en base, non lançables, pour que les parties de test restent lisibles.
- **Ouverture par chapitre** (`gl_chapter_spells`, cumulative) : **ch. 1** Progression, Relance, Farce, Lanterne, Bourrasque, Sentier, Relais, Question ; **ch. 2** Grand Regard, Abri, Cordée, Conseil, Pause, Rôle ; **ch. 3** Esquive, Mentorat, Lettre, Choix ; **3e trimestre** Consécration.
- **Écran des sorts en cinq moments** : « Avant de lancer », « Après le jet », « Pendant le tour », « Pendant l'activité », « Au camp ou en veillée ». Il ne montre que ce qui est **lançable et payable** à cet instant.
- **Pas de quota global** par tour : seules les limites par sort s'appliquent ; un sort hors fenêtre est refusé avec le message de la fenêtre.
- **Cordée** (M6, M16) : lancée **pendant le jeu**, elle agit **au prochain tour** des deux équipes ; si elle ne s'est pas faite, elle est rendue au souffle de ce tour, ou au camp. **Au plateau 4, la première Cordée de chaque équipe est offerte.**
- **Sorts du Travail** (M14) : **payés dès le lancement**, ils entrent dans la file du prof, qui les **honore**, ou les **refuse et les rembourse** en entier. Un sort du Travail resté sans réponse est rendu à l'ouverture de la séance suivante ou au camp.
- **Mentorat** (M23) : coût 3, **jamais remboursé**. **Un seul par séance et par classe** : le second est refusé avant tout débit (« Un Mentorat est déjà prévu aujourd'hui. »). Consigne : expliquer à la classe, en deux minutes, une page du carnet ou une espèce du biome. Le prof juge : « Réussi », ou « **Pas encore** » avec une piste — l'élève **retente une autre séance sans repayer**. Un Mentorat que le prof n'a pas écouté repasse seul en « pas encore » à la séance suivante (garde-fou 11) : l'élève lit alors un texte neutre (« Ton Mentorat n'a pas pu passer cette fois… »), jamais le retour d'une écoute qui n'a pas eu lieu. Aucune ressource pour un Mentorat réussi. Lettre et Mentorat se jouent depuis le Seuil : si le module Seuil est coupé, les deux sorts sont refusés avant tout débit.
- **Lettre** (M23, L7) : coût 2, payée une fois. L'élève écrit sa page au Seuil, à partir d'une des **trois amorces d'Olu** (« Ce que j'ai vu », « Ce qui m'a surpris », « Ce que je me demande »). Le prof relit : « Valider », ou « **Pas encore** » avec une piste — l'élève **réécrit sans repayer**, autant de fois qu'il le faut. Validée, c'est une **page du voyageur, en marge** du carnet de la classe : elle ne compte pas pour le carnet complet. Une Lettre en relecture **suit son auteur** : si la partie où elle a été payée est close, elle rejoint la file du prof de la partie où l'élève joue (à l'écriture, ou à l'ouverture de la séance suivante).
- **Grimoire du voyageur** (individuel, gratuit, un usage par chapitre, débloqué par le niveau du Seuil) : **Loupe** (niveau 2, écarte une mauvaise réponse pendant une question), **Mémoire** (3, relire une page pâlie), **Flair** (4, une fouille personnelle en veillée : verdict seulement, empreinte partagée). **La Plume est sortie** (M23) : une page d'élève passe par la Lettre. **Seconde chance** (1) n'existe que si un délai d'attente est réglé (`delai_fiche_secondes` > 0, § 15) : à 0, défaut, une fiche se retente tout de suite et le sort n'a plus d'objet. Messager (6) reste réservé aux Deux Caravanes, hors périmètre.

## 11. Cartes Team Spirit (papier), bilan et Lumière

- Six cartes par équipe et par activité (Question ×2, Écoute, Orga, Règles, Équipe). Le prof saisit en fin d'activité un **bilan** : une ligne par équipe. **Les six cartes sont gardées par défaut** (M14) : il ne touche que celles qu'il a retirées. Stocké par séance (`gl_game_team_spirit`).
- Usage : **la note et les compétences** (export CSV par classe : élève × séance, équipe du moment, cartes gardées). Aucune carte ne donne de ressource.
- **La Lumière, version simple** (M17, réglage `lumiere` true) : une jauge commune à la classe, **qui ne descend jamais**. Chaque carte Team Spirit gardée ajoute 1 (comptée une seule fois par séance et par équipe) ; l'erreur d'Olu corrigée ajoute 1 ; un défi de la Trame réussi en mode équipe ajoute 10 (M20). **Au palier `lumiere_palier` (100), le voile recule de `recul_lumiere` (5), d'office**, et la jauge repart à 0. Plus de choix à enregistrer, plus de sort « Lumière ».

## 12. Honneurs, titres, sceaux, badges

- **Honneurs** à la clôture de la partie, un par équipe au plus (si une équipe en mérite deux, le second va à la suivante dans l'ordre du critère) : **Avant-garde** (première au camp), **Gardiens du carnet** (le plus de pages tenues, découverte ou tenue), **Compagnons** (le plus d'aide : Bourrasque, Abri, Relais, Cordée, dons, pages tenues pour l'autre peuple), **Esprit d'équipe** (le plus de cartes gardées sur le chapitre). Sceaux de peuple : **Révélatrices** (équipe licorne : pages trouvées + zones révélées), **Mains** (équipe gnome : le plus de pages réparées). Les clés techniques gardent leur ancien nom (`eclaireurs`, `passeurs`, `eclaireuses`).
- **Titres** : un par honneur et par biome (`titres.json`), affiché sous la mascotte au chapitre suivant pour l'équipe qui l'a gagné (le titre suit les élèves dans Mes traversées quand les équipes changent) ; titres de mission (sceau) sur saisie du prof.
- **Badges individuels** (moteur de badges commun, `docs/REWARDS_ENGINE.md` § 5, table `gl_player_rewards`) : des familles et **trois paliers** aux noms de la Trame — **Fil** 🧵, **Nœud** 🪢, **Étoffe** 🧶 — évalués au fil de l'eau, jamais retirés, célébrés avec Olu à l'écran de l'élève (jamais en projection), visibles dans Mes traversées, l'écran d'équipe et la vitrine du prof (triée par nom). Équité : on récompense l'effort, la curiosité, la persévérance et l'aide, **jamais** la justesse, la vitesse, l'arrivée ou un rang ; **aucun badge ne donne de ressource**. « Présence » = membre non absent au tour.

  | Famille           | Badge                | Mesure                                                                                           | Fil · Nœud · Étoffe |
  | ----------------- | -------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
  | Chasse            | Fouilleur            | fouilles faites, quel que soit le verdict (par l'élève ou son équipe en sa présence)             | 5 · 20 · 50         |
  | Chasse            | Trouveur             | pages trouvées, révélées ou réparées par son équipe en sa présence                               | 1 · 4 · 10          |
  | Lecture           | Lecteur              | pages lues entièrement (tour ou veillée)                                                         | 3 · 10 · 25         |
  | Lecture           | Porte-page           | pages tenues pour l'autre peuple (en sa présence ou par lui en veillée)                          | 1 · 4 · 10          |
  | Persévérance      | Pas encore           | réussites après un « pas encore » sur la même zone, question de lecture ou case                  | 1 · 5 · 15          |
  | Coopération       | Mains tendues        | dons faits au Marché                                                                             | 1 · 3 · 8           |
  | Coopération       | Épaule               | sorts d'aide de son équipe (Abri, Relais, Cordée, Bourrasque) avec sa présence ou sa part au pot | 1 · 3 · 8           |
  | Coopération       | Mains de la Trame    | pages réparées par son équipe gnome en sa présence                                               | 1 · 3 · 6           |
  | Savoirs           | Nommeur              | espèces étudiées (fiche consultée entièrement)                                                   | 3 · 10 · 25         |
  | Savoirs           | Cartographe          | pages biome étudiées                                                                             | 1 · 3 · 6           |
  | Défis de la Trame | Tisserand            | niveaux de Retisser réussis (seul ou avec son équipe en sa présence)                             | 3 · 8 · 16          |
  | Défis de la Trame | Voyant des fils      | trames altérées prévues                                                                          | 3 · 6 · 12          |
  | Défis de la Trame | Gardien des fils     | plateaux dont les fils cachés sont retrouvés                                                     | 2 · 3 · 4           |
  | Défis de la Trame | Réparateur           | plateaux réparés (Réparer la trame)                                                              | 2 · 3 · 4           |
  | Veillée           | Veilleur             | meilleure série de semaines de veillée                                                           | 2 · 4 · 8           |
  | Voyage            | Grand voyageur       | chapitres traversés                                                                              | 1 · 2 · 4           |
  | Voyage            | Deux peuples         | a joué Gnome et Licorne (un seul palier)                                                         | 1                   |
  | Badges décernés   | Chuchoteur           | mission secrète réussie (saisie prof existante)                                                  | décerné             |
  | Badges décernés   | Correcteur du renard | erreur d'Olu corrigée (saisie prof existante)                                                    | décerné             |
  | Badges décernés   | Esprit d'équipe      | décerné par le prof **avec un mot** (cartes Team Spirit)                                         | décerné             |

  Renommés par L2, clés inchangées : « Passeur de page » → **Porte-page**, « Passeur de seuil » → **Grand voyageur** (le Passeur est celui qui lit la page de route), « Révélateur » → **Voyant des fils** (pour ne pas doubler le sceau des Révélatrices — nom proposé, à confirmer par Oliv). L'évènement de journal `pas_encore` nourrit la mesure Persévérance.

## 13. Greffes

- **Péripéties** (`peripeties.json`, 8 par biome) : tirées sur les cases événement sans texte ; affichage plein écran 30 s ; « on passe ».
- **Missions secrètes** : papier (enveloppes) ; l'app a une saisie prof « mission réussie » par équipe et par chapitre → sceau + titre.
- **Bestiaire des chimères** : une page de classe (nom, histoire, image facultative, chapitre, saisie prof ou élève avec validation prof), visible dans le carnet de la classe.
- **L'oiseau chapardeur** : une fois par chapitre, à un tour tiré au hasard entre le 2e et le 4e, en phase `souffle` : une unité de la bourse la plus pleine du groupe part au **nid** ; l'élève voit une plume dans son solde ; personne d'autre ne sait qui ; la prochaine page trouvée donne le nid au membre le moins riche de l'équipe découvreuse.
- **Olu commentateur** (`olu-lignes.json`) : lignes par événement et par expression ; une **erreur volontaire** par séance (tirée au sort parmi les lignes du plateau de la partie ; affichée en ouverture) ; bouton prof « corrigé par {équipe} » → +1 Lumière et badge. Lignes « première fois » : _(code : PR 2)_.
- **Farce** : sort du § 10.

## 14. Veillée

- Vue élève (le Seuil et ses onglets) : carnet de la classe (lire, tenir), carnet personnel, étude des espèces (piste) et des biomes (page biome à son nom), journal, Marché, grimoire du voyageur, **Ma Lettre** et **Mon Mentorat**, badges, traversées, défis de la Trame (§ 15).
- **Limites.** Aujourd'hui : `pages_veillee_par_semaine` (2 ouvertures gagnantes par élève), `defis_pages_par_semaine` (2 pages par un défi de la Trame), `pistes_par_semaine` (1, toutes sources). **Visé** (M8) : un seul compteur `pages_par_semaine` (4, toutes sources) et une piste ; l'écran dit « encore N pages cette semaine ». _(code : PR 2)_
- **Fiches** : une mauvaise réponse au QCM d'une fiche ne coûte rien, pas même un délai (réglage `delai_fiche_secondes`, 0). Le réglage prime sur le délai du conditionnement « marquer comme appris ».

## 15. Réglages (groupe `gameplay`, préfixe `tenir_`)

`enabled` true · `surface` tableau|tablette (défaut réglé en prod : tablette) · `des_mode` serveur|physique · `des_count` 2 · `des_physiques_validation` prof|auto · `questions_de_case` true · `questions_difficulte_max_par_plateau` {1:2, 2:3, 3:3, 4:3} · `questions_spirale` 20 (%) · `vent` true · `vent_cases` 3 · `fouilles_par_tour` 2 · `fouilles_sous_voile` 1 · `fouille_seuils` {chaud:0.06, tiede:0.15} · `zones_par_plateau` {1:8, 2:8, 3:10, 4:10} · `pistes_par_semaine` 1 · `pages_veillee_par_semaine` 2 · `voile` true · `voile_bonus_par_plateau` {1:3, 2:4, 3:5, 4:6} · `palissement_pct` 10 · `palissement_max` 50 · `palissement_rang_plancher` 8 (0 = désactivé) · `surplus_reserve` true · `olu_bourse_pleine` true · `recul_carnet_complet` 3 · `recul_lumiere` 5 · `marche` true · `marche_pendant_tour` true · `lecture_pendant_tour` true · `parures` true · `lumiere` true · `lumiere_palier` 100 · `chapardeur` true · `peripeties` true · `olu_erreur_du_jour` true · `progression_applique_case` false · `relances_max_par_tour` 1 (0 = illimité) · `cases_positives` neutre|brut (neutre) · `peripeties_cases_neutres` true · `delai_fiche_secondes` 0 (délai après une mauvaise réponse à une fiche ; au-delà de 0, arrondi à l'heure supérieure) · `defis_case` true · `defi_declenchement` arret|passage (arret) · `defi_recul` 2 · `defis` true · `defis_par_peuple` true · `defis_pages_par_semaine` 2 · `defis_mode_equipe` true · `sablier_secondes` 180 (équipe active au tableau) · `sablier_actif` true · `sablier_phase_secondes` 0 (sablier du tour sur tablette, 0 = sans ; réglé à 8 min en prod) · `sablier_phase_auto` false · `max_power_points` 8 · `lore_feuillet_retrigger` once_per_team · `lore_gemme_costs_enabled` false · `lore_heart_rewards_enabled` false · `feuillet_zone_traversal_enabled` false.

**Retirés par l'ensemble unifié** : `fouilles_reparation_gnome`, `fouille_sous_voile`, l'option `ressource_peuple` de `cases_positives`, `cartes_vers_cases` (PR 1a) ; à venir : le profil `prologue`, `pages_veillee_par_semaine` et `defis_pages_par_semaine` (PR 2), `max_health_points` (PR 4). Une valeur restée en base hors du registre ne fait rien planter : elle est ignorée.

**Sabliers.** Un sablier donne un rythme : à zéro, rien n'est annulé. Au tableau, le sablier de l'équipe active. Sur tablette, un **sablier du tour** (`sablier_phase_secondes`) commun à toutes les équipes pendant la phase jeu : son départ et sa durée viennent du serveur, la console, les tablettes et la projection affichent la même chose. Le prof règle tout d'un clic sur le sablier ; le choix est enregistré pour la partie. Avec `sablier_phase_auto`, la console ouverte passe au souffle à la fin, dé gris tiré par l'app.

**Profils et configuration d'une partie.** Profils sélectionnables d'un clic : `complet` (défauts ci-dessus), `court` (le Marché et la lecture se font en veillée) et `prologue` (pas de voile, pas de Marché, pas de chapardeur) — ce dernier est remplacé par l'**escalier** du chapitre 1 (M8, _code : PR 2_). **Copier la configuration** (M14) : à la création d'une partie, le prof peut reprendre le profil, la surface, les surcharges et les bascules d'une partie existante — jamais ses équipes, ses pions ni ses bourses.

**L'escalier du chapitre 1** (M8, _code : PR 2_). Au plateau 1, ce qui est ouvert dépend du nombre de tours clos : séance 1, avancer, chercher, défi de case, défis de la Trame hors tour ; séance 2, tenir et l'erreur du jour d'Olu ; séance 3, le voile, la page témoin, trois sorts, la jauge de Lumière ; séance 4, le Marché et trois sorts de plus. L'écran masque ce qui n'est pas ouvert ; le prof peut avancer d'un pas d'un clic, jamais reculer.

**Défi de case** (M7). Les **trois cases Défi** de chaque plateau (rangs 11, 20 et 29 ; 30 au plateau 4) confient à l'équipe qui s'y **arrête** un défi du plateau, tiré sans répétition dans la partie, **à préparer pour la séance suivante**. Le tour continue sans attendre. Titre, consigne et préparation s'affichent sur l'écran de l'équipe, au Seuil de ses membres et, tour clos, sur la projection ; le **critère** n'est visible que du prof. Le prof juge d'un geste : « Relevé » → le voile recule de `defi_recul` cases (2) ; « Pas encore » → rien. **Aucune ressource, jamais.** Au camp, un défi resté sans décision s'annule sans effet.

**Défis de la Trame.** Quatre défis sur un même plateau de cartes, **hors du temps de jeu** : pour les équipes qui ont fini l'activité du jour, pour une séance de Trame de toute la classe par chapitre (M18), et pour l'élève seul en veillée. Détail technique : `docs/GL_DEFIS.md`.

- **Par peuple** (`defis_par_peuple`, true ; à `false`, les quatre pour tous). Gnomes : **Retisser** et **Réparer la trame**. Licornes : **La trame altérée** et **Les fils cachés**. Trois défis de plus, ouverts aux deux peuples (M21, _code : PR 2_) : « Le bon rôle », « Les fils de l'adaptation », « Le bon pays ».
- **Qui joue.** Un élève avec son compte, à tout moment (Seuil). En mode équipe (`defis_mode_equipe`, true) : le prof depuis l'onglet « Défis » de sa console, ou la tablette d'une équipe **quand aucun tour n'est ouvert**.
- **Une flèche se pose** par appui sur la carte de départ puis sur la carte d'arrivée. L'app dit : « Lien trouvé », « Regarde le sens », ou « À discuter ». Le compteur dit les liens trouvés, **sans total**.
- **L'erreur ne punit pas.** Une prédiction ou un rangement à côté reçoit « Pas encore. », sans la réponse ; on réessaie autant qu'on veut. **Indices** gratuits, illimités, en échelle ; ils ne réduisent aucune récompense.
- **Récompense, sans aucune ressource.** À la **première réussite** de chaque unité : une **page de veillée** du chapitre au nom de l'élève, dans la limite hebdomadaire ; un point de regard du proche ; l'avancée d'un badge ; **une piste** (M20 : une page endormie du chapitre se révèle à la classe, dans la limite d'une piste par semaine) ; en mode équipe, **+10 à la Lumière**. Jamais une gemme.
- **Lien entre les peuples.** Quand une Licorne réussit une trame altérée dont la carte retirée est une espèce menacée du catalogue, l'espèce paraît dans « À réparer » du carnet de la classe et le prochain Réparer d'un Gnome la propose en premier. Aucun gain.
- **Suivi du prof** : par élève et par type, unités réussies et indices utilisés, **dans l'ordre alphabétique, sans classement** ; export CSV.

## 16. Fichiers de données (`data/gl/tenir/`)

`chasse-zones.json` (36 zones, toutes actives ; fiches et termes de glossaire qui donnent la réponse), `questions-lecture.json` (36), `questions-vives.json` (80), `qcm-feedbacks-zones.json`, `peripeties.json` (32), `missions.json` (20), `titres.json`, `badges.json`, `olu-lignes.json`, `parures.json`, `sorts.json` (25 sorts, dont 19 actifs ; textes de la Lettre et du Mentorat), `reglages-defaut.json`, `passeur-plateau4.json`, `defis-cases.json` (16 défis de case, 4 par plateau), `trame-reseaux.json`, `trame-fils.json`, `trame-reparer.json`. Chaque fichier a un chargeur idempotent et un test de contenu. Le dossier `ensemble-unifie/` garde les données d'attente des PR à venir ; la PR qui consomme son dernier fichier le supprime.

Contrôle de contenu : `node scripts/gl-controle-reponses-sur-site.js` dit, pour chaque question de zone et chaque question de case tirée en partie, si les mots de la bonne réponse se lisent dans les fiches et termes reliés (M22).

## 17. Hors périmètre

Deux Caravanes et Messager, Conseil des peuples, rituels. De l'ensemble unifié : le voile 3 / 4 / 5 / 6, le pâlissement, le carnet complet, le prix des sorts, `zones_par_plateau`, la Lanterne qui fouille, la Consécration et les petites équipes, le pelage de la taïga, la Fresque du Climat ; toute modification de ForetMap hors montage du Mode Découverte sur une partie.

## 18. Attendus de livraison

Cinq PR sur `main`, dans l'ordre : **1a** (le moteur), **1b** (le prof, les mots, le contenu, ces règles), **2** (apprendre en jouant), **3** (plusieurs appareils), **4** (une monnaie). Un commit par étape, tests verts à chaque étape (`npm run lint`, `format:check`, `test:ui`, `test`, `test:content`, `build`, `check:runtime`, e2e G&L, import strict des catalogues, banc sur une base `_sim`), miroirs CJS à jour, migrations idempotentes, `docs/API.md` et `docs/reference/gl/*` à jour, `CHANGELOG.md`, description de PR avec « choix faits sans demander », ce qui est retiré en face de ce qui est ajouté, le rapport du banc et « à relire par Oliv ».
