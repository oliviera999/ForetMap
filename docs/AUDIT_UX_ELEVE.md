# Audit UX eleve ForetMap

Date: 2026-03-26

## 1) Objectif et perimetre

Objectif: auditer l'experience eleve de bout en bout (connexion, navigation, taches, stats, carnet, visite) et prioriser les ameliorations UX a impact rapide, sans changer le metier.

Perimetre analyse:

- Shell et navigation: [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx), [src/index.css](c:/projets_code/ForetMap/src/index.css)
- Auth eleve: [src/components/auth-views.jsx](c:/projets_code/ForetMap/src/components/auth-views.jsx), [src/services/api.js](c:/projets_code/ForetMap/src/services/api.js)
- Taches et rapports: [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js)
- Stats et profil: [src/components/stats-views.jsx](c:/projets_code/ForetMap/src/components/stats-views.jsx), [routes/stats.js](c:/projets_code/ForetMap/routes/stats.js), [routes/students.js](c:/projets_code/ForetMap/routes/students.js)
- Carnet: [src/components/foretmap-views.jsx](c:/projets_code/ForetMap/src/components/foretmap-views.jsx), [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js)

## 2) Cartographie des parcours eleve critiques

### P1 - Connexion / inscription / reprise de session

1. Ecran auth (connexion, creation compte, Google, mot de passe oublie, visite invite).
2. En cas de succes, session locale stockee.
3. Au chargement suivant, reprise depuis `localStorage` puis validation serveur via `POST /api/students/register`.
4. Si compte supprime (401 `deleted: true`), deconnexion forcee et toast.
5. Si echec hors suppression, erreur seulement loggee dans la console.

### P2 - Premiere experience apres connexion

1. `fetchAll` lance plusieurs appels paralleles (`maps`, `zones`, `tasks`, `task-projects`, `plants`, `markers`, `tutorials`).
2. Pendant ce chargement, ecran plein "Chargement de la foret...".
3. En cas d'erreurs serveur successives, bandeau "Serveur indisponible" + intervalle de refresh ralenti.

### P3 - Navigation eleve mobile/desktop

1. Header: badge utilisateur (ouvre stats), bouton profil, controles de session.
2. Bottom nav: carte, taches, biodiversite, tuto, carnet, visite, a propos selon modules.
3. Desktop large: mode split carte+taches.
4. Restriction metier N3: redirection auto vers `plants` quand map/tasks non disponibles.

### P4 - Flux tache eleve

1. Prise de tache (`assign`) et abandon (`unassign`) avec controle de permissions.
2. Fin de tache (`done`) avec commentaire/photo optionnels.
3. Visualisation des rapports (`/api/tasks/:id/logs` + image).
4. Erreurs permission (`Permission insuffisante`, `PIN profil incorrect`) remontees en message brut.

### P5 - Stats / profil / carnet

1. Stats perso via `GET /api/stats/me/:studentId`.
2. Edition profil via `PATCH /api/students/:id/profile`.
3. Carnet observations: chargement, ajout, suppression.
4. En cas d'echec chargement carnet, pas de feedback utilisateur (console uniquement).

## 3) Evaluation heuristique (constats)

Heuristiques appliquees: visibilite de l'etat systeme, gestion d'erreurs, prevention, charge cognitive mobile, accessibilite.

| ID | Heuristique | Gravite | Constat | Preuve |
|---|---|---|---|---|
| UX-01 | Visibilite et progression | Elevee | Chargement initial bloquant plein ecran, sans conservation du shell ni skeleton local. | [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx), [src/index.css](c:/projets_code/ForetMap/src/index.css) |
| UX-02 | Recuperation d'erreur | Elevee | Echec de validation session eleve (hors compte supprime) non visible pour l'utilisateur. | [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx) |
| UX-03 | Accessibilite feedback | Elevee | Toast sans `role=status`/`aria-live`, texte tronque par `nowrap` + `ellipsis` sur petits ecrans. | [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [src/index.css](c:/projets_code/ForetMap/src/index.css) |
| UX-04 | Accessibilite controles | Moyenne | Plusieurs boutons fermeture/modales et actions icones sans `aria-label`. | [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx) |
| UX-05 | Prevention d'erreurs auth | Moyenne | `autoComplete` non optimal pour connexion (`off` + `new-password`), friction sur mobile et gestionnaire de mots de passe. | [src/components/auth-views.jsx](c:/projets_code/ForetMap/src/components/auth-views.jsx) |
| UX-06 | Coherence erreurs compte supprime | Elevee | `AccountDeletedError` bien gere globalement, mais certains flux modaux affichent juste l'erreur sans deconnexion immediate. | [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx), [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [src/services/api.js](c:/projets_code/ForetMap/src/services/api.js) |
| UX-07 | Clarte des restrictions | Moyenne | Restriction N3 appliquee via redirection, sans explication pedagogique explicite dans l'UI. | [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx) |
| UX-08 | Charge cognitive navigation | Moyenne | Bottom nav chargee (nombre d'entrees), labels longs et petite taille en contexte mobile. | [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx), [src/index.css](c:/projets_code/ForetMap/src/index.css) |
| UX-09 | Robustesse carnet | Moyenne | Echec de chargement carnet observations silencieux pour l'eleve (console uniquement). | [src/components/foretmap-views.jsx](c:/projets_code/ForetMap/src/components/foretmap-views.jsx) |
| UX-10 | Confidentialite percue | Elevee | Consultation des logs tache sans garde auth dediee peut poser un risque de confiance/clarte pour les eleves. | [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js) |

## 4) Priorisation (impact x effort)

### Priorite P0 (a traiter en premier)

1. UX-02: feedback utilisateur sur echec de validation de session (toast + action de reprise).
2. UX-03: rendre les toasts accessibles et non tronques.
3. UX-06: harmoniser la gestion `AccountDeletedError` dans tous les formulaires eleve.
4. UX-10: decision produit/securite sur acces aux logs de tache.

### Priorite P1 (fort impact, effort modere)

1. UX-01: remplacer le loader plein ecran par rendu progressif (shell conserve + skeleton contenu).
2. UX-07: afficher un message explicite sur limitation N3.
3. UX-09: afficher un etat d'erreur recuperable dans le carnet (bouton "Reessayer").

### Priorite P2 (qualite continue)

1. UX-04: ajouter `aria-label` systematiques aux boutons icones et fermetures.
2. UX-05: corriger `autoComplete` sur auth (`username/email`, `current-password`).
3. UX-08: simplifier la nav mobile (ordre, regroupements, labels plus courts si besoin).

## 5) Backlog quick wins recommande

| Item | Action | Effort | Impact |
|---|---|---|---|
| QW-01 | Toast global sur echec de `POST /api/students/register` (hors deleted) + bouton "Reessayer". | Faible | Eleve |
| QW-02 | Composant Toast unique avec `role="status"` et `aria-live="polite"` + retour a la ligne. | Faible | Eleve |
| QW-03 | Ajouter `aria-label` aux boutons `lock-btn`, `modal-close`, lightbox close. | Faible | Moyen |
| QW-04 | Auth: ajuster `autoComplete` connexion/reset. | Faible | Moyen |
| QW-05 | Message contextualise pour limitation N3 (bandeau ou empty state dedie). | Faible | Moyen |
| QW-06 | Carnet: afficher erreur visible + bouton retry dans `ObservationNotebook`. | Faible | Moyen |
| QW-07 | Capturer `AccountDeletedError` dans `LogModal` et autres modales pour deconnexion coherente. | Faible | Eleve |

## 6) Plan de validation

### 6.1 Validation manuelle UX (checklist)

- Login eleve reussi, reprise session apres refresh, et message clair en cas d'echec serveur.
- Navigation mobile: lisibilite labels nav, accessibilite boutons icones, fermeture modales clavier/tactile.
- Flux tache: assign -> done (avec/sans photo) -> affichage rapport -> erreurs permission explicites.
- Stats/profil/carnet: erreurs visibles, actions de recuperation disponibles.
- Cas compte supprime: toute action critique renvoie a l'auth avec message coherent.

### 6.2 Validation automatisee ciblee (API et E2E)

- Etendre API tests:
  - Verifier 401 `deleted: true` sur endpoints eleve cles (`students/register`, `tasks assign/done/unassign`, `observations`).
  - Verifier permissions taches (`Permission insuffisante`, `PIN profil incorrect`) avec profils differents.
  - Verifier comportement `done` avec/sans commentaire/image.
- E2E recommande:
  - Parcours eleve complet login -> tache -> rapport -> stats.
  - Scenario erreur reseau simulée et scenario compte supprime.
  - Verifications d'accessibilite de base (roles ARIA feedback/modales).

Points de depart de tests:

- [tests/api.test.js](c:/projets_code/ForetMap/tests/api.test.js)
- [tests/students-delete.test.js](c:/projets_code/ForetMap/tests/students-delete.test.js)

## 7) Conclusion

Le parcours eleve est globalement fonctionnel et riche, mais les gains UX les plus urgents concernent la gestion des erreurs visibles, la coherence des deconnexions "compte supprime", et l'accessibilite des feedbacks/modales. Les quick wins proposes sont majoritairement a faible effort et peuvent etre livres de facon incrementale, avec un impact perceptible immediat pour les eleves.
