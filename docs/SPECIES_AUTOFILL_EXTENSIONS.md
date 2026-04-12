# Extensions pré-saisie espèces (Trefle, OpenAI) et identification Pl@ntNet

Ce document complète la description de **`GET /api/plants/autofill`** dans [`docs/API.md`](API.md).

Depuis la **console admin** (paramètres → Actions système), le bouton **Test connectivité (Pl@ntNet / OpenAI)** appelle **`GET /api/settings/admin/system/species-autofill-providers-test`** : requêtes HTTP minimales pour vérifier que les clés présentes dans l’environnement du serveur répondent (sans afficher ni enregistrer les secrets). Voir [`docs/API.md`](API.md) (section Paramètres admin).

**Route `GET /api/plants/autofill`** : paramètres optionnels **`hint_scientific`** et **`hint_name`** (voir [`docs/API.md`](API.md)) pour transmettre le nom courant / scientifique déjà présents dans le formulaire ; ils améliorent la graine taxonomique et le contexte LLM. Le paramètre **`sources`** (liste d’ids séparés par des virgules, même liste que l’UI prof) limite quelles sources sont **appelées** et fusionnées ; une extension n’est utilisée que si son id est inclus **et** que les variables d’environnement l’autorisent déjà. Après la fusion multi-sources, une passe **complément des champs vides** peut appeler **OpenAI** ciblé (`openai_gap`) sur les clés encore sans proposition si `openai` est dans `sources` et que le module est activé (sans écraser les champs déjà remplis).

## Trefle (`lib/speciesAutofillTrefle.js`)

Voir [`docs/API.md`](API.md) : activation **`SPECIES_AUTOFILL_TREFLE=1`** + token **`TREFLE_TOKEN`**.

## OpenAI (`lib/speciesAutofillOpenAi.js`)

- **Activation** : `SPECIES_AUTOFILL_OPENAI=1` et **`OPENAI_API_KEY`**.
- **Confiance** : **0,22** dans `mergeSources` (sous les heuristiques Wikipedia et Wikidata) pour limiter l’écrasement des sources factuelles ; passe **« trous »** (`openai_gap`) : **0,26** sur les seuls champs encore vides après fusion.

## Pl@ntNet — identification par image (`lib/speciesAutofillPlantnet.js`)

La pré-saisie textuelle agrégée **`GET /api/plants/autofill`** **n’inclut plus** la source `plantnet`. L’usage de Pl@ntNet se fait via **`POST /api/plants/plantnet-identify`** (proxy multipart vers **`POST /v2/identify/{project}`**), typiquement depuis le formulaire biodiversité : l’enseignant choisit une proposition puis lance la pré-saisie habituelle pour remplir le reste de la fiche.

- **Activation** : `PLANTNET_API_KEY` + **`SPECIES_AUTOFILL_PLANTNET=1`** (même couple qu’auparavant côté `.env`).
- **Optionnel** : **`PLANTNET_PROJECT`** (défaut côté identify : **`all`** si absent ; sinon valeur du projet Pl@ntNet), **`PLANTNET_LANG`** (défaut **`fr`**, passé en query `lang` de l’identify).
- **Conditions** : respecter les quotas, la mention des auteurs et la doc « [Using images](https://my.plantnet.org/doc/references/using-images) » ; ne pas exposer la clé côté client.
