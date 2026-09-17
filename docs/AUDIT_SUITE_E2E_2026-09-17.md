# Audit — pourquoi la suite e2e était rouge, et depuis quand (17 septembre 2026)

**Ce que cet audit établit** : lancée en entier sur une base locale, la suite Playwright donnait
**88 réussites, 14 échecs, 1 test fragile, 5 sautés et 5 jamais exécutés** (ces derniers tombant
derrière un échec dans le même fichier). Aucun de ces échecs n'était un bug applicatif.
Tous venaient de specs restées sur une interface ou une règle qui avait changé sous elles — et
que rien ne rattrapait, parce que personne ne lance la suite en entier.

**Verdict** : les quatorze sont réparés, et le test fragile avec eux — **109 réussites, 5 sautés,
0 échec** sur 114 tests (un test en a été scindé en deux). Plus aucun test « jamais exécuté », et
la suite passe de 21 min 36 à 12 min 48. Les cinq sautés le sont par décision propre à chaque
spec (`test.skip`), pas par un échec : `admin-impersonation`, deux scénarios
`gl-player-journal`, `map-gps-follow` et `photos-upload-delete`.
La cause n'est pas la qualité des specs prises une à une, c'est qu'un refactor d'interface ne
casse pas le build, ne casse pas les tests unitaires, et ne se voit qu'au moment où quelqu'un joue
la suite complète.

---

## 1. Établir que ce n'était pas le lot en cours

Les quatorze échecs sont apparus dans le même run que le passage de la suite e2e en configuration
de production (fixture d'import d'administration). Avant de chercher plus loin, il fallait écarter
cette hypothèse — la plus probable a priori.

Protocole : un **worktree git sur le commit parent**, mêmes `node_modules`, même `dist/`, même
base, et les specs échouées rejouées là. Les quatorze s'y reproduisent à l'identique.

> **Une première mesure a été fausse, et mérite d'être racontée.** Le nouveau `global-setup`
> écrit `ui.auth.allow_register=false` **en base**, et `foretmap_test` persiste entre les runs.
> La première exécution de référence héritait donc de ce réglage : le code d'avant, qui passe par
> le formulaire public, échouait — non pas de son fait, mais du mien. Réglage remis à `true`,
> mesure refaite. Sans ce détour, l'audit aurait « prouvé » l'inverse de la vérité.

## 2. Ce que la CI ne voyait pas

|                      | CI                    | Poste local                                            |
| -------------------- | --------------------- | ------------------------------------------------------ |
| Base                 | neuve à chaque run    | `foretmap_test` persistante                            |
| Suite jouée          | complète, à chaque PR | rarement                                               |
| Nettoyage entre runs | sans objet            | `afterEach` conditionnés à la réussite du `beforeEach` |

La CI ne rencontrait pas les cas liés à l'accumulation. Pour les autres — les specs périmées —
l'explication est plus simple : ces spécifications ne sont pas dans les jobs bloquants joués à
chaque PR de la même façon, et une suite rouge qu'on ne lance pas reste verte dans l'esprit de
tout le monde.

## 3. Les causes, par famille

### 3.1 La navigation prof est passée en pôles, les fixtures non

`openTeacherPole` appariait le nom du pôle en `exact: true`. Or un pôle qui porte un badge de
travail à faire s'appelle, côté nom accessible, « **Suivi 9 à valider** ». L'appariement ne
trouvait rien, le clic était avalé par un `.catch(() => {})`, et l'échec tombait bien plus loin —
sur un onglet qu'on n'avait en réalité jamais demandé. C'est le pire genre de bug de test : il
ment sur l'endroit du problème.

`groups-module` cumulait trois décalages : le pôle « Administration » à ouvrir, le sous-onglet
« Groupes » à cliquer, et un texte attendu (« Module dédié: structure pédagogique ») qui
n'existe plus **nulle part** dans le code.

### 3.2 Le mode compact n'était pas dans les fixtures

Sous 640 px, ouvrir un pôle n'étale pas ses onglets dans `.top-tabs` : il ouvre une feuille
`BottomSheet`. Et l'onglet fusionné « Cartes, tâches et tuto » n'existe qu'en desktop — en
compact, les tâches vivent dans le pôle **Suivi**. Les fixtures ne connaissaient que la
disposition desktop : quatre échecs `modals-responsive`, en mobile et en tablette, pendant que le
même test passait en desktop. Le nouveau helper `openTeacherTabInPole` porte les deux cas.

### 3.3 Une fonction dont le nom promettait plus qu'elle ne faisait

`disableTeacherMode` a été réduite à une simple déconnexion quand l'élévation par PIN a été
retirée, avec ce commentaire : « la signature reste stable pour les specs appelantes ». La
signature, oui — pas le contrat. Ses quatre appelants enchaînent tous sur un geste d'élève et se
retrouvaient sur l'écran de connexion. Elle reconnecte maintenant le profil qu'on lui passe.

### 3.4 Deux refactors qui ont laissé des specs orphelines

- **`SharedMapStage` (14 sept.)** a unifié Plan, Visite et Carte de travail. `VisitMapZoomControls`
  est depuis **importé nulle part** — du code mort — mais trois specs visaient encore ses
  libellés.
- **« La mascotte suit le compte »** a délibérément découplé le studio du plan : le sélecteur du
  studio est étiqueté « à prévisualiser » et n'écrit qu'un stockage local que le plan d'un compte
  connecté ne lit plus. Le CHANGELOG le dit, avec l'effet de bord assumé. La spec vérifiait la
  promesse inverse. Elle est scindée en deux tests, un par mécanisme.

### 3.5 Un budget de temps jamais relevé

`teacher-zone-contour-edit` était le seul scénario de son poids — création de compte, élévation
prof, carte complète — à garder le budget par défaut de 60 s, là où `tasks-full-cycle` et
`modals-responsive` se donnent 300 s et plus. Il tient en 2 min 20 sur une base un peu chargée.
Deux pièges s'y ajoutaient : le `<g class="map-zone-hit">` **est** le bouton (rôle et `aria-label`
portés par le groupe), si bien qu'un `filter({ has: … })` ne trouve rien ; et un clic « forcé »
vise le centre de la boîte englobante, qui pour un polygone peut tomber hors de la forme. Le
nouvel helper `openZoneModalByName` active la zone au clavier — `Enter` passe outre tout le test
de survol.

### 3.6 Un drapeau désactivé par défaut

`gameplay.market_hearts_enabled` vaut `false` : le champ « Cœurs » n'est pas rendu, et le serveur
refuse tout montant en cœurs. Le scénario « échange 1 cœur contre 1 gemme » attendait une
interface que personne ne sert. Un test qui couvre une fonctionnalité derrière un drapeau doit
l'activer lui-même — et le remettre comme il l'a trouvé.

### 3.7 Le run précédent cassait le suivant

C'est le seul cas où la volumétrie compte, et il est instructif. Les `afterEach` de nettoyage sont
conditionnés à la réussite du `beforeEach` : **un run en échec ne nettoie rien**. Sept exemplaires
du repère « E2E mascotte A » ont fini au même point du plan, où le clustering de `SharedMapStage`
les a **agrégés** — et le repère que la spec cherche n'existait alors plus comme bouton.

La purge de `e2e/global-setup.js` couvre donc aussi les repères et zones de visite `E2E %` et les
groupes jetables `e2e-n3-*`. **Périmètre volontairement étroit** : `foretmap_test` sert aussi à
`npm test`, et supprimer ici ses jeux masquerait des fuites appartenant à la suite backend.

## 4. Ce qui reste à décider

Rien de ce qui précède ne dit que la suite restera verte. Trois points, aucun engagé ici :

1. **Personne ne joue la suite en entier.** C'est la cause de fond : six des sept familles
   ci-dessus auraient été vues le jour du refactor. Un job CI complet, ou une habitude, est le
   vrai correctif — pas les quatorze réparations.
2. **Le nettoyage conditionnel.** Tant qu'un `afterEach` dépend de la réussite du `beforeEach`,
   un échec continuera d'en produire d'autres. La purge au démarrage compense ; elle ne corrige
   pas le mécanisme.
3. **`foretmap_test` est partagée** entre `npm test` et l'e2e. Une base par suite supprimerait
   toute une classe d'interférences, au prix d'un peu d'outillage.
4. **Un `data-testid` et un `aria-label` en double.** `GLBoardChrome.jsx` et `MusicPlayer.jsx`
   montent tous deux `GLZoneMusicMuteButton` : selon l'ordre de rendu, le mode strict de
   Playwright voyait un élément ou deux — d'où le test fragile. La spec est rendue déterministe,
   mais le doublon reste : deux commandes annoncées **à l'identique** sur un même écran est
   d'abord un défaut d'accessibilité. Lequel des deux doit disparaître est une décision
   d'interface, pas de test.

---

_Index des audits : [`docs/audits/README.md`](audits/README.md). Configuration de production de la
suite : [`docs/LOCAL_DEV.md`](LOCAL_DEV.md) § e2e._
