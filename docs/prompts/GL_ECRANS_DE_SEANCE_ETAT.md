# G&L — écrans de séance : fichier d'état

Mémoire entre les sessions du chantier décrit dans
[`GL_ECRANS_DE_SEANCE_PROMPT.md`](./GL_ECRANS_DE_SEANCE_PROMPT.md) (à lire en premier, § 00).
Branche `claude/gl-ecrans-de-seance`, une PR en brouillon. **Rien ne se fusionne** avant la CI
verte et la décision d'Oliv.

## Sessions

| Session | Lot                                       | État    | Commits                                                                             |
| ------- | ----------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| S1      | Préparation, textes, adresse, plateau     | faite   | `8272b2e08` (prompt, captures), `e898eff3c` (étape 1), `552754187` (étape 2) + état |
| S2      | Projection (étape 3)                      | à faire | —                                                                                   |
| S3      | Tablette 1 : moteur de la carte du moment | à faire | —                                                                                   |
| S4      | Tablette 2 : branchement                  | à faire | —                                                                                   |
| S5      | Console (étape 5)                         | à faire | —                                                                                   |
| S6      | Accueil, docs, clôture (étapes 6 et 7)    | à faire | —                                                                                   |

Sessions `bis` : aucune. Sessions lancées : 1 sur 8 au plus.

Les identifiants de commit sont ceux de la session qui les a écrits ; un `git rebase origin/main`
les change. Retrouver un commit par son titre (`git log --oneline --grep "écrans de séance"`).

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

## Ce que la session suivante doit savoir

### Pour S2 (projection)

- Monter le plateau ainsi : `<GLGameBoard presentation="projection" … />` dans un conteneur
  **qui a une hauteur** (cellule de grille, `min-height: 0`). La scène prend 100 % ; sans
  hauteur donnée, elle retombe à 240 px. Règles : bloc « Plateau en scène épurée » à la fin de
  `src/gl/styles/gl-tenir.css`. Vérifié dans un vrai navigateur (conteneur de 600 px) : le
  plateau le remplit, le voile reste visible, aucun bouton.
- En `projection`, le moteur de carte est coupé (`enabled: false`) : ni pan ni zoom, et
  `touch-action: auto`.
- Phase : `titreDuTour(round)` ou `PHASE_ELEVE[round.phase]` (`tenirPhases.js`). Ne jamais
  afficher `round.phase` brut.
- `GLProjectionView.test.jsx` et `e2e/gl-tenir-ecrans-relus.spec.js` attendent aujourd'hui
  « Tour 1 — À vous de jouer » : à adapter si le bandeau change de forme.
- La page du Passeur des jeux d'essai contient les mots « corbeau » et « perdu » : c'est un
  texte de lore autorisé (`data/gl/tenir/README.md`, pages du Passeur), pas un manquement.
  La projection ne doit pas le passer au filtre des mots interdits.
- Tout nouveau composant de `src/gl/components/tenir/` est relu par
  `tests/content/gl-adresse-ecran-equipe.test.js` : vous, jamais tu ; aucun mot interdit.

### Pour S3 et S4 (tablette)

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

- Le titre de la console porte déjà la phase en mots d'élève (`phaseConsole`). Le bandeau
  réduit du mode séance peut réutiliser `titreDuTour`.
- Budget du bundle : voir plus haut (0,9 Ko de marge sur l'entrée ForêtMap).

### Pour S6 (docs)

- `docs/reference/gl/guide-du-mj.md` (vers les lignes 348 à 352) parle de « la phase
  « jeu » » : dire les nouveaux mots (« À vous de jouer »), le terme technique restant en
  infobulle. Vérifier aussi `roles-et-connexion.md` et `presentation.md` pour la connexion.
- `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md` cite les anciennes lignes d'Olu : c'est un
  audit daté, on n'y touche pas.
- CHANGELOG : entrée directe sous `[Non publié]`, « Modifié — G&L : écrans de séance ».
