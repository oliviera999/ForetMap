# G&L — écrans de séance : fichier d'état

Mémoire entre les sessions du chantier décrit dans
[`GL_ECRANS_DE_SEANCE_PROMPT.md`](./GL_ECRANS_DE_SEANCE_PROMPT.md) (à lire en premier, § 00).

**Depuis le 20/11 à 21 h UTC (demande d'Oliv : « merge tout ce qui est possible et on enchaîne
les lots ») : un lot fini est fusionné sans attendre les suivants.** La session S1
(orchestratrice) fige chaque lot fini sur une branche `claude/gl-ecrans-de-seance-lot<n>`, en
ouvre la PR, la fusionne quand sa CI est verte, et lance la session suivante sans attendre.
Pour chaque session, cela veut dire :

- au début, **`git merge origin/main`** (pas de `rebase`, contrairement au § 00 : la branche
  porte des fusions, un rebase rejouerait leurs conflits), puis un push simple, sans
  `--force` ;
- **à la fin de ton lot, ajoute ta propre entrée de CHANGELOG** sous `[Non publié]`
  (« Modifié — G&L : écrans de séance, lot <n> (…) », au-dessus des précédentes) et la note de
  doc de référence si ton lot se voit à l'écran : n'attends pas S6 ;
- ne fusionne rien toi-même et ne touche pas aux branches `…-lot<n>` ;
- la PR #712 reste la PR en brouillon du travail en cours ; le dernier lot passera par elle.

Lots fusionnés : lot 1 = PR #711, lot 2 = PR #714, lot 3 = PR #715, lot 4 = PR #716 et
lot 5 = PR #717 (`main` v1.257.0). **Lot 6 (S6) : fini, poussé sur
`claude/gl-ecrans-de-seance` ; il passe par la PR #712, passée en « prête », que S1 fusionnera
quand sa CI sera verte.** Le chantier est clos côté sessions : il ne reste que cette fusion et
ce qu'Oliv doit faire ensuite (section S6, « Après la fusion »).

**Décision attendue d'Oliv (laissée par S4)** : en surface « tableau », l'ancien écran d'équipe
est gardé tel quel (garde-fou 12). « Tout au tableau », touché en pleine séance, fait donc
repasser les tablettes à l'ancien écran. Détail et marche à suivre dans la section S4.

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

| Session | Lot                                       | État                    | Commits                                                                                        |
| ------- | ----------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| S1      | Préparation, textes, adresse, plateau     | faite, fusionnée (#711) | `8272b2e08` (prompt, captures), `e898eff3c` (étape 1), `552754187` (étape 2) + état            |
| S2      | Projection (étape 3)                      | faite                   | `4416079` (étape 3) + commits d'état                                                           |
| S3      | Tablette 1 : moteur de la carte du moment | faite                   | `c46fd3b` (lot), `9fe1eb9` (relecture garde-fous), `ae693b4` (CHANGELOG) + état                |
| S4      | Tablette 2 : branchement                  | faite, fusionnée (#716) | `c9810be61` (lot), `0e471cbd3` (relecture garde-fous), `af1aa1f5c` (fusion de `main`) + état   |
| S5      | Console (étape 5)                         | faite, fusionnée (#717) | `b5db4e5` (lot), `b5f0079` (relecture garde-fous), `159de3e` (fusion de `main`) + état         |
| S6      | Accueil, docs, clôture (étapes 6 et 7)    | faite                   | `7825d1b5c` (étape 6), `48e285688` (étape 7 et clôture), `9eb96ee2b` (fusion de `main`) + état |

Sessions `bis` : aucune. Sessions lancées : 6 sur 8 au plus (la tentative de S2 par tâche
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

## S4 — faite (20/11/2026, sur `main` v1.254.0, puis fusion de `main` v1.255.0)

Lot : étape 4, partie 2 — le branchement de l'écran d'équipe en trois choses. Un commit de
code (le lot), un commit de corrections après la relecture garde-fous, plus les commits d'état.
`main` a bougé pendant la session (fusion du lot 3, v1.255.0) : fusionné à la fin
(`git merge origin/main`), sans rebase.

### Ce qui est fait

- **`GLTenirEcranEquipe`** (`src/gl/components/tenir/`) : le conteneur — `GLTenirBandeau`, la
  zone du plateau (reçu par la prop `board`), `GLTenirMoment` dans la colonne d'action, et
  `GLTenirTiroir` posé par-dessus le plateau. `data-testid="gl-tenir-equipe"` sur la racine,
  `gl-tenir-plateau` et `gl-tenir-action` sur les deux zones.
- **Deux points de montage, un seul écran** : `GLTeamSessionView` (tablette, **tour ouvert ou
  non** : l'ancien bloc « Le tour n'est pas ouvert » a disparu avec l'en-tête de session) et
  `AppGL`, onglet du plateau (fonction de rendu `ongletDuPlateau`). Tous deux passent
  `<GLMapView presentation="tenir" />` en `board`. `AppGL` pose `gl-app--ecran-equipe` sur sa
  racine tant que l'écran est affiché.
- **`useGlTenirEquipe`** (`src/gl/hooks/`) : toute la logique de l'ancien écran (instantané du
  tour, question de case, Olu, péripétie, état périmé, main d'un autre appareil et son échéance,
  version d'état, tour servi, cases à venir, réserve, présences, jet en suspens…), **sortie telle
  quelle** de `GLTenirEquipeView`. Les deux écrans la lisent : une correction vaut pour les deux.
- **`useGlTempsReelCoupe`** : vrai quand le socket de la session reste déconnecté plus de 4 s ;
  au retour de la connexion, l'écran se relit une fois. L'icône « Relire l'écran » du bandeau
  ne se montre que dans ce cas, ou tant que le message d'état périmé est affiché (12 s).
- **Mise en page** (fin de `gl-tenir.css`, bloc « Mise en page de l'écran d'équipe ») : deux
  colonnes à partir de `lg`, ou de `md` en paysage (62 fr / 38 fr, 320 px au moins) ; sinon
  plateau en haut (55 fr) et feuille d'action en bas (45 fr). La tablette prend `100dvh` ; sur
  un compte, `.gl-app--ecran-equipe` verrouille la fenêtre et l'écran prend ce que la barre de
  l'application laisse. Bord doré du plateau en fouille (`.gl-tenir-ecran__plateau.is-fouille`).
- **Olu, `olu-pf-comptes`** : « Le Marché et le Seuil s'ouvrent depuis le compte de chacun. »
  est une ligne du catalogue (`data/gl/tenir/olu-lignes.json`, 101 lignes ; clé `comptes` dans
  `PREMIERE_FOIS_CLES`). **Aucun évènement ne la désigne** : c'est la tablette qui la dit
  (`useGlTenirOlu`, option `ligneDeLEcran`), une fois par onglet (`sessionStorage`), quand un
  tour est ouvert et que le Marché n'est pas fermé pour la partie. Repli local si le catalogue
  ne la sert pas (`OLU_LIGNE_COMPTES`, `tenirTextes.js`).
- **Ce qui est ouvert ne survit pas au tour** : quand `tourCle` change, la saisie des dés et la
  liste des sorts se referment, et les questions s'oublient (`caseQuestion.oublier`,
  `chasse.oublierQuestion` : un vidage local, sans appel au serveur).
- **Pastille de nouveauté du tiroir** : `useGlTenirTiroir` accepte une empreinte `null` (« pas
  encore lu »). Sans cela la pastille s'allumait à chaque ouverture de l'écran, quand le carnet
  finissait de charger.
- **Docs de référence** : `guide-du-mj.md` (note « Écrans de séance : l'écran d'équipe en trois
  choses », plus deux phrases devenues inexactes), `roles-et-connexion.md` (§ La tablette
  d'équipe). `docs/API.md` et `data/gl/tenir/README.md` pour la ligne d'Olu. **CHANGELOG** :
  entrée « lot 4 » sous `[Non publié]`.
- **Tests** : `GLTenirEcranEquipe.test.jsx` (32), `useGlTempsReelCoupe.test.jsx` (4) ;
  `GLTeamSessionView`, `GLDeuxEcrans`, `GLEscalier`, `GLUneMonnaie`, `tenir-chaines-interdites`
  portés sur le nouvel écran ; `useGlTenirMomentHooks` (empreinte `null`). e2e
  `gl-tenir-tablettes` et `gl-tenir-escalier` adaptés ; `gl-tenir-defis-trame` passe sans
  retouche. Nouvelle fixture `e2e/fixtures/gl-plateau.fixture.js` (image de plateau de
  substitution, voir l'écart de S2).
- **Captures « après »** (`docs/captures/ecrans-de-seance/apres/`, écrites par les e2e) :
  `tablette-geste-`, `-fouille-`, `-retour-`, `-tiroir-`, `-jet-en-suspens-`,
  `-main-ailleurs-1024x768.png`, `compte-eleve-geste-1024x768.png`, `telephone-geste-` et
  `telephone-tiroir-390x844.png`.

### Surface « tableau » : l'ancien écran est gardé (décision par défaut, à trancher par Oliv)

Garde-fou 12 : « au tableau, rien ne change sans décision ». Faute de décision, **quand
`tenir.surface === 'tableau'`, les deux points de montage rendent exactement ce qu'ils
rendaient avant** : `GLTenirEquipeView` (les cinq boutons, grisés) puis le plateau classique ;
sur la tablette, l'en-tête de session, « Le tour n'est pas ouvert », « Actualiser » et la
phrase sur les comptes. `GLTenirEquipeView.jsx`, ses styles et ses tests
(`GLTenirEquipeView.test.jsx`, inchangé) restent donc dans le dépôt.

Ce que cela donne en classe, et qu'Oliv doit savoir : **« Tout au tableau », touché en pleine
séance, fait repasser les tablettes de l'écran en trois choses à l'ancien écran empilé** ; elles
reviennent au nouveau quand le prof rend la main. Le moteur de S3 sait pourtant dire « Le tour
se joue au tableau. » dans le nouvel écran : si Oliv le préfère, il suffit de retirer la
condition `surface !== 'tableau'` aux deux points de montage (`auTableau` dans
`GLTeamSessionView`, `ecranEquipeEnTrois` dans `AppGL`), puis de supprimer `GLTenirEquipeView`,
son test et les règles `.gl-tenir-equipe__gestes`, `.gl-tenir-maintenant` devenues orphelines.

### Écarts avec le prompt (étape 4), et pourquoi

1. **`GLTenirEquipeView` ne disparaît pas** (voir ci-dessus) : il sert la surface « tableau ».
2. **L'état `camp` de la carte du moment ne se produit pas aujourd'hui.** Le compte ne monte
   l'écran d'équipe que pour une partie `live` (c'était déjà vrai de l'ancien écran : son
   `GLCeQuiChange` était du code mort), et la tablette perd sa session quand la partie se clôt.
   « Ce qui change » se lit au Seuil et à la projection. La question laissée par S1 (« Ton
   peuple : Tu passes… » dit à une tablette d'équipe) est donc **sans objet** : rien n'a été
   touché dans `lib/glCeQuiChange.js`.
3. **Mise en page étroite : 55 % de la zone, pas 55 dvh.** Le plateau prend 55 % de ce qui
   reste sous le bandeau (et sous la barre de l'application, sur un compte). Avec 55 dvh fixes,
   la feuille d'action d'un téléphone connecté à un compte n'aurait eu que 172 px.
4. **Fenêtre trop basse : la page défile.** Téléphone couché (moins de 768 px de large et de
   560 px de haut), et sur un compte toute fenêtre de moins de 600 px de haut : l'écran n'est
   plus verrouillé, le plateau garde 240 px au moins. Sans cela le plateau d'un compte faisait
   24 px de haut à 844 × 390.
5. **Tiroir sur téléphone : sous le bandeau, pas « plein écran ».** Il couvre le plateau et la
   feuille d'action ; le bandeau (et son bouton « L'équipe ») reste visible. `position: fixed`
   ne tenait pas : la zone de contenu d'`AppGL` porte une transformation (`fade-in`).
6. **`olu-pf-comptes` est dite par l'écran, pas par le serveur** (voir plus haut) : aucune
   route, aucun évènement, aucune table ne change. Elle se dit une fois par onglet de tablette,
   pas une fois par partie.
7. **Dés tirés par le serveur : toujours deux touchers** (« Lancer les dés », puis « Lancer 2
   dés » dans `GLTourDesSaisie`), comme avant. La piste de S3 (lancer directement) n'a pas été
   prise : le prompt garde la saisie, et un toucher de trop vaut mieux qu'un jet parti par
   mégarde.

### Choix faits sans demander (à reporter dans la PR finale, § 9.3)

1. **Hors tour, la tablette garde l'écran en trois choses** : le plateau, « Le prof ouvre
   bientôt le tour. » (ou « Le tour est terminé. » avec le défi à préparer) et l'entrée « Défis
   de la Trame ». Le carnet se consulte dans le tiroir. Le texte « Le tour n'est pas ouvert.
   Regardez le plateau et le carnet de la classe en attendant le prof. » n'existe plus que
   pour la surface « tableau ».
2. **Le nom de la classe** (« · Sixième B ») n'est plus affiché sur la tablette : il vivait
   dans l'en-tête de session, supprimé (K3).
3. **« Changer d'équipe »** est dans le tiroir. Tant que l'écran n'est pas là (chargement,
   panne du serveur), un en-tête de secours le garde à portée.
4. **Pendant le tour, le défi à préparer n'est visible que dans le tiroir** (il revient dans
   la carte du moment tour terminé) : c'est le tableau du prompt. L'ancien écran le montrait
   en permanence.
5. **Les six cases à venir ne se voient plus sans ouvrir le tiroir** (prompt). À surveiller en
   classe : elles servaient à choisir entre lancer tout de suite et jeter un sort d'abord.
6. **Reconnexion** : délai de grâce de 4 s avant de montrer l'icône ; relecture automatique au
   retour de la connexion (sinon l'icône disparaîtrait au moment où elle sert).
7. **`olu-pf-comptes`** : `seance_escalier` 4 (la séance où le Marché ouvre), expression
   `explique`. Pas dite tant que `settings.marche === false`.
8. **Sur un compte, le bouton de coupure de la musique de zone** passe dans les commandes
   flottantes quand l'écran d'équipe est affiché (le plateau épuré n'a plus le sien).
9. **Commandes flottantes d'un compte** (aide, notifications) : la colonne d'action leur laisse
   la place en fin de défilement ; sur un téléphone, une gouttière à droite (la carte du moment
   y fait 310 px de large au lieu de 366).
10. **« Touchez la carte · 2 fouilles »** passe en `--text-lg` (il coupait après le point
    médian dans une colonne de 365 px).

### Contrats de test changés (à reporter dans la PR finale, § 9.4)

| Avant                                                         | Après                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| un geste fermé : bouton `[data-geste]` **grisé** (`disabled`) | bouton **absent** ; `[data-geste]:disabled` ne trouve jamais rien                                      |
| cinq boutons toujours présents                                | un gros bouton `.gl-tenir-moment__gros[data-geste]`, puis trois puces au plus dans `gl-tenir-puces`    |
| `[data-geste-possible]`, « Maintenant, vous pouvez… » (`h4`)  | disparus ; le rôle est dans `.gl-tenir-moment__role` (gros bouton) et en `title` des puces             |
| bouton « Actualiser »                                         | disparu ; `gl-tenir-reconnexion` seulement si coupure ou état périmé                                   |
| `gl-team-session-attente`, `gl-team-session-comptes`          | disparus (sauf surface « tableau ») ; `gl-tenir-moment-attente` / `-clos`, et la bulle d'Olu           |
| `gl-tenir-cases-a-venir`, `gl-tenir-reserve`, `gl-defis-case` | dans le tiroir : ouvrir `gl-tenir-tiroir-bouton` d'abord (le défi revient dans la carte, tour terminé) |
| « Lancer » (`name: 'Lancer', exact`)                          | « Lancer les dés » / « Lancer le dé »                                                                  |
| « Jet saisi : en attente du clic du prof. »                   | « Jet saisi : le prof valide. » (`gl-tenir-moment-jet_attente`)                                        |
| l'écran d'équipe n'existe sur la tablette que tour ouvert     | il est là dès que la partie est chargée ; attendre `gl-tenir-moment[data-etat="geste"]` pour le tour   |
| en retrait, sous le voile : mentions dans la ligne de phase   | lignes `gl-tenir-en-retrait`, `gl-tenir-sous-voile` au-dessus de la carte                              |

Nouveaux : `gl-tenir-plateau`, `gl-tenir-action`, `data-surface` sur la racine, classe
`gl-app--ecran-equipe`.

### Constats du § 3 : état après S4

| #   | État                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | **Corrigé** : à 1024 × 768 le plateau commence à 53 px (tablette) ; sur un compte, à 241 px, sous la barre de l'application (voir « Pour S5 »). |
| K2  | **Corrigé** : gestes fermés absents ; ordre répondre, lancer, fouiller, lire, sorts.                                                            |
| K3  | **Corrigé** : un seul bandeau, sans mot de surface.                                                                                             |
| K13 | Rien de neuf (le tutoiement de « Ce qui change » n'atteint pas l'écran d'équipe : écart 2).                                                     |

Tous trois restent vrais en surface « tableau » (ancien écran gardé).

### Mesures à l'écran (Chromium, vrai écran, partie d'essai : 2 membres, tour en jeu, état `geste` avec 2 puces et « Il manque quelqu'un ? »)

| Fenêtre    | Écran    | Bandeau | Plateau (y, hauteur) | Colonne ou feuille d'action             | Page défile |
| ---------- | -------- | ------- | -------------------- | --------------------------------------- | ----------- |
| 1024 × 768 | tablette | 53 px   | 53, 715 × 635 large  | 389 px de large, tout visible           | non         |
| 1366 × 768 | tablette | 53 px   | 53, 715              | 519 px, tout visible                    | non         |
| 1280 × 800 | tablette | 53 px   | 53, 747              | 486 px, tout visible                    | non         |
| 768 × 1024 | tablette | 82 px   | 82, 518              | feuille de 424 px, tout visible         | non         |
| 390 × 844  | tablette | 78 px   | 78, 421              | feuille de 345 px, tout visible         | non         |
| 844 × 390  | tablette | 83 px   | 83, 307              | 321 px ; 24 px à faire défiler          | non         |
| 640 × 360  | tablette | 78 px   | 78, 252              | sous le plateau                         | oui (voulu) |
| 1024 × 768 | compte   | 53 px   | 241, 483             | 389 px, tout visible                    | non         |
| 1366 × 768 | compte   | 53 px   | 241, 483             | 519 px, tout visible                    | non         |
| 768 × 1024 | compte   | 82 px   | 320, 363             | feuille de 297 px ; Olu à faire défiler | non         |
| 390 × 844  | compte   | 78 px   | 171, 311             | feuille de 254 px ; Olu à faire défiler | non         |
| 844 × 390  | compte   | 83 px   | 322, 443             | à côté du plateau                       | oui (voulu) |

Aucun bouton sous 44 px. Les e2e contrôlent 1024 × 768 (tablette et compte) et 390 × 844
(compte) ; les autres lignes ont été mesurées par une spec temporaire, non versionnée.

### Relecture `gl-relecteur-garde-fous` sur le lot, et ce qui en a été fait

Aucun manquement dans les textes (mots interdits, adresse, cœurs, « Non »), ni sur les
garde-fous 6 (bourses), 11 (attentes) et 12 (surface « tableau » : rendu comparé prop par prop
à celui d'avant, identique). Deux manquements sur le garde-fou 9 (« l'écran cache un geste
fermé »), tous deux hérités de l'ancien écran et refusés sans perte par le serveur ; corrigés
dans le second commit, chacun avec son test (les tests échouent si l'on retire la correction) :

1. **Le plateau restait armé pour la fouille** quand le droit se fermait (phase qui change,
   main prise ailleurs, dernière fouille jouée par un autre appareil) : chaque toucher partait
   au serveur, qui refusait. Le mode fouille se désarme maintenant seul, et au changement de
   tour.
2. **L'élève qui regarde le tour** (absent ou en retrait, sur son compte) voyait « Garder ce
   jet », « Accepter » une tablette et les présences, alors que le serveur lui refuse tout
   (403). Ces trois blocs ne lui sont plus montrés ; son message reste dans la carte.

Remarques suivies : l'onglet du plateau d'un compte dont l'équipe n'est pas dans la partie
garde le plateau classique (sinon l'écran, donc le plateau, disparaissait) ; une demande
d'appareil échoit localement, comme la main ; la saisie des dés se referme quand « lancer » se
ferme sans changement de tour ; `olu-pf-comptes` retirée du catalogue (`actif: false`) ne se
dit plus (le repli ne sert que si le catalogue n'a pas pu être lu).

Remarque **non traitée** (logique déplacée telle quelle, hors lot) : la péripétie n'a pas de
sortie au changement de phase, et ses dix minutes ne sont recalculées qu'à l'arrivée d'un
évènement. « On passe » reste toujours disponible.

### Écarts trouvés dans le code et dans l'environnement

- **Le temps réel fonctionne dans les e2e** : les écrans suivent le tour sans rechargement.
  Les specs gardent quand même une sortie (`attendreEtat` recharge la page si l'état attendu
  n'arrive pas), puisqu'il n'y a plus de bouton « Actualiser » à toucher.
- **`position: fixed` ne vaut rien sous la zone de contenu d'`AppGL`** : `.gl-main-inner` porte
  l'animation `fade-in` (`animation-fill-mode: both`, avec une transformation), qui en fait le
  bloc conteneur des éléments fixes. À savoir pour tout panneau « plein écran » monté dans un
  onglet ; `GLDefisEntree` s'en sort par un portail vers `document.body`.
- **`.gl-topbar` a `min-height: 0`** : dans une colonne flex à hauteur fixe, elle se tasse et
  ses boutons débordent. D'où `.gl-app--ecran-equipe > :not(.gl-main) { flex-shrink: 0 }`.
- **`npm test` compte 6 594 tests sans `npm run build`, 6 600 après** : six tests du pack
  mascotte ne s'enregistrent que si le miroir `lib/visit-pack/` est à jour. Ce n'est pas une
  régression quand le chiffre bouge de six.
- **Deux lignes « première fois » sans déclencheur** : `olu-pf-main` (« Un seul écran joue à la
  fois… ») n'est désignée par aucun évènement du serveur (le test dit : « attend le lot
  plusieurs appareils ») — elle **ne se dit donc jamais** aujourd'hui, alors que S1 l'a
  réécrite. À signaler à Oliv ; `olu-pf-comptes` montre comment un écran peut dire lui-même
  une ligne.
- **Captures `docs/captures/tenir-v2/`** : les e2e y réécrivent leurs images, qui montreraient
  désormais le nouvel écran. Elles ont été remises telles quelles (`git checkout`), comme aux
  sessions précédentes : les images « après » sont dans `ecrans-de-seance/apres/`. S6 dira si
  `tenir-v2` doit être rafraîchi.
- `main` : fusion du lot 3 (PR #715, v1.255.0) pendant la session ; seul le numéro de version
  a changé pour la branche. PR ouvertes : #712 (celle-ci) et #713 (shell ForêtMap, voir S3).
- Avertissements de lint : 321, comme sur `main` ; le lot n'en ajoute aucun (celui de
  `useGlTenirEquipe.js` a suivi le code sorti de `GLTenirEquipeView.jsx`).
- **Deux e2e G&L échouent déjà sur `main`** dans ce conteneur : `gl-users-admin.spec.js`,
  « admin GL / MJ GL peut voir comme un joueur… » (le clic sur « Voir comme » ne rend pas la
  main à Playwright, alors que la prise de contrôle a bien lieu). Rejoués sur `main` v1.255.0
  dans un arbre de travail séparé : mêmes deux échecs. Hors lot ; à regarder par S5 ou S6
  (les sessions précédentes ne lançaient pas ce spec).
- **Le banc n'est pas reproductible au chiffre près, même à graine fixée.** Cinq exécutions de
  `tablette-parallele-absences --seed 1` (quatre sur la branche, dont trois sur base fraîche,
  une sur `main` v1.255.0) : 541 à 582 appels, pages tenues 7 à 9 sur 10, voile 25 à 100 %. Le
  scénario joue les équipes en parallèle : l'ordre d'arrivée des requêtes change sans doute le
  tirage (cause non cherchée). Toutes finissent « ok », en 5 séances ; sur les trois où la
  ligne a été relevée (deux sur la branche, une sur `main`) : **attendus 8/11 (manqués :
  equipesSousVoile, carnetComplet, partGnomes)**, comme chez S1. S6 ne retrouvera donc pas
  « 562 appels » : comparer les attendus, pas les décimales.

### Vérifications de S4

| Commande                                                                      | Résultat                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Avant le lot : `npm run test:ui`, `npm test`                                  | 822 fichiers, 6 354 tests ; 6 594 tests (2 ignorés), avant tout build  |
| `npm run lint`                                                                | 0 erreur (321 avertissements, déjà là)                                 |
| `npm run format:check`                                                        | vert                                                                   |
| `npm run test:ui` (état final, `main` v1.255.0 fusionné)                      | 824 fichiers, 6 395 tests                                              |
| `npm test`                                                                    | 6 600 tests, 6 598 verts, 2 ignorés, 0 échec                           |
| Gardes statiques et test du catalogue d'Olu, rejoués sur l'état final         | 99 / 99                                                                |
| `npm run test:content`                                                        | 154 tests                                                              |
| `NODE_ENV=production npm run build`, `check:bundle`, `check:runtime`          | JS 1 529,1 Ko (plafond 1 530), CSS 376,8 Ko ; conforme                 |
| e2e `gl-tenir-*` (tablettes, escalier, defis-trame, ecrans-relus, projection) | 7 / 7                                                                  |
| e2e `e2e/gl-*.spec.js`, tous                                                  | 61 verts, 2 ignorés, **2 échecs déjà présents sur `main`** (ci-dessus) |
| Banc `tablette-parallele-absences --seed 1` (base `foretmap_sim` fraîche)     | ok, attendus 8/11 ; chiffres non reproductibles (ci-dessus)            |
| Import des catalogues sur la base du banc (`gl:sim:db`)                       | `refuses: []`                                                          |

`npm test` a tourné sur le premier commit du lot ; les corrections de la relecture ne touchent
que `src/gl/` et `tests-ui/`, et la suite UI, les gardes statiques, le build et les e2e ont été
rejoués **après**, sur l'état fusionné. Le budget du bundle n'a pas bougé (l'écran d'équipe vit
dans le morceau G&L).

## S5 — faite (20/11/2026, sur `main` v1.255.0, `3979351`)

Lot : étape 5, la console du prof (K6, K7, K8, K9). Un commit de code (le lot), un commit de
corrections après la relecture garde-fous, plus les commits d'état. `main` a bougé pendant la
session (fusion du lot 4, PR #716, v1.256.0) : fusionné à la fin (`git merge origin/main`), sans
rebase ; seul le numéro de version différait.

### Ce qui est fait

- **Mode séance (K7)** : `src/gl/utils/glModeSeance.js` — l'écran du tour se **déclare**
  (`useDeclarerModeSeance`), la barre **lit** (`useGlModeSeance`, dans `AppGL`, qui passe
  `seance` à `GLTopBar`). Ni contexte ni prop à travers le morceau paresseux de la console.
  Barre réduite : nom de la partie, « Tour 2 — À vous de jouer » (`titreDuTour`), bouton
  « Menu » ; dépliée : la barre d'avant, plus « Réduire le menu ». Le menu déplié ne survit pas
  à l'écran du tour.
- **Ordre de `GLTourScreen` (K6)** : bandeau (titre, boutons du tour, « Lien de projection »,
  « Quitter l'écran du tour », durées, erreur, puis une ligne d'outils : sablier et tablettes) →
  **demandes** → équipes → dés à valider, jets en attente, fenêtre de fouille, « Le voile » →
  bulle d'Olu et **« Qui a trouvé l'erreur d'Olu ? »** → absences, Team Spirit, « Clore le
  chapitre ».
- **`GLClassLinkPanel`** : une ligne (`resumeDesTablettes`, bouton `gl-class-link-resume`),
  dépliée au toucher, et d'office tant qu'une tablette attend ou que la feuille du QR est
  ouverte. Dépliée : les demandes d'abord, puis « QR de la classe » et les tablettes.
- **`GLTourDesSaisie`** : avec `allowLibre`, l'avance libre attend derrière « Corriger la
  position… » ; « Annuler » referme ; le formulaire se referme quand le serveur a accepté.
- **Erreurs réseau (K8)** : `apiGL` reçoit `onNetworkError` (`glNetworkFailureMessage`) ;
  `src/shared/networkFailureMessages.js` porte les phrases communes aux deux produits
  (`src/services/api.js` les réexporte, texte et comportement inchangés). Identifiant de
  requête : retiré du message pour toute session qui n'est pas celle d'un prof
  (`err.requestId` le garde) ; `GLErreurTexte` le montre en petit dans les bannières de la
  console (`GLTourScreen`, `GLGameMasterConsole`, `GLAppBanners`).
- **`lazyAvecReprise`** (`src/gl/utils/lazyAvecReprise.jsx`) : deux nouvelles tentatives
  (0,7 s puis 1,8 s), chargement borné à 20 s, puis `GLMorceauIndisponible`
  (« L'application vient d'être mise à jour », « Recharger »). Les cinq `lazy()` de
  `GLGameMasterConsole` y passent.
- **Visite guidée (K9)** : `GuidedTourOverlay` — au dernier pas, plus de « Fermer » ; pour une
  seule étape, ni « Étape 1 / 1 » ni points ; prop `buttonClassNames` (défaut : les `.btn` de
  ForêtMap ; `GLTourContext` passe les classes de `GLButton`).
- **Docs de référence** : `guide-du-mj.md` (note « Écrans de séance : la console, en mode
  séance », et la phrase sur le QR de la classe), `roles-et-connexion.md` (§ La tablette
  d'équipe). **CHANGELOG** : entrée « lot 5 » sous `[Non publié]`. Aucune route ne change :
  `docs/API.md` n'est pas touché.
- **Tests** : nouveaux `glModeSeance.test.jsx`, `GLClassLinkPanel.test.jsx`,
  `GLTourDesSaisie.test.jsx`, `lazyAvecReprise.test.jsx`, `GLErreurTexte.test.jsx`,
  `tests-ui/shared/networkFailureMessages.test.js` ; complétés `GLTourScreen.test.jsx`,
  `apiGL.test.js`, `DiscoveryTour.test.jsx`, `GLTourContext.test.jsx`. e2e
  `gl-tenir-ecrans-relus` (mode séance, ordre, « Corriger la position… », capture) et
  `gl-tenir-tablettes` (tablettes en une ligne) adaptés.
- **Captures** (`docs/captures/ecrans-de-seance/`) : `avant/console-jouer-le-tour-1440x900.png`,
  `avant/visite-guidee-gl-dernier-pas.png`, `avant/visite-guidee-foretmap-dernier-pas.png`
  (prises sur l'état d'avant le lot, dans un arbre de travail séparé) ;
  `apres/console-seance-1440x900.png` (écrite par le e2e), `apres/console-page-1440x900.png`
  (page entière, une correction de position ouverte), `apres/console-tablette-attend-1440x900.png`,
  `apres/visite-guidee-gl-dernier-pas.png`, `apres/visite-guidee-foretmap-dernier-pas.png`.

### Écarts avec le prompt (étape 5), et pourquoi

1. **`networkFailureUserMessage` n'est pas importé de `src/services/api.js`** : la règle
   `foretmap/import-boundaries` interdit à `src/gl/` d'importer hors de `src/gl/` et
   `src/shared/` (toute nouvelle violation est une erreur). Les deux phrases et le choix du
   public sont donc **promus** dans `src/shared/networkFailureMessages.js`
   (`networkFailureMessageFor`) ; `api.js` les réexporte et son `networkFailureUserMessage`
   s'en sert. Mêmes textes, mêmes tests ForêtMap verts.
2. **Une troisième phrase, au « vous »**, pour tout écran d'équipe
   (`GL_PANNE_RESEAU_EQUIPE`, `src/gl/constants/glPanneReseau.js`) : le prompt disait « version
   adulte pour le staff, version élève sinon », mais la version élève tutoie, et l'écran d'une
   équipe vouvoie (décision d'adresse du 20/11). `apiGL` la rend pour une session d'onglet
   (tablette, projection) ; `messagePourEquipe` la substitue là où l'écran d'équipe s'affiche
   sous une autre session : la carte du moment ouverte depuis le compte d'un élève, et le
   choix d'équipe par le lien de classe (avant toute session d'équipe). Relue par le test de
   contenu.
3. **L'identifiant de requête reste dans le texte pour le prof**, et c'est l'affichage qui le
   met en petit (`GLErreurTexte`, trois bannières). Les autres endroits de la console qui
   affichent une erreur (formulaires, panneaux) le montrent encore à la suite de la phrase,
   comme avant. Un prof qui a pris la main d'un élève (« Voir comme ») lit ce que l'élève lit.
4. **Le sablier est dans le bandeau** (le prompt le cite dans le bandeau) : sablier et tablettes
   partagent une ligne d'outils, sous les boutons du tour. Sans cela les quatre cartes d'équipe
   ne tenaient pas à l'écran à 1440 × 900.
5. **« Actualiser » reste** dans le bandeau du tour de la console (le prompt ne le retire que
   de la tablette) : c'est la sortie de secours du prof si le temps réel décroche.
6. **Visite d'une seule étape** : « Étape 1 / 1 » disparaît avec le point de progression (le
   prompt ne citait que le point).
7. **`lazyAvecReprise` ne rejette jamais** : après les tentatives, il rend un composant de
   remplacement (pas d'`ErrorBoundary` à ajouter). Un chargement qui pend plus de 20 s compte
   comme un échec. Hors ligne, le message parle du réseau, pas d'une mise à jour.
   `src/shared/lazyScreen.jsx` et `ScreenLoadBoundary` existent côté ForêtMap (réessai au retour
   du réseau, bouton aux classes `.btn`) : non repris ici, parce qu'après un déploiement
   réessayer ne suffit pas — il faut recharger — et que leur limite d'erreur est au thème
   ForêtMap. À unifier un jour, pas dans ce lot.
8. **Seuls les `lazy()` de `GLGameMasterConsole` passent par `lazyAvecReprise`** (c'est le
   prompt). Ceux d'`AppGL` (dont la console elle-même, le journal, le Seuil) gardent
   `React.lazy` : un échec y remonte à la limite d'erreur de la page (« Une erreur s'est
   produite », « Recharger la page »). Une ligne par import suffirait ; à proposer à Oliv.

### Choix faits sans demander (à reporter dans la PR finale, § 9.3)

1. **Textes nouveaux, lus du prof seul** : « Menu », « Réduire le menu », « Aucun tour ouvert »
   (barre réduite), « Corriger la position… », « Annuler », « Qui a trouvé l'erreur d'Olu ? »,
   « n tablette(s) connectée(s) ✓ », « … · k équipe(s) sur N », « Aucune tablette connectée »
   (avant : « Aucune tablette d'équipe connectée »), « 1 tablette attend » / « n tablettes
   attendent », « L'application vient d'être mise à jour. Rechargez la page pour afficher cette
   section. », « Pas de réseau pour l'instant. Cette section n'a pas pu se charger : rechargez
   la page quand le réseau sera revenu. », « Recharger », « requête … » (en petit).
2. **Texte nouveau, lu d'une équipe** : « Pas de réseau pour l'instant. Réessayez dans un
   moment ; si ça dure, prévenez le prof. » (« le prof », comme les autres textes d'équipe ;
   la phrase d'un élève, partagée avec ForêtMap, dit « ton professeur »). **À relire par Oliv.**
3. **« ✓ » seulement quand chaque équipe a une tablette** ; sinon le résumé dit combien
   d'équipes sont servies. On compte les tablettes (deux appareils dans une équipe = 2).
4. **Le panneau des tablettes ne se replie pas tant qu'une tablette attend** (ou que la feuille
   du QR est ouverte, ou qu'une erreur y est affichée) ; il se replie seul une fois la demande
   traitée. Déplié, les demandes passent avant « QR de la classe ». Replier efface l'erreur.
5. **Barre réduite sur écran étroit** : la navigation du bas disparaît aussi ; « Menu » la
   rend. Le mode séance vaut pour tout compte qui ouvre « Jouer le tour ».
6. **L'erreur d'Olu et la bulle d'Olu sont sous « Le voile »**, avant les absences. Les boutons
   d'équipe y sont en variante secondaire (ils étaient « fantômes »).
7. **Bannière d'erreur du tour** : `role="alert"` (elle n'était pas annoncée).
8. **Visite guidée** : `buttonClassNames` plutôt qu'une règle CSS, pour que G&L rende
   exactement les classes de `GLButton` ; ForêtMap garde ses `.btn` sans rien passer.
9. **Sur la carte du moment, une même erreur ne s'affiche plus qu'une fois** (tour, question
   de case et chasse échouent ensemble quand le réseau tombe : la phrase sortait trois fois).

### Contrats de test changés (à reporter dans la PR finale, § 9.4)

| Avant                                                                       | Après                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `gl-class-link-sessions-count` : « Tablettes connectées : 4 équipes sur 4 » | « 4 tablettes connectées ✓ », dans le bouton `gl-class-link-resume` (`aria-expanded`)                  |
| `gl-class-link-qr`, « Déconnecter » toujours rendus                         | rendus seulement panneau déplié (`gl-class-link-detail`) : toucher `gl-class-link-resume` d'abord      |
| champ « Motif de l'avance libre », « Avancer » sur chaque carte d'équipe    | derrière `gl-tour-corriger-position` (« Corriger la position… ») ; formulaire `gl-tour-des-libre`      |
| boutons « corrigé par Gnomes A »                                            | boutons « Gnomes A », dans le groupe « Qui a trouvé l'erreur d'Olu ? » ; `gl-tour-olu` est une section |
| `GLOluBulle` et `gl-tour-olu` dans `.gl-tour-screen__banner`                | dans `.gl-tour-screen__main`, après les équipes                                                        |
| visite guidée : « Fermer » au dernier pas ; « Étape 1 / 1 » et un point     | « Terminer » seul (avec « Précédent ») ; rien pour une seule étape                                     |
| erreur réseau G&L : `TypeError: Failed to fetch`                            | `Error` en français, `code: 'GL_PANNE_RESEAU'`, `network: true`, `cause` = l'erreur d'origine          |
| message d'erreur sans corps : « … [requête id] » pour tous                  | sans l'identifiant hors session de prof ; `err.requestId` dans tous les cas                            |

Nouveaux : `gl-topbar-seance`, `gl-topbar-menu`, `gl-class-link-resume`, `gl-class-link-detail`,
`gl-tour-corriger-position`, `gl-tour-des-libre`, `gl-erreur-requete`, `gl-morceau-indisponible`.

### Constats du § 3 : état après S5

| #   | État                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K6  | **Corrigé** : demandes avant les équipes ; tablettes en une ligne ; Olu et son erreur (avec un titre) sous les équipes ; avance libre derrière un bouton.             |
| K7  | **Corrigé** pour « Jouer le tour » : barre de 56 px (elle faisait 240 px avec les 12 onglets de l'admin à 1440 px). Les autres écrans de la console gardent la barre. |
| K8  | **Corrigé** : phrase française selon la session ; identifiant de requête hors du texte des élèves ; reprise des morceaux de la console.                               |
| K9  | **Corrigé** : un seul bouton au dernier pas ; boutons au style du jeu dans G&L (ils étaient nus), inchangés dans ForêtMap.                                            |

### Mesures à l'écran (Chromium, vrai écran, partie d'essai : 4 équipes, surface « tablette », tour en jeu, compte admin à 12 onglets)

| Fenêtre    | Avant le lot                                                     | Après le lot                                                                    |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1440 × 900 | barre de 240 px ; titre du tour à 640 px ; demandes sous l'écran | barre de 56 px ; titre du tour à 457 px ; demandes à 585 px ; 4 cartes visibles |
| 768 × 1024 | non mesuré                                                       | barre d'une ligne ; regardé, rien ne déborde                                    |
| 390 × 844  | non mesuré                                                       | barre de 66 px (partie et tour sur deux lignes) ; regardé, rien ne déborde      |

À 1440 × 900 la dernière carte d'équipe finit à 882 px tant que le message « Partie chargée. »
est affiché (5 s), à 825 px ensuite. **Ce qui prend encore la place** au-dessus du tour, et que
le lot n'a pas touché : le titre « Console MJ », le bandeau de la partie (déjà replié en mode
« compact » par un lot antérieur : nom, « Démarrer / Pause / Terminer », « Modifier la
partie ») et les sous-onglets, soit 345 px. Le nom de la partie étant maintenant dans la barre,
ce bandeau pourrait se réduire à une ligne en mode séance : à proposer à Oliv (hors prompt).

### Relecture `gl-relecteur-garde-fous` sur le lot, et ce qui en a été fait

Aucun manquement bloquant aux douze garde-fous : aucun mot interdit ni point médian dans les
lignes ajoutées ; aucun geste ouvert à un élève (`allowLibre` reste fermé sur l'écran d'équipe,
le panneau des tablettes et `lazyAvecReprise` ne sont montés que dans la console) ;
identifiant de requête absent de toute session qui n'est pas celle d'un prof ; mode séance
toujours quittable ; surface « tableau » : aucun changement de comportement. Six écarts
mineurs, corrigés dans le second commit, chacun avec son test :

1. **Un refus pouvait disparaître** (garde-fou 11) : le panneau des tablettes se repliait sur
   son message d'erreur quand la demande refusée par le serveur quittait la liste. Une erreur
   garde maintenant le panneau ouvert.
2. **L'adresse de la panne réseau suivait la session, pas l'écran** : « tu » au milieu de la
   carte du moment ouverte depuis un compte élève ; phrase du prof ou du visiteur sur le choix
   d'équipe par le lien de classe. `messagePourEquipe` les ramène au « vous ».
3. **La même phrase sortait jusqu'à trois fois** sur la carte du moment (défaut ancien, rendu
   lisible par le lot) : dédoublonnée.
4. **Test de contenu** : `src/shared/networkFailureMessages.js` est relu aussi (mots interdits).
5. **Accessibilité** : le focus suit « Menu » / « Réduire le menu » ; « Corriger la
   position… » est fermé quand la carte l'est ; `aria-controls` seulement panneau déplié.
6. **« le prof »** plutôt que « votre professeur » dans la phrase d'équipe.

Remarques **non traitées** : sur écran étroit, barre réduite, `gl-app--has-bottom-nav` reste
posé (64 px de marge en bas sans barre de navigation : cosmétique) ; `PUBLIC_SERVER_RESTART_MESSAGE`
(`src/shared/apiTransport.js`, « Le site redémarre, il revient dans un instant. ») n'est relu
par aucun test de contenu (relu à la main) ; l'écran du prof change aussi de présentation en
surface « tableau » (c'est l'étape 5), et la phrase d'Olu y passe sous la ligne de flottaison à
1440 × 900 — à savoir si Oliv recopie cet écran au tableau.

### Écarts trouvés dans le code et dans l'environnement

- **Règle `foretmap/import-boundaries`** (`scripts/lib/eslint-import-boundaries.cjs`) : toute
  **nouvelle** importation de `src/gl/` vers `src/services/`, `src/components/`… est une erreur
  de lint (les anciennes sont en avertissement, listées dans
  `scripts/data/import-boundaries-baseline.json`). Passer par `src/shared/`.
- **Un `beforeEach` qui rend une fonction la rappelle au nettoyage** (Vitest) :
  `beforeEach(() => mock.mockReset())` rend le mock, qui est alors appelé sans argument.
  Mettre des accolades.
- **`fetchJsonWithRetry` hors ligne** (`navigator.onLine === false`) échoue tout de suite, sans
  nouvelles tentatives : c'est le chemin rapide pour tester une panne réseau. En ligne, une
  écriture est retentée deux fois (≈ 1,5 s) et une lecture sept fois (≈ 25 s).
- **Capturer un « avant » après coup** : `git worktree add --detach <dossier> <commit>`, lien
  symbolique vers `node_modules`, copie de `.env`, `npm run build`, puis la config Playwright
  hors dépôt avec `ROOT` sur ce dossier (elle lit `PW_ROOT` dans cette session).
- **`main`** : fusion du lot 4 (PR #716, v1.256.0) pendant la session. PR ouvertes : #712
  (celle-ci) et #713 (shell ForêtMap), sans fichier commun avec ce lot hors `CHANGELOG.md`.
  **Attention pour #713** : elle abaisse le budget de l'entrée ForêtMap à 775 Ko de JS ; ce lot
  y ajoute `src/shared/networkFailureMessages.js` et quelques lignes dans `GuidedTourOverlay`
  (mesure ci-dessous).
- Avertissements de lint : 321, comme sur `main` ; le lot n'en ajoute aucun.

### Vérifications de S5

| Commande                                                                    | Résultat                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Avant le lot : `npm run test:ui`, `npm test`                                | 824 fichiers, 6 395 tests ; 6 600 tests (2 ignorés), 0 échec                     |
| `npm run lint`                                                              | 0 erreur (321 avertissements, déjà là)                                           |
| `npm run format:check`                                                      | vert                                                                             |
| `npm run test:ui` (état final du code)                                      | 830 fichiers, 6 443 tests                                                        |
| `npm test`                                                                  | 6 600 tests, 6 598 verts, 2 ignorés, 0 échec                                     |
| Gardes statiques (`tests/*-guard.test.js`, frontières d'import), état final | 78 / 78                                                                          |
| `npm run test:content`                                                      | 154 tests                                                                        |
| `NODE_ENV=production npm run build`, `check:bundle`, `check:runtime`        | JS 1 529,3 Ko (plafond 1 530), CSS 376,9 Ko (plafond 380) ; conforme             |
| e2e `gl-tenir-ecrans-relus`, `gl-tenir-tablettes` (ceux du lot)             | 3 / 3                                                                            |
| e2e `e2e/gl-*.spec.js`, tous                                                | 62 verts, 2 ignorés, **1 échec instable, présent aussi sur `main`** (ci-dessous) |

**L'échec des e2e** : `gl-users-admin.spec.js`, « admin GL peut voir comme un joueur… » (le
clic sur « Voir comme » ne rend pas la main à Playwright en 15 s). Rejoué seul sur la branche :
même test rouge, le test jumeau « MJ GL peut voir comme… » vert en 21 s. Rejoué sur `main`
v1.256.0 dans un arbre de travail séparé : c'est le jumeau qui est rouge (21,9 s) et celui-ci
vert (19,2 s). Les deux tests sont donc **instables dans ce conteneur**, à la limite de leur
délai, sur `main` comme sur la branche (S4 les avait vus rouges tous les deux) : ils ne
viennent pas du lot, qui ne touche pas la prise de contrôle. Les 7 e2e `gl-tenir-*`, dont ceux
de la console, sont verts.

`npm test` a tourné sur le premier commit du lot pendant que les corrections de la relecture
s'écrivaient (elles ne touchent que `src/gl/`, `tests-ui/` et un test de contenu) : la suite
d'écran, les gardes statiques, le lint, le build de production et les e2e ont été lancés
**après**, sur l'état final ; `test:content` aussi. La fusion de `main` (v1.256.0) n'a changé
que le numéro de version. **Budget du bundle** : l'entrée ForêtMap prend 0,2 Ko de JS
(1 529,1 → 1 529,3) et 0,1 Ko de CSS ; il reste 0,7 Ko de marge. Le banc n'a pas été relancé :
le lot ne touche ni `lib/`, ni `routes/`, ni `migrations/`, ni `data/` (S6 le relance).

## S6 — faite (21/11/2026, sur `main` v1.257.0, `3fcaa6f`)

Lot : étapes 6 (poids de l'accueil, K11) et 7 (docs, captures), vérifications complètes du § 8,
description finale de la PR #712. Deux commits (voir le tableau), plus les commits d'état.
`main` a bougé au début de la session (fusion du lot 5, PR #717, v1.257.0) : fusionné
(`git merge origin/main`), sans rebase ; seul le numéro de version différait.

**Aucune valeur de production n'a été lue.** Une lecture du réglage `platform.brand` par le
connecteur ForêtMap a été tentée au début de la session ; elle est restée en attente d'une
approbation et n'a pas eu lieu. Consigne de S1 ensuite : aucun connecteur vers la prod. La
forme des emplacements a donc été lue dans le code (`lib/glBrand.js`, `GLBrandEditor`,
`scripts/gl-import-wp.js`) et le script essayé sur la base locale seulement. **C'est Oliv qui
le lancera sur le serveur, à blanc d'abord.** Conséquence : on ne sait pas, depuis ce lot, où
sont rangées les images de l'accueil en prod (`/uploads/gl_brand/…` par l'import WP, ou
`/uploads/media-library/…`) ni leur format ; le script traite les deux cas.

### Ce qui est fait

- **`lib/glBrandImages.js`** : `ensureGlBrandVariant(url, { profile, dryRun })` produit ou
  retrouve la variante WebP d'une image de marque — 1 600 px de large au plus et 200 Ko visés
  (profil `slot`), 512 px et 60 Ko (profil `logo`) ; qualité WebP abaissée par paliers (82 → 50) jusqu'à passer sous le poids visé. Rangée sous `uploads/gl_brand/optim/`, nommée
  `<nom>-<empreinte>-w<largeur>.webp` : la même image rend toujours la même adresse. L'original
  n'est jamais touché ; écriture par fichier temporaire puis `rename`. Ne lève jamais : sans
  variante, l'adresse d'origine est rendue. `optimizeGlBrandImages(brand, { dryRun })` passe
  les quatre emplacements et le logo, sans modifier l'objet reçu.
- **Route** : `POST /api/gl/admin/media-library` accepte `usage: 'brand'` et rend `optimized`
  (`{ url, size, width, height }` ou `null`). Sans ce champ, rien ne change.
- **`GLBrandEditor`** envoie `usage: 'brand'` et range `optimized.url` dans l'emplacement
  (message « Image de charte importée, en version allégée pour l'accueil. »).
- **`scripts/gl-brand-optimiser.js`** : à blanc par défaut (`--dry-run` accepté), `--apply`,
  `--json` ; lit `platform.brand` en base, écrit par `upsertGlSetting` (auteur
  `gl-brand-optimiser`) **seulement s'il y a un changement**. Exporte `run()` pour les tests.
- **`GLBrandHub`** : `decoding="async"`, `width` / `height` au ratio du cadre
  (`cardImageDimensions`) ; **`GLAuthView`** : logo en 88 × 88, `decoding="async"`.
- **Projection, lien fermé** (correction issue de la relecture, voir plus bas) :
  `PROJECTION_FERMEE` dans `GLProjectionView`.
- **Docs (étape 7)** : `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 3, nouveau paragraphe « Les écrans
  de séance » ; rôles ; erreur d'Olu ; « Ce qui change » ; accroche ; M8 annoté),
  `docs/GL_TENIR_A_DEUX.md` (section « Écrans de séance », paragraphe des captures),
  `docs/reference/gl/guide-du-mj.md` (note « l'accueil, plus léger » ; « À vous de jouer » là
  où le guide disait « la phase « jeu » » ; le lien de projection fermé au camp),
  `docs/API.md`, `docs/EXPLOITATION.md`, skills `.claude/skills/gl-tenir-moteur` (section
  « Les écrans de séance », « l'écran masque » au lieu de « le client grise ») et
  `.cursor/skills/foretmap-gl-project`. **CHANGELOG** : entrée « lot 6 » sous `[Non publié]`.
- **Captures** : `apres/connexion-1440x900.png` et `apres/connexion-telephone-390x844.png`
  (pleine page, quatrième de couverture dépliée, comme les « avant » de S1 ; script temporaire
  non versionné, contre le serveur des e2e).
- **Tests** : `tests/gl-brand-images.test.js` (9), `tests-ui/gl/GLBrandEditor.test.jsx` (3),
  `GLBrandHub.test.jsx` (+ 2), `GLAuthView.test.jsx` (+ 1), `GLProjectionView.test.jsx` (+ 2).

### Écarts avec le prompt (étapes 6 et 7), et pourquoi

1. **Une route change, par un champ optionnel.** Le § 1 dit « aucune route », l'étape 6
   demande une variante produite par le serveur à l'envoi. Un champ optionnel sur la route
   d'envoi existante est le plus petit changement ; pas de route nouvelle.
2. **La variante n'est pas dans la médiathèque** : fichier compagnon sous `gl_brand/optim/`
   (famille publique, déjà celle de l'import WP), comme les vignettes vivent sous
   `media-thumbs/`. Dans le catalogue, elle aurait reçu une clé stable, une vignette et une
   ligne dans les manifestes. Conséquence assumée : la médiathèque montre l'original comme
   non utilisé ; le supprimer ne casse rien (la variante reste).
3. **Le logo n'a sa variante que par le script** (aucun champ d'envoi propre dans l'éditeur
   de marque) : profil à part, 512 px. Le favicon n'est pas touché.
4. **« Déjà légère »** : une image sous le poids visé **et** sous la largeur maximale n'est
   pas ré-encodée, quel que soit son format. Un GIF ou un SVG n'est jamais traité.
5. **`loading="lazy"` existait déjà** sur les trois vignettes ; le lot ajoute `decoding` et
   les dimensions. Le héros est un fond CSS : rien à poser dessus.
6. **Captures de l'étape 7** : il n'existe pas d'« avant » du téléphone sur l'écran d'équipe
   (S1 n'en avait pas pris ; `avant/defis-alteree-telephone.png` est la seule capture
   téléphone d'avant) ni de la projection en jeu. Non reconstituées.
7. **`docs/captures/tenir-v2/` n'est pas rafraîchi** : ces images sont celles des lots
   d'avant. Les e2e les réécrivent à chaque passage ; elles ont été remises telles quelles.
8. **Une correction hors des étapes 6 et 7** : la phrase de la projection fermée (ci-dessous).

### Relecture `gl-relecteur-garde-fous` (projection du lot 2, et lot 6)

- **Lot 6** : rien. Aucun texte lu d'un élève ne change ; le message nouveau n'est lu que de
  l'admin ; la route reste sous `gl.content.manage`.
- **Projection, vérifié sans manquement** : voile jamais personnifié (libellés, tracés, pas
  de pictogramme) ; oiseau sans nom ; aucune bourse ; ni « Non » ni « Faux » ; « vous »
  partout ; « Voir le plateau » toujours rendu ; aucun geste de jeu.
- **Un manquement, corrigé** (garde-fou 11) : la clôture du chapitre révoque le lien de
  projection (`routes/gl/games/status.js`, antérieur au chantier) ; la projection déjà ouverte
  recevait un 403 et affichait « Accès refusé à cette partie » au-dessus d'un plateau figé.
  Elle dit maintenant « Cette projection est fermée. Le prof peut en ouvrir une nouvelle
  depuis son écran. ». **Ce qui reste vrai** : « Ce qui change » au camp (écrit par S2) ne se
  voit pas sur une projection déjà ouverte ; il faut un nouveau lien. Le guide du MJ le dit.
  Ne plus révoquer à la clôture serait une décision d'Oliv.
- **Trois remarques, non traitées** (antérieures au chantier) : la page du Passeur projetée
  vient du corpus, que la liste des mots interdits ne relit pas (une page dit « le corbeau ») ;
  ses astérisques d'italique s'affichent bruts ; la projection ne se relit que sur évènement
  (pas à la reconnexion du socket).

### Points à trancher ou à relire par Oliv (repris dans la PR #712)

1. Surface « tableau » : l'ancien écran d'équipe y est gardé (section S4).
2. Révocation du lien de projection à la clôture du chapitre (ci-dessus).
3. Indices du carnet retirés de la projection ; « La page du jour » derrière un bouton (S2).
4. Cases à venir et défi à préparer dans le tiroir pendant le tour (S4).
5. Textes nouveaux ou changés : listes des sections S1, S3, S5, et la phrase de la projection
   fermée.
6. `olu-pf-main` ne se dit jamais (S4).
7. Page du Passeur brute à la projection (astérisques, mots non relus).
8. `public/maps/map-foret.svg` et `map-n3.svg` mal formés (S2).
9. Propositions non faites : bandeau de la partie en mode séance, mode séance sur le compte
   d'un élève, `lazyAvecReprise` pour `AppGL` (S5) ; relecture de la projection à la
   reconnexion.

### Après la fusion, à faire par Oliv

- Sur le serveur : `node scripts/gl-brand-optimiser.js` (à blanc), lire le rapport, puis
  `--apply`. Ou renvoyer les images depuis la charte visuelle. Retour arrière : remettre
  l'adresse de l'original dans la charte (les originaux ne bougent pas).
- Relire les textes ; répétition générale sur vrais appareils ; `gl_seance apres`.

### Écarts trouvés dans le code et dans l'environnement

- **Les deux e2e « Voir comme » de `gl-users-admin`** (instables chez S4 et S5) sont **verts**
  dans cette session (6,7 s et 6,9 s) : la machine était moins chargée, rien n'a été touché.
- **Un tableau Markdown se réaligne en entier** dès qu'une cellule dépasse la plus large
  (`docs/GL_TENIR_A_DEUX.md`, table des modules : 41 lignes de diff pour une ligne ajoutée).
  Préférer un paragraphe sous la table.
- **`uploads/gl_brand/`** était déjà une famille publique (import WP) ; `scripts/reconcile-orphan-uploads.js`
  ne la parcourt pas : une variante n'est jamais comptée comme orpheline.
- **Banc** : la base `foretmap_sim` existait déjà dans le conteneur ; `npm run gl:sim:db` la
  remet d'aplomb.
- Avertissements de lint : 321, comme sur `main` ; le lot n'en ajoute aucun.
- PR ouvertes : #712 (celle-ci) et #713 (shell ForêtMap, brouillon, autre chantier), sans
  fichier de code commun ; aucune migration de part et d'autre.

### Vérifications de S6 (§ 8 complet, état final)

| Commande                                                             | Résultat                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Avant le lot : `npm run test:ui`, `npm test`                         | 830 fichiers, 6 443 tests ; 6 600 tests (2 ignorés), 0 échec      |
| `npm run lint`                                                       | 0 erreur (321 avertissements, déjà là)                            |
| `npm run format:check`                                               | vert                                                              |
| `npm run test:ui`                                                    | 831 fichiers, 6 451 tests                                         |
| `npm test`                                                           | 6 609 tests, 6 607 verts, 2 ignorés, 0 échec (9 de plus : le lot) |
| `npm run test:content`                                               | 154 tests                                                         |
| `NODE_ENV=production npm run build`, `check:bundle`, `check:runtime` | JS 1 529,3 Ko (plafond 1 530), CSS 376,9 Ko ; conforme            |
| e2e `e2e/gl-*.spec.js`, tous                                         | 63 verts, 2 ignorés, 0 échec                                      |
| e2e `gl-tenir-projection`, `gl-intro`, rejoués sur le dernier build  | 3 / 3                                                             |
| Banc `tablette-parallele-absences --seed 1` (base `foretmap_sim`)    | ok, **attendus 8/11**, mêmes trois manqués (détail ci-dessous)    |

Les e2e complets ont tourné sur l'état d'après l'étape 6 et les docs ; la correction de la
projection (une phrase d'erreur) est venue ensuite : la suite d'écran, le lint, le build et les
e2e de la projection ont été rejoués après elle, `npm test` et `test:content` aussi. Le budget
du bundle n'a pas bougé : le lot n'ajoute rien à l'entrée ForêtMap.

**Banc, avant / après.** Référence de S1 : `ok · 562 appels · 5 séances, tenues 9/10, pâlies
0, voile 75 %`, attendus 8/11 (manqués : `equipesSousVoile`, `carnetComplet`, `partGnomes`).
Après le lot (état final, une exécution) : `ok · 554 appels · 5 séances, tenues 6/10, pâlies 2, voile 75 %`, **attendus 8/11 (manqués : `equipesSousVoile`, `carnetComplet`, `partGnomes`)** : les mêmes attendus, les trois mêmes manqués. Les chiffres bruts diffèrent (554 appels contre 562, 6 pages tenues contre 9), dans la fourchette relevée par S4 sur `main`. Le scénario n'est pas reproductible au chiffre près, sur `main` comme sur la
branche (constat de S4) : ce sont les attendus qui se comparent, pas les décimales. Le lot 6 ne
touche aucun fichier du moteur (`lib/glBrandImages.js` et la route d'envoi d'un média ne sont
pas lus par une partie).

## Ce que la session suivante doit savoir

### Pour S4 (tablette, branchement) : fait

Le mode d'emploi du branchement écrit par S3 a été suivi et retiré d'ici (il reste dans
l'historique : `git show 7fe4262f4:docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`). Ce qui en reste
à savoir est dans la section S4 ci-dessus.

### Pour S5 (console) : fait

Les notes laissées par S2 à S4 ont servi et sont retirées d'ici (historique :
`git show 3226a98:docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`). Deux d'entre elles restent
ouvertes, reportées plus bas pour S6 : le mode séance sur le compte d'un élève, et les deux e2e
de `gl-users-admin`.

### Pour S6 (docs) : fait

Les notes ci-dessous ont servi à S6 ; elles restent là comme trace. Ce qui en reste ouvert est
dans la section S6 (« Points à trancher ou à relire par Oliv »).

- **La console est déjà documentée** par S5 dans `guide-du-mj.md` (note « Écrans de séance : la
  console, en mode séance ») et `roles-et-connexion.md` (où trouver le QR de la classe) :
  relire, ne pas refaire. **Reste pour l'étape 7** : `docs/GL_TENIR_A_DEUX_REGLES.md` s'il
  décrit l'écran « Jouer le tour » (ordre des blocs, « corrigé par … », avance libre visible
  sur chaque carte), et les skills `gl-tenir-*` s'ils citent ces éléments.
- **Captures de la console et de la visite guidée** : déjà dans `avant/` et `apres/` (liste dans
  la section S5). `apres/console-seance-1440x900.png` est réécrite par
  `gl-tenir-ecrans-relus` à chaque passage ; les autres ont été prises par une spec temporaire,
  non versionnée.
- **Trois propositions pour Oliv, non faites** (hors prompt) : réduire aussi le bandeau de la
  partie de la console en mode séance (345 px au-dessus du tour, voir les mesures de S5) ;
  étendre le mode séance au compte d'un élève quand l'écran d'équipe occupe la fenêtre (note de
  S4 : la barre y prend 188 px à 1 024 px de large — `useDeclarerModeSeance` suffit, à poser
  dans `AppGL` quand `ecranEquipePleinEcran` est vrai) ; passer les `lazy()` d'`AppGL` par
  `lazyAvecReprise`.
- **Textes à relire par Oliv** : la phrase de panne réseau dite à une équipe, et la liste des
  libellés de la console (section S5, « Choix faits sans demander »).
- **Relecteur garde-fous** : passé sur le lot 5 (six écarts mineurs corrigés). Reste à le passer
  sur les textes de S2 (voir plus bas).
- **#713** (shell ForêtMap, budget abaissé à 775 Ko) : ce lot ajoute 0,2 Ko à l'entrée ForêtMap.
  Si #713 est fusionnée avant la clôture, relancer `check:bundle` sur un build de production.
- `e2e/gl-users-admin.spec.js` : deux tests « Voir comme » instables dans ce conteneur, sur
  `main` aussi (vérifications de S5). Ne pas en chercher la cause dans son propre lot.

- **L'écran d'équipe est déjà documenté** par S4 dans `guide-du-mj.md` (note « L'écran d'équipe
  en trois choses ») et `roles-et-connexion.md` : relire, ne pas refaire. **Restent à écrire**
  (étape 7) : le passage « écran d'équipe » de `docs/GL_TENIR_A_DEUX_REGLES.md` (M8 y parle
  encore des « écrans Maintenant, vous pouvez… » ; § « Ce qui change » dit « sur l'écran
  d'équipe », ce qui ne se produit pas : écart 2 de S4), et le skill `gl-tenir-moteur` s'il
  doit citer `GLTenirEcranEquipe` et `useGlTenirEquipe`.
- **Captures « après » de la tablette, du compte et du téléphone** : déjà dans `apres/`
  (écrites par `gl-tenir-tablettes` et `gl-tenir-escalier`). Il manque, pour la liste de
  l'étape 7, une capture « avant » du téléphone (S1 n'en a pas pris) et les captures de la
  console (S5).
- **Banc** : ne pas attendre « 562 appels » (voir S4, « Écarts trouvés ») ; comparer les
  attendus (8/11, mêmes trois manqués).
- **Description finale, § 9.3 et 9.4** : les listes sont prêtes dans la section S4 (« Choix
  faits sans demander », « Contrats de test changés », « Écarts avec le prompt »).
- Si Oliv tranche pour le nouvel écran en surface « tableau » : marche à suivre dans la section
  S4 (une condition à retirer aux deux points de montage, puis `GLTenirEquipeView`, son test et
  deux blocs de styles à supprimer).

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
