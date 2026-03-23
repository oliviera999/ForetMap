# Rapport de validité scientifique — table `plants`

Date: 2026-03-23  
Source analysée: `GET https://foretmap.olution.info/api/plants` (66 entrées)

## Méthode

Audit en 3 niveaux:

1. **Cohérence interne** (formats et plages):
   - `scientific_name` non vide et format taxonomique plausible.
   - `ideal_temperature_c` parseable et plausible.
   - `optimal_ph` parseable et dans `[0, 14]`.
2. **Validation externe** des noms scientifiques via API GBIF (`/v1/species/match`).
3. **Synthèse métier** des anomalies à corriger en priorité.

## Résultat global

- Entrées analysées: **66**
- Anomalies scientifiques significatives: **11 entrées**
- Problèmes critiques (erreurs de données manifestes): **5 entrées**

## Anomalies critiques (à corriger en priorité)

### A) Températures invalides (valeurs Excel sérialisées)

Les valeurs ci-dessous sont des numéros de date Excel, pas des températures:

- `Ail` (`id=63`) -> `ideal_temperature_c = 46378`
- `Épinard` (`id=16`) -> `ideal_temperature_c = 46315`
- `Navet` (`id=61`) -> `ideal_temperature_c = 46376`
- `Oseille` (`id=55`) -> `ideal_temperature_c = 46378`
- `Petit pois` (`id=45`) -> `ideal_temperature_c = 46376`

Impact: ces fiches affichent une information scientifiquement fausse.

## Anomalies importantes

### B) Noms scientifiques manquants

- `Cactus` (`id=17`) -> `scientific_name` vide
- `Menthe` (`id=5`) -> `scientific_name` vide

### C) Noms scientifiques à fiabilité faible / ambigus

- `Planorbe` (`id=24`) -> `Planorbia sp.`  
  - Non reconnu par GBIF en l’état.
  - Très probable confusion avec **Planorbidae** (famille) ou un autre genre.
- `Chara` (`id=34`) -> `Chara sp.`  
  - Forme acceptable dans l’absolu, mais trop générique (genre non déterminé).
- `Vers de terre` (`id=26`) -> `Eisenia sp.`  
  - Forme acceptable, mais taxon non déterminé au niveau espèce.
- `Pléco albinos` (`id=39`) -> `Plécostomus plecostomus`  
  - Nom reconnu comme forme synonyme/ancienne (orthographe avec accent non standard en taxonomie).
  - Préférer une forme canonique sans accent.

## Validation GBIF (synthèse)

Sur 64 noms scientifiques non vides:

- 47 en correspondance **EXACT + ACCEPTED**
- 17 en correspondance non idéale:
  - `HIGHERRANK` (nom au niveau genre, ex. `... sp.`): plusieurs cas attendus
  - `SYNONYM`: quelques cas à normaliser
  - `NONE`: 3 cas (`Planorbia sp.`, `Chara sp.`, `Eisenia sp.`), dont 2 liés à l’ambiguïté du suffixe `sp.` et 1 vraisemblablement erroné (`Planorbia sp.`)

## Recommandations de correction

1. **Corriger immédiatement** les 5 températures invalides (`46315/46376/46378`) avec des plages réalistes.
2. **Compléter** les `scientific_name` manquants (`Cactus`, `Menthe`).
3. **Normaliser** les noms non stables:
   - remplacer `Planorbia sp.` par un taxon valide.
   - harmoniser `Plécostomus plecostomus` vers une forme taxonomique canonique.
4. Mettre en place un **contrôle de validité à l’import**:
   - rejet des valeurs `ideal_temperature_c` non parseables,
   - avertissement sur `scientific_name` non résolu (GBIF/Wikidata).

## Conclusion

La table `plants` est globalement exploitable, mais contient des erreurs scientifiques nettes concentrées sur:

- des températures invalides issues d’un import,
- quelques noms scientifiques manquants ou à normaliser.

Une passe de correction ciblée sur ~11 entrées permettrait d’atteindre un niveau de fiabilité scientifique nettement meilleur.

