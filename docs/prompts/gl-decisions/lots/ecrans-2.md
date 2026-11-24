# Lot ecrans-2 — L'erreur d'Olu visible, la question sans sa réponse visible

> Chantier G&L « décisions » · vague 1 · couloir écrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-2` · Attend : ecrans-1, moteur-1 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- La phrase fausse qu'Olu glisse à chaque séance se voit enfin côté élèves : en grand sur la projection, dans la
  bulle d'Olu sur la tablette. La correction n'arrive qu'après que le prof a désigné l'équipe qui a trouvé.
- Une équipe poussée par le vent lit « Porté par le vent : la case ne joue pas. » au lieu de rien.
- Pendant une question, le plateau se floute et le fond de la fenêtre devient presque opaque : la réponse ne se lit
  plus sur le dessin.
- Pendant une question, les puces du glossaire sous les choix ne s'affichent plus ; elles reviennent avec le retour.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 15 du prompt | 23/11 | L'erreur du jour d'Olu se voit en projection et sur la tablette d'équipe. | — |
| Décision 27 du prompt | 24/11 | Une question ne se lit jamais avec sa réponse visible sur le plateau, derrière ou à côté. Correctif d'affichage, sans donnée ni réglage. | « la réponse peut être visible par transparence… l'éléphant se voit bien » |
| Décision I3 de l'addendum 2 | 24/11, 11 h 41 (prise « telle qu'écrite » par la décision 39 de l'addendum 4) | Pendant une question, rien n'est consultable : les puces du glossaire sous les choix sont masquées tant que la réponse n'est pas donnée. | — |

**Choix par défaut posés par Claude** (appliqués sans demander ; Oliv peut les retirer ; liste-les dans ton rapport) :

- Le vent de la caravane se dit « Porté par le vent : la case ne joue pas. » : ce texte n'est pas une décision
  d'Oliv, c'est un choix de Claude non tranché.
- **Où et quand ce texte s'affiche** (posé à l'écriture de cette fiche le 24/11, l'ancien texte ne nommait ni fichier
  ni condition ; voir l'étape ecrans-2.2) : pour l'équipe que le vent a posée à l'ouverture du tour
  (`round.ventTeamId`), pendant les phases `ouverture` et `jeu`, tant qu'elle n'a pas lancé ses dés.
- Projection, sous la phrase d'Olu : « Une bêtise s'est glissée. Qui la trouve ? ».
- Place de l'erreur d'Olu sur la tablette : la bulle d'Olu ; si elle ne suffit pas à 1024 × 768, la variante la plus
  simple, dite dans le rapport.
- À la clôture du tour, en projection : la correction seule, ou rien si la place manque.
- Fond de la fenêtre de question presque opaque, au vert pétrole du jeu, et flouté ; plateau de l'écran d'équipe
  flouté tant qu'une question y est ouverte (case ou zone). Les valeurs du fond et du flou sont celles de l'étape
  ecrans-2.3.
- La fenêtre « Marquer comme lu » garde son fond (le texte derrière est celui qu'il faut avoir lu).
- Pas de tri des questions dans ce lot.

## 3. Fichiers

**À toi** (vérifiés sur `main` `d65dca4`) :

- `src/gl/components/tenir/GLProjectionView.jsx` : le bloc de l'erreur d'Olu et la mention du vent. Le lot ecrans-4 y
  ajoutera la question posée et le flou ; le lot ecrans-5, la musique.
- `src/gl/hooks/useGlTenirOlu.js`, `src/gl/hooks/useGlTenirEquipe.js` (il appelle le hook d'Olu, ligne 63).
- `src/gl/components/tenir/GLTenirEcranEquipe.jsx` : la classe `is-question-ouverte` du plateau, ce qu'il passe aux
  bandeaux. Les lots moteur-4 (sonde) puis ecrans-4 y travaillent après toi.
- `src/gl/utils/glTenirMoment.js` : `bandeauxDuMoment` (ligne du vent) seulement. Le lot ecrans-1 n'y a touché qu'une
  JSDoc ; les lots moteur-4 et ecrans-4 y ajoutent des états après toi. Ne touche ni `momentDeLEquipe` ni
  `ORDRE_DES_GESTES`.
- `src/gl/styles/gl-theme.css` (seulement `.gl-qcm-popover-overlay`), `src/gl/styles/gl-tenir.css` (plateau de l'écran
  d'équipe, bloc de la projection).
- `src/gl/components/GLQcmPopover.jsx`, `src/gl/components/GLQcmModal.jsx` (la rangée de puces).
- Tests : `tests-ui/gl/useGlTenirOlu.test.jsx`, `tests-ui/gl/GLProjectionView.test.jsx`,
  `tests-ui/gl/GLTenirEcranEquipe.test.jsx`, `tests-ui/gl/glTenirMoment.test.js`, `tests-ui/gl/GLQcmPopover.test.jsx`,
  `tests-ui/gl/GLQcmModal.test.jsx` ; e2e `e2e/gl-tenir-projection.spec.js`, `e2e/gl-tenir-escalier.spec.js`,
  `e2e/gl-tenir-tablettes.spec.js`.
- Docs : `docs/reference/gl/guide-du-mj.md` (lignes 300-306 et 732-734), `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 3,
  « Les écrans de séance », hors § 0).

**Nouveaux** :

- Un test CSS dans `tests/` (nom libre, par exemple `tests/gl-question-reponse-cachee-css.test.js`), sur le modèle de
  `tests/visit-map-animations-css.test.js`.
- L'e2e de l'étape ecrans-2.1 : un scénario de plus dans une spec existante, ou une spec nouvelle (dis laquelle).
- `changelog.d/gl-decisions-ecrans-2.md`, `docs/prompts/gl-decisions/rapports/ecrans-2.md`,
  `docs/captures/gl-decisions/ecrans-2/`.

**D'un autre couloir, modification minimale permise** : aucune. Tout ce qu'il te faut est déjà servi par le serveur
(`round.oluErreur`, `round.oluCorrigeTeamId`, `round.ventTeamId`).

**Ne touche pas** :

- `src/gl/components/tenir/GLTenirEquipeView.jsx` (le lot ecrans-4 le supprime) et la console
  `src/gl/components/mj/GLTourScreen.jsx` (elle reste telle quelle ; lots moteur-3 et ecrans-4).
- `src/gl/components/GLGameBoard.jsx`, `src/gl/hooks/useGLMarkerArrival.js`,
  `src/gl/hooks/useGLBoardMascotMotion.js` (lot ecrans-3, puis ecrans-4 pour le paramètre d'activation).
- `src/gl/components/GLMarkerEffectPopover.jsx` : sa phrase « Un sort ou le vent a posé l'équipe ici : la case ne se
  joue pas. » sert aussi aux sorts ; le lot ecrans-4 ferme cette fenêtre en « Tenir ».
- `src/shared/glTenirCaseEffetCore.js` (texte de vérité des cases : lot contenu-2).
- `lib/glTour.js`, `routes/gl/games/markers.js`, `lib/glJournalPresentTenir.js` (couloir moteur).
- `data/gl/tenir/olu-lignes.json` (lot contenu-1 : textes des erreurs d'Olu).
- `LearningQuizPopover` (`.fm-quiz-popover`), `GLGuestDemoBoard`, `src/shared/qcm/quizGlossaryReveal.js`.

## 4. Étapes (un commit par étape, dans cet ordre)

### ecrans-2.1 — L'erreur du jour d'Olu, visible des élèves (ex-étape 13)

**Constat vérifié** (`main` `d65dca4`) :

| Où | Constat |
| --- | --- |
| `lib/glTour.js` › `tirerErreurDuJour` (ligne 255) | Tire une ligne `moment = 'erreur'` à l'ouverture du tour, stockée dans `gl_game_rounds.olu_erreur_json` et signalée par l'évènement `olu_erreur` (payload `texte`). Après le lot moteur-1, le tirage ne se répète plus dans une partie. |
| `lib/glTour.js` › `loadRoundView` (ligne 114) | Sert `round.oluErreur.texte` à tous les écrans (via `lib/glTenirView.js`). La `correction` n'est servie qu'une fois l'erreur trouvée (`olu_corrige_team_id`, servi en `round.oluCorrigeTeamId`) ou le tour clos. |
| `src/gl/components/mj/GLTourScreen.jsx` (ligne 584) | **Seule** la console affiche la phrase et « Qui a trouvé l'erreur d'Olu ? ». |
| `src/gl/components/tenir/GLProjectionView.jsx` | N'affiche pas la phrase (aucune occurrence de `oluErreur`). |
| `src/gl/hooks/useGlTenirOlu.js` (ligne 170) | `if (!moment \|\| moment === 'erreur') return;` : la tablette saute le moment `erreur`. Le hook ne reçoit pas le tour. La console l'appelle aussi (`GLTourScreen.jsx`, ligne 135). |
| `data/gl/tenir/olu-lignes.json` › `olu-pf-erreur_du_jour` | À la marche 2 de l'escalier, la tablette dit « Aujourd'hui, je vais dire une bêtise, exprès… » : la bêtise annoncée n'apparaît nulle part côté élèves. |
| `lib/glTenir.js` (ligne 210) | Si `olu_erreur_du_jour` est coupé ou si la marche 2 n'est pas montée, `round.oluErreur` vaut `null`. |

**Changement attendu** (aucune route ni donnée nouvelle, tout est déjà servi) :

1. **Projection** (`GLProjectionView.jsx`), quand `round.oluErreur` existe :
   - phases `ouverture` et `jeu` : un bloc fixe, lisible du fond de la salle en 1080 p sans défilement, avec la tête
     d'Olu et « Olu : « {texte} » ». Dessous, en petit : « Une bêtise s'est glissée. Qui la trouve ? » ;
   - une fois l'erreur trouvée : « {nom de l'équipe} a trouvé ! », puis la correction en italique ;
   - à la clôture : la correction seule, ou rien si la place manque (la carte « À la prochaine séance » prime) ;
   - en phase `souffle`, le bloc s'efface : le voile garde la scène.
2. **Tablette d'équipe** (`GLTenirEcranEquipe`) : pendant `ouverture` et `jeu`, la phrase passe dans la **bulle
   d'Olu** : le hook renvoie `round.oluErreur.texte` au lieu de sauter le moment `erreur` ; la ligne « première
   fois » passe d'abord, la phrase suit. Sans correction ni bouton. Une fois l'erreur trouvée : « {équipe} a
   trouvé : {correction} ». La ligne disparaît avec la phase `souffle`. Si la bulle ne suffit pas sur une tablette
   1024 × 768 sans déplacer le plateau sous la ligne de flottaison, prends la variante la plus simple et dis
   laquelle.
3. **Console** : inchangée (le prof désigne l'équipe : « Qui a trouvé l'erreur d'Olu ? »). Le hook étant partagé,
   passe le tour par un paramètre facultatif que seul l'écran d'équipe renseigne. Surface tableau : la projection
   affiche le bloc. L'écran de l'équipe active dans la console et l'écran unique sur les tablettes au tableau
   n'existent qu'après le lot ecrans-4 : ils hériteront de la bulle d'Olu par le même hook. D'ici là, au tableau, les
   tablettes montrent l'ancien écran (`GLTenirEquipeView`, que tu ne modifies pas) : dis dans ton rapport s'il
   affiche la ligne.
4. **Escalier et réglage** : rien ne s'affiche si `olu_erreur_du_jour` est coupé ou si la marche 2 n'est pas montée
   (`round.oluErreur` vaut alors `null`).
5. **Garde-fous** : la correction n'arrive jamais à un écran d'élève avant que le prof ait désigné une équipe, ou
   avant la clôture ; aucun « Non », aucun « faux » ; le texte passe le test d'adresse (équipe : « vous »).
6. **Guide du prof** (`docs/reference/gl/guide-du-mj.md`, lignes 300-306 et 732-734) : « Olu glisse son erreur du
   jour » devient « l'erreur du jour d'Olu s'affiche en projection et sur les tablettes ; vous désignez l'équipe qui
   l'a trouvée depuis la console ». Règles, § 3 « Les écrans de séance ».

**Textes** (élèves, mot pour mot) :

- « Olu : « {texte} » » (la phrase vient de `round.oluErreur.texte`)
- « Une bêtise s'est glissée. Qui la trouve ? »
- « {nom de l'équipe} a trouvé ! » (projection), puis la correction en italique
- « {équipe} a trouvé : {correction} » (bulle d'Olu de la tablette)

**Tests** :

- `tests-ui/gl/useGlTenirOlu.test.jsx` : moment `erreur` → phrase de `round.oluErreur` ; sans le paramètre (console) →
  comportement d'aujourd'hui.
- `tests-ui/gl/GLProjectionView.test.jsx` : bloc en `ouverture` et `jeu` ; absent en `souffle` ; correction seulement
  quand elle est servie ; rien si `round.oluErreur` est `null`.
- e2e : partie à la marche 2, projection et tablette affichent la phrase sans la correction ; après « Qui a trouvé
  l'erreur d'Olu ? » depuis la console, les deux affichent la correction.

**Critère d'acceptation** : à la marche 2, la phrase est lisible en projection (1920 × 1080, sans défilement) et sur la
tablette (1024 × 768, plateau toujours au-dessus de la ligne de flottaison) ; jamais de correction avant le geste du
prof ou la clôture.

### ecrans-2.2 — Le vent de la caravane se dit (ex-étape 22, part « vent »)

L'ancien texte tenait en une phrase et ne nommait aucun fichier : « Vent de la caravane posant une équipe sur une case
dont l'effet ne joue pas : la projection et la tablette disent « Porté par le vent : la case ne joue pas. » (au lieu
d'un résumé vide). » Voici où cela vit dans le dépôt.

**Constat vérifié** (`main` `d65dca4`) :

| Où | Constat |
| --- | --- |
| `lib/glTour.js`, ouverture du tour (lignes 325-355) | Dès le tour 2, si une seule équipe est dernière, le vent la pousse (`applyTeamMoveTx`), écrit l'évènement `vent_caravane` (`{ roundNumber, cases, markerId }`) et `gl_game_rounds.vent_team_id`. |
| `lib/glTour.js` › `loadRoundView` (ligne 125) | Sert `round.ventTeamId` à tous les écrans. **Aucun écran ne le lit** (`git grep ventTeamId -- src` : rien). |
| `lib/glTour.js` › `poseeSansJouerLaCase` (ligne 1357) | Le vent pose l'équipe **sans que la case se joue**. |
| `routes/gl/games/markers.js` (lignes 483-503, 527-541) | À la présentation de la case, le serveur répond `sansEffet: true` et `effectSummary: null` : c'est le « résumé vide ». |
| `src/gl/components/GLMarkerEffectPopover.jsx` (lignes 71, 122-127) | Seul endroit qui dit quelque chose : la fenêtre du plateau affiche « Un sort ou le vent a posé l'équipe ici : la case ne se joue pas. ». Elle ne s'ouvre pas en projection (`markerArrivalEnabled={false}`, `GLProjectionView.jsx` ligne 279). |
| `lib/glJournalPresentTenir.js` (ligne 150) | Le journal dit « {équipe} est portée par le vent : N cases en avant. », mais `vent_caravane` n'est pas un fait marquant (`FAITS_MARQUANTS`, `src/gl/components/mj/GLTourJournal.jsx`) : la projection ne le montre pas. |
| `src/gl/utils/glTenirMoment.js` › `bandeauxDuMoment` (ligne 312) | Les lignes d'état de l'écran d'équipe (« Votre mascotte est sous le voile. », « Ce tour-ci : un seul dé. ») : aucune pour le vent. |
| `src/gl/components/tenir/GLProjectionView.jsx` › `mentionsDEquipe` (ligne 44) | Les mentions d'une équipe en projection (« au camp », « sous le voile », « ce tour-ci : un seul dé ») : aucune pour le vent. |

**Changement attendu** (affichage seulement ; aucune route, aucun texte servi par le serveur ne change) :

1. **Tablette d'équipe** : `bandeauxDuMoment` reçoit un drapeau (par exemple `vent`) et rend une ligne de plus, test-id
   `gl-tenir-vent`. `GLTenirEcranEquipe.jsx` le calcule : `round.ventTeamId` est l'équipe de l'écran, la phase est
   `ouverture` ou `jeu`, et l'équipe n'a pas encore lancé (`maVue.hasRolledDiceThisRound` faux).
2. **Projection** : la pastille de l'équipe `round.ventTeamId` (`ProjectionEquipe`, par `mentionsDEquipe` ou à côté)
   porte le même texte, dans les mêmes conditions (`tour.teams[].hasRolledDiceThisRound`).
3. Après le jet de l'équipe, à la phase `souffle` et au tour suivant, la ligne disparaît.
4. Ne change ni le journal, ni `FAITS_MARQUANTS`, ni la fenêtre du plateau, ni le résumé servi par le serveur.

**Textes** (élèves, mot pour mot) : « Porté par le vent : la case ne joue pas. »

**Tests** :

- `tests-ui/gl/glTenirMoment.test.js` : `bandeauxDuMoment` avec le drapeau → la ligne, son test-id ; sans → rien.
- `tests-ui/gl/GLTenirEcranEquipe.test.jsx` : `round.ventTeamId` = mon équipe, pas encore lancé → ligne présente ;
  après le jet, ou pour une autre équipe → absente.
- `tests-ui/gl/GLProjectionView.test.jsx` : la pastille de l'équipe portée par le vent montre le texte.
- `tests/content/gl-adresse-ecran-equipe.test.js` reste vert (il relit `glTenirMoment.js`).

**Critère d'acceptation** : au tour 2, l'équipe poussée par le vent lit la phrase sur sa tablette et la classe la lit
en projection, jusqu'à son jet.

### ecrans-2.3 — Une question ne se lit jamais avec sa réponse visible (ex-étape 30)

**Signalé par Oliv le 24/11** : la réponse d'une question se lit parfois sur le plateau autour de la fenêtre (une
espèce, l'éléphant par exemple, bien visible derrière). **Constat lu dans le code** (pas vu à l'écran ; la question
exacte qu'Oliv a vue n'est pas identifiée) :

| Où | Constat |
| --- | --- |
| `src/gl/components/GLQcmPopover.jsx`, montée par `GLGameBoard.jsx` (ligne 803), ouverte à l'arrivée par `useGLMarkerArrival` | Fenêtre de question d'une case. Son fond `.gl-qcm-popover-overlay` (`src/gl/styles/gl-theme.css`, lignes 2868-2888) vaut `rgba(15, 23, 42, 0.48)`, **sans flou** ; la fenêtre fait 480 px de large au plus (`.gl-qcm-popover`, ligne 2902). Le plateau se lit à travers le fond et tout autour. |
| `src/gl/components/tenir/GLTenirEcranEquipe.jsx` (lignes 282-289) | Écran d'équipe « Tenir » : la question de case (« La question de la case ») et la question de zone (« Une page dort ici ») passent dans la carte du moment (`GLTenirMoment.jsx`, `case 'question'`, ligne 155), **à côté** du plateau `.gl-tenir-ecran__plateau`, qui reste net : aucune fenêtre, aucun fond. |
| `src/gl/utils/glTenirMoment.js` › `momentDeLEquipe` (lignes 208-209) | La carte est en état `question` avec `origine: 'case'` ou `origine: 'chasse'` (question de zone). Le champ s'appelle `etat`, pas `type`. |
| `src/gl/styles/gl-theme.css` (ligne 3921) | `.gl-zone-content-popover-overlay` a le même fond à 0,48 : ce n'est pas une fenêtre de question, n'y touche pas. |

Vérifie lequel des deux chemins s'ouvre sur une tablette « Tenir » à l'arrivée sur une case question
(`markerArrivalEnabled` passé par `src/gl/components/tenir/GLTeamSessionView.jsx`, ligne 152 :
`tourOuvert && tenir?.permissions?.repondre === true`, et l'écran d'équipe en trois choses) ; dis-le dans ton rapport.
La correction couvre les deux.

**Changement attendu** (CSS et une classe ; aucune route, aucune donnée, aucun réglage, aucun texte) :

1. **Fond de la fenêtre de question** (`.gl-qcm-popover-overlay`) : `background: rgba(1, 58, 64, 0.94)` (le vert
   pétrole du jeu, `--gl-color-primary`) et `backdrop-filter: blur(16px) saturate(0.4)`, avec
   `-webkit-backdrop-filter` identique. La fenêtre elle-même ne change pas ; l'animation de sortie
   (`src/shared/styles/motion.css`, `overlayFadeOut`) reste. Vérifie que les boutons de la fenêtre gardent leur
   contraste (WCAG AA).
2. **Plateau de l'écran d'équipe pendant une question** : quand `moment.etat === 'question'` (case ou zone), le
   conteneur `.gl-tenir-ecran__plateau` reçoit la classe `is-question-ouverte` et `aria-hidden="true"` ; dans
   `src/gl/styles/gl-tenir.css` : `filter: blur(14px) saturate(0.3) brightness(0.75)`, `pointer-events: none`,
   transition de 200 ms (aucune sous `prefers-reduced-motion`). Le plateau redevient net dès que la question est
   répondue, fermée ou passée. N'emploie pas le mot « voile » dans le nom de classe (c'est un mot du jeu). Le mode
   fouille (`is-fouille`) ne change pas : une fouille n'est pas une question.
3. Le même écran servira au bloc « Équipe active » de la console (lot ecrans-4) et à toutes les surfaces : il héritera
   du flou. La projection pendant une question posée est traitée au lot ecrans-4, avec la même classe.
4. **Hors champ** : la fenêtre « Marquer comme lu » (`LearningQuizPopover`, `.fm-quiz-popover`) garde son fond : le
   texte derrière est celui qu'il faut avoir lu. Le plateau découverte (`GLGuestDemoBoard`) ne change pas.

**Textes** : aucun.

**Tests** :

- `tests-ui/gl/GLTenirEcranEquipe.test.jsx` : état `question` d'origine `case`, puis d'origine `chasse` → classe
  `is-question-ouverte` et `aria-hidden` sur le plateau (test-id `gl-tenir-plateau`) ; geste `lancer` ou fouille en
  cours → absents.
- Test CSS (nouveau, sur le modèle de `tests/visit-map-animations-css.test.js`) : `.gl-qcm-popover-overlay` a un fond
  d'opacité ≥ 0,9 et un `backdrop-filter` ; `.gl-tenir-ecran__plateau.is-question-ouverte` a un `filter` avec `blur`.

**Critère d'acceptation** : sur une tablette 1024 × 768, pendant une question de zone, plus rien ne se lit sur le
plateau ; il redevient net après la réponse. La fenêtre de question d'une case ne laisse plus voir le plateau.

**Limite, à écrire dans ton rapport** : ce correctif empêche de lire la réponse **pendant** la question. Une équipe
qui a regardé le dessin **avant** d'ouvrir la zone sait déjà ce qui y est dessiné : une question de zone qui demande
seulement de nommer l'espèce dessinée ne teste rien. Ce tri des questions est fait ailleurs (données passées en prod
le 24/11 ; catalogue et test au lot contenu-1).

### ecrans-2.4 — Rien de consultable pendant une question (ex-étape 33 de l'addendum 2)

**Constat vérifié** (`main` `d65dca4`) :

| Où | Constat |
| --- | --- |
| `src/gl/components/GLQcmPopover.jsx` (ligne 132) | `glossaryPropsWhileAnswering` bloque déjà les liens automatiques du texte tant que l'élève n'a pas répondu. |
| même fichier, lignes 197-219 | Mais la rangée de puces sous les choix (« Glossaire scientifique : », ou « Lexique lore : » pour une question de lore) reste cliquable et ouvre la définition. Elle vit dans le bloc d'avant réponse (`showChoices`). |
| même fichier, bloc d'après réponse (`showAnswer`) | Une rangée « Termes liés : » existe déjà, nourrie par le retour (`displayResult.glossaryTerms` ou `loreGlossaryTerms`). |
| `src/gl/components/GLQcmModal.jsx` (lignes 215-250) | Même motif, confirmé : deux rangées avant réponse, « Glossaire lore : » et « Glossaire scientifique : », dans le bloc `!loading && !result && presentation`. Après réponse, les rangées du retour existent (lignes 287-320). |
| `src/gl/components/tenir/GLTenirMoment.jsx`, `GLTenirQuestionCard.jsx` | Aucune puce ni lien de glossaire pendant une question : rien à y faire. Dis-le dans ton rapport. |

**Changement attendu** :

1. La rangée de puces n'est **pas rendue** tant que la réponse n'est pas donnée ; elle apparaît avec le retour.
2. Même règle dans `GLQcmModal.jsx`, et dans la carte du moment si elle affichait des puces ou des liens pendant une
   question (vérifié : elle n'en affiche pas).
3. Si le retour ne porte pas de termes alors que la question en montrait, affiche ceux de la présentation sous le
   retour : la rangée « apparaît avec le retour », elle ne disparaît pas.
4. Ne renomme aucun libellé (« Lexique lore : » sera revu au lot ecrans-6).

**Textes** : aucun texte nouveau.

**Tests** (`tests-ui/gl/GLQcmPopover.test.jsx`, `tests-ui/gl/GLQcmModal.test.jsx`) : avant réponse, aucune puce
(`.gl-glossary-chip`) ; après réponse, les puces sont là.

**Critère d'acceptation** : tant qu'un élève n'a pas répondu, aucun bouton de la fenêtre n'ouvre une définition.

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire. Les phrases d'erreur d'Olu et leurs corrections viennent
de `data/gl/tenir/olu-lignes.json` (moment `erreur`), que tu ne modifies pas.

## 7. Vérifications propres au lot

- Banc, régime **fumée** : une passe à la fin.
- e2e (sous le verrou) : celui de l'étape ecrans-2.1 ; `e2e/gl-tenir-tablettes.spec.js`,
  `e2e/gl-tenir-projection.spec.js`, `e2e/gl-tenir-escalier.spec.js`, `e2e/gl-marker-question.spec.js` (fenêtre de
  question d'une case).
- Captures (`docs/captures/gl-decisions/ecrans-2/`), avant et après :
  - erreur d'Olu : projection 1920 × 1080 et tablette 1024 × 768, avant et après la correction ;
  - question : tablette 1024 × 768 pendant une question de zone ; fenêtre de question d'une case du plateau ouverte ;
  - puces : fenêtre de question avant réponse (sans puces), après réponse (avec puces) ;
  - vent : la ligne sur la tablette et la pastille en projection.
- Relecteur `gl-relecteur-garde-fous` sur les textes des étapes ecrans-2.1 et ecrans-2.2.

## 8. Contrats de test changés

- Projection : nouveau bloc de l'erreur d'Olu (test-id à choisir, par exemple `gl-projection-olu` ; donne-le dans ton
  rapport) ; nouvelle mention du vent sur la pastille d'équipe.
- Écran d'équipe : nouvelle ligne `gl-tenir-vent` ; le plateau (`gl-tenir-plateau`) porte `is-question-ouverte` et
  `aria-hidden="true"` pendant une question.
- `useGlTenirOlu` : le moment `erreur` rend une ligne quand le tour lui est passé.
- `.gl-qcm-popover-overlay` : fond presque opaque et `backdrop-filter`.
- `GLQcmPopover` et `GLQcmModal` : aucune puce de glossaire avant la réponse.

## 9. Docs à mettre à jour dans ce lot

| Doc | Quoi |
| --- | --- |
| `docs/reference/gl/guide-du-mj.md` (lignes 300-306 et 732-734) | « Olu glisse son erreur du jour » devient « l'erreur du jour d'Olu s'affiche en projection et sur les tablettes ; vous désignez l'équipe qui l'a trouvée depuis la console ». Le lot ecrans-1 a changé les lignes 296-298 juste au-dessus. |
| `docs/GL_TENIR_A_DEUX_REGLES.md`, § 3 « Les écrans de séance » (hors § 0) | La projection et l'écran d'équipe montrent l'erreur du jour d'Olu ; le plateau se floute pendant une question. |
| `.claude/skills/gl-*`, `foretmap-gl` | Seulement une phrase devenue fausse (erreur d'Olu à la console seulement), s'il y en a. |
| `changelog.d/gl-decisions-ecrans-2.md` | Entre autres : « la réponse d'une question ne se lit plus sur le plateau, derrière ou à côté de la fenêtre ». |

Aucune doc de référence à changer pour les étapes ecrans-2.3 et ecrans-2.4. **Pour le § 0 des règles** : recopie dans
ton rapport une ligne par décision appliquée (15, 27, I3), dans les mots du tableau de la section 2.

## 10. Hors périmètre

- La projection qui montre la question posée, et son plateau flouté : lot ecrans-4.
- L'écran de l'équipe active dans la console, la suppression de `GLTenirEquipeView` : lot ecrans-4.
- La fermeture des fenêtres du plateau en « Tenir » (après elle, `GLQcmPopover` ne sert plus qu'au hors-partie et
  aux anciennes parties classiques) : lot ecrans-4.
- Le tri des questions qui se répondent par le dessin, et les photos des questions réécrites : données, hors de ce
  lot.
- Le texte de vérité des cases (« Belle rencontre… ») : lot contenu-2.
- Les textes des erreurs d'Olu : lot contenu-1. Le tirage sans répétition : lot moteur-1.
- Le renommage des libellés (« Lexique lore : », « Lumière de la classe ») : lot ecrans-6.

## 11. Pour Oliv

**À relire** :

- « Une bêtise s'est glissée. Qui la trouve ? », « {équipe} a trouvé ! », « {équipe} a trouvé : {correction} ».
- « Porté par le vent : la case ne joue pas. », et le choix d'affichage posé dans cette fiche : la phrase se montre
  pour toute case où le vent a posé l'équipe (le vent ne joue jamais la case d'arrivée), sur sa tablette et sur sa
  pastille en projection, jusqu'à son jet. L'ancien texte parlait d'« une case dont l'effet ne joue pas » sans dire où
  ni quand. À confirmer ou à resserrer.
- Les valeurs du fond et du flou pendant une question (à juger sur les captures).
- La place de l'erreur d'Olu sur la tablette si la bulle n'a pas suffi (variante choisie par la session).

**À faire après la vague** : sur une partie de la classe de démonstration à la marche 2, projection ouverte : la
phrase d'Olu est en projection et sur la tablette ; la désigner trouvée : la correction s'affiche. Une question de
zone : le plateau est flouté à côté, plus rien ne s'y lit ; il redevient net après la réponse.
