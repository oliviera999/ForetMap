---
name: foretmap-external-inspiration
description: S'inspirer d'excellentes pratiques de dépôts GitHub connus / bibliothèques éprouvées (patterns Express/React, auth JWT/RBAC, sécurité, accessibilité, dataviz, migrations SQL…) en citant la source et en respectant les licences. À utiliser quand on reprend une approche/un pattern/un extrait externe, qu'on regarde comment un projet reconnu résout un problème, ou qu'on ajoute une dépendance npm.
---

# ForetMap — S'inspirer de bonnes pratiques externes (avec citation)

Tu es **libre de t'inspirer d'excellentes pratiques** décrites dans des dépôts GitHub connus et
accessibles ou des bibliothèques éprouvées — c'est encouragé pour la qualité, la robustesse et
l'ergonomie. La contrepartie est **toujours** de créditer et de rester propre.

> Règle de référence (toujours active) : `.cursor/rules/foretmap-external-inspiration.mdc`, résumée
> dans `CLAUDE.md` (section Conventions).

## Quand utiliser ce skill

- Tu reprends une **approche, un pattern ou un extrait** d'un projet externe (ex. middleware Express,
  auth JWT/RBAC, hook React, composant accessible, requête/migration SQL, dataviz…).
- Tu regardes **comment un projet reconnu** résout un problème avant d'écrire ta version.
- Tu envisages d'**ajouter une dépendance npm** plutôt que réimplémenter.

## Quand ne pas l'utiliser

- Écrire du code « maison » sans emprunt externe : rien à citer.

## Procédure (obligatoire)

1. **Identifier la source** : nom du projet / de la bibliothèque, URL, et version/commit si pertinent.
2. **Vérifier la licence** : ne jamais copier-coller du code sous licence incompatible. Adapter /
   réécrire, mentionner licence + origine. **En cas de doute, demander avant d'intégrer.**
3. **Adapter, ne pas plaquer** : rester cohérent avec les conventions ForetMap — SQL paramétré via
   `database.js`, logger Pino, réponses JSON `{ error }`, `requireTeacher`, thème forêt, cibles
   tactiles ≥ 44px, isolement GL — plutôt que dupliquer un pattern externe tel quel.
4. **Ne pas dégrader la sécurité/les données** : bcrypt, requêtes préparées, pas de PII versionnée,
   pas de secret en dur. Une pratique externe ne dispense jamais de ces règles.
5. **Citer** :
   - dans le **message de commit / la description de PR** (et l'entrée `CHANGELOG.md` si structurant) ;
   - **en commentaire** juste au-dessus du passage concerné si l'emprunt est localisé, avec la licence
     si du code a été repris.

## Exemple de citation en code

```js
// Inspiré de <projet> (<url>, vX.Y, licence MIT) : structure du middleware de rate limiting.
// Adapté aux conventions ForetMap (logger Pino, réponses JSON).
```

## Rappels

- ✅ Préférer une **dépendance npm** propre (ajoutée au `package.json`) à un copier-coller quand la lib
  existe et est maintenue.
- ✅ Toute route/règle empruntée reste soumise aux exigences du dépôt : tests (`tests/*.test.js`),
  doc API (`docs/API.md`), versionnage (skill `foretmap-versioning`).
