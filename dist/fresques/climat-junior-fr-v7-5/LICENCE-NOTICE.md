# La Fresque du Climat – version Enfant (FR, v7.5) — avis de licence

Les images du dossier `cards/` reproduisent **sans modification** les cartes de
**La Fresque du Climat – FR-FR – Enfant – v7.5** (25/04/2023).

- **Auteur** : Cédric Ringenbach
- **Diffusion** : Association La Fresque du Climat — https://fresqueduclimat.org
- **Licence** : Creative Commons **BY-NC-ND** pour une utilisation non commerciale
  (attribution obligatoire, pas d'utilisation commerciale, pas de modification).
  Licence complète : https://fresqueduclimat.org/licence/
- **Source** : https://fresqueduclimat.org/wp-content/uploads/2023/06/Kids-FR-FR-v7.5-pdf-4.pdf
  (SHA-256 `2708d49262813fc29d771df8a5140eb489e02b644b6a5b77a27616be089f04ec`)

## Ce qui a été fait aux fichiers

Uniquement des opérations techniques nécessaires au changement de support :
découpage des 24 emplacements du PDF officiel (rendu à 300 dpi), puis ré-encodage en WebP
(pleine taille et vignette de 640 px de côté maximum). Aucune retouche, aucun recadrage
du contenu, aucun texte ajouté ou retiré. Le script `outils/extraire_cartes.py` du paquet
de livraison permet de refaire l'opération à l'identique.

## Ce qui n'est PAS couvert par cette licence

`deck.json`, `correction.json` et `hints.json` sont des fichiers de données de ForetMap.
`correction.json` encode les liens de la carte « Correction » officielle pour la vérification
automatique ; `hints.json` contient des textes d'aide originaux écrits pour ForetMap, qui ne
reprennent pas le texte des cartes et ne sont jamais affichés sur une carte.

## Règles d'usage dans l'application (non négociables)

1. Les cartes sont affichées telles quelles (recto et verso), jamais redessinées, recadrées,
   retraduites, mises à jour ni annotées par-dessus.
2. Le crédit et la licence restent visibles en permanence pendant l'activité et figurent
   dans toute image exportée.
3. Aucun logo, aucune marque n'est ajouté sur une carte.
4. L'accès est gratuit, sans publicité ni contrepartie (usage non commercial).
5. Toute nouvelle édition officielle des cartes remplace ce dossier par un nouveau dossier
   versionné ; on ne modifie jamais une image existante.

_Dans le dépôt ForetMap, ce script est rangé sous `scripts/fresques/extraire_cartes.py`._
