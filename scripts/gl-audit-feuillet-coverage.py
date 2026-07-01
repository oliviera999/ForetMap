#!/usr/bin/env python3
"""Audit de couverture des feuillets par canal d'acquisition (Gnomes & Licornes).

Lit le corpus XLSX (`data/gl/corpus-feuillets-selene.xlsx`) et le calque de zones
(`src/gl/data/zones_feuillets.json`), puis rapporte :
  - la distribution par `type` et `mode_apparition` ;
  - la couverture par canal actuel (zone de traversée + pool via `biome_slug`/`plateau`) ;
  - les feuillets **orphelins** (rattachés à aucun canal) et leur type.

Sans dépendance externe (bibliothèque standard uniquement — XLSX = ZIP de XML).
Sert d'aide à la décision pour le câblage des canaux restants et l'enrichissement du corpus.

ATTENTION : le corpus XLSX peut être **en retard** sur la base de production (colonnes `lien_*`
absentes du fichier, feuillets ajoutés en base). La **BDD fait autorité** : voir §11.6 de
`docs/AUDIT_FEUILLETS_ACCES.md` pour les chiffres de production (201 feuillets, ~40 orphelins).

Usage : python3 scripts/gl-audit-feuillet-coverage.py [chemin_corpus.xlsx]
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parent.parent
CORPUS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/gl/corpus-feuillets-selene.xlsx"
ZONES = ROOT / "src/gl/data/zones_feuillets.json"


def _col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _cell_value(c):
    t = c.get("t")
    v = c.find("m:v", NS)
    if t == "inlineStr":
        is_ = c.find("m:is", NS)
        return "".join(x.text or "" for x in is_.findall(".//m:t", NS)) if is_ is not None else ""
    return v.text if v is not None else ""


def _sheet_target(z, name_prefix):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    r_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    sheets = [(s.get("name"), s.get("{%s}id" % r_ns)) for s in wb.findall(".//m:sheets/m:sheet", NS)]
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    for name, rid in sheets:
        if name.strip().lower().startswith(name_prefix):
            target = relmap[rid]
            return "xl/" + target if not target.startswith("/") else target[1:]
    raise SystemExit(f"Feuille '{name_prefix}*' introuvable")


def load_feuillets():
    z = zipfile.ZipFile(CORPUS)
    sh = ET.fromstring(z.read(_sheet_target(z, "feuillet")))
    rows = sh.findall(".//m:sheetData/m:row", NS)
    header = [_cell_value(c) for c in rows[0].findall("m:c", NS)]
    out = []
    for r in rows[1:]:
        d = {}
        for c in r.findall("m:c", NS):
            idx = _col_index(c.get("r"))
            if idx < len(header):
                d[header[idx]] = _cell_value(c)
        if str(d.get("code", "")).strip():
            out.append(d)
    return out


def has(d, key):
    return bool(str(d.get(key, "") or "").strip())


def channel(d, zone_codes):
    if d["code"] in zone_codes:
        return "zone"
    if has(d, "biome_slug"):
        return "biome(pool)"
    if has(d, "plateau"):
        return "plateau(pool)"
    return None


def main():
    data = load_feuillets()
    zones = json.loads(ZONES.read_text(encoding="utf-8"))
    zone_codes = {z["feuillet_code"] for z in zones["zones"]}
    n = len(data)
    print(f"Corpus : {n} feuillets ({CORPUS.name})\n")

    print("Par type :")
    for k, v in Counter(d.get("type", "?") for d in data).most_common():
        print(f"  {v:3}  {k}")

    print("\nPar mode_apparition :")
    for k, v in Counter(d.get("mode_apparition", "?") for d in data).most_common():
        print(f"  {v:3}  {k}")

    cov = Counter(channel(d, zone_codes) or "ORPHELIN" for d in data)
    print("\nCouverture par canal (zone + pool biome/plateau) :")
    for k in ["zone", "biome(pool)", "plateau(pool)", "ORPHELIN"]:
        if cov.get(k):
            print(f"  {cov[k]:3}  {k}")

    orphans = [d for d in data if channel(d, zone_codes) is None]
    print(f"\nOrphelins (aucun canal) : {len(orphans)} / {n}")
    print("  par type :", dict(Counter(d.get("type") for d in orphans)))

    missing_zone = sorted(zone_codes - {d["code"] for d in data})
    if missing_zone:
        print(f"\n⚠ Codes de zone absents du corpus : {missing_zone}")


if __name__ == "__main__":
    main()
