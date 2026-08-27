# Audit de refactoring — `src/App.jsx` et hygiène du lint — 2026-08-27

> **Statut : livré.** Audit de refactoring du shell applicatif, mené sur `main` @ `24132db`
> (version **1.136.0**), livré par les PR **#374** (fusionnée) et **#376**.
>
> Périmètre demandé : « audit de refactoring, simplification sans régression, et code partagé ;
> refactor `src/App.jsx` pour commencer ». Ce document rend compte de ce qui a été trouvé, de ce
> qui a été livré, **d'une régression que le refactoring a lui-même introduite**, et de ce qui
> reste ouvert.
>
> Complète [`AUDIT_GENERAL_2026-08-26.md`](AUDIT_GENERAL_2026-08-26.md) (26/08), qui portait sur
> la sécurité et la santé générale du dépôt.

---

## 1. Résumé exécutif

| Contrôle                                            | Avant                | Après                |
| --------------------------------------------------- | -------------------- | -------------------- |
| `src/App.jsx`                                       | 1 808 lignes         | **1 466 lignes**     |
| `npm run lint` (avertissements réels, hors `dist/`) | 523                  | **96**               |
| Fichiers de tests React couverts par le lint        | **0 / 460**          | **460 / 460**        |
| Tests de rendu d'`App`                              | **aucun**            | **4**                |
| `npm run test:ui`                                   | 3 123 / 455 fichiers | 3 157 / 459 fichiers |
| `npm run lint` — erreurs                            | 0                    | 0                    |

**Trois résultats méritent d'être retenus.**

1. **Un défaut fonctionnel dormait dans le bruit du lint.** Le choix de mascotte d'un compte
   connecté n'était **jamais enregistré côté serveur** — alors que la route existe, est testée,
   est documentée, et que la documentation de référence promet déjà le contraire. Le seul indice
   était un avertissement `no-unused-vars` noyé parmi 522 autres. Corrigé (§4).

2. **Le refactoring a introduit un plantage total de l'écran authentifié — et rien ne l'a vu.**
   Ni le lint, ni le build, ni les 3 153 tests. C'est le test écrit _ensuite_, pour valider une
   correction sans rapport, qui l'a rattrapé. Post-mortem en §5 : c'est le constat le plus utile
   de cet audit.

3. **Les trois quarts des avertissements du lint étaient un seul faux problème** (394 imports
   `React` rendus inutiles par le runtime JSX moderne), et un tiers du code — les 460 fichiers de
   `tests-ui/` — n'était **linté par personne**. Les deux sont réglés (§7).

---

## 2. Ce que contenait `src/App.jsx`

Le shell avait ré-accumulé quatre responsabilités qui n'y appartiennent pas. L'inventaire :

| Symptôme                                                                        | Ampleur                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `fetchAll` en ligne (polling différentiel, refetch ciblé, boucle concurrente)   | ~250 lignes, 8 `ref`, 14 états de domaine           |
| Cadence de polling en ligne, seuils magiques `90000` / `120000`                 | 3 effets + 1 mémo                                   |
| Écran d'accueil non authentifié dans le retour anticipé, gestionnaires en ligne | ~90 lignes                                          |
| Loader « feuille »                                                              | 3 copies                                            |
| Pied de page « Version »                                                        | 2 copies                                            |
| Modales statistiques / profil (overlay, croix, zone défilante)                  | 2 copies au caractère près                          |
| `canManageTutorials` / `canManageQuiz`                                          | même bloc, un nom de permission de différence       |
| `canParticipateForum` / `canParticipateContextComments`                         | idem                                                |
| Portée des cartes selon le rôle                                                 | écrite dans le mémo `visibleMaps` **et** `fetchAll` |
| Nom affiché de l'utilisateur                                                    | recopié 4 fois                                      |

---

## 3. Ce qui a été extrait

**Cycle de données → deux hooks dédiés**

| Fichier                          | Contenu                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks/useAppDataSync.js`    | Les 14 états de domaine et `fetchAll` : sonde `/api/sync-state`, refetch ciblé par domaine, boucle de rafraîchissements concurrents, bandeau « serveur indisponible », amorçage + debounce |
| `src/hooks/useAppDataPolling.js` | Cadence adaptative (temps réel, onglet en arrière-plan, onglets « calmes ») et refetch en quittant un onglet secondaire                                                                    |

`App.jsx` n'en garde que deux appels et un objet de contexte mémoïsé. Les seuils codés en dur
(90 s en temps réel, 120 s en arrière-plan) deviennent des constantes nommées.

**Dérivations dupliquées → helpers purs testés**

| Fichier                    | Ce qu'il factorise                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/utils/appAccess.js`   | `canManagePedagoContent` (tutoriels / quiz), `resolveParticipationFlag` (forum / commentaires de contexte) |
| `src/utils/appMapScope.js` | `allowedMapIdsForScope`, `visibleMapsForScope`, `pickDefaultMapId`, `resolveScopedMapId`                   |
| `src/utils/appIdentity.js` | `formatFullName`, `resolveSessionDisplayName`                                                              |

**JSX répété → quatre composants** — `AppLoader`, `AppFooter`, `AppUserDialog`,
`UnauthenticatedShell` (dans `src/components/app/`).

**Effet de bord bienvenu.** Trois objets de style, un tableau vide et la cible de la modale
statistiques passent en constantes de module ou en mémo : autant de props recréées à chaque rendu
du shell, qui cassaient les `React.memo` des vues.

---

## 4. Le défaut trouvé : la mascotte de visite ne suivait pas le compte

**Constat.** `App.jsx` calculait un persisteur `onPersistVisitMascotId` — et ne le passait à
personne. Or `MapTasksArea`, `PedagoTabs` et `VisitView` acceptent tous la prop, la route
`PUT /api/visit/mascot-preference` existe, est couverte par `tests/settings.test.js` et
`tests/visit-mascot-single-list.test.js`, est décrite dans `docs/API.md`, et
`docs/reference/foretmap/visite-et-mascottes.md` promet déjà que « avec un compte, la mascotte
suit la personne, pas l'appareil ».

**Conséquence pour l'utilisateur.** Le choix retombait silencieusement sur le stockage local du
navigateur : il ne suivait pas l'élève d'un appareil à l'autre, et une tablette partagée le
transmettait à l'élève suivant — exactement les deux problèmes que la fonction devait résoudre.

**Correction.** Quatre props branchées, rien d'autre à écrire : tout le mécanisme était déjà là.
Aucune documentation à mettre à jour — elle décrivait déjà le comportement voulu, c'est le code
qui était en retard sur elle.

**Contrepartie assumée.** Un compte qui avait un choix mémorisé dans son navigateur repart sur la
mascotte par défaut jusqu'à ce qu'il rechoisisse : dès lors que la mascotte vit dans le compte, le
stockage local n'est plus lu. C'est le prix de l'isolement sur poste partagé.

**Au passage.** Le mémo `profileTargetUser` ne listait pas `sessionUser?.visit_mascot_catalog_id`
dans ses dépendances : « Mon profil » rouvrait sur la mascotte précédente juste après un
changement depuis le plan.

---

## 5. Post-mortem : le refactoring a cassé l'écran authentifié, et rien ne l'a vu

**Le défaut.** En factorisant les deux modales, le lot a créé un `handleProfileUpdated` qui
référençait `updateTeacherSession` dans son tableau de dépendances — alors que ce `const` était
déclaré **plus bas** dans le corps du composant. Zone morte temporelle : `ReferenceError` à
**chaque rendu** de l'écran authentifié.

```
ReferenceError: Cannot access 'updateTeacherSession' before initialization
  src/App.jsx:608  [effectiveIsTeacher, updateStudentSession, updateTeacherSession]
```

**Pourquoi rien ne l'a vu.**

| Garde-fou                 | Pourquoi il est passé à côté                                       |
| ------------------------- | ------------------------------------------------------------------ |
| `npm run lint`            | `no-use-before-define` n'était pas activée                         |
| `npm run build`           | Le code est syntaxiquement valide ; la faute est à l'exécution     |
| `npm run test:ui` (3 153) | **Aucun test ne montait `App`**                                    |
| `npm test` (backend)      | Ne touche pas au frontend                                          |
| `npm run test:e2e`        | Non bloquant en CI, et non exécutable hors environnement avec base |

Le commit fautif a été **poussé et sa CI est passée au vert.** Ce qui l'a rattrapé, c'est un test
écrit _ensuite_, pour une correction sans rapport (§4) : il montait `App` pour vérifier qu'une
prop atteignait bien ses destinataires, et a planté au premier lancement.

**Ce que ça enseigne.** Un composant racine non couvert par le moindre test de rendu est une zone
aveugle totale : la CI ne dit rien de plus que « ça compile ». Deux garde-fous en sont sortis
(§6), et l'un des deux — la règle de lint — aurait suffi à bloquer ce commit précis.

---

## 6. Garde-fous ajoutés

**`no-use-before-define` en erreur sur `src/**`.** Variables uniquement (`functions: false` : les
déclarations de fonction sont hissées, l'ordre y est libre). Vérifiée sur une sonde jetable
reproduisant le motif exact du plantage. Coût d'activation : **cinq réordonnancements**, aucun ne
plantait mais tous étaient à un déplacement de ligne du même accident —
`settings-admin-views.jsx` référençait `saveSetting` depuis quatre points de rendu situés avant sa
déclaration, `quizGlossaryReveal.js` sa constante `EMPTY_ITEMS`.

**`tests-ui/AppShellWiring.test.jsx`** — les premiers tests de rendu d'`App` : session élève,
session prof, shell invité, et appel effectif de la route compte. Le composant est monté pour de
vrai, avec de simples sondes à la place des grosses vues (patron déjà en place dans
`tests-ui/components/app/PedagoTabs.test.jsx`).

> **Règle de travail qui en découle.** Refactorer un composant racine sans test de montage revient
> à travailler sans filet. Poser le test _avant_ le refactoring, pas après.

---

## 7. Hygiène du lint : 523 → 96 avertissements

**394 imports `React` morts (`src/**`).** `@vitejs/plugin-react` utilise le runtime JSX
**automatic** : le compilateur injecte `jsx()` lui-même, `React` n'a plus besoin d'être dans la
portée. La preuve était déjà dans le dépôt — sept fichiers écrivaient du JSX sans aucun import
`react` et étaient livrés sans problème. Ces imports représentaient **les trois quarts** des
avertissements. Suppression mécanique : seul le binding `React` est retiré (les imports nommés
sont conservés), et seulement là où plus aucune ligne de **code** ne référence l'identifiant — les
mentions `React.ReactNode` en JSDoc ne comptent pas, les usages réels (`React.memo`) gardent leur
import.

**Code mort sans ambiguïté.** 10 `catch` dont l'erreur n'était pas lue → `catch (_)` ; 11 imports
morts supprimés ; 7 paramètres conservés pour la signature préfixés `_` — dont le `next` du
gestionnaire d'erreurs Express, qui **doit** garder ses quatre arguments pour être reconnu comme
tel ; 3 paramètres de callback en trop retirés.

**`tests-ui/**` n'était linté par personne.** Ce chemin n'apparaissait dans **aucun bloc `files:`**
d'`eslint.config.cjs` : ESLint répondait `File ignored because no matching configuration was
supplied` et passait son chemin. 460 fichiers échappaient à `no-undef`, `no-unused-vars` et aux
garde-fous ci-dessus. Le trou se comble presque sans bruit : sur 253 avertissements révélés, **247
étaient encore des imports `React` morts** et **six seulement** étaient réels. Après nettoyage,
`tests-ui` linte à **zéro avertissement**. Le bloc reprend les règles de `src/**` sans celles des
Hooks — un test _monte_ des composants, il n'en déclare pas.

---

## 8. Ce qui reste ouvert

### 8.1 Quatre valeurs reçues ou calculées qui ne servent à rien (GL)

Une fois le bruit retiré, quatre cas ressemblent à du **comportement perdu**, pas à de l'oubli —
exactement le profil du persisteur de mascotte de §4. Les faire taire les enterrerait une seconde
fois : ils restent visibles dans le lint, et sont inscrits au registre d'arbitrage
([`docs/reference/INCOHERENCES.md`](reference/INCOHERENCES.md), entrée **G15**).

| Cas                          | Symptôme                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/glJournalPresent.js`    | Quatre valeurs calculées puis jamais rendues (`xp`, `yp`, `deltaStr`, `reasonPart`) dans le module qui **met en forme** les entrées de journal |
| `GLFeuilletZonePlateauPanel` | Reçoit `mapImageFrame` de `GLChaptersAdminView` sans s'en servir, alors que `GLChapterMapStudio` l'applique via `glImageFrameToStyle`          |
| `useGLKingdomZoneEditor`     | Déclare et documente une option `onDeleteZone` qu'il ne lit jamais (la suppression passe en fait par `GLKingdomZoneSidePanels`)                |
| `GLGameMasterConsoleLive`    | Reçoit `currentTeamId` sans l'utiliser, contrairement à `GLGameBoard` et `GLMapView`                                                           |

### 8.2 Les 96 avertissements restants

| Zone        | Nombre |
| ----------- | ------ |
| `src/`      | 40     |
| `lib/`      | 18     |
| `routes/`   | 18     |
| `tests/`    | 18     |
| `scripts/`  | 2      |
| `tests-ui/` | **0**  |

Par règle : **67 `no-unused-vars`**, **29 `react-hooks/exhaustive-deps`**. Les seconds demandent un
jugement au cas par cas — corriger une dépendance change le comportement — et ne relèvent pas d'un
lot mécanique.

### 8.3 Les fichiers suivants du chantier

| Fichier                                     | Lignes | Fichiers de tests |
| ------------------------------------------- | ------ | ----------------- |
| `src/components/visit-views.jsx`            | 1 214  | 1                 |
| `src/components/VisitMascotPackManager.jsx` | 1 158  | 0                 |
| `src/components/tasks-views.jsx`            | 1 029  | 2                 |
| `src/components/map-views.jsx`              | 910    | 3                 |
| `src/components/settings-admin-views.jsx`   | 901    | **0**             |
| `src/components/stats-views.jsx`            | 783    | **0**             |
| `src/components/tutorials-views.jsx`        | 762    | **0**             |
| `src/components/profiles-views.jsx`         | 705    | **0**             |
| `src/components/groups-views.jsx`           | 613    | **0**             |

`visit-views.jsx` est le plus gros, mais c'est surtout **un seul composant de ~1 140 lignes**.
Les cinq fichiers à zéro test représentent ~3 700 lignes de vues qu'un refactoring toucherait à
l'aveugle : au vu de §5, y poser un test de montage est le préalable, pas l'accompagnement.

---

## 9. Journal de livraison

| PR       | Contenu                                                                                                | État      |
| -------- | ------------------------------------------------------------------------------------------------------ | --------- |
| **#374** | Refactoring d'`App.jsx` · persistance mascotte branchée · TDZ corrigée · `no-use-before-define`        | Fusionnée |
| **#376** | 394 imports `React` morts · code mort sans ambiguïté · `tests-ui/**` couvert par le lint · ce document | Ouverte   |

**Vérifications à chaque lot** : `npm run lint` (0 erreur), `npm run format:check`,
`npm run test:ui`, `npm run build` avec `dist/` recommité, et `node --check` sur les fichiers
backend modifiés. La suite backend n'est **pas exécutable dans le conteneur de développement
utilisé** (pas de MySQL — tous les échecs y sont des `ECONNREFUSED 127.0.0.1:3306`) ; c'est le job
`test` de la CI qui la couvre, et il est passé au vert sur chaque commit.
