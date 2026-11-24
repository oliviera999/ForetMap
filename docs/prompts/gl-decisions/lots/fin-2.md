# Lot fin-2 — Docs de référence, docs du prof, skills, vérifications complètes

> Chantier G&L « décisions » · vague 3 · couloir fin · charge forte, reprise prévue · banc : complet
> Branche : `claude/gl-decisions-fin-2` · Attend : fin-1 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

Le prof ouvre la documentation dans l'application (onglet « Contenus ») et trouve en tête deux documents courts,
« L'essentiel du maître du jeu » et « Déroulé d'une partie », puis neuf documents de référence réécrits **au
présent**, pour « Tenir à deux » seul, vrais pour le code fusionné. Les skills du dépôt redeviennent vrais ; un test
garde le vocabulaire des docs. Le lot finit par les vérifications complètes et les captures finales. Aucune règle,
route, table, réglage ni donnée de catalogue ne change.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce que la doc doit dire |
| --- | --- | --- |
| 26 du prompt | 23/11 soir | Toute la doc G&L réécrite au présent pour « Tenir » seul ; deux docs du prof au dépôt. |
| 16 et 25 du prompt | 23/11 | « Tenir à deux » est le seul jeu ; deux surfaces, « Tablettes » et « Tableau ». |
| 19, 20, 24 du prompt | 23/11 | Escalier en cinq marches, une par jour ; page témoin derrière la dernière équipe ; Relance retiré. |
| 23 du prompt | 23/11 soir | Un seul écran d'équipe ; au tableau, le bloc « Équipe active » de la console. |
| 37 du prompt | 24/11 | Question de case : une case, trois sous le voile, une sonde. |
| 35 de l'addendum 4 | 24/11 | L'Éclaireuse ou l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond et sonde. |
| 29 de l'addendum 3 | 24/11 | Les marges du copiste, les enveloppes de la boîte, le double fond. |
| 34 de l'addendum 4 | 24/11 | La table de jeu : matières, plumes de l'oiseau, interrupteur. |
| I6, I10 (addendum 2) | 24/11 | Les mots du voyage ; la musique sur la projection seule. |
| « Mon sac » | 24/11 | L'espace personnel de l'élève s'appelle « Mon sac », en deux états. |
| Après-midi | 24/11 | Escalier : parties neuves seulement ; une sonde par bonne réponse de case. |

Réglages posés en prod par Oliv le 23/11, à décrire tels quels : le Marché est fermé pendant le tour ; l'oiseau
chapardeur est coupé pour le chapitre 1.

**Choix par défaut posés par Claude** (appliqués sans demander ; à lister dans ton rapport) :

- **pas de « Depuis le … »** dans la doc de référence : l'historique vit dans le `CHANGELOG.md`, les `docs/AUDIT_*`
  et `docs/prompts/*` ; la doc dit ce qui est ;
- le **jeu classique** n'est plus décrit dans `docs/reference/gl/`, sauf un encadré unique dans `presentation.md` :
  « Les anciennes parties créées avant novembre 2026 sans « Tenir à deux » jouent encore l'ancien jeu (cœurs, score
  d'équipe). On ne peut plus en créer ; elles seront retirées. » Les fonctions qui servent aussi à « Tenir » restent
  (comptes, connexion, démonstration, invité, Moodle, « Mon sac », carnet personnel, fiches et « marquer appris »,
  feuillets d'ouverture, les marges du copiste et les enveloppes de la boîte, mascottes, projection…). En cas de
  doute, vérifie dans le code qu'une fonction sert en « Tenir » (`isTenirGame`) avant de la retirer ; liste chaque
  passage retiré, avec sa raison ;
- `docs/reference/gl/audit-mecaniques-2026-08.md` sort de la doc de référence (`git mv` vers
  `docs/AUDIT_MECANIQUES_GL_2026-08.md`) ;
- le « Déroulé d'une partie » perd le mot « classique » de son titre (ce mot désigne désormais l'ancien jeu) ;
- les deux docs du prof en tête de l'ordre de lecture ; « État décrit : version X » ;
- test de vocabulaire : « cœur » toléré deux fois au plus, dans `presentation.md` seulement ; l'ancienne troisième
  surface n'est nommée nulle part dans `docs/reference/gl/` ;
- la ligne « Quatre mondes » du tableau « Les mots à dire » de l'essentiel cite, côté « à éviter », un nombre de
  mondes que ce test refuse : reformule-la sans l'écrire (par exemple « un autre nombre de mondes »).

## 3. Fichiers

- **À toi** : `docs/reference/gl/README.md`, `presentation.md`, `lore-deux-peuples.md`, `roles-et-connexion.md`,
  `guide-du-mj.md`, `chapitres-et-progression.md`, `carte-du-royaume.md`, `economie-marche-sorts.md`,
  `qcm-et-pedagogie.md`, `audit-mecaniques-2026-08.md` (à déplacer) ; `docs/reference/README.md` (section G&L) ;
  `docs/BACKLOG_IDEES.md` et `docs/audits/README.md` (liens de l'audit déplacé) ; `lib/glReferenceDocs.js`
  (`READING_ORDER`) ; `tests/gl-reference-docs.test.js` ; `tests-ui/gl/GLReferenceDocsPanel.test.jsx` ; les
  `SKILL.md` de `.claude/skills/gl-banc`, `gl-contenu-science`, `gl-tenir-catalogue`, `gl-tenir-garde-fous`,
  `gl-tenir-moteur`, `foretmap-gl`, `foretmap-docs-reference`.
- **Nouveaux** : `docs/reference/gl/essentiel-mj.md` ; `docs/reference/gl/deroule-partie.md` ;
  `docs/AUDIT_MECANIQUES_GL_2026-08.md` (par `git mv`) ; `tests/content/gl-reference-docs-vocabulaire.test.js` ;
  captures sous `docs/captures/gl-decisions/fin-2/`.
- **D'un autre couloir, modification minimale permise** : un test ou un fichier d'un lot déjà fusionné, seulement
  pour réparer un petit échec trouvé par les vérifications de la section 7 ; dis-le. Un échec plus gros : écris-le.
- **Ne touche pas** : `docs/GL_TENIR_A_DEUX_REGLES.md` et les `docs/GL_*.md` (lot fin-1 ; un écart trouvé va dans
  ton rapport) ; `docs/reference/foretmap/`, `docs/reference/plan/`, `docs/reference/exploitation/` ; le code de
  `src/gl` (un libellé faux se dit, il ne se corrige pas ici) ; `CHANGELOG.md` ; `.cursor/**`.

## 4. Étapes (un commit par étape ; aux étapes fin-2.2 et fin-2.3, un commit par document)

Règles de la doc de référence, pour toutes les étapes :

- français simple ; **aucun nom de fichier, de route, de table ni de réglage technique** dans `docs/reference/gl/` ;
  nomme les choses par leur libellé à l'écran ;
- **chaque libellé cité entre guillemets existe dans `src/gl`** (`git grep`) ; sinon reformule sans guillemets ;
- une incohérence qui reste va dans un encadré « ⚠️ Points d'attention » à la fin du document, jamais tue ;
- un marqueur « 🔧 À implémenter » est une demande d'Oliv : il n'y en avait aucun le 23/11 (seulement leur mode
  d'emploi dans `README.md` et `guide-du-mj.md`) ; s'il en paraît un, garde-le tel quel et signale-le ;
- `docs/reference/gl/` ne parle que de G&L ; l'oiseau ne s'y nomme pas : écris « l'oiseau » ;
- un doute : « ⚠️ », pas d'invention. Un geste décrit se retrouve dans `src/gl` ; une règle, dans les règles v4 et
  le moteur.

### fin-2.1 — Préparer, et sortir l'audit d'août de la doc de référence (ex-étape 28)

- **Constat** : l'ancienne étape 28 ne faisait que renvoyer à ce lot. La doc s'est écrite par couches (« Depuis le
  14 novembre… », « Ensemble unifié : … (17 novembre) », « Écrans de séance : … (20 novembre) ») : tout y est, mais
  un prof ne sait pas ce qui vaut aujourd'hui. Sur `main` : 3 411 lignes dans `docs/reference/gl/` ; « Depuis le »
  9 fois dans `guide-du-mj.md`, 4 dans `economie-marche-sorts.md`, 1 dans `presentation.md`,
  `roles-et-connexion.md` et `qcm-et-pedagogie.md`.
- **Changement attendu** :
  1. Lis les rapports de **tous** les lots (`docs/prompts/gl-decisions/rapports/*.md`, section « Ce que les lots
     suivants doivent savoir »), surtout fin-1, contenu-3 (page Histoire), ecrans-1 (page des biomes), moteur-3,
     moteur-4, ecrans-4, ecrans-8, contenu-6. Lis les règles v4, `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`, le
     skill `foretmap-docs-reference` et la règle `.cursor/rules/foretmap-docs-reference.mdc`.
  2. Note la longueur de chaque document avant réécriture (pour ton rapport). Surcouches : une doc éditée dans
     l'application masque le fichier du dépôt ; la table `gl_reference_docs` était vide en prod les 23 et 24/11 ;
     tu n'as pas la prod : rappelle-le à Oliv dans ton rapport (section 11, point 17).
  3. `git mv docs/reference/gl/audit-mecaniques-2026-08.md docs/AUDIT_MECANIQUES_GL_2026-08.md` ; corrige les liens
     qui y mènent : `docs/reference/README.md` (l. 98), `docs/reference/gl/README.md` (l. 16),
     `docs/BACKLOG_IDEES.md` (l. 256, 305, 665) ; ajoute-le à l'index `docs/audits/README.md`. Ne corrige pas
     `CHANGELOG.md`.
- **Tests** : `tests/gl-reference-docs.test.js` reste vert (il attend `presentation` et `guide-du-mj`).
- **Critère d'acceptation** : `git grep -n "audit-mecaniques-2026-08" -- . ':!CHANGELOG.md'` ne rend plus rien.

### fin-2.2 — Deux nouveaux documents pour le prof (ex-étape 4 de l'annexe C du prompt)

- **Constat vérifié** : les deux textes de départ sont dans `docs/prompts/gl-decisions/sources/essentiel-mj.md`
  (136 lignes) et `sources/deroule-partie.md` (145 lignes). Ils décrivent la **v1.263.5** : anciens rôles, relance,
  quatre marches, « le Seuil », chasse impossible au tableau. Les numéros de ligne ci-dessous sont ceux de ces deux
  fichiers.
- **Changement attendu** : crée `docs/reference/gl/essentiel-mj.md` puis `docs/reference/gl/deroule-partie.md` à
  partir de ces textes, **mis à jour sur le code fusionné**. À corriger, point par point :
  1. **En-têtes.** Essentiel l. 4 : « v3 » → « v4 ». Essentiel l. 5 et déroulé l. 5 : « État décrit : version X »
     (celle de la branche d'intégration). Déroulé l. 1 : « Gnomes & Licornes · Déroulé d'une partie ».
  2. **Rôles échangés** (essentiel l. 41-44 ; déroulé l. 63 et 66). L'Éclaireuse ou l'Éclaireur **fouille** (touche
     le dessin où l'indice mène). L'Opératrice ou l'Opérateur **répond à la question de la case, puis sonde**.
     L'Assistante ou l'Assistant jette les sorts ; dans une équipe de quatre, fait aussi l'Opératrice ou
     l'Opérateur. La ou le Gestionnaire lance les dés ; la ou le Secrétaire lit et fait tenir.
  3. **Question de case et sonde** (essentiel l. 104-106 ; déroulé l. 63-65). Bonne réponse : la caravane avance
     d'une case, de trois si l'équipe est sous le voile, et l'équipe reçoit **une sonde** (une par bonne réponse,
     à utiliser dans le tour, perdue à la clôture). Sonder : toucher un dessin et lire « chaud », « tiède » ou
     « froid » ; ni question, ni page ; dans une zone, au moins « chaud » ; les deux fouilles restent. Dans le tour
     d'une équipe : « Répondre », puis « Sonder ». Le mot « relance » sort des deux documents.
  4. **Cinq marches, une par jour** (essentiel l. 93-106 ; déroulé l. 109-119). Tableaux refaits : 1, avancer, la
     question de case, fouiller, les défis de la Trame hors tour ; 2, faire tenir une page, l'erreur du jour d'Olu,
     le défi de case ; 3, le voile et la page témoin ; 4, les sorts (trois par peuple) et la jauge de Lumière ; 5, le
     Marché, Farce et Question. « Chaque tour clos monte une marche » devient : une marche par jour au plus (deux
     tours le même jour n'en ouvrent qu'une) ; « Ouvrir la suite » reste libre. Écris aussi : un chapitre 1 joué en
     quatre séances n'atteint pas la marche 5 (le Marché, Farce et Question s'ouvrent alors au plateau 2) ; pour
     les ouvrir quand même, « Ouvrir la suite » à la séance 4. L'escalier vaut pour une partie neuve. Les deux
     encarts « Décidé le 23 novembre, pas encore en place » disparaissent.
  5. **Page témoin** (essentiel l. 57 ; déroulé l. 113) : à la marche 3, c'est la zone endormie la plus avancée
     derrière la dernière équipe qui pâlit, plus une zone « près du départ ».
  6. **Relance retiré** : grimoire à 18 sorts ; déroulé l. 114, « trois sorts de plus » est faux (marche 5 : deux
     sorts, Farce et Question).
  7. **« Mon sac »** (déroulé l. 14 et 104) remplace « le Seuil » : fermé pendant le tour, ouvert à la veillée.
     Décris ce que l'élève y trouve d'après le code fusionné (dont les marges du copiste et « Mon journal »).
  8. **Deux surfaces** : « Tablettes » et « Tableau » ; « Tout au tableau » reste le passage d'urgence.
  9. **Le tour au tableau** (déroulé l. 138-145, « Et sans tablettes ? » ; essentiel l. 126-130) : décris le bloc
     « Équipe active » de la console, geste par geste, avec ses libellés réels : lancer, question (puis la sonde),
     fouiller, lire, « Équipe suivante » ; bourses masquées ; « Le voile avance » après la dernière équipe ; la
     tablette dit « Le tour se joue au tableau. »
  10. **Points d'attention** (essentiel l. 124-136 ; déroulé l. 143-145). Disparaissent ceux que le chantier a
      corrigés (vérifie chacun dans le code) : la chasse au tableau ; « Équipe suivante » après la dernière
      équipe ; l'erreur d'Olu visible du seul prof (elle est en projection et sur la tablette d'équipe : essentiel
      l. 27 et 131, déroulé l. 46) ; les durées fausses ; la question de case sautée au tableau. « Un tour non clos reste ouvert » devient le bandeau
      « Le tour du … est resté ouvert ». Les autres restent **s'ils sont encore vrais** (vérifie) : clore le
      chapitre ferme le lien de projection ; les zones du plateau 1 à retracer.
  11. **Les marges du copiste et la boîte.** À la séance 1 : intro projetée et boîte sur la table (rond de café au
      dos du mot, main posée en secret sur la plaque). À chaque camp : « Marges du copiste » (grand texte), lire
      les notes, puis « Ouvrir l'enveloppe » à l'écran au moment où la classe ouvre la vraie. Au camp du plateau 4 :
      souffler sur la plaque. En juin : « Ouvrir le double fond », lire la lettre.
  12. **La table de jeu.** « Les plumes de l'oiseau » pour lire le plateau (déroulé l. 68 parle d'une empreinte) ;
      l'interrupteur « Table de jeu » (la voie de repli) ; « Sons du jeu » ; la musique se joue sur la projection
      seule (« Activer le son » au premier lancement) ; la piste d'un « pas encore » s'ouvre sur la tablette
      d'équipe (« Revenir au jeu »).
  13. **Les mots à dire** (essentiel l. 78-89) : ajoute « le monde, le chemin, la caravane » à dire, « le plateau,
      la classe » à éviter, en jeu ; reformule la l. 85 (choix par défaut, section 2).
  14. **Libellés.** « tiroir « L'équipe » » (essentiel l. 48, déroulé l. 67) et tout libellé entre guillemets :
      revérifie-les dans `src/gl` après la table de jeu (cinq onglets).
- Ajoute les deux slugs **en tête** de `READING_ORDER` (`lib/glReferenceDocs.js`, l. 37) : `essentiel-mj`,
  `deroule-partie`, puis l'ordre actuel. Fais-le dans le commit du second document. Aligne
  `tests/gl-reference-docs.test.js` (l. 126 attend `presentation` en premier) et
  `tests-ui/gl/GLReferenceDocsPanel.test.jsx` s'ils figent l'ordre ; les slugs `presentation` et `guide-du-mj`
  restent.
- **Tests** : les deux fichiers ci-dessus.
- **Critère d'acceptation** : aucun des deux documents ne dit « relance », « le Seuil », « pas encore en place »,
  « 1.263.5 » ; les rôles y sont ceux du point 2 ; les deux documents ouvrent la liste de l'application.

### fin-2.3 — Réécriture de `docs/reference/gl/` (ex-étape 5 de l'annexe C du prompt)

- **Constat vérifié sur `main`** (lignes de `b8b5344`) :
  - `guide-du-mj.md` (770 l.) ouvre sur le jeu classique (profils Minimal / MJ + tours, vitalité cœurs / gemmes) ;
    trois surfaces ; Retrait qui « joue, fouille et lit… peut tenir une page » (l. 312-313, 321-322) contre la
    l. 516 et les règles § 3 ; Marché depuis la tablette avec « Qui agit ? » (l. 492) contre la l. 513 ; « Jouer le
    tour » « projeté au tableau » (l. 301) alors que la projection est un écran à part ; une dizaine de sections
    datées ;
  - `presentation.md` : section « L'économie du jeu : cœurs et gemmes », 14 mentions des cœurs ;
  - `economie-marche-sorts.md` : titre « cœurs, gemmes… », 37 mentions des cœurs, trois parties sur le classique ;
  - `chapitres-et-progression.md` : chapitre 5, « prologue », vitalité, avant les sections « Tenir » datées ;
  - `carte-du-royaume.md` : effets machine en cœurs (« sinon −1 cœur ») ;
  - `qcm-et-pedagogie.md` : deux jeux de questions présentés à égalité ; `README.md` : « Les deux monnaies ».
- **Changement attendu** : pour chaque document, réécris **au présent, pour « Tenir à deux »**, sans sections
  datées, sur la structure des docs ForêtMap : « À quoi ça sert → Qui l'utilise → Comment ça se passe → ⚠️ Points
  d'attention → Pour aller plus loin » ; liens relatifs à jour ; longueur raisonnable (vise la moitié de l'actuel
  quand le document est en couches). Dans cet ordre, **un commit par document** :
  1. `README.md` : sommaire, essentiel-mj et deroule-partie en tête ; « une monnaie, les gemmes » ; plus d'audit
     d'août. Aligne aussi la section G&L de `docs/reference/README.md` (statuts ✅).
  2. `presentation.md` : ce qu'est G&L (une année, Quatre mondes, deux peuples, le carnet, le voile), les quatre
     rôles de compte, le tour des modules utiles en « Tenir », l'encadré unique sur les anciennes parties. Plus de
     section « cœurs et gemmes ».
  3. `lore-deux-peuples.md` : relecture (garde-fous, « le camp », « Mon sac » pour l'écran, formes doubles). Le nom
     commun « seuil » reste dans le récit. Peu de changements attendus.
  4. `roles-et-connexion.md` : comptes, connexion, tablette d'équipe (QR de la classe, demande d'entrée, « Tout
     accepter »), projection, deux surfaces. Garde les sections comptes, démonstration, invité, Moodle, « Voir
     comme » si elles décrivent l'existant.
  5. `guide-du-mj.md` : **le guide complet, au présent**. Avant la séance (créer la partie, composer les équipes,
     imprimer le QR, préparer la boîte une fois : quatre enveloppes, la lettre sous le double fond, la main sur la
     plaque). Pendant (l'écran « Jouer le tour » en mode séance : bandeau, Demandes, équipes, sablier, voile, erreur
     d'Olu, Team Spirit ; la tablette d'équipe en trois choses, ou telle que la table de jeu l'a laissée ; la
     projection, où la musique se joue). Le tour au tableau. Après
     (Team Spirit, exports, badges). Le camp. Incidents. Les cinq rôles et leurs gestes, les plumes de l'oiseau,
     l'interrupteur « Table de jeu », « Sons du jeu ». Olu, aide et visites guidées. Lire et amender cette doc
     depuis le jeu. ⚠️. Il renvoie à essentiel-mj et deroule-partie sans les recopier.
  6. `chapitres-et-progression.md` : plateaux et chapitres (4 à 6 séances), équipes rebrassées et peuples inversés,
     escalier du chapitre 1, voile, carnet de la classe, camp et « Ce qui change », honneurs, titres, badges (noms
     en formes doubles). Plus de chapitre 5 ni de prologue.
  7. `carte-du-royaume.md` : le plateau, les cases et la vérité des cases, les zones de chasse (tracer une zone
     dans l'éditeur, puis demander qu'elle soit reportée dans le catalogue du dépôt pour qu'une synchronisation ne
     l'efface pas), les empreintes (des plumes, depuis la table de jeu), l'oiseau témoin, le voile.
  8. `economie-marche-sorts.md` : une monnaie (départ, plafond, d'où viennent les gemmes, réserve de la caravane),
     le Marché (annonces, échange, dons, parures ; fermé pendant le tour), le grimoire (sorts par chapitre et par
     moment, pot partagé, sorts du Travail honorés ou remboursés, Mentorat, Lettre, but de l'année).
  9. `qcm-et-pedagogie.md` : les questions en « Tenir » : question de case (et la sonde), question de zone et sa
     piste, question de lecture, l'erreur qui révèle (« Pas encore »), écrire une bonne question (curiosité, un pas
     au-delà de l'indice, bonne réponse pas la plus longue), défis de case, défis de la Trame ; fiches et « marquer
     appris » s'ils servent en veillée.
- **À placer d'après les rapports de lot**, dans le document où le sujet se lit le mieux (dis lequel) : la page
  Histoire (l'élève la valide seul, depuis son compte, par une
  question ; délai d'une heure annoncé ; la question tourne ; l'épilogue est réservé au prof ; un récit cite une
  scène par son nom), d'après contenu-3 ; la page des biomes (un onglet par biome, son biotope et sa biocénose ; un
  texte de chapitre s'écrit par biome), d'après ecrans-1 ; les traces de passage et le « +1 » de « Mon journal »,
  d'après contenu-5.
- **Tests** : aucun nouveau ici (le test de vocabulaire vient à l'étape fin-2.4).
- **Critère d'acceptation** : `grep -rn "Depuis le" docs/reference/gl/` vide ; chaque libellé entre guillemets
  retrouvé dans `src/gl` ; tous les liens relatifs mènent à un fichier existant.

### fin-2.4 — Skills et garde de vocabulaire (ex-étape 6 de l'annexe C du prompt)

- **Constat vérifié sur `main`** : `.claude/skills/gl-tenir-moteur/SKILL.md` liste encore trois surfaces (l. 49) et
  dit que l'ancien écran `GLTenirEquipeView` est gardé au tableau (l. 123). Le scénario de banc
  `hybride-reference`, cité par `gl-banc` et par `.claude/commands/gl-verif.md`, existe toujours : le moteur garde
  cette surface, ne le retire pas.
- **Changement attendu** :
  1. Balaye les sept skills de la section 3 et corrige ce qui est devenu faux, y compris ce que les lots
     précédents auraient laissé : « le reste est gardé » (jauge de Lumière) ; `badges.json` comme source des
     badges ; erreur d'Olu à la console seulement ; retour au jeu classique possible ; relance après une bonne
     réponse ; escalier en quatre marches ; trois surfaces ; ancien écran au tableau ; sort Relance ; animation des
     pions ; deux monnaies ; doc en couches ; anciens rôles du tour ; « règles v3 » ; « Le Seuil » comme nom
     d'écran ; les deux nouveaux documents de référence.
  2. Ajoute `tests/content/gl-reference-docs-vocabulaire.test.js`. Il lit `docs/reference/gl/*.md` et échoue si :
     un titre commence par « Depuis le » ou contient une date entre parenthèses ; un document contient « Cinq
     mondes », `Krâ`, `Kraa`, `krâ` (les deux premiers sont dans `FORBIDDEN_WORDS_CS` de
     `src/shared/glGardeFousCore.js`), un point médian (`·` entre deux lettres), « hybride » ; « cœur » apparaît
     dans un autre document que `presentation.md` (encadré des anciennes parties), ou plus de deux fois dans
     celui-ci. Message d'échec en français, avec le document et la ligne.
- **Tests** : ce test, vert sur les onze documents.
- **Critère d'acceptation** : `npm run test:content` vert ; aucun skill ne décrit un écran, une règle ou un rôle
  d'avant le chantier.

## 5. Migration

Aucune.

## 6. Données et sources

- `docs/prompts/gl-decisions/sources/essentiel-mj.md` → `docs/reference/gl/essentiel-mj.md` (après corrections).
- `docs/prompts/gl-decisions/sources/deroule-partie.md` → `docs/reference/gl/deroule-partie.md` (après corrections).
- Les rapports de lot, pour tout ce que la doc doit décrire. Les fichiers de `sources/` ne se modifient pas.

## 7. Vérifications propres au lot

Toutes celles de la section 6 des règles communes, plus :

```bash
flock /tmp/gl-decisions-e2e.lock npx playwright test --project=chromium e2e/gl-*.spec.js
npm run gl:sim:db
npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14
npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14
npm run gl:sim -- --scenario all --runs 3 --seed 11
DB_NAME=foretmap_fin_2_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run
grep -rn "Depuis le" docs/reference/gl/
```

- **Liens** : tous les liens relatifs de `docs/reference/gl/*.md` et de `docs/GL_TENIR_A_DEUX_REGLES.md` mènent à
  un fichier existant (écris un petit contrôle ou vérifie à la main, et dis comment).
- **Relecture** : `gl-relecteur-garde-fous` sur le diff des docs de référence ; `gl-relecteur-science` sur
  `qcm-et-pedagogie.md` et `chapitres-et-progression.md`.
- **Banc** : ce lot ne touche pas au moteur ; compare tes mesures aux mesures finales du rapport fin-1. Un écart :
  dis-le.
- **Captures finales** (`docs/captures/gl-decisions/fin-2/`) : le panneau « Documentation » de l'application avec
  les deux nouveaux documents en tête ; la tablette d'équipe (Gnomes, puis Licornes) ; le plateau gravé ; une
  fouille avec ses plumes ; la projection. **Aucune image n'est versionnée** : le code lit la médiathèque et rend
  un repli sinon. Tes captures montrent donc les **replis** (CSS, SVG), pas les images de la série « Table de
  jeu » : écris-le en tête du dossier de captures et dans ton rapport.
- **Inventaire des captures du chantier** (présentes ou manquantes, par dossier de lot) : badge à 390 px ; « fils
  de l'adaptation » ; carnet de la classe avec une Lettre ; erreur d'Olu en projection et sur la tablette, avant
  et après correction ; question de zone, plateau flouté ; fenêtre de question sans puces, puis avec ; réglages
  sans la case de la mouture ni « Hybride » ; les deux sélecteurs de surface ; console au tableau, la suite d'une
  équipe puis « Le voile avance » ; tablette en surface tableau ; tablette arrivée sur une case question ; piste
  ouverte puis « Revenir au jeu » ; mascotte qui saute ; page Histoire, avertissement et délai ; onglet « Savane
  tropicale » avant / après ; « Sondez le plateau » et l'empreinte d'une sonde ; barre d'onglets d'un élève ;
  lexique du voyage au plateau 1 ; vitrine `?demo=parents` ; écran de connexion avec l'image ; plateau sur son
  fond sombre ; projection avec « Activer le son », tablette sans bouton de musique.

**Rapport final attendu** (`docs/prompts/gl-decisions/rapports/fin-2.md`, en plus des sections communes) :

- le tableau des documents : réécrit, aligné, déplacé ou inchangé, avec la longueur avant → après ;
- les passages retirés parce qu'ils ne décrivaient que le jeu classique (une ligne chacun) ;
- les écarts doc / code trouvés : corrigés dans la doc, ou laissés en « ⚠️ » (et lesquels méritent un correctif de
  code, sans le faire) ;
- les « choix faits sans demander » : ceux de la section 2 et les tiens ;
- les captures et leur inventaire ;
- le banc (les trois mesures du rapport fin-1 : Lumière par chapitre ; écart de cases au camp, équipes sous le
  voile, pages trouvées, carnet complet ; dépense de gemmes) ;
- le **tableau des décisions** du rapport fin-1, repris et complété de ce que ce lot livre (livrée ou non livrée) ;
- les comptes rendus par les lots (tutoiement des cases des plateaux 2 à 4 ; lignes d'erreur d'Olu par plateau ;
  doublons Passeur / zones ; péripéties au masculin), repris de fin-1 ;
- « **À relire par Oliv** » : essentiel-mj, deroule-partie, guide-du-mj, en priorité ;
- ce qu'Oliv doit faire maintenant : la liste de la section 11 (la même que « Après le chantier » de
  `docs/prompts/gl-decisions/OLIV.md`).

**Reprise.** Chaque commit de document laisse le dépôt vert : on peut s'arrêter après n'importe lequel. Ordre fixe :
fin-2.1 ; essentiel-mj ; deroule-partie (avec `READING_ORDER`) ; les neuf documents de fin-2.3 dans leur ordre ; les
skills ; le test de vocabulaire (en dernier : il échoue tant qu'un document n'est pas réécrit). Si tu t'arrêtes,
écris dans ton rapport, état `partielle` : « à reprendre au document … », et ce qui reste. Une reprise recommence
par relire le dernier document commité.

## 8. Contrats de test changés

- Ordre de lecture des docs : `essentiel-mj` puis `deroule-partie` en tête ; `presentation` n'est plus le premier
  de la liste servie (`tests/gl-reference-docs.test.js`).
- La liste des documents ne contient plus `audit-mecaniques-2026-08` ; elle gagne deux documents.
- Nouveau test de contenu : `tests/content/gl-reference-docs-vocabulaire.test.js`.

## 9. Docs à mettre à jour dans ce lot

Les onze documents de `docs/reference/gl/`, `docs/reference/README.md`, les sept skills. Entrée de journal :
`changelog.d/gl-decisions-fin-2.md` (« Modifié — G&L : documentation de référence réécrite au présent, deux
documents pour le prof »).

## 10. Hors périmètre

- Toute règle, route, réglage par défaut, donnée de catalogue : ce lot n'en change aucun.
- Les règles v4 et les docs techniques `docs/GL_*.md` : lot fin-1.
- Le retrait du code du jeu classique : à part, après deux séances jouées.
- Les docs ForêtMap (`docs/reference/foretmap/`, `docs/reference/plan/`…).
- `.cursor/rules/**` et `.cursor/skills/**` : non demandés ; signale dans ton rapport ce qui y est devenu faux.
- Corriger un libellé d'écran ou un comportement : dis-le en « ⚠️ » et dans ton rapport.

## 11. Pour Oliv

**À relire** : « L'essentiel du maître du jeu », « Déroulé d'une partie », le guide du maître du jeu, en priorité ;
la ligne « Quatre mondes » reformulée ; les passages retirés ; le fait que la doc de référence ne peut plus nommer
l'ancienne troisième surface (le test la refuse) ; les captures, qui montrent les replis tant que la médiathèque n'a
pas les images.

**Après le chantier, par Oliv** (liste complète, dans l'ordre) :

1. **Migrations.** Après le dernier déploiement, sur le serveur : `node scripts/db-migration-status.js`. Attendu :
   aucune migration « en retard ». S'il y en a une : ne synchronise rien et dis-le à Claude.
2. **Catalogues.** Synchroniser par le connecteur : `gl_tenir_catalogues`, action `sync`, d'abord en `dry_run`, puis
   pour de bon avec le code à six chiffres reçu par e-mail. Catalogues changés par le chantier : `chasse-zones`,
   `badges`, `sorts`, `olu-lignes`, `peripeties`, `passeur-plateau4`, `qcm-feedbacks-zones`, `questions-lecture`,
   `missions`, `parures`, `defis-cases`, et tout autre catalogue qu'un rapport de lot signale. Les questions de zone
   des plateaux 2 à 4 sont déjà réécrites en prod (24/11) : cette synchro n'écrase aucun retour d'auteur.
3. **Zones du plateau 1.** Ensuite seulement : tracer les huit zones du plateau 1 sur le dessin (éditeur de zones),
   puis demander à Claude de les reporter dans `data/gl/tenir/chasse-zones.json`, pour qu'une future synchro ne les
   écrase pas. Tant qu'elles restent des gabarits, la fouille est une loterie.
4. **Médiathèque.** Téléverser, sous leurs clés (nom du fichier = clé) : les 35 images « Table de jeu »
   (`GL_table_de_jeu_2026-11-24_v3.zip`) et les 6 images « Mon sac » (`GL_icone_sac`, `GL_sac_gnome_ferme`,
   `GL_sac_gnome_ouvert`, `GL_sac_licorne_ferme`, `GL_sac_licorne_ouvert`, `GL_veillee_toile`). Sans elles tout
   marche, en replis. `GL_table_bois` se pose en couverture, pas en motif répété. L'icône « plume » est
   `GL_plume_chaud`. `GL_icone_voile` est le repère fixe du voile, là où un écran le nomme (décision du 24/11, 14 h 43). `GL_icone_oiseau` et `GL_icone_seuil` ne sont appelées nulle part.
5. **Oiseau témoin.** Poser `gameplay.oiseau_temoin_pack_id` = l'identifiant de catalogue du pack « Oiseau noir »
   (`srv-c45f4983-ae08-4607-8e75-dd5659bc2793` en prod le 24/11). Ses fichiers s'appellent `kraavoleur_*.png` : un
   élève ne peut le voir que dans les outils de développement du navigateur ; les renommer au studio pour zéro risque.
   Le pack n'est plus proposé aux équipes depuis le lot ecrans-10.
6. **Intro.** Poser `docs/prompts/gl-decisions/sources/content-intro.json` dans le réglage `content.intro` (par le
   connecteur, sur demande, ou par le panneau « Intro » de l'admin), puis « Revoir l'intro ».
7. **Lexique.** Remettre `gameplay.lore_spoiler_max_level` à `recit` : les fiches de récit sont propres et ne
   s'affichent qu'à partir de leur monde (lot contenu-5).
8. **Parties.** Créer une **partie neuve** pour la séance 1 : l'escalier à cinq marches ne vaut que pour les parties
   neuves, les parties 16 et 17 sont des tests. Ranger la « Partie découverte test » (id 16) et clore la partie 10
   (« Partie découverte 2 », dernière partie de l'ancien jeu en cours).
9. **Un tour d'essai**, sur une partie neuve de la classe de démonstration, projection ouverte :
   - au tableau : un tour complet depuis le bloc « Équipe active » (question, fouille, lecture), « Le voile avance »
     après la dernière équipe ; une tablette affiche « Le tour se joue au tableau. » ;
   - en tablettes : la mascotte saute de case en case ; la phrase d'Olu est en projection et sur la tablette ; la
     désigner trouvée : la correction s'affiche ; deux écrans pour une équipe : la ligne d'Olu de la main ;
   - une question de case et une question de zone : le plateau est flouté derrière et à côté, plus rien ne s'y lit ;
     il redevient net après la réponse ;
   - deux tours clos le même jour : une seule marche ; Relance n'apparaît nulle part ;
   - une bonne réponse à une question de case : la caravane avance d'une case (de trois si l'équipe est sous le
     voile), puis « Sondez le plateau » (une sonde par bonne réponse) ; une sonde dans une zone dit « chaud », n'ouvre
     rien, et laisse les deux fouilles intactes ;
   - une fouille : l'écran appelle l'Éclaireuse ou l'Éclaireur ; l'oiseau se pose et laisse une plume ;
   - réglages « Tenir à deux » : plus de case pour couper la mouture, plus d'« Hybride » ; seules « Tablettes » et
     « Tableau » sont proposées ;
   - « Mon sac » d'un compte d'élève : fermé pendant le tour, ouvert hors du tour (« Ce soir, tu peux… ») ;
   - « Mon journal » : un article qui fait monter le compte montre le « +1 » ; une fiche d'espèce déjà étudiée par
     d'autres dit combien de la caravane y sont passés, sans prénom ;
   - au premier lancement de la projection, toucher « Activer le son » ; aucune tablette ne joue de musique ;
   - regarder la projection du fond de la salle : symboles gravés, plumes, fanions lisibles à 8 m ?
10. **Les marges du copiste**, sur la partie de démonstration : tenir une page → le bloc « Les marges du copiste »
    apparaît dans « Mon sac » d'un compte d'élève, avec « Le café » ; clore la partie → rien de plus ; « Marges du
    copiste », puis « Ouvrir l'enveloppe « baobab » » → tout le premier monde et l'enveloppe, aussi sur le compte de
    l'élève.
11. **Biomes** (aucune synchro) : ouvrir les biomes des plateaux 1 à 4 ; chaque onglet montre son biotope puis sa
    biocénose, sous « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » ; au plateau 4, la
    limite des arbres est dans la taïga. Vérifier qu'une image n'apparaît pas deux fois dans un onglet.
12. **Histoire** (aucune synchro : la migration suffit) : ouvrir l'Histoire du plateau 1 avec un compte d'élève de la
    classe de démonstration ; images et légendes, avertissement, une mauvaise réponse (« Pas encore », l'heure), puis
    une bonne réponse une heure plus tard (la question a tourné : ce n'est pas la même) ; la même page depuis la
    tablette d'équipe. Relire les textes des quatre plateaux dans l'éditeur.
13. **Bilan Team Spirit** : enregistrer un bilan avec une carte retirée, le rouvrir : la carte est toujours retirée.
14. **Vitrine** : ouvrir `?demo=parents` dans un navigateur privé : « La nature » montre les Tropiques africains,
    aucun message d'administration, une seule visite d'Olu par onglet.
15. **Lexique et pages servies** : avec un compte d'élève de démonstration au plateau 1, le lexique du voyage ne nomme
    aucun visage ; relire « Les règles du jeu » et les grimoires dans l'app (rôles échangés, « Mon sac »).
16. **Carnet de Sélène** : relire dans l'éditeur `ep-IV-03` à `ep-IV-07` (la boîte de la séance 1) et `ep-VI-04` ;
    vérifier que `ep-I-13` et `rep-II-05` sont inactives.
17. **Documentation dans l'application** (onglet « Contenus ») : les deux nouveaux documents en tête, aucune surcouche
    ancienne qui masquerait un fichier (« Réinitialiser » sinon). Relire « L'essentiel du maître du jeu » et « Déroulé
    d'une partie » avant la répétition générale ; les imprimer si utile.
18. **Ne plus réimporter les tableurs de juin** : ni les chapitres avec une colonne « histoire » remplie
    (`lib/glChaptersImport.js` réécrit `story_markdown` ; les textes font foi dans `data/gl/histoire/`) ; ni le corpus
    QCM des biomes (`lib/glQcmImport.js` remettrait l'ancienne version des 36 questions de zone réécrites les 23 et
    24/11 ; la base fait foi) ; ni le lexique lore (`lib/glLoreGlossaryImport.js` : repartir de l'export de l'app) ;
    ni les feuillets, ni les questions de lore. S'il faut un jour importer des questions de lore : demander ensuite à
    Claude de revérifier qu'aucune question active ne cite le tiers `secret`.
19. **Avant le plateau 2** : rallumer le chapardeur, si tu le veux (`gameplay.tenir_chapardeur` → `true`) ; il est
    coupé pour le chapitre 1, et c'est lui qui fait parler Olu de l'oiseau, sans le nommer.
20. **Cartes à imprimer** : les planches de `Cartes_GL_24nov.zip` (26 cartes, deux PDF A4 recto verso ; la ligne « Au
    tour de jeu » des cartes Éclaireuse, Éclaireur, Opératrice et Opérateur y est recomposée pour l'échange des
    rôles).
21. **La boîte** : le mot de Sélène avec un rond de café au dos ; la grande main grasse sur la plaque (à essayer à la
    buée avant) ; les quatre enveloppes, à la main (textes dans `docs/prompts/gl-decisions/sources/copiste-notes.md`) ;
    la lettre sous le double fond.
