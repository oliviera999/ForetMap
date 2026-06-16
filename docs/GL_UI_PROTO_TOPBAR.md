# GL — Brief prototype navigation mobile (Claude Design)

Document d’entrée pour une session [Claude Design](https://claude.ai/design) : explorer 3–4 variantes de navigation mobile pour Gnomes & Licornes.

## Contexte produit

- **App** : Gnomes & Licornes (GL), bundle React séparé (`gl.html` → `src/gl/`).
- **Personas** : joueur 6e (13+ onglets), MJ/admin (+6 onglets staff).
- **Problème** : la topbar affiche tous les onglets en `flex-wrap` ; sur mobile (~375px), défilement horizontal illisible.

## Design system à respecter

| Token                   | Valeur par défaut           |
| ----------------------- | --------------------------- |
| `--gl-color-topbar`     | `#013a40`                   |
| `--gl-color-background` | `#f4fff5`                   |
| `--gl-color-primary`    | `#013a40`                   |
| `--gl-color-text`       | `#262626`                   |
| `--gl-font-body`        | Caudex                      |
| `--gl-font-heading`     | Cinzel                      |
| Touch minimum           | 44px                        |
| Locale                  | fr-FR, accents obligatoires |

Fichiers source : `src/gl/styles/gl-theme.css`, `src/gl/hooks/useGLBrandTheme.js`, `src/gl/components/ui/`.

## Onglets joueur (référence)

| id       | label            | icône |
| -------- | ---------------- | ----- |
| maps     | Cartes           | 🗺️    |
| biotope  | Biotope          | 🌿    |
| glossary | Glossaire        | 📚    |
| rules    | Règles du jeu    | 📖    |
| …        | 9 autres onglets | …     |

Onglets **primaires mobile** (implémentés) : `maps`, `biotope`, `glossary`, `rules`.

## Variantes à prototyper

### Variante A — Bottom bar + drawer « Plus »

- Barre fixe en bas (4 onglets primaires + bouton « Plus »).
- Drawer latéral ou bottom sheet listant tous les onglets secondaires.
- Topbar réduite : logo + profil / déconnexion uniquement.

### Variante B — Scroll horizontal snap

- Rangée unique d’onglets icône+label avec `scroll-snap`.
- Indicateur visuel de débordement (gradient droite).
- Pas de bottom bar.

### Variante C — Segmented control + menu hamburger

- 3 segments visibles (Carte | Apprendre | Social).
- Hamburger ouvre liste complète groupée par thème.

### Variante D — FAB contextuel

- Navigation minimale (Carte + menu).
- FAB flottant pour actions contextuelles (sorts, journal, forum selon module actif).

## Critères de validation

- [ ] Lisible à 375×667 et 390×844
- [ ] Navigation clavier : Tab, Entrée, Échap (fermer drawer)
- [ ] `aria-selected` sur l’onglet actif
- [ ] Contraste WCAG AA sur topbar `#013a40`
- [ ] Compatible charte chapitre (couleurs dynamiques)

## Handoff vers Cursor

Exporter le HTML + notes d’intention. **Ne pas merger le HTML brut** : retranscrire en `GLTopBar.jsx`, classes `gl-*`, tokens existants.

## Capture web

Capturer `gl.olution.info` (connecté joueur) en viewport mobile pour ancrer le prototype sur l’existant.
