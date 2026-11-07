# PROMPT Claude Code — G&L « Tenir à deux » : correctifs de la simulation du 7 nov. + banc de simulation en série + outils MCP G&L

Dépôt : `oliviera999/ForetMap`. Branche de départ : `claude/gl-sim-contenu-prod` (= `main` v1.237.1 + l'instantané de contenu `data/gl/sim/`). Une seule PR, livrée d'un bloc, en **neuf étapes internes commitées séparément**, tests verts à chaque étape. Lis tout le prompt avant de commencer.

## 0. Contexte

Le 7 novembre 2026, une simulation de bout en bout a été faite sur une copie locale identique à la prod. Elle a joué trois chapitres 1 complets avec un prof virtuel et 20 élèves virtuels, sur les surfaces hybride et tablette, avec le contenu réel de la prod (plateau 1, 931 QCM, 205 feuillets, 276 espèces). Elle a fait environ 1 400 appels, sans aucune erreur 5xx. Le moteur tient, mais la simulation a révélé :

- trois **bloquants de prod** ;
- six **écarts de règles et d'équilibre** ;
- une douzaine de **défauts mineurs**.

Ce prompt corrige tout cela. Il transforme aussi la simulation ponctuelle en **outil permanent** : un banc de simulation en série, versionné, avec des scénarios variés, des invariants vérifiés à chaque geste, des rapports chiffrés et des outils MCP pour piloter et diagnostiquer les parties.

Documents de référence dans le dépôt : `docs/GL_TENIR_A_DEUX_REGLES.md` (règles v2, font foi), `docs/GL_TENIR_A_DEUX.md` (architecture), `docs/GL_TESTS.md`, `data/gl/tenir/README.md`, `CLAUDE.md`.

### Fichier fourni

`data/gl/sim/contenu-prod-2026-11-07.json` (3,5 Mo, déjà présent sur la branche de départ, voir `data/gl/sim/README.md`). C'est un instantané **sans aucune donnée d'élève** du contenu de prod :

- `gl_chapters` (plateaux 1 à 4, ids 3 à 6) ;
- `gl_chapter_markers` (169 cases, avec leurs effets) ;
- `chapter_biomes` et `chapter_spells_v2` ;
- `gl_qcm_categories`, `gl_qcm_questions` (931), `gl_lore_feuillets` (205), `gl_species` (276).

Deux artefacts du connecteur MCP y sont déjà corrigés : le mot « production » rétabli, et `passTurn` reconstruit d'après le libellé.

## 1. Garde-fous (non négociables, priment sur tout)

1. Le Souffle n'est jamais personnifié (voile, pages qui pâlissent ; vocabulaire _tenir / résister_).
2. L'oiseau (`kraa` en code) n'est jamais nommé dans une chaîne visible d'un élève.
3. Aucun contenu du tiers `secret` du lore côté élève.
4. **L'erreur ne punit jamais** : « Pas encore… », jamais « faux / raté / perdu ».
5. Ressources : seulement par les pages tenues, la Trame (ressource du peuple), le carnet complet et le Marché. Elles partent par les sorts, les échanges, les dons, les cases Souffle et le chapardeur.
6. Soldes privés (élève : lui et son équipe ; prof : tout ; projection : rien). Aucun classement d'élèves.
7. Aucune donnée d'élève dans les logs, les tests, les fixtures, les rapports de simulation. Les pseudos de simulation sont anonymes (`sim-<scenario>-<n>`).
8. Isolation G&L / ForetMap : `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`.
9. Tout ce qui touche au réel passe par le prof.
10. **Le banc de simulation ne s'exécute jamais contre la base de prod.** Le refus est codé en dur : une base dont le nom ne finit pas par `_sim` ou `_test`, ou bien `NODE_ENV=production` sans `GL_SIM_ALLOW=1`, donne une erreur immédiate.

Conventions du dépôt à respecter : migrations idempotentes numérotées (vérifie le prochain numéro libre sur `main` et dans les PR ouvertes), miroirs CJS via `npm run sync:shared-cores`, tokens CSS (pas de hex ni de rem en dur), tableaux `.fm-table`, contenu semé par migration et vérifié par `tests/content/`, `docs/API.md` à jour.

## 2. Choix par défaut (faits ici, à lister dans la description de PR sous « choix faits sans demander »)

| #   | Sujet                                                     | Choix par défaut                                                                                                                                                                                        | Réglage pour revenir en arrière                                             |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C1  | Progression                                               | Déplace de ±1 **sans appliquer la case d'arrivée**. Lançable seulement si le dernier jet du tour est celui de l'équipe et qu'aucune autre équipe n'a joué depuis.                                       | `gameplay.tenir_progression_applique_case` (false)                          |
| C2  | Relance de Relance                                        | Même fenêtre que C1.                                                                                                                                                                                    | —                                                                           |
| C3  | Relances de case                                          | **Une seule relance par équipe et par tour.** Une bonne réponse suivante donne +1 case sans relance.                                                                                                    | `gameplay.tenir_relances_max_par_tour` (1 ; 0 = illimité)                   |
| C4  | Cases positives à ressource (19 cases sur les 4 plateaux) | Le gain devient **+1 de la ressource du peuple**, comme la Trame, journalisé `tonalite: positif`.                                                                                                       | `gameplay.tenir_cases_positives` (`ressource_peuple` \| `neutre` \| `brut`) |
| C5  | Péripéties                                                | Tirées aussi sur les cases `behavior` sans `effects` dont la tonalité est `negatif` ou `neutre`. La description de la case reste affichée au-dessus de la péripétie. « Défi d'équipe » n'en reçoit pas. | `gameplay.tenir_peripeties_cases_neutres` (true)                            |
| C6  | Élève en retrait                                          | Il peut ouvrir et tenir une page, et reçoit les gains d'équipe (comme un absent). Il ne voit toujours pas le Marché et ne verse pas au pot.                                                             | —                                                                           |
| C7  | Zone `cz-p2-08`                                           | Passée `actif: false` dans `chasse-zones.json` (son feuillet `ep-I-08` est au plateau 3). **Oliv choisira le feuillet.**                                                                                | —                                                                           |
| C8  | Passeur p4, ordre 4 (`ep-VI-09`, plateau 2 en base)       | L'importeur accepte, pour le passeur seulement, un feuillet d'un plateau antérieur, avec un avertissement.                                                                                              | —                                                                           |
| C9  | Limiteur de connexion                                     | Défaut porté à **300 par 15 min et par IP**. La protection par compte (`lib/loginThrottle.js`) est inchangée.                                                                                           | `FORETMAP_AUTH_RATE_LIMIT_PER_15MIN`                                        |
| C10 | Parures sans image                                        | Achetables en pastille texte (`type: pastille`) tant que `asset` est nul.                                                                                                                               | —                                                                           |

## 3. Étape 1 — Les catalogues « Tenir » arrivent en prod, et y restent synchronisés

**Constat** : en prod, 0 zone de chasse, 0 question de lecture, 0 péripétie, 0 ligne d'Olu, 0 parure, 0 titre, 0 badge, 0 mission. Les fichiers sont dans `data/gl/tenir/` depuis la PR #638, mais rien ne les charge en base :

- pas de migration ;
- pas de tâche dans `.cpanel.yml` ;
- pas de bouton d'admin.

De plus, `npm run gl:import:tenir -- --fichier tous` est **refusé en cascade** :

- `chasse-zones` : `cz-p2-08` → feuillet d'un autre plateau. Toute la chaîne s'arrête, et `questions-lecture` en dépend.
- `passeur-plateau4` : ordre 4 refusé pour la même raison.

À faire :

1. **Import tolérant, ligne par ligne** dans `lib/glTenirImport.js` :
   - une ligne invalide est écartée et rapportée (`errors[]`), les lignes valides sont écrites ;
   - un fichier ne bloque plus les suivants ;
   - une question de lecture dont la zone est absente ou inactive est écartée avec un avertissement ;
   - le mode `--strict` garde l'ancien comportement (tout ou rien) pour la CI de contenu.
2. **Synchronisation au démarrage** (`lib/glTenirSync.js`, appelée après `initSchema`) :
   - empreinte SHA-256 de chaque fichier de `data/gl/tenir/`, mémorisée dans `gl_settings` (`content.tenir_catalogues_hash`) ;
   - si une empreinte diffère, import tolérant du fichier, puis rapport dans les logs (`gl.tenir.sync`, comptes seulement) et dans `gl_settings` (`content.tenir_catalogues_report`) ;
   - jamais d'état de partie touché ;
   - non bloquant : une erreur est loguée, le serveur démarre ;
   - désactivable : `GL_TENIR_SYNC=0`.
3. **Admin** : `GET /api/gl/admin/tenir/catalogues` (comptes par table, empreintes en base comparées au dépôt, dernier rapport) et `POST /api/gl/admin/tenir/catalogues/sync` (`{ dryRun, fichier? }`). Dans **Contenus → Chapitres**, ajoute une carte « Catalogues Tenir à deux » : comptes, écarts, bouton « Synchroniser », rapport lisible.
4. **Données** : C7 et C8 du § 2.
5. **Importeurs xlsx en ligne de commande cassés** : `scripts/gl-import-{qcm,species,glossary,lore-glossary,qcm-lore,spells}.js` appellent des parseurs devenus `async` sans `await`, d'où « Cannot read properties of undefined (reading 'length') ». Ajoute les `await`, plus un test qui exécute chaque script en `--dry-run` sur son fichier par défaut.

Tests : import tolérant (une ligne fautive au milieu, le reste écrit), `--strict`, synchronisation idempotente (deux démarrages = une seule écriture), refus d'une zone sans polygone conservé, route admin réservée au MJ.

## 4. Étape 2 — Connexions de classe

`lib/rateLimit.js` : le défaut de `authLimiter` passe de 60 à 300 (C9). Mets à jour `env.local.example`, `docs/EXPLOITATION.md` (expliquer le NAT du lycée : toutes les tablettes sortent par une seule IP) et les tests du limiteur. Ajoute un log `warn` agrégé (une ligne par fenêtre) quand le plafond par IP est atteint, pour que le connecteur MCP le voie dans les journaux.

## 5. Étape 3 — Règles et équilibre

1. **Progression et Relance (C1, C2)**
   - **Constat** : la fenêtre « après le jet, avant la case » n'existe pas, puisque la case est appliquée dans `appliquerJetTx`. Progression (`lib/glSpellEffectsApply.js`, case `move_delta`) applique donc une deuxième case. Sur une case Trame, l'équipe paie 1 et chaque membre gagne 1, soit **+4 net**, observé deux fois sur trois parties. Le sort reste aussi lançable après les jets des autres équipes.
   - **À faire** : enregistre dans `gl_game_tenir_state` (ou `gl_game_rounds`) le « dernier jet » (`teamId`, `eventId`). Les fenêtres `apres_jet` exigent que l'équipe lanceuse soit l'auteure du dernier jet du tour. Dans `lib/glSpellFenetres.js`, refus avec le message de la fenêtre.
   - Progression : `appliquer_case` vaut le réglage (false par défaut). Si une case question est atteinte, elle n'est pas présentée.
2. **Relances en chaîne (C3)**
   - **Constat** : `bonneReponseDeCaseTx` (`lib/glTour.js`) réarme le dé sans limite. Mesure : une équipe à 31 cases sur 42 après la séance 1 ; chapitre plié en 3 à 4 séances au lieu de 4 à 6 ; le voile n'a plus rattrapé personne. C'est la seule voie par laquelle le niveau scolaire accélère une équipe.
   - **À faire** : compteur `relances_case` par équipe et par tour (dans `gl_game_rounds` ou `gl_game_tenir_effets`). Au-delà du maximum, +1 case et application de la case, sans réarmer le dé. Renvoie `{ bonus: { cases: 1, relance: true|false } }` dans la réponse de `/qcm/answer` (aujourd'hui rien n'y signale le bonus).
3. **Cases positives (C4)** : dans `applyMarkerVitalityEffects` en mode tenir, tout delta de ressource positif d'une branche `neutral` est converti selon le réglage. Avec `ressource_peuple`, +1 cœur pour un Gnome, +1 gemme pour une Licorne, quelle que soit la valeur d'origine. Les branches gnome / unicorn explicites (Trame, Souffle) restent telles quelles.
4. **Péripéties (C5)**
   - **Constat** : `applyArrivalTx` ne les tire que sur `event_type = 'event'` sans description. Aucun des 4 plateaux réels n'en a, donc les 32 péripéties ne sortent jamais.
   - **À faire** : étendre la règle comme décrit en C5.
   - Cases concernées aujourd'hui : Averse tropicale, Troupe de chimpanzés, Lion à l'affût, Chant des cigales, Brame du cerf, Brouillard atlantique, Lemming en pleine explosion.
5. **Pistes de veillée**
   - **Constat** : `pisteTx` exige `gl_lore_feuillets.lien_canal = 'espece'`. Aucune des 35 pages de chasse n'a ce lien, donc aucune piste n'est possible.
   - **À faire** : ajoute un champ `especes` (codes `gl_species`, 1 à 3) à chaque zone de `chasse-zones.json`, plus une colonne `gl_chasse_zones.especes_json`. `pisteTx` cherche d'abord dans la zone, puis retombe sur le lien du feuillet.
   - Renseigne les 35 zones en lisant l'indice, la page et la question fixe. Exemples : cz-p1-01, le calao ; cz-p1-02, l'okapi ; cz-p1-06, le baobab.
   - Mets le tableau zone → espèces dans la description de PR pour qu'Oliv le relise.
6. **Parures (C10)** : `lib/glMarketPlace.js`, `achetable: !!row.asset` et `disponible` exigent une image, et les 12 parures n'en ont pas. Rends-les achetables en pastille (emoji ou initiale sur la mascotte, sans image).
7. **Retrait (C6)** : `resolveLectureContext` (`routes/gl/games/chasse.js`) refuse la lecture à un élève en retrait. Autorise la lecture, mais garde le Marché masqué et le pot sans contribution.
8. **Erreur d'Olu du jour**
   - **Constat** : au chapitre 1 (tropiques), Olu s'est trompé sur la toundra, le renne et le hérisson. Les élèves ne peuvent pas le corriger avec ce qu'ils ont vu.
   - **À faire** : ajoute `plateaux: [..] | "tous"` à chaque ligne `moment: "erreur"` de `olu-lignes.json` (étiquette chaque ligne selon son biome). Le tirage filtre sur le plateau de la partie, avec repli sur `tous`.

Tests : un par point, plus `tests/gl-tenir-economie-globale.test.js` étendu à « Progression sur une Trame ne crée pas de ressource nette » et « cases positives = ressource du peuple ».

## 6. Étape 4 — Contenu des plateaux (migration de contenu + test `tests/content/`)

Écris une migration idempotente (`UPDATE … WHERE id = ? AND description = '<ancien texte>'`, pour ne jamais écraser une retouche faite entre-temps) :

| id  | Plateau / case              | Nouvelle description                                                                                                                      |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 182 | P1 Éclaircie bienvenue (+2) | La canopée s'entrouvre : un rai de soleil éclaire le sentier. Vous filez dans la lumière.                                                 |
| 184 | P1 Passage dégagé (+2)      | Des éléphants de forêt ont ouvert un couloir dans les fourrés. Vous l'empruntez.                                                          |
| 183 | P1 Coup de chance (+2)      | Une piste tracée par des milliers de sabots file droit devant. Vous la suivez.                                                            |
| 17  | P1 Fruit sauvage (+1)       | Tu trouves une mangue sauvage (Irvingia) tombée au sol, mûre et nourrissante : les éléphants de forêt en raffolent et sèment ses graines. |
| 190 | P2 Coup de chance (+2)      | Un sentier de berger longe la crête, bordé de thym et de ciste. Vous gagnez du terrain.                                                   |
| 191 | P2 Passage dégagé (+2)      | Le vent a balayé le sable : un reg dur et plat s'ouvre devant vous. Vous avancez à grands pas.                                            |
| 196 | P3 Éclaircie bienvenue (+2) | Un chêne tombé a ouvert une trouée de lumière ; le sous-bois s'y dégage. Vous passez.                                                     |
| 197 | P3 Coup de chance (+2)      | Le brouillard se lève d'un coup sur la lande : le chemin apparaît, net, jusqu'à l'horizon.                                                |
| 205 | P4 Passage dégagé (+2)      | Une rivière gelée trace une route blanche entre les épicéas. Vous la suivez sur la glace.                                                 |

Les anciennes descriptions étaient celles d'anciennes cases question (« sauras-tu nommer la bête ? », « Identifie-la »…), lues par les élèves sur des cases de déplacement. Le kapokier de « Fruit sauvage » était faux : baobab (_Adansonia_) et kapokier (_Ceiba_) sont deux arbres distincts, et le baobab n'est pas un arbre de jungle.

Dans la même migration :

- case 217 (P1, doublon d'`order_index` 350 avec la case 35) → `order_index = 355` ;
- la vérification d'un chapitre « test » ou de démo dans le sélecteur se fait par l'UI (étape 5), pas par suppression.

Ajoute un contrôle de contenu `tests/content/gl-markers-coherence.test.js` qui échoue si :

- une case `behavior` avec effet de déplacement a une description interrogative (« ? », « Identifie », « Nomme », « Démêle ») ;
- deux cases d'un même chapitre partagent un `order_index`.

**Noms d'équipes.** `lib/gl/teamNaming.js` fabrique les noms à partir du titre du chapitre : on a obtenu « Chapitre », « Plateau 1 », « Tropiques », « Africains ». Remplace ce vocabulaire par deux listes typées, choisies selon le peuple de l'équipe et jamais réutilisées dans une même classe pendant l'année :

- Gnomes : Les Racines · Les Mains vertes · Les Faiseurs de nœuds · Les Tisserands · Les Fouisseurs · Les Semeurs · Les Écorces · Les Rafistoleurs · Les Champignons rieurs · Les Pierres chaudes · Les Gardiens du humus · Les Lanternes de mousse.
- Licornes : Les Regards d'aube · Les Crins d'étoile · Les Prismes · Les Lucioles · Les Sabots d'argent · Les Brumes claires · Les Liseuses de traces · Les Cornes de lune · Les Veilleuses · Les Reflets · Les Arcs du matin · Les Éclats de rosée.

Le nom reste modifiable par le prof.

## 7. Étape 5 — Écrans

1. **Projection** (`src/gl/components/tenir/GLProjectionView.jsx`) :
   - Ajoute le **plateau en lecture seule**, en réutilisant le composant de carte de l'onglet Cartes : pions, voile gris, empreintes, contours révélés, oiseau témoin, mascottes. Aucun polygone de zone endormie, aucune bourse.
   - Remplace les états bruts par leurs libellés : `endormie` → « dort encore », `revelee` → « révélée », `palie` → « pâlie », `trouvee` → « trouvée », `tenue` → « tenue », `reparee` → « réparée ».
   - Vérifie que c'est bien le plateau qui s'affiche à 1920×1080 en mode projection.
2. **Journal** (`lib/glJournalPresentTenir.js`) :
   - « lit la page sort-jungle-01 » → le titre de la page ;
   - plus aucune ligne « Un évènement s'est produit » : donne un libellé à `move`, `spell_effect`, `spell_cast`, `marker_effect`, `relance_bonus`, `marker_question_presented`, `qcm_answer` et à tout type émis par le moteur tenir ;
   - `olu_corrige` automatique (sans équipe) → « Olu se reprend : … » ;
   - test qui parcourt tous les types d'événements tenir et échoue s'il en reste un sans libellé.
3. **Numérotation du voile** : le bandeau dit « case 9 », le journal « jusqu'à la case 8 ». Une seule convention partout (numéro humain = rang + 1), centralisée dans un utilitaire partagé, avec un test.
4. **Console MJ** :
   - en mode tenir, les réglages hérités (popovers, feuillets, effacement, coûts et gains feuillets, déplacement libre, repère de départ) passent dans un repli « Réglages hors Tenir », fermé par défaut ;
   - « Jouer le tour » devient l'onglet ouvert par défaut d'une partie en cours ;
   - à 1440×900, l'écran du tour doit tenir sans défilement jusqu'aux boutons d'action ;
   - le formulaire de partie ne déborde plus à droite.
5. **Sélecteur de chapitres** : il n'affiche que les chapitres avec `plateau_number`, préfixés « Plateau N — ». Une case « Afficher les chapitres hors plateau » révèle la démo « La forêt magique » et « test ».
6. **« Partie mise à jour »** s'affiche en cliquant simplement « Ouvrir » sur une partie : vérifie s'il y a une écriture parasite (PUT) et supprime-la si c'est le cas.

Captures avant / après dans `docs/captures/tenir-v2/` (projection, écran du tour à 1440×900, écran d'équipe sur tablette 1024×768 et sur téléphone 390×844).

## 8. Étape 6 — Instrumentation fine du moteur

1. **Aléa centralisé et rejouable** : `lib/glRandom.js` (`randomInt(min, max)`, `pick(list)`, `shuffle`) remplace les `crypto.randomInt` et `Math.random` du moteur G&L. Au moins ces sites sont concernés : `lib/glTour.js` (péripétie, ligne d'Olu), `lib/glChasse.js`, `lib/glChapardeur.js`, `lib/glDiceRoll.js`, `lib/gl/teamComposition.js`, l'erreur d'Olu.
   - Par défaut : `crypto`.
   - Si `GL_RANDOM_SEED` est posé **et** `NODE_ENV !== 'production'`, générateur déterministe (mulberry32 ou équivalent), une graine par partie (`seed ^ gameId`) pour que des parties en parallèle restent reproductibles.
   - Test anti-régression : plus aucun `crypto.randomInt` ni `Math.random` dans `lib/gl*` hors de `glRandom.js`.
2. **Horloge injectable** : `lib/glClock.js` (`now()`). En test ou en simulation, un décalage réglable par `X-GL-Sim-Clock` (en-tête accepté seulement si `GL_SIM_ALLOW=1` et hors production), ou par appel direct. Toutes les fenêtres par semaine ISO ou par trimestre (veillée, pistes, Esquive) passent par elle.
3. **Grand livre des ressources** : table `gl_resource_ledger` (`id`, `game_id`, `player_id`, `delta_health`, `delta_power`, `solde_health_apres`, `solde_power_apres`, `cause` (enum : `page_tenue`, `trame`, `case_positive`, `case_souffle`, `carnet_complet`, `sort_pot`, `echange`, `don`, `parure`, `chapardeur`, `nid`, `heritage`, `reparation`, `geste_prof`, `migration`), `event_id`, `created_at`).
   - **Une seule fonction** écrit les bourses : `lib/glBourses.js › applyBourseDeltaTx(tx, { gameId, playerId, dh, dg, cause, eventId })`. Elle gère plafond et plancher, écrit le livre et renvoie le delta réellement appliqué.
   - Refactore tous les `UPDATE gl_players SET health_points / power_points`.
   - Test anti-littéral : aucun autre fichier n'écrit ces colonnes.
   - Le livre est expurgé comme les bourses (privé).
4. **Invariants** : `lib/glTenirInvariants.js`, pur (sur un instantané) plus un chargeur depuis la base. Il renvoie `{ ok, violations: [{ code, gravite, detail }] }`. Au minimum :
   - bourses dans [0, plafond] ;
   - somme du livre égale aux bourses ;
   - chaque mouvement du livre a une cause autorisée et un événement ;
   - aucune ressource sur une réponse fausse ;
   - transitions d'état des pages valides (`endormie → revelee → trouvee → tenue`, `palie → reparee → tenue`) ;
   - au plus un `carnet_complet` ;
   - voile ≤ rang du camp − 1 ;
   - fouilles du tour ≤ quota ;
   - au plus un honneur par équipe ;
   - ordre du tour = ordre inverse du plateau à l'ouverture ;
   - aucun tour avec deux phases ouvertes ;
   - pages tenues par une équipe de l'autre peuple seulement.
5. **Diagnostic de partie** : `GET /api/gl/games/:id/diagnostic` (MJ). Il renvoie les invariants, le résumé du livre par équipe et par cause, la chronologie (positions par tour, voile, pages) et les durées.
6. **Mesure des temps** : un middleware sur `/api/gl/games/:id/*` mesure la durée et logue `gl.action { route, status, ms }` (aucune donnée d'élève), et la base garde des percentiles par route en mémoire (exposés au diagnostic et au MCP).

## 9. Étape 7 — Banc de simulation en série (`tools/gl-sim/`)

Objectif : rejouer des parties complètes, en nombre, avec des classes et des réglages variés, contre l'API réelle (logique métier comprise). Chaque geste est vérifié, et les rapports permettent à Oliv d'arbitrer l'équilibre.

### 7.1 Base de simulation

- `npm run gl:sim:db` crée ou réinitialise `foretmap_sim` : migrations, xlsx de `data/gl/`, catalogues `data/gl/tenir/` (import tolérant), puis le **contenu de prod** de `data/gl/sim/contenu-prod-2026-11-07.json` (chapitres 3 à 6, cases, QCM, feuillets, espèces ; ids conservés).
- `npm run gl:sim:snapshot -- --from-db <nom>` refabrique cet instantané depuis n'importe quelle base. Il retire tout ce qui touche à des personnes et vérifie l'absence de `[secret .env masqué]` et de `****`.

### 7.2 Personas (`data/gl/sim/personas.json`)

Chaque persona a :

- une `justesse` (QCM de case, de chasse, de lecture ; une justesse par catégorie est possible) ;
- une `assiduite` (probabilité d'être présent) ;
- une `veillee` (probabilité d'ouvrir l'app entre deux séances) ;
- une `strategie_fouille` (`hasard` | `indices` | `empreintes` | `contours`) ;
- des penchants : `marchand`, `donneur`, `lanceur_de_sorts`, `agite` (Farce, retrait possible), `lecteur_lent`.

Personas de base : studieuse, curieux, fonceur, timide, distrait, généreuse, marchand, agité, lecteur lent, perfectionniste.

Modèle d'équipe pour répondre : `justesse_equipe = 0,6 × max(membres présents) + 0,4 × moyenne`, plafonnée à 0,95.

L'**oracle** de réponse lit la bonne réponse en base (`gl_qcm_questions.reponse_correcte`, `gl_tenir_questions_lecture.reponse`) et choisit le bon choix par son texte, avec la probabilité de la persona ; sinon un autre choix au hasard.

### 7.3 Stratégie de fouille simulée

À reprendre de la simulation du 7 nov., qui reflète des élèves réels :

1. contour révélé ou pâli visible : 80 % de chances de cliquer dedans (bruit ±0,01) ;
2. sinon empreinte « chaud » de la classe : 75 % autour (±0,05) ;
3. sinon « tiède » : 50 % autour (±0,10) ;
4. sinon « indice compris » : 22 % au centroïde d'une zone endormie (±0,03) ;
5. sinon au hasard dans [0,05 ; 0,95] × [0,08 ; 0,92].

Le banc lit les centroïdes depuis la base comme un oracle ; il ne les envoie jamais à un client.

### 7.4 Scénarios (`data/gl/sim/scenarios/*.json`)

Format : `surface`, `profil`, `plateau` ou `annee`, `effectif`, `composition` (personas et proportions), `seances_max`, `reglages` (surcharges), `des` (`serveur` | `physique` | `libre`), `gestes` (activation et poids des sorts, du Marché, de la veillée), `evenements` (absences, retraits, erreurs réseau), `graine`, `attendus` (seuils, voir 7.6).

Livre au moins ceux-ci :

| Scénario                              | Ce qu'il teste                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hybride-reference`                   | 20 élèves, 4 × 5, profils mêlés, dés physiques saisis par le prof, 6 séances max                                                                                                                            |
| `tablette-reference`                  | dés serveur, **4 équipes qui agissent en même temps** (`Promise.all`), validation prof des dés physiques                                                                                                    |
| `tableau-pur`                         | une équipe active, « équipe suivante », sablier, tout par le prof                                                                                                                                           |
| `classe-en-difficulte`                | justesse 0,35 à 0,50                                                                                                                                                                                        |
| `classe-experte`                      | justesse 0,85 à 0,95 : rythme et effet Matthieu au pire                                                                                                                                                     |
| `effectif-24` et `effectif-17`        | équipes de 6, et 4 + 4 + 4 + 5                                                                                                                                                                              |
| `absences-retraits`                   | 30 % d'absents par séance, deux retraits, un élève qui quitte en cours                                                                                                                                      |
| `economie-agressive`                  | tous les sorts dès que la fenêtre l'autorise, marchands, dons en boucle (chasse aux exploits)                                                                                                               |
| `chasse-aveugle` vs `chasse-futee`    | stratégies de fouille extrêmes                                                                                                                                                                              |
| `voile-max` et `voile-dort`           | dé gris toujours 6 ; le voile ne bouge jamais                                                                                                                                                               |
| `prologue`                            | profil prologue                                                                                                                                                                                             |
| `plateau-2`, `plateau-3`, `plateau-4` | chaque plateau réel                                                                                                                                                                                         |
| `annee-complete`                      | 4 chapitres enchaînés : rebrassage automatique (peuples inversés 1↔2 et 3↔4), Héritage, titres qui suivent les élèves, Seuil à chaque fin                                                                   |
| `pic-connexions`                      | 3 classes de 25 élèves qui se connectent en 15 min, 10 % de fautes de mot de passe                                                                                                                          |
| `concurrence`                         | 2 membres d'une même équipe fouillent au même instant ; double soumission d'une réponse ; même `presentationToken` rejoué ; reprise après coupure                                                           |
| `veillee-semaine`                     | horloge avancée de 7 jours : limites de pages et de pistes par semaine                                                                                                                                      |
| `regression-7nov`                     | rejoue exactement les cas trouvés le 7 nov. (Progression sur Trame, 3 relances d'affilée, retrait qui lit, parure, péripétie sur case neutre, piste d'espèce, numérotation du voile) et doit passer au vert |

### 7.5 Exécution

```
npm run gl:sim -- --scenario <nom|all> --runs <n> --seed <s> [--parallel <k>] [--http <url>] [--captures]
```

- Par défaut, l'app est montée **en mémoire** (supertest, sans port) sur `foretmap_sim`, une partie par exécution, avec la graine `seed + i`.
- `--http` vise un serveur déjà lancé (local ou préproduction, jamais la prod : garde-fou 10).
- `--captures` prend, avec Playwright, les quatre écrans de la séance 2 (console du tour, équipe sur tablette, téléphone, projection).

### 7.6 Mesures et rapport

Le rapport va dans `reports/gl-sim/<date>-<scenario>/` (ignoré par git) : `summary.json`, `index.html` (page autonome, tokens de la charte G&L, graphiques SVG faits main, sans dépendance), `runs/*.json` (journal complet anonyme).

Pour chaque scénario, agrégé sur les exécutions (médiane, p10, p90) :

- **Rythme** : position de chaque équipe à chaque séance, séance d'arrivée au camp, écart entre la première et la dernière équipe après les séances 1 et 3, longueur des chaînes de relances.
- **Chasse** : pages trouvées, tenues et réparées par séance, séance du carnet complet, répartition froid / tiède / chaud / zone, fouilles perdues sous le voile.
- **Voile** : équipes sous le voile par séance, pages pâlies, effet d'Abri.
- **Économie** : bourses par élève en fin de chapitre (min, médiane, max, indice de Gini), flux par cause (depuis le livre), **indice Matthieu** = corrélation de Spearman entre la justesse de la persona et les ressources gagnées (hors Marché).
- **Sorts** : lancés, refusés par motif, coût moyen, gain net de l'équipe.
- **Marché** : dons, annonces, échanges conclus, parures.
- **Santé** : erreurs 4xx inattendues et 5xx, violations d'invariants (doivent être à 0), durée p50 et p95 par route.

Attendus par défaut (avertissements dans le rapport, pas des échecs, sauf invariants et 5xx) :

- chapitre en 4 à 6 séances (médiane) ;
- écart après la séance 1 ≤ 12 cases (p90) ;
- indice Matthieu < 0,3 ;
- Gini des bourses < 0,25 ;
- carnet complet pas avant la séance 3 (médiane) ;
- au moins une équipe sous le voile dans 50 % des parties `hybride-reference`.

### 7.7 CI

`npm run test:sim` (dans `npm test` ou un job séparé selon la durée) : `hybride-reference` et `tablette-reference`, 1 exécution, 3 séances, graine fixe. Il échoue sur toute violation d'invariant, toute erreur 5xx et tout mot interdit renvoyé à un élève, et produit le résumé dans les logs.

## 10. Étape 8 — Outils MCP G&L (connecteur `lib/mcp/`)

Le connecteur refuse `/api/gl/*` via `foretmap_api`. Ajoute des **outils de domaine G&L** (dossier `lib/mcp/domains/gl*.js`), avec la même journalisation, les mêmes droits et le même expurgeage que les outils existants :

| Outil                 | Accès              | Rôle                                                                                                                                                                                                                           |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gl_games`            | lecture            | parties (classe, chapitre, statut, profil, surface, tour, phase) ; filtres classe et statut                                                                                                                                    |
| `gl_game_state`       | lecture            | état complet d'une partie pour le MJ : équipes, positions, voile, carnet (sans polygones), tour, effets, retraits, bourses agrégées par équipe (pas par élève, sauf `detail: true` et `mcp.privacy_bypass`)                    |
| `gl_game_journal`     | lecture            | événements filtrés (types, tour, équipe), libellés comme dans l'app                                                                                                                                                            |
| `gl_game_diagnostic`  | lecture            | le diagnostic de l'étape 6 (invariants, livre, durées)                                                                                                                                                                         |
| `gl_settings`         | lecture / écriture | réglages `gameplay.*`, `modules.*`, `content.*` (lecture de `gl_settings` aujourd'hui refusée par `foretmap_sql_select`) ; écriture journalisée avec ancienne et nouvelle valeur                                               |
| `gl_tenir_catalogues` | lecture / écriture | comptes, empreintes base / dépôt, `sync` (`dryRun` par défaut)                                                                                                                                                                 |
| `gl_content_snapshot` | lecture            | instantané JSON du contenu G&L (format 7.1) → lien signé d'une heure, contrôlé sans personne ni secret                                                                                                                         |
| `gl_tour`             | écriture (MJ)      | gestes du prof sur une partie : ouvrir, phase, équipe suivante, lancer (physique ou libre avec motif), absences, fenêtre de fouille, dé gris, bilan Team Spirit ; chaque appel exige `gameId` et renvoie l'état après le geste |
| `gl_sim_reports`      | lecture            | liste et lecture des rapports `reports/gl-sim/` présents sur le serveur (vide en prod)                                                                                                                                         |

Corrige aussi deux défauts du masquage, qui rendent les exports inutilisables :

1. `lib/mcp/secretGuard.js › collectEnvSecretValues` masque toute valeur d'une variable dont le nom évoque un secret. Résultat : « production » et l'URL du site sont remplacés partout, y compris dans le contenu (« reproduction » devient « re[secret .env masqué] »). Masque seulement les valeurs qui ont l'allure d'un secret : au moins 12 caractères, pas un mot du dictionnaire `production|development|test|staging`, pas une URL `http(s)://` sans identifiants, pas un nom d'hôte. Garde toujours `SENSITIVE_ENV_KEYS`.
2. `lib/mcp/secretMask.js` : la clé `passTurn` est masquée en `****` (motif `pass(?:word|wd|phrase)?` sans borne). Ancre le motif sur des mots entiers (`password`, `passwd`, `passphrase`, `pass_hash`, `pin_hash`…) et ajoute un test où `passTurn`, `passable`, `passeur`, `passage` restent lisibles.
3. Test : un export de `gl_chapter_markers` et de `gl_species` ressort sans aucun `****` ni `[secret .env masqué]`.

Documente les outils dans `docs/MCP.md` (ou l'équivalent existant) et ajoute un prompt MCP guidé « diagnostiquer une partie G&L ».

## 11. Étape 9 — Docs et livraison

- `docs/GL_TENIR_A_DEUX.md` : sections synchronisation des catalogues, livre des ressources, invariants, diagnostic.
- `docs/GL_SIMULATION.md` (nouveau) : personas, scénarios, lecture du rapport, ajout d'un scénario.
- `docs/GL_TESTS.md`, `docs/API.md`, `CHANGELOG.md`, `env.local.example` (`GL_RANDOM_SEED`, `GL_SIM_ALLOW`, `GL_TENIR_SYNC`, plafond de connexion).
- Description de PR :
  - « choix faits sans demander » (§ 2) ;
  - tableau zone → espèces (§ 5.5) ;
  - **résumé du rapport de simulation** `hybride-reference`, `tablette-reference`, `classe-experte` et `regression-7nov` (20 exécutions chacun) : rythme, indice Matthieu, Gini, séance du carnet complet, violations = 0 ;
  - captures de l'étape 5.

## 12. Vérifications (toutes vertes avant la PR)

```
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npx playwright test e2e/gl-*.spec.js
npm run gl:sim:db
npm run gl:sim -- --scenario regression-7nov --runs 5 --seed 7
npm run gl:sim -- --scenario all --runs 3 --seed 1
```

Les commits de build (`dist`) suivent la règle de déploiement du dépôt.

## 13. Après le déploiement (à faire par Oliv, rappel en fin de PR)

1. Vérifier dans **Contenus → Chapitres → Catalogues Tenir à deux** : 35 zones (dont 1 inactive, `cz-p2-08`), 35 questions de lecture, 32 péripéties, 66 lignes d'Olu, 12 parures, 51 titres, 13 badges, 20 missions.
2. Mettre `FORETMAP_AUTH_RATE_LIMIT_PER_15MIN=300` dans le `.env` de prod si le défaut ne suffit pas.
3. Choisir le feuillet de `cz-p2-08`.
4. Relire le tableau zone → espèces.
