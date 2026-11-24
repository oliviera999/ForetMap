# Lot moteur-5 — Trame, Lumière, appareils

> Chantier G&L « décisions » · vague 1 · couloir moteur · charge moyenne · banc : seuils
> Branche : `claude/gl-decisions-moteur-5` · Attend : moteur-4 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Dans les défis de la Trame à relier (« les fils »), les cartes arrivent mélangées : relier chaque carte à sa
  voisine ne donne plus la solution.
- Un défi de la Trame réussi ne donne plus jamais une page vierge.
- Les défis de la Trame apportent à la Lumière un palier par chapitre au plus : la classe ne fait plus reculer le
  voile à coups de défis.
- Quand deux écrans d'une même équipe sont ouverts, Olu explique une fois qu'un seul écran joue à la fois.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 6 du prompt | 19/11 | Les cartes des « fils » sont mélangées côté serveur. | — |
| QV2 (addendum 1) | 24/11, 11 h 31 | Jamais de page vierge en récompense d'un défi de la Trame. | « 1. On garde 2. Réécris les 3. Ok » (sa réponse aux trois points posés à 11 h 31) |
| Décision 7 du prompt | 19/11 | La Trame apporte un palier de Lumière par chapitre au plus. | — |
| Décision 4 du prompt | 19/11 | La ligne d'Olu `olu-pf-main` est branchée. | — |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Le plafond de la Trame se compte dans une colonne nouvelle (`trame_total`), plutôt que par un recalcul depuis
  l'historique. C'est un changement de schéma que la décision 7 ne nomme pas.
- La page vierge est écartée par le code ; elle n'est pas passée inactive en base.
- Le texte de `olu-pf-main` est gardé tel qu'il est au catalogue.
- Pas de réglage nouveau pour le plafond : il vaut `lumiere_palier`.

## 3. Fichiers

**À toi**

- `lib/glTrameDefis.js`
- `lib/glTour.js` (`ajouterLumiereTx` seulement, l. 2342)
- `lib/glTenirOlu.js` (`PREMIERE_FOIS_CLES`, `PREMIERE_FOIS_EVENT_TYPES`, `clesPremiereFois`)
- `lib/glEquipeEtat.js` (le point d'accroche de la première main, l. 420-446)
- Tests : `tests/gl-trame-defis.test.js`, `tests/gl-tenir-plusieurs-appareils.test.js`,
  `tests/gl-ensemble-unifie-olu-premiere-fois.test.js`, `tests/gl-lumiere-palier.test.js` (créé par le lot moteur-1,
  s'il existe)

**Nouveaux**

- `migrations/<numéro pris à la fin>_gl_lumiere_trame_total.sql` (étiquette `mig-lumiere-trame`)
- `changelog.d/gl-decisions-moteur-5.md`, `docs/prompts/gl-decisions/rapports/moteur-5.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `data/gl/tenir/README.md` (l. 188) | La phrase « deux clés n'ont aucun évènement : `main` (en attente)… » : `main` a désormais le sien. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0), `docs/GL_DEFIS.md` | Section 9. |

**Ne touche pas**

| Fichier ou symbole | Lot qui le modifie |
| --- | --- |
| `routes/gl/lore.js`, `lib/glVoyageurPlume.js` (pseudo de l'auteur d'une Lettre) | contenu-2 |
| `lib/glFeuilletChapterPool.js` (les pages du copiste sorties du groupe de pages) | contenu-4 |
| `data/gl/tenir/olu-lignes.json` | personne dans ce lot : le texte de `olu-pf-main` ne change pas |
| `lib/glTour.js`, tout sauf `ajouterLumiereTx` | lots moteur-1 à moteur-4, déjà fusionnés |
| `src/gl/components/defis/*` (écrans des défis) | personne : l'écran suit l'ordre servi |

## 4. Étapes (un commit par étape, dans cet ordre)

**Banc d'abord** : passe « avant » (section 7).

### moteur-5.1 — Mélanger les cartes des « fils » (ex-étape 6)

- **Constat vérifié** (`lib/glTrameDefis.js`) :

  | Ligne | Requête | Défi |
  | --- | --- | --- |
  | 304 | `gl_trame_adaptation_cartes … ORDER BY ordre ASC` | « Les fils de l'adaptation » |
  | 130 | `gl_trame_fils_cartes … ORDER BY ordre ASC` (`loadFils`) | « Les fils cachés » |
  | 98 | `gl_trame_cartes … ORDER BY ordre ASC` | Retisser, La trame altérée |
  | 239, 259 | jeux et cartes de `ranger` | « Le bon rôle », « Le bon pays » |
  | 179 | `gl_trame_reparer_a_classer … ORDER BY ordre ASC` | Réparer la trame |

  Les cartes sont servies dans l'ordre du catalogue. Pour jungle, savane et sahara, relier chaque carte à sa
  voisine suffit. Pour `gl_trame_cartes`, l'ordre du fichier fait aussi les **niveaux** (les N premières cartes,
  `docs/GL_DEFIS.md`, l. 75-77) : ne mélange que l'ordre **servi**, une fois les cartes choisies.

- **Changement attendu** :
  1. Sers les cartes dans un **ordre mélangé déterministe**, avec pour graine la partie (ou la veillée), l'unité et
     l'élève ou l'équipe. Inspire-toi de `lib/glRandom.js` (`mulberry32`, l. 19). L'ordre reste le même au
     rechargement et sur tous les écrans d'une équipe.
  2. Il ne donne **jamais** la solution par voisinage : si le mélange met côte à côte deux cartes d'un lien attendu,
     décale.
  3. Le serveur juge toujours contre les liens du catalogue.
  4. Vérifie les autres défis servis en `ORDER BY ordre` (l. 98, 179, 239, 259). Même règle **quand l'ordre donne la
     solution** ; dis dans ton rapport lesquels tu as mélangés et lesquels non.
- **Textes** : aucun.
- **Tests** (`tests/gl-trame-defis.test.js`) : même graine → même ordre ; deux élèves → ordres différents, sur un
  échantillon ; pour jungle, savane et sahara, aucune paire de voisines n'est un lien attendu.
- **Critère d'acceptation** : sur l'écran « fils de l'adaptation », deux comptes d'élève ne voient pas le même
  ordre ; un rechargement ne change rien.

### moteur-5.2 — Jamais de page vierge en récompense de la Trame (ex-étape QV2 de l'addendum 1)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `lib/glTrameDefis.js › pageTirable` (l. 997) | Écarte les pages de zone de chasse, les modes `corbeau` et `carnet_route` (`MODES_HORS_DEFI`, l. 989), et les titres ou incipits qui portent un mot interdit ou un terme `secret`. **Pas les pages vierges.** |
  | `lib/glTrameDefis.js › pagesTirables` (l. 1008) | Lit le groupe de pages du chapitre par `resolveChapterFeuilletPool`. |
  | `lib/glLoreFeuillets.js › FEUILLET_SELECT` | Lit déjà `type` et `vierge`. |
  | Prod (24/11) | Quatre pages vierges actives entrent dans le groupe de pages de leur chapitre : `vierge-P1` (`jungle_afc`, `ordre_voyage` 1072), `vierge-P2` (`foret_mediterraneenne`, 2058), `vierge-P3` (`landes`, 3068), `vierge-P5a` (`toundra`, 4108). Toutes ont `type = 'vierge'` **et** `vierge = 1`. Un défi réussi peut donc donner une page blanche : une récompense qui ne contient rien. |

- **Changement attendu** :
  1. Dans `pageTirable`, avant les autres contrôles : une page dont `type` vaut `vierge`, ou dont la colonne
     `vierge` vaut 1, n'est jamais tirable. Complète le commentaire de la fonction : « jamais une page vierge (rien
     à lire, décision QV2) ».
  2. Rien d'autre : la page vierge garde ses autres chemins, ni données ni réglage ne changent, aucune migration.
- **Textes** : aucun.
- **Tests** (`tests/gl-trame-defis.test.js`, à côté du cas des pages écartées, vers la l. 684) : une page
  `type = 'vierge'` et une page d'un autre type avec `vierge = 1`, toutes deux en tête du voyage, ne sont jamais
  dans `pagesTirables` ; la page tirable suivante passe en tête.
- **Critère d'acceptation** : le test vert ; aucune donnée changée.
- **À savoir** : les pages du copiste en récompense sont réglées par le lot contenu-4, qui sort `type = 'copiste'`
  du groupe de pages. Rien à faire ici.

### moteur-5.3 — Lumière venue de la Trame : un palier par chapitre au plus (ex-étape 7)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `lib/glTrameDefis.js` (l. 1130-1138) | Chaque première réussite en mode équipe appelle `ajouterLumiereTx` avec `n: 10` et `source: 'defi_trame'`. |
  | `lib/glTour.js › ajouterLumiereTx` (l. 2342) | Lit `total` et `paliers_json` de `gl_game_lumiere` sous `FOR UPDATE`. Après le lot moteur-1, au palier, **un** palier est compté et la jauge repart à 0. |
  | `gl_game_lumiere` (`migrations/331_gl_tenir_tour.sql`, l. 72) | Colonnes `game_id`, `total`, `paliers_json`, `updated_at`. Pas de `trame_total` (ni en prod, ni au dépôt). |

- **Changement attendu** :
  1. Dans une partie (= un chapitre), le total apporté par `defi_trame` est plafonné à `lumiere_palier` (100 par
     défaut). Au-delà, la réussite garde tout le reste (première réussite, page, piste) mais n'ajoute plus de
     Lumière. Les cartes Team Spirit (`team_spirit`) et l'erreur d'Olu (`olu_corrige`) ne sont pas plafonnées.
  2. Stockage : colonne `trame_total INT NOT NULL DEFAULT 0` sur `gl_game_lumiere`, par la migration
     `mig-lumiere-trame` (section 5). Lis-la et écris-la sous le même `FOR UPDATE` que `total`. Un recalcul depuis
     l'historique seulement s'il est plus simple et aussi exact.
  3. Pas de réglage nouveau.
- **Textes** : aucun texte d'élève. Dans les règles, § 11 : « la Trame apporte au plus un palier par chapitre ».
- **Tests** : 11 réussites en mode équipe → 100 de Lumière venues de la Trame, pas 110 ; avec des cartes en plus,
  le palier suivant reste atteignable. Les cas du lot moteur-1 (jauge qui repart à 0) restent verts.
- **Critère d'acceptation** : dans une partie, la somme des apports `defi_trame` ne dépasse jamais
  `lumiere_palier`.
- **Banc** : relance-le après cette étape et note la série « après étape 7 ».

### moteur-5.4 — Brancher `olu-pf-main` (ex-étape 4)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `lib/glTenirOlu.js › PREMIERE_FOIS_CLES` (l. 115, clé `main` l. 135-136) | La clé `main` est déclarée, avec le commentaire « la ligne attend le lot « plusieurs appareils » ». Aucun évènement ne la porte. |
  | `tests/gl-ensemble-unifie-olu-premiere-fois.test.js` (l. 190-193) | Affirme que `main` et `comptes` sont les deux clés sans évènement. |
  | `lib/glEquipeEtat.js` (l. 420-446) | `mainChangee` y est calculée et `signalerEquipe(gameId, teamId, 'main')` appelé, avec le suivi des écrans connectés. |
  | `data/gl/tenir/olu-lignes.json` (l. 802) | `olu-pf-main`, `seance_escalier: 0`, sans `{equipe}`. |

- **Changement attendu** :
  1. Retire le commentaire d'attente de la clé `main`.
  2. Évènement déclencheur : la **première main prise** dans la partie par un écran d'une équipe, alors qu'au moins
     un **autre** écran de la même équipe est connecté, en surface tablette (ou une ancienne partie hybride). Au
     tableau, rien.
  3. La ligne se dit **une fois par partie** (pas de `{equipe}`), avec la mémoire `gl_game_olu_premieres`. Elle
     passe par le chemin des autres « première fois » (`PREMIERE_FOIS_EVENT_TYPES`, `clesPremiereFois`). Ajoute un
     type d'évènement si besoin.
  4. Point d'accroche : `lib/glEquipeEtat.js`, là où `mainChangee` est calculée. Vérifie et choisis ; dis ton choix
     dans ton rapport.
- **Textes** : garde celui du catalogue, sans le changer : « Un seul écran joue à la fois. Vous voyez ce que fait
  votre camarade ; à la prochaine action, cet écran reprend la main. »
- **Tests** : deux écrans, première main → la ligne est dite une fois ; un seul écran → rien ; surface tableau →
  rien ; deuxième main → rien. Le test des clés sans évènement (l. 190-193) n'attend plus que `comptes`.
- **Critère d'acceptation** : sur deux écrans d'une même équipe, la ligne d'Olu apparaît à la première prise de
  main, et plus jamais dans la partie.

## 5. Migration

| Point | Valeur |
| --- | --- |
| Étiquette | `mig-lumiere-trame` (numéro de fichier pris à la fin, voir les règles communes) |
| Table | `gl_game_lumiere` (créée par `migrations/331_gl_tenir_tour.sql`) |
| Écriture | `ADD COLUMN trame_total INT NOT NULL DEFAULT 0`, seulement si la colonne manque (modèle : `migrations/338_gl_tenir_equilibrage.sql`, l. 61-64). Aucune donnée, aucun texte. |
| Prod au 24/11 | La colonne n'existe pas : la migration l'ajoutera. |
| Base neuve | Même chose. |
| Parties en cours | La colonne vaut 0 : ce que la Trame a déjà apporté avant la migration n'est pas recompté. Dis-le dans ton rapport. |

`sql/schema_foretmap.sql` ne porte pas les tables `gl_game_*` : rien à y faire.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire. Ce lot ne change aucun catalogue.

## 7. Vérifications propres au lot

- **Banc, régime « seuils »**, avec les trois commandes des règles communes : une passe **avant** toute
  modification, une passe **après l'étape moteur-5.3** (« après étape 7 »). À noter : les **reculs de voile dus à la
  Lumière, par chapitre**. Compare à la série « après étape 2 » du rapport du lot moteur-1
  (`docs/prompts/gl-decisions/rapports/moteur-1.md`). Une baisse s'explique par la décision 7 : dis-le. Une hausse
  est une alerte.
- Note aussi les pages gagnées par un défi, par chapitre : l'étape moteur-5.2 peut en retirer une (la page vierge).
- e2e (sous le verrou) : les specs G&L des défis de la Trame et `e2e/gl-tenir-tablettes.spec.js`.
- Captures (`docs/captures/gl-decisions/moteur-5/`) : l'écran « fils de l'adaptation », avant et après (deux
  comptes, deux ordres) ; la ligne d'Olu de la main sur une tablette, une seconde tablette de la même équipe
  ouverte.

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| Ordre des cartes des « fils » | ordre du catalogue | ordre mélangé, stable par partie, unité et élève ou équipe |
| `pagesTirables` | peut contenir une page vierge | jamais |
| Lumière apportée par `defi_trame` | 10 par première réussite d'équipe, sans plafond | plafonnée à `lumiere_palier` par partie |
| `gl_game_lumiere` | `total`, `paliers_json` | plus `trame_total` |
| Clés « première fois » sans évènement | `main`, `comptes` | `comptes` |

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) : § 11, l. 239 (« un défi de la Trame réussi en mode équipe ajoute
  10 ») : ajouter « la Trame apporte au plus un palier par chapitre » ; paragraphe « Défis de la Trame » (§ 15,
  l. 321) : les cartes sont servies mélangées, un défi ne donne jamais de page vierge.
- `docs/GL_DEFIS.md` : l'ordre servi des cartes ; `pageTirable`.
- `data/gl/tenir/README.md`, l. 188 : la clé `main` a son évènement.
- `docs/API.md` : seulement si la réponse d'une route de défi change de forme.
- `.claude/skills/gl-*` : une phrase devenue fausse, s'il y en a.
- Pour le § 0 des règles (dans ton rapport) : « 19/11 : les cartes des fils sont mélangées par le serveur. » ;
  « 19/11 : la Trame apporte un palier de Lumière par chapitre au plus. » ; « 19/11 : la ligne d'Olu de la main est
  branchée. » ; « 24/11 : un défi de la Trame ne donne jamais de page vierge. »

## 10. Hors périmètre

| Ce que ce lot ne fait pas | Lot qui le fait |
| --- | --- |
| Pseudo de l'auteur d'une Lettre caché en projection (ex-étape 10) | contenu-2 |
| Jauge de Lumière qui repart à 0 | moteur-1 (déjà fait) |
| Pages du copiste hors du groupe de pages | contenu-4 |
| Questions de validation des pages vierges, autres positions de l'audit des questions | hors chantier |
| Plafond et prix de la bourse | hors chantier |

## 11. Pour Oliv

**À relire**

- Aucun texte nouveau. `olu-pf-main` garde son texte : « Un seul écran joue à la fois. Vous voyez ce que fait votre
  camarade ; à la prochaine action, cet écran reprend la main. »
- Le rapport du lot dira quels défis ont été mélangés en plus des « fils » (Retisser, « Le bon rôle », « Le bon
  pays », Réparer), et lesquels non.

**À faire après la vague**

- Rien à synchroniser (aucun catalogue changé).
- Vérifier sur la classe de démonstration : deux écrans pour une équipe, la ligne d'Olu de la main ; un défi « fils
  de l'adaptation » ouvert sur deux comptes.
- Les parties en cours gardent la Lumière déjà gagnée ; le plafond de la Trame y repart de 0.
