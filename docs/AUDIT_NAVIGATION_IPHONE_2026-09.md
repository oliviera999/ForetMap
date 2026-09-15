# Audit — Navigation sur produits Apple (iPhone) — 2026-09

> **Instantané** du 14 sept. 2026 · app **v1.156.4** · commit `2852c8c`  
> Portée : navigation principale des trois produits (ForetMap, GL, Plan) sous **iPhone / Safari
> WebKit**. Revue **statique** du code + e2e mobile Chromium existants — **pas** de mesure sur
> appareil physique dans cette passe.
>
> **Statut remédiation (14 sept. 2026, soir)** : lots A–E du plan nav iPhone livrés dans le
> dépôt. Score cible estimé **≥ 85** après Plus + chrome prof compact + smoke WebKit CI.
> UX-IOS-005 reste une friction documentée (permission boussole), hors correctif.

## Tableau de statut (remédiation)

| ID           | Statut | Note                                                                  |
| ------------ | ------ | --------------------------------------------------------------------- |
| BUG-IOS-001  | Traité | `-webkit-backdrop-filter` sur `.bottom-nav` / `.top-tabs`             |
| A11Y-IOS-001 | Traité | `.lock-btn` / badge user / pastille RT ≥ 44px (coarse)                |
| UX-IOS-001   | Traité | `StudentBottomNav` primaires + BottomSheet Plus                       |
| UX-IOS-002   | Traité | Plus remplace le scroll H opaque en mode compact                      |
| UX-IOS-003   | Traité | `scrollIntoView` sur `[aria-current=page]` + plus de scroll H compact |
| UX-IOS-004   | Traité | `TeacherTopTabs` compact : pôles + sheet                              |
| TEST-IOS-001 | Traité | Projet Playwright `mobile-webkit` + CI bloquante                      |
| UX-IOS-005   | Ouvert | Permission boussole iOS — friction attendue, doc référence Plan       |

## Verdict (instantané initial)

**Score iPhone : 68 / 100** — aucun bloquant, **5 majeurs**, **3 mineurs**.

Les fondations iOS (encoches, `dvh`, anti-zoom clavier, PWA, floating dock) sont en place. Le
point faible était la **découvrabilité** de la barre élève ForetMap (scroll horizontal opaque),
alors que **GL** avait déjà le pattern adapté au pouce : onglets primaires + tiroir « Plus ».

## 1. Cartographie des patterns

| Produit        | Chrome mobile                   | Fit iPhone | Commentaire                                      |
| -------------- | ------------------------------- | ---------- | ------------------------------------------------ |
| ForetMap élève | Primaires + Plus (compact)      | Bon        | Traité UX-IOS-001                                |
| ForetMap prof  | Pôles + sheet onglets (compact) | Bon        | Traité UX-IOS-004                                |
| GL joueur      | 3 primaires + bouton « Plus »   | Bon        | Référence d’origine                              |
| Plan Lyautey   | Overlay / chips carte           | OK         | `safe-area` + permission boussole iOS documentée |

## 2. Ce qui tient déjà (points forts)

1. **`viewport-fit=cover`** + metas PWA iOS (`apple-mobile-web-app-*`) dans `index.vite.html`.
2. Tokens **`--safe-top` / `--safe-bottom`** (`src/shared/styles/motion.css`) branchés sur
   `env(safe-area-inset-*)` ; header, bottom-nav, modales, toasts, dock les respectent.
3. **`100dvh`** sur `#root` / `#app` et split cartes-tâches (évite le bug classique `100vh` Safari).
4. Inputs / selects / textareas forcés à **16 px** sur tactile → pas de zoom involontaire iOS.
5. Convention **FloatingDock** (`--fm-safe-bottom-nav`) : plus de toast / cloche sous la barre
   (cf. `docs/AUDIT_ICONES_FLOTTANTES_2026-08.md`).
6. Bandeau d’installation iOS (`usePwaInstall` + `install-ios-banner`) : chemin Safari → Partager
   → Sur l’écran d’accueil.
7. Modales mobile : scroll sur l’overlay + safe-area (lots CHANGELOG déjà livrés).
8. Carte : usage de `visualViewport` + gestes ; e2e `mobile-map-nav` (Chromium 390×844).

## 3. Constats (IDs stables)

| ID           | Sévérité | Catégorie | Description                                                                                                     | Preuve technique                            | Correction testable                                                                   |
| ------------ | -------- | --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| UX-IOS-001   | Majeur   | UX        | Barre élève ForetMap trop peuplée ; pas de pattern « Plus » alors que GL l’a.                                   | `StudentBottomNav.jsx`, `GLMobileNav.jsx`   | ≤5 onglets visibles + sheet listant le reste ; scénario e2e « ouvrir Forum via Plus » |
| UX-IOS-002   | Majeur   | UX        | Aucune affordance de débordement (pas de fade, snap, hint « glisser »).                                         | `index.css` `.bottom-nav`                   | Indicateur visuel ou snap ; test snapshot / a11y                                      |
| UX-IOS-003   | Majeur   | UX / a11y | Onglet actif jamais `scrollIntoView` — peut rester hors écran après restauration d’onglet.                      | `StudentBottomNav.jsx`                      | Activer un onglet hors viewport → bouton actif visible                                |
| UX-IOS-004   | Majeur   | UX        | Chrome prof (header + 2 rangées) rogne la carte sur iPhone ; `--fm-maptasks-teacher-tabs-h` révèle le symptôme. | `TeacherTopTabs.jsx`, `index.css`           | Mode compact ≤640 px ; hauteur utile carte ≥ seuil                                    |
| TEST-IOS-001 | Majeur   | tests     | Aucun projet Playwright **WebKit** / device iPhone ; filet mobile = Chromium seulement.                         | `e2e/mobile-map-nav.spec.js`                | Projet `mobile-webkit` + smoke nav/carte                                              |
| A11Y-IOS-001 | Mineur   | a11y      | `.lock-btn` ~40×40 px (&lt; 44 pt HIG / convention projet).                                                     | `index.css` `.lock-btn`                     | `min-width/min-height: 44px` sur pointeur grossier                                    |
| BUG-IOS-001  | Mineur   | bug       | `.bottom-nav` : `backdrop-filter` sans `-webkit-backdrop-filter` (flou absent Safari ancien).                   | `index.css` ~L505                           | Préfixe WebKit ; rendu flou ou fond opaque de repli                                   |
| UX-IOS-005   | Mineur   | UX        | Permission boussole iOS au premier « Me situer » — friction attendue, déjà documentée.                          | `useMapPosition.js`, `docs/reference/plan/` | Message clair si refus ; pas de blocage du GPS                                        |

## 4. Matrice persona Sandra (iPhone)

| Parcours                    | Completion        | Friction iPhone                           |
| --------------------------- | ----------------- | ----------------------------------------- |
| Connexion → première action | Oui avec friction | Bandeau install + découverte des onglets  |
| Cycle tâches                | Oui avec friction | Onglet Tâches parfois hors écran à droite |
| Carte / visite / zoom       | Oui               | Gestes OK si barre d’outils visible       |
| Prof — valider une tâche    | Oui avec friction | Deux rangées mangent la hauteur utile     |
| Aller à Forum / À propos    | Friction forte    | Invisible sans scroll latéral volontaire  |

### Re-QA Sandra (après remédiation — revue code + tests)

| Parcours                    | Completion | Note                           |
| --------------------------- | ---------- | ------------------------------ |
| Connexion → première action | Oui        | Primaires visibles sans scroll |
| Cycle tâches                | Oui        | Tâches en primary              |
| Carte / visite / zoom       | Oui        | Inchangé                       |
| Prof — valider une tâche    | Oui        | Sheet pôle Suivi               |
| Aller à Forum / À propos    | Oui        | Via Plus                       |

## 5. Top priorités (impact × effort) — historique du plan

| Rang | Action                                                            | Impact | Effort   |
| ---- | ----------------------------------------------------------------- | ------ | -------- |
| 1    | Aligner ForetMap élève sur le pattern GL (4–5 onglets + « Plus ») | Élevé  | Moyen    |
| 2    | `scrollIntoView` onglet actif + fade / scroll-snap                | Élevé  | Rapide   |
| 3    | Projet Playwright `webkit` + device iPhone (smoke nav + carte)    | Élevé  | Moyen    |
| 4    | Chrome prof compact ≤640 px (pôles seuls, onglets en sheet)       | Moyen  | Complexe |
| 5    | Cibles header ≥ 44×44 sur tactile                                 | Moyen  | Rapide   |

## 6. Trois chantiers structurels

1. **Convergence nav mobile ForetMap ↔ GL** : une brique partagée « primary tabs + overflow sheet »
   (déjà `BottomSheet` dans `src/shared/`) — **amorcé** (même pattern, styles séparés forêt / gl).
2. **Filet iOS réel** : WebKit e2e + checklist manuelle iPhone (Safari + PWA standalone +
   encoche Dynamic Island / home indicator) — **smoke WebKit CI fait** ; checklist manuelle ci-dessous.
3. **Budget hauteur chrome** : plafond déclaré pour header + tabs sur `max-width: 640px` —
   **compact prof = 1 rangée pôles**.

## 7. Hors périmètre / checklist manuelle device

- [ ] Safari iPhone : PWA « Sur l’écran d’accueil », home indicator sous `.bottom-nav`
- [ ] Clavier logiciel sur formulaire tâche (champ au-dessus de la barre)
- [ ] Permission boussole Plan (UX-IOS-005)
- [ ] Chrome iOS vs Safari (bandeau install pointe Safari)

Note Windows local : le smoke WebKit est validé en CI Linux ; `npx playwright install webkit`
peut être fragile sous Windows.

## Voir aussi

- Canvas interactif (session) : audit-nav-iphone
- `docs/AUDIT_ICONES_FLOTTANTES_2026-08.md` — pile bas-droite / safe nav
- `docs/GL_UI_PROTO_TOPBAR.md` — proto historique nav GL (pattern « Plus »)
- `docs/QA_AUDIT_PERSONAE_PROMPT.md` — persona Sandra (iPhone)
- `e2e/mobile-map-nav.spec.js`, `e2e/mobile-webkit-smoke.spec.js`, `e2e/modals-responsive.spec.js`
