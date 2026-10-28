#!/usr/bin/env python3
# ---------------------------------------------------------------------------------------
# ForetMap — scripts/fresques/extraire_cartes.py
#
# Outil d'extraction reproductible des cartes de La Fresque du Climat (version Enfant,
# FR, v7.5) depuis le PDF officiel, avec contrôle SHA-256 de la source. Le résultat vit
# dans `public/fresques/climat-junior-fr-v7-5/cards/` et son intégrité est figée par
# `tests/content/fresque-climat-junior.test.js` (empreinte de chaque image).
#
# LICENCE : les cartes sont sous Creative Commons BY-NC-ND (usage non commercial,
# attribution, AUCUNE modification). Lire `public/fresques/climat-junior-fr-v7-5/LICENCE-NOTICE.md`
# et https://fresqueduclimat.org/licence/ avant toute utilisation. Ce script ne fait que
# découper et ré-encoder : il ne retouche, ne recadre ni n'annote aucune carte. Une
# nouvelle édition officielle va dans un NOUVEAU dossier versionné, jamais à la place
# des images existantes.
# ---------------------------------------------------------------------------------------
"""Extraction reproductible des cartes de La Fresque du Climat – Enfant – FR – v7.5.

Usage :
    python3 extraire_cartes.py Kids-FR-FR-v7.5-pdf-4.pdf dossier_sortie/

Prérequis : poppler-utils (pdftoppm) et Pillow.

Le PDF officiel compte 12 pages A4 paysage, 4 cartes par page (grille 2 x 2).
Pages impaires = rectos, pages paires = versos, impression recto-verso bord court :
le verso de l'emplacement (ligne r, colonne c) de la page p est l'emplacement
(ligne 1 - r, colonne c) de la page p + 1.

Seules des opérations techniques sont faites : rendu à 300 dpi, découpage des
emplacements, ré-encodage WebP. Aucune retouche du contenu (licence CC BY-NC-ND).
"""
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

SHA256_ATTENDU = "2708d49262813fc29d771df8a5140eb489e02b644b6a5b77a27616be089f04ec"

# Emplacements mesurés à 300 dpi (gouttières blanches détectées sur toutes les pages).
COLONNES = [(7, 1726), (1783, 3503)]
LIGNES = [(43, 1211), (1269, 2437)]

# Recto de chaque carte : (page, ligne, colonne).
RECTOS = {
    "titre": (1, 0, 0), "c04": (1, 0, 1), "c07": (1, 1, 0), "c13": (1, 1, 1),
    "c18": (3, 0, 0), "c21": (3, 0, 1), "c03": (3, 1, 0), "c16": (3, 1, 1),
    "c17": (5, 0, 0), "c20": (5, 0, 1), "c26": (5, 1, 0), "c36": (5, 1, 1),
    "c02": (7, 0, 0), "c08": (7, 0, 1), "c22": (7, 1, 0), "c25": (7, 1, 1),
    "c30": (9, 0, 0), "c32": (9, 0, 1), "c33": (9, 1, 0), "c34": (9, 1, 1),
    "c37": (11, 0, 0), "c39": (11, 0, 1), "licence": (11, 1, 0),
}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pdf, sortie = Path(sys.argv[1]), Path(sys.argv[2])
    empreinte = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if empreinte != SHA256_ATTENDU:
        sys.exit(f"PDF inattendu (SHA-256 {empreinte}) : vérifier l'édition avant d'extraire.")
    sortie.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", "300", "-png", str(pdf), f"{tmp}/p"], check=True)
        pages = {}

        def emplacement(page, ligne, colonne):
            if page not in pages:
                pages[page] = Image.open(f"{tmp}/p-{page:02d}.png").convert("RGB")
            (x0, x1), (y0, y1) = COLONNES[colonne], LIGNES[ligne]
            return pages[page].crop((x0, y0, x1, y1))

        for nom, (page, ligne, colonne) in RECTOS.items():
            for face, pos in (("recto", (page, ligne, colonne)), ("verso", (page + 1, 1 - ligne, colonne))):
                image = emplacement(*pos)
                image.save(sortie / f"{nom}-{face}.webp", "WEBP", quality=88, method=6)
                vignette = image.copy()
                vignette.thumbnail((640, 640))
                vignette.save(sortie / f"{nom}-{face}.sm.webp", "WEBP", quality=85, method=6)
    print(f"{len(RECTOS) * 4} fichiers écrits dans {sortie}")


if __name__ == "__main__":
    main()
