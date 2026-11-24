# Audit — UI/UX : entrée visiteur, Visite, performance perçue, glossaire, navigation élève

> Portée : ce que voit un **visiteur sans compte** (écran d'accueil, Visite de la forêt
> comestible, fiche de zone, glossaire) et, par le code seulement, la navigation de l'élève
> connecté. Audit mené le 2026-11-19 sur la prod v1.250.13 (schéma 373, commit `6a1d8a6`) :
> parcours en direct dans un navigateur d'ordinateur (fenêtre de 2 276 px), mesures par l'API
> Performance du navigateur, comptages par script sur le code, données de prod lues par le
> connecteur (statistiques de la Visite, packs de mascottes, glossaire, textes des zones, usage
> sur 30 jours).
>
> **Hors portée** (acquis à ne pas faire régresser, pas réaudités) : homogénéité
> typographique, formulaires et onglets (`AUDIT_UI_2026-09-16.md`,
> `AUDIT_UI_FORMULAIRES_ONGLETS_2026-09.md`), navigation iPhone
> (`AUDIT_NAVIGATION_IPHONE_2026-09.md`), Visite de septembre (`AUDIT_VISITE_UI_UX_2026-09.md`).
> **Non vérifié en direct** : surfaces connectées élève et prof, rendu mobile réel ; les
> constats mobiles viennent du code et des audits de septembre.
>
> **Décisions d'Oliv du 2026-11-20** : tutoiement partout, Visite publique comprise (U8) ;
> case « Proposé dans la Visite » par pack de mascotte, distincte de la publication qui sert
> aussi G&L (U4) ; crédit de l'accueil au prénom seul (U3) ; « vu » automatique après lecture
> réelle, annulable (U6). Les contenus de la Visite (fiches de zones et de repères) tutoient
> depuis le 20/11, le pack de l'oiseau antagoniste est renommé « Oiseau noir ».
>
> **Suivi** : chaque constat reçoit une ligne **« Corrigé »** (lot, PR, fichiers) quand il est
> traité. Le document reste rédigé au présent de l'audit : ce qui est décrit est l'état
> constaté avant correction. Organisation des lots en sessions parallèles : § 4.

Gravité : 🔴 bloque ou fait fuir · 🟠 gêne nettement · 🟡 finition.

---

## 1. Synthèse

Le contenu est bon et le socle technique d'interface est sain (dialogues accessibles, jetons
typographiques, garde-fous CI de couleur, de contraste, de cibles tactiles et d'accessibilité
en cliquet). Les problèmes restants se voient **en utilisant l'app**, surtout comme visiteur :
l'attente au premier chargement, une porte d'entrée pensée pour les élèves, une carte non
cadrée aux étiquettes coupées, une fiche de zone qui masque la carte, et des indisponibilités
serveur mal expliquées au public.

## 2. Constats

### U1 — 🔴 Performance perçue au premier chargement

| Mesure (liaison lente : 0,85 Mb/s, RTT 200 ms) | Premier chargement | Cache chaud |
| ---------------------------------------------- | ------------------ | ----------- |
| Réception du HTML (TTFB)                       | 0,5 s              | **4,0 s**   |
| Premier affichage (FCP)                        | **8,9 s**          | 4,2 s       |
| Plus grand élément (LCP)                       | **17,7 s**         | 4,2 s       |

- À cache chaud, le TTFB vaut exactement `DEFAULT_NETWORK_TIMEOUT_SECONDS = 4`
  (`src/shared/pwa/swTemplate.js`) : le HTML est servi en _network-first_ et attend le réseau
  alors qu'une copie est en cache.
- L'écran de connexion charge 25 modules JS (1,5 Mo décodés, dont `main` 698 Ko) et 375 Ko de
  CSS : `RewardsPanel`, `spriteCutCatalogEntry`, `TotpChallenge`, `MarkdownTextarea`,
  `GuidedTourOverlay`, `visitMascotPackExtras`… aucun ne sert à se connecter.
- `/api/visit/content` embarque le JSON complet de tous les packs publiés (319 Ko pour la
  carte `foret` le 20/11) ; les aperçus de mascottes arrivent environ 10 s après la carte
  (spritesheets complètes, cadres vides en attendant).

Piste : HTML en _app shell_ (copie en cache immédiate, revalidation, invitation « nouvelle
version » via `/api/version`), écran de connexion limité à l'authentification, vignette
statique par pack, contenu de la Visite allégé.

**Corrigé** (lot 2, session C, branche `claude/ui-ux-visite-lot2`) : HTML en coquille
d'application dans le service worker (`src/shared/pwa/swTemplate.js`, stratégie `app-shell`
par défaut, revalidation par le service worker lui-même et le bandeau existant, repli
network-first si une version attend) — à cache chaud, TTFB ~5 ms au lieu de 3 s (serveur
ralenti à 3 s, e2e `perf-app-shell`) ; CSS principal sorti en `foretmap-styles-*.css`
(`vite.config.js`) ; notice « Vos données » chargée à la demande (`src/main.jsx`, −18 Ko) ;
budget de bundle en CI (`scripts/check-bundle-budget.js`, cliquet à 1 530 Ko de JS, objectif
400 Ko) ; vignette PNG par pack (`lib/visitMascotPackThumbnail.js`, rattrapage
`scripts/generate-visit-mascot-thumbnails.js`). **Reste** : l'objectif de 400 Ko exige de
charger à la demande le shell connecté importé statiquement par `src/App.jsx` (hors du
périmètre de la session C : mesure 1 526 → 795 Ko en neuf imports) ; branchement de la
vignette dans la grille (session B) ; allègement de `/api/visit/content` (session B).

**Corrigé** (lot à part « découpage d'`App.jsx` », 20/11) : le shell connecté est chargé à la
demande depuis un seul module (`src/components/app/authenticatedShellParts.js`, `lazyScreen`
sous `ScreenLoadBoundary`), préchargé à l'inactivité sur l'écran de connexion mais pas
pendant la Visite publique. JS de l'écran de connexion : **1 529 → 770 Ko** ; cliquet abaissé
à 775 Ko. **Reste** pour l'objectif de 400 Ko, encore chargés d'emblée : React (206 Ko,
incompressible), `main` (203 Ko), `ImageLightboxProvider` (93 Ko), Markdown (76 Ko),
`VisitMascotFallbackSvg` (57 Ko), `socket.io` (40 Ko, importé par `useForetmapRealtime` alors
qu'il ne sert qu'une fois connecté).

**Corrigé** (lot J, branche `claude/ui-ux-vignettes-mascotte`) : la vignette est branchée. Le
serveur l'écrit à la création, à l'import, à l'enregistrement, à la réinitialisation d'un pack
et à chaque changement de ses images (`routes/visit/mascot.js`, échec journalisé sans bloquer
la réponse) ; `mascot_catalog[].thumbnail_url` (`/api/visit/content`, `/api/visit/mascots`) ;
le sélecteur « Guide » l'affiche (32 px, `loading="lazy"`), silhouette en repli — aucune
planche de sprites chargée pour le menu. Packs antérieurs :
`node scripts/generate-visit-mascot-thumbnails.js --published` (`docs/EXPLOITATION.md`).

**Corrigé** (lot K « poids de l'écran de connexion », 21/11, branche
`claude/ui-ux-poids-connexion`) : JS de l'écran de connexion **774,4 → 503,8 Ko** (17 → 11
fichiers) ; cliquet abaissé de 775 à **509 Ko**. Le constat précédent nommait mal le coupable :
le chunk « `ImageLightboxProvider` » de 93 Ko est un chunk partagé que le bundler nomme d'après
l'un de ses modules — la visionneuse d'images n'y pèse que 5 Ko. Le poids venait de trois
fonctions utilitaires exportées par des fichiers de composants et importées par les hooks du
shell (`readGlossaryTermMessage`, `tutorialPreviewPayload`, `readStoredPedagoSession`), qui
ramenaient avec elles le popover du glossaire, l'écran Séances, l'aperçu de tutoriel,
Markdown et les récompenses. Elles vivent désormais dans des modules sans composant
(`src/utils/glossaryTermMessage.js`, `tutorialPreviewPayload.js`, `pedagoSessionStorage.js`,
réexports conservés) ; l'éditeur riche de la description d'inscription est chargé à la demande
(`src/components/auth-views.jsx`, zone de saisie simple en attendant) ; le client Socket.IO
n'est importé qu'avec une session (`src/hooks/useForetmapRealtime.js`). Garde-fou :
`tests/login-entry-lazy.test.js` suit les imports statiques depuis `src/main.jsx` et nomme le
chemin fautif. **Reste** pour l'objectif de 400 Ko : React et les icônes (247 Ko,
incompressibles), `main` (162 Ko, dont les hooks du shell connecté — notifications, séances,
synchronisation — qu'`App.jsx` appelle même sans session : les sortir demande de scinder
`App.jsx` en une porte non connectée et une application connectée, lot à part avec test de
montage), le client d'API et `zod` (37 Ko).

**Corrigé** (lot 2, suite, 24/11, branche `claude/ui-ux-css-connexion`) : le CSS de l'écran de
connexion avait franchi son plafond sur `main` (372,9 > 372 Ko). Studio narrateur et
administration des comptes sortis de `src/index.css` vers des feuilles chargées avec leurs
écrans : **359,8 Ko**, cliquet à 365 Ko. **Reste** côté CSS : `src/index.css` porte encore les
réglages admin (`.settings-admin`), la médiathèque et la pédagogie, candidats au même traitement.

### U2 — 🔴 Indisponibilité vue par l'utilisateur

Deux redémarrages du serveur pendant l'audit. Côté écran : bandeau « Serveur momentanément
indisponible — reconnexion en cours… (tentative 2/8) » figé plusieurs dizaines de secondes,
clic sur un mot du glossaire sans effet, message « Réessayez ou contactez l'administrateur »
répété, appels simples à 18 s juste après le redémarrage.

Piste : la cause relève du chantier d'exploitation. Côté interface : message adapté au public
(« Le site redémarre, il revient dans un instant. »), contenu déjà affiché toujours lisible,
compteur de tentatives réservé aux comptes connectés, glossaire de la Visite sur la même
stratégie de cache que son contenu.

**Corrigé** (lot 2, session C, branche `claude/ui-ux-visite-lot2`) : public non connecté =
« Le site redémarre, il revient dans un instant. », sans compteur ni « contactez
l'administrateur » (`src/shared/fetchJsonWithRetry.js`, `src/shared/apiTransport.js`,
`src/services/api.js`) ; compteur réservé aux comptes connectés ; glossaire
(`/api/glossary/terms` et fiche d'un terme) en stale-while-revalidate comme le contenu de la
Visite (`scripts/build-pwa.js`) ; e2e `perf-app-shell` (API coupée : jamais d'écran blanc).

### U3 — 🟠 L'écran d'accueil sert les élèves, pas les visiteurs

- « Visiter sans compte », l'entrée des parents, des institutionnels et du plan e-nov, est le
  4ᵉ bouton secondaire, sous « Mot de passe oublié ».
- Une barre d'onglets ne contient qu'un onglet (« Connexion ») : un contrôle segmenté sans
  choix.
- Le sous-titre répète le nom du logiciel.
- La mention de l'auteur nommait un élève en entier sur une page publique (décision : prénom
  seul, réglé en prod le 20/11 ; défauts du code à aligner).
- Sur grand écran, une carte de 280 px au milieu d'un fond vide.

Piste : deux portes de poids égal, « Découvrir le lieu » et « Me connecter ».

> **Corrigé (lot 1, session B, branche `claude/ui-ux-visite-lot1-3`)** — deux portes de même
> poids « Découvrir le lieu » / « Me connecter » (`auth-views.jsx`, côte à côte ≥ 768 px), plus
> de barre à un seul onglet (inscription fermée en prod), sous-titre sans le nom du logiciel
> (défaut et valeur enregistrée), crédit au prénom seul (`lib/settings/identity.js`,
> `src/utils/appCredits.js`). Écart : la mention du message libre de crédit (réglage
> `content.auth.credit_message`, valeur de prod) nomme encore l'élève en entier — donnée à
> modifier dans l'administration, pas dans le code.

### U4 — 🔴 Le choix de la mascotte bloque l'entrée dans la Visite

- Fenêtre modale obligatoire avant toute carte, 19 packs ; le bouton « Commencer la visite »
  est sous la ligne de flottaison (fenêtre de 1 100 px de haut).
- Libellés techniques ou doublons publiés tels quels, un personnage antagoniste proposé comme
  guide.
- Chaque personnage existe en deux packs (version masculine et féminine) : le genre se choisit
  dans la liste au lieu d'une option.
- `visit_mascot_packs.is_published` décide à la fois de la Visite et du catalogue des
  mascottes d'équipe G&L : retirer un guide de la Visite le retire aux équipes.

Piste : guide présélectionné et visite immédiate ; choix dans la barre ; propriété « proposé
dans la Visite » par pack (pas de liste blanche figée, retirée volontairement en septembre).

> **Corrigé (lot 1, session B)** — plus de fenêtre : guide par défaut présélectionné, choix
> dans la barre (« Guide ») ; `visit_mascot_packs.visit_listed` (migration 374) distinct de
> `is_published`, case « Proposé dans la Visite » au studio, G&L inchangé ; `variant_of` et
> case « Version féminine » au sélecteur (une ligne par personnage) ; `/api/visit/content`
> réduit au pack par défaut + catalogue léger (pack à la demande). Le `label` du JSON d'un pack
> est réaligné sur la colonne (« Oiseau noir ») ; il n'était affiché nulle part dans la Visite.
>
> **Suite donnée (lot J)** — le menu « Guide » montre une vignette par personnage (celle de la
> version féminine quand la case est cochée), silhouette de repli sinon.

### U5 — 🟠 La carte n'est pas lisible d'emblée

- Cadrage initial : le haut est rogné ; grandes bandes vides autour et sous la carte.
- Étiquettes coupées au milieu d'un mot sans trait d'union (« Bananera / ie », « Jardiniè /
  res ») ou tronquées (« Cuve à ea… », « Butte Éro… »).
- Chevauchements : emojis de repère sur les étiquettes, mascotte posée sur une étiquette.
- L'emoji du repère Fumier est à remplacer (donnée, faite dans l'app).

Piste : cadrage _fit-to-content_, `hyphens: auto` avec `lang="fr"`, coupure aux espaces, nom
court optionnel, masquage par collision à faible zoom.

**Corrigé** (lot 4, branche `claude/ui-ux-visite-lot4`, 21/11) — reproduit sur la carte Forêt
(noms réels, base locale) avant correction, vérifié après dans Chromium (ordinateur 1 280 px et
iPhone 13) :

- **Coupures** : la cause était double — `overflow-wrap: anywhere` et une largeur de nom bornée
  à 96 px quelle que soit la longueur du mot (« Jardinières » : 123 px à 22,4 px). Le nom reçoit
  désormais la largeur de son mot le plus long (`zoneLabelUnbrokenWidthPx`, estimation glyphe
  par glyphe `estimateTextWidthPx` relevée sur DM Sans 700), replié aux espaces
  (`overflow-wrap: break-word`, `text-wrap: balance`). Pas de `hyphens: auto` : le navigateur
  couperait un mot qui tient sur la ligne suivante. Les noms de **repères** passent sur deux
  lignes (`markerLabelWidthPx`) au lieu de « Butte Eros… ». Moteur et rendu appellent les mêmes
  fonctions (option `wrapNamesAtSpaces`, calques HTML de `SharedMapStage` ; le calque d'édition
  SVG garde son calcul).
- **Cadrage** : marge intérieure optionnelle du moteur de vue (`contentInsetPx`, 0 par défaut —
  G&L, plan et carte de travail inchangés ; 20 px dans la Visite) ; cadre de la Visite à la
  forme du plan (`--fm-pct-content-aspect` exposé par la scène), plafonné, plancher de 300 px
  pour la colonne de commandes ; moteur d'étiquettes conscient du **cadre visible**
  (`labelFrameFromView`) : un nom qui en sortirait change de côté ou attend le zoom.
- **Chevauchements** : dans la Visite, épingles et pastilles **masquent** les noms
  (`obstaclesHideNames`, le contrat historique « un obstacle ne masque jamais » reste le défaut
  ailleurs) ; boutons de la carte et cartouche d'échelle sont des obstacles pour toutes les
  cartes de `SharedMapStage` (`chromeBoxes`) ; noms au-dessus de la mascotte guide (règle
  limitée à `.visit-map-stage`, la CSS de la mascotte étant partagée avec G&L).
- **Reste** : l'emoji du repère Fumier (donnée, dans l'app) ; « nom court optionnel » non fait
  (aucun nom de production ne le requiert une fois les coupures réglées) ; sur téléphone, la
  taille des noms (22 px environ sur un plan de 345 px, préférence « Aa » et pointeur tactile)
  laisse peu de noms à l'ouverture — ils apparaissent au zoom.

**Suite donnée** (lot I, branche `claude/ui-ux-repere-touchable`, 21/11) — repère intouchable
sous une pastille de regroupement, relevé par la session du lot 4 et reproduit avant correction
(Chromium, iPhone 13, positions réelles de la carte Forêt) : un repère seul à 25 px du centre
d'une pastille de 56 × 44 px, `elementFromPoint` renvoyant la pastille. Aucun recouvrement à
1 440 px.

- **Cause** : la grille de 44 px de `clusterMarkers` ne compare jamais deux repères rangés dans
  deux cellules voisines ; la marge de la Visite (lot 4) a seulement déplacé les cellules. La
  taille des cibles ne dépend pas du pointeur (44 px partout) : ce n'est pas `pointer: coarse`
  qui fait grossir la pastille, c'est son contenu (emoji et compteur).
- **Correction** (moteur, donc carte de travail, Visite et plan) : seconde passe de
  **séparation** après la grille. Tant que deux éléments rendus sont plus proches que l'écart
  requis (`clusterSeparationPx`, en pixels écran, taille rendue des cibles), la paire la plus en
  défaut fusionne : repère seul contre pastille = rayon de la pastille + rayon du repère ; deux
  repères seuls = le centre de l'un hors du carré de touche de l'autre ; deux pastilles = elles
  ne se couvrent plus l'emoji ni le compteur. Les repères mis à part (fiche ouverte, lieux mis
  en avant du plan e-nov) ne fusionnent toujours pas : ils sont rendus en dernier, donc
  au-dessus des pastilles.
- **Effet mesuré** (Visite, carte Forêt, 21 repères) : iPhone 13, 12 éléments dont 1 repère
  recouvert → 5 éléments (4 pastilles, 1 repère), tous touchables ; 1 440 px, 21 repères seuls,
  inchangé. Budget de l'écran de connexion inchangé (774,4 Ko).
- **Tests** : `tests-ui/shared/clusterMarkersSeparation.test.js` (écart requis tenu sur la
  forêt et sur des nuages denses, à plusieurs échelles et deux tailles de cibles) ; e2e
  `e2e/visit-markers-touch.spec.js` (chaque repère et chaque pastille touchables en leur
  centre, iPhone 13 et 1 440 px, fiche d'un repère isolé ouverte par un vrai clic) — rouge sur
  le moteur d'origine, vert après.
- **Reste, hors lot** : la mascotte guide intercepte le toucher de ce qu'elle recouvre (une
  pastille sous elle sur la Forêt) ; sur la carte N3 en téléphone, un repère tombe sous les
  boutons de zoom de la carte.

### U6 — 🟠 La fiche de zone cache ce qu'elle décrit

- Fenêtre centrée sur la carte et zoom de mise au point très serré : on perd le repère en
  refermant.
- Vignettes d'espèces d'apparence cliquable mais inertes (`visit-biodiv-tile--static`).
- « Y aller » suivi de trois informations techniques.
- « Marquer comme vu » à la main sur 265 lieux (138 zones, 127 repères) : 23 sessions,
  0 visite complète, complétion moyenne 4,2 %.
- 0 session anonyme comptée sur 30 jours alors que la Visite sans compte fonctionne (à
  diagnostiquer).

Piste : panneau latéral sur ordinateur, feuille basse sur mobile ; fiche espèce visiteur ;
« vu » automatique ; progression par carte.

> **Corrigé (lot 3, session B)** — panneau latéral non modal ≥ 1024 px, feuille basse
> partagée en dessous, zoom plafonné à 2× ; vignettes reliées par identifiant d'espèce ;
> « Y aller » sur une ligne ; « vu » automatique annulable (`ui.visit.auto_seen_delay_seconds`,
> 8 s) ; progression par carte et message de fin. Suivi anonyme : les progressions anonymes
> sont purgées au bout de 24 h et n'existent qu'au marquage « vu » — d'où « 0 session » ;
> compteurs agrégés par jour et par carte, sans identifiant (`visit_anonymous_daily`).

### U7 — 🟠 Le glossaire relie des mots qui n'en sont pas

- « plonge droit **vers** le bas » est lié au terme « ver » (homographe).
- Onze liens dans un seul texte de zone, « sol » lié deux fois.
- Trois implémentations proches : `src/utils/termAutolink.js` (ForêtMap et G&L) et
  `lib/term-autolink/` (serveur, tutoriels).

Piste : liste d'homographes jamais liés, premier emploi seulement par bloc, noyau unique dans
`lib/shared/`.

> **Corrigé (lot 5, session D, branche `claude/ui-ux-visite-lot5`)** — noyau unique
> `src/shared/glossary/termAutolinkCore.js`, miroir `lib/shared/termAutolinkCore.js` par
> `npm run sync:shared-cores` (l'ancien miroir dédié `lib/term-autolink/` n'est plus qu'une
> réexportation). Homographes (« vers », « été », « sens », « son », « fin », « mare ») liés
> seulement après un déterminant ; premier emploi seulement par bloc ; tests
> `tests/term-autolink-density.test.js`. Écart avec l'audit : il n'y avait plus trois
> implémentations, déjà un tronc commun ESM et son miroir CJS ; l'option « forme exacte » par
> terme demanderait une colonne (migration), non faite.

### U8 — 🟡 Tu ou vous : la Visite ne choisit pas

L'habillage tutoie, une partie des textes vouvoyait (17 fiches sur 27 rédigées).

Décision : tutoiement partout. Contenus passés au tutoiement en prod le 20/11 ; reste
l'habillage de l'interface et un test qui interdit le vouvoiement dans ses chaînes.

> **Corrigé (lot 1, session B)** — habillage de la Visite au tutoiement, garde-fou
> `tests/visit-tutoiement-guard.test.js` (Visite, accueil, aide).

### U9 — 🟡 Filtres de catégories à l'envers

Toutes les puces sont pleines (actives) et « Tout » est blanc : on lit l'inverse. Huit puces
plus « Tout » ne tiennent pas sur une ligne en mobile.

Piste : puces non pleines à l'état « tout affiché », pleine = filtre actif, « Tout »
réinitialise, `aria-pressed` cohérent.

> **Corrigé (lot 1, session B)** — le composant était juste ; c'est le réglage
> `ui.visit.default_category_ids`, qui coche toutes les catégories en prod, qui produisait
> l'état inversé. Toutes les catégories cochées valent désormais « Tout ». Défilement
> horizontal conservé sur mobile.

### U10 — 🟠 Navigation élève : jusqu'à 19 onglets à plat sur ordinateur

`buildStudentNavItems` empile jusqu'à 19 onglets. Le prof a reçu trois pôles en septembre,
l'élève non. Biodiversité, Groupes et Individus portent la même icône.

Piste : quatre pôles (Terrain, Vivant, Apprendre, Moi) sur le modèle de `TeacherTopTabs`,
composant de pôles mutualisé, une icône par onglet.

> **Corrigé (lot 6, session E, branche `claude/ui-ux-visite-lot6`)** — quatre pôles Terrain /
> Vivant / Apprendre / Moi dans la barre basse sur ordinateur (pôles puis onglets du pôle
> actif, hauteur inchangée), feuille « Plus » groupée par pôles sur mobile, pôle actif dérivé
> de l'onglet. Briques communes avec la barre prof dans `src/components/app/NavPoles.jsx` ;
> table onglet → pôle dans `src/constants/app-runtime.js` ; icônes propres pour Groupes et
> Individus (`src/shared/icons.jsx`, aussi côté prof). Bascules lues dans `MEDIA`. Test de
> non-perte sur les 65 536 combinaisons de modules et de droits.
>
> **Écarts avec l'audit, constatés à la reconnaissance** : constat confirmé (19 onglets au
> plus) ; Individus et Groupes partageaient aussi l'icône de Biodiversité dans la barre prof ;
> la barre élève était déjà sans `style={{` ni `z-index` littéral, et sa bascule compacte
> (1 023 px) était déjà dans l'échelle — seule celle du prof (640 px) devient `MEDIA.phone`.

### U11 — 🟡 Finitions d'accessibilité et de libellés

- Nom accessible « Ouvrir l aide: Aide visite » (apostrophe manquante, deux-points sans
  espace).
- Boutons à icône seule (⤢, Aa, ⤡) au sens peu lisible sans survol.
- « Retour connexion » pour un visiteur sans compte (« Quitter la visite »).
- L'ouverture de la fiche ajoute une barre de défilement de page.

> **Corrigé (lot 1, session B)** — « Ouvrir l'aide : … » (`HelpPanel`), « Quitter la
> visite », libellés visibles des boutons à icône de la barre à partir de 640 px. La barre de
> défilement de page à l'ouverture de la fiche disparaît avec le panneau latéral.

### U12 — 🟡 Dette d'interface remesurée

| Mesure                          | 16/09       | 19/11                            | Garde-fou au 19/11 |
| ------------------------------- | ----------- | -------------------------------- | ------------------ |
| `style={{` en JSX               | 1 288       | **1 405** (+9 %)                 | aucun              |
| Points de bascule CSS distincts | —           | **85** (dont 7 entre 640 et 768) | aucun              |
| `src/index.css`                 | —           | 11 247 lignes                    | —                  |
| Hex en CSS / en JSX             | 1 274 / 322 | 755 / 429                        | couleur (cliquet)  |
| `rgba()` en CSS                 | 563         | 594                              | aucun              |
| `z-index` littéraux             | —           | 70 (contre 48 en jeton)          | partiel            |
| Composant d'état vide partagé   | 0           | 0                                | —                  |

> **Corrigé (préalable R0, branche `ccr-8e642e43-xlsdmp`)** — trois outils communs, que
> chaque lot applique ensuite aux fichiers qu'il touche :
>
> - **Points de bascule** : `src/shared/breakpoints.js` (échelle 480 / 640 / 768 / 1024 px,
>   `mediaUp()`, `mediaDown()`, `MEDIA`) et `tests/breakpoints-guard.test.js`. Une propriété
>   `--bp-*` n'est pas lue dans une condition `@media` (et le dépôt n'a pas de PostCSS pour
>   `@custom-media`) : les feuilles écrivent la valeur en clair, le garde-fou vérifie qu'elle
>   est dans l'échelle et plafonne le reste (cliquet).
> - **`style={{`** : `tests/inline-style-guard.test.js`, inventaire par fichier
>   (`tests/fixtures/inline-style-baseline.json`) qui ne peut que rétrécir ; un objet de
>   propriétés personnalisées seules (`style={{ '--x': v }}`) n'est pas compté.
> - **`EmptyState`** : `src/shared/components/EmptyState.jsx` +
>   `src/shared/styles/empty-state.css` (ForêtMap et G&L) ; `TasksEmptyState` l'utilise.
>
> **Écart avec l'audit, constaté à la reconnaissance** : le relevé des conditions `@media`
> de `src/` donne **36 valeurs de largeur distinctes** (110 bornes), pas 85 — le chiffre de
> l'audit comptait vraisemblablement aussi les propriétés `max-width` / `min-width` hors
> condition média. Sur ces 36, 12 sont dans l'échelle (forme canonique ou décalée d'un pixel),
> **24 valeurs hors échelle pour 56 bornes** (720 px en tête, 12 occurrences). Les
> `style={{` sont 1 397 au commit de départ, dont 10 déjà de la forme « propriétés
> personnalisées seules » : 1 387 inventoriés dans 245 fichiers.

## 3. Ce qui va bien (à ne pas casser)

- Textes de zone de qualité : registre juste, notions reliées, prudence (« biodiversité
  indicative »).
- Socle : `DialogShell` et `useDialogA11y`, jetons typographiques, garde-fous CI, `aria-label`
  et `aria-current` sur les onglets.
- Mobile : onglets primaires + « Plus », pôles prof, projet Playwright WebKit en CI.
- Forêt comestible : 24 zones et 21 repères, 100 % rédigés dans la Visite.
- `App.jsx` est passé de ~2 400 à 593 lignes : le découpage est fait.

## 4. Lots et sessions

| Vague | Session | Lots           | Constats                | Impact G&L                        |
| ----- | ------- | -------------- | ----------------------- | --------------------------------- |
| 0     | A       | R0 (préalable) | U12                     | oui (CSS et composant partagés)   |
| 1     | B       | 1 + 3          | U3, U4, U6, U8, U9, U11 | mascottes partagées               |
| 1     | C       | 2              | U1, U2                  | service worker et bundle partagés |
| 1     | D       | 5              | U7                      | oui, direct                       |
| 1     | E       | 6              | U10                     | non                               |
| 2     | F       | 4              | U5                      | moteur `pct-map` partagé          |

Chaque session ajoute sa ligne « Corrigé » sous le constat qu'elle traite, sans réécrire le
reste du document (fichier partagé entre sessions).

> **Suite donnée (lot H, branche `claude/ui-ux-ci-au-vert`, 21/11)** — CI remise au vert sans
> toucher à l'application : rejeu de la migration 375 accepté par MariaDB 11.4,
> `MoodleAdminPanel.test.jsx` stabilisé (cause : effet de montage rejoué après la saisie),
> `e2e/visit-mascot.spec.js` réparé (attente morte de 45 s, sélecteur de carte en boutons).
> Détail : `CHANGELOG.md`.
