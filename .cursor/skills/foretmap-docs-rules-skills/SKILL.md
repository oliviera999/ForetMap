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
2. Mettre à jour le contrat API et le runbook local dans `docs/` (au minimum **`docs/API.md`** pour une route publique ; runbook **`docs/LOCAL_DEV.md`** / exploitation **`docs/EXPLOITATION.md`** selon le sujet).
3. Mettre à jour les règles existantes ou en créer de ciblées (`.mdc`, frontmatter correct, **`globs`** si la rule est ciblée).
4. Ajouter/adapter les skills concernés (description précise « quoi + quand »).
5. Vérifier que les commandes de validation mentionnées existent réellement dans `package.json`.

### Exemples concrets (ForetMap)

- **Nouvelle route API** : `docs/API.md` + rule métier existante (`foretmap-biodiversite-autofill`, `foretmap-backend`, etc.) ou skill (`foretmap-species-autofill`, `foretmap-mascot-catalog`…).
- **Symptômes HTTP/2 navigateur (ex. ERR_HTTP2_PROTOCOL_ERROR)** : documenter ou pointer **`npm run prod:transport-probe`** et **`docs/EXPLOITATION.md`** ; mention éventuelle dans **`docs/LOCAL_DEV.md`** / **`README.md`**.
- **Packs mascotte / validation sans `src/` en prod** : **`docs/MASCOT_PACK.md`**, script **`npm run sync:visit-pack-lib`**, dossier **`lib/visit-pack/`**, garde-fou cron dans **`docs/EXPLOITATION.md`** ; skill **`foretmap-mascot-catalog`**.

## Critères de qualité

- Terminologie cohérente entre doc/rule/skill.
- Pas d’instruction contradictoire avec les conventions ForetMap.
- Rules courtes, actionnables, et ciblées par `globs` quand possible.
- Skills orientées workflow concret (implémenter + vérifier + documenter).

## Livrable attendu (selon le périmètre)

Adapter au **type** de changement — pas obligatoire de tout toucher pour un correctif minimal :

| Changement | Minimum typique |
|------------|-----------------|
| Nouvelle route API ou contrat modifié | `docs/API.md` + tests `tests/*.test.js` |
| Workflow dev / CI / e2e | `docs/LOCAL_DEV.md` et/ou skill **`foretmap-e2e`** / **`foretmap-tests`** |
| Nouvelle convention persistante agent | rule **`.mdc`** ciblée et, si procédure réutilisable, skill associée |
| Évolution transversale (plusieurs zones) | combinaison des lignes ci-dessus + **`docs/EVOLUTION.md`** si impact roadmap |

En cas de doute, privilégier **`docs/API.md`** pour tout endpoint exposé et la rule **`foretmap-conventions`** pour les tests obligatoires.
