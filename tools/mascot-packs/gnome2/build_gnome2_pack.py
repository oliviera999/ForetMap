#!/usr/bin/env python3
"""Construit le pack mascotte « visite » importable « gnome2 » (renderer sprite_cut).

Entrée  : source/gnome-sprite-sheet.png (planche « GNOME SPRITE STANDARD », fond transparent).
Sorties : assets/cell-rN-cM.png (cellules uniformes), pack.json, manifest.json, gnome2.zip.

Le découpage des sprites a été obtenu par composantes connexes sur le canal alpha de la
planche ; les bounding boxes sont figées ci-dessous (BBOXES) pour un rebuild déterministe
ne nécessitant que Pillow. Voir README.md pour le détail du mapping état -> cellules.

Usage : python3 build_gnome2_pack.py
"""
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "source" / "gnome-sprite-sheet.png"
ASSETS_DIR = HERE / "assets"
ALL_SPRITES_DIR = HERE / "all-sprites"  # decoupe brute de TOUS les sprites (tracabilite)
ZIP_PATH = HERE / "gnome2.zip"
PREVIEW_PATH = HERE / "preview-mapping.png"

# Taille logique d'une cellule (px). Le moteur (VisitMapMascotSpriteCut) affiche chaque
# image dans une boite frameWidth x frameHeight avec object-fit:contain et
# transform-origin:center bottom -> on aligne les sprites en bas-centre, taille 1:1.
FRAME_W = 150
FRAME_H = 180
BOTTOM_MARGIN = 6  # marge sous les pieds

PACK_ID = "gnome2"
PACK_LABEL = "Gnome 2"
MAP_ID = "foret"
FALLBACK_SILHOUETTE = "gnome"

# --- Bounding boxes (x0,y0,x1,y1) inclusives, repère planche source -------------------
# r0 : tete/buste (r0c0) + regle (r0c1, accessoire)
# r1 : idle face (c0), dos (c1), cycle de marche VERS LA DROITE (c2..c7)
# r2 : cycle de marche VERS LA GAUCHE (c0..c7) + regle (c4) + gnome a la loupe (c8 = inspect)
# r3 : poses d'emotion face (c0..c3, c6), boussole (c4), sauts de joie (c5, c8), course (c7)
BBOXES = {
    "r0c0": (655, 92, 725, 176),
    "r0c1": (1231, 89, 1297, 158),
    "r1c0": (86, 169, 165, 292),
    "r1c1": (237, 169, 315, 292),
    "r1c2": (394, 170, 467, 292),
    "r1c3": (547, 170, 621, 291),
    "r1c4": (799, 169, 873, 291),
    "r1c5": (946, 168, 1032, 292),
    "r1c6": (1110, 169, 1178, 291),
    "r1c7": (1257, 169, 1340, 291),
    "r2c0": (83, 380, 170, 501),
    "r2c1": (240, 379, 313, 501),
    "r2c2": (363, 380, 473, 502),
    "r2c3": (539, 380, 628, 501),
    "r2c4": (672, 422, 752, 503),
    "r2c5": (794, 380, 864, 501),
    "r2c6": (947, 380, 1056, 500),
    "r2c7": (1101, 380, 1188, 501),
    "r2c8": (1223, 333, 1326, 501),
    "r3c0": (83, 587, 164, 724),
    "r3c1": (234, 586, 329, 724),
    "r3c2": (388, 587, 486, 724),
    "r3c3": (541, 586, 635, 724),
    "r3c4": (677, 615, 738, 692),
    "r3c5": (791, 588, 885, 718),
    "r3c6": (948, 587, 1027, 709),
    "r3c7": (1100, 586, 1190, 710),
    "r3c8": (1243, 608, 1339, 718),
}

# Sprites centres verticalement (accessoires "flottants") plutot que poses au sol.
CENTERED = {"r0c1", "r2c4", "r3c4"}

# --- Mapping etat visite canonique -> (cellules, fps) ---------------------------------
# Etats canoniques : voir VISIT_MASCOT_STATE (src/utils/visitMascotState.js).
STATE_MAP = {
    "idle": (["r1c0"], 2),  # debout de face, calme
    "walking": (["r1c2", "r1c3", "r1c4", "r1c5", "r1c6", "r1c7"], 8),  # cycle marche droite
    "running": (["r1c2", "r1c4", "r1c6"], 14),  # course (memes frames, plus rapide)
    "talk": (["r3c0", "r3c1"], 5),  # gestes de face (parle)
    "inspect": (["r2c8"], 2),  # gnome a la loupe
    "map_read": (["r3c4"], 1),  # boussole (orientation / lecture de carte)
    "surprise": (["r3c2"], 3),  # main levee « ! »
    "alert": (["r3c2"], 5),  # idem, plus rapide
    "angry": (["r3c2"], 7),  # idem, plus rapide encore (pas de pose colere dediee)
    "spin": (["r1c0", "r1c2", "r1c1", "r2c0"], 10),  # face -> droite -> dos -> gauche (tour 360)
    "happy": (["r3c3", "r3c6"], 6),  # content (de face)
    "happy_jump": (["r3c5", "r3c8"], 11),  # saut de joie
    "celebrate": (["r3c5", "r3c8"], 9),  # celebration (saut, rythme different)
}


def cell_filename(key: str) -> str:
    """r1c0 -> cell-r1-c0.png"""
    row, col = key.split("c")
    return f"cell-{row}-c{col}.png"


def make_uniform_cell(sheet: Image.Image, key: str) -> Image.Image:
    x0, y0, x1, y1 = BBOXES[key]
    crop = sheet.crop((x0, y0, x1 + 1, y1 + 1))
    cw, ch = crop.size
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    x = (FRAME_W - cw) // 2
    if key in CENTERED:
        y = (FRAME_H - ch) // 2
    else:
        y = FRAME_H - BOTTOM_MARGIN - ch  # pieds proches du bas
    canvas.alpha_composite(crop, (max(0, x), max(0, y)))
    return canvas


def _load_font(size: int):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default()


def make_preview() -> None:
    """Planche d'apercu : une ligne par etat (libelle + fps + frames)."""
    font = _load_font(20)
    cw, ch = int(FRAME_W * 0.95), int(FRAME_H * 0.95)
    label_w, pad = 210, 8
    maxframes = max(len(c) for c, _ in STATE_MAP.values())
    rowh = ch + pad
    order = list(STATE_MAP.keys())
    mw = label_w + maxframes * (cw + pad) + pad
    mh = len(order) * rowh + pad
    canvas = Image.new("RGBA", (mw, mh), (38, 42, 50, 255))
    d = ImageDraw.Draw(canvas)
    for ri, state in enumerate(order):
        cells, fps = STATE_MAP[state]
        y = pad + ri * rowh
        d.rectangle([0, y, mw, y + ch], fill=(48, 52, 62, 255) if ri % 2 else (44, 48, 58, 255))
        d.text((10, y + ch // 2 - 22), state, fill=(255, 225, 90, 255), font=font)
        d.text((10, y + ch // 2 + 2), f"{len(cells)} fr - {fps} fps", fill=(170, 180, 190, 255), font=font)
        for ci, key in enumerate(cells):
            im = Image.open(ASSETS_DIR / cell_filename(key)).convert("RGBA").resize((cw, ch))
            x = label_w + ci * (cw + pad)
            d.rectangle([x, y, x + cw, y + ch], outline=(90, 95, 105, 255))
            canvas.alpha_composite(im, (x, y))
    canvas.convert("RGB").save(PREVIEW_PATH)


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    ALL_SPRITES_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Decoupe de TOUS les sprites (taille native) -> all-sprites/ (tracabilite)
    for key, (x0, y0, x1, y1) in BBOXES.items():
        sheet.crop((x0, y0, x1 + 1, y1 + 1)).save(ALL_SPRITES_DIR / f"{key}.png")

    # 2) Cellules uniformes pour les sprites references par un etat
    used = []
    for cells, _fps in STATE_MAP.values():
        for c in cells:
            if c not in used:
                used.append(c)
    for key in used:
        make_uniform_cell(sheet, key).save(ASSETS_DIR / cell_filename(key))

    # 3) pack.json portable (framesBase ./assets/, l'import serveur reecrit les chemins)
    state_frames = {}
    for state, (cells, fps) in STATE_MAP.items():
        state_frames[state] = {"files": [cell_filename(c) for c in cells], "fps": fps}
    pack = {
        "mascotPackVersion": 2,
        "id": PACK_ID,
        "label": PACK_LABEL,
        "renderer": "sprite_cut",
        "framesBase": "./assets/",
        "frameWidth": FRAME_W,
        "frameHeight": FRAME_H,
        "pixelated": True,
        "displayScale": 1,
        "fallbackSilhouette": FALLBACK_SILHOUETTE,
        "stateFrames": state_frames,
    }
    (HERE / "pack.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", "utf8")

    # 4) manifest.json (format archive « foretmap-mascot-pack-archive » v1, variante visit)
    manifest = {
        "format": "foretmap-mascot-pack-archive",
        "formatVersion": 1,
        "variant": "visit",
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "source": {
            "pack_id": PACK_ID,
            "map_id": MAP_ID,
            "catalog_id": f"src-{PACK_ID}",
            "label": PACK_LABEL,
            "is_published": True,
        },
        "warnings": [],
    }
    (HERE / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", "utf8"
    )

    # 5) gnome2.zip (manifest.json + pack.json + assets/cell-*.png)
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        z.writestr("pack.json", json.dumps(pack, indent=2, ensure_ascii=False))
        for key in used:
            fn = cell_filename(key)
            z.write(ASSETS_DIR / fn, f"assets/{fn}")

    # 6) Apercu visuel du mapping
    make_preview()

    print(f"OK : {len(used)} cellules, etats={len(STATE_MAP)} -> {ZIP_PATH.name}")
    print("Cellules utilisees :", ", ".join(used))


if __name__ == "__main__":
    main()
