# Lot moteur-1 — Moteur du tour

> Chantier G&L « décisions » · vague 1 · couloir moteur · charge moyenne · banc : seuils
> Branche : `claude/gl-decisions-moteur-1` · Attend : rien · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Les heures d'un tour sont justes : un tour ne dure plus « moins 57 minutes » dans le diagnostic du prof.
- Olu ne redit plus la même erreur du jour deux séances de suite dans une partie.
- Au tableau, après la dernière équipe, le serveur ne rend plus la main à la première : il répond « Toutes les
  équipes ont joué. »
- Quand la jauge de Lumière atteint son palier, elle repart à 0 : le voile recule une fois, pas deux.

Aucun écran ne change dans ce lot.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 18 du prompt | 23/11 | Correctifs de la partie 16 : horodatages, erreur d'Olu sans répétition, fin de l'ordre. | — |
| Décision 2 du prompt | 19/11 | Au palier, la jauge de Lumière **repart à 0**. | — |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Le réglage `time_zone = '+00:00'` sur chaque connexion du pool MySQL reste **hors chantier** (il touche tout
  ForêtMap). Ce lot le signale dans son rapport, il ne le fait pas.
- Le message du refus de fin d'ordre : « Toutes les équipes ont joué. » (message d'erreur du serveur, lu par le prof).
- Le banc en surface « tableau » n'appelle plus « équipe suivante » après la dernière équipe (étape moteur-1.3).

## 3. Fichiers

**À toi**

- `lib/glTour.js` (`changerPhaseTx`, `tirerErreurDuJour`, `equipeSuivanteTx`, `ajouterLumiereTx` seulement)
- `lib/glDiagnostic.js`
- `tests/gl-tour-phases.test.js`, `tests/gl-tenir-simulation-7nov.test.js`, `tests/gl-tenir-chronometrage.test.js`,
  `tests/gl-tenir-team-spirit.test.js`, `tests/gl-ensemble-unifie-escalier.test.js` (seulement pour y greffer ou y
  aligner les cas de ce lot)

**Nouveaux** (si tu ne greffes pas sur un test existant)

- `tests/gl-tour-horodatages.test.js`, `tests/gl-olu-erreur-sans-remise.test.js`, `tests/gl-tour-fin-de-l-ordre.test.js`,
  `tests/gl-lumiere-palier.test.js`
- `changelog.d/gl-decisions-moteur-1.md`, `docs/prompts/gl-decisions/rapports/moteur-1.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `tools/gl-sim/seance.js` | Boucle de la surface `tableau` (l. 334-343) : ne plus appeler `equipe-suivante` après la dernière équipe de l'ordre. Rien d'autre. |
| `docs/API.md` | Ligne `POST /api/gl/games/:id/tenir/tour/equipe-suivante` (l. 391) : ajouter le 409 `FIN_DE_L_ORDRE`. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) | § 3, l. 90 (« bouton « équipe suivante » ») : dire qu'après la dernière équipe de l'ordre, le serveur refuse (409 `FIN_DE_L_ORDRE`) et que le tour passe au voile. Le § 11 dit déjà « la jauge repart à 0 » : n'y touche pas. |

**Ne touche pas**

| Fichier ou symbole | Lot qui le modifie |
| --- | --- |
| `src/shared/glMainCore.js` (`MESSAGE_ETAT_PERIME`), `e2e/gl-tenir-tablettes.spec.js` | ecrans-1 (message d'état) |
| `src/gl/components/mj/GLTourScreen.jsx`, `tests-ui/gl/GLTourScreen.test.jsx` | ecrans-1, moteur-3, ecrans-4 |
| `lib/glTour.js › bonneReponseDeCaseTx` | moteur-4 |
| `lib/glTour.js`, appel `avancerTx({ motif: 'tour_clos' })` (l. 679) ; `lib/glEscalier.js` | moteur-3 |
| `lib/glTrameDefis.js` (appel `ajouterLumiereTx` avec `source: 'defi_trame'`) | moteur-5 |
| `data/gl/tenir/olu-lignes.json` | contenu-1 (lignes d'erreur du plateau 1) |

## 4. Étapes (un commit par étape, dans cet ordre)

**Banc d'abord** : avant toute modification, lance le banc (section 7) et note la série « avant ».

### moteur-1.1 — Horodatages des tours (ex-étape 15)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | Prod, partie 16, tour 2 | `started_at` 14:22:43, `ended_at` 13:25:56 : durée de −57 min. |
  | `lib/glTour.js › changerPhaseTx`, l. 618 | `updates.chapardeur_at = new Date()` (heure JS, UTC). |
  | `lib/glTour.js › changerPhaseTx`, l. 626 | `updates.ended_at = new Date()` (heure JS, UTC). |
  | `lib/glTour.js`, l. 687-691 | Le constructeur `sets` de la fin de `changerPhaseTx` ne pose que des valeurs liées (`colonne = ?`) ; seul `phase_changed_at = NOW()` y est en littéral. |
  | `lib/glTour.js › ouvrirTourTx` | `started_at` et `phase_changed_at` sont écrits avec `NOW()` (heure de session MySQL, UTC+1 en prod). |
  | `database.js` | Le pool lit les `DATETIME` comme de l'UTC (`timezone: 'Z'`). |
  | `lib/glSeuil.js`, l. 101 | Fait déjà bien : `ended_at = COALESCE(ended_at, NOW())`. |
  | `lib/glDiagnostic.js › summarizeRounds`, l. 107 | `dureeMinutes: minutesBetween(started, ended)` : une durée négative sort telle quelle. |

- **Règle** : dans le moteur G&L, on compare toujours des valeurs écrites par la même horloge (`NOW()` avec
  `NOW()`), jamais un `new Date()` JS avec une colonne écrite par `NOW()`.
- **Changement attendu** :
  1. Écris `chapardeur_at` et `ended_at` avec `NOW()` : ajoute la colonne en littéral `= NOW()` dans le `UPDATE` de
     la fin de `changerPhaseTx` (comme `phase_changed_at`), au lieu d'une valeur liée.
  2. Cherche dans `lib/gl*.js` toute autre écriture d'un `new Date()` JS dans une colonne `DATETIME` comparée à des
     `NOW()`, et aligne-la. Candidats relevés sur `main`, à juger un par un : `lib/glLoreFeuillets.js` l. 217
     (`discovered_at`, `read_at`, `held_at`, `effaced_at` à côté de `created_at = NOW()`), `lib/glRewardsBackfill.js`
     l. 79 et 98 (`awarded_at`). Les `new Date().toISOString()` rangés dans un JSON (`lib/glTour.js` l. 1568 et 2366,
     `lib/glChasse.js` l. 369, `lib/glChapardeur.js` l. 60) ne sont pas des colonnes `DATETIME` : ne les change que
     si une requête les compare à un `NOW()`. Dis dans ton rapport ce que tu as aligné et ce que tu as laissé.
  3. `lib/glDiagnostic.js` : une durée négative vaut `null`, avec une note « horodatage incohérent ».
  4. **Hors chantier** : `time_zone = '+00:00'` sur chaque connexion du pool. Signale-le dans ton rapport.
- **Textes** : « horodatage incohérent » (note du diagnostic, lue par le prof).
- **Tests** : un tour ouvert puis clos a `ended_at >= started_at` et une durée ≥ 0 dans le diagnostic ; une durée
  négative donnée à `summarizeRounds` sort `null` avec la note. Chemins : `tests/gl-tour-horodatages.test.js`
  (nouveau) ou `tests/gl-tour-phases.test.js` et `tests/gl-tenir-chronometrage.test.js`.
- **Critère d'acceptation** : plus aucun `new Date()` écrit dans `gl_game_rounds` ; le diagnostic d'une partie ne
  montre jamais de durée négative.

### moteur-1.2 — Erreur du jour sans répétition (ex-étape 16)

- **Constat vérifié** : `lib/glTour.js › tirerErreurDuJour(db, plateau = null, gameId = null)` (l. 255) tire avec
  remise (`glRandom.pick(pool, { gameId })`). L'erreur tirée est rangée dans `gl_game_rounds.olu_erreur_json` à
  l'ouverture du tour (`ouvrirTourTx`, l. 361-363).
- **Changement attendu** : tirage **sans remise dans la partie**. Exclus les `id` déjà présents dans
  `olu_erreur_json` des tours précédents de la même partie. Pool vide : repars du pool du plateau complet ; puis
  repli « tous », puis toutes, comme aujourd'hui.
- **Textes** : aucun.
- **Tests** (avec leurs propres fixtures, pas le catalogue réel) : 6 lignes au plateau, 6 tours → 6 erreurs
  différentes ; 7e tour → une erreur déjà vue, jamais celle du tour 6. Les cas existants de
  `tests/gl-tenir-simulation-7nov.test.js` (l. 362-367 : repli sur « tous », repli sur tout, catalogue vide) restent
  verts.
- **Critère d'acceptation** : dans une partie, aucune erreur ne revient tant que le pool du plateau n'est pas épuisé.
- **À savoir** : le plateau 1 n'a aujourd'hui que 2 lignes d'erreur (plus 1 « tous ») ; il passe à 6 lignes au lot
  contenu-1. Tes tests ne dépendent pas de ce lot.

### moteur-1.3 — Fin de l'ordre au tableau, côté serveur (ex-étape 17, part serveur)

- **Constat vérifié** : `lib/glTour.js › equipeSuivanteTx` (l. 730) : après la dernière équipe de l'ordre, « Équipe
  suivante » rend la main à la première (l. 745 : `ordre[(idx + 1) % ordre.length]`). La fonction appelle
  `confirmerArriveesTx` (qui écrit) **avant** de calculer l'équipe suivante (l. 741-743).
- **Changement attendu** :
  1. Quand l'équipe active est la dernière de l'ordre, `equipeSuivanteTx` répond 409 `FIN_DE_L_ORDRE` (« Toutes les
     équipes ont joué. »), **sans rien écrire** : le refus tombe avant `confirmerArriveesTx`.
  2. **Rien à l'écran dans ce lot.** Le bouton « Le voile avance » qui remplace « Équipe suivante » pour la dernière
     équipe se fait au lot ecrans-4. La console actuelle ne change pas.
  3. Banc : `tools/gl-sim/seance.js` (l. 334-343) appelle `equipe-suivante` après **chaque** équipe en surface
     `tableau`, dernière comprise. Ne fais plus cet appel après la dernière équipe (sinon le banc compte un refus
     `FIN_DE_L_ORDRE` par tour).
- **Trou connu, à écrire tel quel dans ton rapport (« Ce que les lots suivants doivent savoir »)** : entre la fusion
  de ce lot et celle du lot ecrans-4, la console garde le bouton « Équipe suivante » pour la dernière équipe ; un
  appui reçoit le 409 et le message « Toutes les équipes ont joué. ». Le prof passe alors au voile par le geste
  existant. C'est voulu : ne le couvre pas dans ce lot.
- **Textes** : « Toutes les équipes ont joué. »
- **Tests** : 4 équipes, 3 « suivante » → la 4e est active ; 4e « suivante » → 409 `FIN_DE_L_ORDRE`, l'équipe active
  ne change pas, aucune écriture (arrivée en suspens de la dernière équipe intacte). Les tests existants restent
  verts : `tests/gl-tour-phases.test.js` (l. 101-105) et `tests/gl-tenir-jets-paralleles.test.js` (l. 362-365)
  n'appellent « suivante » qu'une fois, avant la dernière équipe.
- **Critère d'acceptation** : l'ordre du tour ne boucle plus ; `docs/API.md` dit le 409.

### moteur-1.4 — Lumière : la jauge repart à 0 (ex-étape 2)

- **Constat vérifié** : `lib/glTour.js › ajouterLumiereTx` (l. 2342). La boucle l. 2363
  `while (total >= palier) { total -= palier; … }` garde le reste et peut compter plusieurs paliers. Le JSDoc
  (l. 2339) dit « la jauge repart de zéro (le reste est gardé) ».
- **Changement attendu** : quand `total >= palier`, **un** palier est atteint et `total = 0`. Aligne le JSDoc. Le
  plafonnement de l'escalier (l. 2362 : `Math.min(total, palier - 1)` tant que le module `lumiere` est fermé) ne
  change pas.
- **Textes** : aucun.
- **Tests** : 95 + 10 → un recul, jauge à 0 ; 99 + 1 → un recul, jauge à 0 ; 50 + 250 → **un** recul, jauge à 0 ;
  escalier fermé : 95 + 10 → 99, aucun recul. Aucun test direct d'`ajouterLumiereTx` n'existe sur `main` : crée
  `tests/gl-lumiere-palier.test.js` ou greffe sur `tests/gl-tenir-team-spirit.test.js`.
- **Critère d'acceptation** : un seul évènement `lumiere_palier` par appel, quel que soit le dépassement.
- **Banc** : relance-le après cette étape et note la série « après étape 2 ».

## 5. Migration

Aucune.

## 6. Données et sources

Aucune source à lire. Ce lot ne touche aucun catalogue.

## 7. Vérifications propres au lot

- **Banc, régime « seuils »** :

  ```bash
  npm run gl:sim:db
  npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14
  npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14
  ```

  À noter dans ton rapport, **avant toute modification** (« avant étape 2 ») puis **après l'étape moteur-1.4**
  (« après étape 2 ») : les **reculs de voile dus à la Lumière, par chapitre**. Une baisse de ces reculs s'explique
  par la décision 2 : dis-le. Le lot moteur-5 reprendra ta série « après étape 2 » comme point de départ.
- Le changement du banc (étape moteur-1.3) ne concerne que la surface `tableau` : les deux scénarios ci-dessus
  jouent en `hybride` et en `tablette`. Lance donc aussi, une fois, après l'étape moteur-1.3,
  `npm run gl:sim -- --scenario tableau-pur --runs 1 --seed 14` (`tools/gl-sim/scenarios/base.js`) et vérifie qu'il
  va au bout sans compter de refus `FIN_DE_L_ORDRE`.
- e2e (sous le verrou) : ceux du tour, au moins `e2e/gl-tenir-tablettes.spec.js`. Tu ne changes pas leur texte.
- Captures : aucune.

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| `POST …/tenir/tour/equipe-suivante`, dernière équipe active | 200, la première équipe redevient active | 409 `FIN_DE_L_ORDRE`, « Toutes les équipes ont joué. » |
| Jauge de Lumière après un palier | reste gardé, plusieurs paliers possibles | 0, un seul palier |
| Diagnostic, durée d'un tour aux heures incohérentes | nombre négatif | `null` et note « horodatage incohérent » |
| Erreur du jour d'Olu | tirage avec remise | sans remise dans la partie |

## 9. Docs à mettre à jour dans ce lot

- `docs/API.md` : 409 `FIN_DE_L_ORDRE` sur `equipe-suivante`.
- `docs/GL_TENIR_A_DEUX_REGLES.md`, § 3 (l. 90), hors § 0.
- `.claude/skills/gl-*` : seulement une phrase devenue fausse, s'il y en a (« le reste est gardé », l'ordre qui
  boucle). Sur `main`, aucune n'a été trouvée hors du JSDoc de `ajouterLumiereTx`.
- Pour le § 0 des règles (à recopier dans ton rapport, pas dans les règles) : « 19/11 : au palier, la jauge de
  Lumière repart à 0. » ; « 23/11 : correctifs de la partie 16 (heures des tours, erreur du jour sans répétition,
  fin de l'ordre au tableau). »

## 10. Hors périmètre

| Ce que ce lot ne fait pas | Lot qui le fait |
| --- | --- |
| Message d'état périmé « L'équipe vient de jouer. Voici où vous en êtes. » (ex-étape 11) | ecrans-1 |
| Bouton « Le voile avance » à la place d'« Équipe suivante » pour la dernière équipe (ex-étape 17, part écran) | ecrans-4 |
| Lumière venue de la Trame plafonnée à un palier par chapitre | moteur-5 |
| Lignes d'erreur d'Olu du plateau 1 (6 lignes) | contenu-1 |
| Erreur du jour visible des élèves | ecrans-2 |
| `time_zone` de la connexion MySQL | hors chantier (ForêtMap) |

## 11. Pour Oliv

**À relire**

- « Toutes les équipes ont joué. » (message du refus au tableau).
- « horodatage incohérent » (note du diagnostic).

**À savoir**

- Tant que le lot ecrans-4 n'est pas fusionné, au tableau, le bouton « Équipe suivante » reste affiché pour la
  dernière équipe et répond « Toutes les équipes ont joué. ». Il faut alors passer au voile.
- Les heures déjà enregistrées de travers (partie 16, tour 2) ne sont pas réécrites : le diagnostic les affiche
  « horodatage incohérent ».

**À faire après la vague**

- Rien pour ce lot (ni réglage, ni catalogue, ni image).
