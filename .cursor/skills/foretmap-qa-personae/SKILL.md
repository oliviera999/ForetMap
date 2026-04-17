---
name: foretmap-qa-personae
description: Routine d'audit QA UX basee sur personae pour ForetMap. A utiliser pour valider un lot UI/API critique, preparer une recette, ou rejouer des parcours apres correctif.
---

# Audit QA UX par personae (ForetMap)

## Quand utiliser ce skill

- Avant merge d'un lot qui touche les parcours eleve/prof, formulaires, auth, carte/visite.
- Apres un correctif pour verifier la non-regression sur les parcours critiques.
- Pour une campagne qualite hebdomadaire (UX + accessibilite + robustesse).

## Quand ne pas l'utiliser

- Modification purement interne sans impact parcours utilisateur (ex: refactor non-fonctionnel isole).
- Changement backend strictement technique sans flux UI expose.

## Source de prompt

- Prompt de reference: `docs/QA_AUDIT_PERSONAE_PROMPT.md`
- Template de rapport: `docs/reports/qa-ux-template.md`
- Index de routine: `docs/reports/README.md`

## Preconditions d'execution

1. Environnement local operationnel selon `docs/LOCAL_DEV.md`.
2. Si frontend touche et serveur en mode production locale:
   - `npm run build`
3. Tests de base:
   - `npm test`
   - `npm run test:e2e`

## Flux d'audit recommande

1. **Cadrage**
   - Lister les parcours modifies par le lot.
   - Mapper les zones de code impactees (`src/components`, `routes`, `middleware`, `lib`, `e2e`, `tests`).
2. **Execution personae**
   - Rejouer chaque parcours critique avec les 4 personae.
   - Inclure etats vides, erreurs API, timeouts, doubles soumissions.
3. **Verification code**
   - Croiser chaque constat UX/bug avec le code source.
   - Pointer les references techniques (fichier, et ligne si applicable).
4. **Restitution**
   - Produire la matrice parcours x persona.
   - Lister les problemes avec severite/categorie/suggestion.
   - Donner top 10 priorites + effort.
   - Donner score global sur 100 + verdict.

## Format de sortie standard

Utiliser ce schema minimal:

- Partie 1: matrice resultats
- Partie 2: liste exhaustive des problemes (IDs stables)
- Partie 3: top 10 priorites (impact x effort)
- Partie 4: score global + points forts + 3 chantiers

## Criteres de sortie (Definition of Done)

- Aucun bloquant non documente sur parcours critique.
- Chaque probleme est associe a une action corrective testable.
- Les references techniques sont traceables dans le code.
- Le rapport est archivable (date, perimetre, version/commit).

## Routine continue conseillee

- **Par lot critique**: execution complete de l'audit.
- **Hebdomadaire**: rejouer un sous-ensemble stable de parcours critiques.
- **Apres correctif majeur**: re-audit cible des parcours concernes.

## Voir aussi

- Tests backend/API: `.cursor/skills/foretmap-tests/SKILL.md`
- Tests UI Playwright: `.cursor/skills/foretmap-e2e/SKILL.md`
- Regles transverses: `.cursor/rules/foretmap-conventions.mdc`
