# Packs mascotte livrés avec le dépôt

| Fichier                  | Ce que c'est                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `olu-planches-pack.json` | Le pack OLU en clair : 21 états, 88 trames sous `public/assets/mascots/olu-planches/frames/`. |
| `mascot-pack-olu.zip`    | **Le même, prêt à importer** — format `foretmap-mascot-pack-archive`, PNG embarqués.          |
| `gnome1-pack.json`       | Le pack Gnome 1 en clair (trames sous `public/assets/mascots/gnome1/frames/`).                |

## Importer l'archive OLU

Studio prof → onglet **Packs mascotte** → **Importer ZIP** → sélectionner `mascot-pack-olu.zip`,
puis **publier** le pack. Seuls les packs publiés apparaissent en visite.

Le pack porte l'identifiant catalogue `olu-spritesheet`, celui de la mascotte livrée : il la
**remplace** dans le sélecteur au lieu de s'ajouter à côté. OLU cesse alors d'être une silhouette.

## Refabriquer l'archive

```bash
npm run mascot:olu-pack -- --out docs/packs/mascot-pack-olu.zip
```

L'archive est un **produit** des trames versionnées : elle est committée pour être téléchargeable
sans outillage — un prof ou un admin doit pouvoir la récupérer d'un clic — mais elle se régénère à
l'identique par la commande ci-dessus. Les planches sources, elles, ne sont pas versionnées.

## Redécouper depuis les planches

```bash
npm run mascot:olu-cut -- --in <dossier-planches> --out public/assets/mascots/olu-planches/frames
npm run mascot:pack:validate -- docs/packs/olu-planches-pack.json
```

Détail de la chaîne : [`../MASCOT_OLU_PLANCHES_SPRITES.md`](../MASCOT_OLU_PLANCHES_SPRITES.md) §5.
