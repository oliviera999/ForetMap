# Lot ecrans-4 — Au tableau, un seul écran d'équipe

> Chantier G&L « décisions » · vague 1 · couloir écrans · charge forte, reprise prévue · banc : seuils
> Branche : `claude/gl-decisions-ecrans-4` · Attend : ecrans-3, moteur-4 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Au tableau, la console « Jouer le tour » montre l'écran de l'équipe active : le prof, ou un élève venu au poste,
  lance, répond, sonde, fouille, lit et jette un sort avec les mêmes boutons que sur une tablette. Jusqu'ici, au
  tableau, ni la fouille ni la lecture n'avaient de chemin dans l'interface.
- Il n'y a plus qu'un écran d'équipe : l'ancien écran aux boutons grisés disparaît. Au tableau, les tablettes et les
  comptes d'élèves lisent « Le tour se joue au tableau. ».
- Quand l'équipe a fini : « Équipe suivante » ; pour la dernière : « Le voile avance ». Une question de case due se
  pose avant de passer la main.
- La projection montre la question posée, plateau flouté.
- En « Tenir », le plateau n'ouvre plus ses propres fenêtres ; la piste d'un « pas encore » s'ouvre sur la tablette.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 23 du prompt (« S1 ») | 23/11 soir | Un seul écran d'équipe, partout. `GLTenirEquipeView` disparaît ; les tablettes montrent le même écran qu'ailleurs, avec « Le tour se joue au tableau. » ; au tableau, la console monte l'écran de l'équipe active (bourses masquées). Tranche aussi la question laissée ouverte par le chantier « écrans de séance » (ancien écran gardé au tableau). | — |
| Décision 18 du prompt (part « fin de l'ordre », écran) | 23/11 | Pour la dernière équipe de l'ordre, « Équipe suivante » est absent ; à sa place, « Le voile avance ». Le refus serveur (409 `FIN_DE_L_ORDRE`) est livré par le lot moteur-1. | — |
| Décision 27 du prompt (part « projection ») | 24/11 | Une question ne se lit jamais avec sa réponse visible : la projection floute son plateau pendant une question posée. | « la réponse peut être visible par transparence… l'éléphant se voit bien » |
| Décision I1 de l'addendum 2 | 24/11, 11 h 41 (prise « telle qu'écrite » par la décision 39 de l'addendum 4) | En « Tenir », le plateau n'ouvre plus ses propres fenêtres de question et d'effet : tout passe par la carte du moment. | — |
| Décision I2 de l'addendum 2 | 24/11, 11 h 41 (idem) | Sur la tablette d'équipe, la piste d'un « pas encore » s'ouvre (fiche ou mot, en lecture seule, « Revenir au jeu »). | — |

**Choix par défaut posés par Claude** (appliqués sans demander ; Oliv peut les retirer ; liste-les dans ton rapport) :

- « Équipe suivante » apparaît quand l'équipe active n'a plus de geste ouvert, ou par « Passer » (journalisé, motif
  facultatif).
- « Passer la question » seulement s'il tient sans route nouvelle.
- Bourses masquées sur l'écran de l'équipe active au tableau ; ni « Changer d'équipe », ni badges, ni chimère.
- Projection : le texte de la question seulement si c'est un champ de plus dans une réponse existante ; sinon on
  renonce.
- Le nom de la prop qui fait agir l'écran pour une équipe (`agirPourEquipe`, ou plus clair).
- Piste : feuille en lecture seule, sans bouton d'accusé ; repli sur le nom de la fiche si la session d'équipe ne lit
  pas la route, sans ajouter de route.
- **Posés à l'écriture de cette fiche (24/11), à relire** : l'ordre des étapes (section 4) ; la lecture de « ni
  répondue ni passée » (étape ecrans-4.3) ; le bouton de la dernière équipe qui reprend le geste existant, « Passer à
  la suite » compris quand l'escalier tient le voile fermé (étape ecrans-4.3) ; le plateau du prof laissé tel quel
  (étape ecrans-4.5) ; le scénario de banc `tableau-pur` ajouté (section 7).

## 3. Fichiers

**À toi** (vérifiés sur `main` `d65dca4`) :

- À **supprimer** : `src/gl/components/tenir/GLTenirEquipeView.jsx`, `tests-ui/gl/GLTenirEquipeView.test.jsx`.
- `src/gl/AppGL.jsx`, `src/gl/components/tenir/GLTeamSessionView.jsx`, `src/gl/components/GLGameMasterConsole.jsx`
  (une prop de plus passée à `GLTourScreen`).
- `src/gl/components/mj/GLTourScreen.jsx` : le bloc « Équipe active ». Les lots ecrans-1 (deux props du bilan Team
  Spirit) et moteur-3 (bandeau « tour resté ouvert ») y sont passés : garde leur travail.
- `src/gl/components/tenir/GLTenirEcranEquipe.jsx`, `GLTenirMoment.jsx`, `GLTenirBandeau.jsx`, `GLTenirTiroir.jsx` :
  après ecrans-2 (flou, vent, erreur d'Olu) et moteur-4 (sonde).
- `src/gl/utils/glTenirMoment.js` : les états du bloc (« Équipe suivante », « Le voile avance », question due). Tu es
  le dernier lot de la vague à y toucher ; garde la ligne du vent (ecrans-2) et l'état de la sonde (moteur-4).
- `src/gl/components/tenir/GLProjectionView.jsx` : la question posée et le flou, à côté du bloc de l'erreur d'Olu
  (ecrans-2). Le plateau y a déjà `markerArrivalEnabled={false}` (ligne 279) : n'y change rien.
- `src/gl/hooks/useGlTenirEquipe.js`, `useGlQuestionDeCase.js`, `useGlChasse.js`, `useGlTenirTour.js` (passage du
  `teamId`), `src/gl/hooks/useGlGameRuntime.js` (`markerArrivalEnabled`, ligne 553).
- `src/gl/components/GLSpeciesDetailModal.jsx`, `src/gl/components/GLGlossaryPopover.jsx` (prop de lecture seule).
- `src/gl/styles/gl-tenir.css`.
- Tests : `tests-ui/gl/GLTourScreen.test.jsx`, `GLTeamSessionView.test.jsx`, `GLTenirEcranEquipe.test.jsx`,
  `GLTenirMoment.test.jsx`, `glTenirMoment.test.js`, `GLProjectionView.test.jsx`, `tenir-chaines-interdites.test.jsx`
  (il importe l'ancien écran, lignes 4 et 175), `GLSpeciesDetailModal.test.jsx`, `GLGlossaryPopover.test.jsx`,
  `useGLMarkerArrival.test.js` ; `tests/gl-tour-phases.test.js`, `tests/gl-tenir-question-case.test.js` ;
  e2e `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-projection.spec.js`.
- Docs : voir section 9.

**Nouveaux** : une spec e2e au tableau (nom libre, par exemple `e2e/gl-tenir-tableau.spec.js`) ;
`changelog.d/gl-decisions-ecrans-4.md`, `docs/prompts/gl-decisions/rapports/ecrans-4.md`,
`docs/captures/gl-decisions/ecrans-4/`.

**D'un autre couloir, modification minimale permise** :

| Fichier | Ce que tu y fais, et rien d'autre |
| --- | --- |
| `lib/glTour.js` (couloir moteur) | **Seulement `equipeSuivanteTx`**, après le lot moteur-4 : le refus 409 `QUESTION_DUE`, et la trace de « Passer ». Le lot moteur-1 y a posé `FIN_DE_L_ORDRE` : garde-le. Ne touche ni `bonneReponseDeCaseTx`, ni la sonde, ni rien d'autre du fichier. |
| `routes/gl/games/tenir-tour.js` | Le message de `QUESTION_DUE` dans `ERROR_MESSAGES` (ligne 38) ; un champ facultatif de plus dans le corps de `equipe-suivante` (motif de « Passer ») si tu en as besoin. |
| `routes/gl/games/qcm.js` (`POST /games/:id/qcm/answer`) | « Passer la question » : un champ de plus dans le corps, seulement si c'est faisable sans route nouvelle. |
| `lib/glJournalPresentTenir.js` | Le libellé de journal d'un évènement nouveau (« Passer », question passée), s'il y en a un. |
| `tools/gl-sim/seance.js` (boucle de la surface `tableau`) | Apprendre au robot à ne pas buter sur `QUESTION_DUE`, de la façon la plus simple. |
| `src/gl/components/GLGameBoard.jsx`, `src/gl/hooks/useGLMarkerArrival.js` (lot ecrans-3) | Dans le hook : **seulement le paramètre d'activation** (`enabled`), et de préférence rien : la valeur se règle chez les appelants. Ne touche ni au délai d'ouverture ni aux sauts. Dans le plateau : seulement fermer un chemin qui ouvrirait encore une fenêtre en « Tenir ». |

**Ne touche pas** :

- `src/shared/glTenirPermissionsCore.js` : les élèves restent sans geste depuis leurs appareils au tableau.
- `src/gl/hooks/useGLBoardMascotMotion.js`, `src/gl/utils/glBoardHops.js` (ecrans-3).
- Le fond de `GLQcmPopover` (ecrans-2) : il sert encore aux anciennes parties classiques.
- `GLChasseLayer.jsx`, `GLKraaWitness.jsx` (ecrans-10) ; le son (ecrans-5) ; les libellés à renommer (ecrans-6).

## 4. Étapes (un commit par étape, dans cet ordre)

**Avant toute modification** : la passe de banc « avant » (section 7).

**Reprise**. Ce lot est le plus gros de la vague. Chaque étape ci-dessous laisse l'application jouable : tu peux
t'arrêter proprement **après n'importe quel commit d'étape**, pousser, et écrire l'état `partielle` avec le numéro de
l'étape suivante. Ne t'arrête jamais **au milieu de l'étape ecrans-4.3** : le refus `QUESTION_DUE` sans l'écran qui
pose la question bloquerait le tableau. L'ancien texte posait le serveur en premier ; l'ordre est changé pour cela.
Après l'étape ecrans-4.3, le cœur du lot est livré (le tableau se joue de bout en bout).

### ecrans-4.1 — Un seul écran d'équipe, partout (ex-étape 18, points 1 et 3)

**Constat vérifié** (`main` `d65dca4`) :

| Où | Constat |
| --- | --- |
| `src/shared/glTenirPermissionsCore.js` (lignes 107-112) | En surface `tableau`, un élève n'a **aucun** geste : le prof porte les cinq gestes pour l'équipe active. |
| `src/gl/AppGL.jsx` | `ecranEquipeEnTrois` (ligne 821) exclut `surface === 'tableau'` ; l'ancien écran est importé (ligne 141) et monté (ligne 1077). Il n'affiche que des boutons grisés. |
| `src/gl/components/tenir/GLTeamSessionView.jsx` | `auTableau` (ligne 139) ; l'ancien écran est monté ligne 205, avec autour de lui `gl-team-session-comptes`, `gl-team-session-attente`, un plateau `standard` et le carnet hors tour. |
| `src/gl/utils/glTenirMoment.js` (lignes 54 et 245) | « Le tour se joue au tableau. » **existe déjà** (`TEXTES_DU_MOMENT.tableau`), rendu en phase `jeu` quand aucun geste n'est ouvert ; testé (`tests-ui/gl/glTenirMoment.test.js`, ligne 323). L'ancien texte l'annonçait comme un état à créer : il n'y a qu'à le faire servir. |
| Autres mentions de `GLTenirEquipeView` | Commentaires de `useGlTenirEquipe.js` (ligne 21), `GLTenirEcranEquipe.jsx` (ligne 42), `GLTeamSessionView.jsx` (ligne 38) ; `tests-ui/gl/GLTenirEcranEquipe.test.jsx` (ligne 19) ; `tests-ui/gl/tenir-chaines-interdites.test.jsx` (lignes 4 et 175) ; `docs/GL_TENIR_A_DEUX.md` (ligne 424) ; `docs/GL_TESTS.md` (ligne 196) ; `.claude/skills/gl-tenir-moteur/SKILL.md` (ligne 123). |

**Changement attendu** :

1. Supprime `GLTenirEquipeView.jsx` et son test, son montage dans `AppGL.jsx` et dans `GLTeamSessionView.jsx`. Retire
   la condition `surface !== 'tableau'` de `ecranEquipeEnTrois`. Toutes les tablettes et tous les comptes d'élèves
   montrent `GLTenirEcranEquipe`, quelle que soit la surface.
2. En surface `tableau` (et après « Tout au tableau »), la carte du moment d'une tablette ou d'un compte dit « Le tour
   se joue au tableau. » (adresse « vous ») ; le reste de l'écran (plateau, bandeau, tiroir, bulle d'Olu) ne change
   pas. Vérifie ce que la carte dit hors de la phase `jeu` et dis-le dans ton rapport.
3. Si un composant ou un test de `GLTenirEquipeView` sert encore ailleurs, réutilise sa logique dans
   `GLTenirEcranEquipe` plutôt que de garder le fichier. Chaque scénario du test supprimé a son pendant dans
   `tests-ui/gl/GLTenirEcranEquipe.test.jsx`, ou tu dis pourquoi il n'a plus lieu d'être.
4. Surface tablette (et anciennes parties hybrides) : rien ne change, hormis la suppression de l'ancien écran (qui n'y
   servait pas).
5. Dans ce commit, la console ne change pas : le prof garde ses cartes d'équipe.

**Textes** (élèves, mot pour mot, déjà dans le code) : « Le tour se joue au tableau. »

**Tests** : `tests-ui/gl/GLTeamSessionView.test.jsx` (le bloc « surface tableau : l'ancien écran, inchangé », lignes
157-190, devient « surface tableau : le même écran, la carte dit que le tour se joue au tableau ») ; `AppGL` ou la
session d'équipe en surface tableau monte `GLTenirEcranEquipe` ; `tenir-chaines-interdites.test.jsx` sans l'ancien
écran.

**Critère d'acceptation** : `git grep GLTenirEquipeView -- src tests-ui` ne rend plus rien ; une tablette en surface
tableau montre l'écran en trois choses et la phrase.

### ecrans-4.2 — Au tableau, l'écran de l'équipe active dans la console (ex-étape 18, point 2 : montage, gestes, bourses)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `src/gl/components/mj/GLTourScreen.jsx` › `TeamCard` (lignes 23-112) | Par équipe, la console ne propose que la saisie des dés et « Équipe suivante » : **ni « Fouiller », ni « Lire »**. |
| même fichier, props (ligne 122) | Il reçoit `game`, `teams`, `roster`, `tenir`, `token`, `events` : ni l'état complet de la partie, ni un plateau. Monté par `GLGameMasterConsole.jsx` (ligne 1061). |
| `src/gl/AppGL.jsx` (ligne 814) | Le mode fouille du plateau (`chasse.setFouilleMode`) n'est armé que par un écran d'équipe ; le compte du prof n'en monte jamais (`ecranEquipeMonte` exige `auth.teamId`). |
| `src/gl/hooks/useGlChasse.js` (lignes 64-130) | `fouiller`, `repondre`, `ouvrir`, `tenir` acceptent un `teamId`, mais **aucun appelant ne le passe**. `useGlTenirEquipe.js` ne le passe que pour `peripetiePasser` (ligne 88). `useGlQuestionDeCase.js` (`presenter`, `repondre`) n'en envoie pas. |
| Serveur | Le prof agit déjà pour une équipe : `lib/glActeur.js` › `resolveGesteActorOrRespond` (ligne 207) lit `teamIdFromBody` dans `routes/gl/games/chasse.js` (lignes 264, 318), `markers.js` (lignes 242, 448), `qcm.js` (ligne 71), `tenir-tour.js` (lignes 640, 755, 897, 1087). |
| `routes/gl/games/tenir-tour.js` (lignes 236-238) | La vue du tour sert au prof `teams[].fouilles` ; après le lot moteur-4, aussi `sondesRestantes`. |

**Changement attendu** :

1. Dans « Jouer le tour », en surface `tableau` et en phase `jeu`, un bloc **« Équipe active : {nom} »** monte
   `GLTenirEcranEquipe` pour l'équipe active (`round.equipeActiveId`), à la place de la carte de cette équipe (les
   autres cartes restent, en lecture). Le prof, ou un élève de l'équipe venu au poste, touche les mêmes boutons que
   sur une tablette : lancer, répondre, sonder, fouiller (le plateau du bloc passe en mode fouille, comme sur une
   tablette), lire et faire tenir, jeter un sort.
2. **Agir pour l'équipe** : une prop `agirPourEquipe` (ou un nom plus clair) fait passer le `teamId` de l'équipe
   active dans **tous** les appels de l'écran : `useGlChasse` (fouille, **sonde** livrée par le lot moteur-4,
   ouverture de page, tenue, réponse de zone), le lancer et la saisie des dés, la question de case
   (`caseQuestion.presenter` et la réponse), l'assistant de sort, la péripétie. Le serveur accepte déjà le prof pour
   toute équipe ; vérifie chaque route et dis lesquelles demandaient le `teamId` dans le corps. **N'ajoute aucune
   route.**
3. **Bourses masquées** dans ce bloc (bandeau `gl-tenir-bourses`, tiroir `gl-tenir-tiroir-bourses`, pot des sorts :
   montant total seulement) : l'écran du prof peut être recopié au vidéoprojecteur, et les bourses restent privées
   vis-à-vis de la classe. Ni « Changer d'équipe », ni badges, ni chimère dans ce bloc.
4. Le bloc monte `GLTenirEcranEquipe` : il hérite du plateau flouté pendant une question (lot ecrans-2) et de la
   bulle d'Olu ; vérifie-le sur ta capture.
5. Ne touche pas aux droits des élèves au tableau : c'est le poste du prof qui joue.
6. Dans ce commit, garde « Équipe suivante » tel qu'il est, sous le bloc : l'étape suivante le remplace.

**Textes** (prof et élève au poste) : « Équipe active : {nom} ».

**Tests** : UI, `GLTourScreen` en surface tableau monte l'écran de l'équipe active, sans bourse ; serveur, fouille et
tenue faites par le prof pour l'équipe active → acceptées, attribuées à l'équipe.

**Critère d'acceptation** : au tableau, le prof joue une fouille puis une lecture pour l'équipe active sans quitter
« Jouer le tour ».

### ecrans-4.3 — Finir le tour d'une équipe : « Équipe suivante », « Le voile avance », question due (ex-étape 17, part bouton ; ex-étape 18, point 2 : une chose à la fois, question due)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `lib/glTour.js` › `equipeSuivanteTx` (ligne 730 de `b8b5344`) | Passe la main à l'équipe suivante de l'ordre. Après le lot moteur-1 : 409 `FIN_DE_L_ORDRE` (« Toutes les équipes ont joué. ») pour la dernière, **avant toute écriture** (avant `confirmerArriveesTx`). |
| `lib/glTour.js` › `loadRoundView` (ligne 162) | `round.questionsEnAttente` liste les questions de case dues. Aucun composant de la console ne la lit ; rien n'empêche « Équipe suivante » sur une question due. Partie jouée au tableau le 23/11 : 0 question posée, 0 fouille en trois tours. |
| `routes/gl/games/qcm.js` (lignes 286-326), `lib/glTour.js` › `prendreQuestionDeCaseTx`, `solderQuestionDeCaseTx` | **Seule une bonne réponse solde la question** (`issue: 'repondue'`). Une mauvaise réponse écrit l'évènement `pas_encore` (`kind: 'case'`, `markerId`, `roundNumber`) et laisse la question due : l'équipe peut réessayer. Aucune issue `passee` n'existe pour une question de case. |
| `src/gl/components/mj/GLTourSouffle.jsx` | « Le voile avance » existe : il appelle `tourApi.phase('souffle', { faces, dort: false })` (ligne 63). Quand l'escalier tient le voile fermé (`voileFerme`, ou `round.souffle.ferme`), le geste s'appelle « Passer à la suite » et envoie `{ dort: true }` (lignes 19-31). « Le voile dort » envoie `{ dort: true }`. |
| `tools/gl-sim/seance.js` (boucle `tableau`) | Le banc appelle `equipe-suivante` après chaque équipe (sauf la dernière depuis le lot moteur-1). |

**Changement attendu** :

1. **Une chose à la fois** : la carte du moment fait déjà avancer le geste suivant (répondre, lancer, sonder, fouiller,
   lire, sorts). Quand l'équipe active n'a plus de geste ouvert, la carte du moment du bloc montre **« Équipe
   suivante »**.
2. **Dernière équipe de l'ordre** (`round.ordre`, `round.equipeActiveId`) : « Équipe suivante » est **absent** ; à sa
   place, **« Le voile avance »** passe le tour en phase `souffle` par le **geste existant** de `GLTourSouffle`. Si
   l'escalier tient le voile fermé, le bouton reprend le geste existant de cet état (« Passer à la suite ») : la
   classe n'a pas encore rencontré le voile. Le bloc `GLTourSouffle` reste dans la console (dé gris saisi, « Le voile
   dort »).
3. **« Passer »** : un lien discret permet au prof de passer à l'équipe suivante avant la fin (journalisé, motif
   facultatif).
4. **Question due** : tant qu'une question de case de l'équipe active n'est ni répondue ni passée, « Équipe suivante »
   est absent ; la carte du moment propose la question et, en petit, « Passer la question » (issue `passee`,
   journalisée, sans effet). Serveur : `equipeSuivanteTx` répond 409 `QUESTION_DUE` dans ce cas, sans rien écrire
   (avant `confirmerArriveesTx`, comme `FIN_DE_L_ORDRE`). Pour la fouille, pas de blocage serveur : l'écran suffit.
5. « Passer la question » passe par une route existante (un champ de plus dans le corps de la réponse de case, par
   exemple) : si ce n'est pas possible sans route nouvelle, ne fais pas ce lien et dis-le.
6. **Lecture de « ni répondue ni passée »** (posée par cette fiche ; l'ancien texte ajoutait « une mauvaise réponse ne
   coûte rien », alors que le code laisse la question due après une mauvaise réponse) : une question à laquelle
   l'équipe a **donné une réponse ce tour-ci, juste ou non**, ne bloque plus « Équipe suivante » ni « Passer ». Le
   409 ne tombe que si aucune réponse n'a été donnée et que la question n'a pas été passée. Sans cela, et sans
   « Passer la question », une équipe qui se trompe retiendrait toute la classe : c'est un état d'attente sans sortie,
   interdit. Si tu ne peux tenir ni cette lecture ni le lien, n'ajoute pas le 409 : état `bloquée` pour ce point, et
   dis-le.
7. **Banc** : apprends au robot de la surface `tableau` à ne pas buter sur `QUESTION_DUE` (il répond déjà aux
   questions de case à l'arrivée ; vérifie qu'aucun appel `equipe-suivante` ne reçoit le refus).

**Textes** : « Équipe suivante » · « Le voile avance » · « Passer à la suite » (existant) · « Passer » · « Passer la
question ». Le message du refus `QUESTION_DUE` (lu par le prof) n'est pas donné : propose-le dans ton rapport, « À
relire par Oliv ».

**Tests** :

- `tests-ui/gl/glTenirMoment.test.js` : écran de l'équipe active → gestes ouverts dans l'ordre, puis « Équipe
  suivante », puis « Le voile avance » pour la dernière ; question due → la question, pas « Équipe suivante ».
- `tests-ui/gl/GLTourScreen.test.jsx` : le test « en tableau, seule l'équipe active peut saisir un jet ; « Équipe
  suivante » appelle le serveur » (ligne 291) suit le nouveau bloc.
- Serveur (`tests/gl-tour-phases.test.js` ou `tests/gl-tenir-question-case.test.js`) : question due sans réponse → 409
  `QUESTION_DUE`, l'équipe active ne change pas, rien n'est écrit ; après une réponse, ou « Passer la question » (s'il
  existe) → la suite reprend ; dernière équipe → `FIN_DE_L_ORDRE` toujours.

**Critère d'acceptation** : au tableau, deux équipes jouent l'une après l'autre sans que le prof quitte le bloc ; une
question de case due se pose, ou se passe ; après la dernière équipe, un seul bouton mène au voile.

### ecrans-4.4 — La projection montre la question posée (ex-étape 18, point 2 : projection)

- **Constat vérifié** : `GLProjectionView.jsx` lit `GET /api/gl/games/:id`, `…/tenir/tour` et `…/chasse` (lignes
  134-138). `round.questionsEnAttente` ne porte que `teamId` et `markerId` : pas le texte de la question. Le plateau
  de la projection reste net pendant une question.
- **Changement attendu** :
  1. La projection montre la question pendant qu'elle est posée (texte et choix, **jamais la bonne réponse avant la
     réponse**). Si aucune des réponses qu'elle lit ne porte le texte de la question, ajoute-le seulement si c'est un
     champ de plus dans la même réponse ; sinon, renonce et dis-le.
  2. Pendant qu'elle est posée, le plateau de la projection est flouté comme celui de l'écran d'équipe : même classe
     `is-question-ouverte` (lot ecrans-2), pour que la réponse ne se lise pas sur le dessin. Le flou vaut même si tu
     as renoncé au texte.
- **Textes** : aucun texte nouveau (la question et ses choix).
- **Tests** : `tests-ui/gl/GLProjectionView.test.jsx` : question posée → plateau flouté, question visible, aucune
  marque de la bonne réponse ; question répondue ou passée → plateau net.
- **Critère d'acceptation** : une capture de la projection pendant une question ne laisse lire ni la réponse ni le
  dessin.

### ecrans-4.5 — Plus de fenêtre du plateau en « Tenir » (ex-étape 31 de l'addendum 2)

**Constat lu dans le code** (pas vu à l'écran) :

| Où | Constat |
| --- | --- |
| Écran d'équipe | La question de case passe par la carte du moment (`useGlQuestionDeCase`). Mais le plateau garde son crochet d'arrivée (`useGLMarkerArrival`). |
| `src/gl/components/tenir/GLTeamSessionView.jsx` (ligne 152) | Tablette : `markerArrivalEnabled={tourOuvert && tenir?.permissions?.repondre === true}`. |
| `src/gl/hooks/useGlGameRuntime.js` (lignes 553-556), passé par `AppGL.jsx` (ligne 1006) | Compte d'élève et compte du prof : vrai pour le prof, sinon `!gameplaySettings.qcmMjOnly`. |
| `src/gl/components/GLGameBoard.jsx` (lignes 803 et 825) | Quand le serveur pose l'équipe sur une case question ou effet, le plateau ouvre aussi `GLQcmPopover` ou `GLMarkerEffectPopover` par-dessus l'écran, sur la même route `present-question`. Deux présentations rivales de la même question ; c'est très probablement la fenêtre où Oliv a vu l'éléphant le 24/11. |
| `isTenirGame` | **N'existe pas côté client** (aucune occurrence dans `src/`) : c'est une fonction du serveur (`lib/glTenir.js`). Le client sait qu'une partie est « Tenir » par `gameState.tenir.enabled` (`AppGL.jsx`, lignes 785 et 815). |
| `src/gl/components/tenir/GLProjectionView.jsx` (ligne 279) | La projection passe **déjà** `markerArrivalEnabled={false}` : rien à y changer. |
| `GLGameBoard.jsx` (lignes 438, 463), `useGLMarkerArrival.js` (ligne 180) | Les autres chemins (clic sur une case par qui peut déplacer, dé du plateau) passent par `schedulePresentOnArrival`, qui ne fait rien quand le hook est désactivé ; `handleEffectAutoMove` n'est appelé que par le hook. |
| `routes/gl/games/markers.js` (présentation d'une arrivée) | Cette présentation applique aussi l'effet d'une case quand le moteur ne l'a pas déjà joué (`skipIfAlreadyApplied`). |

**Changement attendu** :

1. En partie « Tenir » (`gameState.tenir.enabled`), `markerArrivalEnabled` vaut `false` sur : la tablette d'équipe
   (`GLTeamSessionView.jsx`), le compte d'élève (valeur calculée dans `useGlGameRuntime.js`), le bloc « Équipe
   active » de la console (étape ecrans-4.2), la projection (déjà fait). Question, zone et effet ne passent que par
   la carte du moment (et, pour l'effet, par le résumé de case déjà servi). Les parties classiques restantes ne
   changent pas.
2. Vérifie qu'aucun autre chemin n'ouvre `GLQcmPopover` ou `GLMarkerEffectPopover` en « Tenir » (clic sur une case,
   `handleEffectAutoMove`) ; dis lesquels tu fermes.
3. **Avant de fermer**, vérifie qu'en « Tenir » aucun déplacement ne compte sur cette présentation pour **appliquer**
   sa case (péripétie d'une case évènement, « un seul dé » d'une case Souffle, équipe posée à la main par le prof).
   Si c'est le cas, ne ferme pas ce chemin et dis-le (état `bloquée` pour ce point).
4. Le plateau du prof hors du bloc (onglet du plateau d'un compte staff) n'est pas dans la liste : n'y touche pas
   (sa fenêtre d'effet porte « Si vous l'appliquez… », seul chemin du prof vers l'application d'une case), et dis
   dans ton rapport ce qu'il ouvre encore.
5. Le fond opaque de `GLQcmPopover` (lot ecrans-2) reste : il sert encore aux parties classiques.

**Textes** : aucun.

**Tests** : UI, partie « Tenir », équipe posée sur une case question → aucun `GLQcmPopover` dans le DOM, la carte du
moment montre la question ; partie classique → la fenêtre s'ouvre comme avant (`GLTeamSessionView.test.jsx`,
`useGLMarkerArrival.test.js`, et un test de la valeur calculée par `useGlGameRuntime`). E2E en tablettes et au
tableau : à l'arrivée sur une case question, une seule présentation.

**Critère d'acceptation** : en « Tenir », aucune fenêtre ne s'ouvre par-dessus l'écran d'équipe à l'arrivée sur une
case ; les effets de case s'appliquent toujours.

### ecrans-4.6 — La piste s'ouvre sur la tablette d'équipe (ex-étape 32 de l'addendum 2)

**Constat vérifié** :

| Où | Constat |
| --- | --- |
| `src/gl/components/tenir/GLTenirMoment.jsx` (lignes 262-275) | Après un « pas encore », le bouton « Ouvrir la fiche » ou « Ouvrir le glossaire » n'apparaît que si `onOuvrirPiste` existe. La piste porte `type` (`fiche` ou mot), `code`, `texte`. |
| `GLTeamSessionView.jsx` (ligne 189) | Ne passe pas `onOuvrirPiste` à `GLTenirEcranEquipe` (prop ligne 59, transmise ligne 312) : la boucle « pas encore → piste → fiche → réessayer » est coupée sur la surface de la séance. |
| `src/gl/AppGL.jsx` (ligne 1051) | Le compte d'élève a déjà `ouvrirPiste`, qui **change d'onglet** : ce n'est pas le modèle de la feuille demandée ici, mais il montre comment retrouver la fiche ou le mot. |
| `src/gl/components/GLSpeciesDetailModal.jsx` | Aucune prop de lecture seule. Elle rend un bouton d'accusé « Marquer comme appris » (`GLLearningAcknowledgeButton`, lignes 266-285, seulement si `learningProgress` est passé), l'import au journal (`GLJournalImportButton`, lignes 286-293) et « Fermer ». **« Marquer comme étudié » n'est pas dans ce fichier** (il est dans `GLSeleneCarnetView.jsx` et `GLEcosystemsView.jsx`). |
| `src/gl/components/GLGlossaryPopover.jsx` | Même bouton d'accusé si `learningProgress` est passé (ligne 320) ; lien vers l'onglet du glossaire (`onOpenFullGlossary`, `showFullGlossaryLink`). |

**Changement attendu** :

1. `GLTeamSessionView` passe `onOuvrirPiste` à `GLTenirEcranEquipe`. La piste ouvre **une feuille en lecture seule**
   par-dessus la carte du moment : une fiche d'espèce par la vue de `GLSpeciesDetailModal` (prop de lecture seule :
   ni bouton d'accusé, ni conditionnement, ni import au journal, ni lien vers d'autres onglets) ; un mot par
   `GLGlossaryPopover` (mêmes retraits).
2. Bouton unique « Revenir au jeu », qui rend exactement le même écran (même carte du moment, même défilement).
3. La session de tablette (invité d'équipe) lit-elle les routes de fiche et de glossaire ? Vérifie. Si une route la
   refuse, **n'ajoute pas de route** : affiche alors le nom de la fiche ou du mot dans la carte et dis-le dans ton
   rapport.
4. Même feuille dans le bloc « Équipe active » de la console. Le compte d'élève garde son comportement (il change
   d'onglet) : son tour vient au lot ecrans-8.

**Textes** (élèves, mot pour mot) : « Revenir au jeu ». Repli pour une fiche, sur ce modèle : « La piste : la fiche
« Éléphant de savane », dans La nature. » Le repli pour un mot du glossaire n'est pas donné : propose-le dans ton
rapport.

**Tests** : UI, moment « retour pas encore » avec une piste de fiche → bouton présent, clic → feuille, « Revenir au
jeu » → même carte ; piste de glossaire → fenêtre du mot ; sans piste → pas de bouton ; feuille en lecture seule →
aucun bouton d'accusé.

**Critère d'acceptation** : sur une tablette d'équipe, après un « pas encore », l'équipe ouvre la fiche, la lit,
revient au jeu au même endroit, et peut réessayer.

### ecrans-4.7 — E2E au tableau, docs, captures, banc « après » (ex-étape 18, points 4 à 6)

- **Changement attendu** :
  1. **E2E au tableau** (spec nouvelle) : un tour complet de deux équipes — lancer, question, fouille, lecture d'une
     page, « Équipe suivante », puis « Le voile avance ». À l'arrivée sur une case question : une seule présentation.
  2. Les e2e qui visaient l'ancien écran sont réécrits sur le nouveau : liste-les. Au 24/11, aucune spec ne monte une
     tablette en surface tableau (`git grep -n "tableau" -- e2e` : seulement la projection) ;
     `e2e/gl-tenir-tablettes.spec.js` (ligne 314) lit `gl-team-session-comptes`.
  3. Docs (section 9), captures et banc « après » (section 7).
- **Tests** : la spec nouvelle ; `e2e/gl-tenir-tablettes.spec.js` et `e2e/gl-tenir-projection.spec.js` verts.
- **Critère d'acceptation** : les vérifications de fin de session passent ; le rapport liste les routes qui
  demandaient le `teamId`, les chemins fermés, et ce à quoi tu as renoncé.

## 5. Migration

Aucune.

## 6. Données et sources

Aucune.

## 7. Vérifications propres au lot

**Banc, régime seuils** (ce lot change `equipeSuivanteTx`). L'ancien texte ne demandait aucun banc pour ce lot : les
mesures sont celles des règles communes.

- **Avant toute modification**, puis **après l'étape ecrans-4.3** (et encore à la fin si le code a bougé depuis) :
  les deux commandes des règles communes. Note les deux séries : carnet complet par plateau (alerte au-dessus de 60 %
  aux plateaux 1 et 2), écart de cases au camp, dépense de gemmes par élève et par chapitre, reculs de voile dus à la
  Lumière. Aucune ne devrait bouger : ces deux scénarios jouent en `hybride` et en `tablette` et n'appellent jamais
  `equipeSuivanteTx`.
- C'est pourquoi tu lances **aussi**, avant et après, `npm run gl:sim -- --scenario tableau-pur --runs 3 --seed 14`
  (`tools/gl-sim/scenarios/base.js`). Note : le scénario va au bout ; nombre de refus `QUESTION_DUE` et
  `FIN_DE_L_ORDRE` reçus par `equipe-suivante` (attendu : 0) ; questions de case posées et justes ; les mêmes mesures
  que ci-dessus.

**E2E** (sous le verrou) : la spec au tableau ; `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-projection.spec.js`,
`e2e/gl-tenir-escalier.spec.js`, `e2e/gl-tenir-ecrans-relus.spec.js`, `e2e/gl-marker-question.spec.js`,
`e2e/gl-mj-console.spec.js`.

**Captures** (`docs/captures/gl-decisions/ecrans-4/`) :

- console au tableau, 1920 × 1080 : la suite d'une équipe (Lancer → Question → Sonder → Fouiller → Lire → Équipe
  suivante), l'écran de l'équipe active pendant une fouille, puis « Le voile avance » pour la dernière ;
- tablette en surface tableau, 1024 × 768 (« Le tour se joue au tableau. ») ;
- projection pendant une question posée ;
- tablette 1024 × 768 arrivée sur une case question (une seule présentation) ;
- piste ouverte, puis « Revenir au jeu ».

**Relecteur** : `gl-relecteur-garde-fous` sur les textes des étapes ecrans-4.2, 4.3 et 4.6.

## 8. Contrats de test changés

- `GLTenirEquipeView` et `tests-ui/gl/GLTenirEquipeView.test.jsx` supprimés.
- Tablette en surface tableau : `gl-tenir-equipe` (écran en trois choses) à la place de l'ancien écran ;
  `gl-team-session-attente` et `gl-team-session-comptes` disparaissent avec la branche « tableau » de
  `GLTeamSessionView`.
- `POST …/tenir/tour/equipe-suivante` : 409 `QUESTION_DUE` (en plus de `FIN_DE_L_ORDRE`).
- Console au tableau : la carte de l'équipe active est remplacée par le bloc « Équipe active » ; « Équipe suivante »
  vit dans la carte du moment du bloc ; « Le voile avance » pour la dernière équipe.
- `markerArrivalEnabled` faux en « Tenir » (tablette, compte d'élève, bloc de la console).
- Projection : question posée visible, plateau `is-question-ouverte`.
- `GLTeamSessionView` passe `onOuvrirPiste` ; `GLSpeciesDetailModal` et `GLGlossaryPopover` ont une prop de lecture
  seule.
- Donne dans ton rapport les test-id nouveaux (bloc, boutons, feuille de la piste).

## 9. Docs à mettre à jour dans ce lot

| Doc | Quoi |
| --- | --- |
| `docs/GL_TENIR_A_DEUX_REGLES.md`, § 3 (hors § 0) | Un seul écran d'équipe ; au tableau, l'écran de l'équipe active dans la console ; la phrase « En surface `tableau`, l'ancien écran d'équipe est gardé » devient fausse ; « bouton « équipe suivante » » (ligne 90) : question due, « Le voile avance » après la dernière équipe. |
| `docs/API.md` | Ligne 391 (`equipe-suivante`) : 409 `QUESTION_DUE` ; l'issue `passee` si elle existe ; le `teamId` des gestes du prof s'il change. |
| `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md` (ligne 27, « Décision attendue d'Oliv ») | « tranchée par Oliv le 23/11 : nouvel écran partout (chantier G&L décisions, lot ecrans-4) ». |
| `docs/reference/gl/guide-du-mj.md`, `docs/reference/gl/roles-et-connexion.md` | Seulement les phrases devenues fausses (ce que le prof fait au tableau, la tablette en surface tableau, la piste qui s'ouvre sur la tablette). Le lot fin-2 réécrit. |
| `docs/GL_TENIR_A_DEUX.md` (ligne 424), `docs/GL_TESTS.md` (ligne 196), `.claude/skills/gl-tenir-moteur/SKILL.md` (ligne 123) | Retirer « l'ancien écran gardé au tableau ». |
| `changelog.d/gl-decisions-ecrans-4.md` | L'entrée du lot. |

**Pour le § 0 des règles** (dans ton rapport) : « 23/11 au soir : un seul écran d'équipe ; au tableau, l'écran de
l'équipe active dans la console » ; une ligne pour I1 (plus de fenêtre du plateau en « Tenir ») et une pour I2 (la
piste s'ouvre sur la tablette), dans les mots de la section 2. **Pour le lot fin-1** : le constat « au tableau, aucun
chemin de fouille ni de lecture » et sa correction. **Pour le lot fin-2** : « Et sans tablettes ? » décrit le bloc
« Équipe active » (Lancer → Question → Sonder → Fouiller → Lire → Équipe suivante ; bourses masquées ; « Le voile
avance » après la dernière équipe).

## 10. Hors périmètre

- La sonde elle-même, la question de case récompensée : lot moteur-4 (tu ne fais que les monter dans le bloc).
- Le refus `FIN_DE_L_ORDRE` : lot moteur-1.
- La musique, baissée pendant une question en projection : lot ecrans-5.
- Les mots du voyage et « Mon sac » : lot ecrans-6. Les surcouches « une à la fois » et la piste sur le compte
  d'élève : lot ecrans-8.
- La suppression du code inerte (fenêtre de fouille hybride, arrivée suspendue) et du jeu classique : après deux
  séances, hors chantier.
- Les droits des élèves au tableau : inchangés.

## 11. Pour Oliv

**À relire** :

- Textes : « Équipe active : {nom} », « Équipe suivante », « Passer », « Passer la question », « Revenir au jeu », le
  message du refus `QUESTION_DUE` et le repli de la piste pour un mot (proposés par la session).
- **Question due** : aujourd'hui, une mauvaise réponse laisse la question « due » (l'équipe peut réessayer). Cette
  fiche fait donc lever le blocage dès qu'une réponse a été donnée, juste ou non. À confirmer, ou à remplacer par
  « une seule tentative par question au tableau ».
- **Dernière équipe, séances 1 et 2** : tant que l'escalier tient le voile fermé, le bouton dit « Passer à la suite »
  et non « Le voile avance » (la classe n'a pas encore rencontré le voile). À confirmer.
- Le bouton « Le voile avance » de la carte du moment tire le dé gris côté serveur ; le dé saisi et « Le voile dort »
  restent dans le bloc du voile, plus bas dans la console.
- Le plateau du prof (onglet du plateau) garde ses fenêtres de case en « Tenir » : la décision I1 ne le nommait pas.
- Ce à quoi la session a renoncé (texte de la question en projection, « Passer la question », feuille de la piste si
  la session d'équipe ne lit pas les fiches).

**À faire après la vague** : sur une partie neuve de la classe de démonstration, projection ouverte, au tableau : un
tour complet depuis le bloc « Équipe active » (question, sonde, fouille, lecture), « Le voile avance » après la
dernière équipe ; une tablette affiche « Le tour se joue au tableau. » ; une question de case : une seule
présentation, plateau flouté en projection.
