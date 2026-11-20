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
| S3      | Tablette 1 : moteur de la carte du moment | à faire                 | —                                                                                   |
| S4      | Tablette 2 : branchement                  | à faire                 | —                                                                                   |
| S5      | Console (étape 5)                         | à faire                 | —                                                                                   |
| S6      | Accueil, docs, clôture (étapes 6 et 7)    | à faire                 | —                                                                                   |

Sessions `bis` : aucune. Sessions lancées : 2 sur 8 au plus (la tentative de S2 par tâche
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

## Ce que la session suivante doit savoir

### Pour S3 et S4 (tablette)

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
