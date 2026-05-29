# Données Gnomes & Licornes

## Catalogue espèces / biomes

Fichier de référence : `especes-biomes-gnomes-et-licornes.xlsx` (feuilles `especes`, `biomes_stats`, `groupes_stats`).

Import en base :

```bash
npm run gl:import:species          # simulation (dry-run)
npm run gl:import:species -- --apply
npm run gl:import:species -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Espèces** (upload XLSX, dry-run puis appliquer).

Après import, lier un chapitre à un biome via **Contenus → Chapitres → Biome (catalogue espèces)**.
