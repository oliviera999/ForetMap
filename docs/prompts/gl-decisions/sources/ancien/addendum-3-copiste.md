# Addendum 3 au prompt orchestrateur · le gel est levé ; le copiste existe à part entière

Écrit le 24/11/2026 à 11 h 40, d'après les décisions d'Oliv de 11 h 07, 11 h 16 et 11 h 20. **Revu à 12 h** (Oliv :
« Caravane est ok. Corrige… tout est bien cohérent ? ») : textes recoupés avec le carnet de Sélène en prod, ouverture
des enveloppes et du double fond par un geste du prof, ordre et plafond alignés sur l'orchestrateur du 24/11 (lot Q).
**Complété à 12 h 40** (Oliv, 12 h 11 : « Corrige les coquilles des feuillets de Sélène ») : étape **C1 ter** (décision 42),
toutes les pages actives du carnet relues en prod, corrections et données en annexe L ; la liasse de fin de Sélène
part avec le double fond (C4 bis).
- Code lu sur `main` = prod = v1.263.5 (`b8b5344`).
- Données lues en prod par le connecteur.
- Sources : `claude/Copiste_liasses_GL_2026-11-24.md` (§ 8), `claude/Copiste_notes_GL.md` (textes, recopiés ici en
  annexe K), `claude/Copiste_traces_GL.md` (v3 : la boîte, les enveloppes, la lettre).

## Comment cet addendum s'applique (vaut pour les trois addenda)

Le prompt orchestrateur est trop gros pour être réécrit sans risque depuis claude.ai. On applique donc ses addenda :

**1. Au lancement**, Oliv colle dans la même session, dans cet ordre (l'addendum 4 s'ajoute en dernier) :
- le prompt `claude/PROMPT_Claude_Code_GL_orchestrateur_decisions.md` ;
- l'addendum 1 (`claude/Addendum_orchestrateur_lot2_questions_lecture.md`) ;
- l'addendum 2 (`claude/Addendum_orchestrateur_immersion_GL_2026-11-24.md`, décisions cochées) ;
- cet addendum 3.

**2. Lot 0 (§ 00.2, point 4).** L'orchestratrice verse dans `docs/prompts/GL_DECISIONS_PROMPT.md` :
- le prompt, mot pour mot ;
- puis une section « Addenda (ils font foi sur le prompt quand ils le contredisent) » ;
- puis les trois addenda, mot pour mot.

Les sessions de lot lisent le tout.

**3. En cas de conflit entre deux textes**, le plus récent fait foi : addendum 4 (direction artistique), puis 3, puis 2,
puis 1, puis le prompt.
Un passage du prompt qu'un addendum remplace ne s'applique plus.

---

## 0. Décisions d'Oliv (24/11)

| # | Décision | Lot, étape |
| --- | --- | --- |
| 28 | (11 h 20) **Le gel est levé.** Le chantier corrige, retire **et ajoute** ce que les décisions nommées demandent (§ 3 du prompt et addenda), rien d'autre. | § 1 du prompt |
| 29 | (11 h 07, 11 h 16) **Le copiste existe à part entière.** C'est l'adulte qui a eu la boîte avant le Passeur et n'a pas pu passer (le mot de Sélène le dit déjà : « les grands ne voient que leur reflet »). Il a tout écrit avant, pour « la classe qui viendra » ; ses marges au crayon ont pâli avec le carnet, et chaque page de Sélène tenue par la caravane en fait reparaître une. Le reste des notes d'un monde reparaît quand le prof ouvre l'enveloppe de ce monde au camp ; juin, quand il ouvre le double fond. L'élève les lit au Seuil, dans « Les marges du copiste », avec deux compteurs (pages de Sélène, notes du copiste). Le contenu des enveloppes de camp et les textes de juin y sont aussi servis : **l'app sert tout ce qui touche au copiste**. | C, étapes C1 à C5 |
| 30 | (11 h 07) **Les 40 anciennes pages du copiste sont archivées**, inactives et jamais effacées. Elles sont remplacées par **41 notes et 4 enveloppes** réécrites (annexe K) : 7 au plateau 1, 8 au plateau 2, 8 au plateau 3, 10 au plateau 4, 8 en juin. Sélène n'est jamais dite morte : ce n'est qu'une hypothèse parmi d'autres. Le fond existentiel reste, dit par des objets et des blancs ; « elle m'a sauvé la vie » est la dernière ligne du plateau 4. | C, étape C1 |
| 31 | (lore, 10 h 15 ; v3 du copiste) **Le copiste sort de l'intro et de la page d'ouverture.** GL2P-04 est réécrite à la voix de Sélène. La version de l'intro proposée le 24/11 devient le texte par défaut du dépôt. | C, étapes C1 et C6 |
| 32 | (corrections de garde-fous trouvées le 24/11) **Trois pages du carnet sont corrigées** : le cri du corbeau écrit dans `sc-landes-course` et `ep-echo-02` ; le Silence qui « monte comme une marée » et qu'on court « avant lui » dans `sc-landes-course` ; dans `ep-I-07` (page de la zone `cz-p3-09`), la « ruse » du Silence et surtout **« Il vient du sud »**, qui révèle le renversement spatial. S'y ajoute l'accent de « Sélène » dans `message-boite`, le mot que le copiste cite. | C, étape C1 |
| I6 | (11 h 53, confirmé à 12 h 11 : « Non pas que la caravane ») **« La caravane », redite par Oliv** (I6 est prise en entier par la décision 39 de l'addendum 4, « le monde / le chemin / le paysage » compris) : à l'écran d'un élève, après le miroir, la classe en jeu se dit « la caravane » (toute la classe, jamais une équipe). Le lot C l'écrit au Seuil. Le copiste, lui, vit avant le miroir : il peut dire « classe » (il cite « à la classe qui vient »). | C, V, 2 |
| 33 | (lore, 10 h) **Au plateau 2, Olu parle de l'oiseau**, sans le nommer, quand le chapardeur passe. `olu-06` (« Le nid est plein ») quitte le moment d'ouverture. | 2, étape 24 quater |
| 42 | (12 h 11) **Les coquilles et les fautes de garde-fou du carnet de Sélène sont corrigées** (toutes les pages actives relues en prod le 24/11) : cri de l'oiseau écrit avant juin (6 pages) ; cœurs et gemmes de l'ancien jeu (6 pages) ; noms des visages avant leur plateau (3 pages) ; Souffle ou visage qui « prend », « rôde », « aime », « parie », « ruse » (16 pages) ; renversement et chute dits en clair (`ep-IV-03`, `ep-IV-07`, `ep-I-12`, `rep-II-04`) ; « tu es allé », « tu es le seul » ; accent de Sélène (34) ; incipits coupés au milieu d'un mot (128 réécrits). `ep-I-13` et `rep-II-05`, qui disent le renversement en toutes lettres, passent inactives. Les questions de lore qui recopient ces pages suivent : 42 « s'ouvre ainsi » réécrites ; 23 qui citent les anciennes pages du copiste, 25 de l'ancien jeu et `LQCM0239` éteintes. La liasse de fin de Sélène (`ep-I-16`, `ep-I-17`, `ep-finale`) est remise quand le prof ouvre le double fond, plus à la clôture du plateau 4. Oliv, sur le mot de la boîte : « Rien à faire » ; sur I6 : « Non pas que la caravane » (I6 en entier, décision 39 de l'addendum 4). | C, étapes C1 ter et C4 bis |

**Ce qui change dans le prompt** :
- **§ 1, paragraphe « Gel des fonctionnalités »** : remplacé par la décision 28. Les exceptions nommées (lot H, lots S
  et V de l'addendum 2) deviennent des décisions comme les autres.
- **§ 6, dernière puce** (« toute fonctionnalité nouvelle hors des décisions H1 à H5… ») : se lit « toute fonctionnalité
  hors des décisions nommées ».
- **§ 6, puce « Selene sans accent dans sept feuillets »** : sans objet. Les quatre pages du copiste sont archivées ;
  `message-boite` est corrigé en C1, `ep-VIII-08`, `rep-II-02` et 32 textes accessibles en C1 ter (décision 42).
- **Retrait du code du jeu classique** : toujours après deux séances jouées. Ce n'est pas le gel, c'est la prudence de
  garder une voie de repli tant que le nouveau jeu n'a pas tourné en classe.

## 1. Où verser

**Tableau des lots (§ 00.3)** : une ligne de plus.

| Lot | Titre | Étapes | Charge | Attend | Fichiers principaux (réservés) | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| C | Le copiste : ses notes, ses marges, ses enveloppes | C1 à C6 | moyenne | 2, V (et H si son lot touche le Seuil) | `data/gl/copiste/notes.json` (nouveau), migration, `lib/glCopisteMarges.js` (nouveau), `routes/gl/copiste.js` (nouveau, monté à côté des autres routes G&L), `src/gl/components/seuil/GLCopisteMarges.jsx` (nouveau ; son montage dans `GLSeuilView.jsx`), action « Marges du copiste » de `GLGameMasterConsoleParties.jsx`, une ligne après « Clore le chapitre » dans `GLTourScreen.jsx` (réservé aux lots 5 et 7 : modification minimale), `lib/glFeuilletChapterPool.js`, `lib/glFeuilletBundleGrant.js`, `data/gl/intro.default.json`, `tests/content/gl-copiste-notes.test.js` (nouveau), `data/gl/carnet/corrections-carnet-selene-2026-11-24.json` (nouveau), `tests/content/gl-carnet-selene-corrections.test.js` (nouveau), `src/gl/data/zones_feuillets.json` (textes des popovers seulement), `routes/gl/games/status.js` (liasse de clôture, C4 bis) | `N+6` |

**Lot 2** : ajoute l'étape **24 quater**, après 24 ter.

**Ordre de priorité** : celui de l'addendum 4 (… H, S, V, **C**, T, P, F, A, 8, 9). Le lot 8 attend aussi C. Le lot C
passe après V (V change les chaînes du Seuil, C y monte son bloc) et avant T, qui habille ensuite le Seuil (table de
jeu) : **le lot T habille aussi `GLCopisteMarges.jsx`** et garde son écriture au crayon (graphite, minuscules, papier
réglé), distincte des pages de Sélène.

**Plafond** : celui de l'addendum 4 (lot C compris).

**Numéros de migration (§ 00.2, point 3)** : lot C → `N+6`.

**Choix par défaut (§ 3)** : ceux du § 3 de cet addendum.

**Docs (§ 7)** : les lignes du § 4.

**§ 10 (après le chantier)** : le § 5.

## 2. Étapes

### Étape 24 quater — Olu et l'oiseau (décision 33) · lot 2

`data/gl/tenir/olu-lignes.json`, avec sa copie `exemple/` si un test y lit ces lignes.

**Trois lignes ajoutées**, moment `oiseau`, sans `plateaux`. Le chapardeur ne joue qu'à partir du plateau 2 (réglage
de prod), donc ces lignes ne sortent pas avant.

| id | expression | texte |
| --- | --- | --- |
| `olu-oiseau-02` | surpris | « Une plume sur une bourse. Il est passé. Il ne prend jamais tout : une seule chose qui brille. » |
| `olu-oiseau-03` | pensif | « Il garde ce qui brille, puis il le rend à qui en a besoin. Drôle d'oiseau. » |
| `olu-oiseau-04` | curieux | « Vous avez vu ? Il était là, et puis plus. Comme dans le carnet. » |

**`olu-06`** (« Le nid est plein… ») passe du moment `ouverture` au moment `oiseau` : au plateau 1, il n'y a pas de nid.

**Contrôles** : aucune ligne ne dit « corbeau », ni son nom, ni son cri. Le test de catalogue reste vert. Vérifié dans
`lib/glChapardeur.js` : il prend une seule gemme, à la bourse la plus pleine, et la prochaine page trouvée la rend au
membre le moins riche de l'équipe découvreuse ; les trois lignes disent vrai.

### Étape C1 — Les textes du copiste : fichier source et migration (décisions 30 à 32) · lot C

**1. Fichier source `data/gl/copiste/notes.json`**, recopié de l'annexe K, format `copiste-notes v1`.

Les champs :

| Champ | Contenu |
| --- | --- |
| `code` | Code de la note : `cop-p1-01` à `cop-p1-07`, `cop-p2-01`… `cop-p4-10`, `cop-juin-01` à `cop-juin-08`, `cop-env-1` à `cop-env-4` |
| `liasse` | `copiste-p1` à `copiste-p4`, `copiste-juin`, `copiste-enveloppe` |
| `ordre` | Rang dans la liasse : 1, 2, 3… |
| `titre` | Le titre en gras de l'annexe, sans le code entre parenthèses |
| `texte` | Le texte, tel quel, minuscules comprises |
| `source` | L'ancien code repris (`cop-mov-1`…), ou `null` (le café : `cop-marg-quotidien` ; les baleines, la lettre et les enveloppes : `null`) |
| `legende` | Enveloppes seulement : la phrase en italique (« un bout de crayon usé jusqu'au bois, et une note ») |

Dans l'annexe, l'ancien code est entre parenthèses après chaque titre : il va dans `source`. Le nouveau code suit l'ordre de l'annexe (le café = `cop-p1-01`, la lettre = `cop-juin-08`, l'enveloppe « baobab » = `cop-env-1`).

Ce fichier fait foi : aucune note ne s'écrit en base seulement.

**2. Migration idempotente `N+6`.**

a. **Archive.**
- Passe `statut = 'inactif'` sur toutes les pages `type = 'copiste'` dont le code **n'est pas dans `notes.json`**
  (liste écrite dans la migration). Pas de filtre par préfixe : `cop-preface` commence par `cop-p`. Ne supprime rien.
- `offert_cloture` passe à 0 sur ces pages, pour que la liasse de fin ne remette plus ces textes même si une page était
  réactivée un jour.

b. **Notes.** Pour chaque entrée du fichier, insère ou met à jour une ligne de `gl_lore_feuillets` :

| Colonne | Valeur |
| --- | --- |
| `feuillet_code` | `code` |
| `type` | `'copiste'` |
| `liasse` | `liasse` |
| `ordre_liasse` | `ordre` |
| `titre`, `texte` | ceux du fichier |
| `mode_apparition` | `'marginalia'` |
| `biome_slug`, `plateau_number`, `lien_pays` | `NULL` (hors de tout groupe de pages de chapitre) |
| `offert_ouverture`, `offert_cloture` | 0 |
| `ordre_voyage` | 0 |
| `statut` | `'actif'` |

Utilise `INSERT … ON DUPLICATE KEY UPDATE`, pas `IGNORE`. Vérifie dans `migrations/117_gl_lore_carnet.sql` les colonnes
obligatoires (incipit, auteur…) et remplis-les sans rien inventer de visible : `incipit` = les 80 premiers caractères du
texte.

c. **GL2P-04** : `texte` = « Là-bas, on m'a souvent demandé si j'étais gnome ou licorne. Les deux, l'une après
l'autre. Mes plus belles pages sont écrites des deux écritures à la fois : la petite, serrée, pleine de mesures, et la
grande, penchée, pleine de vent. Ce sont celles qui n'ont jamais pâli. Faites comme moi : changez de forme sans regret
à chaque seuil, et prêtez votre regard à l'autre peuple. »
- Signature : « — S. » (dans le champ de signature s'il existe, sinon en fin de texte, sur sa ligne).
- Incipit : « Là-bas, on m'a souvent demandé si j'étais gnome ou licorne. Les deux, l'une après l'autre… ».
- Garde : l'ancien texte contient « J'ai recopié tout son carnet ».

d. **Pages corrigées**, chaque écriture gardée par l'ancienne phrase exacte (`REPLACE`) :

| Page | Avant | Après |
| --- | --- | --- |
| `ep-echo-02` | « Le corbeau a fait « krâ » tout doucement, ce qui chez lui veut dire : noté. » | « Le corbeau a crié tout doucement, ce qui chez lui veut dire : noté. » |
| `ep-I-07` | « Le Silence ne fait pas de bruit — c'est sa ruse. Il enlève. » | « Le Silence ne fait pas de bruit. Les chants s'en vont un par un. » |
| `ep-I-07` | « Il vient de partout à la fois. » puis le paragraphe « Il vient du sud. *(je rature « du sud ». Je le réécris.)* » | « Il vient de partout à la fois. » (le dernier paragraphe est retiré) |
| `sc-landes-course` | « C'est pour ça que je l'ai vu de loin — le Silence, qui montait sur la lande comme une marée. Là où il gagne, les oiseaux se taisent d'un coup, l'ajonc perd son odeur, et il ne reste qu'un grand rien gris. Ce jour-là, il montait vite. » | « C'est pour ça que je l'ai vu de loin : les oiseaux se taisaient d'un coup, l'ajonc perdait son odeur, et le silence gagnait la lande comme une marée. Ce jour-là, il gagnait vite. » |
| `sc-landes-course` | « On a compris en même temps : à pied, on n'atteindrait pas l'autre rive avant lui. » | « On a compris en même temps : à pied, on n'atteindrait pas l'autre rive avant que tout se taise. » |
| `sc-landes-course` | « il a lâché un « krâ » bien gras — moqueur, j'en suis sûre. » | « il a lâché un cri bien gras — moqueur, j'en suis sûre. » |

   - `message-boite` (« À la classe qui vient », le mot de Sélène remis au démarrage) : « Je m'appelle Selene. » → « Je
     m'appelle Sélène. » (garde : l'ancienne phrase exacte).

e. Si une garde ne trouve rien (texte déjà corrigé par Oliv), la migration n'écrit pas, et ton fichier de lot le dit.

**3. Test de migration** (base locale) :
- 41 notes et 4 enveloppes actives ;
- aucune ancienne page du copiste active ;
- GL2P-04 à la voix de Sélène ;
- plus aucun « krâ » ni « du sud » dans les pages actives du carnet, une fois C1 ter passée (seule `ep-finale`, le
  final de juin, garde le cri) ;
- un deuxième passage ne change rien.

**4. Test de contenu `tests/content/gl-copiste-notes.test.js`**, sur le fichier :

| Contrôle | Attendu |
| --- | --- |
| Nombre de notes par liasse | 7 / 8 / 8 / 10 / 8, plus 4 enveloppes |
| Mots interdits | aucun mot entier « morte », aucun « krâ », « Kraa », « Krâ » (insensible à la casse ; « plantes mortes » et « elle ne meurt pas ici » sont permis) |
| Directions | aucun mot entier « sud », aucun « derrière vous » |
| Adresse | aucun mot entier « tu », hors d'une citation entre « » (le cri de l'oiseau dans `cop-juin-05` est une citation) |
| Visages | aucun nom de visage avant son plateau (Grise à partir de `copiste-p2`, Silence `p3`, Détricotage et Effacement `p4`) |
| Filtre | `findForbiddenString` muet |
| Dernière note de `copiste-p4` | se termine par « elle m'a sauvé la vie. » |

Message d'échec en français, avec le code de la note.

### Étape C1 ter — Coquilles et garde-fous du carnet de Sélène (décision 42) · lot C

**Constat du 24/11 à 12 h 20** (connecteur, prod v1.263.5) : les 141 pages actives du carnet de Sélène (types
`feuillet`, `scene`, `reponse`, `vierge`) et le mot de la boîte, relues une à une.
- Le cri de l'oiseau est écrit dans six pages lues avant juin (`ep-VI-04` en dialogue, `ep-VI-02`, `ep-VI-07`,
  `ep-VIII-03`, `ep-quot-1`, `sc-taiga-corbeau`), en plus des deux que corrige C1.
- L'ancien jeu y vit encore : cœurs (`ep-IV-05`, `ep-IV-06`, `ep-V-05`, `ep-VIII-08`), gemmes gagnées « chaque fois
  que tu sais » et « savoir devenu pouvoir » (`ep-IV-06`, `sort-savane-01` : effet Matthieu), sorts de soin.
- La page `ep-IV-03`, **dans la boîte de la séance 1**, nomme les quatre visages et place la cause du Souffle
  « par-derrière, depuis le sud » ; son incipit garde « de là où vivent les gens », retiré du texte.
- `ep-I-13` (« un grondement… du sud. De là d'où je viens », cendre, tiédeur) et `rep-II-05` (« Il vient de derrière.
  Du sud. De *chez moi* ») disent le renversement en toutes lettres ; leurs questions d'idée-clé aussi (`LQCM0168`,
  déjà éteinte ; `LQCM0239`, active).
- Seize pages font agir le Souffle ou un visage : « prend », « a tout pris », « rôde » (`GL2P-02`), « ruse »
  (`ep-III-05`, comme `ep-I-07`), « aime », « voudrait », « parie ».
- `ep-seuil-2` nomme le Silence au plateau 2, `ep-seuil-3` le Détricotage au plateau 3.
- « tu es allé » (`ep-VIII-11`), « tu es le seul » (`ep-finale`), « pour le lecteur sérieux » ; « le vent m'a saisi »
  (Sélène parle) ; guillemets droits ; « Selene » sans accent dans 32 textes accessibles, 3 textes et un incipit.
- 55 incipits sont coupés au milieu d'un mot (« debo… », « *co… » avec l'astérisque visible) ; ils s'affichent dans la
  fenêtre de découverte, le carnet et le carnet de la classe.
- 65 questions de lore « Quel feuillet … s'ouvre ainsi : « … » ? » recopient ces incipits, dont 23 citent les
  anciennes pages du copiste, que C1 archive (« L'HOMME ASSIS, C'ÉTAIT MOI »…). 25 autres décrivent l'ancien jeu
  (cœurs, cases asymétriques, « +1 gemme par bonne réponse », Sacrifice, Résurrection, Vitesse) et valident encore des
  fiches du lexique réécrites le 24/11 (`LR0023` le cœur, `LR0024` la gemme, `LR0036` les sortilèges…).

**1. Fichier source** `data/gl/carnet/corrections-carnet-selene-2026-11-24.json`, recopié de l'annexe L mot pour mot.
Il fait foi.

**2. Même migration que C1 (`N+6`), après les écritures de C1 (points c, d) :**

a. **Remplacements**, dans l'ordre du fichier (l'ordre compte pour `ep-VI-04`) :
```sql
UPDATE gl_lore_feuillets
   SET <champ> = REPLACE(<champ>, <ancien>, <nouveau>)
 WHERE feuillet_code = <code>
   AND LOCATE(<ancien>, <champ>) > 0;
```
- Jamais `LIKE` (les textes contiennent `%` ou `_` possibles, et des apostrophes : échappe-les).
- Quand `toutes` est faux, ajoute la garde « une seule occurrence » :
  `(CHAR_LENGTH(<champ>) - CHAR_LENGTH(REPLACE(<champ>, <ancien>, ''))) = CHAR_LENGTH(<ancien>)`.
- Une garde qui ne trouve rien n'écrit rien (texte déjà corrigé par Oliv) : ton fichier de lot le dit.
- Génère le SQL depuis le fichier par un petit script ; ne committe que le SQL.

b. **Accent** : `REPLACE(col, 'Selene', 'Sélène')` sur `titre`, `incipit`, `texte`, `texte_accessible` des pages
actives des types `feuillet`, `scene`, `reponse`, `vierge`, `message` (GL2P-04 est déjà réécrite par C1), puis sur
`question`, `choix_a` à `choix_e`, `feedback_correct`, `feedback_a` à `feedback_e` des questions **actives** de
`gl_qcm_lore_questions`. `REPLACE` est sensible à la casse : « SELENE » (titre d'une ancienne page du copiste, dans des
choix éteints au point e) ne bouge pas.

c. **Incipits** : pour chaque entrée de `incipits`,
`UPDATE gl_lore_feuillets SET incipit = <texte> WHERE feuillet_code = <code> AND statut = 'actif'`.

d. **Pages éteintes** : `ep-I-13` et `rep-II-05` → `statut = 'inactif'`, `offert_cloture = 0`. Rien n'est supprimé.

e. **Questions de lore** :
- `reecrire` : `UPDATE gl_qcm_lore_questions SET question = <texte> WHERE question_code = <code> AND question LIKE
  'Quel feuillet du carnet de Sel%s''ouvre ainsi%'` (garde par le gabarit ; ici le `LIKE` est voulu, sur un préfixe
  sans texte libre). Choix et bonne réponse ne changent pas : ce sont les titres des pages.
- `inactiver` : `statut = 'inactif'`, et le motif ajouté à `notes_pedagogiques` (« [24/11 C1 ter] … », par
  `CONCAT_WS` ; si la colonne n'existe pas, le motif reste dans le fichier). Les liens de ces questions ne sont pas
  supprimés. Une fiche du lexique qui n'a plus de question active se valide sans question, comme aujourd'hui pour une
  ressource sans lien approuvé.

**3. `src/gl/data/zones_feuillets.json`** (catalogue des zones de feuillet du jeu classique ; ses polygones servent de
`polygone_ref` aux zones de chasse) : « Selene » → « Sélène » dans les popovers ; popover de `zf-p4-07` (page
`ep-I-13`) → « Sélène se pose une question qu'elle n'ose pas écrire. ». **Ne retire aucune zone** : le test du
chargeur en compte 21, et des zones de chasse s'appuient sur leurs polygones.

**4. Test de migration** (base locale ; les pages du carnet viennent de `npm run gl:sim:db` si l'instantané les
contient, sinon de lignes de fixture pour les pages citées) :
- aucune page active du carnet ne contient « krâ » (insensible à la casse) hors `ep-finale`, ni « du sud », ni
  « Selene », ni « cœurs » ;
- aucun incipit actif ne contient « * » ni deux espaces de suite ;
- `ep-I-13` et `rep-II-05` inactives ;
- aucune question de lore active ne commence par « Quel feuillet du copiste » ; `LQCM0239`, `LQCM0117` inactives ;
- un deuxième passage ne change rien.

**5. Test de contenu `tests/content/gl-carnet-selene-corrections.test.js`**, sur le fichier :

| Contrôle | Attendu |
| --- | --- |
| `nouveau`, incipits, questions réécrites | aucun « krâ », « Kraa » (insensible à la casse), « Selene », « cœurs », « du sud », « monstre », point médian, guillemet droit `"` |
| Agent | aucun `(Souffle\|Grise\|Silence\|Détricotage\|Effacement)` suivi, dans les 40 caractères, de « rôde », « ronge », « attaque », « chasse », « tue », « prend », « pris », « mord », « voudrait », « aime », « parie », « ruse » |
| Incipits | 125 caractères au plus, aucun astérisque, autant de « « » que de « » » |
| Questions réécrites | forme exacte « Quel feuillet du carnet de Sélène s'ouvre ainsi : « … » ? » |
| Remplacements | `ancien` ≠ `nouveau` ; `code` présent une fois au moins dans l'instantané de prod de `data/gl/sim/` s'il y est |

`findForbiddenString` ne s'applique pas aux pages du carnet : elles disent « corbeau », c'est voulu (décision 21).
Message d'échec en français, avec le code de la page ou de la question.

**6. CHANGELOG** (entrée du lot C) : « Corrigé — G&L : coquilles et garde-fous du carnet de Sélène (cri de l'oiseau,
cœurs de l'ancien jeu, visages nommés trop tôt, renversement, accent, débuts de pages coupés) ; questions de lore
alignées ».

**Relecteur** : `gl-relecteur-garde-fous` sur l'annexe L avant de clore l'étape.

### Étape C2 — Les notes ne sortent par aucun autre chemin · lot C

- `lib/glFeuilletChapterPool.js` : ajoute `AND f.type <> 'copiste'` dans `resolveChapterFeuilletPool` et dans la garde
  `isFeuilletInChapterPool`. Les notes sont déjà hors des groupes (biome, plateau et pays à `NULL`) : c'est une ceinture
  de plus. Les quatre chemins (Trame, repli de l'étude d'une fiche, repli de la consultation, présentation par un joueur)
  n'en donnent donc jamais.
- `lib/glFeuilletBundleGrant.js` : les liasses d'ouverture et de clôture excluent `type = 'copiste'`.
- Cherche toute autre route qui sert une page par son code à un élève ou à une tablette (lecture d'une page du carnet,
  présentation par code, journal) : une note du copiste n'y passe pas. Elle ne se lit que par la route de l'étape C4.
  Dis lesquelles tu fermes.
- Tests : un chapitre ne renvoie aucune page `copiste` ; les liasses non plus ; lire une note par son code depuis un
  compte d'élève par une route du carnet → 404.

### Étape C3 — Quelles notes sont allumées : `lib/glCopisteMarges.js` · lot C

**Fonction pure** `notesAllumees({ notes, parties })`.
- `notes` : les lignes actives `type = 'copiste'`, groupées par liasse et triées par `ordre`.
- `parties` : pour chaque plateau de 1 à 4, la partie de la caravane, avec `{ plateau, pagesTenues, enveloppeOuverte, doubleFondOuvert }`.

**Règles** :
1. Monde k : les `min(pagesTenues, N)` premières notes de `copiste-pk` sont allumées, N étant le nombre de notes du
   monde.
2. Si l'enveloppe k est **ouverte par le prof** (étape C4 bis) : toutes les notes de `copiste-pk`, plus l'enveloppe k
   (`cop-env-k`).
3. Si le **double fond est ouvert** (geste du prof, sur la partie du plateau 4) : toute la liasse `copiste-juin`.
4. Une note allumée le reste, même si l'état change ensuite.

Pourquoi un geste du prof et pas la clôture de la partie : dans la classe, l'enveloppe réelle s'ouvre au camp, et la
lettre de juin sous le double fond se lit en juin, parfois des semaines après la fin du plateau 4. Si l'app ouvrait
seule à la clôture, les élèves liraient chez eux l'enveloppe ou la lettre avant le moment vécu ensemble.

**Lecture** `chargerMargesDuCopiste(db, { classId })`.
- La caravane est la classe : `gl_games.class_id`.
- Pour chaque plateau, la partie de la classe sur le chapitre de ce plateau (`gl_chapters.plateau_number`) ; s'il y en
  a plusieurs, la plus avancée (terminée d'abord, sinon le plus de pages tenues). Ignore les parties `draft`.
- `pagesTenues` = `COUNT(*)` de `gl_game_chasse_pages` avec `etat = 'tenue'` pour cette partie.
- `enveloppeOuverte`, `doubleFondOuvert` : lus dans `gl_games.tenir_overrides_json` de cette partie, clé `copiste`
  (`{ "enveloppe_ouverte_at": "…", "double_fond_ouvert_at": "…" }`), écrite par l'étape C4 bis.
- **Aucun changement du moteur** : c'est un calcul. Les pages déjà tenues avant la fusion allument donc leurs notes
  d'elles-mêmes.

**Tests de la fonction pure** :
- 0 page tenue → rien ;
- 3 pages au plateau 1 → les notes 1 à 3 ;
- 12 pages au plateau 2 → les 8 notes ;
- enveloppe ouverte avec 2 pages → tout le monde et l'enveloppe ;
- partie terminée sans enveloppe ouverte → seulement les notes des pages tenues ;
- double fond ouvert → juin ; partie du plateau 4 terminée sans double fond → pas de juin ;
- plusieurs parties sur un même plateau → la plus avancée.

### Étape C4 — La route `GET /api/gl/copiste/marges` · lot C

**Qui peut la lire, et sur quelle classe** :

| Lecteur | Classe servie |
| --- | --- |
| Élève connecté (`gl_player`) | Sa classe |
| Tablette d'équipe (invité d'équipe) | La classe de la partie de la session (la projection la lit aussi si tu montes le bloc en camp, voir C5) |
| Staff G&L | Toutes les classes, avec `?classId=` |

**Réponse** :

```json
{
  "compteurs": {
    "pagesSelene": 0,
    "notesAllumees": 0,
    "notesTotal": 41
  },
  "liasses": [
    {
      "liasse": "copiste-p1",
      "titre": "Le premier monde",
      "notes": [
        { "code": "cop-p1-01", "titre": "Le café", "texte": "…", "allumee": true }
      ]
    }
  ],
  "enveloppes": [
    { "code": "cop-env-1", "titre": "Enveloppe « baobab »", "legende": "…", "texte": "…", "ouverte": true }
  ]
}
```

- `pagesSelene` : les pages tenues par la caravane, toutes parties confondues.
- `notesTotal` : 33 notes des plateaux et 8 de juin. Les enveloppes ne comptent pas.
- **Une note éteinte n'a ni `titre` ni `texte`** (le serveur ne les envoie pas). Une enveloppe fermée non plus.
- Pour le staff seulement : les notes éteintes sont servies aussi, avec `allumee: false`, pour préparer la lecture.
- Aucune écriture, aucun réglage. `docs/API.md` à jour.
- Tests : élève, tablette, staff, élève d'une autre classe (rien de la classe voisine), note éteinte sans texte.

### Étape C4 bis — Ouvrir l'enveloppe, ouvrir le double fond : `POST /api/gl/copiste/ouvrir` · lot C

- Staff G&L seulement (403 pour tout autre lecteur). Corps : `{ gameId, quoi: 'enveloppe' | 'double_fond' }`.
- `enveloppe` : la partie doit être terminée (statut `ended`, le camp ; sinon 409 « Le camp n'est pas encore
  atteint. »). `double_fond` : seulement sur une partie du plateau 4 dont l'enveloppe est ouverte (sinon 409).
- Écrit `tenir_overrides_json.copiste.enveloppe_ouverte_at` (ou `double_fond_ouvert_at`) en `JSON_SET`, sous
  `SELECT … FOR UPDATE`, comme `lib/glEscalier.js` le fait pour l'escalier : les autres clés (surface, escalier,
  sabliers) restent intactes. Un second appel ne change rien (idempotent).
- Journal de partie : un évènement `copiste_enveloppe` ou `copiste_double_fond` (« Le prof ouvre l'enveloppe du
  monde. »), sans contenu.
- **La liasse de fin de Sélène part avec le double fond** (décision 42). Aujourd'hui, `routes/gl/games/status.js` (vers
  la ligne 202) remet la liasse `offert_cloture = 1` à la clôture de la partie du dernier plateau : en « Tenir », les
  élèves liraient `ep-finale` (le cri de l'oiseau, « Il s'appelle — »), `ep-I-16` et `ep-I-17` au camp du plateau 4,
  parfois des semaines avant juin. En partie « Tenir », cette remise automatique est retirée ; `double_fond` appelle
  `grantClosingFeuilletsForGame` pour la partie (toutes ses équipes ; une page déjà trouvée n'est pas remise), après
  l'écriture du drapeau. Partie classique : inchangée. Les anciennes pages du copiste ne sont plus dans la liasse (C1
  les archive, C2 l'exclut). Tests : clôture du plateau 4 en « Tenir » → aucune page de la liasse ; double fond → les
  trois pages de Sélène, une seule fois.
- Tests : prof → ouvert ; élève → 403 ; partie non terminée → 409 ; double fond avant l'enveloppe → 409 ; autres clés de
  `tenir_overrides_json` gardées ; second appel sans effet.

### Étape C5 — « Les marges du copiste » au Seuil · lot C

**Composant `GLCopisteMarges.jsx`**, monté dans `GLSeuilView` sous les pages de l'élève.

- **En-tête**, deux compteurs côte à côte :
  - « Pages de Sélène tenues par la caravane : {n} » ;
  - « Notes du copiste : {k} / 41 ».
- **Le bloc reste caché tant que k = 0** : le copiste apparaît avec sa première note.
- **Les notes**, par monde, dans l'ordre ; une note allumée = son titre, puis son texte.
  - Écriture au crayon : gris graphite (`#4a4a4a` sur papier clair, contraste AA vérifié), minuscules telles quelles,
    police à empattement en italique, marge de gauche réglée comme un cahier.
  - Distincte des pages de Sélène, qui gardent leur style.
  - Une note éteinte = une ligne vide pointillée, sans titre (« … »). L'élève voit qu'il en reste, pas ce qu'elles
    disent.
- **Les enveloppes ouvertes** : le dessin du monde (baobab, dune, feuille, flocon, en emoji ou en icône, au choix du
  lot), la légende en italique, puis le texte. Les crochets « […] » et « [ici, je n'arrive pas à lire] » sont gardés et
  mis en gris clair.
- **Nouvelle note** depuis la dernière visite (mémoire locale, lecture et écriture sous `try/catch`) : une seule ligne
  en haut du Seuil, « Une note au crayon est apparue dans les marges. ». Jamais pendant un tour, jamais sur la tablette
  d'équipe, jamais en projection.
- **Console du prof** :
  - dans la liste des parties de la console (`GLGameMasterConsoleParties`), une action **« Marges du copiste »** sur
    chaque partie « Tenir » de la classe, terminée ou non. Elle ouvre le même composant, pour la classe de la partie,
    avec un mode **« grand texte »** lisible en projection (le prof le montre au vidéoprojecteur, ou le lit) ;
  - en tête de ce mode, si la partie est terminée et son enveloppe fermée : bouton **« Ouvrir l'enveloppe « baobab » »**
    (« dune », « feuille », « flocon » selon le plateau), puis, sur la partie du plateau 4 une fois l'enveloppe
    ouverte : **« Ouvrir le double fond »**. Chacun demande une confirmation (« Les élèves la verront aussi sur leur
    compte. ») et appelle l'étape C4 bis ;
  - après « Clore le chapitre » (`GLTourScreen`), une ligne d'aide : « Au camp : « Marges du copiste », puis ouvrez
    l'enveloppe du monde. » (modification minimale, signalée dans ton fichier de lot).
- **Personne d'autre n'ouvre rien** : ni l'élève, ni la tablette d'équipe, ni la projection, ni une clôture de partie.
- **Mots** : registre élève de l'addendum 2 (« caravane », jamais « classe », « feuillet », « joueur ») pour les
  chaînes du composant ; le test `gl-mots-du-voyage` du lot V les couvre (ajoute le composant à sa liste). Le texte des
  notes n'y passe pas : le copiste vit avant le miroir et cite « à la classe qui vient ».
- **Tests UI** :
  - bloc caché à 0 note ;
  - 3 notes allumées → 3 textes et des lignes pointillées ;
  - enveloppe ouverte affichée ;
  - ligne « nouvelle note » une seule fois ;
  - l'action de la console ouvre le mode grand texte ; « Ouvrir l'enveloppe » absent tant que la partie n'est pas
    terminée ; « Ouvrir le double fond » absent avant l'enveloppe du plateau 4.

### Étape C6 — L'intro par défaut, les garde-fous écrits, les docs · lot C

- **`data/gl/intro.default.json`** : remplace son contenu par celui de l'annexe K.2 (la version de l'intro du 24/11 :
  deux voix, Passeur et Sélène, plus de copiste). Garde la forme que lit `lib/glIntro.js` (les neuf `SCENE_IDS`) et vérifie
  avec son normaliseur.
  - En prod, le réglage `content.intro` prime : c'est Oliv qui le pose (§ 5).
  - Le test de l'intro ne doit trouver ni « copiste », ni « mangé », ni « mord ».
- **Garde-fou écrit** :
  - Règles § 1 et `.claude/skills/gl-tenir-garde-fous`, à la place de « le copiste reste absent du jeu » : « Le copiste
    est l'adulte qui a eu la boîte avant le Passeur et n'a pas pu passer le miroir (le mot de Sélène le dit : les grands
    ne voient que leur reflet). Il a tout écrit avant, pour la classe qui viendra. Il n'a pas de nom, ne signe pas, ne
    montre pas son visage pendant l'année. Il ne parle que par ses notes au crayon, qui reparaissent une à une quand la
    caravane tient une page de Sélène (Seuil), et par les enveloppes de la boîte, que le prof ouvre au camp. Il ne cite
    un passage du carnet qu'au monde où il se lit. Il ne dit pas qu'il n'a pas pu passer avant
    l'enveloppe du plateau 4. Le corbeau qu'il voit est imaginaire. Sélène n'est jamais dite morte : partie, effacée,
    encore en marche ou inventée, ce sont des hypothèses. »
  - Garde-fou de vocabulaire : le copiste dit « l'oiseau », comme Olu et les écrans.
- **Docs** (§ 4).

## 3. Choix par défaut posés par Claude (à lister dans le rapport final)

- Une note s'allume à chaque page tenue, dans l'ordre de l'arc, quelle que soit la page. Le reste du monde et
  l'enveloppe reparaissent quand le prof ouvre l'enveloppe ; juin quand il ouvre le double fond (un geste chacun, au
  moment vécu en classe ; rien ne s'ouvre seul à la clôture).
- Compteur « Pages de Sélène tenues par la caravane » (le verbe du jeu), et non « retrouvées ».
- La caravane est la classe : les notes sont communes à toute la classe, jamais individuelles. Pas de course entre
  élèves, pas d'effet Matthieu.
- Les notes ne donnent rien en jeu : ni gemme, ni Lumière, ni badge.
- Bloc caché tant qu'aucune note n'est allumée ; notes éteintes sans texte côté serveur.
- La lecture en classe passe par le bouton de la console ; aucune note n'apparaît d'elle-même en projection ni sur la
  tablette d'équipe.
- Les anciennes pages restent en base, inactives.
- GL2P-04 est signée « — S. ».
- (C1 ter) Le cri de l'oiseau devient « un cri » ; les cœurs de l'ancien jeu deviennent « des forces » ; le grimoire
  d'`ep-IV-06` cite les vrais sorts (avancer, éclairer un coin caché, abriter, ramener ceux restés en arrière) ; une
  gemme vient d'une page tenue, jamais d'une bonne réponse.
- (C1 ter) Le renversement et la chute : les pages posent la question, elles ne donnent plus la réponse. Le Souffle
  n'a plus de direction (`ep-IV-03` : « Elle monte du sud » et « par-derrière, depuis le sud » retirés ; la caravane
  marche toujours vers le nord, « le dos au Souffle », comme le voile du plateau) ; « regarde derrière toi » devient
  « autour de toi » ; « Un fil des nôtres » retiré d'`ep-I-12` ; la certitude « ce rien sera la vraie réponse »
  retirée de `rep-II-04`. `ep-I-13` et `rep-II-05` passent inactives plutôt que réécrites : leur sujet même est le
  renversement. Rien n'est effacé ; Oliv peut les rouvrir pour une lecture en juin.
- (C1 ter) Incipits : coupés à une fin de phrase, ou sur un mot entier suivi de « … », sans astérisque.
- (C1 ter) Les 25 questions de lore de l'ancien jeu sont éteintes, pas réécrites : les fiches du lexique qu'elles
  validaient se valident avec leurs autres questions, ou sans question.
- (C4 bis) La liasse de fin de Sélène part avec le double fond.

## 4. Docs (§ 7 du prompt)

| Doc | Lot |
| --- | --- |
| Règles § 1 (garde-fou du copiste, décision 28 pour le gel) et § 0 (lot 8 : « 24/11 : gel levé ; le copiste parle par ses notes au Seuil et par les enveloppes de la boîte ») | C, 8 |
| `docs/API.md` : `GET /api/gl/copiste/marges`, `POST /api/gl/copiste/ouvrir` | C |
| `essentiel-mj.md` et `deroule-partie.md` : à la séance 1, intro projetée et boîte sur la table (rond de café au dos du mot, main posée en secret sur la plaque) ; à chaque camp, « Marges du copiste » (grand texte), lire les notes, puis « Ouvrir l'enveloppe » à l'écran au moment où la classe ouvre la vraie ; au camp du plateau 4, souffler sur la plaque ; en juin, « Ouvrir le double fond », lire la lettre | 9 |
| Annexe C du prompt (lot 9), § 3 : dans la liste des fonctions « Tenir » à décrire, « liasse du copiste » devient « les marges du copiste (Seuil) et les enveloppes de la boîte » | 9 |
| `guide-du-mj.md` : préparer la boîte une fois (quatre enveloppes, la lettre sous le double fond, la main sur la plaque) | 9 |

## 5. Après le chantier (§ 10 du prompt), par Oliv

1. **Intro** : poser `claude/donnees_intro/content-intro.json` dans `content.intro` (par le connecteur, sur demande, ou
   par le panneau « Intro » de l'admin), puis « Revoir l'intro ».
2. **Partie de démonstration** :
   - tenir une page → le bloc « Les marges du copiste » apparaît au Seuil d'un compte d'élève, avec « Le café » ;
   - clore la partie → rien de plus ; « Marges du copiste », puis « Ouvrir l'enveloppe « baobab » » → tout le premier
     monde et l'enveloppe, aussi sur le compte de l'élève.
3. **Avant le plateau 2** : `gameplay.tenir_chapardeur` → true, si tu veux qu'Olu parle de l'oiseau.
3 bis. **Carnet de Sélène** (C1 ter) : relire dans l'éditeur `ep-IV-03` à `ep-IV-07` (la boîte de la séance 1) et
   `ep-VI-04` ; vérifier que `ep-I-13` et `rep-II-05` sont inactives. **Ne réimporte plus les feuillets ni les questions
   de lore depuis un tableur** : l'import remettrait les anciens textes.
4. **Préparer la boîte** :
   - le mot de Sélène avec un rond de café au dos ;
   - la grande main grasse sur la plaque (à essayer à la buée avant) ;
   - les quatre enveloppes (textes de l'annexe K, à la main) ;
   - la lettre sous le double fond.

---

## Annexe K — Les textes

### K.1 Les notes du copiste (source de `data/gl/copiste/notes.json`)

Les règles d'écriture et la relecture sont recopiées avec les textes. Elles ne vont pas dans le fichier. L'ancien code
est entre parenthèses après chaque titre (champ `source`) ; « Des baleines dans le sable » n'en a pas (`source: null`).

#### Règles d'écriture

**La forme**
- Minuscules, au crayon.
- Il parle pour lui-même, parfois à « vous » (la classe). Jamais « tu ».

**Le ton : un tonton un peu fou**
- Punk, drôle, très cultivé.
- Une référence s'explique dans la même phrase.

**Le fond existentiel**
- Il se dit par des objets, des gestes et des blancs : le fauteuil, le café froid, la porte fermée, « […] ».
- Pas d'aveu ni de diagnostic : chaque élève peut y mettre ce qu'il veut.
- « Elle m'a sauvé la vie » reste : c'est la dernière ligne du plateau 4.

**Les garde-fous**
- Sélène n'est jamais dite « morte » : partie, effacée, encore en marche, inventée, ce sont des hypothèses.
- « L'oiseau », jamais son nom. Son cri n'est écrit qu'en juin.
- Le Souffle n'agit pas : les pages pâlissent.
- Aucun visage du Souffle avant son plateau.

**Pour les tests**
- Il ne dit jamais qu'il n'a pas pu passer avant l'enveloppe du plateau 4 : il « cherche encore la poignée ».

**La fiction (une seule règle, la même que pour Sélène)**
- La boîte est passée de Sélène au copiste, puis du copiste à la classe. Le mot de Sélène (« À la classe qui vient »)
  dit déjà pourquoi il n'a pas pu passer : « Les grands […] ne voient que leur reflet, et la porte reste fermée. »
- Il a tout écrit **avant**, pour « la classe qui viendra » : ses notes s'adressent à un lecteur futur (« vous qui
  lisez »), jamais à une classe qu'il verrait jouer.
- Une page de Sélène qui pâlit garde son titre ici et repart là-bas ; la caravane la retrouve et la tient, elle
  redevient lisible. Les marges au crayon du copiste ont pâli avec le carnet : **chaque page tenue en fait reparaître
  une**.
- Il ne cite un passage du carnet qu'au monde où ce passage se lit (l'homme assis et sa tasse : quatrième monde).

**Comment une note s'allume**
- La note n°k d'un monde s'allume à la k-ième page de Sélène tenue par la caravane.
- Au camp, quand le prof ouvre l'enveloppe du monde, le reste des notes du monde reparaît avec elle.
- Juin : quand le prof ouvre le double fond.

#### Plateau 1 (7 notes)

**1. Le café** (repris de `cop-marg-quotidien`)
pardon pour la tache sur le mot de la boîte. je pose ma tasse partout, surtout là où il ne faut pas. le café refroidit
toujours avant que je pense à le boire. c'est devenu mon horloge : une tasse froide, une heure de passée. parfois deux.
parfois j'arrête de compter.

**2. Comment on entre** (`cop-mov-1`)
elle écrit qu'on ne casse pas le miroir : on se laisse distraire par une bête, jusqu'à s'oublier. lewis carroll l'avait
déjà raconté, avec alice qui passe de l'autre côté de la glace. tous les vieux contes commencent par une porte : un
terrier, une armoire, une forêt. on n'en ressort jamais tout à fait pareil. vous, vous êtes passés. moi, je cherche encore
la poignée.

**3. Les tropiques** (`cop-mov-2`)
on appelle la jungle « le poumon du monde ». raté : elle respire autant qu'elle souffle. c'est plutôt un estomac. une
feuille tombe, et en quelques semaines les champignons, les termites et les petites bêtes l'ont mangée et rendue au sol.
rien ne se perd. et c'est ici qu'arrive l'oiseau, dans son carnet. retenez-le. moi, je n'arrive plus à m'en débarrasser :
il est dans presque chaque page. à force, j'ai l'impression qu'il me regarde recopier.

**4. En marge de la savane** (`cop-bio-savane`)
le feu passe, tout noircit, et trois semaines plus tard c'est vert. l'herbe garde son cœur au ras du sol : le feu lui
coupe les cheveux, il ne la tue pas. il m'a fallu des années pour comprendre ce qu'une herbe sait en naissant. et cette
savane est jeune, quelques millions d'années à peine. à l'échelle de la terre, une gamine. ne vous fiez jamais à ce qui a
l'air éternel. ni à ce qui a l'air fini.

**5. Les gnomes** (`cop-marg-paracelse`)
les gnomes, ce n'est pas un vieux conte. c'est un médecin suisse du XVIe siècle, paracelse, moitié génie, moitié
charlatan, mon genre de gars. il les a inventés pour ranger le monde : des esprits de la terre, à côté de ceux de l'eau,
de l'air et du feu. quatre siècles plus tard, on les a mis en plâtre sur les pelouses, avec un bonnet rouge. voilà ce
qu'on fait des belles idées. les vôtres, gardez-les debout.

**6. Aimer ce qui s'efface** (`cop-insert-amour`)
elle tombe amoureuse de la jungle. moi, je recopie en serrant les dents, parce que je vois ses pages pâlir. alors une
question me tient depuis le début : à quoi bon aimer ce qui ne dure pas ? j'ai remarqué un détail. ceux qui posent cette
question sont presque toujours assis. elle, elle marche. je la pose quand même, la question. dans mon fauteuil.

**7. Chacun pour sa peau** (`cop-acte1`)
pour l'instant, elle se débrouille seule : elle grimpe seule, elle compte seule. c'est par là qu'on commence tous. moi,
j'ai longtemps gardé mes affaires pour moi, porte fermée. le fauteuil a fini par prendre ma forme. et puis cette boîte, et
vous, qui lisez ce que je n'arrivais pas à lire. bon. je me lève. pas vite. mais je me lève.

##### Relecture du plateau 1 (skill `gl-garde-fous-contenu`)

| Point | Résultat |
| --- | --- |
| Souffle | N'agit jamais (« ses pages pâlir ») |
| Sélène | Jamais dite morte |
| Oiseau | Ni nom ni cri ; « l'oiseau » |
| Visages | Aucun nom de visage (pas de « gris ») |
| Adresse | « vous » à la classe, jamais « tu » |
| Science | Jungle et décomposeurs (champignons, termites) ; herbes de savane repartant de la base, savanes de quelques millions d'années ; Paracelse, médecin né en Suisse, a nommé les gnomes, esprits de la terre parmi quatre élémentaires : justes |
| Arc | Le temps qui passe sans lui (café, fauteuil, porte fermée), le doute (« à quoi bon »), le premier « je me lève » ; rien n'est dit en clair |

#### Plateau 2 (8 notes)

**1. Les terres sèches** (`cop-mov-3`)
le sable, puis la garrigue. un pays qui ressemble au vôtre, et un peu au mien. ici, les couleurs s'en vont : elle appelle ça la
grise. une couleur qui pâlit sans bruit, on ne la voit pas partir, on voit seulement qu'elle n'est plus là. je connais
cette teinte. c'est celle que prend une pièce quand on ne relève plus les volets. elle, elle ravive un coin de garrigue.
moi, à l'époque, j'avais laissé la poussière faire.

**2. En marge du Sahara** (`cop-bio-sahara`)
ce sable n'a pas toujours été là. il y a quelques milliers d'années, il y avait des lacs, des hippopotames, et des gens
qui peignaient des girafes sur la roche. puis l'axe de la terre, qui tourne comme une toupie fatiguée, a penché d'un
cheveu. la pluie est partie ailleurs. personne n'avait rien fait de mal. retenez ça : un monde peut changer sans
coupable. et ce qui a changé une fois peut changer encore.

**3. D'où sort la boîte** (`cop-origine`)
vous voulez savoir d'où vient cette boîte. moi aussi. un carton sur le paillasson, un matin, sans adresse ni timbre.
ou alors je l'ai trouvée et je me raconte qu'on me l'a confiée, pour faire plus joli. dedans, un carnet qui s'efface,
une plaque polie, et son mot : « à la classe qui vient ». je ne suis pas une classe. un monsieur raisonnable aurait
refermé le couvercle : des gnomes ? canular. moi j'ai ouvert. je ne crois pas tout ce carnet,
et je le recopie quand même, lettre après lettre. les deux tiennent dans la même tête. c'est même à ça qu'on reconnaît
une tête qui marche encore.

**4. En marge de la garrigue** (`cop-bio-medit`)
il y a ici des pins qui gardent leurs graines enfermées pendant des années. il faut la chaleur d'un incendie pour que
leurs cônes s'ouvrent. après le feu, ce sont eux qui repoussent les premiers. longtemps, j'ai trouvé ça sinistre.
maintenant je trouve ça malin : certaines choses n'attendent pas que tout aille bien pour recommencer.

**5. L'oxygène** (`cop-marg-oxydation`)
un truc qui va vous étonner : la nature a déjà tout chamboulé, toute seule, bien avant nous. il y a des milliards
d'années, des bestioles minuscules ont rempli l'air d'un gaz qui a empoisonné presque tout le vivant de l'époque. ce
gaz, c'est l'oxygène. celui que vous respirez en lisant. le plus grand empoisonnement de l'histoire vous a offert vos
poumons. alors « l'équilibre de la nature »… il n'y en a jamais eu. ce qui est nouveau aujourd'hui, c'est qu'on sait
ce qu'on fait. et qu'on pourrait choisir.

**6. Des baleines dans le sable** (nouvelle ; reprend l'idée de `cop-bio-dfroid`, désert froid jamais joué)
au milieu du désert, en égypte, il y a une vallée pleine de squelettes de baleines. pas une blague : il y a quarante
millions d'années, là, c'était la mer. certaines de ces baleines avaient encore de toutes petites pattes arrière, un
reste de l'époque où leurs ancêtres marchaient sur la terre. le sable garde ce qu'on croit perdu. il suffit
d'apprendre à le lire. moi aussi, j'ai des cartons pleins de choses que je croyais finies. je ne les ouvre pas encore.
un jour.

**7. Deux façons de ne rien donner** (`cop-insert-grise`)
on a tous en nous quelqu'un qui garde tout et compte ses gemmes au lieu d'en donner une. on a envie de le trouver
petit. attendez. il y a pire que garder : ne plus rien vouloir du tout. ne plus chercher, ne plus compter, ne plus ouvrir le
courrier. j'ai connu une après-midi comme ça. elle a duré longtemps. plus longtemps qu'une après-midi.

**8. Un pont** (`cop-acte2`)
au premier monde, elle grimpait à son arbre et laissait le reste se débrouiller. plus loin dans le carnet, elle se
couche dans la boue pour qu'un autre passe sur son dos. personne ne lui a fait la morale entre-temps. un jour, elle a eu
besoin de quelqu'un, et quelqu'un a eu besoin d'elle, dans la même heure. c'est tout. moi, ce matin, j'ai ouvert la
fenêtre. ça n'a l'air de rien.

#### Plateau 3 (8 notes)

**1. Les forêts tempérées** (`cop-mov-4`)
des arbres qui lâchent leurs feuilles plutôt que de geler avec. renoncer pour tenir : il y a une leçon là-dedans, je
vous laisse la trouver, elle est trop belle pour que je la mâche. c'est ici qu'elle comprend le cœur de tout : nommer
fait tenir la page. et c'est ici qu'arrive le petit. elle va lui apprendre à voir. j'ai hâte. ça faisait longtemps que
je n'avais eu hâte de rien.

**2. En marge de la forêt d'automne** (`cop-bio-caduc`)
l'arbre ne meurt pas de l'hiver. avant le gel, il ferme le passage de la sève vers ses feuilles et les laisse tomber.
il perd ce qu'il ne pourrait pas garder, et il passe l'hiver. moi, j'ai fait l'inverse : tout gardé, les cartons, les
journaux, les rancunes. j'ai quand même tout perdu. l'arbre est plus malin que moi. ne le répétez pas.

**3. Nommer, à quoi bon ?** (`cop-insert-nommer`)
sa grande idée : nommer une bête, c'est la faire tenir. il existe tout un roman là-dessus, « l'histoire sans fin », de
michael ende, un écrivain allemand : un monde qui disparaît, et un enfant qui le sauve en donnant un nom. moi, l'avocat
du diable, je lève la main au fond : on nomme une fleur, la fleur fane quand même. et puis j'ai vu la faille dans mon
raisonnement. elle ne joue pas à gagner. on ne bat pas le vent. elle dit seulement : tant qu'un nom passe d'une main à
une autre, la chose existe encore, quelque part entre les deux. ce n'est pas un coffre, c'est un relais. un coffre, ça
se vide. un relais, tant qu'il y a quelqu'un pour courir, ça continue.

**4. En marge de la lande** (`cop-bio-landes`)
la petite plante collante qui attrape des insectes ne le fait pas par méchanceté : son sol ne lui donne presque pas
d'azote, alors elle va le chercher dans les bêtes. et sous vos pieds, la tourbe : un sol qui ne pourrit presque pas,
qui empile les plantes mortes depuis des milliers d'années et garde plus de carbone qu'une forêt de même taille. le
coin le plus triste du paysage est parfois un coffre-fort. pensez-y, la prochaine fois qu'un endroit vous paraîtra moche.
ou une personne.

**5. « C'est naturel »** (`cop-marg-nature`)
« c'est naturel, donc c'est bien » : le plus vieux piège du monde. deux philosophes, l'écossais david hume puis l'anglais
george moore, l'ont démonté il y a longtemps : de ce que les choses sont, on ne peut pas déduire ce qu'elles doivent
être. la nature n'a pas de morale. le bien, ce n'est pas un fait qu'on observe, c'est une décision qu'on prend. bonne
nouvelle : personne ne décidera à votre place.

**6. Un nom** (`cop-marg-nom`)
ici, un nom ne se donne pas à la légère : nommer, c'est promettre de tenir la chose. elle ne le dit pas encore, mais
c'est pour ça qu'elle n'ose pas nommer son oiseau, pendant toute une partie du voyage. gardez ça en tête. moi, j'ai
longtemps évité de prononcer certains noms. il paraît que ça les garde. ça les garde surtout dans le noir.

**7. Le petit** (`cop-insert-transmettre`)
le petit arrive, et elle lui apprend à voir. elle ne fait pas ça pour que ça « serve ». elle le fait parce que c'est
ça, être deux. un savoir gardé pour soi, c'est un caillou dans la poche ; donné, ça devient un pont. entre le moment où
elle lui montre une bête et celui où il en nomme une, tout seul, plus loin, il s'est passé quelque chose qui n'était
pas là avant. appelez ça comme vous voulez. moi, ça m'a donné envie de sortir acheter du pain. j'y suis
allé.

**8. Et si j'avais tout inventé ?** (`cop-doute-mid`)
la chose qui me réveille la nuit : plus je recopie, plus son écriture ressemble à la mienne. les lettres, les manies,
cette façon de couper une phrase en deux pour respirer. et si sélène n'avait jamais existé ? si je l'avais inventée,
un jour où j'étais assis, pour me forcer à me lever ? je n'ai aucun moyen de trancher. et le plus drôle, c'est que ça
ne change presque rien : vraie ou inventée, elle m'a fait lever. un vieux livre dit qu'on reconnaît l'arbre à ses
fruits, pas à son acte de naissance. c'est d'ailleurs ce qu'on vous demande en sciences : ne pas croire une chose parce
qu'elle est écrite, regarder si elle tient quand on vérifie.

#### Plateau 4 (10 notes)

**1. Les grands froids** (`cop-mov-5`)
le plus long, le plus dur. ici, tout lâche en chaîne, un fil après l'autre : elle appelle ça le détricotage. c'est
aussi ici qu'ils rencontrent l'homme assis. je vous préviens : je vais beaucoup parler de moi dans ce monde-là. pas par
vanité. parce que l'homme assis, il faudra bien que je vous en dise quelque chose.

**2. En marge de la taïga** (`cop-bio-taiga`)
tout est lent ici, et vous allez bâiller. erreur. lent, ce n'est pas mort : c'est une vie qui compte le soleil. la
plupart de ces arbres gardent leurs aiguilles toute l'année, pour ne pas perdre une minute de lumière quand le froid
lâche. moi, j'ai laissé filer des années sans rien faire, alors je n'ai pas de leçon à donner à un sapin. juste une :
ne confondez jamais lent et fini.

**3. Le film de la vie** (`cop-marg-gould`)
un paléontologue américain, stephen jay gould, disait : si on rembobinait le film de la vie pour le rejouer, on
n'obtiendrait jamais deux fois la même chose. ni les dinosaures, ni les baleines, ni vous. vous êtes un accident
magnifique qui ne se reproduira pas. il y a de quoi avoir le vertige, ou dire merci. choisissez merci : c'est le même
fait, mais c'est plus utile.

**4. Elle oublie. moi aussi.** (`cop-insert-effacement`)
elle écrit sur ce qui s'efface : des noms, des chants, des couleurs. hier, j'ai cherché le nom de la rue où j'ai
grandi. il n'est pas venu. ça m'a fait rire. puis ça ne m'a plus fait rire. ce qui pâlit dans son carnet pâlit un peu
chez moi aussi, par les bords. si mes phrases se mettent à boiter vers la fin, ne corrigez pas. laissez. c'est ma page
à moi qui […]

**5. Moi aussi, j'étais assis** (`cop-confession`)
l'homme assis du carnet, celui qui offre le thé dans son dernier coin vert, je le connais. pas lui : sa façon d'être
assis. une histoire de moi, une seule, après on n'en parle plus. avant la boîte, j'étais assis. pas sur une chaise :
dans ma tête, l'endroit le plus inconfortable pour rester assis longtemps. j'avais essayé de réparer quelque chose qui
comptait. ça avait raté. alors j'en avais tiré une conclusion très solide : puisque réparer ne marche pas, autant ne
plus rien tenter. plus on y pense, plus c'est solide. c'est juste impossible à vivre. l'homme du thé n'a pas tort,
voilà ce qui fait peur. et puis cette boîte, et elle, qui marchait quand même et notait le nom des fleurs. je me suis
levé pour ne pas avoir honte devant elle.

**6. La tasse** (`cop-marg-tasse`)
quand elle repasse par le coin vert, l'homme n'est plus là. sa tasse, oui : posée bien droite, vide. parti ? effacé ?
elle ne tranche pas. moi non plus. (entre nous : j'espère qu'il s'est levé. je le dis tout bas.) et elle, alors ? son
carnet est revenu sans elle. partie plus loin ? effacée ? encore en train de marcher quelque part, sur une page que je
n'aurai jamais ? je fais des listes d'hypothèses comme d'autres font des mots croisés. aucune ne gagne. j'en garde une
sous l'oreiller, la meilleure. je ne vous dirai pas laquelle.

**7. La glace** (`cop-mov-6`)
le bout. le soleil qui ne se couche plus, puis qui ne se lève plus. le ciel qui s'allume en silence : du vent venu du
soleil qui frappe le haut de l'air, si vous voulez la version sans magie. moi, à ce stade, je préfère regarder. elle
marche vers l'étoile du nord, celle qui ne bouge pas. en vrai, elle bouge, très lentement, depuis des milliers
d'années. mais le temps d'une vie, elle tient lieu de nord. c'est tout ce qu'on demande à une étoile. ici, le carnet
pâlit plus vite que partout. lisez vite. je recopie vite.

**8. En marge de la toundra** (`cop-bio-toundra`)
le soleil ne se couche plus, et tout fleurit d'un coup, en quelques semaines, comme si la toundra savait que ça ne
durera pas. c'est ça qui rend la chose belle. on ne s'émerveille jamais de ce qui dure toujours, on s'y habitue. vous
voulez le secret pour aimer quelque chose ? souvenez-vous qu'il y aura une fin.

**9. Me voilà dans la Trame** (`cop-trame`)
quelque chose a changé, ces derniers mondes. j'ai recommencé à avoir faim. à remarquer la lumière sur le mur, le matin.
à vouloir le lendemain, juste pour voir. elle écrit partout que rien n'est seul : la bête, la plante, le sol et le
climat se tiennent par la main sans le savoir. la trame. longtemps, j'ai cru que ça concernait les gnous et les
champignons, pas moi. et puis un soir, en recopiant, je me suis vu dedans : un fil, moi aussi, relié à elle, à vous, à
la personne qui lui avait confié la boîte avant elle, à l'oiseau même s'il n'existe pas. un fil tient tant qu'il peut ; quand il lâche,
d'autres le rattrapent, et la toile tient. une araignée sait ça en naissant. il m'a fallu une vie.

**10. J'ai peur de finir** (`cop-insert-peur`)
je ne sais plus quand j'ai eu envie de finir quelque chose pour la dernière fois. et là, c'est ridicule, j'ai peur
d'arriver au bout du carnet. moi qui ne finissais rien, je traîne sur les dernières pages pour faire durer. une
voyageuse que je n'ai jamais vue, un carnet, un oiseau qui n'existe pas : ils m'ont remis debout sans me demander mon
avis. je n'ai qu'une façon de dire merci : continuer, et vous le passer. elle m'a sauvé la vie.

#### Juin (8 textes, quand le prof ouvre le double fond, après le camp du quatrième monde)

**1. La couverture** (`cop-cover`)
sélène — le carnet sauvé de l'effacement. recopié, remis en ordre, et abîmé d'amour par une main qui n'a jamais dit son
nom.

**2. Ce que j'ai sauvé** (`cop-preface`, la première page, lue en dernier)
bon. voilà le topo. cette boîte m'est tombée dessus : un carnet qui s'efface, des pages dans tous les sens. j'aurais pu
refermer, j'avais sûrement autre chose à faire. (quoi ? aucune idée. mais sûrement.) au lieu de ça, je me suis assis,
et j'ai recopié. elle s'appelait sélène, du moins c'est ce qu'il restait de son nom sur la première page. elle a marché
de la chaleur de l'équateur jusqu'à la glace, pour regarder le vivant et le mettre en mots avant qu'il pâlisse. puis
son carnet est revenu sans elle. partie ? effacée ? encore en marche ? je n'ai jamais su. là où il manque, j'ai laissé
manquer : les blancs ne sont pas des erreurs, ce sont les pages que je n'arrivais pas à lire. ce carnet n'est pas une
punition, c'est une carte. et la honte n'a jamais rien réparé. pourquoi pour vous ? je ne vous connais même pas. bon. un
peu pour vous. parce qu'elle l'a fait avant moi, et quelqu'un avant elle, et que là, maintenant, vous lisez : on est déjà
trois ou quatre à tenir la même corde. c'est moins seul que ça en a l'air.

**3. La même corde** (`cop-acte3`)
elle est arrivée au bout de ce qu'une personne seule peut tenir. le dernier pas, elle ne l'a pas écrit, et c'est très
bien comme ça. au début, je me demandais si recopier servait à quelque chose : de l'eau versée dans un seau percé. je ne
sais toujours pas. mais le carnet est arrivé jusqu'à moi, et vous l'avez tenu. pas seuls : regardez autour de vous. elle
l'a écrit tout au début, je n'ai fait que recopier : la main qui garde tout finit vide. alors laissez traîner quelque
chose pour ceux d'après. un nom, un caillou, un mot dans la boîte. ce qui compte, ce n'est pas ce qui s'efface
derrière. c'est ce qu'on a le temps d'écrire devant.

**4. Elle ne meurt pas ici** (`cop-finale`)
vous attendez la suite. moi aussi, je l'ai attendue : j'ai tourné la page, et il n'y avait rien. le carnet s'arrête là,
sur un mot suspendu et du blanc. elle n'a pas écrit sa fin. personne n'écrit sa fin. j'aurais pu en inventer une, j'ai
le crayon. une fin triste dans la neige, avec la petite musique qu'il faut. je n'en ai rien fait. je ne fabrique pas ce
qu'elle n'a pas vécu. alors je la laisse là où elle s'est laissée elle-même : debout, au bord, en train de donner un
nom. elle ne meurt pas dans ce carnet. elle cesse d'être lisible, ce n'est pas la même chose. quelque part, sur une page
que je n'aurai jamais, elle fait encore un pas. quant au nom de l'oiseau : non. il est à elle, et à l'endroit où elle
l'a dit.

**5. L'oiseau** (`cop-marg-corbeau`)
à force de le recopier, je l'entends, surtout la nuit. je sais qu'il n'est pas là : il est parti avec elle. il critique
mon écriture quand même. un cri, un seul, qui veut dire « tu fais des pâtés ». je fais des pâtés. je continue. un oiseau
imaginaire ne me fera pas lâcher le crayon. il le sait.

**6. Le crayon** (`cop-marg-crayon`)
voilà, elle vous tend le crayon. j'ai failli le garder pour moi, vieux réflexe. puis je me suis rappelé qu'un crayon, ça
ne se garde pas : ça s'use en servant, ou ça sèche au fond d'un tiroir. je vous le passe. ne le gardez pas non plus.

**7. Ce que je n'ai pas pu** (`cop-close`)
voilà. c'est tout ce que j'ai sauvé. le reste, le dernier pas, ce qu'il y a au-delà de l'étoile, n'est pas là : elle n'y
était pas encore quand elle écrivait, et certaines choses ne se recopient pas, elles se vivent. elle n'a pas écrit le nom
de son oiseau ; elle a écrit tout le reste, pour que quelqu'un, un jour, ait envie de nommer le sien. moi aussi, j'avais
un nom. je pourrais l'écrire ici. une ligne. ce serait facile. alors non : on n'a pas besoin de signer ce qu'on
transmet. il suffit que ça arrive. est-ce que tout ça est vrai, elle, le miroir, l'oiseau ? je ne le sais pas, et je ne
le saurai sans doute jamais. j'ai fini par lâcher l'affaire : la bonne question, ce n'est pas « est-ce arrivé ? »,
c'est « est-ce que ça vous a changés ? ». une histoire qui remet debout est plus vraie que mille faits qui laissent
assis. les pages blanches, après celle-ci, ne sont pas un défaut d'impression. c'est votre part. bon. j'ai assez parlé.
l'oiseau trouve que je parle trop. il a raison. prenez le crayon. courez.

**8. La lettre** (sous le double fond de la boîte ; lue par le Passeur, puis dans l'app)
si vous lisez ceci, c'est que vous êtes allés au bout. je m'en doutais : vous trouvez tout. moi, je n'ai jamais pu
passer la plaque. j'ai regardé longtemps, je n'y ai vu que ma tête. elle l'avait écrit dans son mot : les grands ne
voient que leur reflet. elle avait raison, et j'étais grand. alors j'ai fait la seule chose qu'un grand sait faire :
recopier. ce que je pouvais lire, je l'ai recopié. le reste, je l'ai laissé en blanc, et j'ai rangé mes notes dans la
boîte, un monde par enveloppe. le soir, en recopiant, je voyais son oiseau sur ma table. je sais bien qu'il n'y était
pas : à force de lire ses pages, il était entré dans ma tête. il m'a tenu compagnie quand même. toute ma vie, je me suis
demandé si c'était vrai. vous, vous y êtes allés. vous avez rendu lisibles des pages que je n'arrivais même pas à
déchiffrer. mon nom, je ne vous le donne pas. au bout du carnet, il reste des pages blanches : une espèce que vous
nommez, un lien que vous avez compris. ensuite, laissez la boîte à votre tour, pour des gens que vous ne connaîtrez
pas. prenez le crayon. passez-le.

*Variante surnom* (si la classe lui a donné un nom pendant l'année) : à la place de « mon nom, je ne vous le donne pas »,
« vous m'avez donné un nom toute l'année. gardez-le : moi, j'ai perdu le mien. »

#### Les quatre enveloppes (l'objet réel est dans la boîte ; dans l'app quand le prof l'ouvre, au camp)

**Enveloppe « baobab »** (camp du plateau 1) — *une copie à trous de « Les formes de Sélène », d'une autre écriture* :
là-bas, on m'a souvent demandé si j'étais gnome ou [ici, je n'arrive pas à lire]. les deux, l'une après l'autre. mes plus
belles pages sont écrites des deux […]. ce sont celles qui n'ont jamais [ici, je n'arrive pas à lire]. faites comme moi :
changez de forme sans regret à chaque […].

**Enveloppe « dune »** (camp du plateau 2) — *un bout de crayon usé jusqu'au bois, et une note* :
trois pages ce mois-ci. le reste ne se laisse pas lire.

**Enveloppe « feuille »** (camp du plateau 3) — *une liste* :
pages que je n'arrive pas à lire : le jardinier qui oublie. six semaines de lumière. le réseau sous les pieds. la forêt
naine. le piège gluant. la mousse qui guérit. le moteur dans la nuit.

**Enveloppe « flocon »** (camp du plateau 4) — *une note* (puis on souffle sur la plaque : une grande main apparaît) :
j'ai regardé longtemps. je n'y ai vu que ma tête.

#### Relecture d'ensemble (skill `gl-garde-fous-contenu`)

| Point | Résultat |
| --- | --- |
| Souffle | N'agit jamais (pâlir, s'en aller, lâcher) ; « on ne bat pas le vent » sans adversaire |
| Visages | La Grise nommée au plateau 2, le Détricotage au plateau 4 ; le Silence et l'Effacement ne sont pas nommés |
| Sélène | Jamais dite morte : hypothèses (partie, effacée, en marche, inventée) ; la finale « elle ne meurt pas ici » |
| Oiseau | Ni nom ni cri écrit, même en juin (« un cri, un seul ») |
| Renversement | Aucune direction, aucun « sud » |
| Arc | Implicite : volets, poussière, courrier, cartons, après-midi qui dure ; « je me lève » (P1), « la fenêtre » (P2), « le pain » (P3), « elle m'a sauvé la vie » (P4) ; rien de clinique |
| Science | Sahara vert (période humide africaine, précession), baleines à pattes du Wadi Al-Hitan (Égypte, ≈ 40 millions d'années), pins à cônes ouverts par le feu (pin d'Alep), Grande Oxydation, abscission, droséra et azote, tourbe et carbone, Hume et Moore, Ende, sempervirents, Gould (contingence), aurores et précession de la Polaire, floraison de la toundra : justes |
| Adresse | Pour lui-même ou « vous » ; jamais « tu » |
| Fiction | Tout écrit avant, pour « la classe qui viendra » (« si vous lisez ceci ») ; la boîte vient de Sélène (« à la classe qui vient ») ; aucune note ne cite un passage du carnet avant son monde (homme assis et tasse au quatrième monde, le petit au troisième, la Grise au deuxième) |
| Contrôlé en prod (24/11, 12 h) | `message-boite` (mot de Sélène, la boîte confiée et passée, « les grands ne voient que leur reflet »), `ep-I-02` et `ep-V-01` (l'oiseau arrive au premier monde, « nommer, c'est promettre »), `ep-V-06` (le petit au troisième), `ep-VII-04` à `06` et `ep-VIII-05` (l'homme assis, le thé, la tasse : quatrième monde, taïga), visages `LR0002` à `LR0005` (Grise 2, Silence 3, Détricotage et Effacement 4) ; pages du désert froid toutes inactives (d'où la note des baleines au deuxième monde) |
| Longueur | 250 à 900 signes par note ; la préface et la clôture sont plus longues, en juin |

### K.2 L'intro par défaut (pour `data/gl/intro.default.json`)

Le JSON de `claude/donnees_intro/content-intro.json` (24/11, 10 h 15), recopié ci-dessous.

```json
{
  "enabled": true,
  "opening": {
    "kicker": "une boîte vous a été confiée",
    "titleHtml": "Gnomes <span class=\"amp\">&amp;</span> Licornes",
    "credit": "le carnet de Sélène — pour la classe qui viendra",
    "button": "Ouvrir la boîte",
    "foot": "jeu pédagogique d'écologie · cycle 3"
  },
  "finale": {
    "button": "Prenez le crayon."
  },
  "audio": {
    "loopKey": "GL_intro_audio_loop",
    "finalKey": "GL_intro_audio_final"
  },
  "scenes": [
    {
      "id": "boite",
      "voice": "passeur",
      "kicker": "ici, maintenant",
      "text": "Quelque chose ne va pas, ici. La plante du rebord a pâli. Les couleurs s'en vont.",
      "imageKey": "GL_intro_07_salle-de-classe",
      "hold": 2900,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        -2,
        1
      ],
      "kb0": [
        2,
        -1
      ]
    },
    {
      "id": "copiste",
      "voice": "passeur",
      "kicker": "avant d'ouvrir",
      "text": "Et puis cette boîte, un matin, sur la table. Sur le couvercle : pour la classe qui viendra.",
      "imageKey": "GL_intro_01_la-boite",
      "hold": 2600,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        -3,
        -2
      ],
      "kb0": [
        2,
        1
      ]
    },
    {
      "id": "carnet",
      "voice": "selene",
      "kicker": "la première page de la boîte",
      "text": "Des noms s'effacent. J'en ai tenu autant que j'ai pu. Il en reste beaucoup, et moi, je ne peux plus.",
      "imageKey": "GL_intro_03_le-carnet-de-selene",
      "hold": 1600,
      "erase": true,
      "finale": false,
      "cta": false,
      "kb": [
        -2,
        1
      ],
      "kb0": [
        2,
        -1
      ]
    },
    {
      "id": "miroir",
      "voice": "selene",
      "kicker": "celle qui est passée avant",
      "text": "Je m'appelle Sélène. Je suis seulement passée par là avant vous.",
      "imageKey": "GL_intro_05_selene-au-seuil",
      "hold": 2800,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        -2,
        -2
      ],
      "kb0": [
        2,
        1
      ]
    },
    {
      "id": "selene",
      "voice": "passeur",
      "kicker": "de l'équateur au pôle",
      "text": "Elle a marché de la chaleur de l'équateur jusqu'à la glace du pôle. Puis son carnet est revenu, à moitié effacé.",
      "imageKey": "GL_intro_06_le-corbeau-messager",
      "hold": 2900,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        3,
        1
      ],
      "kb0": [
        -3,
        -1
      ]
    },
    {
      "id": "corbeau",
      "voice": "selene",
      "kicker": "ce qu'il reste à trouver",
      "text": "Mes pages sont restées là-bas, sur la route. Il faut des yeux neufs pour les retrouver.",
      "imageKey": "GL_intro_08_le-carnet-dans-la-savane",
      "hold": 2900,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        2,
        -2
      ],
      "kb0": [
        -2,
        1
      ]
    },
    {
      "id": "souffle",
      "voice": "selene",
      "kicker": "comment on passe",
      "text": "Ne vous regardez pas dans la plaque. Regardez au travers. Votre Passeur, lui, reste à la porte.",
      "imageKey": "GL_intro_04_le-miroir-passage",
      "hold": 2900,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        3,
        -2
      ],
      "kb0": [
        -2,
        1
      ]
    },
    {
      "id": "seuil",
      "voice": "selene",
      "kicker": "votre tour",
      "text": "Choisissez une chose vivante. Dites son nom, tous, à voix haute. Vous serez déjà de l'autre côté.",
      "imageKey": "GL_intro_04_le-miroir-passage",
      "hold": 3600,
      "erase": false,
      "finale": false,
      "cta": false,
      "kb": [
        -2,
        1
      ],
      "kb0": [
        2,
        -1
      ]
    },
    {
      "id": "bienvenue",
      "voice": "selene",
      "kicker": "de l'autre côté du miroir",
      "text": "Bienvenue dans le monde de<br><span class=\"big\">Gnomes <i>&amp;</i> Licornes</span>",
      "imageKey": "GL_intro_09_la-traversee-des-biomes",
      "hold": 99999,
      "erase": false,
      "finale": true,
      "cta": true,
      "kb": [
        0,
        -1
      ],
      "kb0": [
        0,
        1
      ]
    }
  ]
}
```

## Annexe L — Corrections du carnet de Sélène (source de `data/gl/carnet/corrections-carnet-selene-2026-11-24.json`)

Écrite le 24/11 à 12 h 40 d'après les pages actives en prod (v1.263.5), relue contre les garde-fous
(skill `gl-garde-fous-contenu`). Contrôlé sur une copie locale de la prod, C1 appliquée d'abord : les 60 remplacements
trouvent chacun leur texte (une seule fois, sauf `ep-VI-04` « Lui : Krâ. », trois fois, `toutes`) ; après passage,
aucune page active ne contient « krâ » hors `ep-finale`, « du sud », « Selene », « cœurs », guillemet droit, double
espace ni astérisque dans un incipit ; aucun nom de visage avant son plateau. Les 42 questions réécrites sont
retrouvées par le début de leur citation. Version lisible, avant et après : `claude/Corrections_carnet_Selene_GL_2026-11-24.md`
du projet.

```json
{
 "format": "corrections-carnet-selene v1",
 "date": "2026-11-24",
 "note": "Coquilles et garde-fous des pages actives du carnet de Sélène (gl_lore_feuillets, types feuillet, scene, reponse, vierge, message), relevées en prod le 24/11 (v1.263.5). S'applique APRÈS les corrections de l'étape C1 (ep-echo-02, ep-I-07, sc-landes-course, message-boite) et après la réécriture de GL2P-04. Chaque remplacement est gardé par son ancien texte exact : s'il ne le trouve pas, il n'écrit rien. « toutes » : remplacer toutes les occurrences, sinon une seule est attendue. L'ordre compte (ep-VI-04). Incipits : texte nettoyé (ni astérisque ni double espace), coupé à une fin de phrase, ou sur un mot entier suivi de « … » ; écrits sur chaque page active citée, quel que soit l'ancien. Questions « s'ouvre ainsi » : réécrites sur le nouvel incipit de leur page, gardées par le gabarit (question qui commence par « Quel feuillet du carnet de Sel » et contient « s'ouvre ainsi »).",
 "remplacements": [
  {"code": "ep-IV-03", "champ": "texte", "ancien": "Il y a une chose qui avance. Elle monte du sud, et elle ne s'arrête jamais.", "nouveau": "Il y a une chose qui avance, et elle ne s'arrête jamais.", "toutes": false, "motif": "renversement : aucune direction pour le Souffle"},
  {"code": "ep-IV-03", "champ": "texte", "ancien": "D'abord les couleurs s'en vont — la Grise. Puis les chants se taisent — le Silence. Puis tout se défait, fil après fil — le Détricotage. Et enfin il ne reste que le blanc — l'Effacement.", "nouveau": "D'abord les couleurs s'en vont. Puis les chants se taisent. Puis tout se défait, fil après fil. Et enfin il ne reste que le blanc.", "toutes": false, "motif": "noms des quatre visages au plateau 1, avant leur plateau"},
  {"code": "ep-IV-03", "champ": "texte", "ancien": "Quelque chose le pousse, par-derrière, depuis le sud. Je ne sais pas encore quoi.", "nouveau": "Quelque chose le fait avancer. Je ne sais pas encore quoi.", "toutes": false, "motif": "renversement : la cause située derrière, au sud"},
  {"code": "ep-IV-03", "champ": "texte_accessible", "ancien": "Le Souffle est une force qui avance et efface le monde derrière elle.", "nouveau": "Le Souffle avance sans s'arrêter, et derrière lui le monde pâlit et s'efface.", "toutes": false, "motif": "Souffle agent (« force qui efface »)"},
  {"code": "ep-IV-07", "champ": "texte", "ancien": "la réponse est au bout, le monstre m'attend au pôle, j'y arriverai", "nouveau": "la réponse est au bout, elle m'attend au pôle, j'y arriverai", "toutes": false, "motif": "« monstre »"},
  {"code": "ep-IV-07", "champ": "texte", "ancien": "le seul endroit où le Souffle a déjà tout pris ?", "nouveau": "le seul endroit où tout s'est déjà effacé ?", "toutes": false, "motif": "Souffle agent (« a tout pris »)"},
  {"code": "ep-IV-07", "champ": "texte", "ancien": "Regarde aussi, de temps en temps, derrière toi.)*", "nouveau": "Regarde aussi, de temps en temps, autour de toi.)*", "toutes": false, "motif": "renversement : « se retourner »"},
  {"code": "ep-IV-07", "champ": "texte_accessible", "ancien": "Selene avoue sa peur : elle fuit toujours vers le nord. Mais elle se demande si ce n'est pas une erreur, et s'il ne faudrait pas, un jour, se retourner.", "nouveau": "Sélène avoue sa peur : elle court toujours vers le nord. Et si elle se trompait ? Elle te conseille de regarder aussi autour de toi.", "toutes": false, "motif": "renversement : « se retourner » (tiers secret)"},
  {"code": "ep-I-12", "champ": "texte", "ancien": "Un fil d'ici. Un fil des nôtres.", "nouveau": "Un fil d'ici.", "toutes": false, "motif": "non-dit (« le Souffle, c'est nous ») presque écrit"},
  {"code": "rep-II-04", "champ": "texte", "ancien": "Un monstre que je pourrais montrer du doigt", "nouveau": "Un coupable que je pourrais montrer du doigt", "toutes": false, "motif": "« monstre »"},
  {"code": "rep-II-04", "champ": "texte", "ancien": "J'ai peur qu'il n'y ait rien. Je crois que c'est justement ça que je trouverai : rien. Et que ce rien sera la vraie réponse.)*", "nouveau": "J'ai peur qu'il n'y ait rien.)*", "toutes": false, "motif": "chute sans bataille dite comme une certitude"},
  {"code": "ep-seuil-2", "champ": "texte", "ancien": "des matins où aucun oiseau ne chante. Le Silence. Je croyais", "nouveau": "des matins où aucun oiseau ne chante. Je croyais", "toutes": false, "motif": "visage du plateau 3 nommé au plateau 2"},
  {"code": "ep-seuil-3", "champ": "texte", "ancien": "on entend les autres se tendre. Le Détricotage. Je ne sais pas encore ce que ce mot veut dire.", "nouveau": "on entend les autres se tendre. Je ne sais pas encore ce que ça veut dire.", "toutes": false, "motif": "visage du plateau 4 nommé au plateau 3"},
  {"code": "ep-IV-04", "champ": "texte", "ancien": "Chaque nom tenu retient une page contre le Souffle, et vous laisse une gemme dans la main.", "nouveau": "Chaque nom tenu retient une page contre le Souffle.", "toutes": false, "motif": "économie v3 : nommer ne paie pas"},
  {"code": "ep-IV-04", "champ": "texte", "ancien": "un feuillet lu est un feuillet sauvé ; un feuillet ignoré", "nouveau": "un feuillet lu est un feuillet sauvé, et il vous laisse une gemme dans la main ; un feuillet ignoré", "toutes": false, "motif": "économie v3 : la gemme vient de la page tenue"},
  {"code": "ep-IV-04", "champ": "texte", "ancien": "pour avancer, pour vous soigner, pour vous entraider", "nouveau": "pour avancer, pour vous abriter, pour vous entraider", "toutes": false, "motif": "économie v3 : plus de soin (cœurs)"},
  {"code": "ep-IV-05", "champ": "texte", "ancien": " Elles récoltent les gemmes.", "nouveau": "", "toutes": false, "motif": "économie v3 : les deux peuples ont des gemmes"},
  {"code": "ep-IV-05", "champ": "texte", "ancien": " Ils gardent les cœurs.", "nouveau": "", "toutes": false, "motif": "économie v3 : plus de cœurs"},
  {"code": "ep-IV-05", "champ": "texte", "ancien": "Ne t'attache pas à une seule forme : un bon gardien, au bout du voyage, aura été les deux.", "nouveau": "Ne t'attache pas à une seule forme : au bout du voyage, une bonne gardienne ou un bon gardien aura été les deux.", "toutes": false, "motif": "parité"},
  {"code": "ep-IV-05", "champ": "texte_accessible", "ancien": "tu deviens une Licorne (qui voit et nomme, avec des gemmes) ou un Gnome (qui répare et soigne, avec des cœurs).", "nouveau": "tu deviens une Licorne (qui voit et nomme) ou un Gnome (qui répare et soigne).", "toutes": false, "motif": "économie v3 : plus de cœurs"},
  {"code": "ep-IV-06", "champ": "texte", "ancien": "Deux choses se tiennent dans ta main. Les **gemmes** : ce que voir et comprendre laissent derrière, comme le sucre au fond d'une tasse — tu en gagnes chaque fois que tu sais pour de vrai. Et les **cœurs** : ta vie, ta force, ce que tu dépenses à marcher et ce qu'on te reprend quand tu tombes.", "nouveau": "Une seule chose se tient dans ta main : les **gemmes**. On ne les gagne pas en sachant : savoir sert à marcher, pas à s'enrichir. Une gemme vient quand une page tient grâce à toi, ou quand quelqu'un te la passe.", "toutes": false, "motif": "économie v3 : une monnaie ; le savoir ne paie pas"},
  {"code": "ep-IV-06", "champ": "texte", "ancien": "avancer plus vite, voir la route devant, se soigner, ramener un compagnon tombé.", "nouveau": "avancer plus vite, éclairer un coin caché, abriter les autres, ramener près de soi ceux qui sont restés en arrière.", "toutes": false, "motif": "économie v3 : les sorts du grimoire (Progression, Lanterne, Abri, Relais)"},
  {"code": "ep-IV-06", "champ": "texte", "ancien": "Le savoir a, pour de vrai, un poids qu'on peut dépenser.", "nouveau": "Ce qu'on tient ensemble ici a, pour de vrai, un poids qu'on peut dépenser.", "toutes": false, "motif": "le savoir ne paie pas"},
  {"code": "ep-IV-06", "champ": "texte", "ancien": "soigner l'autre, lui passer une gemme, en léguer à celui qui viendra après vous.", "nouveau": "abriter l'autre, lui passer une gemme, en garder pour qui viendra après vous.", "toutes": false, "motif": "économie v3 ; parité"},
  {"code": "ep-IV-06", "champ": "texte_accessible", "ancien": "Avec les gemmes (gagnées en sachant), tu achètes des pouvoirs.", "nouveau": "Avec les gemmes, gagnées quand une page tient grâce à toi, tu achètes des pouvoirs.", "toutes": false, "motif": "le savoir ne paie pas"},
  {"code": "sort-savane-01", "champ": "texte", "ancien": "Mais je l'ai compris ce jour-là — une gemme n'est pas un caillou magique. C'est du savoir devenu pouvoir, le sucre resté au fond de la tasse une fois qu'on a vraiment appris.", "nouveau": "Mais je l'ai compris ce jour-là : le vrai pouvoir de la matriarche ne s'achète pas. C'est une mémoire, faite de chemins parcourus et transmis.", "toutes": false, "motif": "« savoir devenu pouvoir » (effet Matthieu)"},
  {"code": "ep-V-05", "champ": "texte", "ancien": "Elle n'avait plus de cœurs — elle tenait à peine debout.", "nouveau": "Elle n'avait plus de forces — elle tenait à peine debout.", "toutes": false, "motif": "plus de cœurs"},
  {"code": "ep-VIII-08", "champ": "texte", "ancien": "qui n'avait plus de cœurs ni d'espoir", "nouveau": "qui n'avait plus de forces ni d'espoir", "toutes": false, "motif": "plus de cœurs"},
  {"code": "ep-VIII-08", "champ": "texte_accessible", "ancien": "qui n'avait plus de cœurs ni d'espoir", "nouveau": "qui n'avait plus de forces ni d'espoir", "toutes": false, "motif": "plus de cœurs"},
  {"code": "ep-VI-04", "champ": "texte", "ancien": "Lui : Krâ. *(ton vexé)*", "nouveau": "Lui : *(un cri, vexé)*", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "ep-VI-04", "champ": "texte", "ancien": "Lui : Krâ.", "nouveau": "Lui : *(un cri)*", "toutes": true, "motif": "cri écrit avant juin"},
  {"code": "ep-VI-04", "champ": "texte", "ancien": "Je précise, pour le lecteur sérieux : il n'a dit que « krâ ».", "nouveau": "Je précise, pour qui me lit sérieusement : il n'a fait que crier.", "toutes": false, "motif": "cri écrit avant juin ; parité"},
  {"code": "ep-VI-02", "champ": "texte", "ancien": "avec un petit « krâ » pincé.", "nouveau": "avec un petit cri pincé.", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "ep-VI-07", "champ": "texte", "ancien": "sauf « krâ », et toujours au mauvais moment.", "nouveau": "sauf un cri, toujours le même, et toujours au mauvais moment.", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "ep-VIII-03", "champ": "texte", "ancien": "Cri : « krâ », décliné", "nouveau": "Cri : un seul, décliné", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "ep-quot-1", "champ": "texte", "ancien": "le premier « krâ » de l'oiseau", "nouveau": "le premier cri de l'oiseau", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "sc-taiga-corbeau", "champ": "texte", "ancien": "un « krâ » insolent en pleine figure", "nouveau": "un cri insolent en pleine figure", "toutes": false, "motif": "cri écrit avant juin"},
  {"code": "ep-I-08", "champ": "texte", "ancien": "Quand je passe trop vite, le Souffle la prend dans la nuit, et au matin la ligne a pâli.", "nouveau": "Quand je passe trop vite, la page pâlit dans la nuit, et au matin la ligne n'est plus qu'une ombre.", "toutes": false, "motif": "Souffle agent (« prend »)"},
  {"code": "ep-III-01", "champ": "texte", "ancien": "le Souffle ne prend pas que les bêtes. Il prend aussi celui qui se souvient d'elles.", "nouveau": "ce ne sont pas que les bêtes qui s'effacent. Ceux qui se souviennent d'elles s'effacent un peu, eux aussi.", "toutes": false, "motif": "Souffle agent (« prend ») ; parité"},
  {"code": "ep-III-03", "champ": "texte", "ancien": "Le Souffle est passé, et il a tout pris, jusqu'au souvenir que c'était écrit.", "nouveau": "Le Souffle est passé, et tout s'est effacé, jusqu'au souvenir que c'était écrit.", "toutes": false, "motif": "Souffle agent (« a tout pris »)"},
  {"code": "ep-III-03", "champ": "texte", "ancien": "Ce rectangle blanc est le seul portrait qui reste de l'Effacement : la trace de son passage, la forme exacte de ce qu'il sait faire.", "nouveau": "Ce rectangle blanc est la seule image qui reste de l'Effacement : la forme exacte de ce qui s'en va.", "toutes": false, "motif": "visage personnifié (« portrait », « ce qu'il sait faire »)"},
  {"code": "ep-III-03", "champ": "texte_accessible", "ancien": "il y avait des mots, et le Souffle les a pris.", "nouveau": "il y avait des mots, et ils se sont effacés.", "toutes": false, "motif": "Souffle agent"},
  {"code": "ep-III-05", "champ": "texte", "ancien": "Voilà la ruse la plus douce et la plus terrible du Souffle. Il n'a pas besoin d'effacer nos souvenirs un à un. Il lui suffit d'attendre une génération.", "nouveau": "Voilà la façon la plus douce et la plus terrible dont le monde s'efface. Pas besoin d'effacer nos souvenirs un à un : il suffit d'une génération.", "toutes": false, "motif": "« ruse » du Souffle, comme ep-I-07"},
  {"code": "rep-II-03", "champ": "texte", "ancien": "Le Souffle l'avait prise dans la nuit, et moi avec, cette part de moi qui se souvenait.", "nouveau": "Elle s'était effacée dans la nuit, et avec elle cette part de moi qui se souvenait.", "toutes": false, "motif": "Souffle agent"},
  {"code": "GL2P-02", "champ": "texte", "ancien": "Le Souffle n'aime pas les chiffres, il rôde autour des pages muettes.", "nouveau": "Les pages muettes sont celles qui pâlissent le plus vite.", "toutes": false, "motif": "« rôde » (mot interdit)"},
  {"code": "ren-caduc-01", "champ": "texte", "ancien": "Le Souffle défait ; le geai, lui, sème en oubliant.", "nouveau": "Là où tout se défait, le geai, lui, sème en oubliant.", "toutes": false, "motif": "Souffle agent"},
  {"code": "ren-jungle-02", "champ": "texte", "ancien": "Le Souffle peut en effacer avant même qu'on les ait rencontrées", "nouveau": "Certaines peuvent s'effacer avant même qu'on les ait rencontrées", "toutes": false, "motif": "Souffle agent"},
  {"code": "ren-landes-01", "champ": "texte", "ancien": "Le Silence aime les milieux qu'on croit vides,", "nouveau": "Le Silence gagne d'abord les milieux qu'on croit vides,", "toutes": false, "motif": "visage personnifié (« aime »)"},
  {"code": "ren-sahara-02", "champ": "texte", "ancien": "C'est l'inverse de ce que fait la Grise : là où le Souffle retire la couleur,", "nouveau": "C'est l'inverse de la Grise : là où la couleur se retire,", "toutes": false, "motif": "Souffle agent"},
  {"code": "sc-landes-nuit", "champ": "texte", "ancien": "Le Silence voudrait que ces endroits soient vides et muets. La lande lui répond,", "nouveau": "On croit ces endroits vides et muets, et c'est là que le Silence gagne d'abord. La lande répond,", "toutes": false, "motif": "visage personnifié (« voudrait »)"},
  {"code": "sc-landes-course", "champ": "texte_accessible", "ancien": "Le Silence avançait sur la lande comme une marée.", "nouveau": "Le silence gagnait la lande comme une marée.", "toutes": false, "motif": "aligné sur le texte corrigé par C1"},
  {"code": "sort-caduc-01", "champ": "texte", "ancien": "le Silence fait son œuvre, les chants se raréfient", "nouveau": "le Silence gagne, les chants se raréfient", "toutes": false, "motif": "visage personnifié"},
  {"code": "sort-caduc-01", "champ": "texte", "ancien": "Le Souffle isole. La mycorhize relie. Tout le combat tient peut-être là-dedans.", "nouveau": "Ce qui pâlit s'isole. La mycorhize relie. Tout tient peut-être là-dedans.", "toutes": false, "motif": "Souffle agent ; vocabulaire de combat"},
  {"code": "sort-medit-01", "champ": "texte", "ancien": "La Grise voudrait nous faire croire que ce qui a pâli est mort.", "nouveau": "Sous la Grise, on croit que ce qui a pâli est mort.", "toutes": false, "motif": "visage personnifié"},
  {"code": "sort-toundra-01", "champ": "texte", "ancien": "L'Effacement parie sur notre impatience. À nous de lui répondre", "nouveau": "L'Effacement gagne là où l'on s'impatiente. À nous de répondre", "toutes": false, "motif": "visage personnifié"},
  {"code": "ep-VIII-11", "champ": "texte", "ancien": "c'est que tu es allé loin, toi aussi.", "nouveau": "c'est que tu as marché loin, toi aussi.", "toutes": false, "motif": "parité (« allé »)"},
  {"code": "ep-finale", "champ": "texte", "ancien": "tu es le seul, maintenant, à pouvoir encore le porter.", "nouveau": "il n'y a plus que toi, maintenant, pour le porter encore.", "toutes": false, "motif": "parité (« le seul »)"},
  {"code": "page-landes", "champ": "texte", "ancien": "le vent m'a saisi.", "nouveau": "le vent m'a saisie.", "toutes": false, "motif": "accord (Sélène parle)"},
  {"code": "ep-VII-12", "champ": "texte", "ancien": "\"oiseau bleu\"", "nouveau": "“oiseau bleu”", "toutes": false, "motif": "guillemets droits dans une citation"},
  {"code": "ep-VII-12", "champ": "texte", "ancien": "\"poule noire\"", "nouveau": "“poule noire”", "toutes": false, "motif": "guillemets droits dans une citation"}
 ],
 "accent": {"de": "Selene", "vers": "Sélène", "feuillets": "titre, incipit, texte, texte_accessible des pages actives des types feuillet, scene, reponse, vierge, message (GL2P-04 réécrite par C1)", "questions_lore": "question, choix_a à choix_e, feedback_correct, feedback_a à feedback_e des questions actives de gl_qcm_lore_questions (sensible à la casse : « SELENE » ne bouge pas)"},
 "incipits": {
  "ep-echo-02": "Cette nuit, un fil que je croyais rompu s'est retendu.",
  "ep-echo-04": "Mes gemmes ont brillé toutes seules, ce soir, au fond du sac.",
  "ep-echo-05": "Il faut que je l'écrive très vite, avant de me convaincre que j'ai rêvé.",
  "ep-I-01": "On m'avait dit : tu verras le monde comme il doit être. Joli mensonge.",
  "ep-I-02": "Un corbeau me suit depuis le fleuve. Trois jours.",
  "ep-I-03": "On voudrait un coupable. Une bête à terrasser, une faute à montrer du doigt.",
  "ep-I-04": "La lumière dans la mer n'avait pas le choix. Moi, si.",
  "ep-I-05": "La Grise est arrivée sans bruit. Ce n'est pas encore la mort — c'est avant.",
  "ep-I-06": "Un homme, au bord d'une piste, m'a parlé de la Nature avec une majuscule et les yeux mouillés.",
  "ep-I-07": "Je me suis réveillée et il manquait quelque chose.",
  "ep-I-08": "Chose étrange, vérifiée trois fois parce que je n'y croyais pas.",
  "ep-I-09": "J'ai trouvé pire que le poison qui tue. Il y a d'abord les fils morts : ces choses que la Trame ne sait…",
  "ep-I-10": "Je ne suis pas un bon Gnome. Mes mains sont gauches, je replante de travers, la moitié de mes boutures meurent.",
  "ep-I-11": "Le Détricotage, maintenant. Un fil cède et cent autres suivent.",
  "ep-I-12": "Tentation, certains soirs : me croire étrangère à tout cela. Voyageuse, témoin, au-dehors.",
  "ep-I-14": "Deux voix me suivent, aussi mauvaises l'une que l'autre.",
  "ep-I-15": "Le dernier des quatre visages, enfin : l'Effacement.",
  "ep-I-16": "Je croyais qu'il fallait finir le carnet.",
  "ep-I-17": "On fera de moi une légende, je le sens déjà. La voyageuse. La disparue.",
  "ep-I-colonne": "Réveil en sursaut. Le sol bougeait. Pas un tremblement : le sol coulait, noir, luisant, vers moi.",
  "ep-I-oued-1": "Midi. Le seul coin d'ombre à des lieues, c'était le fond d'un oued — un lit de rivière à sec, parois fraîches.",
  "ep-I-oued-2": "On a couru vers la seule sortie : une pente raide, friable, trois fois ma taille.",
  "ep-I-sem": "Un gamin, ce matin, au bord de la piste. Pieds nus, vif.",
  "ep-III-01": "J'ai compris une chose que je n'ose pas relire : ce ne sont pas que les bêtes qui s'effacent.",
  "ep-III-03": "Tu vas en trouver, des feuillets vides. Ne crois pas qu'ils sont neufs, ni que je les ai oubliés en chemin.",
  "ep-III-05": "J'ai croisé un vieil homme, au sud, qui parlait d'un ciel noir d'oiseaux, de soirs où le bourdonnement…",
  "ep-III-06": "Étrange. À mesure que j'approche du pôle — de l'endroit où je crois trouver la fin de tout ceci — mes feuillets pâlissent…",
  "ep-IV-01": "Je n'ai pas traversé en grande pompe. Je regardais un scarabée grimper le long d'une tige — bêtement…",
  "ep-IV-02": "Ce n'est pas un autre monde. J'ai mis du temps à l'admettre, et ça m'a fait du bien : c'est le mien, vu autrement.",
  "ep-IV-03": "Il y a une chose qui avance, et elle ne s'arrête jamais. On l'appelle le Souffle.",
  "ep-IV-04": "Je fais simple, pour une fois. Voici où aller, et comment.",
  "ep-IV-05": "Tu ne traverses pas le miroir pour regarder le spectacle.",
  "ep-IV-06": "Ne crois pas aux baguettes. Ici, la seule magie, c'est ce que ton attention et ton savoir te permettent de faire.",
  "ep-IV-07": "Je vais te confier ma peur, pour que tu ne la prennes pas pour du courage.",
  "ep-IV-08": "Voilà. Tu sais où aller — au nord. Comment — regarder, nommer, sauver, partager.",
  "ep-seuil-2": "Je quitte le pays de la Grise avec une drôle de victoire dans le sac : un coin de garrigue ravivé, trois couleurs tenues.",
  "ep-seuil-3": "On part à trois, maintenant. Le petit a rapiécé ses semelles ; le corbeau a inspecté nos sacs et prélevé…",
  "ep-seuil-4": "Dernier feu avant la glace. Mes pages s'effacent plus vite, maintenant ; je les recopie le soir, à la…",
  "ep-V-01": "Le corbeau est arrivé le troisième jour. Je n'avais rien demandé.",
  "ep-V-02": "Aujourd'hui, deux choses. Une belle, une bête. La belle : à midi, un arbre entier s'est envolé.",
  "ep-V-03": "Cette nuit-là, quelque chose d'énorme est passé près de moi dans le noir.",
  "ep-V-04": "Le sable, c'est l'enfer des choses qui brillent : il n'y en a aucune, et le corbeau en est devenu invivable.",
  "ep-V-05": "J'ai croisé une voyageuse, plus bas. Elle n'avait plus de forces — elle tenait à peine debout.",
  "ep-V-06": "J'ai rencontré un petit. Tout neuf, à peine passé le miroir, qui s'émerveillait de tout et trébuchait sur tout.",
  "ep-V-07": "La rivière avait gonflé. Le petit voulait traverser quand même ; je lui ai dit non — et puis il a…",
  "ep-V-08": "J'ai recompté mes gemmes, par habitude. Puis j'ai fait une chose stupide : j'en ai donné une au corbeau.",
  "ep-V-09": "Le froid change tout. On ne pense plus, on tient.",
  "ep-V-10": "Un soir, il n'est pas revenu. J'ai attendu. J'ai fait semblant de ne pas attendre, ce qui est pire.",
  "ep-V-11": "Ici, la nuit, le ciel s'allume. Des rideaux verts, roses par endroits, qui bougent sans un bruit, comme…",
  "ep-VI-01": "— Un bouton. Le premier. Geste fondateur.",
  "ep-VI-02": "1. Lui demander gentiment. Résultat : il parle plus fort.",
  "ep-VI-03": "Le corbeau a repéré, dans un arbre creux, quelque chose qui brillait — du miel, en fait, mais lui ne…",
  "ep-VI-04": "Moi : Tu crois qu'on y arrivera, au bout ?",
  "ep-VI-06": "Un matin, dans la brume, une forme énorme et pâle s'est avancée.",
  "ep-VI-07": "Il ronfle. Il vole mes affaires et me les revend. Il commente mes décisions et n'en prend aucune.",
  "ep-VI-08": "Le vent me l'a arraché des mains, au bord d'une falaise.",
  "ep-VI-09": "Rien aujourd'hui. On a marché, on s'est arrêtés, j'ai fait du feu.",
  "ep-VI-10": "Note pour plus tard : un corbeau, ça ne se dresse pas.",
  "ep-VII-01": "Le petit nous a rattrapés et a demandé, tout droit, s'il pouvait faire la route avec nous.",
  "ep-VII-02": "Catastrophe annoncée : le corbeau a appris au petit à voler des choses brillantes.",
  "ep-VII-03": "On longeait une rivière que le gel n'avait pas encore prise.",
  "ep-VII-04": "On a trouvé un homme assis. Pas tombé, pas blessé : assis, exprès, depuis longtemps, dans un coin encore…",
  "ep-VII-05": "J'ai vu le petit hésiter. Il était fatigué — on l'était tous.",
  "ep-VII-06": "Au matin, j'ai dit au petit, sans regarder l'homme assis, pour ne pas l'humilier : « Il a raison sur tout. »",
  "ep-VII-07": "Un lac qu'on croyait solide. Un craquement.",
  "ep-VII-08": "Le petit allait mieux. Il a réclamé à manger, ce qui est bon signe chez les vivants.",
  "ep-VII-09": "Ça devait arriver. Le petit a sa route, pas la mienne.",
  "ep-VII-10": "C'est bête, le silence d'après. La place vide à côté du feu.",
  "ep-VII-12": "Le petit pose des questions idiotes. C'est lui qui les appelle comme ça ; moi, je n'ai pas encore trouvé…",
  "ep-VII-feu": "L'odeur d'abord. Du bois brûlé, porté par le vent, alors qu'on ne voyait pas de feu.",
  "ep-VII-rechute": "Mauvaise nuit. Froid de pierre, plus rien à manger, et la pensée sale qui revient : tout ça pour quoi ?",
  "ep-VII-tourb-1": "La lande était plate, brune, élastique sous le pas comme une peau. Le petit a voulu courir devant.",
  "ep-VII-tourb-2": "J'ai failli sauter pour l'attraper. La pire idée : à deux, on s'enfonce deux fois plus.",
  "ep-VIII-01": "Je ne m'y attendais pas. Ce matin, le petit a sorti de son sac une boîte — une vraie, qu'il a fabriquée…",
  "ep-VIII-03": "Espèce observée : le corbeau de route. (Corvus insupportabilis, si je puis me permettre.)",
  "ep-VIII-04": "Un matin, le ciel et le sol sont devenus la même chose : du blanc qui vole, du blanc qui pique, plus de haut ni de bas.",
  "ep-VIII-05": "La route nous a ramenés près de l'endroit où nous avions laissé l'homme assis.",
  "ep-VIII-06": "Ici, le temps est détraqué. On est arrivés quand le soleil ne se couchait pas : il tournait en rond…",
  "ep-VIII-08": "J'ai croisé une jeune, perdue, qui n'avait plus de forces ni d'espoir.",
  "ep-VIII-09": "J'ai choisi son nom. Je sais lequel, depuis quelques nuits.",
  "ep-VIII-10": "Les pages se font courtes ; le froid commande. Bientôt, je n'écrirai plus que trois mots à la fois.",
  "ep-VIII-11": "Si tu lis ceci, c'est que tu as marché loin, toi aussi. Bravo. Garde le carnet.",
  "GL2P-02": "Dans ce pays-là, le seuil m'avait faite gnome.",
  "GL2P-03": "Au pays suivant, le seuil m'a faite licorne.",
  "message-boite": "Si vous lisez ces mots, c'est qu'on vous a confié la boîte.",
  "page-caduc": "Plus au nord, le monde a ralenti. Ici, quatre saisons se succèdent franchement (le climat tempéré), et…",
  "page-jungle": "Quand je suis entrée sous les arbres, le jour s'est éteint.",
  "page-landes": "Quand les arbres se sont écartés, le vent m'a saisie.",
  "page-medit": "En descendant des montagnes, j'ai retrouvé les arbres — mais des arbres endurcis par le soleil.",
  "page-sahara": "Après la forêt, j'ai connu la soif. Le Sahara ne pardonne rien : il y tombe parfois moins d'eau en une…",
  "page-savane": "J'ai marché des jours dans cette herbe couleur d'or.",
  "page-taiga": "Le froid, désormais, commandait tout. J'étais entrée dans la plus vaste forêt du monde — une ceinture…",
  "page-toundra-ete": "Au bout du monde, les arbres ont enfin disparu.",
  "page-toundra-hiver": "Puis le soleil s'est couché, et n'est plus revenu.",
  "ren-caduc-01": "Le geai des chênes ne tient pas en place : criard, affairé, il transporte les glands un par un et les…",
  "ren-caduc-02": "Au sol, en mars, c'est une course. Les anémones blanches, puis les jacinthes bleues, se dépêchent de…",
  "ren-jungle-01": "Je l'ai entendu bien avant de lever les yeux : un bruit d'ailes comme une locomotive lointaine, à plus d'un kilomètre.",
  "ren-jungle-02": "Il a des pattes de zèbre et un corps de cheval sombre, une langue assez longue pour se laver les yeux.",
  "ren-landes-01": "De loin, la lande a l'air pauvre : pas un arbre, juste un tapis ras qui ondule au vent.",
  "ren-landes-02": "Le sol de la tourbière est si pauvre que rien n'y trouve à manger.",
  "ren-medit-01": "Celui-là, je ne l'ai pas trouvé loin : c'est presque chez nous.",
  "ren-medit-02": "Le vieux cèdre veillait depuis si longtemps qu'on aurait dit qu'il écoutait.",
  "ren-sahara-01": "Le fennec sort la nuit, deux oreilles énormes posées sur un corps minuscule.",
  "ren-sahara-02": "On la prend pour un fagot d'épines mortes, une boule grise roulée par le vent.",
  "ren-savane-01": "La girafe mange un arbre qui se défend. L'acacia parasol porte des épines de sept centimètres ; elle…",
  "ren-savane-02": "Pendant que le clan fouille le sable à la recherche d'insectes, l'un d'eux ne mange pas.",
  "ren-taiga-01": "Le lièvre d'Amérique — on l'appelle aussi lièvre à raquettes — change de manteau pour l'hiver : il…",
  "ren-taiga-02": "Là où il y avait un ruisseau, le castor a fait un étang.",
  "ren-toundra-01": "L'été polaire est si court que tout se précipite.",
  "ren-toundra-02": "Le harfang des neiges veille sur la toundra comme un guetteur blanc aux yeux jaunes.",
  "ren-toundra-03": "Dans la nuit polaire, par moins quarante, les bœufs musqués tiennent grâce à leur toison — la plus…",
  "rep-II-01": "Pas celle qu'on dira. On fera de moi une première, une fondatrice, celle par qui tout commence.",
  "rep-II-02": "Sélène. La lune. Je ne l'ai pas choisi, mais il me va, et je crois savoir pourquoi.",
  "rep-II-03": "Au début, pour voir. Rien de plus noble : la curiosité, l'envie de poser un nom sur chaque chose…",
  "rep-II-04": "Voici ce qui me fait sourire, certains soirs. Tout, dans ce monde, bouge.",
  "rep-II-06": "On me demandera si tout cela est vrai, ou si je l'ai rêvé.",
  "rep-II-08": "Je laisse cette boîte, et je sais déjà à qui elle s'ouvrira.",
  "sc-landes-course": "La lande est nue : pas un arbre pour se cacher, rien que la bruyère rase jusqu'à l'horizon.",
  "sc-landes-nuit": "Le soir tombait sur la lande, et quelque chose s'est mis à ronfler dans le noir.",
  "sc-taiga-corbeau": "Quatrième pays, le froid pour de bon. Ce soir-là, un glouton est venu rôder autour de notre réserve.",
  "sort-caduc-01": "En surface, la forêt se tait — le Silence gagne, les chants se raréfient.",
  "sort-jungle-01": "Au sol, sous la canopée, il fait presque nuit en plein jour.",
  "sort-landes-01": "La sphaigne n'a l'air de rien : une mousse spongieuse, verte, rousse ou dorée, qui fait la tourbière.",
  "sort-medit-01": "Le feu était passé. La garrigue n'était plus qu'un champ de cendres, et j'ai cru, comme tout le monde, que c'était fini.",
  "sort-sahara-01": "J'ai compris d'où venaient les Licornes le jour où j'ai vu passer un oryx algazelle.",
  "sort-savane-01": "L'année était sèche à pierre fendre. Les jeunes éléphants tournaient en rond.",
  "sort-taiga-01": "À l'automne, les saumons remontent la rivière jusqu'à leur lieu de naissance.",
  "sort-toundra-01": "Ce tapis pâle qui couvre la toundra, ce n'est ni de la mousse ni de l'herbe : c'est le lichen des…"
 },
 "feuillets_inactifs": [
  {"code": "ep-I-13", "motif": "renversement spatial écrit (grondement « du sud, de là d'où je viens », « chez moi ») et tiers secret (cendre, tiédeur)"},
  {"code": "rep-II-05", "motif": "renversement spatial écrit (« Il vient de derrière. Du sud. De chez moi. »)"}
 ],
 "questions_lore": {
  "reecrire": {
   "LQCM0309": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Je n'irai pas plus loin que cette page. Pas parce que je m'arrête — parce que les mots, eux, s'arrêtent. » ?",
   "LQCM0310": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Aujourd'hui, rien d'utile. Je le note quand même — non : je le note justement parce que c'est inutile. » ?",
   "LQCM0311": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Je me suis surprise à noter une chose inutile : l'odeur de poussière mouillée, juste avant la pluie chaude. » ?",
   "LQCM0313": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le corbeau est arrivé le troisième jour. Je n'avais rien demandé. » ?",
   "LQCM0314": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Aujourd'hui, deux choses. Une belle, une bête. La belle : à midi, un arbre entier s'est envolé. » ?",
   "LQCM0315": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Cette nuit-là, quelque chose d'énorme est passé près de moi dans le noir. » ?",
   "LQCM0316": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le sable, c'est l'enfer des choses qui brillent : il n'y en a aucune, et le corbeau en est devenu invivable. » ?",
   "LQCM0317": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai croisé une voyageuse, plus bas. Elle n'avait plus de forces — elle tenait à peine debout. » ?",
   "LQCM0318": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai rencontré un petit. Tout neuf, à peine passé le miroir, qui s'émerveillait de tout et trébuchait sur tout. » ?",
   "LQCM0319": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « La rivière avait gonflé. Le petit voulait traverser quand même ; je lui ai dit non — et puis il a… » ?",
   "LQCM0320": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai recompté mes gemmes, par habitude. Puis j'ai fait une chose stupide : j'en ai donné une au corbeau. » ?",
   "LQCM0321": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le froid change tout. On ne pense plus, on tient. » ?",
   "LQCM0322": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Un soir, il n'est pas revenu. J'ai attendu. J'ai fait semblant de ne pas attendre, ce qui est pire. » ?",
   "LQCM0323": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Ici, la nuit, le ciel s'allume. Des rideaux verts, roses par endroits, qui bougent sans un bruit, comme… » ?",
   "LQCM0325": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « — Un bouton. Le premier. Geste fondateur. » ?",
   "LQCM0326": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « 1. Lui demander gentiment. Résultat : il parle plus fort. » ?",
   "LQCM0327": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le corbeau a repéré, dans un arbre creux, quelque chose qui brillait — du miel, en fait, mais lui ne… » ?",
   "LQCM0328": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Moi : Tu crois qu'on y arrivera, au bout ? » ?",
   "LQCM0330": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Un matin, dans la brume, une forme énorme et pâle s'est avancée. » ?",
   "LQCM0331": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Il ronfle. Il vole mes affaires et me les revend. Il commente mes décisions et n'en prend aucune. » ?",
   "LQCM0332": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le vent me l'a arraché des mains, au bord d'une falaise. » ?",
   "LQCM0333": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Rien aujourd'hui. On a marché, on s'est arrêtés, j'ai fait du feu. » ?",
   "LQCM0334": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Note pour plus tard : un corbeau, ça ne se dresse pas. » ?",
   "LQCM0336": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le petit nous a rattrapés et a demandé, tout droit, s'il pouvait faire la route avec nous. » ?",
   "LQCM0337": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Catastrophe annoncée : le corbeau a appris au petit à voler des choses brillantes. » ?",
   "LQCM0338": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « On longeait une rivière que le gel n'avait pas encore prise. » ?",
   "LQCM0339": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « On a trouvé un homme assis. Pas tombé, pas blessé : assis, exprès, depuis longtemps, dans un coin encore… » ?",
   "LQCM0340": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai vu le petit hésiter. Il était fatigué — on l'était tous. » ?",
   "LQCM0341": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Au matin, j'ai dit au petit, sans regarder l'homme assis, pour ne pas l'humilier : « Il a raison sur tout. » » ?",
   "LQCM0342": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Un lac qu'on croyait solide. Un craquement. » ?",
   "LQCM0343": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Le petit allait mieux. Il a réclamé à manger, ce qui est bon signe chez les vivants. » ?",
   "LQCM0344": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Ça devait arriver. Le petit a sa route, pas la mienne. » ?",
   "LQCM0345": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « C'est bête, le silence d'après. La place vide à côté du feu. » ?",
   "LQCM0347": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Je ne m'y attendais pas. Ce matin, le petit a sorti de son sac une boîte — une vraie, qu'il a fabriquée… » ?",
   "LQCM0349": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Espèce observée : le corbeau de route. (Corvus insupportabilis, si je puis me permettre.) » ?",
   "LQCM0350": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Un matin, le ciel et le sol sont devenus la même chose : du blanc qui vole, du blanc qui pique, plus de haut ni de bas. » ?",
   "LQCM0351": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « La route nous a ramenés près de l'endroit où nous avions laissé l'homme assis. » ?",
   "LQCM0352": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Ici, le temps est détraqué. On est arrivés quand le soleil ne se couchait pas : il tournait en rond… » ?",
   "LQCM0354": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai croisé une jeune, perdue, qui n'avait plus de forces ni d'espoir. » ?",
   "LQCM0355": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « J'ai choisi son nom. Je sais lequel, depuis quelques nuits. » ?",
   "LQCM0356": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Les pages se font courtes ; le froid commande. Bientôt, je n'écrirai plus que trois mots à la fois. » ?",
   "LQCM0357": "Quel feuillet du carnet de Sélène s'ouvre ainsi : « Si tu lis ceci, c'est que tu as marché loin, toi aussi. Bravo. Garde le carnet. » ?"
  },
  "inactiver": [
   {"motif": "cite une ancienne page du copiste, archivée par le lot C (étape C1)", "codes": ["LQCM0286", "LQCM0287", "LQCM0288", "LQCM0289", "LQCM0290", "LQCM0291", "LQCM0292", "LQCM0293", "LQCM0294", "LQCM0295", "LQCM0296", "LQCM0297", "LQCM0298", "LQCM0299", "LQCM0300", "LQCM0301", "LQCM0302", "LQCM0303", "LQCM0304", "LQCM0305", "LQCM0306", "LQCM0307", "LQCM0308"]},
   {"motif": "idée-clé de rep-II-05 (« il faut revenir chez soi, là où il commence ») : renversement ; la page devient inactive", "codes": ["LQCM0239"]},
   {"motif": "ancien jeu (cœurs, cases asymétriques, gemmes gagnées par les bonnes réponses, anciens sorts) : contredit les règles v3 et les fiches LR0023 et LR0024 réécrites le 24/11", "codes": ["LQCM0011", "LQCM0012", "LQCM0015", "LQCM0063", "LQCM0064", "LQCM0065", "LQCM0066", "LQCM0105", "LQCM0106", "LQCM0107", "LQCM0117", "LQCM0118", "LQCM0120", "LQCM0122", "LQCM0125", "LQCM0126", "LQCM0127", "LQCM0130", "LQCM0131", "LQCM0132", "LQCM0133", "LQCM0135", "LQCM0136", "LQCM0138", "LQCM0139"]}
  ]
 }
}
```
