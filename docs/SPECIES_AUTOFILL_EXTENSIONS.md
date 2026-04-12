# Extensions pré-saisie espèces (Trefle, OpenAI, Pl@ntNet)

Ces sources sont **désactivées par défaut** : aucune clé API n’est requise pour faire tourner ForetMap. Activez-les uniquement sur un serveur de confiance (données lycée, RGPD).

## Trefle (`lib/speciesAutofillTrefle.js`)

- **Variables** : `TREFLE_TOKEN` (jeton API [Trefle](https://trefle.io/)), **`SPECIES_AUTOFILL_TREFLE=1`** pour autoriser le module.
- **Comportement** : `GET https://trefle.io/api/v1/species/search?token=…&q=<nom scientifique>` ; mapping vers `habitat`, `planting_recommendations`, `optimal_ph`, `ideal_temperature_c`, `size`, `longevity`, `harvest_part`, `geographic_origin` (distributions natives), photo espèce si `image_url` ; confiance **0,58** dans `mergeSources`.
- **Conditions** : respecter les CGU / quotas Trefle ; ne pas exposer le jeton côté client.

## OpenAI (`lib/speciesAutofillOpenAi.js`)

- **Variables** :
  - `OPENAI_API_KEY` : clé **serveur uniquement** (fichier `.env`, jamais dans le dépôt ni le navigateur).
  - **`SPECIES_AUTOFILL_OPENAI=1`** : sans cette valeur exacte, aucun appel n’est effectué.
  - Optionnel : `SPECIES_AUTOFILL_OPENAI_MODEL` (défaut **`gpt-4o-mini`**).
- **Comportement** : requête `POST /v1/chat/completions` avec `response_format: json_object`, prompt limité au contexte (requête utilisateur, nom scientifique seed, extrait Wikipedia FR tronqué). Champs JSON autorisés incluant **`agroecosystem_category`**. Timeout court (plafond **8 s**, borné par le budget global de pré-saisie).
- **Confiance** : **0,22** dans `mergeSources` (sous les heuristiques Wikipedia et Wikidata) pour limiter l’écrasement des sources factuelles.
- **Logs** : événement court côté Pino (`species_autofill_openai_*`) ; pas de journalisation du corps complet du prompt/réponse.
- **RGPD / pédagogie** : les sorties LLM sont **indicatives** ; checklist prof : vérifier chaque champ avant publication, surtout si l’élève a saisi des données personnelles dans la requête (éviter d’activer OpenAI sur des requêtes libres non contrôlées si le risque est jugé trop élevé).

## Pl@ntNet (`lib/speciesAutofillPlantnet.js`)

- **Variables** : `PLANTNET_API_KEY` (clé [my.plantnet.org](https://my.plantnet.org/)), **`SPECIES_AUTOFILL_PLANTNET=1`**, optionnel **`PLANTNET_PROJECT`** (défaut **`k-world-flora`**).
- **Comportement** : `GET …/v2/projects/{project}/species/align?api-key=…&name=<nom scientifique>` ; si l’API renvoie un **nom commun** (`bestMatch.commonName` ou équivalent), proposition pour **`second_name`** (confiance **0,42**). En cas d’échec HTTP ou de payload inattendu, retour silencieux `null`.
- **Conditions** : respecter les quotas et la documentation officielle Pl@ntNet ; ne pas exposer la clé côté client.

## Références

- Route : `GET /api/plants/autofill` — détail des sources dans [`docs/API.md`](API.md).
- Code d’agrégation : `lib/speciesAutofill.js` (`mergeSources`).
