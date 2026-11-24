# Lot fin-1 — Décisions consignées et règles v4

> Chantier G&L « décisions » · vague 3 · couloir fin · charge moyenne · banc : complet
> Branche : `claude/gl-decisions-fin-1` · Attend : tous les lots des vagues 1 et 2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

Rien ne change à l'écran. Ce lot écrit ce que le chantier a décidé et livré : le § 0 des règles, puis les règles en
**v4**, au présent, vraies pour le code fusionné ; les cases de l'audit du 18/11 cochées ; un résumé de l'audit de la
partie 16 ; les docs techniques G&L alignées. Il rend aussi les **mesures finales du banc** (avant / après) et le
tableau de toutes les décisions : livrée, ou écartée et pourquoi. Aucune règle, route, table ni réglage ne change.

## 2. Décisions d'Oliv que ce lot applique

**a. Décisions dont ce lot écrit le texte** (règles, ligne du § 0, case d'audit).

| Décision | Date | Ce qu'elle dit |
| --- | --- | --- |
| 1 du prompt | 19/11 | Un élève en Retrait **reçoit** la gemme d'une page tenue par son équipe. |
| 2 du prompt | 19/11 | Au palier, la jauge de Lumière repart à 0. |
| 7 du prompt | 19/11 | La Trame apporte un palier de Lumière par chapitre au plus. |
| 9 du prompt | 19/11 | Les choix de la PR 4 de l'ensemble unifié sont validés. |
| 12 du prompt | 19/11 | Le pseudo de l'auteur d'une Lettre est caché en projection et aux autres équipes. |
| 15 du prompt | 23/11 | L'erreur du jour d'Olu se voit en projection et sur la tablette d'équipe. |
| 16 du prompt | 23/11 | « Tenir à deux » est **le** jeu de G&L : plus de porte vers le jeu classique. |
| 17 du prompt | 23/11 | Question de case : une case de plus, sans relance (ajustée par la décision 37 du prompt). |
| 18 du prompt | 23/11 | Correctifs de la partie 16 : horodatages, erreur d'Olu sans répétition, fin de l'ordre. |
| 19 du prompt | 23/11 | Escalier en cinq marches, une marche par jour au plus. |
| 20 du prompt | 23/11 | Page témoin : la zone endormie la plus avancée derrière la dernière équipe. |
| 21 du prompt | 23/11 | « Corbeau », nom commun, permis dans les pages de Sélène ; `ep-VI-02` sort du Passeur. |
| 23 du prompt | 23/11 soir | Un seul écran d'équipe, partout ; au tableau, la console monte l'écran de l'équipe active. |
| 24 du prompt | 23/11 soir | Le sort Relance est retiré ; grimoire à 18 sorts. |
| 25 du prompt | 23/11 soir | Deux surfaces proposées, « Tablettes » et « Tableau » ; le moteur garde l'hybride. |
| 26 du prompt | 23/11 soir | Toute la documentation G&L réécrite au présent pour « Tenir » seul (règles v4 ici). |
| 37 du prompt | 24/11 | Question de case : une case, trois sous le voile, et une sonde ; fouilles inchangées. |
| « Mon sac » | 24/11 | L'espace personnel de l'élève s'appelle « Mon sac », plus « Le Seuil » ; le code ne bouge pas. |

Mots d'Oliv qui figurent dans les textes : décision 37 du prompt, « Je suis ton avis. » ; « Mon sac », « il faut
renommer le module de l'app qui s'appelle le seuil. Cela est source de confusion et contredit le passage d'un plateau à
un autre », puis « Je valide ».

**b. Le registre.** `docs/prompts/gl-decisions/DECISIONS.md` porte les 98 décisions du chantier, `DEC-001` à
`DEC-098` : numéro d'origine et source, date, texte, mots d'Oliv, provenance, lot et étape, statut. C'est ta liste de
contrôle : **tu ne le modifies pas**, tu n'en recopies pas le texte. Cite une décision par son identifiant et son
numéro d'origine, toujours avec sa source (il y a deux « 34 » et deux « 37 »). Il fait 120 Ko : lis ses colonnes
utiles par un petit script plutôt qu'en entier. Séries : 1 à 27, 34 et 37 du prompt ; H1 à H5 et B1 ; QV1 à QV5 de
l'addendum 1 ; I1 à I10 de l'addendum 2 ; 28 à 33 et 42 de l'addendum 3 ; 34 à 41 de l'addendum 4 ; des décisions
sans numéro (mascottes, vérité des cases et vent, réglages du Marché et du chapardeur, écritures en prod,
orchestration) ; l'après-midi du 24/11 (`DEC-084` à `DEC-098`).

**c. Décisions du 24/11 après-midi dont ce lot écrit la ligne au § 0** (toutes d'Oliv ; absentes des anciens textes).

| Registre | Heure | Décision |
| --- | --- | --- |
| `DEC-086` | 13 h 53 | Le « +1 » de « Mon journal », visible quand un article fait monter le compte. |
| `DEC-087` | 13 h 53 | Les traces de passage : combien de la caravane sont déjà passés ; ni prénom ni score. |
| `DEC-088`, `DEC-089` | 14 h 16 | « Mon sac » remplace « Le Seuil » ; deux états (fermé au tour, ouvert à la veillée). |
| `DEC-092` | vers 14 h 35 | Escalier à cinq marches : parties neuves seulement, aucun code de rattrapage. |
| `DEC-093` | vers 14 h 35 | Une sonde **par bonne réponse** de case, à utiliser dans le tour. |
| `DEC-097` | vers 14 h 40 | Histoire : après le délai d'une heure, la question tourne. |
| `DEC-098` | 14 h 43 | L'icône du voile est un repère fixe, posé à côté des mots ; le voile se montre en pâlissant. |

Les autres décisions de l'après-midi (fusion sur le seul banc local, vagues et prompt unique, mission `mis-13`, test
propre aux notes du copiste, pack « Oiseau noir ») ne demandent pas de ligne au § 0. Mots d'Oliv : 13 h 53, « ok » ;
14 h 43, « on garde l'image de voile ».

**Choix par défaut posés par Claude** (appliqués sans demander ; Oliv peut les retirer) :

- les règles deviennent la **v4** : même contenu de règles, réécrit au présent ; le tableau des décisions (§ 0) part
  en annexe « Historique des décisions », en fin de document ;
- au § 0, puis dans l'annexe, vont les décisions qui touchent le jeu ; « fusion sur le seul banc local » et
  « intégration par vagues » sont des décisions de chantier : rapport seulement ;
- le tableau des décisions dit « non livrée » là où l'ancien texte disait « écartée » : dans le registre, ce mot
  désigne une proposition retirée ;
- la ligne du 24/11 sur le copiste dit « dans « Mon sac » » là où l'ancien texte disait « au Seuil » ;
- `docs/GL_GAMEPLAY_PRESETS.md` et `docs/GL_FEUILLET_ZONES.md` reçoivent un encart en tête, pas une réécriture ;
- le nouvel audit prend sa ligne dans l'index `docs/audits/README.md` (convention du dépôt, `CLAUDE.md`).

## 3. Fichiers

- **À toi** : `docs/GL_TENIR_A_DEUX_REGLES.md` ; `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md` (§ 4 seulement) ;
  `docs/audits/README.md` (une ligne) ; `docs/GL_TENIR_A_DEUX.md` ; `docs/GL_DEFIS.md` ;
  `docs/GL_GAMEPLAY_PRESETS.md` ; `docs/GL_FEUILLET_ZONES.md` ; `docs/GL_ARCHITECTURE.md` ;
  `docs/GL_CARNET_JOUEUR.md` ; `docs/API.md` (parties G&L ; ce fichier est hors Prettier) ;
  `tests/gl-ensemble-unifie-gains.test.js`.
- **Du chantier, en lecture seule** (sur la branche d'intégration, absents de `main`) :
  `docs/prompts/gl-decisions/DECISIONS.md` (le registre), `docs/prompts/gl-decisions/ETAT.md` (la mémoire de
  l'orchestratrice : états des lots, migrations, mesures de départ du banc), les rapports des autres lots. Tu
  n'écris que `docs/prompts/gl-decisions/rapports/fin-1.md`.
- **Nouveaux** : `docs/AUDIT_GL_PARTIE16_2026-11-23.md`.
- **D'un autre couloir, modification minimale permise** : un test ou un fichier de code d'un lot déjà fusionné,
  seulement pour réparer un petit échec trouvé par les vérifications de la section 7 ; dis-le dans ton rapport. Un
  échec plus gros : écris-le, l'orchestratrice décide d'une reprise.
- **Ne touche pas** : `docs/reference/**`, `lib/glReferenceDocs.js`, `.claude/skills/**` (lot fin-2) ;
  `docs/GL_TABLE_DE_JEU.md` (lot ecrans-7) ; les documents historiques : les autres `docs/AUDIT_*`,
  `docs/prompts/GL_ECRANS_DE_SEANCE_*.md`, `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`,
  `docs/GL_UNIFIE_TABLETTE_SCIENCE_DEFIS_PROMPT.md`, `docs/GL_EQUIPES_AUTO_PROMPT.md` ; les fiches, les sources et
  les règles communes du chantier ; `CHANGELOG.md`.

## 4. Étapes (un commit par étape, dans cet ordre)

Avant tout : lis **tous** les rapports `docs/prompts/gl-decisions/rapports/*.md`. Note pour chaque lot : état,
étapes écartées, « Pour le § 0 des règles », « Choix faits sans demander », migrations, banc, « À relire par Oliv »,
« À faire par Oliv après la vague ». Un lot resté `bloquée` ou `partielle` : la doc décrit le code **réellement
fusionné**, et ton rapport dit ce qui manque.

### fin-1.1 — Retrait et gemme de la page tenue : le texte rejoint le code (ex-étape 1)

- **Constat vérifié** (lignes de `b8b5344`, qui auront bougé) : `docs/GL_TENIR_A_DEUX_REGLES.md` dit « membre
  présent » à trois endroits, sans rien dire d'un élève en Retrait : § 0, ligne M19 (l. 38) ; présences, § 3 (l. 99 :
  « le gain d'une page tenue ne va qu'aux membres présents ») ; § 6 (l. 163). La règle du pot est au § 8 (l. 182 :
  réparti entre les membres « présents et non en retrait »). Le code donne déjà la gemme :
  `lib/glChasse.js › lecteursDuGainTx` (l. 1051) n'écarte que les absents du tour. Aucun code à changer.
- **Changement attendu** : à chacun des trois endroits, préciser : « membre présent, **Retrait compris** : la
  conduite ne passe par aucune monnaie ». Garde la règle du pot (un membre en retrait ne verse pas). Payer et
  recevoir ne suivent pas la même règle, c'est voulu : dis-le en une phrase.
- **Tests** : ajoute à un test existant de la page tenue le cas « élève en retrait reçoit la gemme », s'il n'y est
  pas. Candidat : `tests/gl-ensemble-unifie-gains.test.js` (« page tenue au tour : +1 gemme aux lecteurs
  présents… », l. 70).
- **Critère d'acceptation** : les trois passages et le § 8 se lisent sans contradiction ; le test est vert.

### fin-1.2 — Décisions consignées (ex-étape 9)

- **Constat vérifié** : `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`, § 4 « Décisions à trancher » : 14 cases,
  l. 77 à 113, toutes encore `[ ]`. Elles suivent l'ordre des décisions 1 à 14 du prompt : page tenue et Retrait (1) ;
  jauge de Lumière au palier (2) ; pistes qui donnent la réponse (3) ; `olu-pf-main` (4) ; badge « Bon rangeur » (5) ;
  ordre des cartes des « fils » (6) ; Lumière et défis de la Trame (7) ; plafond de la bourse (8) ; choix de la PR 4
  (9) ; noms à confirmer (10) ; « Regarde la piste de ton professeur » (11) ; pseudo de l'auteur d'une Lettre (12) ;
  message de la version d'état (13) ; anciennes questions de zone sur une installation neuve (14).
- **Changement attendu** :
  1. **Audit du 18/11, § 4** : coche chaque case avec « Oliv, 19/11 : » et sa décision (texte dans le registre).
     Pour le plafond : « décision après deux séances réelles ; levier : prix des sorts ». Ne coche pas le § 5.1
     (relecture scientifique).
  2. **Règles, § 0** : ajoute, dans cet ordre :
     - une ligne datée du **19/11** : décisions 1, 2, 7, 9 et 12 du prompt ;
     - une ligne du **23/11** : décisions 15 à 21 du prompt ; pour la 16, le texte est : « Tenir à deux est le jeu
       de G&L : plus de retour au jeu classique depuis l'interface ou l'API ; le code du classique sera retiré après
       deux séances » ;
     - une ligne du **23/11 au soir** : décisions 23 à 25 du prompt (« un seul écran d'équipe ; le sort Relance est
       retiré ; deux surfaces, tablettes et tableau ») ;
     - « 23/11 : l'Histoire de chaque chapitre se valide par chaque élève, depuis son compte, avec une question ; le
       délai d'une heure après une erreur est annoncé » ;
     - « 24/11 : une bonne réponse à une question de case avance d'une case, de trois sous le voile, et donne une
       sonde du plateau (chaud, tiède, froid, sans question ni page) ; les fouilles ne changent pas » ; ajoute :
       « une sonde par bonne réponse, à utiliser dans le tour » ;
     - « 24/11 : les questions de lore peuvent dire « corbeau », jamais son nom ni son cri ; un défi de la Trame ne
       donne jamais de page vierge » ;
     - « 24/11 : gel levé ; le copiste parle par ses notes dans « Mon sac » et par les enveloppes de la boîte » ;
     - « 24/11 : direction artistique, table de jeu ; rôles échangés : l'Éclaireuse ou l'Éclaireur fouille,
       l'Opératrice ou l'Opérateur répond et sonde » ;
     - une ligne du **24/11 après-midi**, à écrire d'après le registre (section 2, c) : « Mon sac », en deux
       états ; le « +1 » de « Mon journal » ; les traces de passage ; l'escalier pour les parties neuves seulement ;
       la question d'Histoire qui tourne ; l'icône du voile, repère fixe ;
     - puis les lignes « Pour le § 0 des règles » des rapports de lot qui n'y seraient pas encore. Si une ligne d'un
       rapport contredit une ligne ci-dessus, garde celle qui décrit le code fusionné, et signale-le.
  3. **Crée `docs/AUDIT_GL_PARTIE16_2026-11-23.md`** : un résumé d'une page, à partir de la matière ci-dessous et
     des rapports. Il porte en tête le constat « au tableau, aucun chemin de fouille ni de lecture » et sa
     correction. Ajoute sa ligne à `docs/audits/README.md`.
  4. **Tableau des décisions**, dans ton rapport : pour chaque ligne du registre au statut `à coder`, son état
     final : `livrée` (lot, commit de fusion lu dans `ETAT.md`) ou `non livrée` (raison : étape écartée, lot bloqué).
     Les statuts `fait en prod` et `hors chantier` se recopient. Une décision qu'un rapport de lot rapporte et que
     le registre n'a pas : ajoute-la au tableau et signale-la.

  **Matière du résumé de l'audit.** La partie 16 (« Partie découverte test ») a été jouée au tableau le 23/11 : trois
  tours, **0 fouille, 0 question de case, 0 sort**. Constat → correction (lot) :
  - au tableau, aucun chemin de fouille ni de lecture : l'élève n'a aucun geste, son écran ne montre que des boutons
    grisés, la console n'offre ni « Fouiller » ni « Lire », la question de case n'est jamais posée → un seul écran
    d'équipe partout ; dans la console, le bloc « Équipe active » ; « Équipe suivante » absent tant qu'une question
    est due (ecrans-4) ;
  - tour 2 : début 14:22:43, fin 13:25:56, soit −57 min (`NOW()` de MySQL mêlé à un `new Date()` en UTC) → les deux
    colonnes s'écrivent avec `NOW()` ; une durée négative vaut `null` dans le diagnostic (moteur-1) ;
  - l'erreur du jour d'Olu se répète (tirage avec remise) → tirage sans remise dans la partie (moteur-1) ;
  - après la dernière équipe, « Équipe suivante » rend la main à la première → 409 `FIN_DE_L_ORDRE` (moteur-1) ; à
    la place du bouton, « Le voile avance » (ecrans-4) ;
  - une bonne réponse de case valait environ huit cases (une case et une relance ; 16 cases question sur 43 au
    plateau 1) : le savoir payait en mouvement → une case, trois sous le voile, une sonde, plus de relance
    (moteur-4) ;
  - escalier : quatre lignes « première fois » d'Olu à la même ouverture, et deux tours le même jour ont ouvert deux
    marches → cinq marches, une par jour (12 h), parties neuves seulement (moteur-3) ;
  - page témoin : toujours `cz-p1-05` (rang 5), loin derrière les équipes → la zone endormie la plus avancée
    derrière la dernière équipe (moteur-3) ;
  - Relance, seul sort qui fait attendre une case → retiré, grimoire à 18 sorts (moteur-3) ;
  - journal : 20 lignes pour les pages d'ouverture ; un tour resté ouvert d'une séance à l'autre → une ligne ; un
    bandeau « Le tour du {date} est resté ouvert. Le clore ? » (moteur-3) ;
  - Passeur du plateau 1 : `ep-VI-02` écrit le cri de l'oiseau ; `ep-V-01`, gagnée par la fiche `SP0027`, est relue
    par le Passeur → `ep-VI-02` retirée ; une page du Passeur n'est ni la page d'une zone ni gagnée par une fiche
    (contenu-2) ;
  - erreurs d'Olu du plateau 1 fausses ou trop peu nombreuses, péripéties au masculin, retours de trois questions de
    zone → catalogues corrigés (contenu-1) ;
  - passé en prod sans code les 23 et 24/11 : 61 cases question au texte intermédiaire ; 12 cases du plateau 1 au
    « vous » ; 8 puis 28 questions de zone réécrites ; dix questions de case hors tirage ; Passeur du plateau 1
    réordonné ; Marché fermé pendant le tour ; chapardeur coupé.

- **Tests** : aucun.
- **Critère d'acceptation** : aucune case `[ ]` au § 4 de l'audit ; chaque décision du registre qui touche le jeu
  se lit au § 0 ; les 98 lignes du registre ont un état dans ton rapport ; `npm run format:check` vert.

### fin-1.3 — Deux surfaces : vérification seulement (ex-étape 1 de l'annexe C du prompt, la même que l'ex-étape 27)

- **Constat** : le lot ecrans-1 a fait ce changement. Ici, on vérifie ; on ne refait rien.
- **À vérifier sur le code fusionné** :
  - `src/gl/components/mj/GLTenirProfilPanel.jsx` (`SURFACES`) et
    `src/gl/components/settings/GLTenirSettings.jsx` ne proposent que deux surfaces, aux libellés « Tablettes (les
    équipes jouent en même temps) » et « Tableau (une équipe à la fois, le prof porte les gestes) » ;
  - une partie déjà en `hybride` affiche l'option désactivée « Hybride (ancienne valeur) » ; aucune migration ;
  - intacts : `lib/glSettings.js` (`TENIR_SURFACES`), le moteur, `src/shared/glTenirPermissionsCore.js`, les
    branches `hybride` de `src/gl/components/mj/GLTourScreen.jsx`, les tests du moteur qui jouent l'hybride ;
  - `tests-ui/gl/GLTenirSettings.test.jsx` porte « les sélecteurs ne proposent que tableau et tablette » et « partie
    hybride → option désactivée affichée » ;
  - la capture des deux sélecteurs existe sous `docs/captures/gl-decisions/ecrans-1/`.
- **Critère d'acceptation** : tout y est → aucun commit, une ligne « vérifié » dans ton rapport. Un point manque →
  écris-le (« à reprendre par ecrans-1 »), ne le code pas ici.

### fin-1.4 — Règles v4 (ex-étape 2 de l'annexe C du prompt)

- **Constat vérifié sur `main`** (v3, 343 lignes) :
  - titre « Règles de référence v3 », daté du 17 novembre, alors que le texte contient les écrans du 20 au 22/11 ;
  - § 1, point 9 (l. 59) : « le client grise », contre le § 3 (l. 105) et le § 15 : jamais un bouton grisé ;
  - § 2 (l. 72) et ligne M12 (l. 32) : l'hybride « n'est plus proposée », vrai seulement depuis le lot ecrans-1 ;
  - § 3 (l. 116) et § 15 « Réglages » : dés `physique` au tableau, alors que le réglage
    `tenir_des_mode_par_surface` (`lib/glSettings.js` ; lu par `lib/glTenir.js`, où la surcharge `des_mode` prime)
    vaut `serveur` partout en prod ; ce réglage n'est écrit nulle part dans les règles ;
  - § 13 : l'ancien texte y voyait « attend la PR 3 » ; **introuvable** sur `main` : relis le § 13 ; s'il ne promet
    rien d'une PR à venir, note « écarté : introuvable » ;
  - § 14, § 15 et ligne L2 du § 0 : « le Seuil » comme nom de l'espace personnel de l'élève ;
  - § 18 : « Attendus de livraison » des cinq PR, de l'histoire.
- **Changement attendu** :
  1. Titre « Règles de référence v4 », date du jour, et une phrase : « v4 = v3 réécrite au présent ; aucune règle
     changée par cette réécriture. »
  2. Garde le plan **§ 1 à § 17 et leurs numéros** (des commentaires du code citent les § 1, 3, 4 et 15).
     L'ancien § 0 devient l'annexe A « Historique des décisions », avec les lignes de l'étape fin-1.2. L'ancien
     § 18 part dans la même annexe, résumé en trois lignes.
  3. Corrige : § 1, point 9, « le client grise » → « l'écran masque » ; les surfaces (deux proposées, l'hybride
     gardée par le moteur pour les anciennes parties) ; les dés : `des_mode_par_surface` décrit au § 3 et listé au
     § 15 avec ses valeurs ; le Marché pendant le tour et le chapardeur avec leurs valeurs de prod (« coupé en prod
     depuis le 23/11 »).
  4. Relis chaque phrase « Depuis… », « désormais », « n'est plus », « a disparu » : écris l'état, pas le
     changement (sauf dans l'annexe).
  5. L'espace personnel de l'élève s'appelle « Mon sac » dans tout le corps des règles ; les identifiants du code
     (`seuil`) restent ; l'annexe garde la ligne L2 telle qu'elle fut décidée, la ligne du 24/11 dit le nouveau nom.
  6. Vérifie contre le code fusionné que les règles disent ce que fait le moteur : escalier en cinq marches, une
     par jour ; question de case (une case, trois sous le voile, une sonde, sans relance) ; page témoin ; erreur
     d'Olu visible ; fin de l'ordre ; suite du tour au tableau ; Lumière qui repart à 0 ; un palier de Lumière par
     chapitre pour la Trame, jamais de page vierge ; Relance retiré, 18 sorts ; rôles échangés ; « corbeau », nom
     commun, et les mots du voyage (§ 1) ; les marges du copiste ; l'interrupteur de la table de jeu. Un écart
     restant → « ⚠️ » en fin de section, et dans ton rapport.

  Valeurs de prod à écrire telles quelles (posées par Oliv le 23/11 ; une session ne peut pas les relire) :
  `tenir_marche_pendant_tour` = `false` (le Marché est fermé pendant le tour) ; `tenir_chapardeur` = `false`
  (coupé pour le chapitre 1, à rallumer avant le plateau 2) ; `tenir_surface` = `tablette` ;
  `tenir_des_mode_par_surface` = `serveur` partout ; `tenir_sablier_phase_secondes` = 480 ;
  `tenir_sablier_secondes` = 180 ; `tenir_delai_debat_secondes` = 8.

- **Tests** : aucun test ne lit ce document.
- **Critère d'acceptation** : `grep -n "Depuis\|désormais\|n'est plus\|a disparu"` ne rend que des lignes de
  l'annexe ; les liens relatifs du document mènent à un fichier existant ; `npm run format:check` vert.

### fin-1.5 — Docs techniques G&L à aligner, sans les réécrire (ex-étape 3 de l'annexe C du prompt)

- **Constat vérifié sur `main`** : `docs/GL_TENIR_A_DEUX.md` dit « deux monnaies privées » (l. 5) et compte
  **7** mentions des cœurs (l'ancien texte en comptait 6) ; `docs/GL_DEFIS.md` en compte 5 ;
  `docs/GL_GAMEPLAY_PRESETS.md` et `docs/GL_FEUILLET_ZONES.md` présentent des fonctions du jeu classique comme
  courantes. Les lots ecrans-1 et moteur-3 ont déjà touché certains de ces docs : lis leur état avant d'écrire.
- **Changement attendu** :
  - `docs/GL_TENIR_A_DEUX.md` : « une monnaie », plus de cœurs dans ce qui décrit « Tenir » ; section « Mode
    « tenir » d'une partie » alignée sur la décision « seul jeu » ; vérifie que le renvoi vers
    `docs/GL_TABLE_DE_JEU.md` (lot ecrans-7) y est, ainsi que dans `docs/GL_ARCHITECTURE.md` ;
  - `docs/GL_DEFIS.md` : retire les cœurs ; vérifie les défis contre le code ;
  - `docs/GL_GAMEPLAY_PRESETS.md`, `docs/GL_FEUILLET_ZONES.md` : un encart en tête, « Fonction du jeu classique,
    plus proposée depuis le 23/11 ; retirée avec le code du classique », le reste inchangé ;
  - `docs/GL_ARCHITECTURE.md`, `docs/GL_CARNET_JOUEUR.md`, `docs/API.md` (parties G&L) : cherche « cœur »,
    « hybride », « deux monnaies », « prologue », « Plume », « Nommer », « Le Seuil » comme nom d'écran, et toute
    promesse d'un retour au classique ; corrige ce qui décrit « Tenir » à tort. Ne réécris pas ces docs.
- **Tests** : aucun.
- **Critère d'acceptation** : `grep -n -i "deux monnaies"` vide dans ces docs ; chaque « cœur » restant décrit
  l'ancien jeu et le dit ; aucun document historique modifié.

## 5. Migration

Aucune. Ton rapport reprend, pour tout le chantier, la table « étiquette `mig-…` → fichier » (`ETAT.md`, section
« Migrations », recoupée avec les rapports de lot).

## 6. Données et sources

- `docs/prompts/gl-decisions/rapports/*.md` : la matière du § 0 et du rapport final.
- `docs/prompts/gl-decisions/DECISIONS.md` : le texte de chaque décision. `docs/prompts/gl-decisions/ETAT.md` :
  états et commits de fusion des lots, migrations, et « Mesures de départ du banc » (avant le chantier).
- Aucun fichier de `sources/` n'est à lire pour ce lot.

## 7. Vérifications propres au lot

Sur le code fusionné, toutes celles de la section 6 des règles communes, plus :

```bash
flock /tmp/gl-decisions-e2e.lock npx playwright test --project=chromium e2e/gl-*.spec.js e2e/visit-mascot.spec.js
npm run gl:sim:db
npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14
npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14
npm run gl:sim -- --scenario all --runs 3 --seed 11
DB_NAME=foretmap_fin_1_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run
```

**Mesures finales du banc** (c'est ce lot qui les rend). Pour chaque mesure : le départ (`ETAT.md`), les jalons
(rapports des lots), le final (ta passe).

- Reculs de voile dus à la Lumière, par chapitre. Jalons : après la jauge qui repart à 0 (moteur-1) ; après le
  palier unique de la Trame (moteur-5).
- Écart de cases au camp ; part des équipes sous le voile ; pages trouvées ; carnet complet. Jalons : avant et après
  la question de case récompensée et la sonde (moteur-4).
- Dépense de gemmes par élève et par chapitre. Jalons : avant et après le retrait de Relance (moteur-3).

Une alerte (seuils des règles communes) : dis quelle décision l'explique. Inexpliquée : état `bloquée`, sans toucher
aux réglages.

**Rapport final attendu** (`docs/prompts/gl-decisions/rapports/fin-1.md`, en plus des sections communes) :

- le **tableau des décisions** (les 98 lignes du registre) : livrée (lot, commit de fusion) ou non livrée (raison) ;
- les **« choix faits sans demander »** : ceux que les fiches posent et ceux des sessions (par exemple : source des
  badges ; formes doubles des 13 titres ; texte de `olu-pf-main` gardé ; `cz-p3-04` vers la fiche du chêne ; « Une
  bêtise s'est glissée. Qui la trouve ? » ; place de l'erreur d'Olu sur la tablette ; voie du canal `espece_pays` ;
  prop d'action pour l'équipe active ; valeurs du fond et du flou de la fenêtre de question) ;
- les **captures** : un dossier `docs/captures/gl-decisions/<lot>/` par lot d'écrans ; signale un dossier vide
  (l'inventaire détaillé et les captures finales sont au lot fin-2) ;
- le **banc** : les mesures ci-dessus, et les alertes ;
- les **comptes** rendus par les lots : tutoiement des cases des plateaux 2 à 4 ; lignes d'erreur d'Olu par plateau ;
  doublons Passeur / zones ; péripéties au masculin des autres plateaux ;
- la synthèse **« À relire par Oliv »** : les textes nouveaux ou changés de chaque rapport (badges, retours « pas
  encore » du Mentorat et de la Lettre, message d'état, erreur d'Olu, portes fermées vers le classique, écran au
  tableau, textes des cases, `olu-14`, `olu-18`, `olu-pf-marche`, `olu-pf-sonde`, « Sondez le plateau », vérité des
  cases et vent, catalogues, bilan Team Spirit, avertissement et délai de l'Histoire, textes et questions de
  l'Histoire, pistes de zones, notes du copiste) ; puis la doc : les règles v4 ici, les docs du prof et le guide au
  lot fin-2 ;
- les **migrations** du chantier (étiquette → fichier) ;
- ce qu'Oliv doit faire maintenant : la liste de la section 11 (la même que « Après le chantier » de
  `docs/prompts/gl-decisions/OLIV.md`), complétée de ce que les rapports ajoutent.

## 8. Contrats de test changés

- `tests/gl-ensemble-unifie-gains.test.js` : un cas de plus (« élève en retrait reçoit la gemme »). Rien d'autre.
- Le titre des règles passe de « v3 » à « v4 » : aucun test ne le lit ; des skills le citent (lot fin-2).

## 9. Docs à mettre à jour dans ce lot

`docs/GL_TENIR_A_DEUX_REGLES.md` (§ 0, puis v4) ; `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md` (§ 4) ;
`docs/AUDIT_GL_PARTIE16_2026-11-23.md` (nouveau) et `docs/audits/README.md` ; les sept docs de l'étape fin-1.5.
Entrée de journal : `changelog.d/gl-decisions-fin-1.md` (« Modifié — G&L : règles « Tenir à deux » v4 et décisions
du chantier consignées »).

## 10. Hors périmètre

- `docs/reference/gl/*`, les deux docs du prof, les skills, la garde de vocabulaire des docs : lot fin-2. La
  réécriture des docs de référence se fait **dans ce chantier**, au lot fin-2, pas « après deux séances ».
- Ce que le chantier ne fait pas, à redire dans ton rapport : plafond et prix (bourse, sorts, parures) et
  `data/gl/tenir/titres.json` (décision d'Oliv, après deux séances réelles) ; relecture scientifique et autres
  lignes d'Olu (§ 5.1 et § 5.3 de `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`) ; tutoiement des cases des
  plateaux 2 à 4 ; `time_zone` de la connexion MySQL (chantier ForêtMap) ; retrait du code du jeu classique et du
  code inerte (`glArriveeSuspendue`, fenêtre de fouille hybride), après deux séances jouées ; mise en évidence de
  la page témoin sur la projection ; photos des questions réécrites (`QCM0009`, `QCM0037`, `QCM0152`), par le
  connecteur, sur décision d'Oliv ; toute écriture en prod.

## 11. Pour Oliv

**À relire** : les règles v4 (surtout l'annexe « Historique des décisions » et les « ⚠️ » restants) ; la ligne du
24/11 après-midi du § 0, écrite par la session ; `docs/AUDIT_GL_PARTIE16_2026-11-23.md` ; le choix de ne pas mettre
au § 0 les deux décisions de chantier (fusion sur le banc, vagues).

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
