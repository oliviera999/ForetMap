---
name: foretmap-species-autofill
description: Implémente, corrige et valide la pré-saisie biodiversité multi-sources (Wikipedia/Wikidata/GBIF) côté API et formulaire plante. À utiliser quand la demande concerne `/api/plants/autofill`, `lib/speciesAutofill.js`, la revue UI de suggestions, la qualité des champs/provenances/photos, ou les tests associés.
---

# Pré-saisie espèces ForetMap

## Portée

- Backend: `lib/speciesAutofill.js`, `routes/plants.js`.
- Frontend: `src/components/foretmap-views.jsx` (formulaire plante).
- Tests: `tests/species-autofill.test.js`, `tests/api.test.js` (pattern autofill).
- Contrat: `docs/API.md`.

## Checklist d’implémentation

1. Valider la requête `q` (longueur, trim, erreurs 400).
2. Conserver la route en lecture seule (pas d’écriture BDD).
3. Agréger les sources externes avec timeout et fallback partiel.
4. Exposer `fields`, `field_sources`, `photos`, `sources`, `warnings`, `confidence`.
5. Filtrer les URLs photo non sûres avant retour API.
6. Côté UI, garder le flux "prévisualiser -> sélectionner -> appliquer".

## Qualité des données

- Ne jamais présenter la pré-saisie comme vérité absolue.
- En cas d’ambiguïté (homonymie), remonter un `warning` plutôt que masquer l’incertitude.
- Préférer les champs taxonomiques (`scientific_name`, `group_*`) cohérents avant un overwrite.
- Conserver et fusionner les URLs de provenance (`sources`).

## Validation minimale

```bash
node --test tests/species-autofill.test.js
node --test tests/api.test.js --test-name-pattern="autofill"
```

Validation UI manuelle:

- `Biodiversité` -> `+ Ajouter` -> `Pré-saisir depuis sources externes`.
- Vérifier score/warnings/champs/photos.
- Cliquer `Appliquer la sélection` puis contrôler les champs critiques.

## Mise à jour documentaire

- Répercuter tout changement de payload dans `docs/API.md`.
- Si le workflow de revue UI change, ajuster `docs/LOCAL_DEV.md` (section vérification ciblée).
