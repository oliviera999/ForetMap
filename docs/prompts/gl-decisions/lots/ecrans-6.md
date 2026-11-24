# Lot ecrans-6 — Les mots du voyage à l'écran, « Mon sac », la visite d'Olu, le fond du plateau

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-6` · Attend : ecrans-5, contenu-2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Après la connexion, l'élève lit les mots du voyage : « le monde », « le chemin », « le paysage », « la caravane » ;
  plus de « plateau », « classe », « joueur », « partie », « MJ », « feuillet », « statistiques ».
- Son espace personnel s'appelle « Mon sac » (plus « Le Seuil »). Le code ne se renomme pas.
- Olu ne lance plus sa visite pendant un tour, la ferme au changement d'onglet, et ses bulles décrivent le jeu
  d'aujourd'hui.
- Le plateau peint n'est plus posé sur un rectangle bleu ciel : fond sombre à la couleur du monde, liseré doré.
- Un test de contenu garde ces mots.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| I6 (addendum 2), lore | 24/11 | À l'écran d'un élève, après le miroir : le plateau devient le monde, le chemin ou le paysage selon le sens ; la classe devient la caravane (toute la classe, jamais une équipe) ; jamais « joueur », « partie », « MJ », « maître du jeu », « feuillet », « statistiques ». Avant le miroir (connexion, lien de classe, données, vitrine des parents), rien ne change. | « Non pas que la caravane » (12 h 11) |
| I5 (addendum 2) | 24/11 | La visite d'Olu ne démarre jamais pendant un tour, se ferme au changement d'onglet, ne se relance pas à chaque sous-onglet ; ses textes décrivent « Tenir ». | — |
| I9 (addendum 2) | 24/11 | Le plateau n'est plus posé sur un rectangle bleu ciel (couleur de ForêtMap codée en dur) : fond sombre de la couleur du monde, liseré doré. | — |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | L'Éclaireuse ou l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond à la question de case. | — |
| « Mon sac » | 24/11, 14 h 16 | « Mon sac » remplace « Le Seuil » comme nom de l'espace personnel de l'élève (onglet « Mon sac », « ton sac » dans une phrase, ex. « Ouvre ton sac. »). Le code ne se renomme pas (`GL_SEUIL_TAB.id`, `GLSeuilView.jsx`, `lib/glSeuil.js`, clé `seuil` des sorts de camp, test-id). Un test de vocabulaire refuse « Seuil » comme nom d'écran dans les textes d'élève ; le récit garde le nom commun. | « Je valide » |

I5, I6 et I9 sont prises « telles qu'écrites » par la décision 39 de l'addendum 4 (24/11, 11 h 41) ; I6 dans son
option A, redite par Oliv à 11 h 53 et 12 h 11. « Mon sac » : Oliv, 13 h 58, « il faut renommer le module de l'app
qui s'appelle le seuil. Cela est source de confusion et contredit le passage d'un plateau à un autre », puis « Je
valide » à 14 h 16.

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Trois mots pour le plateau (monde, chemin, paysage) plutôt qu'un ; « caravane » réservée à toute la classe ;
  « séance », « niveau », « points », « case », « prof » gardés.
- Le champ de connexion accepte toujours l'e-mail ; son libellé devient « Ton pseudo ».
- Icône de « L'aventure » : 🗡️ → 📜.
- Visite d'Olu : fermée sans être marquée vue au changement d'onglet ; une par onglet principal ; dans la vitrine,
  la mémoire des visites tient pour la session du navigateur.
- Fond du plateau : dégradé de la couleur du monde vers `#04191b`, liseré doré à 40 %.
- Posés à l'écriture de cette fiche, à relire (section 11) : les phrases où « le Seuil » est remplacé (tableau de
  l'étape ecrans-6.4) ; le sort des chaînes non listées par l'ancien texte.

**Le lexique** (pour toute chaîne que tu touches) :

| Mot d'avant | Mot d'après |
| --- | --- |
| le plateau, comme lieu ou chapitre | « le monde » (« ce monde », « le deuxième monde ») |
| le plateau, comme suite de cases | « le chemin » |
| le plateau, comme dessin où dorment les pages | « le paysage » |
| la classe en jeu | « la caravane » |
| la classe dans un défi joué en vrai | « les autres équipes » |
| un joueur | « une ou un membre de l'équipe » |
| feuillet | « page » |
| Le Seuil (nom d'écran) | « Mon sac » ; « ton sac » dans une phrase |
| restent | dé, case, tour, équipe, carte Job, carte Team Spirit, prof, séance |

## 3. Fichiers

**À toi** (vérifiés sur `main`) :

- `src/gl/constants/app-runtime.js` (libellés et une icône ; aucun identifiant, aucun ordre d'onglet)
- `src/gl/constants/glDiscoveryTour.js`, `src/gl/context/GLTourContext.jsx`
- `src/gl/constants/tenirTextes.js`, `src/gl/constants/glRewardsOlu.js`, `src/gl/utils/glTenirMoment.js`
- `src/gl/components/GLSeuilView.jsx`, `src/gl/components/GLStatsView.jsx`, `src/gl/components/GLProfileModal.jsx`
- `src/gl/components/GLSpellCastWizard.jsx`, `src/gl/components/GLSpellCatalog.jsx`,
  `src/gl/components/GLSeleneCarnetView.jsx`, `src/gl/components/GLQcmPopover.jsx` (un libellé)
- `src/gl/components/GLMarketPlacePanels.jsx`, `src/gl/components/GLAppBanners.jsx`
- `src/gl/components/defis/GLDefiPlayer.jsx`
- `src/gl/components/tenir/GLProjectionView.jsx`, `src/gl/components/tenir/GLTenirTiroir.jsx`,
  `src/gl/components/tenir/GLCarnetClasseView.jsx`, `src/gl/components/tenir/GLTeamSessionView.jsx` (chaînes
  seulement)
- `src/gl/components/GLAuthView.jsx` (deux chaînes, rien d'autre)
- `src/gl/hooks/useGLVoyageur.js` (un message), `src/gl/utils/glJournalImportMeta.js` (un libellé),
  `src/gl/utils/glSettingsForm.js` (deux libellés du prof qui citent un onglet renommé)
- `src/gl/AppGL.jsx` (chaînes d'élève ; mémoire de la visite dans la vitrine)
- `src/gl/styles/gl-theme.css` (règle `.gl-board` et, si le contraste le demande, les boutons posés sur le plateau)
- Tests qui citent ces textes (section 8).

**Nouveaux** :

- `tests/content/gl-mots-du-voyage.test.js`
- un test CSS, par exemple `tests/gl-board-fond-css.test.js` (modèle : `tests/visit-map-animations-css.test.js`)

**D'un autre couloir, modification minimale permise** :

- `data/gl/help.default.json` (couloir contenu) : les champs `title` et `body` lus par un élève, mots du lexique
  seulement ; `bodyMj` ne change pas.
- `src/shared/hooks/useGuidedTour.js` (moteur partagé avec ForêtMap) : seulement si l'étape ecrans-6.2 ne peut pas se
  faire dans `GLTourContext.jsx` ; alors une option facultative, comportement par défaut inchangé, testée des deux
  côtés (`tests-ui/` de ForêtMap et de G&L), `npm run check:bundle` vert.
- `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 1 seulement) et `.claude/skills/gl-tenir-garde-fous/SKILL.md` (section 9).

**Ne touche pas** :

- Les catalogues `data/gl/tenir/*.json` (mots du voyage : fait par contenu-1 ; « Mon sac » dans `olu-lignes`,
  `parures`, `reglages-defaut` : lot contenu-5).
- `routes/gl/lore.js`, `lib/glLoreGlossaryMatch.js`, `GLLoreGlossaryView.jsx` (lexique filtré par monde),
  `src/gl/hooks/useGlGameRuntime.js`, `GLSpeciesCatalog.jsx`, l'image d'accueil de `GLAuthView.jsx` (vitrine) :
  lot contenu-5.
- L'ordre et le regroupement des onglets, `GLAdventureView`, `GLMondeView`, `GLJoueursView` : lot ecrans-8.
- L'habillage de « Mon sac » (deux états) : lot ecrans-8. Ici, seulement son nom.
- Avant le miroir : `src/gl/components/tenir/GLClassLinkEntry.jsx`, `src/gl/components/tenir/GLEquipeAppareils.jsx`,
  `src/gl/components/parents/*`, la notice des données, la borne.
- Prof : `src/gl/components/mj/*`, `src/gl/components/admin/*`, `src/gl/components/settings/*`, les `bodyTeacher`
  autres que ceux de l'étape ecrans-6.2, `src/shared/qcm/QcmPreviewModal.jsx`.
- Les identifiants : `GL_SEUIL_TAB.id`, `GLSeuilView`, `GLSeuil*`, `lib/glSeuil.js`, la clé `seuil`, les classes
  `gl-seuil*`, les test-id.

## 4. Étapes (un commit par étape, dans cet ordre)

### ecrans-6.1 — Les mots du voyage à l'écran d'un élève (ex-étape V1)

- **Registre élève** = tout ce qu'un élève voit après le miroir : tablette d'équipe, compte (Mon sac, carnet,
  Marché, sorts, visite d'Olu côté élève), projection, popovers, toasts. **Avant le miroir** (ne change pas) :
  `GLAuthView` (sauf deux chaînes ci-dessous), `GLClassLinkEntry`, `GLEquipeAppareils`, notice des données, vitrine
  des parents (`GL_PARENTS_TAB`), borne. **Prof** (ne change pas) : console, Contenus, réglages, `bodyTeacher` des
  visites, docs.
- **Constat vérifié** sur `main` : chaque chaîne du tableau existe, à la ligne dite. Les chaînes du code portent une
  apostrophe typographique (’) : cherche-les avec elle, et garde-la dans le texte d'après.
- **Changement attendu**, mot pour mot :

  | Fichier (ligne sur `main`) | Avant | Après |
  | --- | --- | --- |
  | `src/gl/constants/app-runtime.js` (75) | « Cartes » | « Le chemin » |
  | idem (55, `GL_JOUEURS_TAB`) | « Les joueurs » | « La caravane » |
  | idem (38) | « Lexique lore » | « Le lexique du voyage » |
  | idem (26) | « Carnet Sélène » | « Mes pages » |
  | idem (50) | « Statistiques » | « Ma bourse et mes progrès » |
  | `src/gl/components/GLStatsView.jsx` (344) | « 📊 Mes statistiques » | « Ma bourse et mes progrès » |
  | idem (32, `GL_ADVENTURE_TAB`) | icône 🗡️ de « L'aventure » | 📜 |
  | `src/gl/components/GLSeuilView.jsx` (422) | « Moi, voyageur » | « Moi, en voyage » |
  | `src/gl/components/tenir/GLProjectionView.jsx` (370, 374) | « Lumière de la classe » | « Lumière de la caravane » |
  | idem (388, devant « · n/N pages tenues ») | « Carnet de la classe » | « Carnet de la caravane » |
  | `src/gl/components/tenir/GLCarnetClasseView.jsx` (27) | « Carnet de la classe » | « Carnet de la caravane » |
  | `src/gl/components/tenir/GLTenirTiroir.jsx` (167) | « Carnet de la classe » | « Carnet de la caravane » |
  | `src/gl/utils/glTenirMoment.js` (52) | « Pour l'instant, regardez le plateau. » | « Pour l'instant, regardez le chemin. » |
  | `src/gl/constants/tenirTextes.js` (10) | « On fouille. Le plateau garde ses pages. » | « On fouille. Le paysage garde ses pages. » |
  | `src/gl/components/defis/GLDefiPlayer.jsx` (219) | « La leçon du plateau » | « La leçon de ce monde » |
  | `src/gl/constants/glRewardsOlu.js` (13) | « Le plateau a beau être grand, » | « Ce monde a beau être grand, » |
  | `src/gl/components/GLSeleneCarnetView.jsx` (228, 261) | « État de jeu : {label} » | « Cette page : {label} » |
  | `src/gl/constants/glDiscoveryTour.js` (140, 275, 374, 513) | « feuillet(s) » | « page(s) » |
  | idem (168, 480) | « la classe » | « la caravane » |
  | `src/gl/components/GLAuthView.jsx` (299) | « Identifiant (pseudo ou e-mail) » | « Ton pseudo » |

  Trois phrases entières, hors tableau :
  - `src/gl/components/tenir/GLTeamSessionView.jsx` (61) : « Chargement de la partie impossible » devient « Le
    voyage ne s'ouvre pas pour l'instant. Réessayez dans un moment. »
  - `src/gl/components/GLSpellCastWizard.jsx` (438) : « ⏳ Sortilège soumis au maître du jeu. Les gemmes / cœurs ne
    seront débités qu'après sa validation. » devient « ⏳ Sortilège envoyé : il part quand le prof l'a vu. Tes
    gemmes ne bougent pas avant. »
  - `src/gl/components/GLAuthView.jsx` (277) : « Connecte-toi avec ton pseudo ou ton identifiant. Ton profil
    (joueur, MJ ou admin) est déterminé après connexion. » devient « Connecte-toi avec ton pseudo. » Le champ
    accepte toujours l'e-mail.

  Dans `glRewardsOlu.js`, le reste de la phrase ne change pas (« … vous le connaissez mieux que moi. »). Dans
  `GLSeleneCarnetView.jsx`, `GLProjectionView.jsx` (374) et `GLTenirTiroir.jsx`, la chaîne est un `title` ou un
  `aria-label`. Les lignes de `glDiscoveryTour.js` sont des `body` d'élève.

  Corrections par rapport à l'ancien texte :
  - « · touchez le plateau pour fouiller » n'existait que dans `GLTenirEquipeView.jsx`, supprimé par le lot ecrans-4 :
    rien à remplacer. Si une chaîne équivalente a survécu ailleurs, elle dit « le paysage ».
  - `GLGameMasterConsole.jsx` porte aussi « Chargement de la partie impossible » : côté prof, à laisser.
  - `glRewardsOlu.js` et `tenirTextes.js` sont sous `src/gl/constants/` ; `GLDefiPlayer.jsx` sous
    `src/gl/components/defis/`.

- **Balayage des autres chaînes visibles d'un élève.** L'ancien texte parlait de « 56 fichiers relevés le 24/11 » :
  cette liste n'existe nulle part. **Tu la reconstruis** :

  ```bash
  git grep -nE "\bplateaux?\b|\bclasses?\b|\bjoueu(r|rs|se|ses)\b|\bMJ\b|ma[iî]tre du jeu|feuillet|[Ss]tatistique|\bparties?\b|royaume|vitalit|❤" -- \
    src/gl/components/tenir src/gl/components/defis src/gl/components/spell-cast \
    'src/gl/components/GLSeuil*.jsx' 'src/gl/components/GLMarket*.jsx' 'src/gl/components/GLSpell*.jsx' \
    'src/gl/components/*Popover*.jsx' 'src/gl/components/*Toast*.jsx' src/gl/components/GLAppBanners.jsx \
    src/gl/components/GLStatsView.jsx src/gl/components/GLSeleneCarnetView.jsx src/gl/components/GLProfileModal.jsx \
    src/gl/utils/glTenirMoment.js src/gl/constants/tenirTextes.js src/gl/constants/glRewardsOlu.js \
    src/gl/constants/glDiscoveryTour.js src/gl/constants/app-runtime.js src/gl/AppGL.jsx data/gl/help.default.json
  ```

  Pour chaque ligne trouvée, sépare ce qui s'affiche (texte JSX, littéral rendu, `title`, `aria-label`, `label`,
  `texte`, `body`) de ce qui ne s'affiche pas (commentaire, identifiant, classe CSS, test-id, `bodyTeacher`,
  `bodyMj`). Seul ce qui s'affiche à un élève change. Écris la liste des fichiers retenus **dans le test** (elle y
  est la liste explicite) et, dans ton rapport, ce que tu laisses et pourquoi. Le compte peut différer de 56.
  - Remplacer un mot par celui du lexique est permis. Une phrase qu'il faudrait réécrire au-delà du mot : ne
    l'invente pas, propose-la dans ton rapport (« À relire par Oliv »).
  - Chaînes déjà relevées sur `main`, hors du tableau : `GLSeuilView.jsx` (« Rejoindre le plateau » → « Rejoindre le
    chemin », nom fixé par la décision « Mon sac » ; « Séance en cours : ton expédition est sur le plateau. » ;
    « Rejoins ton expédition sur le plateau » ; « Relis ton Carnet de Sélène » ; « Découvre un mot du lexique
    lore ») ; `AppGL.jsx` (« Ton équipe joue en ce moment : rejoins-la sur le plateau. » ; `ariaLabel` « Mes
    statistiques ») ; `GLProfileModal.jsx` (« Mes statistiques ») ; `GLStatsView.jsx` (« 📊 Statistiques des
    joueurs » : dis qui la voit) ; `tenirTextes.js` (« Page trouvée ! Elle entre au carnet de la classe. ») ;
    `GLProjectionView.jsx` (« Voir le plateau ») ; `GLQcmPopover.jsx` (« Lexique lore : ») ;
    `glJournalImportMeta.js` (« Lexique lore ») ; `GLSpellCatalog.jsx` ; `glDiscoveryTour.js` (bulles des
    regroupements : « Les joueurs », « les statistiques », « le MJ », « royaume », « vitalité », « Le monde, pas la
    partie ») ; `data/gl/help.default.json` (`title` « Les joueurs », « Statistiques » ; `body` : « feuillets »,
    « la classe », « le MJ », « partie », « vitalité »).
  - `src/gl/utils/glSettingsForm.js` (réglages du prof) : la phrase « Éteint, les joueurs arrivent sur Cartes. » cite
    un onglet renommé : mets-y le nouveau libellé, rien d'autre.

- **❤ (cœur)** : retire-le de tout écran d'élève de partie « Tenir » où il ne désigne plus rien ; il reste dans le
  code du jeu classique. Constat : aucune occurrence dans `src/gl/components/tenir/` ; sur le chemin d'un élève en
  « Tenir », regarde `GLSpellCastWizard.jsx` (l. 285, unité `'❤️'`), `GLSpellCatalog.jsx`, `GLSpellPopover.jsx`,
  `GLFeuilletPopover.jsx`, `GLMarketView.jsx`, `GLMarketPlacePanels.jsx`, `GLStatsView.jsx`. Dis ce que tu retires.
- **Test** `tests/content/gl-mots-du-voyage.test.js` (nouveau) :
  - lit les fichiers du registre élève (liste explicite dans le test) et les champs visibles des catalogues de
    `data/gl/tenir/` (`texte`, `effet_court`, `description`, `consigne`, `titre`, `question`, `feedback_*`,
    `correction`) ;
  - échoue sur `\bplateaux?\b`, `\bclasses?\b` (hors « classe de » au sens grammatical, s'il y en a),
    `\bjoueu(r|rs|se|ses)\b`, `\bMJ\b`, `ma[iî]tre du jeu`, `feuillet`, `statistique` ;
  - porte une liste blanche commentée (fichier, chaîne, raison) ;
  - message d'échec en français, avec fichier et ligne ;
  - ne bute ni sur les commentaires ni sur les identifiants : extrais les chaînes affichées, ou retire les
    commentaires avant de chercher ; dis ta méthode.
- Garde verts `tests/content/gl-adresse-ecran-equipe.test.js` et le filtre `findForbiddenString`
  (`src/shared/glGardeFousCore.js`).
- **Critère d'acceptation** : le test passe ; la barre d'un élève lit « Mon sac » (étape ecrans-6.4), « Le chemin »,
  « La nature », « L'aventure », « Le monde G&L », « La caravane » ; la console du prof n'a changé nulle part.

### ecrans-6.2 — La visite d'Olu se tient (ex-étape V3)

- **Constat vérifié** sur `main` :
  - `src/gl/context/GLTourContext.jsx` : la visite démarre seule 650 ms après la première visite d'un onglet
    (`AUTO_START_DELAY_MS`, l. 34 ; effet l. 89-99). Rien ne regarde si un tour est ouvert ; rien ne ferme la visite
    quand `tab` change.
  - À l'ouverture du tour, `AppGL.jsx` bascule l'élève sur l'onglet du plateau (`tourOuvertNumero`, l. 793-810) :
    sa première séance sur son compte s'ouvre sur une bulle d'Olu par-dessus l'écran du tour.
  - `tab` vaut l'identifiant du **sous-onglet** (`ecosystemes`, `history`, `rules`…), jamais celui du regroupement
    (en-tête de `glDiscoveryTour.js`) : chaque sous-onglet a son parcours et le lance à sa première visite.
  - Le moteur partagé `src/shared/hooks/useGuidedTour.js` marque le parcours **vu dès son démarrage**
    (`startTour`, l. 116-137) ; `stopTour` ne fait que fermer.
  - Vitrine `?demo=parents` : mémoire à part (`GL_DEMO_TOUR_SEEN_STORAGE_KEY`), effacée à chaque entrée
    automatique en démonstration (`AppGL.jsx`, l. 245).
  - Vu dans Chrome le 24/11 (non revérifiable ici) : dans la vitrine, une visite à chaque onglet **et** à chaque
    sous-onglet (trois en trois clics) ; en passant de « Le monde G&L » à « Découverte », la bulle gardait le texte
    de l'onglet précédent (« Le monde, pas la partie »).
- **Changement attendu** :
  1. Aucun démarrage automatique quand l'écran d'équipe est monté ou qu'un tour est ouvert pour l'élève ; la visite
     partira à la visite suivante de l'onglet.
  2. Changement d'onglet ou de sous-onglet : la visite en cours se ferme, **sans être marquée vue**. Le moteur
     marque aujourd'hui « vu » au démarrage : trouve la voie la plus simple (ne marquer qu'après la première bulle
     passée, ou retirer la marque à la fermeture forcée), de préférence dans `GLTourContext.jsx` ; ForêtMap ne doit
     pas changer de comportement.
  3. Une visite par onglet principal ; les sous-onglets n'en lancent pas d'eux-mêmes (le « ? » les rouvre).
  4. Dans la vitrine des invités, la mémoire des visites vues tient pour la session du navigateur.
  5. Textes (`body` d'élève de `glDiscoveryTour.js`), mot pour mot. Les étapes existent sous ces clés : parcours
     `welcome` (étapes `what`, `where`), `maps` (`intro`, `reperes`), `rules` (`lire`).

     | Parcours › étape | Titre | Texte |
     | --- | --- | --- |
     | `welcome › what` | (inchangé) | « Un monde à traverser en équipe, des pages à retrouver, un carnet à remplir. L'histoire, je te laisse la découvrir : ce n'est pas la mienne à raconter. » |
     | `welcome › where` | (inchangé) | « Le « ? », en bas à droite de chaque écran. Un clic et je réexplique, autant de fois qu'il faudra. » |
     | `maps › intro` | « Le chemin » | « Voilà le monde de ce chapitre. Ton équipe avance sur le chemin quand le tour est ouvert ; le reste du temps, regarde et prépare la suite. » |
     | `maps › reperes` | « Les pages cachées » | « Des pages du carnet dorment dans le paysage. Pendant le tour, l'écran dit quand chercher, et l'Éclaireuse ou l'Éclaireur touche l'endroit. » |
     | `rules › lire` | « Les règles au calme » | « Le tour, les pages, les gemmes, les sorts. Si quelque chose t'a surpris pendant la séance, l'explication est ici. » |

     L'ancien texte écrivait « l'Opératrice ou l'Opérateur touche l'endroit » : corrigé ici, c'est l'Éclaireuse ou
     l'Éclaireur qui fouille.

  6. `bodyTeacher` des mêmes étapes : `maps › intro` « Le chemin du chapitre, tel que le voient les équipes. » ;
     `maps › reperes` « Les pages se cherchent dans le paysage pendant le tour ; tracez les zones avant la séance. » ;
     `rules › lire` « La page des règles, éditable depuis Contenus → Pages du monde. » (déjà mot pour mot sur
     `main`).
  7. Retire toute mention de « vitalité », de cœurs et de « Clique, tu verras bien » sur une case.
  8. Le titre du parcours `maps` (« Les cartes ») et les autres titres qui citent un onglet renommé suivent les
     libellés de l'étape ecrans-6.1.
- **Tests** (`tests-ui/gl/GLTourContext.test.jsx`) : tour ouvert → aucune bulle ; changement d'onglet → bulle
  fermée, parcours non marqué vu ; sous-onglet → pas de nouvelle bulle. Garde verts
  `tests/gl-tour-corpus-olu.test.js` et `tests-ui/gl/glTourAnchors.test.jsx`.
- **Critère d'acceptation** : un élève dont le tour s'ouvre ne voit aucune bulle de visite ; dans la vitrine, une
  seule visite par onglet principal.

### ecrans-6.3 — Le plateau sort de la nuit (ex-étape V6)

- **Constat vérifié** sur `main` : `.gl-board` (`src/gl/styles/gl-theme.css`, l. 1776-1786) porte
  `border: 1px solid #bae6fd` et `background: #e0f2fe`, le bleu ciel de ForêtMap codé en dur. Vu dans Chrome : le
  plateau peint flotte dans un rectangle bleu pâle.
- **Changement attendu** :
  - `background: radial-gradient(120% 90% at 50% 45%, var(--gl-color-primary) 0%, #04191b 100%)` ;
  - `border: 1px solid rgba(201, 162, 39, 0.4)` (l'ocre doré de la charte). La couleur suit le thème du monde
    (`--gl-color-primary` est posée par le thème du chapitre).
  - Vérifie le contraste des étiquettes d'équipe et des boutons posés sur ce fond (zoom, plein écran :
    `.gl-board-action--display`, l. 1561, porte aussi `#bae6fd`) ; ajuste **leur** fond, pas celui du plateau.
- **Textes** : aucun.
- **Tests** : un test CSS sur le modèle de `tests/visit-map-animations-css.test.js` : la règle `.gl-board` ne
  contient plus `#e0f2fe`.
- **Critère d'acceptation** : plus de bleu ciel derrière le plateau, sur la tablette, le compte et la projection.
- **À savoir** : le lot ecrans-7 posera le bois de la table par-dessus ce fond sur les écrans de la table ; ce fond
  reste le repli quand l'interrupteur de la table est coupé.

### ecrans-6.4 — « Mon sac » : le nom (étape nouvelle SAC-1)

- **Constat vérifié** sur `main` : `git grep -n "Seuil" -- src/gl` rend 49 lignes dans **22 fichiers**.
  - **Libellés et chaînes visibles (10 fichiers), à changer** :

    | Fichier (ligne) | Avant | Après |
    | --- | --- | --- |
    | `src/gl/constants/app-runtime.js` (10, `GL_SEUIL_TAB.label`) | « Le Seuil » | « Mon sac » |
    | `src/gl/components/GLSeuilView.jsx` (383, titre) | « Le Seuil » | « Mon sac » |
    | idem (355, attente) | « Le Seuil s'ouvre… » | « Ton sac s'ouvre… » |
    | `src/gl/components/GLMarketPlacePanels.jsx` (313) | « …dans ta garde-robe, au Seuil. » | « …dans ta garde-robe, dans ton sac. » |
    | `src/gl/constants/tenirTextes.js` (28) | « Le Marché et le Seuil s'ouvrent… » | « Le Marché et « Mon sac » s'ouvrent… » |
    | `src/gl/constants/glDiscoveryTour.js` (163, titre du parcours `seuil`) | « Le Seuil » | « Mon sac » |
    | `src/gl/hooks/useGLVoyageur.js` (30) | « Impossible de charger le Seuil. » | « Ton sac ne s'ouvre pas pour l'instant. » |
    | `src/gl/components/GLStatsView.jsx` (218, `title`) | « Le Seuil — niveau … » | « Niveau … » |
    | `src/gl/utils/glSettingsForm.js` (252) | « Le Seuil (niveau du voyageur) » | « Mon sac (l'espace personnel de l'élève) » |
    | idem (258) | « …les couper depuis le Seuil. » | « …les couper depuis Mon sac. » |

    Hors tableau :
    - `GLSeuilView.jsx` (365), message lu par le prof qui n'a pas de compte d'élève : « Le Seuil est l'accueil des
      joueurs : il montre le niveau et l'expédition d'un élève. » devient « Mon sac est l'espace personnel de
      l'élève : il montre son niveau et son expédition. »
    - La ligne d'Olu en entier (`OLU_LIGNE_COMPTES` de `tenirTextes.js` ; et
      `src/gl/components/tenir/GLTeamSessionView.jsx`, l. 217, si elle a survécu au lot ecrans-4) : « Le Marché et
      « Mon sac » s'ouvrent depuis le compte de chacun. »
    - `src/gl/utils/glSettingsForm.js` est l'écran de réglages du prof : seuls ces deux libellés changent.
    - `src/gl/utils/glPlayerJournalEmbed.js` (33), exemple de recherche d'un chapitre ou d'une scène, « ex.
      Seuil » : inchangé, inscrit en liste blanche (nom commun du récit) ; à relire par Oliv.

    Seuls « Mon sac », « ton sac », « dans ton sac » et « Ouvre ton sac. » sont les mots d'Oliv. Les phrases
    entières de ce tableau sont l'application de la règle à chaque chaîne : recopie-les, et liste-les dans ton
    rapport (« À relire par Oliv »). La ligne d'Olu parle à l'équipe (« vous ») : elle cite l'onglet par son nom,
    entre guillemets, plutôt que « ton sac ».

  - **Identifiants et commentaires (12 fichiers), à ne pas changer** : `src/gl/AppGL.jsx`,
    `src/gl/components/GLSeuilGardeRobe.jsx`, `src/gl/components/GLSeuilPagesVoyageur.jsx`,
    `src/gl/components/defis/GLDefisEntree.jsx`, `src/gl/components/settings/GLTenirSettings.jsx` (« Seuils des
    verdicts » : nom commun, réglage du prof), `src/gl/components/tenir/GLDefisCasePanel.jsx`,
    `src/gl/components/tenir/GLTenirEcranEquipe.jsx`, `src/gl/hooks/useGlTenirOlu.js`,
    `src/gl/styles/gl-seuil.css`, `src/gl/styles/gl-tenir.css`, `src/gl/utils/glAppShellHelpers.js`,
    `src/gl/utils/glVoyageurSounds.js`. Les commentaires des dix autres fichiers ne changent pas non plus.
  - Hors de ce relevé : « j'ai traversé le seuil » (bulle d'accueil d'Olu, `glDiscoveryTour.js`, en minuscule)
    est le nom commun du récit : il reste. `TENIR_OLU_FALLBACK.seuil` (`tenirTextes.js`) est une clé.
- **Changement attendu** : les remplacements du tableau ; aucun identifiant, aucune classe CSS, aucun test-id ne
  change.
- **Test de vocabulaire** : dans `tests/content/gl-mots-du-voyage.test.js`, une règle de plus : `\bSeuil\b`
  (majuscule) est refusé dans les chaînes affichées des fichiers du registre élève et dans les champs visibles des
  catalogues. Exceptions, en liste blanche commentée : le nom commun du récit ; `glPlayerJournalEmbed.js` ; et, **en
  attente du lot contenu-5**, `data/gl/tenir/olu-lignes.json` (`olu-pf-comptes`). Écris cette attente dans ton
  rapport (« Ce que les lots suivants doivent savoir ») : contenu-5 retire l'exception en posant le même texte que
  le repli ci-dessus.
- **Critère d'acceptation** : aucun écran d'élève ne lit « le Seuil » ; `GL_SEUIL_TAB.id` vaut toujours `seuil` ; les
  e2e de « Mon sac » passent avec le nouveau titre.

## 5. Migration

Aucune. (La section « Le Seuil » de la page « Les règles du jeu » se renomme par `mig-pages-servies`, lot contenu-5.)

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire. Tous les textes sont dans cette fiche.

**Images** : ce lot n'emploie aucune clé de médiathèque. Le fond du plateau est du CSS seul. L'icône de l'onglet
(`GL_icone_sac`, qui remplace `GL_icone_seuil`) est posée par le lot ecrans-8 : ici l'onglet garde son émoji.

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-seuil.spec.js`, `e2e/gl-responsive-accessibility.spec.js`,
  `e2e/gl-foundations.spec.js`, `e2e/gl-market.spec.js`, `e2e/gl-demo-modes.spec.js`,
  `e2e/gl-guest-discovery.spec.js`, `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-projection.spec.js`.
- `npm run test:content` (le nouveau test, `gl-adresse-ecran-equipe`).
- Banc, régime fumée : une passe à la fin, verte ; « aucun mot interdit dans un texte servi » compte ici.
- `npm run check:bundle` si `src/shared/hooks/useGuidedTour.js` a changé.
- Captures dans `docs/captures/gl-decisions/ecrans-6/` : barre d'onglets d'un élève (libellés) ; « Mon sac » (titre) ;
  plateau sur son fond sombre, aux quatre thèmes s'ils sont posés.
- À rendre dans ton rapport : la liste des fichiers du registre élève retenus par le test, et comment tu l'as
  reconstruite ; ce que tu laisses et pourquoi ; la liste blanche ; les phrases proposées.

## 8. Contrats de test changés

- Libellés d'onglets : « Mon sac », « Le chemin », « La caravane », « Le lexique du voyage », « Mes pages »,
  « Ma bourse et mes progrès ». Tests qui les citent sur `main` : `e2e/gl-responsive-accessibility.spec.js` (onglet
  « Le Seuil »), `e2e/gl-seuil.spec.js` (titres « Le Seuil » et « Moi, voyageur »), `e2e/gl-foundations.spec.js`,
  `e2e/gl-market.spec.js`, `e2e/class-teacher.spec.js`, `tests-ui/gl/GLSeuilView.test.jsx`,
  `tests-ui/gl/GLAdventureView.test.jsx`, `tests-ui/gl/GLMondeView.test.jsx`, `tests-ui/gl/GLJoueursView.test.jsx`,
  `tests-ui/gl/GLTopBar.test.jsx`, `tests-ui/gl/glAppShellHelpers.test.js`, `tests-ui/gl/glModeSeance.test.jsx`,
  `tests-ui/gl/glTourAnchors.test.jsx`.
- « Pour l'instant, regardez le chemin. » : `tests-ui/gl/GLTenirEcranEquipe.test.jsx`,
  `tests-ui/gl/GLTenirMoment.test.jsx`, `tests-ui/gl/glTenirMoment.test.js`.
- `title` « Cette page : Trouvé » : `tests-ui/gl/GLSeleneCarnetView.test.jsx`.
- Ligne d'Olu des comptes : `tests-ui/gl/GLTeamSessionView.test.jsx`, `tests-ui/gl/GLTenirEcranEquipe.test.jsx`.
- Textes de la visite d'Olu (`welcome`, `maps`, `rules`) ; plus de démarrage pendant un tour.
- Fond de `.gl-board` : plus de `#e0f2fe`.
- Aucun test-id ne change.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md`, § 1 seulement : le garde-fou de vocabulaire (registre élève, avant et après le
  miroir ; le lexique de la section 2 ; « Mon sac »). Les autres lignes des règles qui disent « Seuil » : lot fin-1.
- `.claude/skills/gl-tenir-garde-fous/SKILL.md` : le lexique du voyage et la liste blanche du test.
- `docs/reference/gl/*` : rien ici (lot fin-2). Donne dans ton rapport la table « ancien libellé → nouveau » pour
  ce lot.
- Une ligne pour le § 0 des règles, dans ton rapport.
- `changelog.d/gl-decisions-ecrans-6.md`.

## 10. Hors périmètre

- Le lexique du voyage filtré par monde, les notes d'auteur du lexique, les pages servies, la vitrine des invités
  et l'image d'accueil, « Mon sac » dans les catalogues et la page des règles : lot contenu-5.
- « Les marges du copiste » (« dans ton sac ») : lot contenu-6.
- Les cinq onglets, « Comprendre le jeu », « Mon sac » en deux états, l'icône de l'onglet : lot ecrans-8.
- La table de jeu (bois, cadres, jetons, typographie) : lot ecrans-7.
- Les règles (hors § 1) et les docs de référence : lots fin-1 et fin-2.

## 11. Pour Oliv

**À relire**

- Les phrases du tableau de l'étape ecrans-6.4 (elles appliquent « Mon sac », « ton sac », « dans ton sac »), en
  particulier la ligne d'Olu sur la tablette : « Le Marché et « Mon sac » s'ouvrent depuis le compte de chacun. »
- L'exemple « ex. Seuil » du champ de recherche de « Mon journal » : laissé, faute de consigne.
- Le titre « Ma bourse et mes progrès », écrit sans l'émoji 📊 de l'ancien titre.
- Les cinq bulles d'Olu réécrites (étape ecrans-6.2).
- Les chaînes que le balayage a remplacées par un mot du lexique, et celles que le rapport propose de réécrire.
- Les noms de sceaux et `titres.json` au masculin seul (« Gardiens de la Marée Reculée ») : hors de ce lot, à
  décider.

**À faire après la vague**

- Ouvrir la vitrine `?demo=parents` dans un navigateur privé : une seule visite d'Olu par onglet.
- Si l'aide par onglet ou les bulles d'Olu ont été réécrites dans Contenus (surcharges en base), les aligner à la
  main : ce lot ne change que les textes par défaut du dépôt.
- Poser les quatre thèmes de chapitre si ce n'est pas fait : le fond du plateau prend leur couleur.
