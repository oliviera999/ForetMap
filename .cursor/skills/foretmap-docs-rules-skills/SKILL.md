---
name: foretmap-docs-rules-skills
description: Maintient la cohérence entre documentation projet, règles Cursor et skills ForetMap. À utiliser quand on modifie conventions, workflows de test, endpoints API, ou qu’on doit ajouter/mettre à jour des skills et rules.
---

# Maintenance docs/rules/skills

## Objectif

Éviter la dérive entre:

- documentation utilisateur/dev (`docs/`),
- règles persistantes agent (`.cursor/rules/*.mdc`),
- compétences agent (`.cursor/skills/**/SKILL.md`).

## Méthode rapide

1. Identifier les zones code modifiées (`routes`, `lib`, `src/components`, `tests`).
2. Mettre à jour le contrat API et le runbook local dans `docs/`.
3. Mettre à jour les règles existantes ou en créer de ciblées (`.mdc`, frontmatter correct).
4. Ajouter/adapter les skills concernés (description précise "quoi + quand").
5. Vérifier que les commandes de validation mentionnées existent réellement dans `package.json`.

## Critères de qualité

- Terminologie cohérente entre doc/rule/skill.
- Pas d’instruction contradictoire avec les conventions ForetMap.
- Rules courtes, actionnables, et ciblées par `globs` quand possible.
- Skills orientées workflow concret (implémenter + vérifier + documenter).

## Livrable attendu

- Au moins une mise à jour `docs/` liée au changement réel.
- Au moins une mise à jour `rules` (ou nouvelle rule dédiée).
- Au moins une skill nouvelle ou enrichie, directement réutilisable sur les prochains tickets.
