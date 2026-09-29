# Audit — cohérence du profil « Prof de classe » (29 septembre 2026)

> **Statut** : 13 constats sur 14 **traités** le jour même (correctifs + tests). Le constat
> « liste des comptes en attente globale » (§ 2, ligne 14, premier point) reste **ouvert**.

## 1. Périmètre

Profil système `prof_classe` (« Prof de classe », rang 350) : un compte enseignant qui encadre
des classes d'élèves restés **visiteurs**, sans l'interface n3boss ni aucune tâche. Depuis le
22 septembre 2026, il ne porte plus `teacher.access`. L'audit vérifie que ce retrait n'a fermé
aucune route promise, et que le profil est cohérent de bout en bout : droits serveur,
navigation, « Mon profil », textes, documentation.

**Conforme au moment de l'audit** : navigation basse de visiteur connecté avec Stats et
Classe ; statistiques bornées à ses groupes (élèves visiteurs compris) ; pas de réglage ni
d'imposition du profil par défaut d'un groupe ; forum et commentaires limités à ses groupes ;
plan des personnels, export de ses données, changement de mot de passe (12 caractères).

## 2. Constats

| #   | Gravité  | Constat                                                                                                                                                                         | Où (au 29/09)                                               | Suite donnée                                                                                                                                                                                   |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bloquant | « Mon profil » efface des données : le formulaire, pré-rempli à vide, renvoyait pseudo, description et niveau biodiversité vides au premier « Enregistrer » (tous enseignants). | `App.jsx`, `stats-views.jsx`                                | **Traité** — `/api/auth/me` renvoie `profile` aux enseignants ; session fusionnée ; PATCH différentiel (`buildProfilePatchPayload`).                                                           |
| 2   | Bloquant | Montée à n3boss par un groupe : un prof de classe membre d'un groupe au profil par défaut « n3boss » devenait n3boss, vue globale comprise.                                     | `lib/effectiveRole.js`                                      | **Traité** — un enseignant ne reçoit jamais de profil par un groupe (arbitrage du mainteneur) ; recalcul à chaque `/me`.                                                                       |
| 3   | Majeur   | Périmètre cartes appliqué à tort : l'exemption des professeurs reposait sur `teacher.access`.                                                                                   | `lib/shared/mapScopeCore.js`                                | **Traité** — tout compte `teacher` est exempté.                                                                                                                                                |
| 4   | Majeur   | L'import de groupes contournait l'interdiction de créer une classe racine ou de détacher un groupe.                                                                             | `lib/groupImport.js`                                        | **Traité** — lignes refusées hors vue globale.                                                                                                                                                 |
| 5   | Majeur   | Droit d'édition sur les clés d'identification, contenu commun à l'établissement.                                                                                                | `lib/rbac.js`                                               | **Traité** — `id_keys.manage` retiré (arbitrage), migration 310.                                                                                                                               |
| 6   | Majeur   | Doc périmée : point 6 de la doc de référence et `docs/API.md` (verrou `teacher.access`, matrice incomplète).                                                                    | `comptes-roles-et-groupes.md`, `API.md`                     | **Traité** — doc réécrite (points 6 à 8, règle de groupe, racines, import).                                                                                                                    |
| 7   | Moyen    | Appelé « n3boss » dans « Mon profil » et dans le bandeau de prise de contrôle.                                                                                                  | `studentProfileFields.js`, `RolePreviewBanners.jsx`         | **Traité** — nom réel du profil ; bandeau « compte élève / compte enseignant ».                                                                                                                |
| 8   | Moyen    | Bouton « Connexion professeur » affiché alors qu'il refuse ses identifiants.                                                                                                    | `AppHeader.jsx`                                             | **Traité** — masqué pour un compte enseignant.                                                                                                                                                 |
| 9   | Moyen    | Mascotte et commentaires absents en Visite (aucun utilisateur transmis).                                                                                                        | `App.jsx`                                                   | **Traité** — la session enseignante est transmise aux onglets d'apprentissage.                                                                                                                 |
| 10  | Moyen    | Mascotte et niveau biodiversité perdus au rafraîchissement de session.                                                                                                          | `useAuthSession.js`                                         | **Traité** — champs relus de `profile`, sinon conservés.                                                                                                                                       |
| 11  | Mineur   | Bloc Quiz toujours « indisponible » (lecture globale requise) ; titre « Statistiques des n3beurs ».                                                                             | `stats-views.jsx`                                           | **Traité** — bloc réservé à `stats.read.all` ; « Statistiques de mes élèves », sans compteurs de tâches.                                                                                       |
| 12  | Mineur   | Visites guidées au texte d'élève ; visite de l'onglet Classe réduite à une étape.                                                                                               | `constants/discoveryTour.js`                                | **Traité** — textes `bodyClassTeacher` pour Stats et Classe.                                                                                                                                   |
| 13  | Mineur   | Préférences de notification « Échéances » et « Tâches » proposées.                                                                                                              | `useNotificationCenter.js`                                  | **Traité** — rôle de notification dédié (Messages, Exploitation).                                                                                                                              |
| 14  | Mineur   | Écarts divers : liste des comptes en attente globale ; import avec Rôle vide → n3beurs novices ; suppression d'une classe racine possible ; quatre droits `tasks.*` inertes.    | `routes/groups.js`, `studentRouteHelpers.js`, `lib/rbac.js` | **Traité** sauf le premier point : Rôle vide → visiteur hors vue globale ; racine ni supprimable, ni désactivable, ni détachable ; `tasks.*` retirés. **Ouvert** : comptes en attente globaux. |

Dette associée, **traitée** : commentaires périmés (`App.jsx`, `routes/rbac.js`,
`TeacherTopTabs.jsx`) et quatre fixtures `tests-ui` qui prêtaient encore `teacher.access` au
profil ; aucun scénario de bout en bout ne couvrait ce profil (`e2e/class-teacher.spec.js`
ajouté).

## 3. Arbitrages du mainteneur

1. **Profil par défaut de groupe** : un compte enseignant n'en reçoit **jamais** (ni conféré, ni
   imposé) — plutôt que d'interdire « n3boss » comme profil par défaut.
2. **Clés d'identification** : droit retiré au prof de classe.
3. **Droits de tâches inertes** : retirés, conformément à la doc (« aucune tâche »).
