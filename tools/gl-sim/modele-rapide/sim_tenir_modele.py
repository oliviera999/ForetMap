#!/usr/bin/env python3
"""Modèle rapide « Tenir à deux » v2 — Monte-Carlo des règles sur les vraies cases et zones.

Python 3 sans dépendance. Lit `data/gl/tenir/chasse-zones.json` (polygones → centroïde → rang
de case le plus proche, ordre, plateau) et l'instantané de contenu `data/gl/sim/contenu-prod-*.json`
(cases des chapitres de plateau 1-4 : type, tonalité `eventMeta.tonalite`, deltaMove / passTurn
par branche, order_index). Joue des milliers de chapitres par plateau avec des hypothèses
simples et documentées, et sort les indicateurs du § 7.6 du cahier des charges.

Le modèle sert à EXPLORER (une variante de réglages en quelques secondes) ; le banc Node
(`npm run gl:sim`) sert à CONFIRMER contre le vrai moteur.

Hypothèses par défaut (ajustables en ligne de commande) :
  - justesse 65 % (45 % en classe en difficulté) pour toute question (case, chasse, lecture) ;
  - 2 dés par séance ; bonne réponse de case → +1 case et une relance (une par tour et par
    équipe) ; au-delà, +1 case sans relance ;
  - vent de la caravane dès la séance 2 : l'unique dernière équipe avance de 3 cases ;
  - une équipe au camp jette pour l'équipe la plus en retard ;
  - cases à effet : deltaMove et passTurn de la branche du peuple (ou neutre), tels quels ;
  - fouilles : 1 (gnome) / 2 (licorne) par séance, 0 sous le voile ; une fouille touche une
    zone endormie / révélée avec la probabilité --fouille (0,30) ; une zone touchée est trouvée
    avec la justesse (sinon révélée) ; un gnome répare de même une zone pâlie ; E2 : +1 fouille
    de réparation par séance pour les gnomes (utilisable seulement sur une zone pâlie) ;
  - tenue : chaque page trouvée est tenue par l'autre peuple avec la probabilité --tenue (0,80)
    par séance ; carnet complet si toutes les zones actives sont tenues ;
  - voile : 1d6 + bonus[plateau] par séance (--voile), pâlissement des zones endormies /
    révélées de rang ≤ voile ; E3 : le plancher (--plancher, 8) protège les zones de rang
    < plancher ; E4 (réserve du surplus) n'a pas d'effet sur ces indicateurs (accepté, ignoré) ;
  - le chapitre se clôt quand les quatre équipes sont au camp, ou à la 6e séance.

Indicateurs (moyennes sur les chapitres simulés ; pour une part d'équipes ou de zones, la
moyenne est l'estimateur lisible, la médiane d'un ratio sur 4 équipes n'ayant que cinq valeurs) :
séances, % d'équipes passées sous le voile, % de pages pâlies au Seuil, % de pages tenues au
Seuil, % de carnets complets, part des Gnomes dans les pages trouvées + réparées.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import random
import statistics
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, "..", "..", ".."))
ZONES_PAR_PLATEAU = {1: 8, 2: 8, 3: 10, 4: 10}
FOUILLES = {"gnome": 1, "unicorn": 2}
SEANCES_MAX = 6
VENT_CASES = 3


# ---------------------------------------------------------------------------
# Chargement du contenu
# ---------------------------------------------------------------------------


def charger_json(chemin):
    with open(chemin, "r", encoding="utf-8") as f:
        return json.load(f)


def trouver_snapshot(explicite=None):
    if explicite:
        return explicite
    motif = os.path.join(RACINE, "data", "gl", "sim", "contenu-prod-*.json")
    fichiers = sorted(glob.glob(motif))
    return fichiers[-1] if fichiers else None


def table(snapshot, nom):
    spec = snapshot["tables"].get(nom)
    if not spec:
        return []
    cols = spec["columns"]
    return [dict(zip(cols, row)) for row in spec["rows"]]


def charger_plateaux(snapshot):
    """{ plateau: { 'markers': [...], 'camp': rang du camp } } pour les plateaux 1-4."""
    chapitres = table(snapshot, "gl_chapters")
    markers = table(snapshot, "gl_chapter_markers")
    out = {}
    for p in (1, 2, 3, 4):
        ch = sorted(
            [c for c in chapitres if c.get("plateau_number") == p], key=lambda c: c["id"]
        )
        if not ch:
            continue
        cid = ch[0]["id"]
        ms = sorted(
            [m for m in markers if m["chapter_id"] == cid],
            key=lambda m: (m.get("order_index") or 0, m["id"]),
        )
        cases = []
        for m in ms:
            cfg = m.get("event_config_json")
            if isinstance(cfg, str):
                try:
                    cfg = json.loads(cfg)
                except json.JSONDecodeError:
                    cfg = None
            effects = (cfg or {}).get("effects") or {}
            tonalite = ((cfg or {}).get("eventMeta") or {}).get("tonalite")
            cases.append(
                {
                    "type": m.get("event_type"),
                    "label": m.get("label") or "",
                    "x": float(m.get("x_pct") or 0) / 100.0,
                    "y": float(m.get("y_pct") or 0) / 100.0,
                    "tonalite": tonalite,
                    "effects": effects,
                }
            )
        out[p] = {"markers": cases, "camp": len(cases) - 1}
    return out


def centroide(polygone):
    pts = [(float(x), float(y)) for x, y in polygone]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def rang_case(markers, centre):
    best, best_d = None, float("inf")
    for i, m in enumerate(markers):
        d = (m["x"] - centre[0]) ** 2 + (m["y"] - centre[1]) ** 2
        if d < best_d:
            best, best_d = i, d
    return best


def charger_catalogue_feuillets(chemin):
    """`src/gl/data/zones_feuillets.json` : polygones référencés par `polygone_ref`."""
    if not chemin or not os.path.exists(chemin):
        return {}
    data = charger_json(chemin)
    return {str(z.get("zone_id")): z for z in data.get("zones", []) if z.get("zone_id")}


def polygone_de(zone, catalogue):
    if zone.get("polygone"):
        return zone["polygone"]
    ref = catalogue.get(str(zone.get("polygone_ref") or ""))
    return ref.get("polygone") if ref else None


def charger_zones(zones_json, plateaux, catalogue):
    """{ plateau: [ { key, rang, ordre } ] } : N premières zones actives, rang calculé."""
    out = {}
    for p in (1, 2, 3, 4):
        if p not in plateaux:
            continue
        zs = [
            z
            for z in zones_json["zones"]
            if int(z.get("plateau", 0)) == p and z.get("actif", True) is not False
        ]
        zs.sort(key=lambda z: (z.get("ordre") or 0, z["zone_key"]))
        zs = zs[: ZONES_PAR_PLATEAU[p]]
        rows = []
        for z in zs:
            poly = polygone_de(z, catalogue)
            if not poly:
                continue
            rows.append(
                {
                    "key": z["zone_key"],
                    "rang": rang_case(plateaux[p]["markers"], centroide(poly)),
                    "ordre": z.get("ordre"),
                }
            )
        out[p] = rows
    return out


# ---------------------------------------------------------------------------
# Simulation d'un chapitre
# ---------------------------------------------------------------------------


def effet_case(case, peuple):
    """(deltaMove, passTurn) de la branche du peuple, de la branche neutre, ou (0, False)."""
    eff = case.get("effects") or {}
    branche = eff.get(peuple) or eff.get("neutral")
    if not branche:
        return 0, False
    return int(branche.get("deltaMove") or 0), bool(branche.get("passTurn"))


def jouer_chapitre(rng, plateau, markers, camp, zones, h):
    """Renvoie les indicateurs d'un chapitre."""
    equipes = [
        {"peuple": "gnome", "pos": 0, "passe": False},
        {"peuple": "gnome", "pos": 0, "passe": False},
        {"peuple": "unicorn", "pos": 0, "passe": False},
        {"peuple": "unicorn", "pos": 0, "passe": False},
    ]
    etat = {z["key"]: "endormie" for z in zones}
    trouvee_par = {}
    gnomes_trouvees = 0
    total_trouvees = 0
    voile = -1
    sous_voile = set()
    seances = 0
    carnet_complet = False

    def arrivee(eq, pos, relance_dispo):
        """Applique la case d'arrivée ; renvoie (pos, relance, relance_dispo)."""
        pos = max(0, min(camp, pos))
        if pos >= camp:
            return pos, False, relance_dispo
        case = markers[pos]
        if case["type"] == "quiz":
            if rng.random() < h["justesse"]:
                pos2 = min(camp, pos + 1)
                # La case bonus s'applique (sans nouvelle question).
                if pos2 < camp and markers[pos2]["type"] != "quiz":
                    dm, pt = effet_case(markers[pos2], eq["peuple"])
                    if pt:
                        eq["passe"] = True
                    pos2 = max(0, min(camp, pos2 + dm))
                if relance_dispo:
                    return pos2, True, False
                return pos2, False, relance_dispo
            return pos, False, relance_dispo
        dm, pt = effet_case(case, eq["peuple"])
        if pt:
            eq["passe"] = True
        return max(0, min(camp, pos + dm)), False, relance_dispo

    def jouer_jet(eq, cible):
        """`eq` jette ; `cible` reçoit le déplacement (elle-même ou la plus en retard)."""
        relance_dispo = True
        for _ in range(4):
            total = rng.randint(1, 6) + rng.randint(1, 6)
            pos, relance, relance_dispo = arrivee(cible, cible["pos"] + total, relance_dispo)
            cible["pos"] = pos
            if not relance or cible["pos"] >= camp:
                break
        # Sorts d'avance (Progression, Bourrasque, Relais, Cordée) : en moyenne `sorts_avance`
        # cases par équipe et par séance, sans appliquer la case d'arrivée.
        if cible["pos"] < camp and h["sorts_avance"] > 0:
            entier = int(h["sorts_avance"])
            reste = h["sorts_avance"] - entier
            bonus = entier + (1 if rng.random() < reste else 0)
            cible["pos"] = min(camp, cible["pos"] + bonus)

    for s in range(1, SEANCES_MAX + 1):
        seances = s
        # Vent de la caravane.
        if s >= 2:
            hors_camp = [e for e in equipes if e["pos"] < camp]
            if len(hors_camp) >= 2:
                hors_camp.sort(key=lambda e: e["pos"])
                if hors_camp[0]["pos"] < hors_camp[1]["pos"]:
                    hors_camp[0]["pos"] = min(camp, hors_camp[0]["pos"] + VENT_CASES)
        # Jets, dans l'ordre inverse du plateau.
        for eq in sorted(equipes, key=lambda e: e["pos"]):
            if eq["passe"]:
                eq["passe"] = False
                continue
            if eq["pos"] >= camp:
                retard = [e for e in equipes if e["pos"] < camp]
                if not retard:
                    continue
                cible = min(retard, key=lambda e: e["pos"])
                jouer_jet(eq, cible)
            else:
                jouer_jet(eq, eq)
        # Fouilles.
        for eq in equipes:
            quota = 0 if eq["pos"] <= voile else FOUILLES[eq["peuple"]]
            reparations = h["e2"] if (eq["peuple"] == "gnome" and eq["pos"] > voile) else 0
            for _ in range(quota + reparations):
                seulement_reparer = quota <= 0
                if quota > 0:
                    quota -= 1
                else:
                    reparations -= 1
                # Probabilité de toucher une zone : `fouille` jusqu'à 8 zones, proportionnellement
                # moins quand le plateau en cache davantage (10 aux plateaux 3-4 : plus de clics
                # par page, part de clics utiles plus faible). La fouille de réparation (E2) vise
                # une page pâlie dont le contour est public : chance multipliée par
                # `reparation_facteur` (1,5 par défaut).
                p_base = h["fouille"] * min(1.0, 8.0 / max(1, len(zones)))
                p_touche = min(1.0, p_base * h["reparation_facteur"]) if seulement_reparer else p_base
                if rng.random() >= p_touche:
                    continue
                candidats = [
                    k
                    for k, e in etat.items()
                    if (e in ("endormie", "revelee") and not seulement_reparer)
                    or (e == "palie" and eq["peuple"] == "gnome")
                ]
                if not candidats:
                    continue
                k = rng.choice(candidats)
                if rng.random() < h["justesse"]:
                    etat[k] = "trouvee"
                    trouvee_par[k] = eq["peuple"]
                    total_trouvees += 1
                    if eq["peuple"] == "gnome":
                        gnomes_trouvees += 1
                elif etat[k] == "endormie":
                    etat[k] = "revelee"
        # Tenue par l'autre peuple.
        for k, e in list(etat.items()):
            if e == "trouvee" and rng.random() < h["tenue"]:
                etat[k] = "tenue"
        if zones and all(etat[z["key"]] == "tenue" for z in zones) and not carnet_complet:
            carnet_complet = True
            voile = max(-1, voile - 3)
        # Souffle : dé gris.
        if h["voile_actif"]:
            voile = min(voile + rng.randint(1, 6) + h["bonus"][plateau], camp - 1)
            for i, eq in enumerate(equipes):
                if eq["pos"] <= voile:
                    sous_voile.add(i)
            # E3 : le voile ne pâlit aucune page tant que sa position n'atteint pas le plancher
            # (les premières séances ne confisquent rien) ; au-delà, toute zone de rang ≤ voile.
            if not h["e3"] or voile >= h["plancher"]:
                for z in zones:
                    if (
                        etat[z["key"]] in ("endormie", "revelee")
                        and z["rang"] is not None
                        and z["rang"] <= voile
                    ):
                        etat[z["key"]] = "palie"
        if all(e["pos"] >= camp for e in equipes):
            break

    n = max(1, len(zones))
    return {
        "seances": seances,
        "sous_voile": 100.0 * len(sous_voile) / 4,
        "palies": 100.0 * sum(1 for e in etat.values() if e == "palie") / n,
        "tenues": 100.0 * sum(1 for e in etat.values() if e == "tenue") / n,
        "carnet": 100.0 if carnet_complet else 0.0,
        "gnomes": (100.0 * gnomes_trouvees / total_trouvees) if total_trouvees else None,
        "fin_camp": all(e["pos"] >= camp for e in equipes),
    }


# ---------------------------------------------------------------------------
# Agrégation et sortie
# ---------------------------------------------------------------------------


def agreger(resultats):
    def moy(cle):
        vals = [r[cle] for r in resultats if r[cle] is not None]
        return sum(vals) / len(vals) if vals else None

    def med(cle):
        vals = [r[cle] for r in resultats if r[cle] is not None]
        return statistics.median(vals) if vals else None

    return {
        "n": len(resultats),
        "seances": moy("seances"),
        "seances_mediane": med("seances"),
        "entre_4_et_6": 100.0 * sum(1 for r in resultats if 4 <= r["seances"] <= 6) / len(resultats),
        "fin_camp": 100.0 * sum(1 for r in resultats if r["fin_camp"]) / len(resultats),
        "equipesSousVoile": moy("sous_voile"),
        "pagesPalies": moy("palies"),
        "pagesTenues": moy("tenues"),
        "carnetComplet": moy("carnet"),
        "partGnomes": moy("gnomes"),
    }


def fmt(v, d=1):
    if v is None:
        return "—"
    return f"{v:.{d}f}".replace(".", ",")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Modèle rapide « Tenir à deux » (Monte-Carlo, sans dépendance).")
    ap.add_argument("--runs", type=int, default=4000, help="chapitres simulés par plateau (4000)")
    ap.add_argument("--voile", default="4,4,5,6", help="bonus du dé gris par plateau, ex. 3,4,5,6")
    ap.add_argument("--e2", action="store_true", help="fouille de réparation offerte aux Gnomes (+1 / séance)")
    ap.add_argument("--e3", action="store_true", help="plancher du pâlissement (zones de rang < plancher protégées)")
    ap.add_argument("--e4", action="store_true", help="réserve du surplus au plafond (sans effet sur ces indicateurs)")
    ap.add_argument("--plancher", type=int, default=8, help="rang plancher de E3 (8)")
    ap.add_argument("--classe", choices=["moyenne", "difficulte", "experte"], default="moyenne")
    ap.add_argument("--justesse", type=float, default=None, help="probabilité de bonne réponse (65 / 45 / 80 % selon la classe)")
    ap.add_argument("--fouille", type=float, default=0.30, help="probabilité qu'une fouille touche une zone (0,30)")
    ap.add_argument("--tenue", type=float, default=0.80, help="probabilité qu'une page trouvée soit tenue dans la séance (0,80)")
    ap.add_argument("--sorts-avance", type=float, default=0.65, help="cases d'avance par équipe et par séance dues aux sorts (0,65)")
    ap.add_argument("--reparation-facteur", type=float, default=1.5, help="E2 : multiplicateur de la chance de toucher une page pâlie au contour public (1,5)")
    ap.add_argument("--catalogue", default=os.path.join(RACINE, "src", "gl", "data", "zones_feuillets.json"), help="catalogue des polygones référencés (polygone_ref)")
    ap.add_argument("--sans-voile", action="store_true", help="profil prologue : pas de dé gris")
    ap.add_argument("--plateaux", default="1,2,3,4")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--snapshot", default=None, help="instantané de contenu (défaut : le plus récent de data/gl/sim)")
    ap.add_argument("--zones", default=os.path.join(RACINE, "data", "gl", "tenir", "chasse-zones.json"))
    ap.add_argument("--json", action="store_true", help="sortie JSON au lieu du tableau texte")
    args = ap.parse_args(argv)

    snapshot_path = trouver_snapshot(args.snapshot)
    if not snapshot_path or not os.path.exists(snapshot_path):
        print("Aucun instantané de contenu (data/gl/sim/contenu-prod-*.json) : lancer npm run gl:sim:snapshot", file=sys.stderr)
        return 2
    snapshot = charger_json(snapshot_path)
    zones_json = charger_json(args.zones)
    plateaux = charger_plateaux(snapshot)
    voulus = [int(p) for p in args.plateaux.split(",") if p.strip()]
    zones = charger_zones(zones_json, plateaux, charger_catalogue_feuillets(args.catalogue))
    bonus_liste = [int(b) for b in args.voile.split(",")]
    bonus = {p: bonus_liste[min(p - 1, len(bonus_liste) - 1)] for p in (1, 2, 3, 4)}
    justesse = args.justesse if args.justesse is not None else {"moyenne": 0.65, "difficulte": 0.45, "experte": 0.80}[args.classe]
    h = {
        "justesse": justesse,
        "fouille": args.fouille,
        "tenue": args.tenue,
        "bonus": bonus,
        "e2": 1 if args.e2 else 0,
        "e3": bool(args.e3),
        "plancher": args.plancher,
        "voile_actif": not args.sans_voile,
        "sorts_avance": max(0.0, args.sorts_avance),
        "reparation_facteur": max(0.0, args.reparation_facteur),
    }
    rng = random.Random(args.seed)
    sortie = {
        "format": "gl-sim-modele-rapide v1",
        "snapshot": os.path.basename(snapshot_path),
        "hypotheses": {**h, "runs": args.runs, "classe": args.classe, "e4": bool(args.e4)},
        "plateaux": {},
    }
    for p in voulus:
        if p not in plateaux:
            sortie["plateaux"][str(p)] = {"erreur": "chapitre absent de l'instantané"}
            continue
        res = [
            jouer_chapitre(rng, p, plateaux[p]["markers"], plateaux[p]["camp"], zones.get(p, []), h)
            for _ in range(args.runs)
        ]
        agg = agreger(res)
        agg["cases"] = plateaux[p]["camp"] + 1
        agg["zones"] = len(zones.get(p, []))
        agg["rangs_zones"] = sorted(z["rang"] for z in zones.get(p, []) if z["rang"] is not None)
        sortie["plateaux"][str(p)] = agg

    if args.json:
        print(json.dumps(sortie, ensure_ascii=False, indent=1))
        return 0
    print(f"Modèle rapide « Tenir à deux » — {args.runs} chapitres par plateau, classe {args.classe} "
          f"(justesse {fmt(100 * justesse, 0)} %), voile {args.voile}{' + E2' if args.e2 else ''}{' + E3' if args.e3 else ''}"
          f"{' + E4' if args.e4 else ''}, fouille {fmt(100 * args.fouille, 0)} %, tenue {fmt(100 * args.tenue, 0)} %")
    print(f"Instantané : {os.path.basename(snapshot_path)}")
    entetes = ["Indicateur"] + [f"P{p}" for p in voulus]
    lignes = [
        ("Séances (moyenne)", "seances", 1),
        ("Séances (médiane)", "seances_mediane", 1),
        ("Chapitre entre 4 et 6 séances (%)", "entre_4_et_6", 0),
        ("Quatre équipes au camp avant la 6e (%)", "fin_camp", 0),
        ("Équipes sous le voile (%)", "equipesSousVoile", 0),
        ("Pages pâlies au Seuil (%)", "pagesPalies", 0),
        ("Pages tenues au Seuil (%)", "pagesTenues", 0),
        ("Carnet complet (%)", "carnetComplet", 0),
        ("Part des Gnomes (%)", "partGnomes", 0),
        ("Cases du plateau", "cases", 0),
        ("Zones actives", "zones", 0),
    ]
    largeur = max(len(l[0]) for l in lignes) + 2
    print("".join([entetes[0].ljust(largeur)] + [e.rjust(9) for e in entetes[1:]]))
    for libelle, cle, d in lignes:
        cells = []
        for p in voulus:
            agg = sortie["plateaux"].get(str(p), {})
            cells.append(fmt(agg.get(cle), d).rjust(9))
        print(libelle.ljust(largeur) + "".join(cells))
    return 0


if __name__ == "__main__":
    sys.exit(main())
