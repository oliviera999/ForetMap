# Extensions pré-saisie espèces (Trefle, OpenAI, Pl@ntNet)

Ces sources sont **désactivées par défaut** : aucune clé API n’est requise pour faire tourner ForetMap. Activez-les uniquement sur un serveur de confiance (données lycée, RGPD).

Depuis la **console admin** (paramètres → Actions système), le bouton **Test pré-saisie (Pl@ntNet / OpenAI)** appelle **`GET /api/settings/admin/system/species-autofill-providers-test`** : requêtes HTTP minimales pour vérifier que les clés présentes dans l’environnement du serveur répondent (sans afficher ni enregistrer les secrets). Voir [`docs/API.md`](API.md) (section Paramètres admin).

**Route `GET /api/plants/autofill`** : paramètres optionnels **`hint_scientific`** et **`hint_name`** (voir [`docs/API.md`](API.md)) pour transmettre le nom courant / scientifique déjà présents dans le formulaire ; ils améliorent la graine taxonomique et le contexte LLM. Le paramètre **`sources`** (liste d’ids séparés par des virgules, même liste que l’UI prof) limite quelles sources sont **appelées** et fusionnées ; une extension n’est utilisée que si son id est inclus **et** que les variables d’environnement l’autorisent déjà. Après la fusion multi-sources, une passe **complément des champs vides** réutilise le pack **Pl@ntNet** déjà chargé (si `plantnet` est dans `sources`) puis, si `openai` est dans `sources` et que le module est activé, un second appel **OpenAI** ciblé (`openai_gap`) sur les clés encore sans proposition (sans écraser les champs déjà remplis).

## Trefle (`lib/speciesAutofillTrefle.js`)

- **Variables** : `TREFLE_TOKEN` (jeton API [Trefle](https://trefle.io/)), **`SPECIES_AUTOFILL_TREFLE=1`** pour autoriser le module.
- **Comportement** : `GET https://trefle.io/api/v1/species/search?token=…&q=<nom scientifique>` ; mapping vers `habitat`, `planting_recommendations`, `optimal_ph`, `ideal_temperature_c`, `size`, `longevity`, `harvest_part`, `geographic_origin` (distributions natives), photo espèce si `image_url` ; confiance **0,58** dans `mergeSources`.
- **Conditions** : respecter les CGU / quotas Trefle ; ne pas exposer le jeton côté client.

## OpenAI (`lib/speciesAutofillOpenAi.js`)

- **Variables** :
  - `OPENAI_API_KEY` : clé **serveur uniquement** (fichier `.env`, jamais dans le dépôt ni le navigateur).
  - **`SPECIES_AUTOFILL_OPENAI=1`** : sans cette valeur exacte, aucun appel n’est effectué.
  - Optionnel : `SPECIES_AUTOFILL_OPENAI_MODEL` (défaut **`gpt-4o-mini`**).
- **Comportement** : requête `POST /v1/chat/completions` avec `response_format: json_object`. Le **contexte** agrège avant l’appel (sans secrets) : extrait **Wikipedia FR**, libellé/description **Wikidata**, taxonomie **GBIF**, **traits / descriptions GBIF** (`gbif_traits`), extraits **iNaturalist** / **Wikipedia EN** si présents, liste **noms vernaculaires GBIF (FR)** — le tout tronqué (~**3000** caractères côté agrégateur, puis ~**3200** côté module OpenAI). Champs JSON autorisés incluant **`agroecosystem_category`** et **`second_name`** (nom vernaculaire unique **uniquement** s’il figure explicitement dans le contexte). Timeout court (plafond **8 s**, borné par le budget global de pré-saisie).
- **Confiance** : **0,22** dans `mergeSources` (sous les heuristiques Wikipedia et Wikidata) pour limiter l’écrasement des sources factuelles ; passe **« trous »** (`openai_gap`) : **0,26** sur les seuls champs encore vides après fusion (et overlay Pl@ntNet).
- **Logs** : événement court côté Pino (`species_autofill_openai_*`, `species_autofill_openai_gap_*`) ; pas de journalisation du corps complet du prompt/réponse.
- **RGPD / pédagogie** : les sorties LLM sont **indicatives** ; checklist prof : vérifier chaque champ avant publication, surtout si l’élève a saisi des données personnelles dans la requête (éviter d’activer OpenAI sur des requêtes libres non contrôlées si le risque est jugé trop élevé).

## Pl@ntNet (`lib/speciesAutofillPlantnet.js`)

- **Variables** :
  - `PLANTNET_API_KEY` (clé [my.plantnet.org](https://my.plantnet.org/)) ;
  - **`SPECIES_AUTOFILL_PLANTNET=1`** ;
  - optionnel **`PLANTNET_PROJECT`** (défaut **`k-world-flora`**) ;
  - optionnel **`PLANTNET_LANG`** (défaut **`fr`**, passé à `align` et à la liste `species` pour les noms vernaculaires) ;
  - optionnel **`PLANTNET_ALIGN_AUTHORSHIP`** : `1` / `0` pour forcer le paramètre `authorship` de l’alignement (sinon heuristique sur le nom) ;
  - optionnel **`SPECIES_AUTOFILL_PLANTNET_NO_IMAGES=1`** : n’appelle pas `GET …/species?images=true` (économise un appel ; les illustrations peuvent nécessiter un plan **pro** selon la doc Pl@ntNet).
- **Comportement** :
  1. `GET …/v2/projects/{project}/species/align` avec **`synonyms=true`**, **`lang`**, **`authorship`** : nom accepté, **famille** → **`group_3`**, **genre** → **`group_4`**, **`scientific_name`** si le nom accepté diffère du libellé aligné ; prise en charge des payloads **`bestMatch`** hérités.
  2. `GET …/species?prefix=<binôme>&images=true&pageSize=8&page=1` : si la réponse contient une ligne dont **`scientificNameWithoutAuthor`** correspond exactement au binôme dérivé du nom accepté, **nom vernaculaire** (priorisation légère FR si `lang` français), **`ecosystem_role`** à partir de **`iucnCategory`**, et **photos** par organe (`flower` → `photo_flower`, `leaf` → `photo_leaf`, `fruit`/`seed` → `photo_fruit`, sinon `photo_species`) avec crédit / licence Pl@ntNet. Si plusieurs lignes sont renvoyées sans correspondance exacte, **aucune** photo ni vernaculaire n’est importé (évite les homonymes).
- **Confiance** : champs **0,42–0,46** selon présence de photos ; vignettes **0,58** chacune dans `mergeSources`.
- **Conditions** : respecter les quotas, la mention des auteurs et la doc « [Using images](https://my.plantnet.org/doc/references/using-images) » ; ne pas exposer la clé côté client.

## Références

- Route : `GET /api/plants/autofill` — détail des sources dans [`docs/API.md`](API.md).
- Code d’agrégation : `lib/speciesAutofill.js` (`mergeSources`).
