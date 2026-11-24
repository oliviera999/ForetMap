# Lot contenu-4 — Carnet de Sélène et notes du copiste : les données

> Chantier G&L « décisions » · vague 1 · couloir contenu · charge forte · banc : fumée
> Branche : `claude/gl-decisions-contenu-4` · Attend : contenu-3 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Les anciennes pages du copiste sont rangées (inactives, jamais effacées). 41 notes et 4 enveloppes réécrites
  entrent en base.
- Les pages du carnet de Sélène sont corrigées : cri de l'oiseau, cœurs de l'ancien jeu, visages nommés trop tôt,
  renversement, accent de « Sélène », débuts de pages coupés. 42 questions de lore suivent, 49 s'éteignent.
- La page « Les formes de Sélène » parle avec la voix de Sélène, plus avec celle du copiste.
- **Aucun écran ne change.** Après ce lot et jusqu'au lot contenu-6, les notes existent en base **sans écran pour les
  lire** : c'est voulu. Ce lot ferme les chemins par où elles pourraient sortir ; contenu-6 pose la route et l'écran.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 29 de l'addendum 3 | 24/11, 11 h 07 et 11 h 16 | Le copiste existe à part entière : l'adulte qui a eu la boîte avant le Passeur et n'a pas pu passer. L'app sert tout ce qui touche au copiste. | — |
| Décision 30 de l'addendum 3 | 24/11, 11 h 07 | Les 40 anciennes pages du copiste sont archivées, inactives et jamais effacées. Elles sont remplacées par 41 notes (7 / 8 / 8 / 10 / 8) et 4 enveloppes. Sélène n'est jamais dite morte. « elle m'a sauvé la vie » est la dernière ligne du plateau 4. | — |
| Décision 31 de l'addendum 3 | 24/11, 10 h 15 | Le copiste sort de la page d'ouverture : `GL2P-04` est réécrite à la voix de Sélène. (L'intro : lot contenu-6.) | — |
| Décision 32 de l'addendum 3 | 24/11 | Trois pages corrigées (`sc-landes-course`, `ep-echo-02`, `ep-I-07`) et l'accent de « Sélène » dans `message-boite`. | — |
| Décision 42 de l'addendum 3 | 24/11, 12 h 11 | Coquilles et fautes de garde-fou du carnet de Sélène corrigées ; `ep-I-13` et `rep-II-05` inactives ; questions de lore alignées. | « Corrige les coquilles des feuillets de Sélène » ; sur le mot de la boîte : « Rien à faire » |
| Décision 21 du prompt | 23/11 | « Corbeau », nom commun, est permis dans les pages de Sélène : le filtre commun ne s'applique pas au carnet. | — |
| Décision du 24/11 après-midi | 24/11, vers 14 h 35 | Notes du copiste : un test de contenu **avec sa propre liste**, pas le filtre commun `findForbiddenString` : « perdu » et « raté » sont permis dans la voix du copiste. Les textes restent mot pour mot. | (choix sur carte) |

**Choix par défaut posés par Claude** (Oliv peut les retirer ; liste-les dans ton rapport) :

- Les anciennes pages restent en base, inactives.
- `GL2P-04` est signée « — S. ».
- Incipit d'une note : les 80 premiers caractères de son texte.
- Nouveaux codes dans l'ordre du fichier : `cop-p1-01` = « Le café », `cop-juin-08` = « La lettre », `cop-env-1` =
  enveloppe « baobab ».
- Le cri de l'oiseau devient « un cri » ; les cœurs de l'ancien jeu deviennent « des forces » ; le grimoire
  d'`ep-IV-06` cite les vrais sorts (avancer, éclairer un coin caché, abriter, ramener ceux restés en arrière) ; une
  gemme vient d'une page tenue, jamais d'une bonne réponse.
- Le renversement et la chute : les pages posent la question, elles ne donnent plus la réponse. Le Souffle n'a plus
  de direction (`ep-IV-03` : « Elle monte du sud » et « par-derrière, depuis le sud » retirés ; la caravane marche
  toujours vers le nord, « le dos au Souffle », comme le voile du plateau) ; « regarde derrière toi » devient
  « autour de toi » ; « Un fil des nôtres » retiré d'`ep-I-12` ; la certitude « ce rien sera la vraie réponse »
  retirée de `rep-II-04`. `ep-I-13` et `rep-II-05` passent inactives plutôt que réécrites : leur sujet même est le
  renversement. Rien n'est effacé ; Oliv peut les rouvrir pour une lecture en juin.
- Incipits : coupés à une fin de phrase, ou sur un mot entier suivi de « … », sans astérisque.
- Les 25 questions de lore de l'ancien jeu sont éteintes, pas réécrites : les fiches du lexique qu'elles validaient
  se valident avec leurs autres questions, ou sans question.
- **Ajouts de cette fiche** (constats du 24/11, à retirer si Oliv le veut) :
  - la `legende` d'une enveloppe n'a pas de colonne en base : elle reste dans `data/gl/copiste/notes.json`, où le lot
    contenu-6 la lira ;
  - l'accent de « Sélène » est aussi posé sur `signature`, `idee_cle` et `contexte` des mêmes pages, et sur
    `reponse_texte` des mêmes questions (étape contenu-4.2, point 2 b) ;
  - le mot de la boîte (`message-boite`) : la migration y écrit, dans un bloc à part (section 11, « À relire »).

## 3. Fichiers

**À toi**

- `lib/glFeuilletChapterPool.js` (`resolveChapterFeuilletPool` l. 70, `isFeuilletInChapterPool` l. 90)
- `lib/glFeuilletBundleGrant.js` (`loadBundleFeuillets` l. 40)
- `routes/gl/lore.js` : **modifié avant toi par contenu-2 et contenu-3** (et après toi par contenu-5). Tu n'y touches
  que pour fermer une route qui servirait une note à un élève (étape contenu-4.3). Revérifie les lignes par
  `git grep -n` après ta fusion de départ.
- `src/gl/data/zones_feuillets.json` (textes des popovers seulement)
- `tests/gl-feuillet-zone-present.test.js` (l. 70), `tests/gl-game-end-closing-bundle.test.js`,
  `tests/gl-feuillet-atteignabilite.test.js`, `tests/gl-lore-feuillet-access.test.js` (à faire suivre)
- `data/gl/README.md` (une ligne par nouveau dossier)

**Nouveaux**

- `data/gl/copiste/notes.json`
- `data/gl/carnet/corrections-carnet-selene-2026-11-24.json`
- `migrations/<nnn>_gl_copiste_carnet.sql` (étiquette `mig-copiste-carnet` ; **une seule migration** pour les étapes
  contenu-4.1 et contenu-4.2)
- `tests/content/gl-copiste-notes.test.js`, `tests/content/gl-carnet-selene-corrections.test.js`
- `tests/gl-migration-copiste-carnet.test.js` (test de migration), `tests/gl-copiste-notes-fermees.test.js` (étape
  contenu-4.3 ; ou greffe sur `tests/gl-lore-feuillet-access.test.js`)
- `changelog.d/gl-decisions-contenu-4.md`, `docs/prompts/gl-decisions/rapports/contenu-4.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `docs/API.md` | Seulement si une route du carnet change de réponse pour une note (404) : une phrase. |

**Ne touche pas**

| Fichier | Lot qui le modifie |
| --- | --- |
| `routes/gl/games/status.js` (remise de la liasse à la clôture), `server.js`, `lib/glCopisteMarges.js`, `routes/gl/copiste.js` | contenu-6 |
| `data/gl/intro.default.json`, `lib/glIntro.js`, `tests/gl-intro*.test.js` | contenu-6 |
| `docs/GL_TENIR_A_DEUX_REGLES.md`, `.claude/skills/gl-tenir-garde-fous/SKILL.md` (garde-fou écrit du copiste) | contenu-6 ; § 0 : fin-1 |
| `lib/glTrameDefis.js`, `lib/glLoreFeuilletSpeciesReveal.js` (appelants du groupe de pages, non modifiés ici) | moteur-5, contenu-2 |
| `src/shared/glGardeFousCore.js` (le filtre commun ne change pas) | contenu-2 |
| `data/gl/corpus-feuillets-selene.xlsx`, `data/gl/qcm-lore-gnomes-et-licornes.xlsx` | personne (voir section 11) |
| `data/gl/sim/contenu-prod-2026-11-07.json` | personne : tu le **lis** comme jeu d'essai |

## 4. Étapes (un commit par étape, dans cet ordre)

Les étapes contenu-4.1 et contenu-4.2 écrivent **le même fichier de migration**, dans cet ordre. Le test de migration
rejoue le fichier lui-même (patron : `tests/gl-migration-343-mascots.test.js`, `splitSqlStatements` de
`database.js`) : ne compte pas sur `npm run db:init` pour le rejouer après une modification.

### contenu-4.1 — Les textes du copiste : fichier source et migration (ex-étape C1)

- **Constat vérifié** :
  - `data/gl/copiste/` n'existe pas sur main. La table est `gl_lore_feuillets`
    (`migrations/117_gl_lore_carnet.sql`) : `type ENUM(… 'copiste' …)` (l. 18), `liasse VARCHAR(32)`, `ordre_liasse`,
    `ordre_voyage`, `mode_apparition ENUM(… 'marginalia' …)` (l. 30), `signature VARCHAR(120)` (l. 47),
    `incipit TEXT`, `statut VARCHAR(32)`. `lien_pays` vient de la migration 119, `offert_ouverture` de la 178,
    `offert_cloture` de la 191. **Aucune colonne `auteur`. Aucune colonne n'est obligatoire** hors la clé
    `feuillet_code`.
  - **Aucune colonne ne reçoit `legende`** : elle reste dans le fichier.
  - Prod au 24/11 : 40 pages `type = 'copiste'`, toutes en `liasse = 'copiste'` ; 39 actives (26 avec
    `offert_cloture = 1`), 1 déjà inactive (`cop-bio-dfroid`). Aucun code `cop-p1-…`, `cop-juin-…`, `cop-env-…`
    n'existe ; **`cop-preface` commence par `cop-p`**.
  - `GL2P-04` en prod : `signature = 'le copiste'`, `incipit` NULL, titre « Les formes de Selene » (sans accent),
    `offert_ouverture = 1`. La migration 168 la sème avec le même ancien texte : la garde tient aussi sur une base
    neuve.
- **Changement attendu** :
  1. **Fichier source `data/gl/copiste/notes.json`** : copie exacte de
     `docs/prompts/gl-decisions/sources/copiste-notes.json` (format `copiste-notes v1`, 45 entrées dans `notes`). Ne
     retape aucun texte. Ce fichier fait foi : aucune note ne s'écrit en base seulement.

     | Champ | Contenu |
     | --- | --- |
     | `code` | `cop-p1-01` à `cop-p1-07`, `cop-p2-01` à `cop-p2-08`, `cop-p3-01` à `cop-p3-08`, `cop-p4-01` à `cop-p4-10`, `cop-juin-01` à `cop-juin-08`, `cop-env-1` à `cop-env-4` |
     | `liasse` | `copiste-p1` à `copiste-p4`, `copiste-juin`, `copiste-enveloppe` |
     | `ordre` | Rang dans la liasse : 1, 2, 3… |
     | `titre` | Le titre, sans numéro ni code |
     | `texte` | Le texte, tel quel, minuscules comprises |
     | `source` | L'ancien code repris (`cop-mov-1`…), ou `null` : « Des baleines dans le sable » (`cop-p2-06`), « La lettre » (`cop-juin-08`) et les 4 enveloppes |
     | `legende` | Enveloppes seulement (sinon `null`) : la phrase en italique (« un bout de crayon usé jusqu'au bois, et une note ») |

  2. **Migration idempotente `mig-copiste-carnet`**, première partie.

     a. **Archive.** `statut = 'inactif'` et `offert_cloture = 0` sur toutes les pages `type = 'copiste'` dont le
     code **n'est pas dans `notes.json`** (les 45 codes écrits en liste dans la migration). Pas de filtre par préfixe.
     Ne supprime rien. `offert_cloture` passe à 0 pour que la liasse de fin ne remette plus ces textes même si une
     page était réactivée un jour.

     b. **Notes.** Pour chaque entrée du fichier, `INSERT … ON DUPLICATE KEY UPDATE` (pas `IGNORE`) dans
     `gl_lore_feuillets` :

     | Colonne | Valeur |
     | --- | --- |
     | `feuillet_code` | `code` |
     | `type` | `'copiste'` |
     | `liasse` | `liasse` |
     | `ordre_liasse` | `ordre` |
     | `titre`, `texte` | ceux du fichier |
     | `incipit` | les 80 premiers caractères du texte (rien d'inventé) |
     | `mode_apparition` | `'marginalia'` |
     | `biome_slug`, `plateau_number`, `lien_pays` | `NULL` (hors de tout groupe de pages de chapitre) |
     | `offert_ouverture`, `offert_cloture` | 0 |
     | `ordre_voyage` | 0 |
     | `statut` | `'actif'` |

     c. **`GL2P-04`**, gardée par : l'ancien `texte` contient « J'ai recopié tout son carnet ».
     - `texte` = « Là-bas, on m'a souvent demandé si j'étais gnome ou licorne. Les deux, l'une après l'autre. Mes plus
       belles pages sont écrites des deux écritures à la fois : la petite, serrée, pleine de mesures, et la grande,
       penchée, pleine de vent. Ce sont celles qui n'ont jamais pâli. Faites comme moi : changez de forme sans regret
       à chaque seuil, et prêtez votre regard à l'autre peuple. »
     - `signature` = « — S. » (elle **écrase** « le copiste »).
     - `incipit` = « Là-bas, on m'a souvent demandé si j'étais gnome ou licorne. Les deux, l'une après l'autre… ».

     d. **Pages corrigées**, chaque écriture gardée par l'ancienne phrase exacte (`REPLACE`) :

     | Page | Avant | Après |
     | --- | --- | --- |
     | `ep-echo-02` | « Le corbeau a fait « krâ » tout doucement, ce qui chez lui veut dire : noté. » | « Le corbeau a crié tout doucement, ce qui chez lui veut dire : noté. » |
     | `ep-I-07` | « Le Silence ne fait pas de bruit — c'est sa ruse. Il enlève. » | « Le Silence ne fait pas de bruit. Les chants s'en vont un par un. » |
     | `ep-I-07` | « Il vient de partout à la fois. » puis, après une ligne vide, le dernier paragraphe « Il vient du sud. \*(je rature « du sud ». Je le réécris.)\* » | « Il vient de partout à la fois. » (le dernier paragraphe est retiré, avec la ligne vide qui le précède) |
     | `sc-landes-course` | « C'est pour ça que je l'ai vu de loin — le Silence, qui montait sur la lande comme une marée. Là où il gagne, les oiseaux se taisent d'un coup, l'ajonc perd son odeur, et il ne reste qu'un grand rien gris. Ce jour-là, il montait vite. » | « C'est pour ça que je l'ai vu de loin : les oiseaux se taisaient d'un coup, l'ajonc perdait son odeur, et le silence gagnait la lande comme une marée. Ce jour-là, il gagnait vite. » |
     | `sc-landes-course` | « On a compris en même temps : à pied, on n'atteindrait pas l'autre rive avant lui. » | « On a compris en même temps : à pied, on n'atteindrait pas l'autre rive avant que tout se taise. » |
     | `sc-landes-course` | « il a lâché un « krâ » bien gras — moqueur, j'en suis sûre. » | « il a lâché un cri bien gras — moqueur, j'en suis sûre. » |
     - `message-boite` (« À la classe qui vient », le mot de Sélène remis au démarrage) : « Je m'appelle Selene. » →
       « Je m'appelle Sélène. » (garde : l'ancienne phrase exacte). **Dans un bloc à part de la migration**, titré
       `-- message-boite`, pour qu'on puisse le retirer d'un geste (section 11).

     e. Si une garde ne trouve rien (texte déjà corrigé par Oliv), la migration n'écrit pas, et ton rapport le dit.

     Les apostrophes sont droites en prod. Le SQL des notes se génère depuis le fichier par un petit script ; ne
     committe que le SQL.
- **Textes** : `docs/prompts/gl-decisions/sources/copiste-notes.json` (les 45 textes ; version lisible :
  `sources/copiste-notes.md`) ; `GL2P-04` et les six remplacements : ci-dessus, mot pour mot.
- **Tests** :
  1. Test de migration `tests/gl-migration-copiste-carnet.test.js` (base de test ; jeu d'essai : les pages de
     `data/gl/sim/contenu-prod-2026-11-07.json`, table `gl_lore_feuillets`, qui portent l'état d'avant : vérifié le
     24/11, les 9 gardes de cette étape y tiennent) :
     - 41 notes et 4 enveloppes actives, titre et texte égaux à ceux de `notes.json` ;
     - aucune ancienne page du copiste active, aucune avec `offert_cloture = 1` ;
     - `GL2P-04` à la voix de Sélène, signée « — S. » ;
     - un deuxième passage ne change rien.
     - Le contrôle « plus aucun « krâ » ni « du sud » dans les pages actives du carnet (seule `ep-finale`, le final
       de juin, garde le cri) » s'écrit à l'étape contenu-4.2 : il ne passe qu'une fois ses corrections posées.
  2. Test de contenu `tests/content/gl-copiste-notes.test.js`, sur `data/gl/copiste/notes.json` (`titre`, `texte`,
     `legende` ; pas `source`, qui porte d'anciens codes) :

     | Contrôle | Attendu |
     | --- | --- |
     | Nombre de notes par liasse | 7 / 8 / 8 / 10 / 8, plus 4 enveloppes ; codes uniques |
     | Mots interdits | aucun mot entier « morte », aucun « krâ », « Kraa », « Krâ » (insensible à la casse ; « plantes mortes » et « elle ne meurt pas ici » sont permis) |
     | Directions | aucun mot entier « sud », aucun « derrière vous » |
     | Adresse | aucun mot entier « tu », hors d'une citation entre « » (dans `cop-juin-05`, « tu fais des pâtés » est une citation) |
     | Visages | aucun nom de visage avant son plateau (Grise à partir de `copiste-p2`, Silence `p3`, Détricotage et Effacement `p4`) |
     | Liste propre au copiste : l'oiseau | aucun « corbeau » (le copiste dit « l'oiseau »), ni son cri |
     | Liste propre au copiste : le Souffle, le voile | aucun « Souffle » (S majuscule) ni « voile » suivi, dans les 40 caractères, d'un des verbes de la ligne « Agent » de l'étape contenu-4.2 ; aucun « monstre », « ennemi » |
     | Liste propre au copiste : le visage de Sélène | aucun « visage » à moins de 60 caractères de « sélène » |
     | Dernière note de `copiste-p4` | se termine par « elle m'a sauvé la vie. » |

     **`findForbiddenString` ne s'applique pas à ce fichier** : « raté » (`cop-p1-03`, `cop-p4-05`) et « perdu »
     (`cop-p2-06`, `cop-p3-02`) sont la voix du copiste. Le verbe « souffler » en minuscules est permis (« elle
     respire autant qu'elle souffle »). Le copiste écrit « sélène » en minuscules : ne le prends pas pour une faute.
     Message d'échec en français, avec le code de la note. Les textes ne se corrigent pas pour faire passer un test.
- **Critère d'acceptation** : les deux tests sont verts ; `notes.json` du dépôt est identique, octet pour octet, au
  fichier de `sources/` ; un deuxième passage de la migration ne change aucune ligne.

### contenu-4.2 — Coquilles et garde-fous du carnet de Sélène (ex-étape C1 ter)

- **Constat vérifié** (prod relue le 24/11 à 12 h 20, v1.263.5 ; les 141 pages actives des types `feuillet`, `scene`,
  `reponse`, `vierge`, et le mot de la boîte, relues une à une) :
  - Le cri de l'oiseau est écrit dans six pages lues avant juin (`ep-VI-04` en dialogue, `ep-VI-02`, `ep-VI-07`,
    `ep-VIII-03`, `ep-quot-1`, `sc-taiga-corbeau`), en plus des deux de l'étape contenu-4.1.
  - L'ancien jeu y vit encore : cœurs (`ep-IV-05`, `ep-IV-06`, `ep-V-05`, `ep-VIII-08`), gemmes gagnées « chaque fois
    que tu sais » et « savoir devenu pouvoir » (`ep-IV-06`, `sort-savane-01`), sorts de soin.
  - `ep-IV-03`, **dans la boîte de la séance 1**, nomme les quatre visages et place la cause du Souffle
    « par-derrière, depuis le sud » ; son incipit garde « de là où vivent les gens », retiré du texte.
  - `ep-I-13` et `rep-II-05` disent le renversement en toutes lettres ; leurs questions d'idée-clé aussi
    (`LQCM0168`, déjà éteinte ; `LQCM0239`, active).
  - Seize pages font agir le Souffle ou un visage : « prend », « a tout pris », « rôde » (`GL2P-02`), « ruse »
    (`ep-III-05`, comme `ep-I-07`), « aime », « voudrait », « parie ».
  - `ep-seuil-2` nomme le Silence au plateau 2, `ep-seuil-3` le Détricotage au plateau 3.
  - « tu es allé » (`ep-VIII-11`), « tu es le seul » (`ep-finale`), « pour le lecteur sérieux » ; « le vent m'a
    saisi » (Sélène parle) ; guillemets droits ; « Selene » sans accent.
  - Des incipits sont coupés au milieu d'un mot (« debo… », « \*co… » avec l'astérisque visible) ; ils s'affichent
    dans la fenêtre de découverte, le carnet et le carnet de la classe. Le fichier en réécrit 128.
  - 65 questions de lore actives « Quel feuillet … s'ouvre ainsi : « … » ? » recopient ces incipits, dont 23 citent
    les anciennes pages du copiste. 25 autres décrivent l'ancien jeu (cœurs, cases asymétriques, « +1 gemme par bonne
    réponse », Sacrifice, Résurrection, Vitesse).
  - Schéma : `gl_qcm_lore_questions` (`migrations/138_gl_qcm_lore.sql`, l. 25) a bien `notes_pedagogiques` (l. 42)
    et `reponse_texte`.
  - `src/gl/data/zones_feuillets.json` : 21 zones, 15 popovers avec « Selene », 0 avec « Sélène » ; `zf-p4-07` porte
    la page `ep-I-13`. `tests/gl-feuillet-zone-present.test.js` l. 70 attend `/Selene/` dans un popover.
- **Changement attendu** :
  1. **Fichier source** `data/gl/carnet/corrections-carnet-selene-2026-11-24.json` : copie exacte de
     `docs/prompts/gl-decisions/sources/corrections-carnet-selene-2026-11-24.json`. Il fait foi. Sa forme :
     `remplacements` (60 entrées : `code`, `champ`, `ancien`, `nouveau`, `toutes`, `motif` ; 53 sur `texte`, 7 sur
     `texte_accessible`), `accent`, `incipits` (128, code → texte), `feuillets_inactifs` (2), `questions_lore.reecrire`
     (42, code → question), `questions_lore.inactiver` (3 groupes : 23 + 1 + 25 codes, chacun avec son `motif`).
  2. **Même migration `mig-copiste-carnet`, après les écritures c et d de l'étape contenu-4.1.**

     a. **Remplacements**, dans l'ordre du fichier (l'ordre compte pour `ep-VI-04`) :

     ```sql
     UPDATE gl_lore_feuillets
        SET <champ> = REPLACE(<champ>, <ancien>, <nouveau>)
      WHERE feuillet_code = <code>
        AND LOCATE(<ancien>, <champ>) > 0;
     ```

     - Jamais `LIKE` (les textes contiennent des apostrophes et 14 d'entre eux un « ; » : échappe-les ; le découpeur
       `splitSqlStatements` respecte les chaînes).
     - Quand `toutes` est faux (59 sur 60), ajoute la garde « une seule occurrence » :
       `(CHAR_LENGTH(<champ>) - CHAR_LENGTH(REPLACE(<champ>, <ancien>, ''))) = CHAR_LENGTH(<ancien>)`.
     - Une garde qui ne trouve rien n'écrit rien : ton rapport le dit.
     - Génère le SQL depuis le fichier par un petit script ; ne committe que le SQL.

     b. **Accent** : `REPLACE(col, 'Selene', 'Sélène')` sur `titre`, `incipit`, `texte`, `texte_accessible` des pages
     actives des types `feuillet`, `scene`, `reponse`, `vierge`, `message` (`GL2P-04` est déjà réécrite), puis sur
     `question`, `choix_a` à `choix_e`, `feedback_correct`, `feedback_a` à `feedback_e` des questions **actives** de
     `gl_qcm_lore_questions`. `REPLACE` est sensible à la casse : « SELENE » ne bouge pas. **Ajout de cette fiche** :
     mêmes pages, colonnes `signature`, `idee_cle`, `contexte` ; mêmes questions, colonne `reponse_texte` (dans
     l'instantané du 7/11 : 16 idées-clés, 2 signatures « Selene, forme gnome / licorne », 1 contexte ; la prod du
     24/11 n'a pas été relue sur ces colonnes).

     c. **Incipits** : pour chaque entrée de `incipits`,
     `UPDATE gl_lore_feuillets SET incipit = <texte> WHERE feuillet_code = <code> AND statut = 'actif'`. L'entrée
     `message-boite` va dans le bloc `-- message-boite` (section 11).

     d. **Pages éteintes** : `ep-I-13` et `rep-II-05` → `statut = 'inactif'`, `offert_cloture = 0`. Rien n'est
     supprimé.

     e. **Questions de lore** :
     - `reecrire` : la question prend le texte du fichier, par son `question_code`, gardée par le gabarit
       `question LIKE 'Quel feuillet du carnet de Sel%s''ouvre ainsi%'` (ici le `LIKE` est voulu, sur un préfixe sans
       texte libre). Choix et bonne réponse ne changent pas : ce sont les titres des pages.
     - `inactiver` : `statut = 'inactif'`, et le motif ajouté à `notes_pedagogiques` (« [24/11 C1 ter] … », par
       `CONCAT_WS`, une seule fois : garde sur l'absence du marqueur). Les liens de ces questions ne sont pas
       supprimés. Une fiche du lexique qui n'a plus de question active se valide sans question, comme aujourd'hui
       pour une ressource sans lien approuvé.

  3. **`src/gl/data/zones_feuillets.json`** (catalogue des zones de feuillet du jeu classique ; ses polygones servent
     de `polygone_ref` aux zones de chasse) : « Selene » → « Sélène » dans les popovers ; popover de `zf-p4-07` →
     « Sélène se pose une question qu'elle n'ose pas écrire. ». **Ne retire aucune zone** : le test du chargeur en
     compte 21, et des zones de chasse s'appuient sur leurs polygones.
- **Textes** : `docs/prompts/gl-decisions/sources/corrections-carnet-selene-2026-11-24.json` ; le popover ci-dessus.
- **Tests** :
  1. Test de migration (même fichier que l'étape contenu-4.1 ; pages de l'instantané du 7/11 : vérifié le 24/11, les
     60 remplacements y trouvent leur ancien texte et les 128 codes d'incipit y sont actifs ; l'instantané **n'a pas**
     la table `gl_qcm_lore_questions` : pose des lignes d'essai pour une question « s'ouvre ainsi », `LQCM0239`,
     `LQCM0117` et une question « Quel feuillet du copiste … ») :
     - aucune page active du carnet ne contient « krâ » (insensible à la casse) hors `ep-finale`, ni « du sud », ni
       « Selene », ni « cœurs » ;
     - aucun incipit actif ne contient « \* » ni deux espaces de suite ;
     - `ep-I-13` et `rep-II-05` inactives ;
     - aucune question de lore active ne commence par « Quel feuillet du copiste » ; `LQCM0239`, `LQCM0117`
       inactives ;
     - un deuxième passage ne change rien.
  2. Test de contenu `tests/content/gl-carnet-selene-corrections.test.js`, sur le fichier :

     | Contrôle | Attendu |
     | --- | --- |
     | `nouveau`, incipits, questions réécrites | aucun « krâ », « Kraa » (insensible à la casse), « Selene », « cœurs », « du sud », « monstre », point médian, guillemet droit `"` |
     | Agent | aucun `(Souffle\|Grise\|Silence\|Détricotage\|Effacement)` suivi, dans les 40 caractères, de « rôde », « ronge », « attaque », « chasse », « tue », « prend », « pris », « mord », « voudrait », « aime », « parie », « ruse » |
     | Incipits | 125 caractères au plus, aucun astérisque, autant de « « » que de « » » |
     | Questions réécrites | forme exacte « Quel feuillet du carnet de Sélène s'ouvre ainsi : « … » ? » |
     | Remplacements | `ancien` ≠ `nouveau` ; `code` présent une fois au moins dans l'instantané de `data/gl/sim/` s'il y est |

     `findForbiddenString` ne s'applique pas aux pages du carnet : elles disent « corbeau », c'est voulu (décision 21
     du prompt). Message d'échec en français, avec le code de la page ou de la question.

  3. `tests/gl-feuillet-zone-present.test.js` l. 70 : `/Selene/` devient `/Sélène/`. `tests/gl-feuillet-zones-loader.test.js`
     (« charge 21 zones valides ») et `tests/content/gl-fusion-chapitres-4-5.test.js` restent verts.
- **Critère d'acceptation** : tests verts ; le sous-agent `gl-relecteur-garde-fous` a relu le fichier des corrections
  avant de clore l'étape ; le fichier du dépôt est identique à celui de `sources/`.

### contenu-4.3 — Les notes ne sortent par aucun autre chemin (ex-étape C2)

- **Constat vérifié** :
  - `lib/glFeuilletChapterPool.js › resolveChapterFeuilletPool` (l. 70 ; clause `WHERE f.statut = 'actif' AND …`
    l. 78) et `isFeuilletInChapterPool` (l. 90). Les notes sont hors des groupes **une fois la migration passée**
    (biome, plateau et pays à `NULL`) ; les anciennes pages, elles, avaient parfois un biome.
  - `lib/glFeuilletBundleGrant.js › loadBundleFeuillets` (l. 40) sert les liasses d'ouverture et de clôture.
  - `routes/gl/lore.js` : `GET /feuillets` (l. 174) et `GET /feuillets/:code` (l. 271). Pour un élève, une page au
    biome `NULL` jamais trouvée répond déjà 404 (l. 335-337) et n'entre pas dans la liste : il se peut qu'aucune ligne
    ne change et que seul un test s'ajoute.
  - `routes/gl/lore.js`, `POST /games/:id/liasses/:bundle` (l. 357-386, appel l. 378) : le prof peut remettre à la
    main la liasse `cloture` à n'importe quelle partie. **Tu ne la fermes pas** (section 11).
- **Changement attendu** :
  1. `lib/glFeuilletChapterPool.js` : ajoute `AND f.type <> 'copiste'` dans `resolveChapterFeuilletPool` et dans la
     garde `isFeuilletInChapterPool`. C'est une ceinture de plus. Les quatre chemins (Trame, repli de l'étude d'une
     fiche, repli de la consultation, présentation par un joueur) n'en donnent donc jamais.
  2. `lib/glFeuilletBundleGrant.js` : les liasses d'ouverture et de clôture excluent `type = 'copiste'`.
  3. Cherche toute autre route qui sert une page par son code à un élève ou à une tablette (lecture d'une page du
     carnet, présentation par code, journal) : une note du copiste n'y passe pas. Elle ne se lira que par la route du
     lot contenu-6. **Dis lesquelles tu fermes.** À passer en revue (`git grep -l gl_lore_feuillets -- routes lib`) :
     `routes/gl/lore.js` (`/demo-feuillets`, `/feuillets`, `/feuillets/:code`, `/games/:id/feuillets/:code/present`,
     `/read`, `/hold`, `/games/:id/zones/:zoneId/feuillets`), `lib/glFeuilletAcquisition.js`, `lib/glMarketFeuillets.js`,
     `lib/glLearnableResources.js` (ressource `feuillet`), `lib/glVoyageur.js`, `lib/glVoyageurPlume.js`,
     `lib/glChasse.js`, `lib/glTour.js`, `lib/gl/demoFeuillets.js`, le carnet de la classe. Le prof (staff G&L)
     continue de tout lire.
- **Textes** : aucun.
- **Tests** : un chapitre ne renvoie aucune page `copiste` ; les liasses non plus ; lire une note par son code depuis
  un compte d'élève par une route du carnet → 404. Fais suivre `tests/gl-game-end-closing-bundle.test.js` et
  `tests/gl-feuillet-atteignabilite.test.js` : la liasse de clôture n'a plus de page du copiste.
- **Critère d'acceptation** : tests verts ; ton rapport liste chaque route examinée, fermée ou déjà fermée.

## 5. Migration

- **Étiquette** : `mig-copiste-carnet` (une seule, pour contenu-4.1 puis contenu-4.2).
- **Tables** : `gl_lore_feuillets`, `gl_qcm_lore_questions`.
- **Gardes** : archive : `type = 'copiste'` et code hors des 45 ; notes : `ON DUPLICATE KEY UPDATE` sur
  `feuillet_code` ; `GL2P-04` : l'ancien texte contient « J'ai recopié tout son carnet » ; pages : `REPLACE` gardé par
  l'ancienne phrase exacte (`LOCATE`), plus « une seule occurrence » quand `toutes` est faux ; incipits : par code et
  `statut = 'actif'` ; questions réécrites : gabarit `LIKE` ; questions éteintes : par code.
- **Prod au 24/11 : toutes les gardes tiennent.**
  - 9 sur 9 pour contenu-4.1 : `ep-echo-02` ; `ep-I-07` × 3 ; `sc-landes-course` × 3 ; `message-boite` ; `GL2P-04`.
  - 60 remplacements sur 60 pour contenu-4.2 : 58 à une occurrence exacte ; `ep-VI-04` « Lui : Krâ. » à 3 ;
    `ep-IV-04` et `ren-caduc-01`, qui contiennent « ; », vérifiés par leurs deux moitiés.
  - Les 128 pages d'incipit sont actives ; les 42 questions à réécrire sont actives et répondent au gabarit ; les 49
    à éteindre sont actives ; `ep-I-13` et `rep-II-05` sont actives (`rep-II-05` avec `offert_cloture = 1`).
  - Aucun texte n'a été corrigé à la main entre-temps.
- **Base neuve** : le carnet n'y est pas (il vient d'un import ou d'un instantané). La migration y pose les 45 notes,
  réécrit `GL2P-04` (semée par la migration 168) et corrige `GL2P-02` si sa garde tient. Le reste ne trouve rien et
  n'écrit rien.
- **Base du banc** : `npm run gl:sim:db` rejoue les migrations **puis vide les tables G&L et charge l'instantané du
  7/11** : les notes n'y sont pas, les anciennes pages y sont. Ne t'appuie pas sur elle pour vérifier la migration.

## 6. Données et sources

| Source (`docs/prompts/gl-decisions/sources/`) | Où va son contenu |
| --- | --- |
| `copiste-notes.json` | `data/gl/copiste/notes.json` (copie exacte), puis la migration |
| `copiste-notes.md` | À lire pour comprendre (règles d'écriture, relectures). Ne va nulle part dans le dépôt. |
| `corrections-carnet-selene-2026-11-24.json` | `data/gl/carnet/corrections-carnet-selene-2026-11-24.json` (copie exacte), puis la migration |

Laissé hors de `copiste-notes.json`, présent dans `copiste-notes.md` : la « variante surnom » de la lettre (aucun champ
ne la reçoit) ; la parenthèse de l'enveloppe « flocon » (« puis on souffle sur la plaque : une grande main apparaît »),
qui est un geste du prof.

## 7. Vérifications propres au lot

- `npm test`, `npm run test:content`, `npm run test:ui`, lint, format, build.
- Banc : régime **fumée**, une passe à la fin.
- Aucun e2e propre. Aucune capture (aucun écran ne change).
- Comptes à rendre dans ton rapport : notes insérées (45), anciennes pages archivées, remplacements appliqués sur
  l'instantané (attendu : 60 sur 60), incipits écrits (128), questions réécrites (sur tes lignes d'essai) et éteintes,
  routes examinées à l'étape contenu-4.3.

## 8. Contrats de test changés

- `tests/gl-feuillet-zone-present.test.js` l. 70 : le popover attendu dit « Sélène » (accent).
- `tests/gl-game-end-closing-bundle.test.js`, `tests/gl-feuillet-atteignabilite.test.js` : la liasse de clôture ne
  contient plus aucune page `type = 'copiste'`.
- Popover de `zf-p4-07` : « Sélène se pose une question qu'elle n'ose pas écrire. »

## 9. Docs à mettre à jour dans ce lot

- `data/gl/README.md` : les dossiers `data/gl/copiste/` et `data/gl/carnet/`, et ce que chaque fichier nourrit.
- `changelog.d/gl-decisions-contenu-4.md` : « Corrigé — G&L : coquilles et garde-fous du carnet de Sélène (cri de
  l'oiseau, cœurs de l'ancien jeu, visages nommés trop tôt, renversement, accent, débuts de pages coupés) ; questions
  de lore alignées » et « Modifié — G&L : les anciennes pages du copiste sont archivées ; 41 notes et 4 enveloppes
  réécrites entrent en base ».
- `docs/API.md` : seulement si une route change de réponse.

## 10. Hors périmètre

| Quoi | Lot |
| --- | --- |
| Calcul des notes allumées, routes `GET /api/gl/copiste/marges` et `POST /api/gl/copiste/ouvrir`, écran « Les marges du copiste », liasse de fin remise au double fond | contenu-6 |
| Intro par défaut, garde-fou écrit du copiste dans les règles et la skill | contenu-6 |
| Gestes du prof au camp et en juin dans les docs du prof | fin-2 |
| Mise à jour des tableurs `data/gl/*.xlsx` et de l'instantané du banc | personne (section 11) |
| Les 12 questions de lore déjà éteintes le 24/11, les notes d'auteur du lexique | hors lot (lexique : contenu-5) |

## 11. Pour Oliv

**À relire**

- **Le mot de la boîte.** Oliv a dit « Rien à faire » sur le mot de la boîte ; les textes du chantier, eux, écrivent
  deux fois sur `message-boite` : l'accent (« Je m'appelle Selene. » → « Je m'appelle Sélène. », décision 32) et un
  incipit réécrit (« Si vous lisez ces mots, c'est qu'on vous a confié la boîte. »). Deux lectures : « rien à faire »
  = on n'y touche pas du tout, ou « rien de plus que l'accent ». La migration pose ces deux écritures dans un bloc à
  part, `-- message-boite` : un mot d'Oliv et le bloc sort avant la fusion de la vague.
- Les 41 notes, les 4 enveloppes et la lettre de juin : la répartition est validée, **les textes ne l'ont pas été**.
  Ils sont posés mot pour mot. « La variante surnom » de la lettre n'est servie nulle part.
- Les quatre choix sur le renversement et la chute (section 2) vont plus loin que des coquilles : ils touchent au
  lore. `ep-IV-03` à `ep-IV-07` (la boîte de la séance 1) et `ep-VI-04` sont à relire dans l'éditeur.
- `POST /api/gl/lore/games/:id/liasses/:bundle` laisse encore le prof remettre la liasse de fin à la main, avant le
  double fond. Ce lot ne la ferme pas ; contenu-6 non plus, sans décision.
- En partie classique, la liasse de clôture perd ses pages du copiste (26 en prod) et `rep-II-05`.
- Relevé sans y toucher : dans `src/gl/data/zones_feuillets.json`, le popover de `zf-p1-02` écrit « Un corbeau suit
  Sélène… » et celui de `zf-p1-03` « un monstre ».

**À faire après la vague**

- Vérifier dans l'éditeur que `ep-I-13` et `rep-II-05` sont inactives.
- **Ne plus réimporter les feuillets ni les questions de lore depuis un tableur** : `data/gl/corpus-feuillets-selene.xlsx`
  et `data/gl/qcm-lore-gnomes-et-licornes.xlsx` gardent les anciens textes ; un import les remettrait, anciennes
  pages du copiste comprises.
- Refaire l'instantané du banc (`npm run gl:sim:snapshot`, sur une copie de la prod) : celui du 7/11 garde l'ancien
  carnet.
- Préparer la boîte : le mot de Sélène avec un rond de café au dos ; la grande main grasse sur la plaque (à essayer à
  la buée avant) ; les quatre enveloppes (textes de `sources/copiste-notes.md`, à la main) ; la lettre sous le double
  fond.
