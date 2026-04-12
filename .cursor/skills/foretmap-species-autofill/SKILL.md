---
name: foretmap-species-autofill
description: Pré-saisie biodiversité multi-sources (GET /api/plants/autofill) et identification Pl@ntNet par image (POST /api/plants/plantnet-identify). À utiliser pour lib/speciesAutofill*.js, routes/plants.js, formulaire plante (foretmap-views.jsx), extensions (.env), tests et docs API.
---

# Pré-saisie espèces ForetMap

## Portée

- **Autofill (texte)** : `lib/speciesAutofill.js` et modules associés (`speciesAutofillGbif*`, `speciesAutofillOpenAi.js`, etc.), `routes/plants.js` (`GET /api/plants/autofill`).
- **Identification image (Pl@ntNet)** : `lib/speciesAutofillPlantnet.js` (proxy vers l’API v2 identify), `routes/plants.js` (`POST /api/plants/plantnet-identify`). **Aucune écriture BDD** ; clés **`PLANTNET_API_KEY`** / **`SPECIES_AUTOFILL_PLANTNET`** côté serveur uniquement.
- **Frontend** : `src/components/foretmap-views.jsx` (pré-saisie, sources `sources=`, UI Pl@ntNet).
- **Contrats** : `docs/API.md`, extensions et variables : `docs/SPECIES_AUTOFILL_EXTENSIONS.md`, `.env.example`.
- **Tests** : `tests/species-autofill.test.js`, `tests/species-autofill-plantnet.test.js`, `tests/species-autofill-common-species.test.js`, `tests/species-autofill-extensions.test.js`, `tests/species-autofill-gap.test.js`, `tests/species-autofill-provider-selftest.test.js`, `tests/api.test.js` (autofill + plantnet-identify auth / validation).

## Règle produit importante

- La source agrégée **`plantnet`** **n’est plus** dans la liste blanche des **`sources`** de **`GET /api/plants/autofill`**. Pl@ntNet pour les images passe **uniquement** par **`POST /api/plants/plantnet-identify`** puis, si besoin, autofill classique pour compléter la fiche.

## Checklist d’implémentation (autofill)

1. Valider la requête `q` (longueur, trim, erreurs 400).
2. Conserver la route en lecture seule (pas d’écriture BDD).
3. Agréger les sources externes avec timeout et fallback partiel.
4. Exposer `fields`, `field_sources`, `photos`, `sources`, `warnings`, `confidence`.
5. Filtrer les URLs photo non sûres avant retour API.
6. Côté UI, garder le flux « prévisualiser → sélectionner → appliquer ».

## Qualité des données

- Ne jamais présenter la pré-saisie comme vérité absolue.
- En cas d’ambiguïté (homonymie), remonter un `warning` plutôt que masquer l’incertitude.
- Préférer les champs taxonomiques (`scientific_name`, `group_*`) cohérents avant un overwrite.
- Conserver et fusionner les URLs de provenance (`sources`).

## Validation minimale

```bash
node --test tests/species-autofill.test.js
node --test tests/species-autofill-plantnet.test.js
node --test tests/api.test.js --test-name-pattern="autofill|plantnet-identify"
```

Suite de non-régression espèces courantes (HTTP mocké) :

```bash
node --test tests/species-autofill-common-species.test.js
```

Validation UI manuelle :

- `Biodiversité` → `+ Ajouter` → `Pré-saisir depuis sources externes` (sources cochées, warnings, photos).
- Section identification Pl@ntNet : 1–5 images, organes, propositions puis pré-saisie habituelle si besoin.

## Mise à jour documentaire

- Répercuter tout changement de payload dans `docs/API.md` et, si besoin, `docs/SPECIES_AUTOFILL_EXTENSIONS.md`.
- Si le workflow de revue UI change, ajuster `docs/LOCAL_DEV.md` (section vérification ciblée).
