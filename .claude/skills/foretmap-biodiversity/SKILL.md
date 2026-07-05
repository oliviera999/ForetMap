---
name: foretmap-biodiversity
description: Pré-saisie biodiversité ForetMap — autofill multi-sources (GET /api/plants/autofill) et identification Pl@ntNet par image (POST /api/plants/plantnet-identify). À utiliser pour lib/speciesAutofill*.js, routes/plants.js, le formulaire plante, les tests species-autofill et docs/API.md.
---

# Pré-saisie biodiversité (autofill)

## Portée

- **Autofill texte** : `lib/speciesAutofill.js` (+ modules `speciesAutofillGbif*`,
  `speciesAutofillOpenAi.js`, etc.), route `GET /api/plants/autofill`. Sources externes
  (Wikipedia/Wikidata/GBIF…).
- **Image Pl@ntNet** : `lib/speciesAutofillPlantnet.js`, route `POST /api/plants/plantnet-identify`
  (proxy multipart). Clés serveur `PLANTNET_API_KEY` / `SPECIES_AUTOFILL_PLANTNET`.
- **Front** : `src/components/foretmap-views.jsx` / `src/components/biodiv/PlantEditForm.jsx`.

## Règles (garde-fous)

- Route autofill **strictement en lecture** : aucune écriture BDD. Auth `plants.manage`.
  Valider `q` (2..120 caractères, erreurs 400).
- Résilience : timeouts externes bornés, fusion partielle, `warnings` non bloquants ; en cas
  d'échec d'agrégation → 502 explicite + `logRouteError`.
- Photos : URLs **HTTPS valides**, filtrées avant retour, avec crédit/licence/source si possible.
- Contrat exposé : `fields`, `field_sources`, `photos`, `sources`, `warnings`, `confidence` —
  toute évolution → `docs/API.md` (+ `docs/SPECIES_AUTOFILL_EXTENSIONS.md`).
- **Pl@ntNet par image uniquement** via `plantnet-identify` ; **ne pas** réintroduire la source
  agrégée `plantnet` dans `sources` de l'autofill sans décision produit.
- UI : flux « prévisualiser → sélectionner → appliquer » ; jamais d'auto-enregistrement après
  récupération externe.

## Validation

```bash
node --test tests/species-autofill.test.js tests/species-autofill-plantnet.test.js
node --test tests/api.test.js --test-name-pattern="autofill|plantnet-identify"
```

## Voir aussi

`.cursor/rules/foretmap-biodiversite-autofill.mdc`, `.cursor/skills/foretmap-species-autofill/SKILL.md`.
