# Addendum 2 au prompt orchestrateur · immersion : écrans, mots du voyage, son, vitrine

Écrit le 24/11/2026 à 11 h 45, sur `main` = prod = v1.263.5 (`b8b5344`, vérifié à 10 h ; le recalage de 11 h 30 n'a
pas pu joindre GitHub). Source : `claude/Audit_ambiance_GL_2026-11-24.md`,
`claude/Audit_ecrans_onglets_popovers_GL_2026-11-24.md`, `claude/Vocabulaire_et_esthetique_GL_2026-11-24.md`.

**À verser dans `claude/PROMPT_Claude_Code_GL_orchestrateur_decisions.md` au recalage qui précède son lancement**,
comme l'addendum du lot 2 (questions de lecture), et **seulement pour les décisions qu'Oliv a cochées au § 0**. Une
décision non cochée part au § 6 (hors périmètre) du prompt, avec la mention « proposée le 24/11, non retenue ».

---

## 0. Décisions à cocher par Oliv

Toutes sont présentées comme des **corrections** (une règle existante est enfreinte, un texte faux est servi, une
boucle est cassée). Aucune route, aucun réglage, aucun défaut de réglage, aucun schéma. Les choix de lore sont
marqués **(lore)**.

| ✓ | # | Décision proposée | Lot, étape |
| --- | --- | --- | --- |
| ☐ | **I1** | En « Tenir », le plateau n'ouvre plus ses propres fenêtres de question et d'effet : tout passe par la carte du moment (F3, probable cause de « l'éléphant visible »). | 7, étape 31 |
| ☐ | **I2** | Sur la tablette d'équipe, la piste d'un « pas encore » s'ouvre (fiche ou mot, en lecture seule, « Revenir au jeu ») (F4). | 7, étape 32 |
| ☐ | **I3** | Pendant une question, rien n'est consultable : les puces du glossaire sous les choix sont masquées tant que la réponse n'est pas donnée (F10). | 6, étape 33 |
| ☐ | **I4** | Le lexique du voyage ne montre à un élève que les termes de son monde ou des mondes déjà traversés (`chapitre_scope`) : plus de nom de visage avant son plateau (F2). | V, étape V2 |
| ☐ | **I5** | La visite d'Olu ne démarre jamais pendant un tour, se ferme au changement d'onglet, ne se relance pas à chaque sous-onglet ; ses textes décrivent « Tenir » (F5, E5). | V, étape V3 |
| ☐ | **I6** | **(lore)** Les mots du voyage à l'écran d'un élève : le plateau devient **le monde**, **le chemin** ou **le paysage** selon le sens ; la classe devient **la caravane** (toujours toute la classe, jamais une équipe) ; jamais « joueur », « partie », « MJ », « maître du jeu », « feuillet », « statistiques » après le miroir. Avant le miroir (connexion, lien de classe, données, vitrine des parents), rien ne change. Options B et C : § 1.4 de `Vocabulaire_et_esthetique_GL_2026-11-24.md`. | 2, étape 24 ter ; V, étape V1 |
| ☐ | **I7** | Les pages servies aux élèves disent le jeu d'aujourd'hui : « Les règles du jeu » réécrites, trois phrases de l'« Introduction », les cinq grimoires de chapitre, la zone « Zone », les cases de camp 41 et 76 (F1, F8, F9, F11). | V, étape V4 (migration) |
| ☐ | **I8** | La vitrine des invités montre le premier monde (plus le chapitre « test »), aucun message d'administration, et l'écran de connexion montre l'image d'accueil de la marque ; « moor » sort du glossaire. | V, étapes V4 et V5 |
| ☐ | **I9** | Le plateau n'est plus posé sur un rectangle bleu ciel (couleur de ForêtMap codée en dur) : fond sombre de la couleur du monde, liseré doré. | V, étape V6 |
| ☐ | **I10** | La musique par biome joue (clés réparées), **sur la projection seule** ; plus de bouton de musique orphelin ailleurs ; la musique d'intro de l'app ne prend plus une image pour un son (S1, S2, S3, F7). | S, étapes S1 à S3 |

**Hors de cet addendum, sur demande d'Oliv par le connecteur** (données réversibles) : les quatre thèmes de
chapitre (E1) et le fond de marque ; `gameplay.lore_spoiler_max_level` → `cle` en attendant I4 ;
`modules.tutorials_enabled` → false ; `modules.zone_music_enabled` → false. **Après deux séances** : regroupement des
onglets en cinq, habillage en une ligne, icônes peintes, typographie, sons du tour (S4), voile qui pâlit (A1),
règles communes des popovers (§ 4.2 de l'audit des écrans).

## 1. Où verser

1. **§ 00.3, tableau des lots** : ajoute deux lignes et complète trois fiches.

   | Lot | Titre | Étapes (§ 5) | Charge | Attend | Fichiers principaux (réservés) | Migration |
   | --- | --- | --- | --- | --- | --- | --- |
   | V | Les mots du voyage, la visite d'Olu, la vitrine, le fond du plateau | V1 à V6 | moyenne | 2, 5, 6, 7, H | `src/gl/constants/app-runtime.js` (libellés), `src/gl/constants/glDiscoveryTour.js`, `src/gl/context/GLTourContext.jsx`, `routes/gl/lore.js` (filtre du lexique), `lib/glLoreGlossaryMatch.js`, `GLLoreGlossaryView.jsx`, `src/gl/hooks/useGlGameRuntime.js` (chapitre invité), `GLSpeciesCatalog.jsx`, `GLAuthView.jsx`, `GLSpellCastWizard.jsx`, `GLSeleneCarnetView.jsx`, `src/gl/styles/gl-theme.css` (`.gl-board`), `tests/content/gl-mots-du-voyage.test.js` (nouveau) ; chaînes d'élève dans `src/gl/components/tenir/*`, `GLProjectionView.jsx`, `glTenirMoment.js`, `tenirTextes.js` **après** les lots 6 et 7 | `N+5` |
   | S | Le son : la projection chante | S1, S2, S3 | légère | 7 | `src/gl/utils/resolvePlateauAudioSlug.js`, `src/gl/hooks/useGLPlateauMusic.js`, `src/gl/hooks/useGLZoneMusic.js`, `src/gl/components/MusicPlayer.jsx`, `GLZoneMusicMuteButton.jsx`, résolveur de la musique d'intro, montage de `MusicPlayer` dans `AppGL.jsx` et `GLProjectionView.jsx` | — |

   - **Lot 2** : ajoute l'étape **24 ter** à ses étapes (ordre : 24, 24 bis, 24 ter, 8, 5, 3, 23, 22) et
     `data/gl/tenir/{missions,parures,defis-cases}.json` (et `exemple/`) à ses fichiers réservés.
   - **Lot 6** : ajoute l'étape **33** (ordre : 13, 22 vent, 30, 33) et `GLQcmModal.jsx` à ses fichiers.
   - **Lot 7** : ajoute les étapes **31** et **32** (après la suppression de `GLTenirEquipeView`, avant les e2e), et
     `useGLMarkerArrival.js` (paramètre d'activation seulement ; le lot M en possède l'animation),
     `GLSpeciesDetailModal.jsx`, `GLGlossaryPopover.jsx` à ses fichiers.
2. **Ordre de priorité** : 1, 2, 3, B, M, 6, 5, 4, 7, H, **S, V**, 8, 9. Le lot 8 attend aussi S et V.
3. **Plafond** : 14 sessions de lot + 5 reprises, soit 19 sessions lancées.
4. **Migrations (§ 00.2, point 3)** : lot V → `N+5`.
5. **§ 1, gel** : ajoute l'exception nommée « **Lots S et V** (décisions I1 à I10, cochées par Oliv le …) : corrections
   de textes et d'écrans ; une migration de données (lot V), gardée par l'ancien texte ; aucune route, aucun réglage,
   aucun schéma ».
6. **§ 3, décisions** : ajoute les lignes cochées I1 à I10, datées du jour où Oliv les coche. **Choix par défaut posés
   par Claude** : ceux du § 4 de cet addendum.
7. **§ 7, docs** : ajoute les lignes du § 5 de cet addendum. **§ 9** : « Tableau des décisions » compte aussi I1 à I10
   cochées ; captures du § 3 de cet addendum. **§ 10** : ajoute le point du § 6 de cet addendum.
8. **Contrats de test changés** (§ 7) : libellés d'onglets (« Le chemin », « La caravane », « Le lexique du voyage »,
   « Mes pages », « Ma bourse et mes progrès ») ; `markerArrivalEnabled` faux en « Tenir » ; textes de la visite
   d'Olu ; chapitre des invités ; fond de `.gl-board` ; montage de `MusicPlayer` (projection seule).

## 2. Étapes

### Étape 24 ter — Catalogues : les mots du voyage (décision I6) · lot 2

Dans `data/gl/tenir/` et leurs copies `exemple/` (quand un test y lit le texte) :

| Fichier | id | Champ | Nouveau texte |
| --- | --- | --- | --- |
| `olu-lignes.json` | `olu-38` | `texte` | « Le voile recule de cinq. La caravane a tenu ses cartes, et le monde le sent. » |
| | `olu-52` | `texte` | « Le lion polaire. Je ne connaissais pas. Je crois que la caravane vient d'adopter une chimère. » |
| | `olu-70` | `texte` | « Un défi pour votre équipe ! Vous avez jusqu'à la prochaine séance pour le préparer. » |
| | `olu-pf-chercher` | `texte` | « Les pages du carnet dorment dans le paysage. Deux fouilles par tour : touchez le dessin là où l'indice vous mène. » |
| | `olu-pf-lumiere` | `texte` | « La jauge de Lumière monte avec les cartes que la caravane garde. Pleine, elle fait reculer le voile de cinq cases. » |
| | `olu-pf-camp` | `texte` | « Le camp ! On pose les sacs. Regardez ce qui change dans le monde suivant : votre peuple, vos sorts, le chemin. » |
| `sorts.json` | `SL045` | `effet_court` | « … et le voile ne vous touche pas. Dans le quatrième monde, la première Cordée de chaque équipe est offerte. » (début inchangé) |
| | `SL027` | `effet_court` | « expliquer deux minutes à toute la caravane une page ou une espèce ; payé une fois, un « pas encore » se retente sans repayer » |
| | `SL048` | `effet_court` | « une page écrite par l'élève entre au carnet de la caravane, en marge, après relecture ; un « pas encore » se réécrit sans repayer » |
| `peripeties.json` | `per-03` | `texte` | « Une colonne de fourmis traverse le chemin : l'équipe se lève, fait le tour de sa table en file indienne, et se rassied. Personne ne marche sur la colonne. » |
| `missions.json` | `mis-20` | `texte` | « Faire reculer le voile (carnet complet ou Lumière) au moins une fois dans le chapitre. Mission de toute la caravane : si elle réussit, toutes les équipes la réussissent. » |
| `parures.json` | `pelage_bestiaire` | `description` | « La mascotte prend le pelage d'une chimère de la caravane : taches, rayures et couleurs que la science n'a jamais validées. » |
| | `pelage_neon` | `description` | « Un pelage qui brille dans la nuit polaire, vert et rose comme une aurore, visible de tout le chemin. » |
| `defis-cases.json` | `d-p1-mime` | `consigne` | « Une ou un membre de l'équipe mime un animal de la savane en train d'utiliser son astuce pour survivre. Les autres équipes doivent trouver l'animal ; l'équipe explique ensuite l'astuce. » |
| | `d-p1-mime` | `critere` | « Les autres équipes trouvent l'animal et l'équipe explique une astuce juste (girafe et long cou pour les acacias, suricate sentinelle, éléphant qui creuse pour l'eau…). » |
| | `d-p2-mime` | `consigne` | « Une ou un membre de l'équipe mime comment un animal du désert résiste à la chaleur ou à la soif. Les autres équipes doivent trouver l'animal ; l'équipe explique ensuite l'astuce. » |
| | `d-p2-mime` | `critere` | « Les autres équipes trouvent l'animal et l'équipe explique une astuce juste (fennec et grandes oreilles, gerboise qui sort la nuit, dromadaire et ses réserves, addax qui tire l'eau des plantes…). » |

- Étape 22 (même lot) : le texte de vérité des cases favorables devient « Belle rencontre : l'équipe repart. » (et non
  « la caravane », qui désigne toute la classe).
- Cherche les autres occurrences dans les champs **visibles d'un élève** de tous les catalogues (`texte`,
  `effet_court`, `description`, `consigne`, `titre`, `question`, `feedback_*`, `correction`) : `\bplateaux?\b`,
  `\bclasse\b`, `\bjoueu(r|rs|se|ses)\b`, `\bpartie\b` au sens de partie de jeu, `feuillet`. Corrige selon le lexique
  (§ 2.2 de cette étape) ou liste-les dans ton fichier de lot si le sens est douteux. Les champs privés (`titre_prive`,
  `note`, `critere_prof`, `note_prof`, `regle`, `notes.*`, `format`) ne changent pas. `titres.json` et les noms de
  sceaux (« Gardiens de la Marée Reculée », masculin seul) : décision d'Oliv, liste-les.
- **Lexique** (pour toi comme pour le lot V) : le plateau comme lieu ou chapitre → « le monde » (« ce monde », « le
  deuxième monde ») ; comme suite de cases → « le chemin » ; comme dessin où dorment les pages → « le paysage » ; la
  classe en jeu → « la caravane » ; la classe dans un défi joué en vrai → « les autres équipes » ; un joueur → « une ou
  un membre de l'équipe » ; restent : dé, case, tour, équipe, carte Job, carte Team Spirit, prof, séance.

### Étape 31 — Plus de fenêtre du plateau en « Tenir » (décision I1) · lot 7

**Constat lu dans le code le 24/11 sur v1.263.5** (pas vu à l'écran) : sur l'écran d'équipe, la question de case passe
par la carte du moment (`useGlQuestionDeCase`) ; mais le plateau garde son crochet d'arrivée (`useGLMarkerArrival`,
activé par `markerArrivalEnabled` dans `GLTeamSessionView.jsx` vers la ligne 152, et dans `AppGL.jsx` pour le compte
d'élève). Quand le serveur pose l'équipe sur une case question ou effet, il ouvre aussi `GLQcmPopover` ou
`GLMarkerEffectPopover` (`GLGameBoard.jsx`, vers les lignes 763-840) par-dessus l'écran, sur la même route
`present-question`. Deux présentations rivales de la même question ; c'est très probablement la fenêtre où Oliv a vu
l'éléphant à travers le fond le 24/11.

- En partie « Tenir » (`isTenirGame`), `markerArrivalEnabled` vaut `false` sur **tous** les écrans : tablette d'équipe,
  compte d'élève, bloc « Équipe active » de la console, projection. Question, zone et effet ne passent que par la carte
  du moment (et, pour l'effet, par le résumé de case déjà servi). Les parties classiques restantes ne changent pas.
- Vérifie qu'aucun autre chemin n'ouvre `GLQcmPopover` ou `GLMarkerEffectPopover` en « Tenir » (clic sur une case,
  `handleEffectAutoMove`) ; dis lesquels tu fermes.
- L'étape 30 (fond opaque de `GLQcmPopover`) reste : elle sert encore aux parties classiques.
- Tests : UI, partie « Tenir », équipe posée sur une case question → aucun `GLQcmPopover` dans le DOM, la carte du
  moment montre la question ; partie classique → le popover s'ouvre comme avant. E2E au tableau et en tablettes : à
  l'arrivée sur une case question, une seule présentation.

### Étape 32 — La piste s'ouvre sur la tablette d'équipe (décision I2) · lot 7

**Constat** : `GLTenirMoment.jsx` (vers les lignes 262-272) n'affiche « Ouvrir la fiche » ou « Ouvrir le glossaire »
après un « pas encore » que si `onOuvrirPiste` existe ; `GLTeamSessionView` ne le passe pas. La boucle « pas encore →
piste → fiche → réessayer » est coupée sur la surface de la séance.

- `GLTeamSessionView` passe `onOuvrirPiste` à `GLTenirEcranEquipe`. La piste ouvre **une feuille en lecture seule**
  par-dessus la carte du moment : une fiche d'espèce par la vue de `GLSpeciesDetailModal` (prop de lecture seule : ni
  « Marquer comme étudié », ni conditionnement, ni lien vers d'autres onglets) ; un mot par `GLGlossaryPopover`.
  Bouton unique « Revenir au jeu », qui rend exactement le même écran (même carte du moment, même défilement).
- La session de tablette (invité d'équipe) lit-elle les routes de fiche et de glossaire ? Vérifie. Si une route la
  refuse, **n'ajoute pas de route** : affiche alors le nom de la fiche ou du mot dans la carte (« La piste : la fiche
  « Éléphant de savane », dans La nature. ») et dis-le dans ton fichier de lot.
- Même feuille dans le bloc « Équipe active » de la console.
- Tests : UI, moment « retour pas encore » avec une piste de fiche → bouton présent, clic → feuille, « Revenir au
  jeu » → même carte ; piste de glossaire → popover ; sans piste → pas de bouton.

### Étape 33 — Rien de consultable pendant une question (décision I3) · lot 6

**Constat** : `GLQcmPopover.jsx` (vers les lignes 195-215) bloque les liens automatiques du texte tant que l'élève n'a
pas répondu (`glossaryPropsWhileAnswering`), mais la rangée « Glossaire scientifique : » sous les choix reste
cliquable et ouvre la définition. Même motif probable dans `GLQcmModal.jsx`.

- La rangée de puces n'est **pas rendue** tant que la réponse n'est pas donnée ; elle apparaît avec le retour.
- Même règle dans `GLQcmModal.jsx`, et dans la carte du moment si elle affiche des puces ou des liens pendant une
  question (vérifie `GLTenirMoment`).
- Tests UI : avant réponse, aucune puce ; après réponse, les puces sont là.

### Étape V1 — Les mots du voyage à l'écran d'un élève (décision I6) · lot V

**Registre élève** = tout ce qu'un élève voit après le miroir : tablette d'équipe, compte (Seuil, carnet, Marché,
sorts, visite d'Olu côté élève), projection, popovers, toasts. **Avant le miroir** (ne change pas) : `GLAuthView`
(sauf deux chaînes ci-dessous), `GLClassLinkEntry`, `GLEquipeAppareils`, notice des données, vitrine des parents
(`GL_PARENTS_TAB`), borne. **Prof** (ne change pas) : console, Contenus, réglages, `bodyTeacher` des visites, docs.

Remplacements (lexique de l'étape 24 ter), constatés le 24/11 :

| Où | Avant | Après |
| --- | --- | --- |
| `app-runtime.js` | « Cartes » | « Le chemin » |
| | « Les joueurs » | « La caravane » |
| | « Lexique lore » | « Le lexique du voyage » |
| | « Carnet Sélène » | « Mes pages » |
| | « Statistiques » ; « 📊 Mes statistiques » (`GLStatsView`) | « Ma bourse et mes progrès » |
| | icône 🗡️ de « L'aventure » | 📜 |
| Seuil | « Moi, voyageur » | « Moi, en voyage » |
| `GLProjectionView.jsx` | « Lumière de la classe » | « Lumière de la caravane » |
| `GLTenirTiroir.jsx`, `GLCarnetClasseView` | « Carnet de la classe » | « Carnet de la caravane » |
| écran d'équipe | « · touchez le plateau pour fouiller » | « · touchez le paysage pour fouiller » |
| `glTenirMoment.js` | « Pour l'instant, regardez le plateau. » | « Pour l'instant, regardez le chemin. » |
| `tenirTextes.js` | « On fouille. Le plateau garde ses pages. » | « On fouille. Le paysage garde ses pages. » |
| `GLDefiPlayer.jsx` | « La leçon du plateau » | « La leçon de ce monde » |
| `glRewardsOlu.js` | « Le plateau a beau être grand, vous le connaissez mieux que moi. » | « Ce monde a beau être grand, vous le connaissez mieux que moi. » |
| `GLTeamSessionView.jsx` | « Chargement de la partie impossible » | « Le voyage ne s'ouvre pas pour l'instant. Réessayez dans un moment. » |
| `GLSpellCastWizard.jsx` | « ⏳ Sortilège soumis au maître du jeu. Les gemmes / cœurs ne seront débités qu'après sa validation. » | « ⏳ Sortilège envoyé : il part quand le prof l'a vu. Tes gemmes ne bougent pas avant. » |
| `GLSeleneCarnetView.jsx` | « État de jeu : {label} » | « Cette page : {label} » |
| `glDiscoveryTour.js` (`body` élève) | « feuillet(s) » | « page(s) » ; « la classe » → « la caravane » |
| `GLAuthView.jsx` | « Connecte-toi avec ton pseudo ou ton identifiant. Ton profil (joueur, MJ ou admin) est déterminé après connexion. » | « Connecte-toi avec ton pseudo. » |
| | « Identifiant (pseudo ou e-mail) » | « Ton pseudo » (le champ accepte toujours l'e-mail) |

- Balaye les autres chaînes visibles d'un élève (les 56 fichiers relevés le 24/11 : `src/gl/components/tenir/`,
  `defis/`, Seuil, Marché, sorts, popovers, toasts, `GLAppBanners`, `glTenirMoment.js`, `tenirTextes.js`,
  `glRewardsOlu.js`) et applique le lexique ; liste ce que tu laisses et pourquoi.
- ❤ (cœur) : retire-le de tout écran d'élève de partie « Tenir » où il ne désigne plus rien ; il reste dans le code
  du jeu classique.
- **Test** `tests/content/gl-mots-du-voyage.test.js` : lit les fichiers du registre élève (liste explicite dans le
  test) et les champs visibles des catalogues ; échoue sur `\bplateaux?\b`, `\bclasses?\b` (hors « classe de » au
  sens grammatical, s'il y en a), `\bjoueu(r|rs|se|ses)\b`, `\bMJ\b`, `ma[iî]tre du jeu`, `feuillet`, `statistique`,
  avec une liste blanche commentée (fichier, chaîne, raison) ; message d'échec en français, fichier et ligne.
- Garde verts `tests/content/gl-adresse-ecran-equipe.test.js` et le filtre `findForbiddenString`.

### Étape V2 — Le lexique du voyage filtré par monde (décision I4) · lot V

**Constat** : `GET /api/gl/lore/glossary` et l'index des liens automatiques ne filtrent que le tiers `secret` et le
plafond `gameplay.lore_spoiler_max_level` (= `recit` en prod) ; la colonne `chapitre_scope` (la Grise : 2, le
Silence : 3, le Détricotage et l'Effacement : 4) n'est appliquée que si le client la demande, et
`GLLoreGlossaryView` ne la demande jamais (`routes/gl/lore.js`, `lib/glLoreGlossaryMatch.js ›
filterLoreGlossaryList`, `isLoreTermVisibleToAudience`). Résultat : dès le plateau 1, l'élève lit les noms des quatre
visages, « les quatre visages : les étapes par lesquelles un milieu s'éteint » et « le corbeau de Selene ».

- Pour un lecteur qui n'est pas du staff G&L, un terme n'est visible que si `chapitre_scope` vaut `tous` (ou est vide)
  ou un numéro de plateau **inférieur ou égal au plateau le plus avancé** de ses parties (élève : ses parties ;
  tablette d'équipe : la partie de la session). Côté serveur, dans la liste, la fiche d'un terme, les termes liés et
  l'index des liens automatiques. Le prof voit tout.
- Aucun réglage nouveau ; le plafond `lore_spoiler_max_level` garde son rôle.
- Tests : élève au plateau 1 → ni « Grise », ni « Silence », ni « Détricotage », ni « Effacement » dans la liste,
  l'index et une fiche liée ; élève au plateau 2 → « Grise » seulement ; prof → tous.
- « Le corbeau de Selene » : terme à part, **décision d'Oliv** (« Sélène dit corbeau », décision 3 du bilan du 24/11) ;
  liste-le dans ton fichier de lot sans le changer.

### Étape V3 — La visite d'Olu se tient (décision I5) · lot V

**Constats** : la visite démarre seule 650 ms après la première visite d'un onglet (`GLTourContext.jsx`) ;
l'ouverture du tour bascule l'élève sur l'onglet du plateau : sa première séance sur son compte s'ouvre sur une bulle
d'Olu par-dessus l'écran du tour. **Vu dans Chrome le 24/11** (vitrine `?demo=parents`) : une visite à chaque onglet
**et** à chaque sous-onglet (trois en trois clics) ; en passant de « Le monde G&L » à « Découverte », la bulle gardait
le texte de l'onglet précédent (« Le monde, pas la partie »).

- Aucun démarrage automatique quand l'écran d'équipe est monté ou qu'un tour est ouvert pour l'élève ; la visite
  partira à la visite suivante de l'onglet.
- Changement d'onglet ou de sous-onglet : la visite en cours se ferme (sans être marquée vue).
- Une visite par onglet principal ; les sous-onglets n'en lancent pas d'eux-mêmes (le « ? » les rouvre). Dans la
  vitrine des invités, la mémoire des visites vues tient pour la session du navigateur.
- Textes (`body` élève de `glDiscoveryTour.js`), alignés sur le lexique :

| Étape | Titre | Texte |
| --- | --- | --- |
| `welcome › what` | (inchangé) | « Un monde à traverser en équipe, des pages à retrouver, un carnet à remplir. L'histoire, je te laisse la découvrir : ce n'est pas la mienne à raconter. » |
| `welcome › where` | (inchangé) | « Le « ? », en bas à droite de chaque écran. Un clic et je réexplique, autant de fois qu'il faudra. » |
| `maps › intro` | « Le chemin » | « Voilà le monde de ce chapitre. Ton équipe avance sur le chemin quand le tour est ouvert ; le reste du temps, regarde et prépare la suite. » |
| `maps › reperes` | « Les pages cachées » | « Des pages du carnet dorment dans le paysage. Pendant le tour, l'écran dit quand chercher, et l'Opératrice ou l'Opérateur touche l'endroit. » |
| `rules › lire` | « Les règles au calme » | « Le tour, les pages, les gemmes, les sorts. Si quelque chose t'a surpris pendant la séance, l'explication est ici. » |

  `bodyTeacher` : « Le chemin du chapitre, tel que le voient les équipes. » ; « Les pages se cherchent dans le
  paysage pendant le tour ; tracez les zones avant la séance. » ; « La page des règles, éditable depuis Contenus →
  Pages du monde. » Retire toute mention de « vitalité », de cœurs et de « Clique, tu verras bien » sur une case.
- Tests UI : tour ouvert → aucune bulle ; changement d'onglet → bulle fermée ; sous-onglet → pas de nouvelle bulle.

### Étape V4 — Pages, grimoires, cases et vitrine en base (décisions I7, I8), migration `N+5` · lot V

Migration idempotente, **chaque écriture gardée par l'ancien texte** (si Oliv a déjà corrigé par le connecteur ou
l'éditeur, elle ne fait rien) ; textes de l'annexe I.

1. `gl_content_pages` `slug = 'rules'` : `content` = annexe I.1, si l'ancien texte contient « s'en prendre à
   lui-même ».
2. `gl_content_pages` `slug = 'world'` : les deux remplacements de l'annexe I.2 (`REPLACE`, gardés par la phrase
   exacte).
3. `gl_chapters.sortileges_markdown`, ids 3 à 6 : annexe I.3 si l'ancien texte contient « un cœur pour les Gnomes » ;
   id 7 : retire la ligne « > Le grimoire complet est consultable dans l'onglet **Sortilèges**. ».
4. `gl_kingdom_zones` : la zone nommée « Zone » du chapitre 3 → « Savane africaine ».
5. `gl_chapter_markers` ids 41 et 76 : « L'aventure du plateau s'achève. » → « Le chemin de ce monde s'arrête ici. »
   (`REPLACE`, reste du texte inchangé).
6. `gl_chapters` id 2 (`slug = 'test'`, aucune partie, une case de test) : `order_index` 0 → 990 ; id 1
   (`foret-magique`, une ancienne partie) : 10 → 980. Ne supprime rien.
7. `gl_glossary_terms` `GL0167` (« moor », mot anglais ; « lande » existe) : `statut` → `inactif`, si `terme = 'moor'`
   et `statut = 'actif'`.
- Test de migration (base locale) : chaque garde ; deuxième passage sans effet.
- Relecteur `gl-relecteur-garde-fous` sur l'annexe I.

### Étape V5 — La vitrine des invités et l'accueil (décision I8) · lot V

**Vu dans Chrome le 24/11** : `?demo=parents` → « La nature › Écosystèmes » affiche « ttt » et « ttttt » ;
« Biodiversité » affiche « Aucun biome du catalogue n'est lié à ce chapitre. Un MJ peut en choisir dans Contenus →
Chapitres → Biomes (catalogue espèces). » Cause : `useGlGameRuntime.js` (vers la ligne 147) prend pour un invité le
premier chapitre de `/api/gl/chapters`, trié par `order_index` : le chapitre « test » (0).

- Invité : le chapitre servi est celui qui a le **plus petit `plateau_number` non nul** ; à défaut, le premier de la
  liste. (L'étape V4 range aussi les chapitres de test : les deux tiennent.)
- `GLSpeciesCatalog.jsx` (vers la ligne 202) : le message « Un MJ peut en choisir… » n'est montré qu'au staff G&L ;
  ailleurs, « Les espèces de ce monde arrivent bientôt. »
- Écran de connexion (`GLAuthView.jsx`) : l'image `platform.brand.slots.hero.imageUrl`, quand elle existe, au-dessus
  du titre, cadrage 21/9 de la marque, hauteur au plus 28 vh, coins du haut arrondis comme la carte, `alt=""`
  (décorative) ; rien sinon. Le reste de l'écran ne change pas (hors les deux chaînes de l'étape V1).
- Tests UI : invité avec les chapitres de prod (ordre 0, 10, 10, 20…) → Tropiques africains ; message du catalogue
  absent pour un invité ; image d'accueil présente quand la marque la porte.

### Étape V6 — Le plateau sort de la nuit (décision I9) · lot V

**Constat** : `.gl-board` (`src/gl/styles/gl-theme.css`, vers la ligne 1776) : `background: #e0f2fe` et
`border: 1px solid #bae6fd`, le bleu ciel de ForêtMap codé en dur. Vu dans Chrome : le plateau peint flotte dans un
rectangle bleu pâle.

- `background: radial-gradient(120% 90% at 50% 45%, var(--gl-color-primary) 0%, #04191b 100%)` ;
  `border: 1px solid rgba(201, 162, 39, 0.4)` (l'ocre doré de la charte). La couleur suit le thème du monde.
- Vérifie le contraste des étiquettes d'équipe et des boutons posés sur ce fond (zoom, plein écran) ; ajuste leur
  fond, pas celui du plateau.
- Test CSS sur le modèle de `tests/visit-map-animations-css.test.js` : `.gl-board` ne contient plus `#e0f2fe`.

### Étape S1 — La musique par biome joue (décision I10) · lot S

**Constat** (médiathèque de prod, `/uploads/media-library/_keys.json`, lu le 24/11) : le code cherche
`plateau-1_jungle`, `plateau-2_savane`… ; la médiathèque a importé les pistes sous leur nom d'origine (`jungle`,
`savane`, `desert`, `mediterranee (1)`, `mediterranee (2)`, `foret caducifolie`, `landes`, `taiga`, `toundra jour`,
`toundra nuit`) ; le repli `_manifest.audio.json` a tous ses `src` à `null`. Dix pistes, jamais jouées.

- `resolvePlateauAudioSlug.js` : une liste de clés candidates par biome, la clé `plateau-N_*` d'abord, puis le nom de
  la médiathèque : `jungle_afc` → `plateau-1_jungle`, `jungle` ; `savane` → `plateau-2_savane`, `savane` ; `sahara` →
  `plateau-1_desert-chaud`, `desert` ; `foret_mediterraneenne` → `plateau-2_mediterranee`, `mediterranee (2)`,
  `mediterranee (1)` ; `foret_caducifoliee` → `plateau-4_foret-caducifoliee`, `foret caducifolie` ; `landes` →
  `plateau-3_landes`, `landes` ; `taiga` → `plateau-5_taiga`, `taiga` ; toundra été → `plateau-5_toundra-jour`,
  `toundra jour` ; toundra nuit → `plateau-5_toundra-nuit`, `toundra nuit`.
- Une clé n'est retenue que si son `relativePath` contient `/audio/` (étends à toutes les candidates le garde du
  repli par préfixe).
- Test unitaire sur un index de clés copié de la prod (les 20 clés audio et une image homonyme).

### Étape S2 — La projection chante, les autres écrans se taisent (décision I10) · lot S

- `MusicPlayer` (musique par biome) est monté dans `GLProjectionView` (aujourd'hui rendue avant `MusicPlayer` et le
  dock, `AppGL.jsx` vers la ligne 941), avec un bouton « Activer le son » montré une fois (le premier clic débloque
  l'audio du navigateur ; mémorisé dans le `localStorage` du poste de projection, lecture et écriture sous
  `try/catch`).
- Plus aucune musique ni bouton de musique sur les autres écrans G&L (tablette d'équipe, compte d'élève, console) :
  retire le montage de `MusicPlayer` et de `GLZoneMusicMuteButton` hors projection ; le bouton orphelin de
  `MusicPlayer` (dans un bloc `aria-hidden`, sans CSS, titré « Couper la musique des zones ») disparaît (F7).
- La musique de zone (`useGLZoneMusic`) suit la même règle (projection seule). **Aucun réglage ne change** : couper
  `modules.zone_music_enabled` reste une décision d'Oliv, par le connecteur.
- Pendant une question montrée en projection (étape 18) : volume × 0,4, fondu de 600 ms, retour à la fermeture.
- `prefers-reduced-motion` ne coupe pas le son ; aucune lecture automatique sans le premier clic.
- Tests UI : la projection monte `MusicPlayer` et le bouton « Activer le son » ; la tablette d'équipe et le compte
  d'élève n'ont aucun bouton de musique ; volume réduit pendant une question.

### Étape S3 — La musique d'intro de l'app ne prend plus une image (décision I10) · lot S

- Le résolveur de la musique d'intro (`resolveIntroAudioSlug`) prend `intro_01_la-boite`, qui est une **image** PNG en
  prod : il ne retient qu'une clé dont le `relativePath` contient `/audio/`, sinon `null` (pas de lecteur).
- Test unitaire : clé d'image → `null` ; clé audio → URL.

## 3. Captures (dans `docs/captures/gl-decisions/`)

- Lot 7 : tablette 1024 × 768 arrivée sur une case question (une seule présentation) ; piste ouverte puis « Revenir
  au jeu ».
- Lot 6 : fenêtre de question avant réponse (sans puces), après réponse (avec puces).
- Lot V : barre d'onglets d'un élève (libellés) ; lexique du voyage d'un élève au plateau 1 ; vitrine `?demo=parents`
  (Écosystèmes des Tropiques africains) ; écran de connexion avec l'image ; plateau sur son fond sombre, aux quatre
  thèmes s'ils sont posés.
- Lot S : projection avec « Activer le son » ; tablette sans bouton de musique.

## 4. Choix par défaut posés par Claude (à lister dans le rapport final)

- Lexique : trois mots pour le plateau (monde, chemin, paysage) plutôt qu'un ; « caravane » réservée à toute la
  classe ; « séance », « niveau », « points », « case », « prof » gardés.
- Libellés d'onglets changés tout de suite ; leur organisation (cinq onglets) après deux séances.
- Piste sur la tablette : feuille en lecture seule, sans « Marquer comme étudié » ; repli sur le nom de la fiche si la
  session d'équipe ne lit pas la route.
- Lexique du voyage : visibilité par le plateau le plus avancé des parties de l'élève.
- Visite d'Olu : fermée sans être marquée vue au changement d'onglet ; une par onglet principal.
- Vitrine : chapitres de test rangés à 980 et 990, rien de supprimé ; « moor » inactif.
- Fond du plateau : dégradé de la couleur du monde vers `#04191b`, liseré doré à 40 %.
- Son : la projection seule chante ; musique de zone sur la même règle ; volume × 0,4 pendant une question ; « (2) »
  pour la Méditerranée.

## 5. Docs (§ 7 du prompt)

| Doc | Lot |
| --- | --- |
| `docs/reference/gl/essentiel-mj.md` (« Les mots à dire » : « le monde, le chemin, la caravane » / « le plateau, la classe », en jeu) ; règles § 1 (garde-fous de vocabulaire : registre élève, avant et après le miroir) | V pour les règles ; 9 pour l'essentiel |
| Guide du prof : la musique se joue sur la projection (« Activer le son » au premier lancement) ; la piste s'ouvre sur la tablette | S, 7 ; réécriture 9 |
| `docs/API.md` : filtre `chapitre_scope` du lexique pour un lecteur non staff | V |
| `.claude/skills/gl-tenir-garde-fous` : le lexique du voyage et la liste blanche du test | V |

## 6. Après le chantier (§ 10 du prompt)

- Ouvrir la vitrine `?demo=parents` dans un navigateur privé : La nature montre les Tropiques africains, aucun message
  d'administration, une seule visite d'Olu par onglet.
- Au premier lancement de la projection, toucher « Activer le son » ; vérifier qu'aucune tablette ne joue de musique.
- Compte d'élève de démonstration au plateau 1 : le lexique du voyage ne nomme aucun visage.
- Relire « Les règles du jeu » et les grimoires dans l'app.

---

## Annexe I — Textes de la migration du lot V (relus contre les garde-fous le 24/11 ; I.1, I.2 et I.3 posés en prod par le connecteur le 24/11 à 11 h 15, la migration ne fera donc rien : elle reste pour une installation neuve)

### I.1 « Les règles du jeu » (`gl_content_pages.rules`, tout le contenu)

Adresse : « tu » (page lue par un élève sur son compte).

```markdown
Gnomes & Licornes dure toute l'année de Sciences et technologie. Ta caravane, c'est toute ta classe : elle traverse
Quatre mondes, de la forêt tropicale jusqu'aux Grands Froids. On joue chaque monde pendant un chapitre, quelques
minutes au début des séances.

## Le but

Le carnet de Sélène s'efface. La caravane retrouve ses pages, monde après monde, et reste devant le voile. Il n'y a
pas d'équipe gagnante : tout le monde avance ensemble.

## Ton équipe

- Au début de chaque chapitre, tu rejoins une équipe de quatre ou cinq.
- Ton équipe reçoit une forme : **Gnomes** ou **Licornes**. On ne la choisit pas, on la reçoit. Avant la fin de
  l'année, tu auras été les deux.
- Les Gnomes réparent, les Licornes révèlent. Aucun des deux n'est meilleur que l'autre.
- À chaque séance, une carte Job te propose un rôle : Gestionnaire, Secrétaire, Opératrice ou Opérateur, Assistante
  ou Assistant, Éclaireuse ou Éclaireur. C'est un conseil, pas une obligation.

## Un tour de jeu

L'écran annonce quatre moments :

1. **Le tour s'ouvre.**
2. **À vous de jouer** : ton équipe lance les dés et avance sur le chemin. Sur une case question, une bonne réponse
   fait avancer d'une case de plus.
3. **Le voile avance**, derrière la caravane, un peu plus vite à chaque monde.
4. **Tour terminé.**

Certaines cases proposent un défi d'équipe. Un défi relevé fait reculer le voile.

## Retrouver une page

- Des pages du carnet dorment dans le paysage. Une énigme dit quoi chercher, et l'Opératrice ou l'Opérateur montre
  l'endroit.
- Une page trouvée doit être **tenue** : c'est l'autre peuple qui la lit et répond à une question. Une page se
  retrouve donc à deux.
- Une page déjà trouvée peut pâlir. Elle peut être réparée.

## Les gemmes

- Les gemmes sont la seule monnaie du jeu. Tu en reçois quand ton équipe tient une page.
- Elles servent à lancer des sortilèges, seul ou en équipe, et au Marché.
- Ta bourse ne dépasse pas 8 gemmes. Seuls toi et ton équipe la voyez.
- Une erreur ne te coûte jamais de gemme.

## Quand on se trompe

Une mauvaise réponse ne coûte rien. L'écran dit « Pas encore » et donne une piste : une fiche ou un mot à relire.
Tu pourras réessayer plus tard.

## Le camp

À la fin d'un chapitre, la caravane arrive au camp. On regarde ensemble les pages retrouvées, puis les équipes
changent pour le monde suivant.

## Le Seuil

Le Seuil est ton espace à toi : ton expédition, tes défis, tes sortilèges, tes badges, et ce que tu peux faire entre
deux séances.
```

### I.2 « Introduction » (`gl_content_pages.world`), deux remplacements

| Avant (phrase exacte, garde) | Après |
| --- | --- |
| « À chacun sa voie : **Gnome**, dont les mains patientes réparent les fils rompus et redonnent vie à la terre ; ou **Licorne**, dont le regard démasque les poisons et dont le savoir devient pouvoir. » | « Votre équipe reçoit une forme, et vous serez les deux avant la fin du voyage : **Gnome**, dont les mains patientes réparent les fils rompus et redonnent vie à la terre ; ou **Licorne**, dont le regard voit ce qui se cache et démasque les poisons. » |
| « une arme que vous n'attendiez pas » | « un pouvoir que vous n'attendiez pas » |

### I.3 Grimoires de chapitre (`gl_chapters.sortileges_markdown`, ids 3 à 6)

Adresse : « vous ».

```markdown
## Grimoire du chapitre — {titre du monde}

Deux peuples, deux gestes. Les **Gnomes** réparent : la main qui renoue un fil rompu et soigne une terre. Les
**Licornes** révèlent : l'œil qui voit ce qui se cache et démasque un poison.

{phrase du monde}

Les sortilèges de ce chapitre sont ci-dessous. Chacun dit ce qu'il coûte en gemmes et à quel moment du tour on peut
le lancer. Le prof en ouvre de nouveaux au fil des séances.
```

| id | Titre du monde | Phrase du monde |
| --- | --- | --- |
| 3 | Tropiques africains | « Dans ce monde, le Souffle se fait à peine sentir : le vivant tient, à condition de le regarder de près. » |
| 4 | Aride chaud | « Dans ce monde, le Souffle prend le visage de la Grise : les couleurs pâlissent. » |
| 5 | Tempéré atlantique | « Dans ce monde, le Souffle prend le visage du Silence : les chants du vivant se taisent un à un. » |
| 6 | Grand Nord | « Dans ce monde, le Souffle prend deux visages : le Détricotage dans la taïga, puis l'Effacement au-delà des arbres. » |

Chaque visage n'apparaît que dans son monde, et par ce qu'il fait. L'épilogue (id 7) garde son premier paragraphe.
