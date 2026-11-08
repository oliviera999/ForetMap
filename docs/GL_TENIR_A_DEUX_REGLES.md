# Gnomes & Licornes · « Tenir à deux » · Règles de référence v2

6 novembre 2026 · fait foi pour la construction. Toute règle ci-dessous est soit un comportement fixe, soit un **réglage** (§ 15) avec sa valeur par défaut. Les garde-fous du § 1 priment sur tout le reste.

## 0. Décisions prises par Oliv (30 octobre → 6 novembre)

- Mouture C « Tenir » (voile) avec l'asymétrie et la coopération de B (tenir à deux).
- **Deux monnaies** : cœurs aux Gnomes, gemmes aux Licornes, par élève, conservées d'un chapitre à l'autre, plafond 8, échangeables au Marché. Les cœurs ne portent plus la conduite ; la conduite passe par les cartes Team Spirit (note) et un bouton Retrait.
- Pages : zones invisibles à fouiller au clic, question sur le dessin ; **8 zones aux chapitres 1 et 2, 10 aux chapitres 3 et 4** (E6, 7 novembre : `cz-p2-08` reste inactive en attendant le choix d'Oliv) ; pistes de veillée.
- **Tenir par question de lecture** (validation automatique).
- Marché à quatre cas (demande, offre, proposition, don), parures.
- Pas de limite « un sort par tour » : chaque sort a sa **fenêtre** et sa **limite** propres.
- Dés physiques saisis dans l'app, ou avance libre par le prof.
- Surfaces : tout tableau, hybride, tout tablette, au choix du prof.
- Rôles changent à chaque cours ; équipes rebrassées à chaque chapitre, peuples inversés 1↔2 et 3↔4.
- Dé du Souffle lancé par le prof ; vent activable par partie ; Lumière = option.
- Greffes : péripéties, missions secrètes, Bestiaire des chimères, Kraa chapardeur et témoin, Olu commentateur, titres, farce.
- Livraison en **un bloc**.

## 1. Garde-fous (non négociables)

1. Le Souffle n'est jamais personnifié : un **voile**, une bande grise, des pages qui pâlissent ; vocabulaire _tenir / résister_ ; jamais monstre, ennemi, attaque, poursuite. Pas de visage, pas de voix, pas d'icône de créature.
2. Le corbeau (mascotte Kraa) n'est **jamais nommé** côté élève, ni par Olu, ni dans un indice, ni dans un titre. Dans le code, l'identifiant `kraa` est toléré ; dans toute chaîne visible, c'est « l'oiseau » ou rien.
3. Aucun contenu du tiers `secret` du lore (glossaire, feuillets, visages) dans une question, un indice, un texte de zone, une ligne d'Olu.
4. **L'erreur ne punit jamais** : une mauvaise réponse ne retire ni case, ni ressource, ni fouille ; elle révèle. Côté élève, jamais « faux », « raté », « perdu » : « pas encore », « la page dort encore ici ».
5. Aucune ressource pour une bonne réponse de case, une fiche lue, un défi réussi, une arrivée, un journal. Les ressources viennent des pages tenues, de la Trame, du carnet complet, du Marché.
6. Soldes privés : un élève voit ses deux bourses, celles de son équipe, jamais celles des autres équipes ; le prof voit tout. Aucun classement d'élèves nulle part.
7. Aucune donnée d'élève dans les logs ni dans les tests ; fixtures anonymes.
8. Isolation G&L / ForetMap respectée (routes `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`).
9. Tout ce qui touche au réel (sorts du Travail et du Seuil, Retrait, exports) passe par le prof.

## 2. Entités et vocabulaire

- **Partie** = une classe (groupe) × un chapitre (plateau 1 à 4). **Tour** = une séance. **Seuil** = fin de chapitre.
- **Équipe** : 4 par partie, 2 de peuple `gnome`, 2 de peuple `unicorn`, 5 élèves (4 si besoin). Rebrassage automatique à chaque chapitre ; contrainte dure : chaque élève change de peuple entre les chapitres 1 et 2, puis 3 et 4 ; les joueurs sans historique sont répartis pour équilibrer. Mascotte par équipe, choisie au seuil dans le catalogue typé (deux gnomes, deux licornes ; versions masculines et féminines).
- **Rôles** (cartes Job, papier) : Opérateur, Gestionnaire, Secrétaire, Assistant, Éclaireur ; ils changent à chaque cours ; l'app ne les stocke pas (une saisie facultative du rôle de l'Opérateur du tour sert aux badges).
- **Page** = un feuillet du corpus mis en jeu dans une **zone** de chasse. États : `endormie`, `revelee`, `trouvee`, `tenue`, `palie`, `reparee` (puis `tenue`).
- **Bourses** : `power_points` (gemmes) et `health_points` (cœurs), existantes par élève. **Ressource du peuple** : gemmes pour une Licorne, cœurs pour un Gnome (selon le peuple de l'équipe courante).
- **Voile** : une position (rang de case) par partie, −1 avant le premier dé gris.
- **Surface** d'une partie : `tableau` | `hybride` | `tablette`.

## 3. Le tour

Un tour est un objet serveur à **phases** : `ouverture` → `jeu` → `souffle` → `clos`. Le prof ouvre et ferme les phases. L'ordre des équipes est figé à l'ouverture : **ordre inverse du plateau** (la plus en retard d'abord ; égalité → identifiant croissant). Les cinq gestes d'une équipe : **Jeter**, **Lancer**, **Répondre**, **Fouiller**, **Lire** (et, à tout moment pendant `jeu`, les actions de Marché si la surface les permet).

**Permissions par surface** (le prof peut toujours tout faire) :

| Geste                                                       | tableau                     | hybride                                        | tablette                                                               |
| ----------------------------------------------------------- | --------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Jeter                                                       | prof (pour l'équipe active) | membre de l'équipe, pendant `jeu`              | membre, pendant `jeu`                                                  |
| Lancer                                                      | prof                        | prof                                           | membre, pendant `jeu` (dés serveur ou saisie physique soumise au prof) |
| Répondre (case)                                             | prof                        | prof                                           | membre                                                                 |
| Fouiller                                                    | prof                        | membre, pendant la fenêtre ouverte par le prof | membre                                                                 |
| Lire / Tenir                                                | prof                        | membre                                         | membre                                                                 |
| Souffle (dé gris)                                           | prof                        | prof                                           | prof                                                                   |
| Retrait, avance libre, absences, validation des sorts réels | prof                        | prof                                           | prof                                                                   |

- En `tableau`, une seule équipe est **active** à la fois (bouton « équipe suivante ») et un **sablier** client (réglage, 180 s) tourne ; rien n'est annulé quand il sonne.
- En `hybride` et `tablette`, les équipes agissent **en parallèle** pendant `jeu` ; le moteur accepte des actions simultanées d'équipes différentes (une action par équipe à la fois, verrouillage par équipe).
- **Absences** : le prof coche les absents du tour ; un absent ne verse pas au pot, mais reçoit les gains d'équipe (page tenue, Trame, carnet complet).
- **Phase `souffle`** : le prof lance le dé gris (§ 7) ; le mot du Passeur (une page de route) s'affiche ; les missions secrètes réussies se déclarent (papier) ; Olu commente.
- Toute action écrit un événement (`gl_game_events`) et pousse l'état à tous les écrans (temps réel si disponible, sinon rechargement au clic : la prod est en long-polling).

**Lancer, trois modes** (réglage `des_mode` : `serveur` | `physique` | défaut `serveur` sur tablette, `physique` ailleurs) :

- `serveur` : 2 dés tirés par le serveur.
- `physique` : l'Opérateur lance de vrais dés ; les faces (chacune 1 à 6, nombre de dés = réglage) sont saisies ; journalisées ; sur tablette, la saisie attend un clic du prof (réglage `des_physiques_validation` : `prof` | `auto`).
- **Avance libre** (prof seulement, tout mode) : un nombre de cases de 1 à 12 pour une équipe, journalisé avec motif libre ; applique les effets de case comme un jet.

## 4. Avancer

- Deux dés (réglage `des_count`, défaut 2). Le pion avance du total ; les effets de la case d'arrivée s'appliquent (Trame, Souffle, péripétie, question).
- **Question de case** (réglage `questions_de_case`, défaut `true`) : l'équipe répond ; **juste → +1 case puis relance** (le dé est réarmé pour le tour), **une seule relance par équipe et par tour** (réglage `relances_max_par_tour`, 1 ; 0 = illimité — simulation du 7/11 : les relances en chaîne pliaient le chapitre en 3-4 séances) ; au-delà, une bonne réponse donne +1 case (case appliquée) sans relance ; faux → rien. Aucune ressource, aucun score. Pool des cases : tout le biome du chapitre, niveau 6e (les filtres cassés sont remplacés).
- **Cases Trame** : +1 de _sa ressource_ à chaque membre de l'équipe (gemme si Licorne, cœur si Gnome), plafonnée. **Cases Souffle** : effet du plateau tel quel (recul, tour passé, −1 ressource au peuple visé) sauf Sentier. **Vérité des cases** (7 novembre) : le texte d'effet montré à l'élève à l'arrivée (écran d'équipe, popover d'arrivée, journal, projection) est **calculé depuis l'effet réellement appliqué** (effets résolus par peuple, conversions des cases positives, pertes neutres neutralisées, Trame = +1, tour passé, Sentier, péripétie tirée) et jamais lu dans `effet_mecanique`, champ d'auteur réservé au studio de plateau ; le contrôle `gl_marker_promises` (audit, rapport de santé, `tests/content/gl-marker-promises`) refuse toute promesse affichée que le moteur ne tient pas et tout « sinon / si échec » suivi d'une perte. **Cases positives à ressource** du plateau (« +2 cœurs », « +1 gemme », 19 cases sur les 4 plateaux) : +1 de _sa ressource_ comme la Trame (réglage `cases_positives` : `ressource_peuple` | `neutre` | `brut`) ; une case neutre qui retirait une ressource (« Déshydratation ») ne retire rien.
- **Péripéties** : une case événement sans texte, et (réglage `peripeties_cases_neutres`, 7/11) une case `behavior` sans effet de tonalité négative ou neutre (Averse tropicale, Troupe de chimpanzés, Lion à l'affût, Chant des cigales, Brame du cerf, Brouillard atlantique, Lemming…), tire une consigne du fichier `peripeties.json` (par biome) ; la description de la case reste affichée au-dessus ; « Défi d'équipe » n'en reçoit pas ; bouton « on passe ».
- **Vent de la caravane** (réglage `vent`, défaut `true`, `vent_cases` 3) : dès le tour 2, si une seule équipe est dernière, elle avance de `vent_cases` à l'ouverture du tour ; elle joue en premier de toute façon.
- **Arrivée** : la première équipe au camp gagne l'honneur Éclaireurs ; ensuite, à chaque tour, son jet (serveur ou saisi) est appliqué à l'équipe la plus en retard (événement `dice_roll` avec bénéficiaire). Elle continue de fouiller, lire, jeter.
- **Seuil** : la partie se clôt quand les quatre équipes sont au camp, ou quand le prof clôt la partie à la date fixée (avance libre « la caravane porte les retardataires »). À la clôture : honneurs, titres, sceaux, badges, carnet complet s'il manque des pages non.
- **Cases « +3 gemmes à l'arrivée »** : neutralisées par migration (deltaGems = 0, description réécrite).

## 5. La chasse (fouiller)

- Chaque plateau cache **N zones** (réglage `zones_par_plateau` `{1:8, 2:8, 3:10, 4:10}` : **8 / 8 / 10 / 10** ; le catalogue en contient 8/8/10/10 avec un ordre ; les N premières actives — E6 : au plateau 2, 7 zones sont jouables tant que `cz-p2-08` attend son feuillet). Une zone = un polygone (coordonnées normalisées 0-1 sur l'image du plateau), un feuillet, un indice d'une ligne, une question fixe (`question_code`) sur le détail dessiné, un thème de secours (`categorie_slug`), un rang de case (case du chemin la plus proche, pour le voile).
- **Le carnet de la classe** liste les N pages : indice, état, découvreuse, tenue par, pâlissement. Les polygones ne sont jamais envoyés aux élèves.
- **Fouilles par tour** : réglage `fouilles_par_tour` `{ gnome: 1, unicorn: 2 }` ; +1 par Grand Regard ; 0 sous le voile sauf Abri.
- **Fouille de réparation** (E2, 7 novembre) : une équipe **gnome** a `fouilles_reparation_gnome` (1) fouille de plus par tour, **utilisable seulement sur une page pâlie**, s'il en existe au moment du tour. Elle compte dans le quota affiché (« 1 + 1 réparation ») ; une fouille ailleurs avec la seule fouille de réparation restante est refusée (« elle ne sert que sur une page pâlie »). Sous le voile, la règle de base s'applique (0 sauf Abri). 0 = désactivé.
- **Fouiller = cliquer** (x, y normalisés) :
  - dans une zone `endormie` ou `revelee` : une question. Zone jamais tentée dans la partie → sa question fixe ; déjà tentée → une question du thème de secours, en excluant les codes déjà présentés pour cette zone. **Juste** → `trouvee` (découvreuse = l'équipe), état feuillet `discovered` pour l'équipe, carnet personnel des membres présents, événement `page_trouvee`. **Faux** → `revelee` (contour pointillé visible de tous), rien d'autre.
  - dans une zone `palie` : réservée aux équipes **gnomes** ; même question ; juste → `reparee` (= trouvée, découvreuse = l'équipe, +1 cœur à chaque Gnome de l'équipe, événement `page_reparee`).
  - dans une zone `trouvee` / `tenue` : rien (« déjà trouvée »).
  - à côté : verdict `froid` / `tiede` / `chaud` selon la distance au centroïde de la zone endormie ou pâlie la plus proche (réglage `fouille_seuils` `{ chaud: 0.06, tiede: 0.15 }`), une **empreinte** (x, y, verdict, équipe, tour) visible de toute la classe sur le plateau.
- **Kraa, témoin** : à chaque fouille, la mascotte de l'oiseau vole jusqu'au point cliqué et joue un état selon le résultat (`froid` regarde ailleurs, `tiede` penche la tête, `chaud` sautille, `zone` gratte le sol, `page_trouvee` ouvre les ailes, `page_tenue` s'incline, `deja_trouvee` bâille) ; sa position est conservée dans l'état de partie d'un tour à l'autre. Muet, sans nom, sans bulle. Olu se fige (état ARRÊT) tant que l'animation de l'oiseau dure.
- **Pistes de veillée** : quand un élève étudie (consulte entièrement) la fiche d'une espèce liée à une page endormie du chapitre (espèces `especes` de la zone dans `chasse-zones.json`, 1 à 3 par zone ; repli sur le lien espèce du feuillet), la zone passe `revelee` (contour visible) et l'élève est inscrit au carnet personnel (« piste de … »). Jamais plus d'une piste par élève et par semaine (réglage `pistes_par_semaine`, 1).
- **Lanterne** (sort licorne) révèle la zone endormie la plus proche du pion.
- **Carnet complet** (toutes les pages actives `tenue`) : +1 de sa ressource à tout le groupe, voile −`recul_carnet_complet` (3), événement `carnet_complet`, une seule fois.

## 6. Tenir (lire)

- Une page `trouvee` ou `reparee` est **tenue** quand une équipe **de l'autre peuple** que la découvreuse l'ouvre **et répond juste à sa question de lecture** (`questions-lecture.json` : une question par page, 4 choix, sur le contenu de la page ; retentatives illimitées, aucune perte ; la question se repose jusqu'à réussite, par n'importe quel membre du bon peuple, au tour ou en veillée).
- À l'instant où elle est tenue : **+1 de sa ressource à chaque membre des deux équipes** (découvreuse et tenante), plafond appliqué, événement `page_tenue`.
- Une page ouverte par une équipe du **même** peuple que la découvreuse passe `read` pour elle (lecture), sans gain. Une page tenue reste lisible par tous.
- **Veillée** : un élève connecté peut ouvrir et tenir une page pour son équipe (limite `pages_veillee_par_semaine`, 2, par élève, sur les ouvertures qui donnent un gain).
- Lecture gratuite partout : coûts de feuillets et gains de cœurs des feuillets désactivés (réglages existants à 0 / false).

## 7. Le voile

- Position par partie, −1 au départ. En phase `souffle`, le prof lance le **dé gris** : 1d6 (serveur ou saisi) + bonus du plateau (réglage `voile_bonus_par_plateau` `{1:3, 2:4, 3:5, 4:6}` — E1, 7 novembre, choix d'Oliv : seul le plateau 1 ralentit, la tension monte ensuite chapitre après chapitre ; ancien défaut `{1:4, 2:4, 3:5, 4:6}`). Le prof peut **ne pas lancer** une semaine (bouton « le voile dort »).
- Avance : `position = min(position + total, rang du camp − 1)`.
- **Équipe sous le voile** (rang de son pion ≤ position) : fouilles à 0 (sauf Abri) ; ses pages `trouvee` non `read` par elle pâlissent de `palissement_pct` (10) par tour, plafond `palissement_max` (50), sauf Abri ; elle avance, répond, jette, lit, participe au Marché normalement. **Aucune ressource n'est retirée.**
- **Zones** `endormie` / `revelee` dont le rang ≤ position → `palie` (réparables par les Gnomes). **Plancher de pâlissement** (E3, 7 novembre) : pour ce passage, une zone de rang < `palissement_rang_plancher` (8) est traitée comme de rang 8 — les zones proches du départ (`cz-p1-04`, `cz-p1-05`, `cz-p1-01`, `cz-p2-03`, `cz-p2-04`, `cz-p3-01`, `cz-p4-01`, `cz-p4-04`) ne pâlissent plus dès le premier dé gris ; aucune géométrie ni `rang_case` n'est modifié, le rendu du voile et le rang affiché ne changent pas. 0 = désactivé.
- **Reculs** : carnet complet (3), Lumière (5, si activée). Jamais au-delà du camp. Rien à remettre au seuil : l'état est par partie.
- Rendu : les cases de rang ≤ position en gris semi-transparent, une polyligne grise large le long du chemin, mascotte des équipes sous le voile en état triste sans texte, légende « le voile ».

## 8. Les deux monnaies

- Chaque élève a **gemmes** et **cœurs**, 3/3 au départ (défauts existants), plafond 8/8 (réglages `max_power_points`, `max_health_points`), conservées entre chapitres, visibles de lui, de son équipe et du prof.
- **Ressource du peuple** : ce qu'on gagne (page tenue, Trame, carnet complet) et ce avec quoi on paie les sorts de son peuple. Les sorts communs se paient dans l'une ou l'autre ressource au choix de l'équipe ; les sorts du pacte en 2 cœurs (équipe gnome) + 2 gemmes (équipe licorne).
- **Pot** d'un sort : réparti à parts égales entre les membres **présents et non en retrait** de l'équipe (reste au plus riche dans la ressource), modifiable avant le lancement ; un membre à 0 ne verse pas.
- **Rien ne retire une ressource** sinon un sort, un échange, un don, une case Souffle du plateau ou le chapardeur.
- **Réserve de la caravane** (E4, 7 novembre, réglage `surplus_reserve` true) : un gain qui dépasserait le plafond d'un élève n'est plus perdu, il va à la **réserve de la caravane** de son équipe, dans la ressource du peuple, partie par partie. La réserve paie **en premier** le pot des sorts de l'équipe (pour un pacte, chaque équipe dans sa ressource), puis les membres selon la règle du pot ; elle est visible de l'équipe et du prof (jamais en projection) et s'éteint au Seuil, sans transfert. Grand livre : causes `reserve_entree` / `reserve_sortie` / `reserve_seuil` ; la somme du livre vaut les bourses **plus** les réserves. Les dons et échanges du Marché ne l'alimentent pas (le surplus d'un don reste au donneur).
- **Rappel d'Olu** (E5, réglage `olu_bourse_pleine` true) : quand au moins 3 membres d'une équipe sont au plafond de leur ressource du peuple, Olu le dit **une fois par séance** à l'écran d'équipe (« Vos bourses débordent : un sort pour la caravane ? », moment `bourse_pleine`), jamais en projection.
- **Retrait** (conduite, hors économie) : bouton par élève sur l'écran du prof ; un élève en retrait joue, fouille, lit et tient une page (il reçoit les gains d'équipe comme un absent), mais ne verse pas au pot et ne voit pas le Marché, jusqu'à la levée ; événement `retrait` (entrée/sortie), motif libre visible du prof seul. Aucun compteur, aucun cœur touché.
- **Geste exceptionnel du prof** sur une bourse : route existante, motif obligatoire, journalisé, plafonné.

## 9. Le Marché

- **La place** : annonces par élève, type `cherche` | `offre` | `propose`, avec ce qui est cherché/offert (gemmes n, cœurs n, une page par code) et, pour `propose`, les deux côtés. Visibles de toute la classe (nom d'équipe + prénom tel que l'app l'affiche déjà). Répondre à une annonce ouvre l'**échange à deux** existant (`gl_market_trades`), pré-rempli, négociable jusqu'à double acceptation ; l'annonce se ferme à la conclusion ou expire à la clôture de la partie.
- **Don** : bouton, sans accord du receveur, une ressource ou une copie de page à la fois, immédiat, journalisé (`don`), plafond du receveur respecté (le surplus reste au donneur).
- Cœurs et gemmes s'échangent librement (pas de taux imposé) ; les pages se copient (le découvreur garde son nom) ; un élève sans ressource peut afficher `cherche` et recevoir ; un élève en retrait ne voit pas la place.
- **Parures** : un comptoir (catalogue `parures.json` : nom, prix 2 à 4, ressource au choix, asset de calque ou pastille ; sans image, une parure se porte en **pastille texte** et reste achetable) ; achetée par un membre, portée par la mascotte de **son équipe** jusqu'au seuil ; aucun effet de jeu. Au seuil, la parure revient au comptoir. Les pelages `bestiaire` et `neon` des licornes (et leurs homologues gnomes quand ils existeront) sont des parures du chapitre 4.
- Le Marché est disponible en veillée et, pendant `jeu`, sur tablette et hybride (réglage `marche_pendant_tour`, défaut `true`).

## 10. Le grimoire v2

Chaque sort a : `code`, `nom`, `peuple` (`any` | `gnome` | `unicorn` | `pacte` | `classe`), `cout` et `ressource` (`gemmes` | `coeurs` | `peuple` = celle du lanceur | `choix` | `pacte`), `fenetre` (quand il est lançable), `limite` (par tour, par séance, par chapitre, par élève), `cible`, `execution` (`auto` | `prof`), `effet_auto_json`. Le catalogue complet est dans `sorts.json` ; résumé :

| Famille  | Sort         | Coût               | Fenêtre                                              | Limite                            | Effet                                                                                                                                          | Exécution     |
| -------- | ------------ | ------------------ | ---------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Commun   | Progression  | 1 choix            | juste après le jet de l'équipe (dernier jet du tour) | 1/tour/équipe                     | ±1 case **sans appliquer la case d'arrivée** (réglage `progression_applique_case`, 7/11)                                                       | auto          |
| Commun   | Relance      | 2 choix            | juste après le jet de l'équipe (dernier jet du tour) | 1/tour/équipe                     | rejoue les dés (serveur) ou autorise une nouvelle saisie                                                                                       | auto          |
| Commun   | Farce        | 1 choix            | phase `jeu`                                          | 1/séance/équipe                   | la mascotte d'une autre équipe danse 10 s                                                                                                      | auto          |
| Commun   | Héritage     | 3 choix            | seuil                                                | 1/chapitre/élève                  | lègue 2 unités (ressource au choix) à un élève pour le chapitre suivant                                                                        | auto au seuil |
| Licornes | Lanterne     | 2 gemmes           | phase `jeu`, avant une fouille                       | 1/tour/équipe                     | la zone endormie la plus proche du pion devient `revelee`                                                                                      | auto          |
| Licornes | Boussole     | 2 gemmes           | avant le jet                                         | 1/tour/équipe                     | affiche les 6 cases suivantes avec leur type                                                                                                   | auto          |
| Licornes | Bourrasque   | 2 gemmes           | phase `jeu`                                          | 1/tour/équipe, cible autre équipe | +3 cases à la cible, sans effets de case ni tour consommé                                                                                      | auto          |
| Licornes | Grand Regard | 3 gemmes           | phase `jeu`                                          | 1/tour/partie                     | +1 fouille à chaque équipe ce tour                                                                                                             | auto          |
| Gnomes   | Nommer       | 2 cœurs            | phase `jeu`                                          | 1/tour/équipe                     | une page `palie` au choix devient `reparee` si l'équipe nomme 3 vivants du biome (clic de validation du prof) ; +1 cœur aux Gnomes de l'équipe | prof          |
| Gnomes   | Sentier      | 2 cœurs            | avant le jet                                         | 1/tour/équipe                     | la prochaine case Souffle n'a pas d'effet sur l'équipe                                                                                         | auto          |
| Gnomes   | Abri         | 2 cœurs            | phase `jeu`                                          | 1/tour/équipe, cible autre équipe | la cible garde ses fouilles et ne pâlit pas ce tour, même sous le voile                                                                        | auto          |
| Gnomes   | Relais       | 3 cœurs            | phase `jeu`                                          | 1/tour/partie                     | l'équipe la plus en retard rejoint la case du lanceur                                                                                          | auto          |
| Pacte    | Cordée       | 2 cœurs + 2 gemmes | avant les jets des deux équipes                      | 1/tour/partie                     | les deux équipes avancent du meilleur de leurs deux jets ; le voile ne les touche pas ce tour                                                  | auto          |
| Travail  | Question     | 2 peuple           | pendant l'activité (file du prof)                    | 1/séance/équipe                   | poser une question au prof hors cartes                                                                                                         | prof          |
| Travail  | Conseil      | 2 peuple           | activité                                             | 1/séance/équipe                   | 30 s avec une autre équipe                                                                                                                     | prof          |
| Travail  | Tablette     | 2 peuple           | activité                                             | 1/séance/équipe                   | une tablette de plus                                                                                                                           | prof          |
| Travail  | Musique      | 3 peuple           | activité                                             | 1/séance/partie                   | le cours en musique                                                                                                                            | prof          |
| Travail  | Pause        | 3 peuple           | activité                                             | 1/séance/équipe                   | cinq minutes de pause d'équipe                                                                                                                 | prof          |
| Travail  | Rôle         | 2 peuple           | activité                                             | 1/séance/équipe                   | choisir son rôle à la séance suivante                                                                                                          | prof          |
| Seuil    | Esquive      | 3 peuple           | seuil / veillée                                      | 1/trimestre/élève                 | reporter un rendu                                                                                                                              | prof          |
| Seuil    | Mentorat     | 4 peuple           | seuil / veillée                                      | 1/chapitre/élève                  | enseigner deux minutes à la classe ; vert + à l'oral                                                                                           | prof          |
| Seuil    | Lettre       | 3 peuple           | seuil / veillée                                      | 1/chapitre/élève                  | une page vierge écrite par l'élève entre au carnet de la classe après relecture                                                                | prof          |
| Seuil    | Choix        | 4 peuple           | seuil                                                | 1/chapitre/partie                 | choisir son équipe au prochain chapitre (épingle de composition)                                                                               | prof          |
| Seuil    | Consécration | 8 offertes         | 3e trimestre                                         | 1/élève                           | vert + au bulletin                                                                                                                             | prof          |
| Classe   | Lumière      | palier de cartes   | fin de séance                                        | —                                 | voile −5 ou sort de classe (réglage `lumiere`, défaut `false`)                                                                                 | prof          |

- **Ouverture par chapitre** (`gl_chapter_spells`) : ch. 1 Progression, Relance, Farce, Lanterne, Bourrasque, Nommer, Abri, Question, Tablette ; ch. 2 + Boussole, Grand Regard, Sentier, Relais, Conseil, Musique, Pause, Rôle ; ch. 3 + Cordée, Héritage, Esquive, Mentorat, Lettre ; ch. 4 + Choix ; retour + Consécration. Les anciens sorts du tableur restent en base en `propose`, non lançables.
- **Pas de quota global** par tour : seules les limites par sort s'appliquent ; un sort hors fenêtre est refusé avec le message de la fenêtre.
- **Grimoire du voyageur** (individuel, gratuit, un usage par chapitre, débloqué par le niveau du Seuil) : Seconde chance (1), Loupe (2, indice complet d'une page), Mémoire (3, relire une page pâlie), Flair (4, une fouille personnelle en veillée : verdict seulement, empreinte partagée), Plume (5, une page vierge, relue par le prof), Messager (6, réservé aux Deux Caravanes, hors périmètre).

## 11. Cartes Team Spirit (papier) et bilan

- Six cartes par équipe et par activité (Question ×2, Écoute, Orga, Règles, Équipe) ; le prof saisit en fin d'activité un **bilan** : une ligne par équipe, cartes gardées 0 à 6 (et facultativement les cartes nommées). Stocké par séance (`gl_game_team_spirit`).
- Usage : **la note et les compétences** (export CSV par classe : élève × séance, équipe du moment, cartes gardées ; et un export badges) ; **la Lumière** (réglage `lumiere`, défaut `false`) : somme des cartes gardées, palier `lumiere_palier` (25) ; au palier, le prof enregistre le choix de la classe (voile −5 ou sort de classe libre) ; **cases** (réglage `cartes_vers_cases`, défaut `false`) : cartes gardées 6 → +2 cases, 4-5 → +1 à l'ouverture du tour suivant. Aucune carte ne donne de ressource.

## 12. Honneurs, titres, sceaux, badges

- **Honneurs** à la clôture de la partie, un par équipe au plus (si une équipe en mérite deux, le second va à la suivante dans l'ordre du critère) : **Éclaireurs** (première au camp), **Gardiens** (le plus de pages tenues, découverte ou tenue), **Passeurs** (le plus d'aide : Bourrasque, Abri, Relais, Cordée, dons, pages tenues pour l'autre peuple), **Esprit d'équipe** (le plus de cartes gardées sur le chapitre). Sceaux de peuple : **Éclaireuses** (équipe licorne, le plus de pages trouvées), **Mains** (équipe gnome, le plus de pages réparées).
- **Titres** : un par honneur et par biome (`titres.json`), affiché sous la mascotte au chapitre suivant pour l'équipe qui l'a gagné (le titre suit les élèves dans Mes traversées quand les équipes changent) ; titres de mission (sceau) sur saisie du prof.
- **Badges individuels** (8 novembre 2026 : sur le **moteur de badges commun**, `docs/REWARDS_ENGINE.md` § 5, table `gl_player_rewards`) : des familles et **trois paliers** aux noms de la Trame — **Fil** 🧵, **Nœud** 🪢, **Étoffe** 🧶 — évalués au fil de l'eau (dès le premier chapitre), jamais retirés, célébrés avec Olu à l'écran de l'élève (jamais en projection), visibles dans Mes traversées, l'écran d'équipe et la vitrine du prof (triée par nom, « à un pas du palier suivant »). Équité : on récompense l'effort, la curiosité, la persévérance et l'aide, **jamais** la justesse, la vitesse, l'arrivée ou un rang ; **aucun badge ne donne de ressource**. « Présence » = membre non absent au tour.

  | Famille         | Badge                | Mesure                                                                                           | Fil · Nœud · Étoffe |
  | --------------- | -------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
  | Chasse          | Fouilleur            | fouilles faites, quel que soit le verdict (par l'élève ou son équipe en sa présence)             | 5 · 20 · 50         |
  | Chasse          | Trouveur             | pages trouvées ou réparées par son équipe en sa présence                                         | 1 · 4 · 10          |
  | Lecture         | Lecteur              | pages lues entièrement (tour ou veillée)                                                         | 3 · 10 · 25         |
  | Lecture         | Passeur de page      | pages tenues pour l'autre peuple (en sa présence ou par lui en veillée)                          | 1 · 4 · 10          |
  | Persévérance    | Pas encore           | réussites après un « pas encore » sur la même zone, question de lecture ou case                  | 1 · 5 · 15          |
  | Coopération     | Mains tendues        | dons faits au Marché                                                                             | 1 · 3 · 8           |
  | Coopération     | Épaule               | sorts d'aide de son équipe (Abri, Relais, Cordée, Bourrasque) avec sa présence ou sa part au pot | 1 · 3 · 8           |
  | Coopération     | Mains de la Trame    | pages réparées par son équipe gnome en sa présence                                               | 1 · 3 · 6           |
  | Savoirs         | Nommeur              | espèces étudiées (fiche consultée entièrement)                                                   | 3 · 10 · 25         |
  | Savoirs         | Cartographe          | pages biome étudiées                                                                             | 1 · 3 · 6           |
  | Veillée         | Veilleur             | meilleure série de semaines de veillée                                                           | 2 · 4 · 8           |
  | Voyage          | Passeur de seuil     | chapitres traversés                                                                              | 1 · 2 · 4           |
  | Voyage          | Deux peuples         | a joué Gnome et Licorne (un seul palier)                                                         | 1                   |
  | Badges décernés | Chuchoteur           | mission secrète réussie (saisie prof existante)                                                  | décerné             |
  | Badges décernés | Correcteur du renard | erreur d'Olu corrigée (saisie prof existante)                                                    | décerné             |
  | Badges décernés | Esprit d'équipe      | décerné par le prof **avec un mot** (cartes Team Spirit)                                         | décerné             |

  `Tisserand` et `Révélateur` (défis de la Trame) restent réservés, invisibles ; « Trouveur (Opérateur) » disparaît (il dépendait de la saisie facultative du rôle). Les 13 anciens badges plats (`badges.json`, `gl_player_badges`) sont convertis en paliers par `scripts/gl-rewards-backfill.js` puis conservés en lecture seule. L'évènement de journal `pas_encore` (réponse fausse de chasse, de lecture ou de case) nourrit la mesure Persévérance.

## 13. Greffes

- **Péripéties** (`peripeties.json`, 8 par biome) : tirées sur les cases événement sans texte ; affichage plein écran 30 s ; « on passe ».
- **Missions secrètes** : papier (enveloppes) ; l'app a une saisie prof « mission réussie » par équipe et par chapitre → sceau + titre.
- **Bestiaire des chimères** : une page de classe (`gl_game_chimeres` : nom, histoire, image facultative, chapitre, saisie prof ou élève avec validation prof), visible dans le carnet de la classe.
- **Kraa chapardeur** : une fois par chapitre, à un tour tiré au hasard entre le 2e et le 4e, en phase `souffle` : une unité (ressource la plus abondante) de la bourse la plus pleine du groupe part au **nid** ; l'élève voit une plume dans son solde ; personne d'autre ne sait qui ; la prochaine page trouvée donne le nid au membre le moins riche de l'équipe découvreuse.
- **Olu commentateur** (`olu-lignes.json`) : lignes par événement et par expression ; une **erreur volontaire** par séance (tirée au sort parmi les lignes du plateau de la partie, `plateaux`, repli sur « tous » ; affichée en ouverture) ; bouton prof « corrigé par {équipe} » → +1 Lumière si activée, sinon simple événement et badge.
- **Farce** : sort du § 10.

## 14. Veillée

- Vue élève : carnet de la classe (lire, tenir), carnet personnel, étude des espèces (piste) et des biomes (page biome à son nom, 2 par plateau, 4 au plateau 4 : la consultation complète de la fiche biome inscrit la page `biome` du corpus au carnet personnel et au carnet de la classe comme « étudiée par … »), journal, Marché, grimoire du voyageur, badges, traversées, défis (Fresque du Climat dans ForetMap : saisie prof « défi réussi » → une page « encore effacée » au choix de l'élève, limite 2 pages/semaine ; défis de la Trame hors périmètre).
- Limites : `pages_veillee_par_semaine` (2), `pistes_par_semaine` (1).

## 15. Réglages (groupe `gameplay`, préfixe `tenir_`)

`enabled` true · `surface` tableau|hybride|tablette (tableau) · `des_mode` serveur|physique · `des_count` 2 · `des_physiques_validation` prof|auto · `questions_de_case` true · `vent` true · `vent_cases` 3 · `fouilles_par_tour` {gnome:1, unicorn:2} · `fouille_seuils` {chaud:0.06, tiede:0.15} · `zones_par_plateau` {1:8, 2:8, 3:10, 4:10} · `pistes_par_semaine` 1 · `pages_veillee_par_semaine` 2 · `voile` true · `voile_bonus_par_plateau` {1:3,2:4,3:5,4:6} (E1) · `palissement_pct` 10 · `palissement_max` 50 · `palissement_rang_plancher` 8 (E3, 0 = désactivé) · `fouilles_reparation_gnome` 1 (E2, 0 = désactivé) · `surplus_reserve` true (E4) · `olu_bourse_pleine` true (E5) · `recul_carnet_complet` 3 · `marche` true · `marche_pendant_tour` true · `parures` true · `lumiere` false · `lumiere_palier` 25 · `cartes_vers_cases` false · `chapardeur` true · `peripeties` true · `olu_erreur_du_jour` true · `progression_applique_case` false · `relances_max_par_tour` 1 (0 = illimité) · `cases_positives` ressource_peuple|neutre|brut (ressource_peuple) · `peripeties_cases_neutres` true · `sablier_secondes` 180 · `max_power_points` 8 · `max_health_points` 3→8 · `lore_feuillet_retrigger` once_per_team · `lore_gemme_costs_enabled` false · `lore_heart_rewards_enabled` false · `feuillet_zone_traversal_enabled` false.

Deux **profils** sélectionnables d'un clic sur une partie : `complet` (défauts ci-dessus) et `prologue` (`voile` false, `marche` false, `chapardeur` false, `zones_par_plateau` 8, tout le reste identique) pour un chapitre d'apprentissage.

## 16. Fichiers de données (livrés, à verser dans `data/gl/tenir/`)

`chasse-zones.json` (36 zones), `questions-lecture.json` (36), `peripeties.json` (32), `missions.json` (20), `titres.json`, `badges.json`, `olu-lignes.json`, `parures.json`, `sorts.json` (grimoire v2), `reglages-defaut.json`, `passeur-plateau4.json` (les 7 pages de route du plateau 4). Chaque fichier a un chargeur idempotent et un test de contenu.

## 17. Hors périmètre

Défis de la Trame (moteur de la Fresque, janvier), Deux Caravanes et Messager, Conseil des peuples, rituels, tablettes avec compte par élève en classe (la tablette d'équipe suffit), toute modification de ForetMap hors montage du Mode Découverte sur une partie.

## 18. Attendus de livraison

Une PR unique sur `main`, quatre étapes internes commitées séparément, tests verts à chaque étape (`npm run lint`, `format:check`, `test:ui`, `test`, `test:content`, `build`, `check:runtime`, e2e GL), miroirs CJS à jour, migrations idempotentes, `docs/API.md` et `docs/reference/gl/*` à jour, `docs/GL_TENIR_A_DEUX.md` (architecture), `CHANGELOG.md`, description de PR avec la liste « choix faits sans demander » et des captures des quatre surfaces. Vérification manuelle en classe en dix lignes fournie dans le prompt.
