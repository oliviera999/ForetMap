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

### U2 — 🔴 Indisponibilité vue par l'utilisateur

Deux redémarrages du serveur pendant l'audit. Côté écran : bandeau « Serveur momentanément
indisponible — reconnexion en cours… (tentative 2/8) » figé plusieurs dizaines de secondes,
clic sur un mot du glossaire sans effet, message « Réessayez ou contactez l'administrateur »
répété, appels simples à 18 s juste après le redémarrage.

Piste : la cause relève du chantier d'exploitation. Côté interface : message adapté au public
(« Le site redémarre, il revient dans un instant. »), contenu déjà affiché toujours lisible,
compteur de tentatives réservé aux comptes connectés, glossaire de la Visite sur la même
stratégie de cache que son contenu.

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

### U5 — 🟠 La carte n'est pas lisible d'emblée

- Cadrage initial : le haut est rogné ; grandes bandes vides autour et sous la carte.
- Étiquettes coupées au milieu d'un mot sans trait d'union (« Bananera / ie », « Jardiniè /
  res ») ou tronquées (« Cuve à ea… », « Butte Éro… »).
- Chevauchements : emojis de repère sur les étiquettes, mascotte posée sur une étiquette.
- L'emoji du repère Fumier est à remplacer (donnée, faite dans l'app).

Piste : cadrage _fit-to-content_, `hyphens: auto` avec `lang="fr"`, coupure aux espaces, nom
court optionnel, masquage par collision à faible zoom.

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

### U9 — 🟡 Filtres de catégories à l'envers

Toutes les puces sont pleines (actives) et « Tout » est blanc : on lit l'inverse. Huit puces
plus « Tout » ne tiennent pas sur une ligne en mobile.

Piste : puces non pleines à l'état « tout affiché », pleine = filtre actif, « Tout »
réinitialise, `aria-pressed` cohérent.

### U10 — 🟠 Navigation élève : jusqu'à 19 onglets à plat sur ordinateur

`buildStudentNavItems` empile jusqu'à 19 onglets. Le prof a reçu trois pôles en septembre,
l'élève non. Biodiversité, Groupes et Individus portent la même icône.

Piste : quatre pôles (Terrain, Vivant, Apprendre, Moi) sur le modèle de `TeacherTopTabs`,
composant de pôles mutualisé, une icône par onglet.

### U11 — 🟡 Finitions d'accessibilité et de libellés

- Nom accessible « Ouvrir l aide: Aide visite » (apostrophe manquante, deux-points sans
  espace).
- Boutons à icône seule (⤢, Aa, ⤡) au sens peu lisible sans survol.
- « Retour connexion » pour un visiteur sans compte (« Quitter la visite »).
- L'ouverture de la fiche ajoute une barre de défilement de page.

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
