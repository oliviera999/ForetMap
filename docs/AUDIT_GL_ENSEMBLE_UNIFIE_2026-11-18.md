# Vérification des cinq PR de l'ensemble unifié G&L — 18 novembre 2026

Instantané daté : relecture après fusion des PR **#662** (1a), **#664** (1b), **#667** (PR 2),
**#670** (PR 3) et **#672** (PR 4), et de leurs suites #663, #665 et #669, sur `main` en
v1.249.0 (`b83a1eb`). Prompt d'origine : `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`.

Ce document dit trois choses : ce qui a été vérifié, ce qui a été corrigé dans le lot du même
jour, et **ce qui reste à relire ou à trancher par Oliv** (§ 4 et § 5, avec cases à cocher).

## 1. Ce qui a été vérifié

| Vérification, sur `main`                                                     | Résultat                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Lint, format, build, `check:runtime`                                         | passent (aucun miroir modifié, schéma 373)     |
| Tests UI                                                                     | 6 009 passés                                   |
| Tests backend                                                                | 6 316 passés, 0 échec, 2 ignorés               |
| Tests de contenu                                                             | 147 passés ; sur le corpus du banc : 44 passés |
| e2e G&L (`e2e/gl-*.spec.js`)                                                 | 61 passés, 2 ignorés                           |
| Banc : `hybride-reference`, `tablette-parallele-absences`, `ensemble-unifie` | terminés sans échec                            |
| Banc : `une-monnaie`, `multi-appareils`, `escalier`, `regression-7nov`       | terminés sans échec                            |
| Import strict des catalogues, `check-tenir-data.py`                          | passent                                        |

Relecture du code : sept relectures indépendantes (deux sur le moteur de la 1a, une par autre
PR, une contre les garde-fous), chacune contre le prompt et contre le code de `main`. **Aucun
défaut bloquant en classe, aucune faille de sécurité.**

Sur la façon de fusionner : les PR sont fusionnées quelques secondes après le passage en « Ready
for review », donc avant que la CI ait tourné. Celle de #664 a fini rouge après fusion (réparée
par #665). Celle de #672 a un job `quality` rouge pour un test d'écran sans rapport avec G&L
(`tests-ui/settings/MoodleAdminPanel.test.jsx`, 5 050 ms pour un délai de 5 000 ms), qui passe en
local.

## 2. Corrigé dans le lot du 18 novembre

| PR   | Défaut                                                                                                                    | Correction                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1a   | Sur tablette, Sentier ne protégeait plus de la case Souffle : la case présentée après le jet posait « un seul dé »        | un arrêt déjà joué par le moteur du tour n'est plus rejoué (`arriveeDejaAppliquee`)     |
| 1a   | « Un seul dé » pouvait durer plus d'un tour (tour de pose réécrit ; équipe qui ne lance pas)                              | le tour de pose ne se réécrit plus ; l'état s'efface à l'ouverture du tour N + 2        |
| 1a   | Projection et console disaient « au prochain tour » le tour même où le dé unique était dû                                 | « ce tour-ci », comme l'écran d'équipe                                                  |
| 1a   | Spirale réglée à 1 : 100 % au lieu de 1 %                                                                                 | 1 vaut 1 %                                                                              |
| 1b   | La piste « La réponse se trouve dans la fiche … » servie après une question de secours, à laquelle la fiche ne répond pas | `piste` seulement pour la question fixe de la zone                                      |
| PR 2 | « Revenir aux réglages du profil » coupait l'escalier : voile, Marché et sorts ouverts d'un coup                          | le bouton n'efface que les autres surcharges                                            |
| PR 2 | « Ouvrir la suite » envoyé deux fois montait deux marches ; `PUT …/tenir/profil` pouvait réécrire un ancien pas           | la demande porte la séance affichée (`{ pas }`) ; les surcharges s'écrivent sous verrou |
| PR 3 | Le prof qui finissait un geste à la place d'une équipe laissait ses autres appareils grisés jusqu'à 60 s                  | la main prise pour ce geste se rend (`gardeDEquipe`, option `finit`)                    |
| PR 4 | Un sort refusé puis remboursé pouvait faire dépasser le plafond de 8 gemmes (défaut antérieur à la PR)                    | le plafond s'applique au remboursement, le surplus va à la réserve                      |

Chaque correction a son test, qui échoue sans elle.

## 3. Relevé, non corrigé (mineur)

- 1a — une équipe arrivée au camp par Relais, par Progression ou par déplacement manuel garde
  son « un seul dé » pour le tour où il est dû (`lib/glTour.js`, effacement au camp dans
  `applyArrivalTx` seulement).
- 1a — réglage `cases_positives: brut` (non par défaut) : l'écran annonce « l'équipe passe son
  tour », le moteur ne l'applique plus.
- 1a — Cordée à effet différé : rien ne la rend si l'une des deux équipes est au camp au tour
  d'effet.
- 1a — banc : « 0 % de couples sans fouille possible » est vrai par construction (le compteur
  lit le quota, toujours ≥ 1) ; « ressources créées » compte aussi les remboursements.
- 1a — deux réussites simultanées à un défi de la Trame peuvent consommer deux pistes pour la
  même zone.
- 1b — sur tablette d'équipe, la piste s'affiche sans bouton pour l'ouvrir (annoncé dans le
  code : « le texte de la piste suffit »).
- 1b — l'écran des sorts peut montrer Mentorat et Lettre lançables alors qu'ils seront refusés
  (avant tout débit).
- 1b — `tests/content/gl-ensemble-unifie-zones.test.js` : sans corpus réel, trois tests passent
  par `return` sans `t.skip`.
- PR 3 — le signal `gl:game:equipe` recharge l'état sur tous les écrans de la partie, pas
  seulement ceux de l'équipe ; la version retenue par l'écran peut reculer (un `ETAT_PERIME` à
  tort, sans perte) ; le plafond d'API « par appareil » ouvre un seau par jeton, même jamais
  accepté.
- PR 4 — `classeJoueTenir` préfère une vieille partie classique `live` à une partie « Tenir » en
  préparation ; la bourse de départ est posée hors de la transaction de création.

## 4. Décisions à trancher

- [ ] **Page tenue et Retrait (1a).** Un élève en Retrait reçoit quand même la gemme de la page
      tenue par son équipe (`lib/glChasse.js › lecteursDuGainTx` ne retire que les absents).
      M19 dit « membre présent », M1 dit que la conduite ne passe par aucune monnaie.
- [ ] **Jauge de Lumière au palier (1a).** Le code garde le reste (95 + 10 → recul, jauge à 5) ;
      M17 et les règles disent « repart à 0 ». Corriger le code, ou le texte.
- [ ] **Trois zones dont la piste donne la réponse (1b)** — voir § 5.2.
- [ ] **`olu-pf-main` n'est jamais dite (PR 2).** La clé est déclarée mais aucun évènement ne la
      déclenche. La brancher (première main prise dans la partie), ou la retirer.
- [ ] **Badge « Bon rangeur » : deux seuils (PR 2).** `badges.json` : « Trois jeux … », seuil 3 ;
      `lib/glRewardsCatalog.js` : paliers 2 · 5 · 9. D'autres badges du catalogue plat
      s'écartent de même (Trouveur 3 contre 1 · 4 · 10, Lecteur 10 contre 3 · 10 · 25, Mains
      tendues 3 contre 1 · 3 · 8, Cartographe 2 contre 1 · 3 · 6, Veilleur 4 contre 2 · 4 · 8,
      Grand voyageur 4 contre 1 · 2 · 4).
- [ ] **Ordre des cartes des « fils » (PR 2).** Les cartes sont servies dans l'ordre du
      catalogue : pour jungle, savane et sahara, relier chaque carte à sa voisine suffit. Les
      mélanger côté serveur ?
- [ ] **Lumière et défis de la Trame (PR 2).** Cinq unités communes de plus par plateau, à + 10
      chacune en mode équipe : jusqu'à trois reculs de voile par chapitre pour une cible d'un. À
      mesurer au banc.
- [ ] **Plafond de la bourse (PR 4).** En fin d'année, 61 % (classe moyenne) et 27 % (classe en
      difficulté) des élèves virtuels sont à 8 gemmes, pour un repère de 25 % au plus. Leviers :
      prix des sorts, prix des parures, plafond.
- [ ] **Choix de la PR 4 faits sans demander** : réparer une page pâlie ne donne plus rien ; la
      bourse de départ est posée une seule fois par année scolaire ; parures rares à 7 et 8
      gemmes.
- [ ] **Noms à confirmer** : badge « Voyant des fils » (ex-« Révélateur ») ; « Grand voyageur »,
      « Bon rangeur », « Gardien des fils » au masculin seul ; titre « Passeur de Pages » non
      renommé (`data/gl/tenir/titres.json`).
- [ ] **« Regarde la piste de ton professeur »** (retours « pas encore » du Mentorat et de la
      Lettre, `sorts.json`) : la piste reste facultative côté prof. La rendre obligatoire, ou
      adoucir le texte.
- [ ] **Pseudo de l'auteur d'une Lettre** affiché dans le carnet de la classe, donc en
      projection.
- [ ] **Message de la version d'état (PR 3)** : « L'équipe a déjà joué ce geste. Voici où vous en
      êtes. » est inexact quand la version a bougé pour une autre raison. Proposition de la PR,
      non appliquée : « L'équipe vient de jouer. Voici où vous en êtes. »
- [ ] **Anciennes questions de zone sur une installation neuve (#665)** : `QCM0213`, `QCM0612`,
      `QCM0618`, `QCM0605`, `QCM0451` restent tirables si le corpus est importé après les
      migrations. Ajouter une règle à l'import ?

## 5. Textes à relire

Les textes sont cités tels qu'ils sont sur `main`. Les remarques scientifiques viennent des
relectures jointes aux PR : elles sont à vérifier, pas à prendre pour acquises.

### 5.1 En premier : remarques de fond encore ouvertes

**Défis de la Trame** (`data/gl/tenir/trame-ranger.json`, `trame-adaptations.json`, PR 2)

- [ ] **Bœuf musqué** (`pays-p4`, `SP0048`) — indice « Double fourrure ; le troupeau se serre en
      cercle. », pourquoi « Rien n'abrite du vent dans la toundra : on se protège les uns les
      autres. » Le cercle est une défense contre les prédateurs, pas contre le vent.
- [ ] **Rose de Jéricho** (`pays-p2`, `SP0019`) — indice « Se referme en boule sèche et attend la
      pluie pendant des années. » Contredit l'explication de `VQCM0063` (« La plante est morte,
      mais ses branches s'ouvrent à l'humidité… »).
- [ ] **Taïga, carte H** des « fils de l'adaptation » — « L'été est court : quelques semaines
      pour pousser » (plutôt deux à trois mois).
- [ ] **Engoulevent** — « Dans la lande, il n'y a presque pas d'arbres où nicher. » / « Il n'y a
      presque pas d'arbres où faire son nid » : cause du nid au sol, douteuse.
- [ ] **Vautour** (`SP0107`) — « …c'est un charognard, donc un consommateur. Il ne rend pas la
      matière au sol. »
- [ ] **Fennec** — « À midi, il fait 45 °C » → « Le fennec a de très grandes oreilles » (animal
      nocturne).
- [ ] **Chêne-liège** — « Le feu passe souvent dans la garrigue » → « Le chêne-liège a une écorce
      très épaisse ».
- [ ] **Vipère à cornes** (`SP0007`) — « Avance de côté sur le sable brûlant. » / « Ne poser que
      deux points du corps à la fois évite de se brûler. »
- [ ] **Bousier** — « Ce scarabée enterre et mange les bouses : il les rend au sol, où les
      plantes les reprennent. » ; nom « Scarabée ténébrion » ; **arganier** « …ne pousse qu'au
      sud-ouest du Maroc. »
- [ ] **Bilan de `pays-p3`** — « Près de chez nous, la contrainte change encore… » : faux pour
      une classe au Maroc.
- [ ] Aides des catégories du « bon rôle » : consommateur « mange d'autres êtres vivants, vivants
      ou morts », décomposeur « transforme la matière morte et la rend au sol » — frontière
      ambiguë. Tournures finalistes (« pour atteindre la lumière », « pour tenir des mois sans
      pluie », « pour passer l'hiver », « Un arbre prêt pour le feu… »).

**Zones et glossaire** (`migrations/365_gl_ensemble_unifie_zones.sql`, PR 1b)

- [ ] `GQCM9302` — « L'ajonc fleurit presque toute l'année, même en plein hiver. Qui en
      profite ? » → « Les abeilles et les bourdons qui sortent les jours doux : presque rien
      d'autre n'est en fleur ». La réponse ne se lit pas dans la fiche de l'ajonc `SP0246` ;
      distracteur « Personne : ses fleurs d'hiver sont en plastique naturel ».
- [ ] `GQCM9301` — distracteur « Ils se changent en champignons au printemps » ; « et il en
      oublie beaucoup » alors que la fiche vante sa mémoire.
- [ ] `GQCM9304` — retour « L'engoulevent ne bouge qu'au crépuscule… » (la fiche dit
      crépusculaire et nocturne).
- [ ] `GQCM9305` et `GL0279` — « plus de la moitié sont endémiques » (dépend de la source).
- [ ] `GL0192` — « Sous la toundra, il est partout ; dans la taïga, on ne le trouve que par
      endroits, surtout au nord. »
- [ ] `GL0038` — « …les chaînes sont plus courtes, et chaque maillon compte davantage. »
- [ ] `GL0280` — « …couvrait presque toute l'Europe. » (plutôt « une grande partie »).
- [ ] `SP0277` (fourmi magnan), observation de terrain — « Colonne sombre de plusieurs mètres de
      large au sol de la forêt, bordée de soldats immobiles. »
- [ ] Dans les cinq `GQCM93xx`, la bonne réponse est chaque fois la plus longue.
- [ ] Question de lecture de `cz-p2-08` (`data/gl/tenir/questions-lecture.json`) — « Pourquoi
      Sélène protège-t-elle ce monde ? » nomme Sélène (les autres disent « la voyageuse ») ; le
      retour « Pas encore : relis le deuxième paragraphe, elle dit le contraire. » renvoie à un
      paragraphe absent de la version accessible.

**Questions vives** (`data/gl/tenir/questions-vives.json`, PR 1a et #663)

- [ ] **Lot 1 (`VQCM0001` à `VQCM0040`)** : la bonne réponse est strictement la plus longue dans
      35 questions sur 40. Non réécrit, comme demandé par le prompt.
- [ ] **Lot 2** : encore 7 sur 40 (`VQCM0056`, `0061`, `0067`, `0069`, `0073`, `0077`, `0079`).
- [ ] `VQCM0071` — « Pourquoi le thym, le romarin et la lavande sentent-ils si fort ? » : la
      remarque « ces plantes sentent surtout quand on les froisse » n'est traitée qu'en partie.
- [ ] Les quatorze questions retouchées par #663 sont à relire à l'écran : `VQCM0041`, `0045`,
      `0046`, `0047`, `0049`, `0052`, `0054`, `0058`, `0063`, `0070`, `0074`, `0076`, `0079`,
      `0080`.

### 5.2 Pistes de zone qui donnent la réponse (`data/gl/tenir/chasse-zones.json`)

| Zone       | Question                                                                                           | Bonne réponse                                                    | Piste affichée                                                 |
| ---------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `cz-p4-01` | « Le lynx boréal est un félin sauvage emblématique de la taïga. Quelle est sa proie principale ? » | « Le lièvre variable (ou lièvre d'Amérique) »                    | « La réponse se trouve dans la fiche « Lièvre variable ». »    |
| `cz-p3-04` | « En Europe, la forêt caducifoliée a beaucoup reculé au cours de l'histoire. Pourquoi ? »          | « À cause du défrichement agricole, de l'urbanisation… »         | « La réponse se trouve au mot « défrichement » du glossaire. » |
| `cz-p4-10` | « L'ours polaire est aujourd'hui menacé principalement à cause : »                                 | « De la fonte de la banquise, qui est son territoire de chasse » | « La réponse se trouve au mot « banquise » du glossaire. »     |

- [ ] Changer la fiche ou le mot pointé, ou la question, pour ces trois zones.
- [ ] Cas voisins : `cz-p4-06` (la piste « Harfang des neiges » est citée dans la seule bonne
      réponse) ; `cz-p3-03` (si le terme `GL0170` « mycorhize » manquait en base, la piste
      passerait à « symbiose », qui est la réponse).
- [ ] Vérifier en prod que les treize termes cités par les zones existent et sont actifs.

Les libellés des questions `QCM0xxx` viennent de l'instantané
`data/gl/sim/contenu-prod-2026-11-07.json` : ils ont pu changer en prod depuis.

### 5.3 Les 23 lignes d'Olu « première fois » (`data/gl/tenir/olu-lignes.json`, PR 2)

| Identifiant                  | Séance | Texte                                                                                                            |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `olu-pf-avancer`             | 1      | Deux dés, et la caravane avance. Une bonne réponse, et elle avance encore d'une case.                            |
| `olu-pf-question_pas_encore` | 1      | Pas encore la bonne réponse ? Rien ne bouge : vous avez essayé, c'est tout.                                      |
| `olu-pf-chercher`            | 1      | Le carnet dort sous le plateau. Deux fouilles par tour : touchez la carte là où l'indice vous mène.              |
| `olu-pf-chaud_froid`         | 1      | Chaud, tiède, froid : je vous dis si une page dort tout près. Vos empreintes restent pour les autres équipes.    |
| `olu-pf-peripetie`           | 1      | Une péripétie ! Le voyage a ses surprises. Lisez-la, et faites ce qu'elle dit.                                   |
| `olu-pf-defi_case`           | 1      | Une case Défi, c'est rare. Vous avez une semaine pour le préparer ; relevé, il fait reculer le voile.            |
| `olu-pf-trame`               | 1      | L'activité est finie ? Les défis de la Trame sont ouverts. Une réussite, et une page de plus pour ton carnet.    |
| `olu-pf-role`                | 1      | L'écran appelle un rôle. C'est un conseil : dans l'équipe, vous vous arrangez comme vous voulez.                 |
| `olu-pf-tenir`               | 2      | Une page trouvée attend un lecteur de l'autre peuple. Lisez-la, répondez à sa question : elle tiendra.           |
| `olu-pf-erreur_du_jour`      | 2      | Aujourd'hui, je vais dire une bêtise, exprès. Qui la repère la corrige, et la jauge de Lumière monte.            |
| `olu-pf-voile`               | 3      | Voici le dé gris. Le voile avance derrière nous : restez devant, et tout va bien.                                |
| `olu-pf-sous_le_voile`       | 3      | {equipe} est sous le voile. Il lui reste une fouille, et elle avance encore : on en ressort vite.                |
| `olu-pf-page_temoin`         | 3      | Regardez : une zone a pâli sous le voile. Gnomes, c'est pour vous. Fouillez-la, et elle revient.                 |
| `olu-pf-palissement`         | 3      | Une page trouvée, pas encore tenue, pâlit sous le voile. Faites-la lire : tenue, elle ne craint plus rien.       |
| `olu-pf-sorts`               | 3      | Le grimoire s'ouvre : trois sorts pour commencer. Chacun verse sa part dans le pot, et le sort part.             |
| `olu-pf-lumiere`             | 3      | La jauge de Lumière monte avec les cartes que la classe garde. Pleine, elle fait reculer le voile de cinq cases. |
| `olu-pf-marche`              | 4      | Le Marché ouvre. Ce que tu achètes au comptoir, tu le gardes toute l'année.                                      |
| `olu-pf-un_de_pose`          | —      | Ici, le chemin se fait lourd. Au prochain tour, un seul dé. Ça ne dure qu'un tour, et rien d'autre ne change.    |
| `olu-pf-un_de_joue`          | —      | Un seul dé ce tour-ci pour {equipe}. Une Cordée lui donnerait le meilleur jet des deux équipes.                  |
| `olu-pf-main`                | —      | Un seul écran joue à la fois. Tu vois ce que fait ton camarade ; à la prochaine action, ce sera peut-être toi.   |
| `olu-pf-camp`                | —      | Le camp ! On pose les sacs. Regardez ce qui change au prochain chapitre : votre peuple, vos sorts, le plateau.   |
| `olu-pf-cordee_offerte`      | —      | Les Grands Froids se traversent encordés : chaque équipe a une Cordée offerte. Choisissez bien avec qui.         |
| `olu-pf-lettre`              | —      | Une Lettre, c'est une page à toi, en marge du carnet. Choisis une amorce, ou pars de ton idée.                   |

Remarques ouvertes sur ces lignes :

- [ ] `olu-pf-defi_case` dit « il fait reculer le voile » dès la séance 1, alors que le voile ne
      s'ouvre qu'à la séance 3 ; `olu-pf-erreur_du_jour` dit « la jauge de Lumière monte » à la
      séance 2, alors que la jauge ne se montre qu'à la séance 3.
- [ ] `olu-pf-page_temoin` dit « a pâli sous le voile » alors que le voile n'a pas encore avancé.
- [ ] `olu-pf-un_de_joue` cite la Cordée, qui n'existe pas au plateau 1.
- [ ] `olu-pf-tenir` est dite à l'ouverture de la séance 2 même si aucune page n'est trouvée.
- [ ] Nombres en dur (« Deux dés », « Deux fouilles par tour », « trois sorts », « cinq cases »,
      « une semaine ») : faux si le réglage change.
- [ ] Parité : « ton camarade » (`olu-pf-main`), « Chacun verse » (`olu-pf-sorts`), « un
      lecteur » (`olu-pf-tenir`).

### 5.4 Textes nouveaux, par PR

**PR 1a (#662, #663)**

- [ ] Les 13 cases Souffle, à l'écran (`migrations/357…`, deux descriptions remplacées par la
      `361` : case 201 « La fauvette pitchou s'arrête au milieu de sa chanson. Toute la lande se
      tait d'un coup. » ; case 116 « La rivière gèle trop tôt : l'ours brun ne peut plus pêcher
      les saumons et maigrit. Ce fil-là, les Gnomes savent le renouer. »).
- [ ] « Cette zone a pâli : les Gnomes savent la réparer. »
- [ ] « Au prochain tour : un seul dé. » / « Ce tour-ci : un seul dé. » ; « Case Souffle : au
      prochain tour, l'équipe ne lance qu'un dé »
- [ ] « Cordée offerte : rien à payer cette fois. » ; « Aucun sort lançable maintenant. » ;
      moment « Pendant l'activité »
- [ ] Journal : « {équipe} ne lancera qu'un dé au prochain tour », « Un défi de la Trame réussi :
      une page endormie se révèle. », « Le voile recule de N cases grâce à la Lumière. »
- [ ] Projection : « Lumière de la classe : N / 100 » ; `olu-38` « Le voile recule de cinq. La
      classe a tenu ses cartes, et le monde le sent. » ; `olu-34` « {equipe} est sous le voile.
      Il lui reste une fouille, et elle avance encore ; les autres savent quoi faire. »

**PR 1b (#664)**

- [ ] Mentorat (`sorts.json`, `SL027`) — consigne « Mentorat : tu expliques à la classe, en deux
      minutes, une page du carnet ou une espèce du biome. Prépare trois choses : ce que c'est,
      où ça vit ou d'où ça vient, et ce qui t'a étonné. Ton professeur choisit le moment. » ;
      « Mentorat réussi : la classe en sait plus grâce à toi. » ; « Un Mentorat est déjà prévu
      aujourd'hui. » ; « Ton Mentorat est déjà payé : retente-le sans rien repayer. » ; « Ton
      Mentorat n'a pas pu passer cette fois. Retente-le quand tu veux, sans rien repayer. »
- [ ] Lettre (`SL048`) — « Une Lettre, c'est une page à toi, en marge du carnet de Sélène. Ton
      professeur la relit, puis elle entre au carnet de la classe. » ; amorces « Ce que j'ai
      vu » (« Raconte ce que tu as vu dans ce biome, comme si tu l'écrivais le soir au
      bivouac. »), « Ce qui m'a surpris » (« Choisis une espèce qui t'a surpris. Dis laquelle, et
      pourquoi. »), « Ce que je me demande » (« Écris une question que tu te poses encore sur ce
      biome, et ce que tu en penses pour l'instant. ») ; « Ta page est entrée au carnet de la
      classe, en marge. Elle y restera. »
- [ ] Seuil — « Ta Lettre est payée : écris-la quand tu veux. », « Ta page part en relecture
      chez ton professeur. », « Pour commencer, choisis une amorce », « Ton Mentorat est prévu :
      ton professeur choisit le moment. », « Je retente, sans rien repayer », « Donne un titre à
      ta page (3 lettres au moins). », « Écris entre 20 et 4000 caractères. »
- [ ] Présences — « Il manque quelqu'un ? » / « Touchez ceux qui ne sont pas là, puis « C'est
      bon ». » ; journal « Fin du tour : chacun revient dans la partie. »
- [ ] Le camp — « Au camp ou en veillée », « Le camp approche : on compte ce qu'on a tenu. »,
      « Un chapitre traversé jusqu'au bout. Le camp suivant t'attend déjà. » ; mission `mis-17`
      « Inventer un cri de ralliement d'équipe de trois mots, et le crier (doucement) au moment
      d'arriver au camp. »
- [ ] Les cinq questions `GQCM9301` à `GQCM9305` et leurs retours, la fiche `SP0277`, les termes
      `GL0279` et `GL0280`, à l'écran.
- [ ] Les règles v3 (`docs/GL_TENIR_A_DEUX_REGLES.md`) et `docs/reference/gl/`.

**PR 2 (#667)**

- [ ] « Maintenant, vous pouvez… » — « lancer les dés », « lancer le dé (un seul ce tour-ci) »,
      « la question de la case », « N fouille(s) », « N page(s) à lire et à faire tenir », « les
      défis de la Trame », « les sorts » ; appels de rôle « C'est le moment de la ou du
      Gestionnaire. », « …de l'Éclaireuse ou de l'Éclaireur. », « …de l'Opératrice ou de
      l'Opérateur. », « …de la ou du Secrétaire. », « …de l'Assistante ou de l'Assistant. »
- [ ] « Ce qui change » — « Tu passes chez les Gnomes. » / « …Licornes. », « Tout le monde passe
      dans l'autre peuple. », « Les équipes se recomposent : vous le découvrirez au départ. »,
      « Pas de nouveau sort : les mêmes, bien connus. », « Tout est ouvert dès la première
      séance », « N pages à retrouver », « le voile avance un peu plus vite », « une Cordée
      offerte à chaque équipe », « Les mêmes règles, un nouveau chemin. »
- [ ] Projection — « À la prochaine séance », « Une page dort encore : « … » ». L'accroche
      affiche la page du Passeur telle qu'en base : vérifier qu'aucune ne nomme l'oiseau.
- [ ] Veillée — « Tu as gagné toutes tes pages de la semaine. Tes réussites comptent toujours. »,
      « Encore N page(s) à gagner cette semaine. », « Tu as gagné toutes tes pages de la
      semaine. Cette page t'attendra. »
- [ ] Escalier — « Tenir une page s'ouvre à la prochaine séance. Elle t'attendra. », « Ce sort
      s'ouvre plus tard dans le chapitre. », « Séance N : du nouveau », « Maintenant, vous pouvez
      découvrir : … », « La page témoin » / « Une zone a pâli. Les Gnomes savent la réparer : ils
      la fouillent, répondent à sa question, et elle revient. »
- [ ] Indices des trois défis (`lib/glTrameDefis.js`, `src/gl/defis/trameCore.js`) — « Relis la
      consigne : chaque être vivant a un rôle dans la Trame. », « Commence par les plantes :
      elles fabriquent leur matière avec la lumière. », « Un animal qui mange des plantes ou
      d'autres animaux, même morts, est un consommateur. », « Un décomposeur transforme la
      matière morte et la rend au sol : pense aux champignons et aux petites bêtes du sol. »,
      « Relis la consigne : l'indice dit comment elle vit, et cela renseigne sur son milieu. »,
      « Cherche dans l'indice ce qui manque ou ce qui abonde : l'eau, la chaleur, la lumière, la
      nourriture. », « Demande-toi dans quel pays cette façon de vivre aide le plus. », « Range
      d'abord les cartes que tu connais bien : celles qui restent se rangent plus facilement. »,
      « Relie chaque contrainte du milieu au problème qu'elle pose, puis à l'espèce qui a la
      solution. », « Regarde le sens : le chemin part du milieu, passe par le problème, et arrive
      à l'espèce. »
- [ ] Les cartes, indices, « pourquoi » et bilans de `trame-ranger.json` (12 jeux) et de
      `trame-adaptations.json` (8 jeux), à l'écran.

**PR 3 (#670)**

- [ ] « {Prénom} répond… / fouille… / fait tenir une page… / prépare un sort… », « Une autre
      tablette … », « … Attendez la fin de son geste. »
- [ ] « L'équipe a déjà joué ce geste. Voici où vous en êtes. » (voir § 4)
- [ ] « Tu regardes ce tour : tu vois tout, et tu joueras de nouveau au prochain. Si tu viens
      d'arriver, dis-le à ton équipe ou au prof. » ; « · en retrait jusqu'à la fin du tour »
- [ ] « Mettez-vous d'accord : le bouton s'allume dans N s. »
- [ ] « {Équipe} : en attente. Un appareil de l'équipe, ou le prof, accepte cette tablette. Rien
      d'autre à faire. », « Cette tablette n'a pas été acceptée. Demandez à votre équipe ou au
      prof. », « Personne n'a répondu à temps : touchez de nouveau la mascotte de votre équipe. »,
      « Une tablette demande à rejoindre l'équipe. », « Cette demande n'attend plus : elle a
      expiré ou quelqu'un y a déjà répondu. »
- [ ] « Le Marché et le Seuil s'ouvrent depuis le compte de chacun. », « Ce geste touche la
      bourse d'un élève : il se fait depuis son propre compte. », « Le pot se partage entre les
      présents. « Pas moi » se dit depuis son propre compte, ou au prof. », « Sur la tablette de
      l'équipe, le pot se partage tout seul entre les présents. »

**PR 4 (#672)**

- [ ] Bourse — « Gemmes : ta bourse », « Gemmes = ta bourse, gardée toute l'année », « Une plume
      est posée sur ta bourse : une gemme est partie au nid. Elle reviendra à la prochaine page
      trouvée. », « Une bourse a été visitée : une gemme en moins. »
- [ ] Marché — « Au Comptoir, les parures s'achètent avec tes gemmes : une parure achetée est à
      toi toute l'année. », « Tes gemmes restent à toi d'un chapitre à l'autre. Un don ne revient
      pas. », « Tes gemmes (💎) sont ta bourse : elle reste sur ton compte toute l'année. », « Tu
      peux échanger des gemmes ou des pages avec un camarade de ta classe, ou lui en faire don
      (l'autre peut proposer zéro). », « Le Marché n'échange que des gemmes et des pages », « Cet
      échange ferait dépasser le plafond de la bourse d'un joueur : rien n'est transféré »
- [ ] Parures et garde-robe — « Une parure achetée est à toi toute l'année : elle se pose sur la
      mascotte de ton équipe, et tu la retrouves dans ta garde-robe, au Seuil. Aucun effet de
      jeu. », « Pas encore assez de gemmes pour cette parure », « Tu as déjà cette parure : elle
      est dans ta garde-robe », « Ma garde-robe », « Tes parures sont à toi toute l'année.
      Pose-les sur la mascotte de ton équipe, ou range-les. », « Tu pourras les poser dès que ton
      équipe sera en route. », « Tu regardes ce tour : ta garde-robe rouvre quand il se termine »
- [ ] But de l'année — « Consécration · 8 💎 », « Le but de l'année : elle s'ouvre au troisième
      trimestre. » / « …elle se demande au troisième trimestre, nous y sommes. »
- [ ] « ⏳ Sort envoyé au prof. Les gemmes ne seront débitées qu'après son accord. » — à
      rapprocher de M14 (sorts du Travail débités au lancement).
- [ ] Règles v3, § 8, 9, 10 et 15 ; `docs/reference/gl/economie-marche-sorts.md`,
      `guide-du-mj.md`, `presentation.md`.

## 6. Limites de cette vérification

- Aucun essai sur de vrais appareils ; la production n'a été lue que par quelques requêtes en
  lecture (schéma 373, catalogues synchronisés, cases Souffle et cases Défi aux bons rangs).
- Les défauts du § 3 viennent des relectures ; ceux du § 2 ont été relus dans le code et
  couverts par un test. Les remarques scientifiques du § 5 ne sont pas vérifiées ici.
- Les e2e ont tourné avec le Chromium du conteneur, pas avec la version épinglée par le projet.
