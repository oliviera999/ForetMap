# Lot ecrans-1 — Portes et surfaces, bilan Team Spirit, onglets des biomes, message d'état

> Chantier G&L « décisions » · vague 1 · couloir écrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-1` · Attend : rien · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Le prof ne peut plus, d'un clic ou par l'API, faire retomber une partie dans l'ancien jeu « classique ».
- Les sélecteurs de surface ne proposent plus que « Tablettes » et « Tableau ».
- Le bilan Team Spirit rouvert montre les cartes déjà retirées : un second enregistrement n'efface plus rien.
- Page « Nature » : sur un plateau à deux biomes, chaque onglet montre le texte de son biome.
- Quand deux appareils d'une équipe jouent en même temps, le second lit « L’équipe vient de jouer. Voici où vous en
  êtes. ». Une base neuve garde hors tirage les questions déjà sorties du tirage en prod.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 16 du prompt | 23/11 | « Tenir à deux » est **le** jeu de G&L : plus aucune porte vers le jeu classique depuis l'interface ou l'API de partie. Le code du classique sera retiré après deux séances (hors chantier). | — |
| Décision 25 du prompt (« S2 ») | 23/11 soir | Deux surfaces : « Tablettes » et « Tableau ». L'hybride sort des sélecteurs ; le moteur garde la valeur pour les anciennes parties. | — |
| Décision 14 du prompt | 19/11 | Les questions remplacées par les zones restent hors tirage, même sur une installation neuve. | — |
| Décision 34 du prompt (part « liste d'import ») | 24/11 | Dix questions de case qui demandent le nom d'une espèce peinte sur le plateau sortent du tirage. Fait en prod le 24/11 ; ce lot l'écrit dans l'import pour une base neuve. | — |
| Correctif issu de l'audit des écrans du 19/11 (sans numéro de décision) | 19/11, repris le 23/11 | Le formulaire du bilan Team Spirit relit ce qui est enregistré. | — |
| Décision B1 du prompt | 24/11 | Bug des biomes : sur un plateau à deux biomes, chaque onglet affiche le texte (biotope et biocénose) de **son** biome. Correctif d'affichage, aucune donnée changée. | — |
| Décision 13 du prompt | 19/11 | Le message d'état périmé devient « L'équipe vient de jouer. Voici où vous en êtes. » | — |

**Choix par défaut posés par Claude** (appliqués sans demander ; Oliv peut les retirer ; liste-les dans ton rapport) :

- `gameplay.tenir_enabled` reste au registre (défaut `true`) mais sort de l'écran des réglages.
- La valeur `hybride` reste dans le moteur (anciennes parties) et sort des sélecteurs, sans migration : aucune partie
  hybride en prod au 24/11 (parties « Tenir » : `tableau`, `tablette`, `tableau`, `tableau`).
- Bilan Team Spirit ancien sans liste de cartes : les retraits sont reconstitués dans l'ordre du panneau et marqués
  « Bilan déjà enregistré : à vérifier ».
- Onglets des biomes : le titre de biome qui redit exactement le nom de l'onglet (« Savane », « Taïga ») est retiré ;
  les autres (« Le Sahara », « Toundra — été polaire », « Toundra — nuit polaire ») restent ; « La limite des arbres »
  reste dans l'onglet de la taïga ; « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » sont
  recopiés dans chaque onglet (seuls séparateurs visibles).
- Onglets des biomes : la regex `REDUNDANT_HEADING_RE` ne change pas ; un doublon possible d'une image du catalogue
  dans un onglet se constate après fusion et ne se corrige pas ici.

## 3. Fichiers

**À toi** (vérifiés sur `main` `d65dca4`) :

- `src/gl/components/settings/GLTenirSettings.jsx`, `tests-ui/gl/GLTenirSettings.test.jsx`
- `src/gl/components/mj/GLTenirProfilPanel.jsx`
- `src/gl/components/mj/GLTeamSpiritPanel.jsx`, `tests-ui/gl/GLTeamSpiritPanel.test.jsx`
- `src/gl/utils/glEcosystemSections.js`, `src/gl/utils/glEcosystemMarkdown.js` (un commentaire),
  `tests-ui/gl/glEcosystemSections.test.js`, `tests-ui/gl/GLEcosystemsView.test.jsx`
- `tests/gl-tenir-relecture.test.js`, `tests/gl-qcm-import-usage-tenir.test.js`,
  `tests/gl-tenir-plusieurs-appareils.test.js`
- `tests-ui/gl/GLTenirEcranEquipe.test.jsx`, `tests-ui/gl/GLTenirEquipeView.test.jsx`, `tests-ui/gl/glTeamSession.test.js`,
  `tests-ui/gl/glTenirMoment.test.js` (une chaîne attendue chacun, étape ecrans-1.6)
- `e2e/gl-tenir-tablettes.spec.js` (une chaîne attendue, ligne 707)
- Docs : `docs/API.md`, `docs/GL_TENIR_A_DEUX.md`, `docs/GL_GAMEPLAY_PRESETS.md`, `docs/GL_TENIR_A_DEUX_REGLES.md`
  (hors § 0), et dans `docs/reference/gl/` : `guide-du-mj.md`, `economie-marche-sorts.md`, `roles-et-connexion.md`
  (seulement les phrases nommées plus bas).

**Nouveaux** :

- `tests-ui/gl/GLTenirProfilPanel.test.jsx` (aucun test de ce panneau n'existe sur `main`).
- `changelog.d/gl-decisions-ecrans-1.md`, `docs/prompts/gl-decisions/rapports/ecrans-1.md`,
  `docs/captures/gl-decisions/ecrans-1/`.

**D'un autre couloir, modification minimale permise** :

| Fichier | Ce que tu y fais, et rien d'autre |
| --- | --- |
| `routes/gl/games/tenir.js` (route `PUT /games/:id/tenir/profil`) | Refuser `profil: null` (étape ecrans-1.1). |
| `lib/glQcmImport.js` (couloir contenu) | La liste `QUESTIONS_REMPLACEES_PAR_ZONES` et son compteur (étape ecrans-1.3). |
| `src/shared/glMainCore.js` (ligne 35) | Le texte de `MESSAGE_ETAT_PERIME` (étape ecrans-1.6). Le miroir `lib/shared/glMainCore.js` ne s'édite pas à la main : régénère-le (`npm run sync:shared-cores`, ou `npm run build`) et committe-le. |
| `src/gl/hooks/useGlTenirEquipe.js` (ligne 9) | Le commentaire qui cite l'ancien message. |
| `src/gl/utils/glTenirMoment.js` (ligne 304) | La JSDoc de `etatPerime`, rien d'autre : les lots ecrans-2, moteur-4 et ecrans-4 y travaillent après toi. |
| `src/gl/components/mj/GLTourScreen.jsx` (montage de `GLTeamSpiritPanel`, ligne 715) | Passer deux props, `gameId` et `roundNumber`. Rien d'autre : les lots moteur-3 et ecrans-4 y travaillent après toi. Dis-le dans ton rapport. |

**Ne touche pas** :

- `src/gl/components/GLGameBoard.jsx`, `src/gl/hooks/useGLMarkerArrival.js` (lots ecrans-3 puis ecrans-4).
- `src/gl/components/tenir/GLProjectionView.jsx`, `src/gl/components/tenir/GLTenirEcranEquipe.jsx` (lots ecrans-2 puis
  ecrans-4).
- `lib/glTour.js` et tout le moteur (couloir moteur). `lib/glSettings.js` (`TENIR_SURFACES`),
  `src/shared/glTenirPermissionsCore.js`, les branches `hybride` de `GLTourScreen.jsx` et les tests du moteur qui
  jouent l'hybride.
- `src/gl/components/tenir/GLTenirEquipeView.jsx` : le lot ecrans-4 le supprime. Tu n'alignes que **son test**
  (chaîne du message), pour que `npm run test:ui` reste vert jusque-là.
- `src/gl/components/GLEcosystemsView.jsx`, `buildEcosystemSections`, `GLLearnAndImport`.
- `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`, `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md` (documents historiques : ils
  gardent l'ancien message).

## 4. Étapes (un commit par étape, dans cet ordre)

### ecrans-1.1 — « Tenir à deux », seul jeu : fermer les portes vers le classique (ex-étape 14)

**Constat vérifié** (`main` `d65dca4`) :

| Où | Constat |
| --- | --- |
| `lib/glTenir.js` › `isTenirGame(settings, game)` (ligne 136) | Une partie est « Tenir » si le réglage `gameplay.tenir_enabled` est vrai **et** si `gl_games.tenir_profil` n'est pas nul. |
| `src/gl/components/settings/GLTenirSettings.jsx` (ligne 12) | La case « Mouture « Tenir à deux » active (nouvelles parties) » coupe `gameplay.tenir_enabled` d'un clic. Le libellé ment : la coupure fait basculer **toutes** les parties en cours en classique. `git grep tenir_enabled -- src` : aucun autre écran ne l'expose. |
| `routes/gl/games/tenir.js` (lignes 117-124) | `PUT /api/gl/games/:id/tenir/profil` accepte `profil: null` = retour aux règles classiques. Message d'erreur actuel : « Profil invalide (complet, court, ou null) ». |
| `tests/gl-tenir-relecture.test.js` (ligne 283) | Le test « profil `null` : la partie revient aux règles classiques, puis `complet` la rétablit » garantit ce retour. |
| `routes/gl/games.js` (ligne 277) | La création d'une partie pose `complet` si le réglage est actif. |
| `docs/reference/gl/guide-du-mj.md` (lignes 296-298) | Le guide promet un retour « aux règles classiques (profil « aucun ») » depuis la console, qui ne l'offre plus. |

**Changement attendu** :

1. Retire la case `gameplay.tenir_enabled` de `GLTenirSettings.jsx` (et de tout autre écran qui l'exposerait : dis
   où). La clé reste au registre avec son défaut `true`.
2. `PUT /tenir/profil` refuse `profil: null` : 400, « Profil invalide (complet ou court) » ; commentaire et message
   d'erreur alignés.
3. Création de partie : inchangée. Pas de migration, pas d'écriture sur les parties existantes.
4. Le reste du classique ne bouge pas (`isTenirGame`, profils de séance hérités, `turns_enabled`,
   `player_actions_enabled`, score d'équipe, cœurs, plateau découverte). Aucun texte n'annonce ce retrait aux élèves.
5. Docs (voir section 9).

**Textes** (prof et API, aucun texte d'élève) : « Profil invalide (complet ou court) ».

**Tests** :

- `tests/gl-tenir-relecture.test.js` : le test de la ligne 283 devient « profil `null` → 400, `tenir_profil`
  inchangé ».
- `tests-ui/gl/GLTenirSettings.test.jsx` : la case n'est plus rendue.
- Laisse les tests qui posent `tenir_profil: null` sur une fixture (`tests/gl-market-trades-batch.test.js`,
  `tests/gl-tenir-settings.test.js`).

**Critère d'acceptation** : aucun écran ne permet de couper la mouture ; l'API répond 400 à `profil: null` sans
changer la partie ; une partie sans profil (ancienne) joue toujours le classique.

### ecrans-1.2 — Deux surfaces, pas trois (ex-étape 27)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `src/gl/components/mj/GLTenirProfilPanel.jsx` (lignes 5-9, `SURFACES`) | Propose `tableau`, `hybride`, `tablette`. |
| `src/gl/components/settings/GLTenirSettings.jsx` (lignes 246-248) | Options « Tableau (une équipe active, sablier) », « Hybride (tablettes d'équipe + tableau) », « Tablette (équipes en parallèle) ». |
| même fichier, lignes 17 et 106 | Libellés « Marché pendant le tour (tablette / hybride) » et « Sablier du tour, hybride et tablette (secondes, 0 = sans) ». |
| `docs/GL_TENIR_A_DEUX_REGLES.md` § 2 (ligne 72) | Les règles disent déjà que l'hybride n'est plus proposé : c'est l'écran qui est en retard. |
| Moteur | Depuis les décisions du 19/11, l'hybride ne diffère de la tablette que par la fenêtre de fouille ouverte par le prof. |

**Changement attendu** :

1. Retire `hybride` des deux sélecteurs. Libellés : « Tablettes (les équipes jouent en même temps) » et « Tableau (une
   équipe à la fois, le prof porte les gestes) ». Garde la cohérence avec les libellés existants s'ils sont repris
   ailleurs.
2. Une partie (ou un réglage) déjà en `hybride` : le sélecteur l'affiche « Hybride (ancienne valeur) », en option
   **désactivée**, tant qu'elle n'est pas changée, pour ne pas mentir sur son état. Aucune migration.
3. Les deux libellés des lignes 17 et 106 disent « tablettes » (plus « tablette / hybride »).
4. Ne touche ni au registre (`lib/glSettings.js`, `TENIR_SURFACES`), ni au moteur, ni à `glTenirPermissionsCore`, ni
   aux branches `hybride` de `GLTourScreen.jsx`, ni aux tests du moteur qui jouent l'hybride.

**Textes** (prof) : « Tablettes (les équipes jouent en même temps) » · « Tableau (une équipe à la fois, le prof porte
les gestes) » · « Hybride (ancienne valeur) ».

**Tests** :

- `tests-ui/gl/GLTenirSettings.test.jsx` : les lignes 54-55 choisissent `hybride` : passe sur `tablette`. Ajoute « le
  sélecteur ne propose que tableau et tablette » et « réglage à `hybride` → option désactivée affichée ».
- `tests-ui/gl/GLTenirProfilPanel.test.jsx` (nouveau) : mêmes deux cas pour le panneau « Profil » d'une partie.
- `tests-ui/gl/GLTourScreen.test.jsx` et `tests-ui/gl/GLTenirEcranEquipe.test.jsx` peuvent garder des fixtures
  `hybride` (le moteur l'accepte toujours) : vérifie qu'ils restent verts.

**Critère d'acceptation** : aucun sélecteur ne permet de choisir l'hybride ; une ancienne valeur hybride se voit,
désactivée.

### ecrans-1.3 — Questions hors tirage sur une installation neuve (ex-étape 12)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `migrations/365_gl_ensemble_unifie_zones.sql` (ligne 173) | Sort du tirage `QCM0213`, `QCM0612`, `QCM0618`, `QCM0605`, `QCM0451` (`usage_tenir = 0`). Vrai en prod le 24/11. |
| `lib/glQcmImport.js` (lignes 601-623) | La règle de taxonomie (`taxonomieCreees`, compteur `usage_tenir_retirees`) met `usage_tenir = 0` aux questions **créées** par l'import. Rien de tel pour les cinq questions ci-dessus : un import du corpus fait **après** les migrations les recrée avec `usage_tenir = 1`. |
| Prod, 24/11 | Dix questions de case de plus ont `usage_tenir = 0` (décision 34 du prompt) : `QCM0092`, `QCM0278`, `QCM0272`, `QCM0663`, `QCM0431`, `QCM0439`, `QCM0192`, `QCM0611`, `QCM0619`, `QCM0135`. |

**Changement attendu** (`lib/glQcmImport.js`, sur le modèle de la règle de taxonomie) :

1. Ajoute une liste `QUESTIONS_REMPLACEES_PAR_ZONES`, commentée « migration 365, ensemble unifié : questions
   remplacées par les zones » (les cinq codes).
2. À la **création** seulement, ces questions reçoivent `usage_tenir = 0`. À la mise à jour, la valeur choisie par le
   prof reste.
3. Compte `usage_tenir_remplacees` dans le rapport d'import.
4. Ajoute à la même liste, sous un second commentaire « décision 34, 24/11 : questions de case qui se lisent sur le
   plateau », les dix codes ci-dessus. Même règle (création seulement).

**Textes** : aucun.

**Tests** (`tests/gl-qcm-import-usage-tenir.test.js`) : base neuve, import → les cinq et les dix sont hors tirage ;
question remise à 1 par le prof → l'import ne la change pas.

**Critère d'acceptation** : un import sur base neuve laisse les quinze questions hors tirage et le dit dans son
rapport.

### ecrans-1.4 — Bilan Team Spirit : le formulaire relit ce qui est enregistré (ex-étape 29)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `src/gl/components/mj/GLTeamSpiritPanel.jsx` (lignes 12-15) | Le panneau repart à chaque ouverture de « 6 cartes gardées, aucune retirée ». Il n'envoie pas la liste des cartes retirées (`cartes_json` reste vide). |
| Effet | Un second enregistrement du bilan **efface les retraits** : la compétence « Coopérer » (barème 6 / 4-5 / 2-3 / 0-1, export Team Spirit) et l'honneur « Esprit d'équipe » sortent faux. |
| `lib/glTour.js` › `enregistrerTeamSpiritTx` (lignes 2277-2296) | La Lumière ne compte jamais deux fois (`lumiere_comptee`). Le serveur écrit déjà `b.cartes` dans `cartes_json` quand c'est un tableau. |
| `routes/gl/games/tenir-tour.js` (ligne 1011) | `GET /api/gl/games/:id/tenir/tour/team-spirit` existe : il rend `items[]` (`roundNumber`, `teamId`, `cartesGardees`, `cartes`, `note`). L'enregistrement passe par `PUT` sur la même adresse (`useGlTenirTour.js` › `teamSpirit`). |

**Changement attendu** :

1. Le panneau charge le bilan déjà enregistré du tour courant par la route **existante** `GET …/tenir/tour/team-spirit`
   et coche les cartes retirées d'après `cartes`.
2. À défaut (ancien bilan sans liste), il retire autant de cartes que `6 − cartesGardees`, dans l'ordre du panneau,
   et l'écrit en petit : « Bilan déjà enregistré : à vérifier ».
3. À l'enregistrement, il envoie aussi `cartes` (la liste des cartes retirées).
4. Props ajoutées : `gameId` et `roundNumber`, passées par `GLTourScreen.jsx` (modification minimale, section 3).

**Textes** (prof) : « Bilan déjà enregistré : à vérifier ».

**Tests** (`tests-ui/gl/GLTeamSpiritPanel.test.jsx`) : bilan enregistré avec deux cartes retirées → rouvert, les deux
restent retirées ; second enregistrement sans toucher → mêmes `cartesGardees` et `cartes`. Les deux tests existants
attendent `{ teamId, cartesGardees, note }` exactement : ils reçoivent `cartes` en plus (section 8).

**Critère d'acceptation** : enregistrer, rouvrir, enregistrer encore : rien ne change en base.

### ecrans-1.5 — Onglets des biomes : chaque texte dans son onglet (ex-étape B1)

Deux commits permis : (a) logique et tests de l'utilitaire, (b) test du composant.

**Constat vérifié** (code de `main` ; structure des textes lue en prod le 24/11) :

- Page « Nature » → biomes du plateau (`GLNatureView` → `GLEcosystemsView`) : un plateau à deux biomes affiche deux
  onglets. **Tout le texte (biotope et biocénose des deux biomes) s'affiche dans le premier onglet ; le second n'a que
  les images du catalogue.** Vu par Oliv au plateau 1 ; les plateaux 2, 3 et 4 ont la même structure.
- Cause : `src/gl/utils/glEcosystemSections.js` › `splitMarkdownByBiomes` (ligne 46) découpe le markdown **seulement
  sur les titres `## `** et rattache au premier biome tout titre qu'il ne reconnaît pas, ainsi que le préambule. Or
  `gl_chapters.biotope_markdown` et `biocenose_markdown` des chapitres 3 à 7 sont tous construits ainsi :

  ```text
  [préambule : une image par biome + légende en italique]   (plateaux 1, 3, 4 ; le plateau 2 n'en a pas)
  ## Le biotope — milieu de vie        (ou ## La biocénose — communauté du vivant)
  ### <biome A>
  texte
  ### <biome B>
  texte
  ```

  Le seul `##` ne correspond à aucun biome → tout part dans le premier onglet. Les `###` ne sont jamais lus.

- Avec les biomes `jungle_afc` / `savane`, `buildEcosystemSections` rend 138 caractères pour la jungle et **0** pour
  la savane. L'image de la savane du préambule (`gl-biome-savane-01.png`) s'affiche dans l'onglet de la jungle.
- L'écran fusionne biotope et biocénose dans un seul bloc (`prepareEcosystemSectionMarkdown`) et ne rend **aucun**
  titre « Biotope » / « Biocénose » : le commentaire de `REDUNDANT_HEADING_RE` (`src/gl/utils/glEcosystemMarkdown.js`,
  ligne 16), qui dit le contraire, est faux.

Biomes liés (`gl_chapter_biomes`, dans l'ordre) :

| Chapitre | Biomes (slug, nom) | Titres `###` du texte |
| --- | --- | --- |
| 3, plateau 1 | `jungle_afc` « Jungle d'Afrique centrale », `savane` « Savane tropicale » | « Jungle d'Afrique centrale », « Savane » |
| 4, plateau 2 | `sahara` « Désert chaud (Sahara) », `foret_mediterraneenne` | « Le Sahara », « Forêt méditerranéenne » |
| 5, plateau 3 | `foret_caducifoliee` « Forêt caducifoliée tempérée », `landes` « Landes atlantiques » | « Forêt caducifoliée », « Landes atlantiques » |
| 6, plateau 4 | `taiga` « Taïga (forêt boréale) », `toundra` « Toundra arctique » | « Taïga », « La limite des arbres », « Toundra — été polaire », « Toundra — nuit polaire » |
| 7, épilogue (sans plateau) | `toundra` seul | sans objet (un seul biome, pas d'onglets) |

Avec la logique actuelle `resolveBiomeForHeading` (fonction interne, ligne 26), tous ces `###` se résolvent vers le bon
biome, sauf « La limite des arbres » (aucun) ; les `alt` des images de préambule aussi (« La jungle d'Afrique
centrale », « La savane africaine », « La forêt caducifoliée », « Les landes atlantiques », « La taïga », « La
toundra — été polaire », « La toundra — nuit polaire »).

**Changement attendu** (un seul fichier de logique ; aucune donnée en base, aucune route, aucun réglage) : réécris
`splitMarkdownByBiomes(markdown, biomes)`, même signature, même retour `Map<slug, markdown>`.

1. **Un seul biome** : texte entier, comme aujourd'hui.
2. **Lecture par blocs** : parcours ligne à ligne. Un titre est une ligne `^(#{2,3})\s+(.+?)\s*$`. Hors titre, les
   lignes vont au « bloc courant ».
3. **Titre qui désigne un biome** (`##` ou `###`, résolu par `resolveBiomeForHeading`) : le bloc courant devient ce
   biome.
   - Si le titre normalisé est **exactement** une clé du biome (slug ou nom, ex. « Savane », « Taïga », « Landes
     atlantiques », « Jungle d'Afrique centrale »), ne le recopie pas : l'onglet porte déjà le nom.
   - Sinon (« Le Sahara », « Toundra — été polaire », « Toundra — nuit polaire »), garde-le tel quel en `###` : il
     distingue les deux états de la toundra.
4. **Titre `##` qui ne désigne aucun biome** (« Le biotope — milieu de vie », « La biocénose — communauté du
   vivant ») : c'est un **titre commun**. Il revient au niveau commun (plus de biome courant) et il est **recopié en
   tête de la part de chaque biome qui reçoit ensuite du contenu sous lui** (une seule fois par biome) : ces titres
   sont le seul séparateur visible entre biotope et biocénose, ils restent dans chaque onglet.
5. **Titre `###` qui ne désigne aucun biome** (« La limite des arbres ») : reste dans le biome courant, titre
   compris. S'il n'y a pas de biome courant, il va au contenu commun (règle 6).
6. **Contenu commun** (préambule, ou contenu sous un titre commun avant tout titre de biome) : découpé en
   paragraphes (séparateur `\n\s*\n`).
   - Un paragraphe **image** (`<img … alt="…">` ou `![alt](…)`, seul dans son paragraphe) va au biome que désigne
     son `alt` (`resolveBiomeForHeading` sur l'alt). Le paragraphe suivant le suit s'il n'est qu'une légende en
     italique (`^\*{1,3}[^*].*\*{1,3}$` après trim).
   - Tout autre paragraphe commun, ou une image dont l'alt ne désigne aucun biome : au **premier biome**
     (comportement actuel, gardé).
7. **Compatibilité** : l'ancien format (`## <nom du biome>` directement, sans titre commun) donne le même résultat
   qu'aujourd'hui, à une différence près, voulue : le titre de biome n'est plus recopié en paragraphe nu
   (`Savane\n\ntexte`) mais retiré s'il est exact (règle 3) ou gardé en `###`. Adapte les deux tests existants de
   `tests-ui/gl/glEcosystemSections.test.js` (lignes 8 et 14) si besoin, et dis-le dans ton rapport.
8. Nettoie les lignes vides en trop (`\n{3,}` → `\n\n`) et `trim()` chaque part.

Laisse `buildEcosystemSections`, `GLEcosystemsView.jsx` et `GLLearnAndImport` tels quels. Dans
`glEcosystemMarkdown.js`, corrige **seulement le commentaire** de `REDUNDANT_HEADING_RE` (l'écran ne rend pas de
titres « Biotope / Biocénose ») ; ne change pas la regex (elle ne retire que `## Biotope` / `## Biocénose` exacts, et
les titres longs doivent rester).

**À vérifier avant d'écrire la règle 6** : dans l'instantané du dépôt (voir « jeu d'essai »), aux plateaux 3 et 4 la
légende en italique est écrite **sur la ligne qui suit l'image, sans ligne vide** : image et légende forment un seul
paragraphe. Au plateau 1, l'image (`<img …>`) et sa légende sont deux paragraphes. Les critères ci-dessous (« les
deux images de la toundra du préambule dans la toundra ») demandent que les deux formes soient rangées par l'`alt` de
l'image. Écris tes jeux d'essai dans les deux formes, et dis dans ton rapport comment tu as lu « seul dans son
paragraphe ».

**Textes** : aucun texte ne change.

**Jeu d'essai (les textes de prod ne sont pas dans le dépôt)**. L'ancien texte demandait de tester avec « les vrais
textes de prod, en copie abrégée mais de même structure ». Une session de lot n'a pas la prod. Construis donc tes
jeux d'essai **dans le test**, d'après la structure et le tableau ci-dessus. Pour gagner du temps et rester fidèle,
tu peux recopier des extraits abrégés de `data/gl/sim/contenu-prod-2026-11-07.json` (instantané du contenu de prod du
7/11, versionné pour le banc ; table `gl_chapters`, colonnes `biotope_markdown` et `biocenose_markdown`, lignes 3 à
7) : il a la structure décrite et porte les mots repères cités plus bas (vérifié le 24/11). Il date du 7/11 : un
texte a pu changer depuis en prod, pas la structure. Note dans ton rapport la source de chaque jeu d'essai.

**Tests** (`tests-ui/gl/glEcosystemSections.test.js`), un cas par plateau, même structure que la prod (préambule
d'images et légendes, `## Le biotope — milieu de vie`, `###` par biome) :

- Plateau 1 (`jungle_afc`, `savane`) : l'onglet savane contient « Plus au sud » (biotope) et « gnous » (biocénose) ;
  l'onglet jungle n'en contient aucun ; l'image `gl-biome-savane-01.png` et sa légende « La savane africaine » sont
  dans la savane, pas dans la jungle ; les deux parts du biotope commencent par `## Le biotope — milieu de vie`.
- Plateau 2 (`sahara`, `foret_mediterraneenne`) : « nappe phréatique » dans le Sahara seulement, « sclérophylles »
  dans la forêt seulement ; la coupe `gl-coupe-sahara-sol.png` reste dans le Sahara.
- Plateau 3 (`foret_caducifoliee`, `landes`) : « humus » côté forêt, « tourbière » côté landes.
- Plateau 4 (`taiga`, `toundra`) : « La limite des arbres » et son texte dans la taïga ; « Toundra — été polaire » et
  « Toundra — nuit polaire » gardés en `###` dans la toundra ; les deux images de la toundra du préambule dans la
  toundra.
- Un biome seul (chapitre 7) : texte entier inchangé.
- Aucun texte perdu : pour chaque cas, chaque paragraphe non vide de l'entrée se retrouve dans au moins une part
  (hors titres de biome exacts retirés).

Dans `tests-ui/gl/GLEcosystemsView.test.jsx` : un rendu avec deux biomes au format de prod ; clic sur le second
onglet → son texte est visible, celui du premier ne l'est pas.

**Critère d'acceptation** : sur la base locale, l'onglet « Savane tropicale » du plateau 1 montre son biotope puis sa
biocénose, sous « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » ; l'onglet de la jungle ne
montre plus le texte de la savane.

### ecrans-1.6 — Message de version d'état (ex-étape 11)

**Constat vérifié** : `src/shared/glMainCore.js` (ligne 35) porte
`MESSAGE_ETAT_PERIME = 'L’équipe a déjà joué ce geste. Voici où vous en êtes.'` (apostrophe typographique). L'ancien
texte de cette étape ne nommait que la constante et cinq fichiers à aligner. Sur `main`, l'ancien message est dans
**quinze** fichiers (hors documents historiques et `CHANGELOG.md`) : **neuf étaient hors liste**. Les tests à chaîne
exacte cassent s'ils ne suivent pas.

**Changement attendu** : `MESSAGE_ETAT_PERIME` devient « L’équipe vient de jouer. Voici où vous en êtes. » (garde
l'apostrophe typographique du fichier). Puis aligne **tous** ces fichiers :

| Fichier | Ligne | Nature |
| --- | --- | --- |
| `src/shared/glMainCore.js` | 35 | la constante |
| `lib/shared/glMainCore.js` | 39 | **hors liste d'origine** : miroir, régénéré, pas édité à la main |
| `e2e/gl-tenir-tablettes.spec.js` | 707 | chaîne attendue |
| `src/gl/utils/glTenirMoment.js` | 304 | JSDoc de `etatPerime` |
| `docs/GL_TENIR_A_DEUX_REGLES.md` | 93 (§ 3, « Version d'état ») | règle, hors § 0 |
| `docs/API.md` | 1184 | message de `ETAT_PERIME` |
| `docs/GL_TENIR_A_DEUX.md` | 273 | légende de la capture `appareils-etat-perime.png` |
| `tests/gl-tenir-plusieurs-appareils.test.js` | 205 | **hors liste d'origine** : chaîne exacte |
| `tests-ui/gl/GLTenirEcranEquipe.test.jsx` | 424 | **hors liste d'origine** : chaîne exacte |
| `tests-ui/gl/GLTenirEquipeView.test.jsx` | 395 | **hors liste d'origine** : chaîne exacte (fichier supprimé plus tard par ecrans-4) |
| `tests-ui/gl/glTeamSession.test.js` | 110, 117, 123 | **hors liste d'origine** : chaîne de fixture |
| `tests-ui/gl/glTenirMoment.test.js` | 462 | **hors liste d'origine** : chaîne de fixture |
| `src/gl/hooks/useGlTenirEquipe.js` | 9 | **hors liste d'origine** : commentaire |
| `docs/reference/gl/guide-du-mj.md` | 509 et 692 | **hors liste d'origine** : doc de référence |
| `docs/reference/gl/roles-et-connexion.md` | 365 | **hors liste d'origine** : doc de référence |

Les documents historiques (`docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`, `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`) ne
bougent pas. Finis par `git grep -n "déjà joué ce geste"` : il ne doit rester que ces deux documents et le
`CHANGELOG.md`.

**Textes** (élève, mot pour mot) : « L’équipe vient de jouer. Voici où vous en êtes. »

**Tests** : ceux du tableau, alignés. Aucun nouveau test.

**Critère d'acceptation** : `npm test`, `npm run test:ui` et `e2e/gl-tenir-tablettes.spec.js` verts ; le miroir
`lib/shared/glMainCore.js` est à jour (`npm run sync:shared-cores:check`).

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire. Seule donnée lue : l'instantané du banc
`data/gl/sim/contenu-prod-2026-11-07.json` (étape ecrans-1.5, lecture seule ; ne le modifie pas).

## 7. Vérifications propres au lot

- Banc, régime **fumée** : une passe à la fin (règles communes, section 5).
- e2e (sous le verrou) : `e2e/gl-tenir-tablettes.spec.js` (texte de l'étape ecrans-1.6).
- Captures (`docs/captures/gl-decisions/ecrans-1/`) :
  - réglages « Tenir à deux », sans la case de la mouture ni « Hybride », et panneau « Profil » d'une partie ;
  - bilan Team Spirit rouvert après enregistrement (cartes retirées encore cochées) ;
  - onglet « Savane tropicale » du plateau 1, avant et après, sur la base locale.
- Pas de relecteur de contenu pour l'étape ecrans-1.5 (aucun texte ne change). `gl-relecteur-garde-fous` sur le
  message de l'étape ecrans-1.6.
- Docs de référence : vérifie qu'aucun doc de `docs/reference/gl/` ne décrit le défaut des onglets de biomes ; si une
  phrase dit le contraire de la correction, mets-la à jour, sinon n'y touche pas (au 24/11, aucune ne décrit ces
  onglets).

**Banc et surface « hybride ».** Le scénario `ensemble-unifie`, celui qui fait foi pour tout le chantier, joue en
surface `hybride` (`tools/gl-sim/scenarios/ensemble-unifie.js`, vers les lignes 21 et 22). Si ta modification fait
refuser cette surface par le serveur, le banc casse pour tous les lots : passe alors le scénario en `tablette` dans ce
lot, relance les deux scénarios, écris les nouvelles mesures dans ton rapport et dis en première ligne de ton retour
que les mesures de départ du chantier sont à reprendre.

## 8. Contrats de test changés

- `MESSAGE_ETAT_PERIME` : « L’équipe vient de jouer. Voici où vous en êtes. » (test-id `gl-tenir-etat-perime`
  inchangé).
- `PUT /api/gl/games/:id/tenir/profil` refuse `profil: null` (400, « Profil invalide (complet ou court) »).
- Case `gameplay.tenir_enabled` absente de l'écran des réglages ; option « Hybride » absente des deux sélecteurs
  (« Hybride (ancienne valeur) », désactivée, pour une ancienne valeur).
- Libellés des sélecteurs : « Tablettes (les équipes jouent en même temps) », « Tableau (une équipe à la fois, le prof
  porte les gestes) ».
- Bilan Team Spirit : le panneau relit le bilan (`GET …/tenir/tour/team-spirit`) et envoie `cartes` ; `onSave` reçoit
  `{ teamId, cartesGardees, cartes, note }`.
- `splitMarkdownByBiomes` : le titre de biome n'est plus recopié en paragraphe nu.
- Rapport d'import QCM : compteur `usage_tenir_remplacees` ; quinze codes hors tirage à la création.

## 9. Docs à mettre à jour dans ce lot

| Doc | Quoi |
| --- | --- |
| `docs/reference/gl/guide-du-mj.md` (lignes 296-298) | Retire le retour au classique (« revenir aux règles classiques (profil « aucun ») »). Lignes 509 et 692 : nouveau message. Lignes voisines 300-306 : le lot ecrans-2 les change après toi, n'y touche pas. |
| `docs/GL_GAMEPLAY_PRESETS.md` (ligne 68) et `docs/GL_TENIR_A_DEUX.md` (« Mode « tenir » d'une partie », ligne 42) | « une partie sans profil (ancienne partie) joue encore le jeu classique ; on ne peut plus y revenir ». |
| `docs/reference/gl/economie-marche-sorts.md` | Encart en tête : « Le jeu classique (cœurs, score d'équipe) n'est plus proposé ; ce document le décrit pour les anciennes parties ». Le lot moteur-3 le complétera. |
| `docs/API.md` | Ligne 383 : `PUT …/tenir/profil` sans `null`. Ligne 1184 : nouveau message. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) | § 2, ligne 72 : « deux surfaces proposées » (Tablettes, Tableau ; l'hybride reste dans le moteur pour les anciennes parties). § 3, ligne 93 : nouveau message. |
| `docs/reference/gl/roles-et-connexion.md` (ligne 365) | Nouveau message. |
| `.claude/skills/gl-tenir-moteur/SKILL.md`, `.claude/skills/foretmap-gl/SKILL.md` | Seulement une phrase devenue fausse (retour au classique possible, trois surfaces), s'il y en a. |
| `changelog.d/gl-decisions-ecrans-1.md` | Entre autres la ligne « Modifié — G&L : les surfaces proposées sont Tablettes et Tableau ». |

**Pour le § 0 des règles** (à recopier dans ton rapport, pas dans les règles) :

- « Tenir à deux est le jeu de G&L : plus de retour au jeu classique depuis l'interface ou l'API ; le code du
  classique sera retiré après deux séances. »
- « Deux surfaces proposées, Tablettes et Tableau ; l'hybride sort des sélecteurs (ligne M12 du tableau des
  décisions). »

**Pour le lot fin-2** (à écrire dans « Ce que les lots suivants doivent savoir ») : la page des biomes montre un onglet
par biome, avec son biotope et sa biocénose ; un texte de chapitre s'écrit `## Le biotope — milieu de vie`, puis un
`###` par biome.

## 10. Hors périmètre

- Retrait du code du jeu classique : après deux séances jouées, hors chantier.
- Textes des biomes en base, images du registre des biomes : aucune donnée ne change ici.
- Réécriture complète des docs de référence et règles v4 : lots fin-1 et fin-2.
- Alignement du catalogue sur les dix questions sorties du tirage : lot contenu-1.
- Le bouton « Le voile avance » de la dernière équipe et l'écran d'équipe au tableau : lot ecrans-4.
- `time_zone` de la connexion MySQL : chantier ForêtMap séparé.

## 11. Pour Oliv

**À relire** :

- Le message « L’équipe vient de jouer. Voici où vous en êtes. ».
- Les libellés du prof : « Tablettes (les équipes jouent en même temps) », « Tableau (une équipe à la fois, le prof
  porte les gestes) », « Hybride (ancienne valeur) », « Bilan déjà enregistré : à vérifier », et les deux libellés de
  réglage passés à « tablettes » (leur mot à mot n'était pas donné : la session le propose dans son rapport).
- Onglets des biomes : les tests reposent sur des jeux d'essai construits dans le test (extraits de l'instantané du
  7/11), pas sur les textes de prod du 24/11. À vérifier à l'écran après déploiement.
- Onglets des biomes, plateau 4 : dans l'instantané du 7/11, la coupe « la rivière et la fourmilière » de la taïga est
  écrite à la fin de la biocénose, sous le titre de la toundra. La correction la laissera dans l'onglet de la toundra
  (c'est une donnée, hors de ce lot). À corriger dans le texte du chapitre si c'est encore vrai en prod.

**À faire après la vague** :

- Ouvrir les biomes des plateaux 1 à 4 : chaque onglet montre son biotope puis sa biocénose ; au plateau 4, la limite
  des arbres est dans la taïga. Vérifier qu'une image n'apparaît pas deux fois dans un onglet.
- Enregistrer un bilan Team Spirit avec une carte retirée, le rouvrir : la carte est toujours retirée.
- Réglages « Tenir à deux » : plus de case pour couper la mouture, plus d'« Hybride ».
- Ne plus réimporter le corpus QCM depuis le tableur : l'import réécrit l'énoncé, les choix et la bonne réponse des
  questions existantes, et remettrait les anciennes versions des questions de zone réécrites les 23 et 24/11.
