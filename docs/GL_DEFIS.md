# Gnomes & Licornes — les défis de « Tenir à deux »

Deux familles de défis vivent dans la mouture « Tenir à deux ». Elles n'ont en commun que leur
règle de fond : **un défi ne donne jamais de ressource** (garde-fou 5), et **l'erreur n'y punit
jamais** (« Pas encore », jamais « faux »).

| Famille               | Quand                                              | Qui juge                     | Ce que donne une réussite                                     |
| --------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| **Défi de case**      | Une équipe s'arrête sur une case « Défi d'équipe » | Le prof, d'un geste          | Le voile recule (`defi_recul`, 2 cases)                       |
| **Défis de la Trame** | Hors du temps de jeu : activité finie, veillée     | L'app (cœur pur, au serveur) | Une page de veillée, un point de regard, l'avancée d'un badge |

Règles pour le prof : `docs/GL_TENIR_A_DEUX_REGLES.md` § 15. Routes : `docs/API.md` (« Défis de
case », « Défis de la Trame »). Ce document décrit la mécanique des **défis de la Trame** et
rappelle en une section celle du défi de case.

## 1. Défi de case (lot 2, rappel)

Catalogue `data/gl/tenir/defis-cases.json` (16 défis, 4 par plateau) → `gl_tenir_defis_cases`.
Moteur `lib/glDefisCase.js`, routes `routes/gl/games/defis-case.js`, table de partie
`gl_game_defis_case`. L'équipe qui s'arrête sur une case « Défi d'équipe » reçoit un défi **à
préparer pour la séance suivante** ; le tour continue. Le critère n'est servi qu'au prof, qui
juge « Relevé » ou « Pas encore ». Un défi sans décision au camp s'annule sans effet : aucun
état d'attente sans sortie. Réglages `defis_case`, `defi_declenchement`, `defi_recul`.

## 2. Défis de la Trame : quatre défis, un plateau de cartes

| Défi                 | Peuple   | Unité (`unite`)                      | Geste                                                                                |
| -------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| **Retisser**         | Gnomes   | `<biome>:<niveau>` (5, 7, 9, 12)     | Relier les cartes d'un réseau : « est mangé par »                                    |
| **Réparer la trame** | Gnomes   | `p<plateau>`                         | Ranger six espèces, lire la leçon, choisir ce qui protégerait deux espèces menacées  |
| **La trame altérée** | Licornes | `<biome>:<code de la carte retirée>` | Une carte est retirée du réseau donné tissé : dire ce que devient chaque autre carte |
| **Les fils cachés**  | Licornes | `p<plateau>`                         | Relier des cartes de texte, de la cause vers l'effet                                 |

Les défis proposés sont ceux du peuple de l'équipe (`defis_par_peuple`), sur les **deux biomes
du plateau de la partie**. Une partie du plateau 1 propose donc aux Gnomes huit niveaux de
Retisser (quatre par biome) et un Réparer ; aux Licornes six trames altérées (trois cartes à
retirer par biome) et un jeu de fils cachés.

**Qui joue, et quand.** Un élève avec son compte joue en mode `individuel`, à tout moment
(entrée « Défis de la Trame » du Seuil). Le mode `equipe` (`defis_mode_equipe`) est ouvert au
prof (onglet « Défis » de la console) et à la tablette d'une équipe **quand aucun tour n'est
ouvert**. Un défi ne prend jamais de temps de jeu.

### Fichiers

| Élément             | Emplacement                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogues          | `data/gl/tenir/trame-reseaux.json`, `trame-fils.json`, `trame-reparer.json` (+ `exemple/`)                                                                                                                                                                                                        |
| Chargeurs           | `lib/glTrameImport.js` (enregistrés dans `lib/glTenirImport.js`)                                                                                                                                                                                                                                  |
| Tables de catalogue | `gl_trame_reseaux`, `gl_trame_cartes`, `gl_trame_liens`, `gl_trame_fils_*`, `gl_trame_mesures`, `gl_trame_reparer_*` (migration `354`)                                                                                                                                                            |
| Cœur pur            | `src/gl/defis/trameCore.js`, miroir CJS `lib/shared/glTrameCore.js` (`npm run sync:shared-cores`)                                                                                                                                                                                                 |
| Moteur de partie    | `lib/glTrameDefis.js`, routes `routes/gl/games/defis.js`                                                                                                                                                                                                                                          |
| Tables de partie    | `gl_trame_defis`, `gl_trame_reussites` (migration `355`)                                                                                                                                                                                                                                          |
| Écrans              | `src/gl/components/defis/` (`GLTrameBoard`, `GLDefiPlayer`, `GLDefisView`, `GLDefisEntree`, `GLDefisConsolePanel`), hook `src/gl/hooks/useGlTrameDefi.js`                                                                                                                                         |
| Tests               | `tests/gl-trame-core.test.js` (100 % des branches), `tests/gl-trame-import.test.js`, `tests/gl-trame-defis.test.js`, `tests/content/gl-trame-catalogues.test.js`, `tests-ui/gl/GLTrameBoard.test.jsx`, `GLDefiPlayer`, `GLDefisEntree`, `GLDefisConsolePanel`, `e2e/gl-tenir-defis-trame.spec.js` |

## 3. Le cœur pur

`trameCore.js` ne lit ni la base ni l'horloge : il reçoit un modèle et un état, et rend un
classement. Le serveur l'exécute à chaque enregistrement ; **les solutions ne quittent jamais le
serveur** (ni les liens acceptés, ni la cascade, ni les catégories, ni les mesures acceptées).
L'écran n'importe du cœur que ses constantes.

- `buildReseau(reseau, niveau)` : le modèle d'un réseau à un niveau — les `niveau` **premières
  cartes** du fichier et les liens entre elles. L'ordre des cartes dans le fichier fait les
  niveaux.
- `buildFils(chapitre)` : le modèle des fils cachés d'un plateau.
- `normaliserEtat(type, etat, codes)` : ramène un état reçu à ses bornes — 60 flèches au plus
  entre cartes connues, textes de 280 caractères, coordonnées de 0 à 100. Tout le reste est
  écarté.

### Sens des flèches

Une flèche va **de celui qui est mangé vers celui qui mange** (« est mangé par ») : de l'herbe
vers le zèbre, du zèbre vers le lion. C'est le sens du fichier (`liens_acceptes: { de, vers }`)
et de l'écran. Dans `gl_species_interactions`, où les liens acceptés sont aussi versés, `from`
est celui qui mange et `to` sa ressource : le chargeur fait la conversion. Pour les fils cachés,
la flèche va de la cause vers l'effet.

### Classement d'une flèche (`classifyLink`)

Dans cet ordre :

1. `boucle` — une carte vers elle-même (« Une carte ne se relie pas à elle-même. ») ;
2. `doublon` — la flèche est déjà posée ;
3. `trouvee` — le lien est accepté, **ou** la flèche va de n'importe quelle carte vers un
   décomposeur (tout finit par être décomposé : ce lien n'est pas écrit dans le fichier) ;
4. `inversee` — l'inverse est un lien accepté (« Regarde le sens : la flèche va de celui qui est
   mangé vers celui qui mange. ») ;
5. `a_discuter` — tout le reste : lien prévu comme débattu (avec son « pourquoi »), ou non prévu
   (« À discuter avec ton équipe ou avec ton professeur. »).

Un cas propre aux **fils cachés** : quand une suite de fils mène de la cause à l'effet (un
raccourci, ou la boucle voulue du plateau 4), la flèche n'est pas « à l'envers », même si le fil
direct existe dans l'autre sens. Elle est classée `a_discuter` avec « C'est vrai, mais il manque
une étape entre les deux. »

Aucun classement ne dit « faux ». « À discuter » garde une teinte neutre et une bulle ; le sens à
regarder est en tirets ambrés ; rien n'est en rouge, et un pictogramme et un libellé doublent
toujours la teinte. Le compteur dit les liens trouvés, **sans total**.

### Fin d'un défi

- **Retisser** (`etatRetisser`) : chaque animal a trouvé quelque chose à manger, chaque plante a
  une suite, une flèche au moins va vers les décomposeurs, et aucune flèche inversée ne reste.
  Il n'est **pas** demandé de trouver tous les liens du fichier : un réseau cohérent suffit.
- **Les fils cachés** (`isFilsComplet`) : chaque lien du jeu est trouvé, aucune flèche inversée.
- **La trame altérée** (`verifierPredictions`) : une prédiction juste pour chaque carte.
- **Réparer** (`isReparerComplet`) : les six espèces rangées dans la bonne catégorie, la leçon
  lue, et une mesure acceptée choisie pour deux espèces menacées (`especesRequises`).

### La cascade (`cascade`)

La trame altérée se joue sur le **niveau 9** du réseau, donné tissé. Une carte est retirée ; le
cœur calcule ce que devient chacune des autres :

- une carte est **mobile** si elle n'est ni un producteur ni le décomposeur générique ;
- **disparaît** (`disparait`) : carte mobile dont toutes les ressources du niveau ont disparu —
  l'effet se propage de proche en proche ;
- **diminue** (`diminue`) : carte mobile qui perd une partie de ses ressources ;
- **augmente** (`augmente`) : ressource directe de la carte retirée (elle est moins mangée),
  sauf si elle disparaît ;
- si la carte retirée est un **décomposeur** : les producteurs diminuent (« Sans décomposeurs,
  la matière morte s'accumule… ») et rien n'augmente ;
- toutes les autres cartes : `rien`.

Chaque effet porte son explication en une phrase, composée à partir des noms des cartes, mis
entre guillemets parce que leur genre n'est pas connu (« « Lion d'Afrique » ne mange plus « Gnou
bleu » : il y en a davantage. »). Après « Vérifier », une prédiction juste reçoit son explication ; les autres
reçoivent « Pas encore. », **sans la réponse**. Une fois tout juste, une question d'ouverture non
notée (`pourAllerPlusLoin`) invite à penser l'étage suivant.

Le modèle est volontairement simple : seule la **disparition** se propage de proche en proche ;
« augmente » et « diminue » ne touchent que les voisines directes ; il n'y a ni compétition, ni
délai, ni régime alimentaire hors des cartes du niveau. Les 24 cascades de référence (8 biomes ×
3 cartes retirées) sont reproduites exactement par `tests/gl-trame-core.test.js` ; elles sont à
relire par un enseignant après chaque modification d'un réseau.

### Indices (`nextHint`)

Gratuits, illimités, en échelle ; ils ne réduisent aucune récompense. Retisser et fils cachés :
relire la consigne ; par où commencer ; une carte encore isolée ; puis un lien accepté non
trouvé, montré **en pointillés** et à tracer soi-même (l'écran ne le pose pas). La trame altérée
et Réparer ont une échelle courte du même esprit (`lib/glTrameDefis.js › demanderIndice`).

## 4. En partie : sauvegarde stricte

Un défi appartient à un **porteur** : `p<playerId>` en mode individuel, `e<teamId>` en mode
équipe (unique par partie, porteur, type et unité : `POST …/defis` crée ou reprend).

L'écran répond tout de suite, puis envoie l'état 350 ms après le dernier geste
(`TRAME_SAVE_DELAY_MS`) : le Wi-Fi de la classe ne le fige pas. Chaque `PUT` porte la **révision
attendue** ; si une autre sauvegarde est passée, le serveur répond 409 `edit_conflict` et
l'écran recharge le défi (« Ce défi a été modifié sur un autre appareil : il est rechargé. »).
L'élève reprend où il en était, sur n'importe quel appareil. Aucun code de la Fresque n'est
importé.

Droits rejoués par le serveur à chaque appel : peuple de l'équipe, niveau ouvert, porteur du
défi, tour fermé pour une tablette d'équipe, compte d'élève exclu du mode équipe. Les réglages
(`defis`, `defis_mode_equipe`, `defis_par_peuple`) et l'état de la partie sont relus à **chaque
écriture** (`assertDefiJouable`) : fermer les défis en cours de séance arrête aussi un défi déjà
ouvert (409 `DEFIS_FERMES`), une partie terminée n'en donne plus ; la lecture reste permise. La
`note` d'un réseau ou d'un jeu de fils est une note d'auteur : elle n'est jamais servie.

## 5. Récompenses

À la réussite, pour l'élève — ou, en mode équipe, pour chaque membre présent — dont c'est la
**première réussite de l'unité dans la partie** (`gl_trame_reussites`) :

1. **Une page de veillée** du chapitre à son nom, écrite par `commitFeuilletDiscovery` avec la
   source `defi` et l'option `sansRessource`. Plafond : `defis_pages_par_semaine` (2) par
   semaine ISO et par élève, compteur propre à cette voie. Pages épuisées : « Le carnet de ce
   chapitre n'a plus de page en attente. » Une page est **tirable** (`pagesTirables`) si elle est
   du chapitre et n'est : ni une page de zone de chasse (elle se cherche sur le plateau), ni une
   page de route (`carnet_route` : le Passeur les lit, ou sa liste les a écartées), ni la page
   apportée par l'oiseau (mode `corbeau`), ni une page dont le titre ou l'incipit porte une
   chaîne interdite ou un terme `secret` du lore. Sur le corpus du 7 novembre 2026 : 18, 7, 12
   et 14 pages tirables aux plateaux 1 à 4.
2. **Un point de regard** du proche (source `defi`, `lib/glVoyageur.js`).
3. **Un badge** du moteur commun, famille « Défis de la Trame » (`lib/glRewardsCatalog.js`) :

   | Badge            | Mesure                  | Fil · Nœud · Étoffe |
   | ---------------- | ----------------------- | ------------------- |
   | Tisserand        | niveaux de Retisser     | 3 · 8 · 16          |
   | Voyant des fils  | trames altérées         | 3 · 6 · 12          |
   | Gardien des fils | plateaux de fils cachés | 2 · 3 · 4           |
   | Réparateur       | plateaux réparés        | 2 · 3 · 4           |

4. L'évènement `defi_trame_reussi` au journal (type, biome ; jamais un nom d'élève) et une ligne
   d'Olu.

Une réussite suivante de la même unité ne donne plus de page. **Jamais** un cœur, une gemme, un
recul du voile ou un rang.

**Une transaction, puis une écriture rattrapable.** Le passage du défi à « réussi », les lignes
de réussite, la page décidée pour chaque élève (`page_feuillet_code`, plafond compté sous
verrou) et l'évènement sont écrits dans **la même transaction** (`inscrireReussite`). L'écriture
de la page au carnet (`commitFeuilletDiscovery` ouvre sa propre transaction) suit ; si elle est
interrompue, la page reste promise et `livrerPagesEnAttente` l'écrit à la prochaine lecture de
la liste des défis — une seule fois.

**Lien entre les peuples.** Une trame altérée réussie dont la carte retirée est une espèce de
`trame-reparer.json` ajoute cette espèce à « À réparer » du carnet de la classe (« signalée par
une Licorne ») ; le prochain Réparer d'un Gnome la propose en premier. La liste est dérivée des
réussites (aucune table), et ne donne aucun gain.

## 6. Suivi du prof

`GET /api/gl/games/:id/defis/suivi` (`?format=csv`) : par élève et par type, unités réussies,
défis en cours et indices utilisés ; pages gagnées. **Tri alphabétique seulement** — aucun
classement, aucun total comparé. Les phrases facultatives de Réparer (« Dis pourquoi ») sont à
parcourir, sans compteur « à traiter ». L'outil MCP `gl_seance` (`apres`) donne les mêmes comptes
par type, sans aucun nom.

## 7. Ajouter ou modifier un réseau

1. Éditer `data/gl/tenir/trame-reseaux.json` (format : `data/gl/tenir/README.md`). **12 cartes
   dans l'ordre** : les 5 premières font le niveau 5, les 7 premières le niveau 7, etc. Chaque
   niveau doit porter au moins un producteur et un décomposeur, et chaque carte qui n'est pas un
   décomposeur doit être touchée par un lien accepté du niveau.
2. Écrire les liens dans le sens « est mangé par » (`de` = la ressource). Un lien rare ou
   débattu va dans `a_discuter` avec son `pourquoi`. Les liens vers `DEC` ne s'écrivent pas.
3. Choisir trois `scenarios_trame_alteree` parmi les **neuf premières** cartes.
4. Vérifier : `npm run test:content` (mêmes contrôles que l'import strict) et
   `npm run gl:import:tenir -- --fichier trame-reseaux --strict --dry-run`. Les codes doivent
   exister dans `gl_species` et être du biome du réseau.
5. Relire les cascades calculées (un test de `tests/gl-trame-core.test.js` fige les 24 de
   référence : une modification d'un réseau le fait échouer, c'est voulu — relire, puis mettre
   la référence à jour).
6. Le catalogue se synchronise par empreinte au démarrage (`lib/glTenirSync.js`), ou à la main
   depuis Contenus → Catalogues « Tenir à deux ».

Pour un nouveau **jeu de fils** ou un plateau de **Réparer**, même démarche sur `trame-fils.json`
et `trame-reparer.json`.

## 8. Réglages

| Clé (`gameplay.tenir_…`)  | Défaut | Rôle                                                             |
| ------------------------- | ------ | ---------------------------------------------------------------- |
| `defis`                   | `true` | Ouvre les défis de la Trame                                      |
| `defis_par_peuple`        | `true` | À `false`, les quatre défis sont proposés à tous                 |
| `defis_pages_par_semaine` | `2`    | Pages de veillée gagnées par défi, par semaine ISO et par élève  |
| `defis_mode_equipe`       | `true` | Le prof ou une tablette d'équipe hors tour lance pour une équipe |

Tous sont surchargeables par partie (`PUT /api/gl/games/:id/tenir/profil`).
