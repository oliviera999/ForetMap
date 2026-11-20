# Prompt Claude Code : les écrans de séance de Gnomes & Licornes (tablette en trois choses, projection, console, textes)

> **Dépôt** `oliviera999/ForetMap`. Prompt écrit sur `main` **v1.251.1** (`4076fda57`, 20/11 matin), revérifié le
> 20/11 à 18 h sur `main` **v1.253.2** (`ef1638069`) : **le code a changé entre les deux, lis le § 0 bis avant tout**.
> Branche unique `claude/gl-ecrans-de-seance`, **une PR en brouillon** ouverte dès la session 1 et complétée de
> session en session. **Ne fusionne rien toi-même** : Oliv fusionne après la CI verte.
>
> Modèle : **Claude Fable**, effort élevé. Le travail est découpé en **6 sessions qui s'enchaînent toutes
> seules** (§ 00) ; une session ne fait que son lot.

## 00. Organisation en sessions enchaînées (à lire en premier, à chaque session)

### Les 6 sessions

| Session | Lot | Étapes du § 6 | Sortie attendue |
| --- | --- | --- | --- |
| S1 | Préparation, textes, adresse, plateau | § 0, § 0 bis, étapes 1 et 2 | prompt et fichier d'état versés, captures « avant », 2 commits, PR brouillon ouverte |
| S2 | Projection | étape 3 | 1 commit |
| S3 | Tablette, partie 1 : le moteur de la carte du moment | étape 4 : `glTenirMoment.js` + ses tests, `GLTenirBandeau`, `GLTenirTiroir`, `GLTenirMoment` et leurs tests d'écran, **sans brancher** les points de montage | 1 commit |
| S4 | Tablette, partie 2 : le branchement | étape 4 : `GLTenirEcranEquipe`, montage dans `GLTeamSessionView` et `AppGL`, suppression de l'ancien empilement, e2e adaptés, assertion « carte visible sans défilement » | 1 commit |
| S5 | Console | étape 5 | 1 commit |
| S6 | Accueil, docs, clôture | étapes 6 et 7, vérifications complètes du § 8, description de PR du § 9, PR passée de brouillon à prête | 2 commits |

### Le fichier d'état, mémoire entre les sessions

Les sessions ne partagent rien d'autre que la branche. La session 1 verse sur la branche :
- `docs/prompts/GL_ECRANS_DE_SEANCE_PROMPT.md` : **ce prompt, mot pour mot** ;
- `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md` : le fichier d'état, avec une ligne par session (`à faire`,
  `en cours`, `faite`, `bloquée`), le commit produit, les constats écartés, les choix faits sans demander,
  les écarts trouvés dans le code, et **ce que la session suivante doit savoir**.

Chaque session : lit les deux fichiers ; passe sa ligne à `en cours` ; fait son lot ; met à jour l'état
(`faite`, commit, notes) ; pousse ; puis déclenche la suivante. La description de PR finale (S6) se nourrit
de ce fichier.

### Début de chaque session (S2 à S6)

1. Clone le dépôt, `git fetch`, `git checkout claude/gl-ecrans-de-seance`, `git rebase origin/main`
   (résous les conflits ; si un conflit touche un fichier hors G&L que tu ne comprends pas, arrête-toi :
   état `bloquée`).
2. Lis `docs/prompts/GL_ECRANS_DE_SEANCE_PROMPT.md` et `…_ETAT.md`. Trouve la **première** session `à faire`.
   **Si c'est déjà fait ou en cours** (déclenchement en double), ne fais rien et termine sans rien déclencher.
3. Remonte la base locale (§ 0, point 4) et relance `npm test` et `npm run test:ui` : la branche doit être
   verte avant que tu commences. Sinon, répare d'abord ce que la session précédente a cassé, et note-le.
4. Applique le § 0 bis à ton lot : relis le code actuel avant d'écrire.

### Fin de chaque session : le passage de relais automatique

1. Lance les vérifications utiles à ton lot (au minimum `npm run lint`, `npm run format:check`,
   `npm run test:ui`, `npm test`, et les e2e G&L touchés) : **toutes vertes**.
2. Mets à jour le fichier d'état, committe, `git push --force-with-lease` (après rebase), et mets à jour la
   description de la PR brouillon (liste des sessions faites).
3. **Déclenche la session suivante** avec l'outil de planification de la session (tâche planifiée
   ponctuelle, `create_trigger` avec `run_once_at` = maintenant + 5 minutes, dans le **même environnement**,
   `initiation` = `human_schedule`, nom « G&L écrans de séance — S<n+1> »). Le message de la tâche, mot pour
   mot :

   > Continue le chantier « écrans de séance » de Gnomes & Licornes dans le dépôt oliviera999/ForetMap.
   > Clone le dépôt, passe sur la branche `claude/gl-ecrans-de-seance`, lis
   > `docs/prompts/GL_ECRANS_DE_SEANCE_PROMPT.md` (§ 00 d'abord) et `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`,
   > puis fais la première session marquée « à faire », et seulement elle. Modèle attendu : Claude Fable.

   Si l'outil de planification te demande quel réglage d'approbation appliquer, laisse le défaut. Si aucun
   outil de planification n'est disponible, écris-le en tête du fichier d'état et dans la PR (« relais
   manuel : relancer la session S<n+1> avec le message ci-dessus ») et arrête-toi.
4. **Ne déclenche rien** si : ta session est `bloquée` ; les vérifications sont rouges et tu n'as pas pu les
   réparer ; tu es S6. Dans ces cas, la PR et le fichier d'état disent pourquoi, et la tâche planifiée
   suivante n'existe pas : c'est le signal pour Oliv.
5. S6 ne déclenche rien : elle passe la PR en « prête » et s'arrête.

### Garde-fous de l'enchaînement

- Une session = un lot. Ne commence pas le lot suivant « pour gagner du temps », même s'il reste du budget :
  la session suivante le fera.
- Si ton lot est trop gros pour la session (contexte qui sature), committe ce qui est **vert**, note
  précisément ce qui reste dans le fichier d'état (session `S<n>bis` insérée juste après la tienne),
  et déclenche-la à la place de la suivante.
- Jamais plus d'une tâche planifiée créée par session ; 8 sessions au total au maximum (S1 à S6 plus deux
  `bis`) : au-delà, état `bloquée` et arrêt.
- Rien ne se fusionne, rien ne s'écrit en prod, aucun réglage n'est modifié.

---

## 0. Avant de commencer

1. Lis `CLAUDE.md`, `.cursor/rules/foretmap-pr-workflow.mdc`, `docs/GL_TENIR_A_DEUX_REGLES.md` (règles v3,
   elles font foi), et les skills du dépôt `.claude/skills/gl-tenir-garde-fous`, `gl-tenir-moteur`.
2. Vérifie que `main` n'a pas bougé sur les fichiers listés au § 4 depuis `4076fda57`. Si oui, relis-les et
   adapte ; si un constat du § 3 est déjà corrigé, ne le refais pas et dis-le dans la PR.
3. Le **déploiement ne passe plus par `dist` versionné** (bascule `dist-artifact` du 26/09/2026, voir
   `.gitignore` et `docs/DEPLOY_DIST_ARTIFACT.md`) : ne committe pas `dist/`.
4. Base locale : MariaDB (`mysqld_safe`), `npm ci --ignore-scripts`, `npm run db:init`, `.env` avec `DB_*` et
   `JWT_SECRET`. En S1 seulement, lance les trois e2e de référence pour avoir les captures **avant** :
   `npx playwright test e2e/gl-tenir-tablettes.spec.js e2e/gl-tenir-escalier.spec.js e2e/gl-tenir-defis-trame.spec.js --retries=0`
   (ils écrivent dans `docs/captures/tenir-v2/`). Copie-les dans `docs/captures/ecrans-de-seance/avant/`.

## 0 bis — Le code a changé : vérifie avant d'implémenter

Ce prompt a été écrit sur `4076fda57`. Entre ce commit et `ef1638069` (v1.253.2), **79 fichiers** ont bougé
(lots R0, 2, 5 et 6 de l'audit UI/UX de ForêtMap, fiche de coordination CPT). D'autres PR peuvent avoir été
fusionnées depuis. Les numéros de ligne du § 3 sont **indicatifs**. Règle : **pour chaque constat K1 à K13 et
chaque étape, relis le code actuel avant d'écrire une ligne** ; si un constat est déjà corrigé ou si le code ne
correspond plus, adapte ou écarte, et dis-le dans la PR. Ne réimplémente jamais ce qui existe déjà.

Changements déjà repérés qui touchent ce lot :

| Changement sur `main` | Conséquence pour ce lot |
| --- | --- |
| `src/shared/breakpoints.js` : **échelle unique** des points de bascule (`xs` 480, `sm` 640, `md` 768, `lg` 1024), `mediaUp` / `mediaDown`, garde `tests/breakpoints-guard.test.js` (cliquet) | **Aucune valeur hors échelle** dans tes `@media`. Les 900 px et 600 px de la première version de ce prompt sont remplacés (tableau des choix par défaut) : deux colonnes à partir de `lg` (1024 px), ou à partir de `md` (768 px) en paysage ; téléphone en dessous de `sm` (640 px). Convention `min-width: 768px` / `max-width: 767px`. |
| `tests/inline-style-guard.test.js` : **cliquet des styles en ligne** par fichier (`tests/fixtures/inline-style-baseline.json`) | Pas de nouveau `style={{ … }}` : classes CSS, ou `style={{ '--x': v }}` pour une valeur dynamique (non comptée). Le cliquet ne peut que baisser. |
| `scripts/check-bundle-budget.js`, `npm run check:bundle` (cliquet sur l'entrée non connectée) | Les nouveaux composants de l'écran d'équipe ne doivent pas grossir l'entrée publique : charge-les avec l'écran G&L (déjà paresseux), pas dans le bundle d'accueil. Lance `npm run check:bundle`. |
| `src/shared/apiTransport.js` et `src/shared/fetchJsonWithRetry.js` modifiés (message public d'indisponibilité, lot 2) | **Relis K8 sur le code actuel** : le message réseau a peut-être déjà changé côté transport. Ne branche dans `apiGL` que ce qui manque encore. |
| `src/shared/components/EmptyState.jsx` + `empty-state.css` (état vide partagé) | Pour les états « rien à faire » de la carte du moment (`joue`, `attente`), utilise `EmptyState` s'il convient au lieu d'un nouveau composant. |
| `src/shared/glossary/termAutolinkCore.js` (noyau unique des auto-liens, lot 5) | Les textes déplacés gardent leurs auto-liens par ce noyau ; n'en recrée pas. |
| Audit UI/UX ForêtMap (`docs/AUDIT_UI_UX_2026-11-19.md`, § 4) : sessions **B** (lots 1 + 3, mascottes partagées) et **F** (lot 4, moteur `pct-map` partagé) **pas encore fusionnées** au 20/11 18 h | Avant l'étape 2 (`GLPctMapCanvas`, zoom), `git fetch` et regarde si une branche `claude/ui-ux-visite-lot4` (ou une PR du lot 4) touche le moteur de carte. Si oui : ne modifie pas le moteur, ajoute ta prop de présentation **au-dessus** (dans `GLGameBoard`) et signale le recouvrement. |
| Fiche `docs/coordination/cpt-2026-11.md` (sessions CPT en cours) | G&L n'y est pas touché ; elle réserve en revanche `CHANGELOG.md`, `package.json` et les gardes `tests/*-guard.test.js`. Si la fiche est encore sur `main` quand tu ouvres ta PR, **respecte sa convention pour le CHANGELOG** et ne modifie aucune garde (tu ajoutes des tests, tu ne relâches aucun cliquet). |
| PR #707 ouverte (`src/shared/hooks/useDebouncedAutoSave.js`) | Hors de ton chemin ; ne touche pas ce fichier. |

Fais `git fetch && git rebase origin/main` au début, **et de nouveau avant d'ouvrir la PR**, puis rejoue les
vérifications du § 8.

## 1. Contexte en dix lignes

- G&L est un jeu d'écologie d'une année pour des 6e (11 ans), joué en début de séance, piloté par le prof.
- Mouture « Tenir à deux » + ensemble unifié : 4 équipes (2 Gnomes, 2 Licornes), un tour par séance, un voile
  qui avance derrière la caravane, une chasse aux pages du Carnet de Sélène sur le plateau, une seule monnaie
  (les gemmes).
- Trois écrans servent en classe : la **tablette d'équipe** (ou le compte d'un élève), la **console** du prof,
  la **projection** au tableau.
- Audit UI / UX du 19/11 (doc projet `claude/Audit_UI_UX_GL_2026-11-19.md`) : le moteur est prêt, mais ces
  trois écrans sont des pages de texte empilé. Sur la tablette 1024×768, **le plateau commence sous la ligne
  de flottaison** alors qu'Olu dit « touchez la carte ». La projection **n'a aucun style**. La console montre
  tout en même temps.
- Oliv a choisi le 20/11 la **version radicale de la tablette** (doc projet
  `claude/Contre_proposition_tablette_GL.md`, joint en annexe de ce prompt) et le lot A pour la projection,
  la console et les textes.
- Première séance en classe en décembre. Gel des fonctionnalités : **ce lot ne change aucune règle, aucune
  route, aucun schéma**. Il réorganise, cache, agrandit et réécrit ce qui existe.

## 2. Garde-fous

**Lore et ton (tout texte visible des élèves)**
- Le Souffle (et le voile) n'est jamais personnifié ni un ennemi : on le décrit par ses effets (pâlir,
  s'effacer, se dessécher, tenir). Pas de « ronge », « attaque », « tue », « rôde ». Le voile **avance**, il
  ne « chasse » pas.
- Jamais le visage de Sélène ; jamais le nom du corbeau (Krâ / Kraa) dans un texte élève ; rien du tiers
  `secret` du glossaire lore ; ni renversement spatial ni « chute sans bataille ».
- Une erreur ne coûte rien ; le retour dit « Pas encore », jamais « Non » ni « Faux ».
- Parité : formes doubles (« l'Opératrice ou l'Opérateur »), **jamais de point médian**.
- Mots interdits : `src/shared/glGardeFousCore.js` ; tout nouveau texte passe ce filtre (test).

**Adresse (décision d'Oliv du 20/11)**
- **vous** quand l'écran parle à **l'équipe** : tablette d'équipe, projection, choix d'équipe par le lien de
  classe, lignes d'Olu dites en séance à l'équipe.
- **tu** quand l'écran parle à **un élève** : connexion, Seuil, Marché, carnet personnel, badges, Lettre,
  et toute ligne qui interpelle un rôle nommé (« Secrétaire, à toi »).

**Règles d'or techniques**
- Les droits restent ceux servis par le serveur (`tenir.permissions`, noyau `glTenirPermissionsCore`) :
  l'écran **cache** un geste fermé, il ne l'**ouvre** jamais.
- Les bourses de chaque élève **restent visibles** sur la tablette d'équipe (décision d'Oliv du 20/11).
- Isolement G&L / ForêtMap : `src/shared/components/GuidedTourOverlay.jsx` est partagé, toute retouche doit
  rester juste pour ForêtMap (tests des deux côtés).
- Aucun état d'attente sans sortie : chaque état de la carte du moment a une issue (geste, temps réel, ou
  bouton de reconnexion).
- Jamais le banc `tools/gl-sim/` contre la prod. Aucune écriture en prod depuis ce lot.
- Ne modifie **aucun défaut de réglage** (`data/gl/tenir/reglages-defaut.json`, `gl_settings`).

## 3. Constats vérifiés (20/11, `4076fda57`)

| # | Constat | Où |
| --- | --- | --- |
| K1 | À 1024×768 la carte commence vers 760 px : en-tête de session + en-tête d'équipe, « Actualiser », « Maintenant, vous pouvez… », bourses, réserve, 5 boutons, cases à venir, fouilles, Olu, phrase « Le Marché et le Seuil… », **puis** `GLMapView` | `GLTeamSessionView.jsx` l. 131-205 ; `AppGL.jsx` l. ~1140-1200 (onglet `maps`) ; `GLTenirEquipeView.jsx` l. 304-604 |
| K2 | Les gestes fermés restent affichés, grisés, sans raison ; « Jeter un sort » passe avant « Lancer » | `GLTenirEquipeView.jsx` › `gestes` (l. 235) et `gl-tenir-equipe__gestes` |
| K3 | En-tête en double et mot de surface (« · gnomes · tablette ») | `GLTeamSessionView.jsx` l. 134-142 ; `GLTenirEquipeView.jsx` l. 309-325 |
| K4 | Phases en mots techniques (« jeu », « clos », « souffle ») | `PHASE_LABELS` dans `GLTenirEquipeView.jsx` l. 38 et `GLTourScreen.jsx` l. 20 ; `GLProjectionView.jsx` (`round.phase` brut) |
| K5 | Aucune règle CSS pour `.gl-projection`, `.gl-projection__banner`, `.gl-projection__team`, `.gl-projection__lumiere`, `.gl-projection__chasse` ; plateau projeté avec son titre, son bouton plein écran, ses boutons de zoom et le panneau « Équipes » | `src/gl/styles/gl-tenir.css` ; `GLProjectionView.jsx` ; `GLGameBoard.jsx` (`GLGameBoardHud`, `GLGameBoardRoster`) ; `GLPctMapCanvas.jsx` (`GLBoardZoomControls`) |
| K6 | Console « Jouer le tour » : avant la file des demandes, le bandeau porte le lien de projection, `GLClassLinkPanel` (appareils, un « Déconnecter » par équipe), Olu et quatre boutons « corrigé par … » sans titre ; chaque carte d'équipe montre en permanence l'avance libre (champ + motif + « Avancer ») | `GLTourScreen.jsx` l. 250-385 ; `TeamCard` l. 27-115 ; `GLTourDesSaisie` (`allowLibre`) |
| K7 | Bandeau du haut de 208 px chez l'admin (13 onglets sur deux lignes + ligne de compte) pendant la séance | `GLTopBar.jsx` |
| K8 | Panne réseau : `apiGL` n'a pas d'`onNetworkError` ; l'erreur brute « Failed to fetch » remonte en anglais, parfois avec « [requête uuid] », et la section paresseuse de la console reste sur « Chargement de la section… » quand un morceau JS ne se charge pas (déploiement en cours) | `src/gl/services/apiGL.js` › `apiGLRaw` ; `src/shared/apiTransport.js` l. 245 ; `GLGameMasterConsole.jsx` (`lazy`, `MjSectionFallback`) |
| K9 | Visite guidée à une étape : « Fermer » et « Terminer » côte à côte (même effet) ; boutons sans style dans G&L | `src/shared/components/GuidedTourOverlay.jsx` l. 331-340 ; `src/shared/styles/guided-tour.css` |
| K10 | Écran de connexion : « Cinq mondes » (il y a 4 plateaux) ; « une force le ronge : le Souffle » ; « avant que le Souffle ne l'efface » ; vouvoiement (« réécrivez », « Franchissez », « avant vous ») à côté de « Connecte-toi » | `src/gl/constants/authCover.js` ; `GLAuthView.jsx` l. 258-272 |
| K11 | Images de la page d'accueil : 3 PNG d'environ 1,6 Mo (`card_world`, `card_rules`, `card_spells`) + logo de 1 Mo + héros ; `DOMContentLoaded` mesuré à 10,5 s en prod juste après un redémarrage | réglage `platform.brand` (slots) ; `GLAuthView.jsx` |
| K12 | « Lancer :Sentier » (espace mal placé) ; « Annuler le brouillon » | `GLSpellCastWizard.jsx` l. 381 ; `spell-cast/GLSpellCastFooter.jsx` l. 36 |
| K13 | Tu / vous mélangés : « Aucun tour ouvert : attends le prof. » sur l'écran d'équipe ; « touche le plateau pour fouiller » ; ligne d'Olu `olu-pf-main` (« Tu vois ce que fait ton camarade ») dite sur l'écran d'équipe | `GLTenirEquipeView.jsx` l. 319, 519 ; `data/gl/tenir/olu-lignes.json` |

Déjà fait par Oliv en prod le 20/11, rien à coder : `platform.subtitle` = « Le livre de Sélène ».

## 4. Fichiers principalement touchés

`src/gl/components/tenir/GLTenirEquipeView.jsx` (découpé), nouveaux `GLTenirEcranEquipe.jsx`,
`GLTenirBandeau.jsx`, `GLTenirMoment.jsx`, `GLTenirTiroir.jsx`, `src/gl/utils/glTenirMoment.js` ;
`GLTeamSessionView.jsx` ; `AppGL.jsx` (onglet `maps`) ; `GLMapView.jsx`, `GLGameBoard.jsx`,
`GLPctMapCanvas.jsx` (prop de présentation) ; `GLProjectionView.jsx`, `GLTourJournal.jsx` ;
`mj/GLTourScreen.jsx`, `mj/GLTourDesSaisie.jsx`, `mj/GLClassLinkPanel.jsx` ; `GLTopBar.jsx` ;
`src/gl/services/apiGL.js` ; `GLGameMasterConsole.jsx` ; `src/shared/components/GuidedTourOverlay.jsx` ;
`src/gl/constants/authCover.js`, `GLAuthView.jsx` ; `GLSpellCastWizard.jsx`, `spell-cast/GLSpellCastFooter.jsx` ;
`data/gl/tenir/olu-lignes.json` ; `src/gl/styles/gl-tenir.css`, `gl-admin.css` ; tests et e2e associés.

## 5. Décisions verrouillées par Oliv (20/11)

1. **Textes de connexion** (`authCover.js`, `GLAuthView.jsx`), au **tu** :
   - accroche « mission » : « **Quatre mondes, une année, un carnet à sauver.** »
   - phrase d'appel : « **De l'équateur au pôle, réécris le monde vivant avant qu'il ne s'efface.** »
   - quatrième de couverture :
     1. « Une voyageuse est partie avant toi — de l'équateur au pôle Nord, pour connaître et nommer tout le
        vivant. Elle a tout consigné dans un carnet. Puis le carnet est revenu seul. Et il s'efface. »
     2. « **Car le carnet pâlit : sous le Souffle, le monde se dessèche jusqu'au nom des êtres.** Franchis le
        miroir, deviens Gnome qui répare ou Licorne qui révèle, et reprends sa route. Observer, comprendre,
        nommer le vivant suffit à le faire réapparaître. »
     3. « Une année entière pour réécrire le carnet, avant qu'il ne disparaisse. »
   - les deux autres accroches ne changent pas.
2. **Adresse** : règle du § 2 (vous à l'équipe, tu à l'élève).
3. **Bourses** visibles sur la tablette, dans le bandeau d'équipe.
4. **Tablette en trois choses** (version R) : § 6, étape 4.
5. Projection, console et textes : lot A, § 6, étapes 1 à 3 et 5.

## Choix par défaut (fais-les sans demander ; signale-les dans la PR)

| Sujet | Choix |
| --- | --- |
| Seuil de la mise en page à deux colonnes de la tablette | à partir de `lg` (1024 px), ou à partir de `md` (768 px) en paysage (`orientation: landscape`) ; sinon carte en haut et feuille d'action en bas (échelle de `src/shared/breakpoints.js`) |
| Largeurs | carte ≈ 62 %, colonne d'action ≈ 38 % (min 320 px) |
| Ordre du gros bouton | répondre, lancer, fouiller, lire, sorts |
| Puces des autres gestes ouverts | 3 au plus, sous le gros bouton |
| Gestes fermés | absents (plus de boutons grisés) |
| Bourses sur téléphone (en dessous de `sm`, 640 px) | dans le tiroir, faute de place ; partout ailleurs dans le bandeau |
| « Actualiser » | supprimé de la tablette ; une icône de reconnexion n'apparaît que si la connexion temps réel est perdue ou l'état périmé (`etatPerime`) |
| Phases (élève) | ouverture : « Le tour s'ouvre » ; jeu : « À vous de jouer » ; souffle : « Le voile avance » ; clos : « Tour terminé » |
| Phases (console) | mêmes mots, avec le terme technique en infobulle |
| Projection : journal | 3 derniers faits marquants (page trouvée ou tenue, défi relevé, voile qui avance, arrivée au camp, péripétie), en gros |
| Projection : taille de texte | `clamp(20px, 1.4vw, 32px)` pour le corps, titres au double |
| Mode séance de la console | actif tant que l'écran « Jouer le tour » est ouvert ; bandeau du haut réduit à une ligne (nom de la partie, tour, bouton « Menu » qui redéplie les onglets) |
| Images d'accueil | variante WebP générée à l'envoi (sharp, déjà en dépendance), largeur ≤ 1600 px, cible ≤ 200 Ko ; `loading="lazy"` et `decoding="async"` sur les trois vignettes |

## 6. Étapes (un commit par étape, tests verts à chaque commit ; répartition par session au § 00)

### Étape 1 — Textes et adresse (K10, K12, K13, K4 côté élève)

- `authCover.js` et `GLAuthView.jsx` : textes du § 5.1 ; tests `tests-ui` existants de la page de garde mis
  à jour (et `pickGlAuthTagline` inchangé).
- `GLSpellCastWizard.jsx` : « Lancer : Sentier » (espace insécable avant les deux-points) ;
  `GLSpellCastFooter.jsx` : « Ne pas lancer ».
- Passe d'adresse sur les textes **visibles en séance sur l'écran d'équipe et la projection** :
  `src/gl/components/tenir/*`, `src/shared/glSortMomentsCore.js`, `data/gl/tenir/olu-lignes.json` (lignes
  dites à l'équipe : `olu-pf-main` → « Un seul écran joue à la fois. Vous voyez ce que fait votre camarade ;
  à la prochaine action, cet écran reprend la main. » ; garde le **tu** pour `olu-28`, `olu-pf-marche`,
  `olu-pf-lettre`, qui parlent à une personne). Liste chaque ligne changée dans la PR.
- Ajoute un test de contenu `tests/content/gl-adresse-ecran-equipe.test.js` : aucune chaîne de
  `src/gl/components/tenir/` ni ligne d'Olu de contexte « séance / équipe » ne contient « tu / ton / ta / tes
  / toi » hors liste blanche (lignes adressées à un rôle).
- Phases : un seul module `src/gl/constants/tenirPhases.js` (`PHASE_ELEVE`, `PHASE_CONSOLE`), utilisé par
  l'écran d'équipe, la projection et la console (supprime les deux `PHASE_LABELS`).
- Garde-fous : tous les nouveaux textes passent `glGardeFousCore` (test).

### Étape 2 — Plateau : une prop de présentation (préalable aux étapes 3 et 4)

- `GLGameBoard` (et `GLMapView`, qui la transmet) reçoit `presentation` : `'standard'` (défaut, rien ne
  change), `'tenir'`, `'projection'`.
  - `'tenir'` : pas de `GLGameBoardHud` (ni titre « Carte de jeu »), pas de `GLGameBoardRoster` ; zoom au
    pincement et à la molette conservé ; un seul bouton « Recentrer » ; le plateau remplit la hauteur de son
    conteneur (`height: 100%`, l'image en `contain`).
  - `'projection'` : comme `'tenir'`, sans aucun bouton, ni pan ni zoom.
- Tests d'écran : les trois présentations (présence et absence du HUD, du roster, des boutons).

### Étape 3 — Projection, mode tableau (K5)

- `GLProjectionView` : grille plein écran (`100vh`, pas de défilement à 1920×1080) :
  - bandeau haut : nom de la partie, tour et phase en mots d'élève (`PHASE_ELEVE`), sablier ;
  - à gauche (≈ 70 %), le plateau en `presentation="projection"`, avec le voile ;
  - à droite : les 4 équipes en grosses pastilles (mascotte, nom, case, « sous le voile », « un seul dé ») ;
    la Lumière en jauge ; le carnet de la classe en pages (dort, trouvée, tenue, pâlie), avec « trouvée par »
    ou « tenue par » ;
  - en bas, les 3 derniers faits marquants (`GLTourJournal` reçoit une prop `marquants` qui filtre les types
    et `limit={3}`).
- À la clôture (`accroche`) : la carte « À la prochaine séance » **remplace** l'écran (plein écran), avec la
  page du Passeur et l'indice endormi ; un petit bouton « Voir le plateau » pour revenir.
- Voile plus lisible en projection : modificateur `.gl-voile-layer--projection` (bande plus opaque, contour)
  sans pictogramme ni visage.
- Style dans `gl-tenir.css`, bloc « Projection » ; corps de texte selon le choix par défaut.
- Test d'écran : rien ne déborde du viewport à 1920×1080 (pas de barre de défilement verticale) ;
  e2e : capture `docs/captures/ecrans-de-seance/apres/projection-1920x1080.png` et
  `projection-accroche-1920x1080.png`.

### Étape 4 — Tablette d'équipe en trois choses (version R, K1, K2, K3)

**Structure.** Nouveau `GLTenirEcranEquipe` (même composant pour la tablette `GLTeamSessionView` et pour le
compte d'un élève dans `AppGL`, onglet `maps`) :

```
<GLTenirEcranEquipe board={<GLMapView … presentation="tenir" />} …>
  ├─ GLTenirBandeau   (haut, toujours visible)
  ├─ zone carte       (le `board` reçu)
  ├─ GLTenirMoment    (colonne d'action : une seule carte du moment, puis la bulle d'Olu)
  └─ GLTenirTiroir    (« L'équipe », fermé par défaut, par-dessus la carte)
```

`GLTenirEquipeView` devient ce conteneur (ou disparaît au profit de `GLTenirEcranEquipe`) ; ses blocs
existants sont **déplacés**, pas réécrits. Les deux points de montage cessent de rendre séparément l'écran
d'équipe puis `GLMapView`.

**Mise en page.** À partir de `lg`, ou de `md` en paysage : deux colonnes (carte ≈ 62 %, colonne d'action ≈ 38 %), hauteur
`100dvh` moins le bandeau, **aucun défilement de page** ; la colonne d'action défile seule si besoin.
Sinon : carte en haut (≈ 55 dvh), carte du moment dans une feuille fixée en bas (au-dessus de
`GLMobileNav` sur un compte élève).

**Bandeau (`GLTenirBandeau`).** Mascotte et nom de l'équipe ; phase (`PHASE_ELEVE`) ; `GLSablier` s'il
tourne ; **bourses** : une pastille par membre (pseudo coupé à 12 caractères, 💎 n) ; bouton ☰ « L'équipe »
avec une pastille de nouveauté quand le contenu du tiroir change ; icône de reconnexion seulement si la
connexion temps réel est perdue ou si `etatPerime` est posé (son clic fait ce que faisait « Actualiser »).
Plus d'en-tête de session séparé ni de mot de surface.

**Carte du moment (`GLTenirMoment`).** Une fonction pure `momentDeLEquipe(entrée)` dans
`src/gl/utils/glTenirMoment.js` rend `{ etat, geste?, role?, texte?, puces[] }` ; le composant affiche
**un seul** état, le premier vrai de cette liste :

| Ordre | `etat` | Condition (données déjà présentes) | Affichage (bloc existant déplacé) |
| --- | --- | --- | --- |
| 0 | `peripetie` | `peripetie` | `GLPeripetieOverlay`, inchangé |
| 1 | `main_ailleurs` | `mainAilleurs` | « {pseudo} prépare un sort… », rien d'autre |
| 2 | `appareil` | demande d'appareil à accepter ou tablette en attente (`GLEquipeAppareils`) | le bloc d'acceptation |
| 3 | `question` | `caseQuestion.question` ou `chasse.question` | `GLTenirQuestionCard` en pleine colonne |
| 4 | `jet_suspens` | `jetEnSuspens` | bloc existant : « Garder ce jet », « Relance… » |
| 5 | `saisie_des` | `pending === 'lancer'` | `GLTourDesSaisie` |
| 6 | `jet_attente` | `jetEnAttente` | « Jet saisi : le prof valide. » |
| 7 | `retour` | `verdict` ou `caseQuestion.feedback` récents, non acquittés | « Pas encore » ou retour juste, piste et bouton « Ouvrir la fiche / le glossaire », bouton « Continuer » (acquitte) ; le geste suivant acquitte aussi |
| 8 | `geste` | `maintenantVousPouvez(...)` non vide | **gros bouton** du premier geste selon l'ordre du choix par défaut, avec le rôle au-dessus (« GESTIONNAIRE ») et le texte du geste ; les autres gestes ouverts en puces (3 au plus) ; en mode fouille, le bouton devient « Touchez la carte · n fouilles » avec « Arrêter de fouiller », et la carte prend un bord doré |
| 9 | `joue` | phase `jeu`, plus rien d'ouvert | « Votre tour est joué. Regardez les autres équipes. » |
| 10 | `souffle` | phase `souffle` | « Le voile avance. » (le voile bouge sur la carte) |
| 11 | `clos` | phase `clos` | `GLDefisCasePanel` (défi à préparer) et entrée des défis de la Trame |
| 12 | `camp` | partie `ended` | `GLCeQuiChange` |
| 13 | `attente` | aucun tour ouvert | « Le prof ouvre bientôt le tour. » |

Bandeaux d'une ligne au-dessus de la carte du moment, seulement s'ils sont vrais : encordée
(`encordeePar`), un seul dé (`maVue.unDe`), en retrait (`tenir.enRetrait`), pion sous le voile
(`fouilles.sousVoile` ou position ≤ voile).

Sous la carte du moment : `GLOluBulle`, toujours. En état `geste`, tant que l'équipe n'a fait aucun geste
du tour, une puce « Il manque quelqu'un ? » ouvre `GLPresencePanel` (sinon il vit dans le tiroir).

**Tiroir (`GLTenirTiroir`).** Fermé par défaut, panneau latéral par-dessus la carte (ou plein écran sur
téléphone) : les 6 cases à venir **en pastilles** (numéro, icône de la case, libellé court) ; la réserve de
la caravane ; le défi à préparer (rappel) ; le carnet de la classe et le Bestiaire (`GLCarnetClasseView`,
`GLBestiairePanel` ; le geste « Lire » ouvre aussi ce carnet) ; `GLPresencePanel` ; `GLEquipeAppareils`
(hors demande à accepter) ; « Changer d'équipe » (tablette) ; « Mes badges » (compte élève, comme
aujourd'hui) ; les bourses sur téléphone.

**Supprimé.** Le second en-tête et le mot de surface ; « Actualiser » ; la liste « Maintenant, vous
pouvez… » (ses textes vivent dans le gros bouton et les puces) ; la phrase « Le Marché et le Seuil
s'ouvrent depuis le compte de chacun » (devient une ligne d'Olu « première fois » `olu-pf-comptes`, dite
une fois sur la tablette : « Le Marché et le Seuil s'ouvrent depuis le compte de chacun. ») ; les boutons
grisés.

**Contrats de test à garder** pour limiter la casse : `data-testid="gl-tenir-equipe"` sur la racine,
`data-testid="gl-tenir-maintenant"` sur la carte du moment en état `geste`, `data-geste="<geste>"` sur le
gros bouton **et** sur chaque puce, les `data-testid` existants des blocs déplacés (`gl-tenir-jet-suspens`,
`gl-tenir-piste-reponse`, `gl-tenir-un-de`, `gl-tenir-encorde`, `gl-tenir-etat-perime`, `gl-tenir-reserve`,
`gl-tenir-cases-a-venir`, `gl-sablier-phase`…). Un test qui attendait un bouton **grisé** attend désormais
son **absence**.

**Tests.**
- `tests-ui/gl/glTenirMoment.test.js` : chaque ligne du tableau, priorités croisées (question et fouille
  ouvertes ensemble, main ailleurs pendant une question, retour puis geste suivant, souffle, clos, camp,
  équipe de 4 où l'Assistante ou l'Assistant répond).
- Tests d'écran de `GLTenirBandeau` (bourses visibles, pastille de nouveauté), `GLTenirTiroir`,
  `GLTenirEcranEquipe` (une seule carte du moment à la fois).
- e2e : adapter `gl-tenir-tablettes`, `gl-tenir-escalier`, `gl-tenir-defis-trame` ; **nouvelle assertion** à
  1024×768 : la boîte du plateau a `y < 120` et la carte du moment est entièrement dans le viewport, sans
  défilement ; à 390×844 : le plateau est visible et la feuille d'action aussi.

### Étape 5 — Console du prof (K6, K7, K8, K9)

- **Mode séance** : tant que `GLTourScreen` est monté, le bandeau `GLTopBar` passe en une ligne (nom de la
  partie, tour, bouton « Menu » qui redéplie les onglets) ; retour normal en quittant l'écran du tour.
- **Ordre de `GLTourScreen`** : bandeau du tour (phase, sablier, « Lien de projection », « Quitter ») →
  **Demandes** → équipes → le reste. `GLClassLinkPanel` replié en une ligne (« 4 tablettes connectées ✓ »
  ou « 1 tablette attend »), déplié au clic, et déplié d'office s'il y a une tablette en attente.
- **Erreur d'Olu** : titre « Qui a trouvé l'erreur d'Olu ? » au-dessus des boutons, qui deviennent le nom
  seul de chaque équipe.
- **Cartes d'équipe** : case, dés, fouilles, réserve, « Lancer » ; l'avance libre (`allowLibre` de
  `GLTourDesSaisie`) passe derrière un bouton « Corriger la position… » (le motif reste obligatoire).
- **Erreurs réseau** : `apiGL` reçoit un `onNetworkError` qui rend le message français existant
  (`networkFailureUserMessage` de `src/services/api.js`, version adulte pour le staff, version élève sinon) ;
  l'identifiant de requête n'apparaît plus dans le texte visible d'un élève (le garder pour le staff, en
  petit ou en infobulle). Les `lazy()` de `GLGameMasterConsole` passent par un `lazyAvecReprise`
  (deux nouvelles tentatives, puis un message « L'application vient d'être mise à jour » avec un bouton
  « Recharger ») au lieu de rester sur « Chargement de la section… ».
- **Visite guidée** (`GuidedTourOverlay`, partagé) : au dernier pas, un seul bouton « Terminer » ; pas de
  point de progression quand il n'y a qu'une étape ; vérifie que les boutons prennent le style de l'app
  dans G&L **et** dans ForêtMap (captures des deux).
- Tests d'écran du mode séance, du repli des appareils, de « Corriger la position… », de l'erreur réseau
  et de la reprise des morceaux paresseux.

### Étape 6 — Poids de l'accueil (K11)

- Repère le chemin d'envoi des images de marque (`platform.brand.slots` ; éditeur `GLBrandEditor` /
  `GLImageSourceField`). À l'envoi, génère une variante WebP (sharp) selon le choix par défaut et enregistre
  son URL dans le slot ; garde l'original.
- Script idempotent `scripts/gl-brand-optimiser.js` (sans écriture si rien à faire, `--dry-run` par défaut)
  pour les images déjà en base ; **ne le lance pas** contre la prod, Oliv le lancera.
- `GLAuthView` : `loading="lazy"`, `decoding="async"`, dimensions explicites sur les vignettes (pas de saut
  de mise en page).
- Test : le slot pointe vers la variante après l'envoi ; le script ne touche pas une image déjà optimisée.

### Étape 7 — Docs et captures

- `docs/GL_TENIR_A_DEUX_REGLES.md` : passage « écran d'équipe » réécrit (carte du moment, bandeau, tiroir) ;
  les docs de `docs/reference/` qui décrivent l'écran d'équipe, s'il y en a ; skills `.claude/skills/gl-tenir-*` devenus faux.
- `docs/captures/ecrans-de-seance/avant/` et `apres/` : tablette 1024×768 (états `geste`, fouille,
  `retour`, `main_ailleurs`, tiroir ouvert), téléphone 390×844, console 1440×900 (mode séance), projection
  1920×1080 (jeu et accroche), connexion.
- CHANGELOG sous `[Non publié]`, une entrée « Modifié — G&L : écrans de séance » ; ne touche pas à la
  version.

## 7. Hors périmètre

- Toute règle, route, migration, défaut de réglage.
- Le nom de l'onglet « Cartes » (collision avec les cartes Job / Team Spirit) : à trancher par Oliv plus tard.
- Le contenu scientifique des questions, des pistes et des défis.
- Une version « ordinateur » distincte de l'écran d'équipe (option R′ écartée par Oliv).
- Les noms des titres (`titres.json`).

## 8. Vérifications (toutes vertes avant d'ouvrir la PR)

```
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npm run check:bundle
npx playwright test --project=chromium e2e/gl-*.spec.js
```

Plus le scénario `npm run gl:sim -- --scenario tablette-parallele-absences --seed 1` (graine fixée, lancé avant et après le lot) pour vérifier que
rien du moteur n'a bougé (mêmes chiffres qu'avant le lot).

## 9. Description de PR attendue (rédigée par S6, à partir du fichier d'état)

1. Ce qui a changé, écran par écran, avec les captures avant / après.
2. Constats du § 3 écartés parce que déjà corrigés ou faux.
3. **Choix faits sans demander** (tableau du § 5 et tout autre choix), dont la liste des lignes de texte
   passées au vous ou gardées au tu.
4. Les contrats de test changés (grisé → absent) et pourquoi.
5. Le chiffre du banc avant / après (identique attendu).
6. Vérification manuelle en classe, en dix lignes : une tablette d'équipe, un téléphone d'élève, la console
   sur le PC du prof, la projection au vidéoprojecteur lue du fond de la salle ; ouvrir un tour, lancer,
   fouiller deux fois, répondre faux (« Pas encore » + piste), tenir une page, passer au souffle, clore ;
   couper le Wi-Fi d'une tablette 30 s et vérifier l'icône de reconnexion.

## 10. Après la fusion, à faire par Oliv

- Lancer `node scripts/gl-brand-optimiser.js` (d'abord à blanc, puis `--apply`) sur le serveur, ou
  renvoyer les trois images de l'accueil depuis l'éditeur de marque.
- Relire les lignes de texte changées (liste de la PR), surtout les lignes d'Olu.
- Répétition générale sur vrais appareils (passe 1 du CONTEXTE), puis `gl_seance apres`.

---

## Annexe : la contre-proposition retenue (résumé)

La tablette montre ce que l'équipe **a à faire maintenant**, pas tout ce qu'elle pourrait faire : la carte
(grande, la scène du jeu), **une** carte du moment (un gros bouton, une question, un retour, un jet à garder)
et Olu. Un bandeau fin porte la mascotte, la phase, le sablier et les bourses ; un tiroir « L'équipe », fermé
par défaut, garde le reste. Aucune règle ne change : l'ordre des gestes est déjà calculé par
`maintenantVousPouvez` (`src/shared/glSortMomentsCore.js`). Doc complet : `claude/Contre_proposition_tablette_GL.md`
dans le projet claude.ai.
