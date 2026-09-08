# GL — Composition automatique des équipes au fil des chapitres (conception)

> **Statut : lots v1, v2 et v3 livrés** (septembre 2026), précédés d'un **lot 0** qui a
> supprimé le pointeur global `gl_players.team_id` (§ 7.1, `lib/glPlayerMembership.js`). Ce
> document reste la spécification de référence ; le prompt d'exécution initial est
> [GL_EQUIPES_AUTO_PROMPT.md](GL_EQUIPES_AUTO_PROMPT.md). Le comportement livré est décrit
> côté utilisateurs dans `docs/reference/gl/chapitres-et-progression.md` (étape 2) et
> `guide-du-mj.md` ; l'architecture dans `GL_ARCHITECTURE.md`, l'API dans `API.md`.
>
> **Écarts assumés entre la conception et le code :**
>
> - § 10.5 — pas de glisser-déposer (aucune bibliothèque DnD dans le projet) : un
>   **sélecteur « déplacer vers… »** par joueur (clavier, tactile ≥ 44 px) le remplace ; un
>   déplacement manuel vaut épingle. Le DnD natif reste une amélioration possible.
> - § 4.2 / § 9 — les recettes de profil sont **désactivables par l'admin**
>   (`gameplay.team_composition_profile_recipes_enabled`, défaut `true`) et `homogeneous` est
>   **refusée (`409 HOMOGENEOUS_WITH_SCORING`)** quand le score par équipe est actif.
> - § 2 — les statuts de partie sont `draft` / `live` / `paused` / `ended` (le document
>   employait « finished »).
> - § 4.4 — seules les mascottes **typées** (catalogue GL, 7 gnomes / 6 licornes) sont
>   utilisées ⇒ plafond de 13 équipes ; au-delà le nombre d'équipes est réduit et signalé.
> - § 6 — la politique de classe ne déclenche rien seule : elle **choisit la recette par
>   défaut** de l'aperçu quand le MJ n'en impose pas ; les épingles ne sont jamais persistées.
> - § 7.1 — la colonne `gl_players.team_id` est **conservée** (plus écrite ni lue) ; sa
>   suppression physique reste à planifier dans une migration dédiée.

## 1. Le besoin

Une partie GL (`gl_games`) = **une classe + un chapitre**. Les équipes (`gl_teams`) sont
**propres à la partie** : à chaque nouveau chapitre, le MJ recrée tout à la main — nom,
peuple gnome/licorne, mascotte, couleur — puis répartit les élèves. Sur un voyage de cinq
plateaux, c'est cinq fois le même travail, et rien ne garantit que les élèves changent de
camarades d'un chapitre à l'autre.

L'objectif est de **composer les équipes d'un chapitre en un clic**, avec un mode
aléatoire de référence et, à mesure que la classe accumule des traces de jeu, des
critères tirés du profil des joueurs.

## 2. L'existant (état des lieux vérifié)

| Brique                                                           | Emplacement                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Création d'équipe **manuelle** (nom, peuple, mascotte, couleur)  | `routes/gl/games/teams.js` — `POST/PUT/DELETE /api/gl/games/:id/teams[/:teamId]`             |
| Répartition **aléatoire équilibrée** dans des équipes existantes | `lib/glRoster.js` → `computeBalancedAssignments`, `autoAssignRosterTx`                       |
| Route de répartition                                             | `POST /api/gl/games/:id/roster/auto-assign` (`routes/gl/games/roster.js`)                    |
| Écran MJ « Équipes »                                             | `src/gl/components/mj/GLGameMasterConsoleTeams.jsx` + `admin/GLGameRosterPanel.jsx`          |
| Tests de référence                                               | `tests/gl-roster-balance.test.js` (pur, RNG seedé), `tests/gl-games-roster.test.js` (routes) |

**Ce qui manque** : la création des équipes elles-mêmes (nombre, peuples, noms, couleurs,
mascottes) et toute forme de mémoire d'un chapitre à l'autre. `autoAssignRosterTx` ne sait
que remplir des équipes déjà créées, sans historique ni critère.

## 3. Le profil joueur : six axes, aucun recueil supplémentaire

Tous les signaux existent déjà en base. Chaque axe est un score **normalisé 0–1 relatif à
la classe** — jamais une note absolue, jamais une donnée persistée (calcul à la volée).

| Axe                           | Ce qu'il capte            | Sources (tables existantes)                                                                                       |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Savoir** (S)                | maîtrise des contenus     | `gl_qcm_attempts` (`reader_user_type='gl_player'`, `is_correct`, `answered_at`), `gl_learning_acknowledgements`   |
| **Exploration** (E)           | va chercher, découvre     | `gl_player_feuillet_states` (`acquired_via='decouverte'`), déplacements dans `gl_game_events`                     |
| **Échange** (É)               | joue avec les autres      | `gl_market_trades` (`status='completed'`) + `gl_market_trade_sides`, `gl_market_trade_messages`, `gl_forum_posts` |
| **Générosité / vitalité** (G) | dépense pour le collectif | `gl_spell_cast_contributions` (cœurs/gemmes engagés), flux déjà agrégés par `lib/glPlayerStats.js`                |
| **Initiative** (I)            | propose, prend le lead    | `gl_action_requests` (émises / `status='accepted'`), coordination de sorts (`updated_by_player_id ≠ player_id`)   |
| **Assiduité** (A)             | est présent et joue       | `gl_players.last_seen`, `is_active`, densité d'événements par partie                                              |

Deux dérivées, les plus utiles pour la question posée :

- **Matrice de co-équipiers** — sur les parties passées de la classe
  (`gl_team_members` ⋈ `gl_games` sur `class_id`) : « qui a déjà été avec qui, combien de
  fois, il y a combien de chapitres ». C'est elle qui permet le brassage réel.
- **Historique de peuple** — qui a été gnome / licorne, et combien de fois d'affilée.

### 3.1 Garde-fou statistique obligatoire (shrinkage)

Au chapitre 1 il n'y a **aucune** donnée ; au chapitre 2, presque rien. Un joueur avec
quatre QCM au compteur ne doit pas être classé sur un coup de chance. Tout axe est donc
ramené vers la moyenne de classe proportionnellement au volume observé :

```
score_ajusté = (n · score_brut + k · moyenne_classe) / (n + k)      avec k = 10
```

**Conséquence assumée** : les recettes fondées sur le profil ne deviennent significatives
qu'à partir du 3ᵉ chapitre environ. Le chapitre 1 est nécessairement aléatoire — ce n'est
pas un défaut, c'est la seule chose honnête à faire.

## 4. Les recettes de composition

| Code            | Recette                 | Principe                                                                               | Usage visé                                | Lot |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- | --- |
| `random`        | **Aléatoire**           | tirage seedé, effectifs égalisés à ±1                                                  | chapitre 1, séance découverte             | v1  |
| `random_memory` | **Aléatoire à mémoire** | idem, mais pénalise les paires ayant déjà coéquipé                                     | **défaut recommandé** dès le chapitre 2   | v1  |
| `carry_over`    | **Reconduction**        | recopie les équipes du chapitre précédent (noms, peuples, couleurs, mascottes)         | continuité narrative sur un même plateau  | v1  |
| `mixed`         | **Mixte / hétérogène**  | égalise la force moyenne entre équipes (variation _inter_-équipes minimale)            | chapitre compétitif, scores activés       | v2  |
| `roles`         | **Complémentarité**     | chaque équipe reçoit un dominant de chaque axe (savant, éclaireur, négociant, gardien) | chapitre riche en marché et sortilèges    | v2  |
| `homogeneous`   | **Groupes de besoin**   | équipes de niveau proche (variation _intra_-équipe minimale)                           | atelier de remédiation — **jamais** scoré | v2  |

### 4.1 Un seul moteur, des jeux de poids

Les recettes ne sont **pas** six algorithmes. Elles sont six presets d'une même fonction
de coût, minimisée par recherche locale :

```
coût(composition) =
    w_size      · Σ |effectif(équipe) − effectif_cible|
  + w_repeat    · Σ poids_historique(paire) pour chaque paire réunie
  + w_inter     · variance inter-équipes du score composite      (recette « mixte »)
  + w_intra     · Σ variance intra-équipe du score composite     (recette « groupes de besoin »)
  + w_roles     · Σ rôles manquants par équipe                   (recette « complémentarité »)
  + w_vitality  · Σ max(0, plancher − (cœurs + gemmes) de l'équipe)
  + ∞          · violations de contraintes dures (verrous MJ)
  + ε          · aléa seedé (départage les optima équivalents)
```

`random` = tous les poids à 0 sauf `w_size`. `random_memory` = `w_size` + `w_repeat`.
Ajouter une recette en v2 = **ajouter un preset de poids**, pas du code.

Recherche locale : départ = tirage aléatoire équilibré (réutilise
`computeBalancedAssignments`), puis échanges de deux joueurs tant que le coût baisse
(première amélioration, ordre des paires tiré au sort avec la même graine ; borne dure de
2 000 itérations). Pour 40 élèves c'est instantané, et **déterministe à graine donnée** —
donc testable exactement comme `tests/gl-roster-balance.test.js`.

### 4.2 Poids de l'historique

Pour une paire de joueurs, sur les parties passées de la classe, du plus récent au plus
ancien (rang 0, 1, 2…) :

```
poids_historique(paire) = Σ  0.8^rang   pour chaque partie passée où la paire était réunie
```

Avoir été ensemble au chapitre précédent pèse donc plus lourd qu'il y a quatre chapitres :
le brassage est encouragé sans devenir une interdiction absolue.

## 5. Contraintes transverses (toutes recettes)

| Contrainte                    | Règle                                                                                                                                    | Dure / souple |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Taille cible**              | le MJ saisit une taille d'équipe (défaut **4**) ; le nombre d'équipes en découle : `clamp(round(actifs / taille), 2, plafond_mascottes)` | dure          |
| **Effectifs**                 | écart maximal de 1 entre équipes                                                                                                         | dure          |
| **Équilibre gnome / licorne** | alternance des peuples ; au moins un de chaque dès 2 équipes                                                                             | dure          |
| **Plafond mascottes**         | une mascotte distincte par équipe, filtrée par peuple ; le catalogue borne le nombre d'équipes                                           | dure          |
| **Joueurs inactifs**          | `is_active = 0` exclus par défaut, réintégrables par le MJ                                                                               | souple        |
| **Rotation des peuples**      | éviter le même peuple plus de 2 chapitres d'affilée                                                                                      | souple (v2)   |
| **Plancher de vitalité**      | éviter l'équipe entièrement à 0 cœur / 0 gemme, incapable de lancer quoi que ce soit                                                     | souple (v2)   |
| **Verrous MJ**                | « toujours ensemble » / « jamais ensemble » / « verrouillé dans cette équipe »                                                           | dure (v2)     |

> ⚠️ **L'équilibre des peuples n'est pas cosmétique.** `gl_spells.caster_kind`
> (`'any' | 'gnome' | 'unicorn'`, migration 173) restreint le lancement de certains
> sortilèges à un peuple. Une partie composée uniquement de gnomes rend **inutilisables**
> tous les sorts `unicorn` du chapitre. C'est un incident de séance, pas une préférence.

## 6. Politique inter-chapitres

Trois politiques, à choisir au niveau de la classe (v2 pour la persistance du réglage ; en
v1 le MJ choisit la recette à chaque partie) :

- **Reconduction** (`carry_over`) — le chapitre N+1 recopie les équipes du chapitre N.
  Continuité narrative maximale ; fige les affinités.
- **Rebrassage à chaque chapitre** (`random_memory`) — **défaut recommandé**.
- **Rebrassage par plateau** — les équipes tiennent le temps d'un des cinq plateaux du
  voyage de Sélène (`gl_chapters.plateau_number`), puis on rebat.

Ce qui traverse déjà les chapitres sans rien faire : la **vitalité** (cœurs et gemmes,
portés par `gl_players`) et les **feuillets** (`gl_player_feuillet_states`, par joueur).
Ce qui repart de zéro : le **score d'équipe** (`gl_team_scores`, clé `(game_id, team_id)`).
Ce que `carry_over` fait survivre : la **bannière** — nom, couleur, mascotte, peuple.

**Indicateur à afficher au MJ** : le _taux de brassage cumulé_ de la classe — pourcentage
de paires d'élèves ayant déjà été coéquipières au moins une fois. Il transforme un réglage
abstrait en objectif lisible sur l'année.

## 7. Pièges repérés dans le code actuel

Trois points relevés en lecture du code, à traiter explicitement.

1. **`gl_players.team_id` est un pointeur global, pas par partie.** L'appartenance réelle
   est portée par `gl_team_members` (clé primaire `(game_id, player_id)`), mais
   `assignPlayerToTeamTx` écrit **aussi** `gl_players.team_id`. Préparer le chapitre N+1
   pendant que le N tourne écrase donc le pointeur de la partie en cours. Ce défaut est
   **préexistant** (le panneau de répartition manuel le déclenche déjà) : la v1 ne le
   corrige pas en douce, elle **avertit** (`warnings: ['ANOTHER_GAME_LIVE']`) et le
   laisse en suivi T1.
2. **`grantStartingFeuilletsToTeam`** est appelé à la création d'équipe quand la partie est
   `live` ou `paused` (`routes/gl/games/teams.js`) : composer sur une partie démarrée
   distribuerait des lots d'ouverture en double. → **la composition n'est autorisée que sur
   une partie en `draft`** (409 sinon).
3. **`DELETE /teams/:teamId` renvoie 409 si l'équipe a des membres.** Une recomposition en
   mode « remplacer » doit donc désassigner puis supprimer **dans la même transaction**.

## 8. Empreinte technique de la v1

**Aucune migration.** C'est un choix : la v1 ne persiste ni profil, ni réglage de classe,
ni verrou MJ. Elle lit des tables existantes, écrit dans `gl_teams` / `gl_team_members` par
les chemins déjà éprouvés, et journalise dans `gl_game_events`
(`event_type = 'teams_composed'`, `payload_json` = recette, graine, poids, explication).
Bénéfice collatéral : aucun risque de collision de numéro `NNN_` avec une PR parallèle
(cf. `.cursor/rules/foretmap-pr-merge-conflict.mdc`).

Les tables nécessaires aux lots ultérieurs (verrous d'appariement par classe, politique de
rebrassage) ne seront introduites qu'au moment où elles servent.

## 9. Garde-fous pédagogiques (élèves mineurs)

- Les scores de profil ne sont **jamais** visibles côté élève, ni sous forme de note, ni
  sous forme de libellé d'axe. Côté MJ, l'aperçu affiche une justification, pas un
  classement : _« moyenne QCM proche entre les 4 équipes · 6 binômes inédits · aucune paire
  répétée »_.
- La recette `homogeneous` reste hors des séances scorées, et le vocabulaire d'interface ne
  doit contenir ni « niveau », ni « fort », ni « faible ».
- Chaque composition appliquée est journalisée (recette, graine, poids) : un MJ doit
  pouvoir expliquer à un élève pourquoi il est dans cette équipe.
- Les scores dérivés se calculent à la volée, **sans table de profilage** : pas de « fiche
  élève » qui traîne, rien de plus à purger.
- Aucun signal ForetMap ne traverse la frontière produit pour alimenter un profil GL,
  même via `linked_foretmap_user_id` (isolement GL, `.cursor/rules/foretmap-gl.mdc`).

## 10. Parcours MJ visé

1. Console MJ → onglet **Parties** → créer la partie (classe + chapitre) : elle naît en
   brouillon.
2. Onglet **Équipes** → bouton **« Composer automatiquement »**.
3. Dialogue : taille d'équipe cible · recette (3 cartes en v1) · graine affichée ·
   inclure/exclure les joueurs inactifs.
4. **Aperçu** : les équipes proposées, avec nom, peuple, couleur, mascotte, membres, et un
   bandeau d'explication par équipe. Rien n'est encore écrit.
5. Le MJ **ajuste** (glisser-déposer), **régénère** (nouvelle graine) ou **applique**.
6. À l'application : équipes créées, joueurs affectés, événement journalisé.

La proposition est **révisable, jamais un fait accompli** — c'est la condition pour qu'un
professeur fasse confiance à la fonctionnalité.

## 11. Découpage en lots

| Lot    | Contenu                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1** | Moteur pur + historique de co-occurrence · recettes `random`, `random_memory`, `carry_over` · 2 routes (aperçu / application) · dialogue MJ · nommage, couleurs, mascottes automatiques · tests · doc |
| **v2** | Axes de profil (S, E, É, G, I, A) avec shrinkage · recettes `mixed`, `roles`, `homogeneous` · curseurs de poids avancés                                                                               |
| **v3** | Verrous d'appariement par classe · politique de rebrassage persistée · rotation des peuples · plancher de vitalité · indicateur de brassage cumulé                                                    |

## 12. Arbitrages (tranchés à la livraison)

- [x] 1. Taille d'équipe par défaut **4**, désormais réglable **par classe**
      (`gl_classes.team_size_default`, lot v3).
- [x] 2. Composition réservée aux parties en brouillon (`409 GAME_NOT_DRAFT`).
- [x] 3. Pointeur global `gl_players.team_id` : **corrigé tout de suite** (lot 0) — plus
      écrit ni lu, appartenance résolue depuis `gl_team_members` par partie active
      (live > paused > draft > ended). Colonne conservée, suppression physique à planifier.
- [x] 4. Nommage automatique puisé dans le chapitre (**titre, biomes, plateau**), repli sur
      des racines neutres puis « Équipe N ».
- [x] 5. La reconduction `carry_over` copie aussi les **mascottes** (et noms, couleurs,
      peuples) ; les nouveaux joueurs rejoignent les équipes les moins fournies.
