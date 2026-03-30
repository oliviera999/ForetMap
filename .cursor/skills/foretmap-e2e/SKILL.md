---
name: foretmap-e2e
description: Centralise les conventions Playwright ForetMap (scénarios UI élève/prof, stabilité locale et CI). À utiliser quand on écrit, modifie ou exécute des tests e2e.
---

# Tests e2e ForetMap (Playwright)

## Quand utiliser ce skill

- Création, correction ou extension de scénarios dans `e2e/`.
- Stabilisation des tests UI en CI (timeouts, attentes, ordre des actions).
- Vérification des parcours élève/prof après une évolution frontend ou API.

## Quand ne pas l'utiliser

- Tests backend API/unitaires (`node:test` + supertest) : préférer **foretmap-tests**.
- Évolution d'architecture globale : préférer **foretmap-evolution**.

## Commandes

```bash
npm run test:e2e
npm run test:e2e:headed
```

## Fichiers clés

| Fichier/Dossier | Rôle |
|-----------------|------|
| `e2e/` | Scénarios Playwright (auth, tâches, photos, temps réel, cas PIN invalide) |
| `e2e/fixtures/` | Helpers et données partagées pour les specs |
| `playwright.config.js` | Configuration d'exécution (projets, retries, timeouts, base URL) |
| `package.json` | Scripts `test:e2e` et `test:e2e:headed` |

## Conventions de rédaction

- Écrire des scénarios orientés comportement utilisateur (actions + résultat visible).
- Préférer des sélecteurs robustes et stables (rôle/texte contrôlé) pour limiter la fragilité.
- Garder les tests indépendants : chaque spec prépare ses prérequis.
- Couvrir en priorité les flux critiques avant les cas rares.
- En cas de flaky test, corriger la synchronisation (attentes explicites) avant d'augmenter brutalement les timeouts.

## Priorités (alignées EVOLUTION)

1. Maintenir la non-régression sur les parcours critiques.
2. Étendre progressivement vers les cas limites (erreurs API, interruptions, concurrence).
3. Garder l'exécution CI stable et diagnosable (artefacts, logs utiles).

## Voir aussi

- Feuille de route : [docs/EVOLUTION.md](docs/EVOLUTION.md) (backlog § 2.1, séquence §§ 3-4)
- Skill backend tests : `.cursor/skills/foretmap-tests/SKILL.md`
- Règle frontend : `.cursor/rules/foretmap-frontend.mdc`
