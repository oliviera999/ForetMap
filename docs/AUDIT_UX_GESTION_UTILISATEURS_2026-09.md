# Audit UI/UX — onglet « Profils & utilisateurs » (16 sept. 2026)

**Périmètre** : l'onglet d'administration `Profils & utilisateurs` et ses quatre sous-onglets
(`Profils`, `Comptes`, `Groupes`, `Imports & exports`), plus la fiche utilisateur
(modale « Modifier le compte »).

**Fichiers concernés** : `src/components/profiles-views.jsx`, `src/components/profiles/**`,
`src/components/groups-views.jsx`, `src/utils/profilesUserListFilters.js`,
`src/utils/profilesUserGroups.js`, `routes/rbac.js`, `lib/rbacUserGroups.js`.

> Instantané daté : constats au 16/09/2026, sur la base du code de la branche. Les constats
> traités par le lot associé sont marqués **Traité**. Le reste est une liste de propositions
> **non implémentées** — aucune n'est engagée sans arbitrage.

---

## 1. Ce qui a été corrigé dans ce lot

| #     | Constat                                                                                                                                                                                                                       | Correctif                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **La fiche d'un compte ne montrait ni son profil ni ses groupes.** L'en-tête se limitait à `Nom (student)`. Pour savoir si un élève était rattaché à une classe, il fallait quitter la fiche, aller dans `Groupes`, chercher. | `GET /api/rbac/users/:type/:id` renvoie `groups[]` ; une **carte d'identité** en lecture seule (`UserIdentitySummary`) ouvre la fiche avec profil + groupes + type + identifiant. **Traité** |
| **2** | **La liste des comptes ne montrait aucun rattachement.** Le filtre « groupe » existait, mais rien n'indiquait à quel groupe appartenait chaque ligne — filtrer sans pouvoir lire le résultat.                                 | `GET /api/rbac/users` renvoie `groups[]` ; chaque ligne affiche jusqu'à 3 pastilles puis « +N ». **Traité**                                                                                  |
| **3** | **`(student)` / `(teacher)` en anglais technique** dans une interface entièrement française.                                                                                                                                  | Pastille « Élève » / « Enseignant » (`userTypeLabel`). **Traité**                                                                                                                            |
| **4** | **Champs vides muets** : un compte sans profil ne se distinguait pas d'un compte dont l'information n'avait pas chargé.                                                                                                       | États vides explicites : « Aucun profil », « Aucun groupe ». **Traité**                                                                                                                      |
| **5** | **Le panneau Comptes chargeait `GET /api/groups` en entier** (tous les groupes × tous leurs membres × tous leurs périmètres) uniquement pour alimenter le filtre par groupe.                                                  | L'appartenance vient désormais de `users[].groups` ; seul `GET /api/groups/options` (léger) est encore appelé. Un appel lourd de moins à chaque ouverture du sous-onglet. **Traité**         |

Périmètre respecté : `groups[]` est filtré par le périmètre groupes de l'acteur
(`lib/groupScope.js`) — un prof de classe ne voit que les groupes qu'il encadre, un profil
`admin` ou porteur de `stats.read.all` les voit tous. La fiche reste en **lecture seule** sur
les groupes : la modification du rattachement reste dans le sous-onglet `Groupes`.

---

## 2. Propositions — sous-onglet « Comptes »

Classées par rapport valeur / coût. Aucune n'est implémentée.

### P1 — Fusionner les deux listes de comptes _(impact fort, coût moyen)_

Le sous-onglet affiche **deux listes d'utilisateurs superposées** avec deux modèles mentaux
différents :

- « Attribution des profils » : recherche + 3 filtres + pagination, actions _profil_ et _Modifier_ ;
- « Suppression de {élèves} » (`StudentDeletePanel`) : **sa propre recherche**, pas de filtres,
  pas de pagination, élèves seulement, actions _Dupliquer_ et _Supprimer_.

Un administrateur qui a filtré sur une classe dans la première liste doit **refaire sa recherche**
dans la seconde pour supprimer un compte, sans garantie de parler du même sous-ensemble.

**Proposition** : une liste unique. Supprimer / Dupliquer rejoignent la ligne (menu « … » ou
boutons secondaires) et la fiche, sous les mêmes permissions qu'aujourd'hui
(`canDeleteUi`, `canDuplicateStudents`). Le panneau dédié disparaît.

### P2 — Actions en lot _(impact fort, coût moyen)_

Attribuer un profil à 30 élèves demande aujourd'hui 30 interactions, chacune déclenchant un
`PUT` et un rechargement complet de la liste. Le sous-onglet `Groupes` sait déjà rattacher
**en lot** les visiteurs en attente : l'asymétrie est le vrai défaut.

**Proposition** : cases à cocher + barre d'actions groupées (attribuer un profil, rattacher à un
groupe, exporter la sélection), avec un récapitulatif avant application
(« 27 comptes passeront de _Visiteur_ à _Élève novice_ »).

### P3 — Confirmer les attributions sensibles _(impact fort, coût faible)_

Le `<select>` de profil **enregistre au changement**, sans confirmation ni annulation — y compris
pour passer un compte en `admin`. Une erreur de clic sur mobile accorde des droits
d'administration silencieusement, et il n'y a pas d'annulation.

**Proposition** : confirmation explicite pour les profils sensibles (`admin`, `prof`), sur le
modèle de `DeleteUserConfirmModal`. Les profils élèves restent en application directe.

### P4 — Retour d'information au bon endroit _(impact moyen, coût faible)_

Succès et erreurs s'affichent dans un bandeau **en tête de vue** (`ProfilesAdminFeedback`),
c'est-à-dire hors écran dès qu'on a fait défiler la liste : on change un profil ligne 18 et
le « Profil utilisateur mis à jour » s'affiche là où on ne regarde pas. Ces bandeaux n'ont ni
`role="alert"` ni `aria-live` — un lecteur d'écran ne les annonce pas.

**Proposition** : état inline sur la ligne modifiée (pastille « enregistré » transitoire) et/ou
toast ; `role="status"` sur le résumé de résultats, `role="alert"` sur l'erreur.

### P5 — Double défilement _(impact moyen, coût très faible)_

La liste est enfermée dans `maxHeight: 360px; overflow: auto` **à l'intérieur** d'une page qui
défile déjà et d'une pagination réglée à 25, 50 ou 100 lignes. Sur mobile, 360 px ≈ 4 lignes
visibles : on choisit « 100 par page » pour scruter une liste dans un hublot.

**Proposition** : supprimer le `maxHeight` — la pagination borne déjà la hauteur. Si un cadre
est souhaité sur grand écran, le réserver à `min-width: 1024px` avec une hauteur en `vh`.

### P6 — Tri _(impact moyen, coût faible)_

Aucun tri n'est disponible : l'ordre est imposé par le serveur (`user_type`, puis nom). Les
questions courantes — « qui n'a pas de profil ? », « qui a été créé aujourd'hui ? », « qui n'est
dans aucun groupe ? » — n'ont pas de réponse directe.

**Proposition** : un sélecteur « Trier par » (nom, profil, date de création, sans profil d'abord,
sans groupe d'abord), côté client comme les filtres actuels.

### P7 — Filtres partageables et persistés _(impact faible, coût faible)_

Incohérence : la **taille de page** est mémorisée (`localStorage`), les **filtres** non. Après un
rechargement ou un aller-retour vers `Groupes`, la recherche est perdue ; et une vue filtrée ne
peut pas être transmise à un collègue.

**Proposition** : porter les filtres dans l'URL (`?q=&role=&type=&group=`), ce qui règle
persistance et partage d'un coup, et aligner sur le sous-onglet `Groupes`.

### P8 — États vides utiles _(impact faible, coût très faible)_

Quand les filtres ne renvoient rien, le résumé affiche « Aucun compte » et la zone de liste est
vide, sans issue proposée. Un compte peut aussi être absent parce qu'il est hors périmètre.

**Proposition** : bloc d'état vide avec un bouton « Effacer les filtres » et un rappel du
périmètre quand l'acteur n'a pas la vue globale.

### P9 — Un seul bouton « Modifier » bloque toute la page _(impact faible, coût très faible)_

`editUserLoadState === 'loading'` désactive **tous** les boutons « Modifier » de la page pendant
le chargement d'une seule fiche.

**Proposition** : ne désactiver que la ligne concernée (comparaison sur `user_type` + `id`).

### P10 — Libellés des filtres _(accessibilité, coût très faible)_

Quatre `<select>` alignés n'ont qu'un `aria-label` ; une fois une valeur choisie (« Novice »),
plus rien à l'écran ne dit de quel filtre il s'agit. Les boutons « Modifier » partagent tous le
même nom accessible.

**Proposition** : libellé visible au-dessus de chaque filtre (ou préfixe dans l'option par
défaut : « Profil : tous »), et `aria-label` nominatif sur « Modifier » (déjà fait pour le
sélecteur de profil : `Profil de {nom}`).

---

## 3. Propositions — fiche utilisateur

### P11 — Une fiche, pas un formulaire _(impact fort, coût moyen)_

La modale s'intitule « Modifier le compte » et n'est **qu'**un formulaire, alors que le besoin
réel est d'abord de **consulter** (qui est cette personne, quels droits, quel groupe). La carte
d'identité ajoutée par ce lot est un premier pas ; la structure reste mono-bloc.

**Proposition** : « Fiche de {nom} » avec trois sections — **Identité** (formulaire actuel),
**Droits & groupes** (profil, permissions effectives, rattachements, lien vers le sous-onglet
`Groupes` pré-filtré), **Activité** (voir P13).

### P12 — Isoler les actions sensibles _(impact fort, coût faible)_

Le champ « Nouveau mot de passe » est aligné entre « Description » et « Affiliation », et
« Voir comme cet utilisateur » (impersonation, tracée au journal d'audit) se trouve juste
au-dessus de « Enregistrer ».

**Proposition** : sortir ces deux actions du formulaire vers un pied de fiche « Actions »
— « Réinitialiser le mot de passe » en action explicite, impersonation séparée du bouton
d'enregistrement.

### P13 — Métadonnées de support _(impact moyen, coût moyen)_

La fiche ne dit ni la date de création, ni la dernière connexion, ni si le compte est actif, ni
d'où il vient (inscription libre, import CSV, Moodle / LTI). Ce sont précisément les questions
posées en support (« il ne peut pas se connecter »).

**Proposition** : une ligne de métadonnées en lecture seule dans la carte d'identité ; les
colonnes existent déjà en base (`users.created_at`, `is_active`, `auth_provider`).

### P14 — Rattacher un groupe depuis la fiche _(impact moyen, coût moyen)_

Les groupes sont désormais **visibles** dans la fiche mais pas **modifiables** : corriger un
rattachement impose de fermer, aller dans `Groupes`, retrouver le groupe, retrouver la personne.

**Proposition** : ajouter / retirer un rattachement depuis la fiche, en réutilisant
`PUT /api/groups/:id/members` et les mêmes gardes de permission. À arbitrer : c'est la seule
proposition qui déplace une capacité d'écriture d'un onglet vers un autre.

---

## 4. Propositions — cohérence des sous-onglets

### P15 — Deux compteurs, deux sens _(impact moyen, coût très faible)_

`Comptes (128)` = nombre de résultats **filtrés** ; `Groupes (3)` = nombre de visiteurs **en
attente de traitement**. Même pastille, deux significations : l'une informative, l'autre une
alerte.

**Proposition** : `Comptes 128 / 350` pour l'information, et une pastille d'alerte distincte
(couleur + `aria-label` « 3 comptes à rattacher ») pour ce qui appelle une action.

### P16 — Onglet d'arrivée _(impact faible, coût très faible)_

Le sous-onglet est mémorisé (`foretmap.profiles.subTab`), mais la **première** visite arrive sur
`Profils` — la configuration RBAC, tâche rare — alors que l'usage quotidien est `Comptes`.

**Proposition** : défaut `Comptes` quand l'acteur en a le droit ; `Profils` reste en repli.

### P17 — Vocabulaire _(impact faible, coût faible)_

Trois mots circulent pour la même chose : « Profils » (onglet), « profil principal » (liste),
« rôle » (API, `role_id`, `role_slug`). La doc de référence parle de « profil de droits ».

**Proposition** : figer « profil » côté interface et documentation, garder « rôle » côté API, et
le noter dans `docs/reference/foretmap/comptes-roles-et-groupes.md`.

### P18 — Lisibilité des lignes _(impact faible, coût très faible)_

Sous 1024 px, `.profiles-admin-user-row` passe en colonne unique : nom, pastilles, sélecteur et
bouton s'empilent **sans séparateur**, et rien ne distingue visuellement la fin d'un compte du
début du suivant.

**Proposition** : filet `border-bottom` léger entre les lignes en mono-colonne.

---

## 5. Ordre de traitement suggéré

| Lot                           | Contenu             | Pourquoi                                                                                          |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| **A — sécurité et confiance** | P3, P4, P12         | Une attribution d'`admin` sans confirmation et sans retour visible est le risque le plus concret. |
| **B — volume**                | P1, P2, P5, P6      | Ce qui fait mal à la rentrée, quand la liste dépasse quelques centaines de comptes.               |
| **C — fiche**                 | P11, P13, puis P14  | Transforme la modale en véritable fiche de support.                                               |
| **D — finitions**             | P7 à P10, P15 à P18 | Coût faible, gain de cohérence.                                                                   |

---

## 6. Suivi

- Constats 1 à 5 : **traités** (lot du 16/09/2026, voir `CHANGELOG.md`).
- P1 à P18 : **ouverts**, non arbitrés. Ce document ne vaut pas décision : toute mise en œuvre
  suppose une demande explicite (cf. `docs/EVOLUTION.md`, « ne pas modifier le comportement
  métier sans demande »).
