# G&L — écrans de séance : fichier d'état

Mémoire entre les sessions du chantier décrit dans
[`GL_ECRANS_DE_SEANCE_PROMPT.md`](./GL_ECRANS_DE_SEANCE_PROMPT.md) (à lire en premier, § 00).

**Depuis le 20/11 à 21 h UTC (demande d'Oliv : « merge tout ce qui est possible et on enchaîne
les lots ») : un lot fini est fusionné sans attendre les suivants.** La session S1
(orchestratrice) fige chaque lot fini sur une branche `claude/gl-ecrans-de-seance-lot<n>`, en
ouvre la PR, la fusionne quand sa CI est verte, et lance la session suivante sans attendre.
Pour chaque session, cela veut dire :

- au début, `git rebase origin/main` comme le dit le § 00 : les lots déjà fusionnés
  disparaissent du rebase, c'est normal ;
- **à la fin de ton lot, ajoute ta propre entrée de CHANGELOG** sous `[Non publié]`
  (« Modifié — G&L : écrans de séance, lot <n> (…) », au-dessus des précédentes) et la note de
  doc de référence si ton lot se voit à l'écran : n'attends pas S6 ;
- ne fusionne rien toi-même et ne touche pas aux branches `…-lot<n>` ;
- la PR #712 reste la PR en brouillon du travail en cours ; le dernier lot passera par elle.
  **Changement de plan du 20/11 au soir (demande d'Oliv : « merge et continue »).** Le lot de S1
  est fusionné sur `main` par la PR [#711](https://github.com/oliviera999/ForetMap/pull/711), avec
  sa propre entrée de CHANGELOG et sa note dans `docs/reference/gl/guide-du-mj.md`. La suite
  (S2 à S6) continue sur la **même branche** `claude/gl-ecrans-de-seance`, repartie de `main`, et
  dans une **nouvelle PR en brouillon** :

- **la PR de la suite est la [#712](https://github.com/oliviera999/ForetMap/pull/712)**, en
  brouillon (ouverte par S2 : « feat(gl): écrans de séance — projection, tablette, console,
  accueil ») ; chaque session en met à jour le tableau d'avancement ; S6 la réécrit selon le § 9
  du prompt et la passe en « prête » ;
- là où le prompt dit « la PR brouillon ouverte dès la session 1 », lire « la PR de la suite » ;
- la description finale (§ 9) couvre tout le chantier : elle cite la PR #711 pour le lot de S1 ;
- l'entrée de CHANGELOG de S6 s'ajoute à celle du lot 1, déjà sous `[Non publié]` (ou déjà
  rangée sous une version par le bump automatique) : ne pas la réécrire ;
- sauf nouvelle demande d'Oliv, **rien d'autre ne se fusionne** avant la CI verte de la PR de
  la suite et sa décision.

## Sessions

| Session | Lot                                       | État                    | Commits                                                                             |
| ------- | ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| S1      | Préparation, textes, adresse, plateau     | faite, fusionnée (#711) | `8272b2e08` (prompt, captures), `e898eff3c` (étape 1), `552754187` (étape 2) + état |
| S2      | Projection (étape 3)                      | faite                   | `4416079` (étape 3) + commits d'état                                                |
| S3      | Tablette 1 : moteur de la carte du moment | faite                   | `c46fd3b` (lot), `9fe1eb9` (relecture garde-fous), `ae693b4` (CHANGELOG) + état     |
| S4      | Tablette 2 : branchement                  | à faire                 | —                                                                                   |
| S5      | Console (étape 5)                         | à faire                 | —                                                                                   |
| S6      | Accueil, docs, clôture (étapes 6 et 7)    | à faire                 | —                                                                                   |

Sessions `bis` : aucune. Sessions lancées : 3 sur 8 au plus (la tentative de S2 par tâche
planifiée, arrêtée sans rien faire, ne compte pas).

### Relais : c'est la session S1 qui lance les suivantes (constat du 20/11, 19 h 25 UTC)

La tâche planifiée « G&L écrans de séance — S2 » s'est bien déclenchée, mais sa session ne
pouvait **pas pousser** sur le dépôt (dépôt non attaché, ni `add_repo` ni outil de
planification) : elle s'est arrêtée sans rien faire. Une tâche planifiée créée depuis une
session ne porte ni dépôt ni connecteur. Le relais du § 00 du prompt est donc remplacé :

- la session **S1 reste l'orchestratrice** : elle lance chaque session suivante avec le dépôt
  attaché (`create_session`, branche `claude/gl-ecrans-de-seance`), surveille la branche et
  lance la suivante quand la ligne de la session en cours passe à `faite` ;
- **une session qui finit** met ce fichier à jour, pousse, met à jour la PR, **puis
  s'arrête**. Elle ne planifie rien elle-même (si l'outil existe, ne pas s'en servir : deux
  relais feraient deux sessions sur le même lot) ;
- une session `bloquée` l'écrit ici si elle peut pousser, et s'arrête : S1 le verra.

---

## S1 — faite (20/11/2026, sur `main` v1.253.4, `1d24be74f`)

### Ce qui est fait

- **Prompt et état** versés ; le prompt est exclu de Prettier (`.prettierignore`) pour rester
  mot pour mot.
- **Captures « avant »** : `docs/captures/ecrans-de-seance/avant/` (22 écrans des e2e
  `gl-tenir-tablettes`, `gl-tenir-escalier`, `gl-tenir-defis-trame`, plus la connexion à 1440×900
  et 390×844, quatrième de couverture dépliée). `docs/captures/tenir-v2/` est resté tel quel.
- **Étape 1** : textes de connexion du § 5.1 ; passe d'adresse ; module unique des phases
  `src/gl/constants/tenirPhases.js` ; assistant de sort (« Lancer : Sentier », « Ne pas
  lancer ») ; test de contenu `tests/content/gl-adresse-ecran-equipe.test.js`.
- **Étape 2** : `GLGameBoard` et `GLMapView` reçoivent `presentation` (`standard`, `tenir`,
  `projection`) ; `GLPctMapCanvas` reçoit `zoomControls` (`complet` | `recentrer`) ;
  `GLBoardChrome` reçoit `masque`. **Aucun point de montage ne s'en sert encore.**

### Lignes de texte changées (à reporter dans la PR finale, § 9.3)

Passées au **vous** (l'écran parle à l'équipe) :

| Où                                           | Avant                                                           | Après                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GLTenirEquipeView` (aucun tour)             | Aucun tour ouvert : attends le prof.                            | Le prof ouvre bientôt le tour.                                                              |
| `GLTenirEquipeView` (fouille)                | … · touche le plateau pour fouiller                             | … · touchez le plateau pour fouiller                                                        |
| `GLTenirEquipeView`, `tenirTextes` (verdict) | Une page dort ici : réponds à sa question.                      | Une page dort ici : répondez à sa question.                                                 |
| `GLCarnetClasseView`                         | Cette page a pâli pour ton équipe (n %).                        | Cette page a pâli pour votre équipe (n %).                                                  |
| `GLBestiairePanel` (après proposition)       | Chimère proposée : ton professeur la relit avant de l’afficher. | Chimère proposée : le prof la relit avant de l’afficher.                                    |
| `GLBestiairePanel` (bestiaire vide)          | Le bestiaire est encore vide : propose la première chimère.     | … : proposez la première chimère. (compte) / Le bestiaire est encore vide. (tablette)       |
| Olu `olu-pf-main`                            | … Tu vois ce que fait ton camarade ; … ce sera peut-être toi.   | … Vous voyez ce que fait votre camarade ; à la prochaine action, cet écran reprend la main. |
| Olu `olu-pf-trame` (**choix sans demander**) | … Une réussite, et une page de plus pour ton carnet.            | … Une réussite, et une page de plus pour votre carnet.                                      |

Gardées au **tu** (liste blanche du test) : `olu-28` (« Secrétaire, à toi »), `olu-pf-marche`,
`olu-pf-lettre`. Aussi au tu, hors des sources contrôlées : `MESSAGE_SPECTATEUR`
(`src/shared/glMainCore.js`, dit à un élève sur son compte) et `encorePagesDeVeillee`
(`tenirTextes.js`, veillée personnelle).

Connexion (au **tu**) : accroche « Quatre mondes, une année, un carnet à sauver. », phrase
d'appel et quatrième de couverture du § 5.1, mot pour mot (sans les `**` du prompt, qui
marquaient les passages changés).

Phases : « Tour 1 — À vous de jouer » (écran d'équipe, projection) ; console
« Tour 1 · À vous de jouer · tablette », infobulle « Phase « jeu » » sur le titre.

### Choix faits sans demander

1. `olu-pf-trame` passe au vous : la ligne se dit à la clôture du tour, à toute la classe. Le
   prompt ne la citait ni d'un côté ni de l'autre. **À relire par Oliv.**
2. « Aucun tour ouvert : attends le prof. » devient tout de suite « Le prof ouvre bientôt le
   tour. » (le texte prévu pour l'état `attente` de l'étape 4, constante `PHASE_AUCUN_TOUR`).
3. Bestiaire vide : la tablette d'équipe ne dit plus « proposez… », puisqu'elle ne peut pas
   proposer (`canPropose` faux).
4. Console : l'infobulle du terme technique est posée sur le titre entier (`title` du `h2`,
   `data-testid="gl-tour-titre"`), pas sur un `span` autour du mot : les tests lisent le titre
   d'un seul tenant.
5. La projection garde « En attente du tour » quand aucun tour n'est ouvert : S2 réécrit son
   bandeau et tranchera.
6. Test d'adresse : en plus de « tu / ton / ta / tes / toi », il attrape « t’… », « attends »,
   « réponds », « choisis ». Il contrôle aussi les **mots interdits** (`glGardeFousCore`) dans
   les mêmes sources, la connexion et le pied de l'assistant de sort.
7. Présentation `tenir` et `projection` : aucun outil du plateau classique (ni barre d'actions,
   ni dé virtuel, ni compteur de tours, ni bouton de musique). La musique de zone garde son
   bouton dans `AppGL` (hors plateau).
8. Projection : les pions d'équipe deviennent des `span` (classe
   `gl-board-team-pin--statique`), pour qu'il n'y ait vraiment **aucun** bouton.
9. Une capture « connexion » a été ajoutée aux captures « avant » (non demandée en S1, mais le
   texte change dès l'étape 1).

### Constats du § 3 : état après S1

| #   | État                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K4  | **Corrigé** (écran d'équipe, projection, console).                                                                                                                     |
| K10 | **Corrigé.** Rien à changer dans `GLAuthView.jsx` : son seul texte (« Connecte-toi… ») tutoyait déjà ; tout le reste venait de `authCover.js`.                         |
| K12 | **Corrigé.**                                                                                                                                                           |
| K13 | **Corrigé** pour les sources citées. Reste un tutoiement servi par le serveur : voir « À savoir pour S4 ».                                                             |
| K5  | Préparé (prop `presentation="projection"`), à brancher par S2.                                                                                                         |
| —   | Les numéros de ligne du § 3 ont peu bougé : entre `4076fda57` et `1d24be74f`, aucun fichier G&L du § 4 n'a changé (seuls `src/gl/main.jsx` et des fichiers `shared/`). |

### Écarts trouvés dans le code et dans l'environnement

- **Pas de branche ni de PR du lot 4** (moteur `pct-map`) au 20/11 : `GLPctMapCanvas` a pu
  recevoir sa prop. Le moteur partagé (`src/shared/pct-map/`) n'est pas touché.
- **PR #707** est fusionnée ; aucune PR ouverte ne touche G&L, `CHANGELOG.md` ou une migration.
- **Fiche CPT** (`docs/coordination/cpt-2026-11.md`) encore sur `main` : notre PR est autonome,
  donc entrée **directe** dans `CHANGELOG.md` (pas de `changelog.d/`), écrite par S6 (étape 7).
  Aucune session ne touche `package.json` ni une garde `tests/*-guard.test.js`.
- **Cliquet d'accessibilité** (`tests/a11y-static-guard.test.js`) : `GLGameBoard.jsx` porte une
  dette inventoriée (`aria-selected` sur le bouton d'un pion). La déplacer dans un objet la
  cache au contrôle et fait échouer le test (« dette éteinte »). **Ne pas réécrire ce bouton**,
  et ne pas régénérer l'inventaire (l'environnement le refuse) : ajouter à côté.
- **Cliquet des styles en ligne** : pour une position, passer par des propriétés
  personnalisées (`style={{ '--gl-pin-x': … }}`) et laisser la feuille poser `left` / `top`.
- **Budget du bundle** : entrée ForêtMap à **1 529,1 Ko pour un plafond de 1 530** (mesuré en
  S1, build de production). Marge de 0,9 Ko : tout ajout dans `src/shared/` importé par
  l'accueil ForêtMap peut faire tomber le cliquet (S5 touche `GuidedTourOverlay`).
  `npm run check:bundle` exige `NODE_ENV=production npm run build`.

### Lancer les e2e dans le conteneur (à refaire à chaque session)

Le Chromium préinstallé (`/opt/pw-browsers/chromium`, build 1243) n'est pas celui que le
Playwright du dépôt attend (1248), et `ffmpeg` manque. **Ne pas** lancer `playwright install`.
Poser cette config **hors du dépôt** (dossier temporaire de la session) et la passer avec `-c` :

```js
// pw.config.js (hors dépôt)
const path = require('path');
const ROOT = '/home/user/ForetMap';
const base = require(path.join(ROOT, 'playwright.config.js'));
module.exports = {
  ...base,
  testDir: path.join(ROOT, 'e2e'),
  globalSetup: path.join(ROOT, 'e2e/global-setup.js'),
  globalTeardown: path.join(ROOT, 'e2e/global-teardown.js'),
  webServer: base.webServer ? { ...base.webServer, cwd: ROOT } : undefined,
  outputDir: path.join(ROOT, 'test-results'),
  use: {
    ...base.use,
    trace: 'off',
    video: 'off',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
};
```

```bash
npm run build                      # les e2e servent dist/ (jamais versionné)
npx playwright test -c <dossier>/pw.config.js --project=chromium e2e/gl-tenir-*.spec.js --retries=0
git checkout -- docs/captures/tenir-v2   # les e2e y réécrivent leurs captures
```

- `.env` du conteneur : `DB_NAME=foretmap_test`. Les e2e et `npm test` partagent donc la même
  base : **jamais les deux en même temps**.
- Les captures des e2e sont à la taille de la fenêtre. Pour une pleine page, copier le spec
  sous un nom temporaire avec `fullPage: true` et une sortie hors dépôt, puis le supprimer.
- Banc : créer la base une fois (`CREATE DATABASE foretmap_sim`), puis `npm run gl:sim:db`.

### Vérifications de S1 (toutes vertes)

| Commande                                                                        | Résultat                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run lint`                                                                  | 0 erreur (320 avertissements, déjà là)                                      |
| `npm run format:check`                                                          | vert                                                                        |
| `npm run test:ui`                                                               | 816 fichiers, 6 237 tests                                                   |
| `npm test`                                                                      | 6 600 tests ; seul écart, le cliquet a11y, corrigé puis rejoué vert (8 / 8) |
| `npm run test:content`                                                          | 154 tests                                                                   |
| `npm run build`, `npm run check:runtime`                                        | conformes                                                                   |
| `NODE_ENV=production npm run build && npm run check:bundle`                     | JS 1 529,1 Ko (plafond 1 530), CSS 376,8 Ko (plafond 380)                   |
| e2e `gl-tenir-tablettes`, `-ecrans-relus`, `-escalier`, `-defis-trame`          | 6 / 6                                                                       |
| e2e `gl-intro`, `gl-foundations`, `gl-game-flow`, `gl-responsive-accessibility` | 14 / 14                                                                     |

**Chiffre du banc, référence « avant »** (pris sur la branche après S1 : `lib/`, `routes/` et
`migrations/` sont identiques à `main`, seuls deux textes d'Olu diffèrent) :

```
npm run gl:sim -- --scenario tablette-parallele-absences --seed 1
ok · 562 appels · P3 : 5 séances, tenues 9/10, pâlies 0, voile 75 %
séances 5, voile 75 %, pâlies 0 %, tenues 90 %, carnet 0 %, gnomes 60 %, Gini 0,06, Matthieu 0,09
attendus 8/11 (manqués : equipesSousVoile, carnetComplet, partGnomes)
```

S6 relance la même commande : les mêmes chiffres sont attendus.

---

## S2 — faite (20/11/2026, sur `main` v1.254.0, `f72493c`)

Lot : étape 3, la projection en mode tableau (K5). Un commit de code (voir le tableau), plus les
commits d'état. `main` n'a pas bougé pendant la session : aucun rebase.

### Ce qui est fait

- **`GLProjectionView`** : une grille plein écran (`100dvh`, `overflow: hidden`) — bandeau
  (partie, tour et phase, case du voile, sablier), plateau à gauche (≈ 70 %,
  `presentation="projection"`), colonne de droite (équipes en pastilles, Lumière en jauge,
  carnet en pages), trois faits marquants en bas. Corps `clamp(20px, 1.4vw, 32px)`, tout le
  reste en `em`. Bloc « Projection, mode tableau » à la fin de `src/gl/styles/gl-tenir.css`
  (les anciennes règles `.gl-projection__*` éparses ont disparu).
- **Carte plein écran** : à la clôture du tour, « À la prochaine séance » remplace l'écran
  (page du Passeur, indice endormi, défis à préparer), avec « Voir le plateau ».
- **`GLTourJournal`** : prop `marquants` (+ `FAITS_MARQUANTS`, `faitsMarquants`). Le filtre se
  fait à l'écran : la route du journal ne change pas, on lit 100 évènements pour en garder 3.
- **`GLVoileLayer`** : prop `variante="projection"` → `.gl-voile-layer--projection` (bande plus
  opaque, contour `gl-voile-contour`), passée par `GLGameBoard` en présentation `projection`.
- **`GLBoardMarkers`** : prop `statique` (présentation `projection`) → les cases sont des `span`
  `role="img"`, plus des boutons. **Écart avec S1** : la présentation `projection` gardait un
  bouton par case (le test de S1 simulait `GLBoardMarkers`). C'est le e2e qui l'a montré.
- **Pions agrandis au tableau** : mascottes (`--gl-board-mascot-h`), nom d'équipe et distance
  au voile, sous `.gl-projection__board` seulement.
- **Docs de référence** mises à jour dans le même lot (comportement visible) :
  `guide-du-mj.md` (nouvelle note « Écrans de séance : la projection, mode tableau », plus trois
  phrases devenues fausses), `roles-et-connexion.md` (§ La projection),
  `chapitres-et-progression.md` (« révélée par …, trouvée par …, tenue par … »).
- **Tests** : `tests-ui/gl/GLProjectionView.test.jsx` (mode tableau, carte, souffle, camp),
  nouveau `GLTourJournal.test.jsx`, `GLChasseLayer.test.jsx` (variante du voile),
  `GLBoardMarkers.test.jsx` (statique), `GLGameBoardPresentation.test.jsx` (voile au tableau) ;
  nouveau e2e `e2e/gl-tenir-projection.spec.js` ; `gl-tenir-ecrans-relus` et
  `gl-tenir-escalier` adaptés.
- **Captures « après »** : `docs/captures/ecrans-de-seance/apres/projection-1920x1080.png`,
  `projection-souffle-1920x1080.png`, `projection-accroche-1920x1080.png` (écrites par le e2e).
  L'« avant » de l'accroche est `avant/escalier-accroche-projection.png` ; il n'y a pas
  d'« avant » de la projection en jeu (S1 n'en avait pas pris).

### Choix faits sans demander (à reporter dans la PR finale, § 9.3)

1. **Sans tour ouvert**, la projection dit « Le prof ouvre bientôt le tour. » (`PHASE_AUCUN_TOUR`,
   comme l'écran d'équipe) au lieu de « En attente du tour » (choix 5 de S1, tranché).
2. **Les indices du carnet ne sont plus au tableau.** Le plateau 3 a dix pages, chaque indice
   fait 75 à 100 caractères : ils ne tiennent pas à côté des équipes sans défilement. Une tuile
   par page : son titre une fois trouvée, « Page n » sinon, et son état. L'indice d'**une** page
   endormie reste sur la carte « À la prochaine séance ». **À relire par Oliv** : si les énigmes
   doivent rester au tableau, la piste la plus simple est une énigme qui tourne dans la colonne
   de droite (non faite : hors lot).
3. **Une tuile dit une seule équipe** : « tenue par B » pour une page tenue (plus « trouvée par
   A · tenue par B »), « trouvée par A », « révélée par A ». « pâlie » et « réparée » sans équipe.
4. **Titres au double** : le nom de la partie (bandeau) et le titre de la carte plein écran.
   Les intertitres de la colonne (« Carnet de la classe ») restent à la taille du corps, sinon
   ils ne tiennent pas sur une ligne dans 30 % de l'écran.
5. **Faits marquants** : exactement la liste du prompt (`page_trouvee`, `page_tenue`,
   `defi_case_releve`, `defi_trame_reussi`, `voile_avance`, `arrivee_camp`, `peripetie`).
   Restent hors liste, à ajouter d'une ligne si Oliv le veut : `carnet_complet`, `voile_recul`,
   `page_reparee`, `lumiere_palier`. Le texte d'un fait est coupé à trois lignes.
6. **La carte s'ouvre à toute clôture de tour** (partie non close), même sans page du Passeur
   ni indice : elle porte aussi les **défis à préparer**, qui n'avaient plus d'autre place.
7. **Pendant « Le voile avance »**, la page du Passeur ne s'affiche plus d'office (le plateau
   doit rester visible) : un bouton « La page du jour », dans le bandeau, l'ouvre en plein écran.
   Même bouton au camp. C'est un ajout par rapport au prompt, pour ne pas perdre la page.
8. **Au camp**, « Ce qui change au prochain chapitre » prend la place des faits marquants (en
   bas) ; pas de carte d'office. Les défis à préparer ne se voient alors que dans la carte « La
   page du jour » (donc pas du tout s'il n'y a pas de page du Passeur : cas rare, assumé).
9. **Deux boutons sur la projection** (« Voir le plateau », et celui qui rouvre la carte) : ils
   ne changent que l'affichage. Le plateau, lui, n'a plus aucun bouton.
10. **L'équipe active** (surface « tableau ») est cernée dans la colonne de droite.
11. **Fenêtre étroite** (moins de `lg`, 1024 px) : les blocs s'empilent et la page défile.
    **Vidéoprojecteur moins haut** (`max-height: 899px`) : les tuiles du carnet passent sur une
    ligne. Une requête en hauteur n'est pas une bascule de l'échelle (la garde ne lit que les
    largeurs).
12. **Mascottes de la colonne** : `GLMascotAvatar`, donc l'image du pack si le catalogue est
    chargé, le dessin de repli sinon. La projection (session invitée) ne charge pas le
    catalogue : elle montre le dessin de repli, comme son plateau le faisait déjà.

### Constats du § 3 : état après S2

| #   | État                                                                                    |
| --- | --------------------------------------------------------------------------------------- |
| K5  | **Corrigé** : la projection a son style, son plateau n'a ni titre, ni zoom, ni panneau. |
| K4  | Rien de neuf : la projection lit toujours `titreDuTour`.                                |

### Mesures à l'écran (Chromium, pire cas forcé : 4 équipes aux noms longs avec deux mentions, Lumière, 10 pages, 3 faits longs)

| Fenêtre     | Corps   | Page défile | Colonne de droite                     | Plateau     |
| ----------- | ------- | ----------- | ------------------------------------- | ----------- |
| 1920 × 1080 | 26,9 px | non         | tient (825 / 825)                     | 1304 × 825  |
| 2560 × 1440 | 32 px   | non         | tient                                 | 1745 × 1137 |
| 1366 × 768  | 20 px   | non         | tient (578 / 578)                     | 927 × 578   |
| 1280 × 800  | 20 px   | non         | tient (610 / 610)                     | 867 × 610   |
| 1280 × 720  | 20 px   | non         | dépasse de 38 px : elle défile seule  | 867 × 530   |
| 1024 × 768  | 20 px   | non         | dépasse de 207 px : elle défile seule | 687 × 517   |
| 900 × 700   | 20 px   | oui (voulu) | empilée                               | 872 × 558   |

Le cas ordinaire (noms courts, peu de mentions) n'a été mesuré qu'à 1920 × 1080, par le e2e. La
carte « À la prochaine séance » y tient avec une page du Passeur de 1 000 caractères et quatre
défis ; à 1280 × 720 et à 1024 × 768, avec ce même contenu, elle défile dans son cadre (jamais
la page). Les pages du Passeur du corpus vont de 250 à 1 370 caractères.

### Écarts trouvés dans le code et dans l'environnement

- **`public/maps/map-foret.svg` et `map-n3.svg` sont des SVG mal formés** (octet Latin-1 dans
  un fichier sans déclaration d'encodage ; texte après la racine) : Chromium ne les affiche pas.
  Or `map-foret.svg` est l'image de repli du plateau G&L (`resolveGlBoardImageUrl`). En prod les
  plateaux ont leur image, donc rien ne se voit ; les jeux d'essai, eux, n'en ont pas. **Hors
  lot, à signaler à Oliv.** Le e2e de la projection sert donc sa propre image de plateau
  (`page.route('**/maps/map-foret.svg')`), sans toucher à l'API.
- **Avertissements de lint** : 321 sur `main` v1.254.0 (S1 en notait 320 sur v1.253.4) ; le lot
  n'en ajoute aucun.
- **La page du Passeur s'affiche brute** : sauts de ligne gardés (`white-space: pre-line` sur la
  carte), mais les astérisques d'italique du corpus (`*(…)*`) restent visibles. C'était déjà le
  cas avant le lot ; à traiter avec le contenu, pas ici.
- Rien d'autre n'a bougé sur `main` ; aucune autre PR ouverte.

### Vérifications de S2

| Commande                                                                        | Résultat                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Avant le lot : `npm test`, `npm run test:ui`                                    | 6 600 tests (2 ignorés) ; 816 fichiers, 6 237 tests    |
| `npm run lint`                                                                  | 0 erreur (321 avertissements, déjà là)                 |
| `npm run format:check`                                                          | vert                                                   |
| `npm run test:ui`                                                               | 817 fichiers, 6 254 tests                              |
| e2e `gl-tenir-*` (projection, ecrans-relus, escalier, tablettes, defis-trame)   | 7 / 7                                                  |
| e2e `gl-intro`, `gl-foundations`, `gl-game-flow`, `gl-responsive-accessibility` | 14 / 14                                                |
| `npm test`                                                                      | 6 600 tests, 6 598 verts, 2 ignorés, 0 échec           |
| `npm run test:content`                                                          | 154 tests                                              |
| `NODE_ENV=production npm run build`, `check:bundle`, `check:runtime`            | JS 1 529,1 Ko (plafond 1 530), CSS 376,8 Ko ; conforme |

Le budget du bundle n'a pas bougé (la projection vit dans le morceau G&L, pas dans l'entrée
ForêtMap). Le banc n'a pas été relancé : le lot ne touche ni `lib/`, ni `routes/`, ni `migrations/`, ni
`data/` (S6 le relance).

## S3 — faite (20/11/2026, sur `main` v1.254.0, `f72493c`)

Lot : étape 4, partie 1 — le moteur de la carte du moment et les trois composants de l'écran
d'équipe, **sans les brancher**. Deux commits de code (le lot, puis les corrections de la
relecture garde-fous), plus les commits d'état.
`main` n'a pas bougé pendant la session : aucun rebase. **Rien de visible ne change** : aucun
point de montage n'importe encore ces fichiers (donc ni doc de référence ni CHANGELOG dans ce
lot ; S4 et S6 s'en chargent).

### Ce qui est fait

- **`src/gl/utils/glTenirMoment.js`** (fonctions pures, sans React) :
  - `momentDeLEquipe(entrée)` → `{ etat, geste, role, texte, libelle, detail, puces[], fouille,
sorts, presence, origine, spectateur }` : un seul état, le premier vrai de `ETATS_DU_MOMENT` ;
  - `retourDuMoment({ verdict, caseRetour })` : le retour à montrer (le plus récent), avec sa clé ;
  - `bandeauxDuMoment(…)` : les lignes au-dessus de la carte (état périmé, encordée, un seul dé,
    en retrait, sous le voile), chacune avec son `testId` ;
  - `estSousVoile`, `aucunGesteDuTour`, `tourEstJoue`, `casesEnPastilles` (numéro, pictogramme,
    libellé court),
    `boursesDeLEquipe` (pseudo coupé à 12 caractères), `empreinteDuTiroir` (pastille de nouveauté).
- **Deux hooks** : `useGlTenirRetour` (retour récent, « Continuer », effacement au changement de
  tour ou de phase) et `useGlTenirTiroir` (ouvert / fermé, section, nouveauté).
- **Trois composants** de `src/gl/components/tenir/` : `GLTenirBandeau`, `GLTenirMoment`,
  `GLTenirTiroir`. Aucun n'appelle une route lui-même (sauf les blocs déplacés, qui le faisaient
  déjà : défis, bestiaire, « ce qui change », demande d'appareil) ; ils reçoivent données et
  gestes par leurs props.
- **Style** : bloc « Écran d'équipe en trois choses » à la fin de `src/gl/styles/gl-tenir.css`
  (bandeau, carte du moment, tiroir). La **mise en page de l'écran** (deux colonnes, `100dvh`,
  feuille du bas) n'y est pas : elle vient avec le conteneur de S4.
- `GLDefisEntree` reçoit `boutonProps` (la carte y pose `data-geste="trame"`).
- `TENIR_VERDICT_TEXTES` (`tenirTextes.js`) devient la source unique des textes de fouille :
  `GLTenirEquipeView` l'importe (son `VERDICT_TEXTES` local a disparu). Le texte « pâlie » du
  module a été aligné sur celui que l'écran montrait (« Cette zone a pâli : les Gnomes savent la
  réparer. ») : rien ne change à l'écran.
- `tests/content/gl-adresse-ecran-equipe.test.js` relit aussi `glTenirMoment.js` (vous, jamais
  tu ; aucun mot interdit).
- **Tests** (100) : `tests-ui/gl/glTenirMoment.test.js`, `GLTenirMoment.test.jsx`,
  `GLTenirBandeau.test.jsx`, `GLTenirTiroir.test.jsx`, `useGlTenirMomentHooks.test.jsx`.
- **Relecture `gl-relecteur-garde-fous`** lancée sur le lot : aucun manquement dans les textes ;
  trois dans la logique d'affichage, corrigés (`9fe1eb9`, écarts 10 à 12 ci-dessous) ; ses
  remarques pour le branchement sont dans « Pour S4 ».

### Écarts avec le tableau du prompt (étape 4), et pourquoi

1. **`camp` passe devant `clos`.** Une partie close a presque toujours son dernier tour en phase
   `clos` : dans l'ordre du tableau, « Ce qui change » ne s'afficherait jamais.
2. **La phase `ouverture` n'avait pas d'état** : elle tombe dans `attente`, avec son propre texte
   (« Le tour s'ouvre : à vous de jouer dans un instant. »).
3. **Les défis de la Trame ne sont jamais le gros bouton** (`maintenantVousPouvez` les rend hors
   tour) : ils sont une puce — dans `geste` s'il reste de la place, et dans `clos`, `camp` et
   `attente`. Sans cela, la tablette hors tour perdait son entrée « Défis de la Trame ».
4. **`saisie_des` exige que le jet soit encore permis** (pas seulement `pending === 'lancer'`) :
   si un autre appareil de l'équipe a lancé, la saisie se referme seule. Elle a aussi une sortie,
   « Pas maintenant » (aucun état sans issue).
5. **Une fouille qui ouvre une question (`zone`) n'est pas un retour** : la question le dit déjà.
   Sinon, la question fermée, la carte disait « répondez à sa question » sans question.
6. **Un retour n'est montré que s'il est récent** : celui qui est déjà là quand l'écran s'ouvre
   n'est pas rejoué, et un changement de tour ou de phase l'efface (`useGlTenirRetour`). Sinon
   un retour oublié masquerait « Le voile avance. ».
7. **Une fouille en cours passe devant le retour** (« le geste suivant acquitte aussi »).
8. **L'élève qui regarde ce tour** (`tenir.spectateur`, compte d'un absent ou d'un élève en
   retrait) : l'état `joue` porte son message (`MESSAGE_SPECTATEUR`, au tu : il parle à un
   élève) au lieu de « Votre tour est joué. ». Le tableau ne le prévoyait pas.
9. **Sorts** : pas d'état à part. En état `geste`, « Jeter un sort » déplie `GLSortsParMoment`
   sous les boutons (`moment.sorts`), et le bouton devient « Fermer les sorts ».
10. **Une question ouverte ne se montre qu'en phase de jeu.** Les questions sont des états
    locaux des hooks (`useGlQuestionDeCase`, `useGlChasse`) que rien ne vide au changement de
    phase, alors que le serveur ferme « répondre » : la carte serait restée sur la question,
    devant « Le voile avance. », jusqu'à un « Fermer ».
11. **« Votre tour est joué. » ne se dit que si c'est vrai** (`tourEstJoue` : jet fait ou équipe
    au camp, et plus de fouille). Sinon, phase de jeu sans rien d'ouvert : « Pour l'instant,
    regardez le plateau. » (en hybride, la fenêtre de fouille du prof peut encore s'ouvrir). En
    surface **tableau**, où l'élève n'a aucun geste : « Le tour se joue au tableau. ».
12. **Le carnet du tiroir ne montre « Lire » que si le droit est servi** (prop `peutLire`,
    fermée par défaut).

### Choix faits sans demander (à reporter dans la PR finale, § 9.3)

1. **Textes nouveaux** (tous au vous, relus par le test de contenu) : « Votre tour est joué.
   Regardez les autres équipes. », « Le voile avance. », « Jet saisi : le prof valide. » (avant :
   « Jet saisi : en attente du clic du prof. »), « Le tour est terminé. », « Vous êtes au camp :
   le chapitre est terminé. », « Le tour s'ouvre : à vous de jouer dans un instant. »,
   « Touchez la carte · n fouilles », « Arrêter de fouiller » (avant : « Annuler la fouille »),
   « Continuer », « Pas maintenant », « Un seul dé ce tour-ci. », « En retrait jusqu'à la fin du
   tour. », « Votre mascotte est sous le voile. » (avant : « · sous le voile » après le compte
   des fouilles), « Relire l'écran » (nom de l'icône de reconnexion), « L'équipe (du nouveau) »,
   « Pour l'instant, regardez le plateau. », « Le tour se joue au tableau. ». **À relire par
   Oliv**, surtout les deux derniers (ajoutés après la relecture garde-fous).
   L'élève qui regarde le tour (`MESSAGE_SPECTATEUR`) lit son message dès la phase d'ouverture.
2. **Gros bouton** : « Répondre à la question », « Lancer les dés » / « Lancer le dé », « Fouiller »
   (+ « 2 fouilles »), « Lire » (+ « 1 page à lire et à faire tenir »), « Jeter un sort ». Les
   puces disent la même chose en court (« Répondre », « Fouiller · 2 fouilles »).
3. **Rôle au-dessus du bouton** : le rôle de `roleDuGeste` ; « Toute l'équipe » s'il n'y en a pas.
4. **Pastilles des cases** : pictogramme par type de case, la tonalité (`trame`, `souffle`)
   primant sur le type ; sans libellé de case, un mot (« Question », « Péripétie », « Souffle »,
   « Trame », « Défi », « Raccourci », « Frontière », « Camp », « Histoire », « Récit »,
   « Départ », « Étape »). Libellé coupé à 18 caractères, entier en infobulle.
5. **Pastille de nouveauté du tiroir** : elle s'allume quand le carnet (état d'une page), la
   réserve, les absents ou le nombre de défis changent, tiroir fermé. Pas les cases à venir
   (elles changent à chaque jet).
6. **Bandeau** : sur une ligne quand la place y est ; à 1024 px avec cinq bourses et le sablier,
   les bourses passent sous la phase (72 px de haut au pire). En dessous de 1024 px, elles ont
   leur ligne ; à 640 px et moins, elles sont dans le tiroir.
7. **Bord doré de la fouille** : il revient au **plateau** (« la carte » du prompt), donc à S4 ;
   la carte du moment porte seulement la classe `is-fouille` et un fond doré pâle sous
   « Touchez la carte ».
8. **Tiroir** : rien n'est rendu (ni lu sur le serveur) tant qu'il est fermé ; Échap et le retour
   du navigateur le ferment ; le focus revient au bouton. Il ne montre pas les demandes
   d'appareil (elles sont dans la carte du moment) : seulement le mot dit à l'élève qui regarde.

### Mesures à l'écran (Chromium, banc d'essai temporaire non versionné : bandeau + faux plateau à 62 % + carte du moment)

| Fenêtre    | Bandeau (5 bourses, sablier) | Carte du moment (état `geste`, 2 bandeaux, 3 puces, présences) | Page défile |
| ---------- | ---------------------------- | -------------------------------------------------------------- | ----------- |
| 1366 × 768 | 53 px                        | 495 × 357, tout visible                                        | non         |
| 1024 × 768 | 72 px                        | 365 × 357, tout visible                                        | non         |
| 768 × 1024 | 82 px                        | 296 × 405 (colonne étroite : voir « Pour S4 »)                 | non         |
| 390 × 844  | 84 px (sans bourses)         | 366 × 344 sous un plateau de 55 dvh                            | non         |

Aucun bouton sous 44 px. Les autres états (`question`, `retour`, `jet_suspens`, `saisie_des`,
`main_ailleurs`, `joue`, `clos`, `attente`, tiroir ouvert) ont été regardés à 1024 × 768 : le
plus haut est `geste` (357 px), le tiroir fait 448 px de large. Ces mesures sont à refaire par
S4 dans le vrai écran (e2e).

### Écarts trouvés dans le code et dans l'environnement

- **Deux gardes de points de bascule, deux listes** : `tests/breakpoints-guard.test.js` accepte
  `max-width: 639px`, `tests-ui/utils/breakpoints.test.js` non (sa liste : 480, 640, 641, 700,
  701, 720, 767, 768, 1023, 1024). Pour le téléphone, écrire **`max-width: 640px`** (accepté
  par les deux) et ne pas écrire son complément : allumer par défaut, éteindre dans la requête.
- **Garde typographique** (`tests/typography-tokens-guard.test.js`) : aucun `font-size` en `rem`
  littéral — `var(--text-sm)` … `var(--text-2xl)` (les `em` passent, S2 s'en servait).
- **PR #713** (shell ForêtMap chargé à la demande, en brouillon) : elle écrit en tête de
  `CHANGELOG.md` et **abaisse le budget du bundle à 775 Ko de JS et 372 Ko de CSS** pour
  l'entrée ForêtMap. Aucun fichier commun avec ce lot. Si elle est fusionnée avant S5 : la marge
  devient 4,9 Ko de JS et 2,2 Ko de CSS (mesures de sa description), et S6 aura un rebase sur
  la tête du CHANGELOG.
- Avertissements de lint : 321, comme sur `main` ; le lot n'en ajoute aucun.

### Vérifications de S3

| Commande                                                                   | Résultat                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Avant le lot : `npm run test:ui`, `npm test`                               | 817 fichiers, 6 254 tests ; 6 600 tests (2 ignorés)    |
| `npm run lint`                                                             | 0 erreur (321 avertissements, déjà là)                 |
| `npm run format:check`                                                     | vert                                                   |
| `npm run test:ui` (état final)                                             | 822 fichiers, 6 354 tests                              |
| `npm test`                                                                 | 6 600 tests, 6 598 verts, 2 ignorés, 0 échec           |
| Gardes statiques rejouées sur l'état final (a11y, bascules, jetons, 44 px) | 38 / 38                                                |
| `npm run test:content`                                                     | 154 tests                                              |
| `NODE_ENV=production npm run build`, `check:bundle`, `check:runtime`       | JS 1 529,1 Ko (plafond 1 530), CSS 376,8 Ko ; conforme |
| e2e `gl-tenir-*` (projection, ecrans-relus, escalier, tablettes, defis)    | 7 / 7 (aucun n'est touché : rien n'est branché)        |

`npm test` a tourné pendant que les corrections de la relecture s'écrivaient (elles ne touchent
que `src/gl/` et `tests-ui/`) : les gardes statiques, la suite UI, le lint, le build et les e2e
ont été rejoués ou lancés **après**. Les e2e réécrivent les captures de la projection
(`apres/projection-*.png`) : elles ont été remises telles quelles (`git checkout`). Le banc n'a
pas été relancé (ni `lib/`, ni `routes/`, ni `migrations/`, ni `data/` ne changent ; S6 le
relance). Un test du lot s'est montré instable une fois (deux retours de case horodatés à la
même milliseconde) : corrigé par un numéro d'ordre, puis rejoué six fois.

**CHANGELOG** : à la demande de la session orchestratrice (changement de mode du 20/11, 21 h
UTC : un lot fini est fusionné sans attendre les suivants), ce lot a sa propre entrée sous
`[Non publié]` — « Modifié — G&L : écrans de séance, lot 3 (le moteur de la carte du moment) ».
Pas de note de doc de référence : rien ne se voit à l'écran.

## Ce que la session suivante doit savoir

### Pour S4 (tablette, branchement)

**Le montage, en une fois.** `GLTenirEcranEquipe` reprend les hooks et les dérivations de
`GLTenirEquipeView` (lignes 60 à 290 : `tourApi`, `caseQuestion`, `olu`, `peripetie`, état
périmé, `mainAilleurs`, `round`, `maVue`, `maintenant`, `encordeePar`, `presence`,
`jetEnSuspens`, `jetEnAttente`) et remplace son rendu par :

```jsx
const membres = mates; // roster DÉJÀ filtré sur l'équipe (le roster d'un compte porte la classe)
const fouilles = chasse?.carnet?.fouilles || null;
const aLance = !!maVue?.hasRolledDiceThisRound;
const des = maVue?.desProchainJet || tenir.settings?.des_count || 2;
const tourCle = `${round?.number || 0}:${round?.phase || ''}`;
const { retour, acquitter } = useGlTenirRetour({
  verdict: chasse?.dernierVerdict,
  caseFeedback: caseQuestion.feedback,
  tourCle,
});
const tiroir = useGlTenirTiroir({
  empreinte: empreinteDuTiroir({ carnet: chasse?.carnet, reserve, absents: presence?.absents }),
});
const moment = momentDeLEquipe({
  peripetie,
  mainAilleurs,
  appareils: tenir.equipe?.appareils,
  questionCase: !!caseQuestion.question,
  questionChasse: !!chasse?.question,
  jetEnSuspens,
  saisieDes: pending === 'lancer',
  jetEnAttente,
  retour,
  maintenant,
  fouilleMode,
  fouillesRestantes: fouilles ? fouilles.restantes : null,
  des,
  sortsOuverts,
  phase: round?.phase || null,
  partieFinie: gameState?.game?.status === 'ended',
  spectateur: tenir.spectateur === true,
  surface: tenir.surface,
  tourJoue: tourEstJoue({ aLance, auCamp: !!maVue?.auCamp, fouilles }),
  presenceOuverte: !!presence,
  aucunGeste: aucunGesteDuTour({ aLance, fouilles }),
});
const lignes = bandeauxDuMoment({
  etatPerime,
  encordeePar,
  unDe: !!maVue?.unDe,
  desProchainJet: maVue?.desProchainJet,
  enRetrait: !!tenir.enRetrait,
  sousVoile: estSousVoile({
    fouilles,
    pathIndex: maVue?.pathIndex,
    voilePosition: tenir.state?.voilePosition,
  }),
});
const onGeste = (geste) => {
  acquitter(); // le geste suivant acquitte le retour
  if (geste === 'lancer') setPending('lancer');
  else if (geste === 'repondre')
    onRepondre ? onRepondre() : caseQuestion.presenter(questionDue.markerId);
  else if (geste === 'fouiller') chasse.setFouilleMode(true);
  else if (geste === 'lire') tiroir.ouvrir('carnet');
  else if (geste === 'jeter') setSortsOuverts((v) => !v);
};
```

puis `<GLTenirBandeau team round sablier membres tiroirOuvert={tiroir.ouvert} tiroirId
nouveaute={tiroir.nouveau} onTiroir={tiroir.basculer} reconnexion onReconnecter />`,
`<GLTenirMoment moment lignes gameId teamName settings={tenir.settings} equipe={tenir.equipe}
caseQuestion chasse jetEnSuspens des peripetie retour presence membres olu cleDeRelecture
occupe={tourApi.busy} erreurs={[tourApi.error, caseQuestion.error, chasse?.error]} onGeste
onArreterFouille onContinuer={acquitter} onOuvrirPiste onGarderJet onRelance onLancer
onQuitterSaisie onPasserPeripetie onPresences onArrivee onJeterSort onRecharger />` et
`<GLTenirTiroir ouvert={tiroir.ouvert} section={tiroir.section} id onFermer={tiroir.fermer}
gameId casesAVenir reserve chasse peutLire={!!perms.lire} tablette onChangerEquipe modules
presence membres spectateur occupe onPresences onArrivee cleDeRelecture />`. Les tests d'écran
de S3 montrent chaque prop en situation.

**À ne pas oublier en branchant** (relevé par la relecture garde-fous ou vu en écrivant) :

- **Vider les questions quand `tourCle` change** (`caseQuestion.fermer`, `chasse.clearQuestion`
  — attention, tous deux rendent la main au serveur ; un simple vidage local suffit). Le moteur
  ne les montre plus hors de la phase de jeu, mais une question périmée reviendrait au tour
  suivant.
- **`main_ailleurs` n'a aucun bouton** : garder la minuterie d'échéance (`mainEchue`,
  `GLTenirEquipeView` l. 144-164), sinon la carte reste sur « … prépare un sort… » après 60 s.
  Passer `mainAilleurs` (pas `mainServie`) au moteur.
- **`peripetie`** : garder le filtre « moins de 10 minutes » et `peripetiesPassees` ; passer
  `onPasserPeripetie` (le passage seul à 30 s en dépend).
- **`appareil`** : passer `onRecharger` (la relecture à l'échéance des 2 minutes en dépend).
- **`membres`** : `mates`, jamais `gameState.roster` brut (sinon une pastille par élève de la
  classe dans le bandeau).
- **`peutLire`** : `!!perms.lire` (réglage `lecture_pendant_tour` éteint : le carnet se consulte
  sans « Lire »). Hors tour sur la tablette, l'ancien écran montrait le carnet en lecture seule.
- **Bord doré de la fouille** : sur la zone du **plateau** (le conteneur lit `chasse.fouilleMode`
  ou `moment.fouille`) ; l'ancienne règle `.gl-tenir-equipe.is-fouille` (contour pointillé) part
  avec l'ancien écran.
- **Tiroir** : il est en `position: absolute` (`inset-inline-start: 0`, 28 rem de large) : son
  parent — la zone sous le bandeau — doit être en `position: relative`. À 640 px et moins il
  passe en `position: fixed` plein écran. Palier `--fm-z-panel` (sous les modales : la
  péripétie et l'assistant de sort passent devant).
- **Surface « tableau »** : l'écran d'équipe d'un compte y est monté aussi (`AppGL`, onglet
  `maps`). Le moteur y dit « Le tour se joue au tableau. » ; garde-fou 12 (« au tableau, rien ne
  change sans décision ») : à signaler dans la PR, ou garder l'ancien rendu pour cette surface.
- **Dés tirés par le serveur** (`des_mode_effectif = 'serveur'`) : le gros bouton « Lancer les
  dés » ouvre `saisie_des`, qui montre « Lancer 2 dés » — deux touchers, comme avant. S4 peut
  lancer directement dans `onGeste('lancer')` quand le mode est `serveur` (une ligne) ; non fait
  ici, le prompt gardant `GLTourDesSaisie`.
- **Chaque fouille coûte un toucher de plus** qu'avant (verdict → « Continuer » → « Fouiller ») :
  c'est le tableau du prompt. Si Oliv veut l'éviter, la piste est de montrer le verdict
  « froid / tiède / chaud » comme une ligne au-dessus du bouton au lieu d'un état `retour`.
- **`jet_attente` cache les autres gestes** pendant que le prof valide (tableau du prompt) ;
  l'ancien écran n'affichait qu'une mention.
- **Colonne d'action à 768 px en paysage** : avec « ≈ 38 %, min 320 px », elle ferait 292 px ;
  la carte du moment y tient (mesurée à 296 px), mais les puces passent sur deux lignes.
- **Ligne d'Olu `olu-pf-comptes`** (« Le Marché et le Seuil s'ouvrent depuis le compte de
  chacun. ») : à ajouter au catalogue quand la phrase quitte `GLTeamSessionView` (voir le skill
  `gl-tenir-catalogue` : JSON, exemple, synchronisation, test de contenu).
- **Contrats de test gardés** par les composants : `gl-tenir-maintenant` (carte en état
  `geste`), `data-geste` sur le gros bouton, chaque puce et « Arrêter de fouiller »,
  `gl-tenir-jet-suspens`, `gl-tenir-garder-jet`, `gl-tenir-relance`, `gl-tenir-piste-reponse`,
  `gl-tenir-case-retour`, `gl-tenir-un-de`, `gl-tenir-encorde`, `gl-tenir-etat-perime`,
  `gl-tenir-reserve`, `gl-tenir-cases-a-venir`, `gl-tenir-fouilles`, `gl-tenir-main`,
  `gl-tenir-spectateur`, `gl-tenir-appareils`, `gl-sablier-phase`, `gl-olu-bulle`. **Nouveaux** :
  `gl-tenir-bandeau`, `gl-tenir-phase`, `gl-tenir-bourses`, `gl-tenir-tiroir-bouton`,
  `gl-tenir-tiroir-nouveau`, `gl-tenir-reconnexion`, `gl-tenir-moment` (+ `data-etat`),
  `gl-tenir-moment-<etat>`, `gl-tenir-puces`, `gl-tenir-lignes`, `gl-tenir-retour`,
  `gl-tenir-continuer`, `gl-tenir-quitter-saisie`, `gl-tenir-tiroir`, `gl-tenir-tiroir-fermer`,
  `gl-tenir-tiroir-carnet`, `gl-tenir-changer-equipe`. `data-testid="gl-tenir-equipe"` (racine)
  reste à poser par le conteneur. **Disparus avec l'ancien écran** : `data-geste-possible`
  (liste « Maintenant, vous pouvez… »), les boutons grisés.
- Les tests qui montent `GLTenirEquipeView` (`GLTenirEquipeView.test.jsx`, `GLDeuxEcrans`,
  `GLUneMonnaie`, `GLEscalier`, `tenir-chaines-interdites`) sont à porter sur le nouveau
  conteneur.

**Notes de S1 et S2, toujours valables :**

- **Ne pas se fier au test `GLGameBoardPresentation`** pour compter les boutons du plateau : il
  simule `GLBoardMarkers`. En présentation `tenir`, les cases restent des boutons (c'est voulu :
  on les touche pour fouiller). Vérifier dans le e2e.
- `GLBoardMarkers` a maintenant une prop `statique` (projection seulement) : ne pas la passer en
  `tenir`.
- Les mentions d'équipe (« sous le voile », « ce tour-ci : un seul dé »…) ont une fonction pure
  dans `GLProjectionView.jsx` (`mentionsDEquipe`) : les bandeaux d'une ligne de la carte du
  moment disent la même chose avec d'autres données (`maVue.unDe`, `fouilles.sousVoile`) ; à
  réunir seulement si cela simplifie, sinon laisser.
- `PHASE_AUCUN_TOUR` est maintenant le texte « sans tour » de la projection aussi : l'état
  `attente` de la carte du moment doit dire les mêmes mots.
- Le e2e de la projection montre comment mesurer « rien ne défile » et « rien n'est coupé »
  (`mesures(page)` dans `e2e/gl-tenir-projection.spec.js`) : à reprendre pour l'assertion
  « carte visible sans défilement » de S4.

- `GLMapView` transmet `presentation="tenir"` : un seul bouton « Recentrer » (nommé), gestes
  gardés. Vérifié dans un vrai navigateur dans un conteneur de 520 px.
- **À traiter en S4** : « Ce qui change au prochain chapitre » est servi par le serveur
  (`lib/glCeQuiChange.js`). Quand l'équipe est connue, il dit « Ton peuple : Tu passes chez
  les … » et « Tes nouveaux sorts », y compris sur une tablette d'équipe. S1 ne l'a pas touché
  (texte de `lib/`, hors du périmètre de l'étape 1). En déplaçant `GLCeQuiChange` dans l'état
  `camp`, décider : soit la route rend la forme « vous » à une session d'équipe (la fonction a
  déjà les deux formes), soit on garde le tu en l'ajoutant aux exceptions signalées.
- `GLTenirEquipeView` : les libellés de phase passent par `titreDuTour` ; le texte sans tour
  est `PHASE_AUCUN_TOUR`. Les `VERDICT_TEXTES` du composant doublonnent `TENIR_VERDICT_TEXTES`
  (`tenirTextes.js`, lu seulement par un test) : à réunir quand le bloc `retour` sera déplacé.

### Pour S5 (console)

- `GLTourJournal` est partagé entre la console (journal complet, `limit={40}`) et la projection
  (`marquants`, `limit={3}`). Le journal de la console n'a pas changé ; ne pas retirer la prop.

- Le titre de la console porte déjà la phase en mots d'élève (`phaseConsole`). Le bandeau
  réduit du mode séance peut réutiliser `titreDuTour`.
- Budget du bundle : voir plus haut (0,9 Ko de marge sur l'entrée ForêtMap).

### Pour S6 (docs)

- `docs/reference/gl/guide-du-mj.md` (vers les lignes 348 à 352) parle de « la phase
  « jeu » » : dire les nouveaux mots (« À vous de jouer »), le terme technique restant en
  infobulle. Vérifier aussi `roles-et-connexion.md` et `presentation.md` pour la connexion.
- `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md` cite les anciennes lignes d'Olu : c'est un
  audit daté, on n'y touche pas.
- CHANGELOG : entrée directe sous `[Non publié]`, « Modifié — G&L : écrans de séance », pour
  les lots de S2 à S6 ; celle du lot 1 existe déjà (fusion de #711).
- `docs/reference/gl/guide-du-mj.md` porte déjà la note « Écrans de séance : les mots à
  l'écran (20 novembre 2026) » : la compléter (tablette, console) plutôt que d'en ouvrir une
  autre. **La projection est déjà documentée** par S2 (note « Écrans de séance : la projection,
  mode tableau », plus `roles-et-connexion.md` et `chapitres-et-progression.md`) : relire, ne
  pas refaire.
- Captures « après » de la projection : déjà dans `apres/` (jeu, souffle, accroche). Les e2e
  les réécrivent à chaque passage ; recommiter seulement si l'écran a changé.
- Avant de passer la PR en « prête » : lancer les relecteurs `gl-relecteur-garde-fous` sur le
  diff complet (S2 ne l'a pas fait : ses textes nouveaux sont « La page du jour », « Voir le
  plateau », « Lumière de la classe », « Page n », les libellés d'accessibilité « Les équipes »
  et « Faits marquants » ; le test de contenu d'adresse et de mots interdits les relit).
- CHANGELOG, à écrire par S6 pour la projection : mode tableau sans défilement à 1920 × 1080 ;
  carte « À la prochaine séance » plein écran ; trois faits marquants ; voile cerné ; cases du
  plateau non cliquables ; indices du carnet retirés du tableau ; « Le prof ouvre bientôt le
  tour. ».
