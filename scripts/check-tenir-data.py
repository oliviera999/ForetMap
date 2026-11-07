#!/usr/bin/env python3
"""Contrôle des fichiers de données « Tenir à deux » (data/gl/tenir/).

Usage : python3 -I scripts/check-tenir-data.py data/gl/tenir [--catalogue src/gl/data/zones_feuillets.json] [--no-db]

Stdlib seulement. Vérifie les clés, l'unicité, les références croisées, les chaînes interdites,
les longueurs ; si le client `mysql` et la base `fm` sont joignables, vérifie en base les codes de
feuillets (plateau, biome, statut, offert_*) et de questions (actif, niveau 6ème, biome, catégorie),
sinon émet un avertissement. Code de sortie 1 s'il y a au moins une erreur.
"""
import json
import os
import re
import shutil
import subprocess
import sys

FORBIDDEN = ["corbeau", "krâ", "kraa", "faux", "raté", "perdu", "monstre", "ennemi"]
BIOMES = {
    1: {"jungle_afc", "savane"},
    2: {"sahara", "foret_mediterraneenne"},
    3: {"foret_caducifoliee", "landes"},
    4: {"taiga", "toundra"},
}
CATEGORIES = {"biome", "ecosystemes", "faune", "flore", "geologie", "perturbations"}
ZONES_PAR_PLATEAU = {1: 8, 2: 8, 3: 10, 4: 10}
FEUILLETS_INTERDITS = {"ep-I-02", "ep-I-13", "ep-III-06", "ep-I-16", "ep-I-17", "ep-III-01", "ep-I-03", "ep-I-04"}
MOMENTS = {"ouverture", "jet", "question", "fouille", "tenir", "voile", "sort", "seuil", "peripetie", "bestiaire", "oiseau", "erreur"}
EXPRESSIONS = {"neutre", "joie", "curieux", "surpris", "agace", "pensif", "explique", "peur"}
BIOMES_TITRES = {"tropiques", "aride", "tempere", "grands_froids"}
PEUPLES = {"any", "gnome", "unicorn", "pacte", "classe"}
RESSOURCES = {"gemmes", "coeurs", "peuple", "choix", "pacte", "cartes"}
FENETRES = {"avant_jet", "apres_jet", "jeu", "jeu_avant_fouille", "avant_jets_pacte", "activite", "seuil", "seuil_veillee", "fin_seance", "trimestre_3"}
LIMITE_PAR = {"tour", "seance", "chapitre", "trimestre", "annee"}
LIMITE_PORTEE = {"equipe", "partie", "eleve"}
SPELL_NAMES_ATTENDUS = {
    "Progression", "Relance", "Farce", "Héritage", "Lanterne", "Boussole", "Bourrasque", "Grand Regard",
    "Nommer", "Sentier", "Abri", "Relais", "Cordée", "Question", "Conseil", "Tablette", "Musique", "Pause",
    "Rôle", "Esquive", "Mentorat", "Lettre", "Choix", "Consécration", "Lumière",
}
REGLAGES_ATTENDUS = {
    "enabled", "surface", "des_mode", "des_count", "des_physiques_validation", "questions_de_case", "vent",
    "vent_cases", "fouilles_par_tour", "fouille_seuils", "zones_par_plateau", "pistes_par_semaine",
    "pages_veillee_par_semaine", "voile", "voile_bonus_par_plateau", "palissement_pct", "palissement_max",
    "recul_carnet_complet", "marche", "marche_pendant_tour", "parures", "lumiere", "lumiere_palier",
    "cartes_vers_cases", "chapardeur", "peripeties", "olu_erreur_du_jour", "sablier_secondes",
    "max_power_points", "max_health_points", "lore_feuillet_retrigger", "lore_gemme_costs_enabled",
    "lore_heart_rewards_enabled", "feuillet_zone_traversal_enabled",
}
BADGES_ATTENDUS = {
    "premiere_page", "lecteur", "fouilleur", "trouveur", "mains_tendues", "veilleur", "nommeur", "cartographe",
    "tisserand", "revelateur", "chuchoteur", "correcteur_du_renard", "passeur_de_seuil",
}


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load(d, name, rep):
    path = os.path.join(d, name)
    if not os.path.isfile(path):
        rep.err(f"{name}: fichier absent")
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        rep.err(f"{name}: JSON invalide ({exc})")
        return None
    if not isinstance(data, dict) or not isinstance(data.get("format"), str):
        rep.err(f"{name}: clé `format` manquante")
    return data


def require_keys(rep, name, obj, keys, ident):
    missing = [k for k in keys if k not in obj]
    extra = [k for k in obj if k not in keys]
    if missing:
        rep.err(f"{name} {ident}: clés manquantes {missing}")
    if extra:
        rep.err(f"{name} {ident}: clés inattendues {extra}")


def check_forbidden(rep, name, ident, text, forbidden=FORBIDDEN):
    low = (text or "").lower()
    for bad in forbidden:
        if re.search(r"(?<![a-zà-ÿ])" + re.escape(bad), low):
            rep.err(f"{name} {ident}: contient « {bad} »")


def walk_strings(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")


def mysql_rows(sql):
    out = subprocess.run(["mysql", "fm", "-B", "-N", "-e", sql], capture_output=True, text=True, timeout=30)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    return [line.split("\t") for line in out.stdout.splitlines()]


def db_available():
    if not shutil.which("mysql"):
        return False
    try:
        mysql_rows("SELECT 1")
        return True
    except Exception:
        return False


def sql_list(codes):
    return ",".join("'" + c.replace("'", "''") + "'" for c in sorted(set(codes)))


# --------------------------------------------------------------------------- zones


def check_zones(d, rep, use_db, catalogue):
    name = "chasse-zones.json"
    data = load(d, name, rep)
    if not data:
        return {}
    zones = data.get("zones")
    if not isinstance(zones, list):
        rep.err(f"{name}: `zones` doit être une liste")
        return {}
    keys = ["zone_key", "plateau", "feuillet_code", "titre_prive", "indice", "polygone", "polygone_ref",
            "rang_case", "question_code", "theme_secours", "ordre", "actif", "especes"]
    by_key = {}
    seen_q = {}
    seen_f = {}
    per_plateau = {}
    for z in zones:
        if not isinstance(z, dict):
            rep.err(f"{name}: zone non objet")
            continue
        zk = str(z.get("zone_key", "?"))
        require_keys(rep, name, z, keys, zk)
        if zk in by_key:
            rep.err(f"{name} {zk}: zone_key en double")
        by_key[zk] = z
        pl = z.get("plateau")
        if pl not in ZONES_PAR_PLATEAU:
            rep.err(f"{name} {zk}: plateau {pl!r} invalide")
            continue
        if not re.fullmatch(rf"cz-p{pl}-\d\d", zk):
            rep.err(f"{name} {zk}: zone_key hors motif cz-p{pl}-nn")
        per_plateau.setdefault(pl, []).append(z)
        fc = z.get("feuillet_code")
        if not isinstance(fc, str) or not fc:
            rep.err(f"{name} {zk}: feuillet_code manquant")
        else:
            if fc in FEUILLETS_INTERDITS or fc.startswith("ep-VI-") or fc.startswith("page-"):
                rep.err(f"{name} {zk}: feuillet {fc} interdit en zone de chasse")
            if fc in seen_f:
                rep.err(f"{name} {zk}: feuillet {fc} déjà utilisé par {seen_f[fc]}")
            seen_f[fc] = zk
        indice = z.get("indice")
        if not isinstance(indice, str) or not indice.strip():
            rep.err(f"{name} {zk}: indice vide")
        else:
            if len(indice) > 120:
                rep.err(f"{name} {zk}: indice de {len(indice)} caractères (> 120)")
            check_forbidden(rep, name, f"{zk} indice", indice)
        if not isinstance(z.get("titre_prive"), str) or not z["titre_prive"]:
            rep.err(f"{name} {zk}: titre_prive vide")
        poly = z.get("polygone")
        pref = z.get("polygone_ref")
        if poly is not None:
            if not isinstance(poly, list) or len(poly) < 3:
                rep.err(f"{name} {zk}: polygone de moins de 3 points")
            else:
                for pt in poly:
                    if (not isinstance(pt, list) or len(pt) != 2
                            or not all(isinstance(c, (int, float)) and 0 <= c <= 1 for c in pt)):
                        rep.err(f"{name} {zk}: point de polygone invalide {pt!r}")
                        break
        if pref is not None and not isinstance(pref, str):
            rep.err(f"{name} {zk}: polygone_ref doit être une chaîne ou null")
        if poly is not None and pref is not None:
            rep.err(f"{name} {zk}: polygone et polygone_ref à la fois")
        if poly is None and pref is None:
            rep.warn(f"{name} {zk}: ni polygone ni polygone_ref — à dessiner dans l'éditeur avant activation")
        especes = z.get("especes")
        if especes is not None:
            if (not isinstance(especes, list) or not 1 <= len(especes) <= 3
                    or not all(isinstance(c, str) and re.fullmatch(r"SP\d{4}", c) for c in especes)):
                rep.err(f"{name} {zk}: especes attend 1 à 3 codes SPnnnn")
            elif len(set(especes)) != len(especes):
                rep.err(f"{name} {zk}: especes en double")
        if pref and catalogue is not None:
            cat = catalogue.get(pref)
            if cat is None:
                rep.err(f"{name} {zk}: polygone_ref {pref} absent du catalogue")
            else:
                if cat.get("feuillet_code") != fc:
                    rep.err(f"{name} {zk}: polygone_ref {pref} porte le feuillet {cat.get('feuillet_code')} et non {fc}")
                if cat.get("plateau") != pl:
                    rep.err(f"{name} {zk}: polygone_ref {pref} est au plateau {cat.get('plateau')}")
        rc = z.get("rang_case")
        if rc is not None and (not isinstance(rc, int) or rc < 0):
            rep.err(f"{name} {zk}: rang_case invalide")
        qc = z.get("question_code")
        if not isinstance(qc, str) or not qc:
            rep.err(f"{name} {zk}: question_code manquant")
        else:
            if qc in seen_q:
                rep.err(f"{name} {zk}: question {qc} réutilisée (déjà dans {seen_q[qc]})")
            seen_q[qc] = zk
        if z.get("theme_secours") not in CATEGORIES:
            rep.err(f"{name} {zk}: theme_secours {z.get('theme_secours')!r} hors catégories")
        if z.get("actif") is False:
            rep.warn(f"{name} {zk}: zone désactivée (en attente d'un autre feuillet)")
        elif z.get("actif") is not True:
            rep.err(f"{name} {zk}: actif doit être true ou false")
        if not isinstance(z.get("ordre"), int):
            rep.err(f"{name} {zk}: ordre doit être un entier")
    for pl, attendu in ZONES_PAR_PLATEAU.items():
        zs = per_plateau.get(pl, [])
        if len(zs) != attendu:
            rep.err(f"{name}: plateau {pl} a {len(zs)} zones, {attendu} attendues")
        ordres = sorted(z.get("ordre") for z in zs if isinstance(z.get("ordre"), int))
        if ordres != list(range(1, len(zs) + 1)):
            rep.err(f"{name}: plateau {pl} ordre non contigu {ordres}")
    if len(zones) != sum(ZONES_PAR_PLATEAU.values()):
        rep.err(f"{name}: {len(zones)} zones, {sum(ZONES_PAR_PLATEAU.values())} attendues")

    if use_db and by_key:
        fcodes = [z["feuillet_code"] for z in by_key.values() if isinstance(z.get("feuillet_code"), str)]
        rows = mysql_rows(
            "SELECT feuillet_code, plateau_number, biome_slug, type, statut, offert_ouverture, offert_cloture, mode_apparition "
            f"FROM gl_lore_feuillets WHERE feuillet_code IN ({sql_list(fcodes)})"
        )
        finfo = {r[0]: r for r in rows}
        qcodes = [z["question_code"] for z in by_key.values() if isinstance(z.get("question_code"), str)]
        rows = mysql_rows(
            "SELECT question_code, biome_slug, categorie_slug, niveau, statut FROM gl_qcm_questions "
            f"WHERE question_code IN ({sql_list(qcodes)})"
        )
        qinfo = {r[0]: r for r in rows}
        biome_counts = {}
        for zk, z in by_key.items():
            pl = z.get("plateau")
            fr = finfo.get(z.get("feuillet_code"))
            if not fr:
                rep.err(f"{name} {zk}: feuillet {z.get('feuillet_code')} introuvable en base")
                continue
            if str(fr[1]) != str(pl):
                rep.err(f"{name} {zk}: feuillet au plateau {fr[1]}, zone au plateau {pl}")
            if fr[3] not in ("feuillet", "scene"):
                rep.err(f"{name} {zk}: type de feuillet {fr[3]} refusé")
            if fr[3] == "scene":
                rep.warn(f"{name} {zk}: feuillet de type scene ({fr[7]}) — toléré si dessinable")
            if fr[4] != "actif":
                rep.err(f"{name} {zk}: feuillet inactif")
            if fr[5] != "0" or fr[6] != "0":
                rep.err(f"{name} {zk}: feuillet offert à l'ouverture ou à la clôture")
            if fr[7] == "biome":
                rep.err(f"{name} {zk}: page biome réservée à l'étude du biome")
            biome = fr[2]
            if biome not in BIOMES.get(pl, set()):
                rep.err(f"{name} {zk}: biome {biome!r} hors plateau {pl}")
            biome_counts.setdefault(pl, {}).setdefault(biome, 0)
            biome_counts[pl][biome] += 1
            qr = qinfo.get(z.get("question_code"))
            if not qr:
                rep.err(f"{name} {zk}: question {z.get('question_code')} introuvable en base")
                continue
            if qr[4] != "actif":
                rep.err(f"{name} {zk}: question {qr[0]} inactive")
            if qr[3] != "6ème":
                rep.err(f"{name} {zk}: question {qr[0]} de niveau {qr[3]!r} (6ème attendu)")
            if qr[1] != biome:
                rep.err(f"{name} {zk}: question {qr[0]} du biome {qr[1]} pour un feuillet {biome}")
            if qr[2] != z.get("theme_secours"):
                rep.err(f"{name} {zk}: theme_secours {z.get('theme_secours')} ≠ catégorie {qr[2]} de la question")
        for pl, counts in biome_counts.items():
            for biome, n in counts.items():
                if not 4 <= n <= 5:
                    rep.err(f"{name}: plateau {pl}, biome {biome} : {n} pages (4 à 5 attendues)")
        # tiers secret du glossaire dans les indices
        try:
            terms = mysql_rows("SELECT terme, variantes FROM gl_lore_glossary_terms WHERE niveau='secret'")
            secret = set()
            for t, v in terms:
                secret.add(t.lower())
                for part in (v or "").split(","):
                    if part.strip():
                        secret.add(part.strip().lower())
            for zk, z in by_key.items():
                low = str(z.get("indice", "")).lower()
                for s in secret:
                    core = re.sub(r"^(l'|la |le |les )", "", s)
                    if core and core in low:
                        rep.err(f"{name} {zk}: indice contient le terme secret « {s} »")
        except RuntimeError as exc:
            rep.warn(f"{name}: glossaire secret non vérifié ({exc})")
    return by_key


# --------------------------------------------------------------------------- questions de lecture


def check_questions(d, rep, zones):
    name = "questions-lecture.json"
    data = load(d, name, rep)
    if not data:
        return
    qs = data.get("questions")
    if not isinstance(qs, list):
        rep.err(f"{name}: `questions` doit être une liste")
        return
    keys = ["zone_key", "feuillet_code", "question", "choix", "reponse", "feedback_correct", "feedback_incorrect"]
    seen = set()
    for q in qs:
        zk = str(q.get("zone_key", "?"))
        require_keys(rep, name, q, keys, zk)
        if zk in seen:
            rep.err(f"{name} {zk}: zone_key en double")
        seen.add(zk)
        z = zones.get(zk)
        if z is None:
            rep.err(f"{name} {zk}: zone inconnue")
        elif z.get("feuillet_code") != q.get("feuillet_code"):
            rep.err(f"{name} {zk}: feuillet {q.get('feuillet_code')} ≠ zone {z.get('feuillet_code')}")
        choix = q.get("choix")
        if not isinstance(choix, dict) or sorted(choix) != ["A", "B", "C", "D"]:
            rep.err(f"{name} {zk}: choix doit avoir exactement A, B, C, D")
        else:
            vals = [str(v).strip() for v in choix.values()]
            if any(not v for v in vals):
                rep.err(f"{name} {zk}: choix vide")
            if len(set(vals)) != 4:
                rep.err(f"{name} {zk}: choix en double")
            if q.get("reponse") not in choix:
                rep.err(f"{name} {zk}: reponse {q.get('reponse')!r} hors choix")
        for k in ("question", "feedback_correct", "feedback_incorrect"):
            v = q.get(k)
            if not isinstance(v, str) or not v.strip():
                rep.err(f"{name} {zk}: {k} vide")
            elif len(v) > 400:
                rep.err(f"{name} {zk}: {k} trop long ({len(v)} > 400)")
        if isinstance(q.get("question"), str) and not q["question"].rstrip().endswith("?"):
            rep.warn(f"{name} {zk}: la question ne finit pas par « ? »")
        if isinstance(q.get("feedback_incorrect"), str) and not q["feedback_incorrect"].startswith("Pas encore"):
            rep.warn(f"{name} {zk}: feedback_incorrect ne commence pas par « Pas encore »")
    for zk in zones:
        if zk not in seen:
            rep.err(f"{name}: aucune question de lecture pour {zk}")
    if len(qs) != len(zones):
        rep.err(f"{name}: {len(qs)} questions pour {len(zones)} zones")
    reps = [q.get("reponse") for q in qs]
    for letter in "ABCD":
        if reps.count(letter) == 0:
            rep.warn(f"{name}: aucune bonne réponse en {letter}")


# --------------------------------------------------------------------------- péripéties, missions, titres, badges


def check_peripeties(d, rep):
    name = "peripeties.json"
    data = load(d, name, rep)
    if not data:
        return
    items = data.get("peripeties")
    if not isinstance(items, list):
        rep.err(f"{name}: `peripeties` doit être une liste")
        return
    if len(items) != 32:
        rep.err(f"{name}: {len(items)} péripéties, 32 attendues")
    seen = set()
    per_pl = {}
    for p in items:
        pid = str(p.get("id", "?"))
        require_keys(rep, name, p, ["id", "plateau", "biome_slug", "texte", "passable"], pid)
        if pid in seen:
            rep.err(f"{name} {pid}: id en double")
        seen.add(pid)
        pl = p.get("plateau")
        if pl not in BIOMES:
            rep.err(f"{name} {pid}: plateau invalide")
        elif p.get("biome_slug") not in BIOMES[pl]:
            rep.err(f"{name} {pid}: biome {p.get('biome_slug')!r} hors plateau {pl}")
        per_pl[pl] = per_pl.get(pl, 0) + 1
        if p.get("passable") is not True:
            rep.err(f"{name} {pid}: passable doit être true")
        t = p.get("texte")
        if not isinstance(t, str) or len(t.strip()) < 10:
            rep.err(f"{name} {pid}: texte vide")
        elif len(t) > 300:
            rep.err(f"{name} {pid}: texte trop long ({len(t)} > 300)")
    for pl in BIOMES:
        if per_pl.get(pl, 0) != 8:
            rep.err(f"{name}: plateau {pl} a {per_pl.get(pl, 0)} péripéties, 8 attendues")


def check_missions(d, rep):
    name = "missions.json"
    data = load(d, name, rep)
    if not data:
        return []
    items = data.get("missions")
    if not isinstance(items, list):
        rep.err(f"{name}: `missions` doit être une liste")
        return []
    if len(items) != 20:
        rep.err(f"{name}: {len(items)} missions, 20 attendues")
    seen = set()
    titres = []
    for m in items:
        mid = str(m.get("id", "?"))
        require_keys(rep, name, m, ["id", "texte", "type", "titre_sceau"], mid)
        if mid in seen:
            rep.err(f"{name} {mid}: id en double")
        seen.add(mid)
        if m.get("type") not in ("cooperative", "absurde", "classe"):
            rep.err(f"{name} {mid}: type {m.get('type')!r} invalide")
        if not isinstance(m.get("texte"), str) or len(m["texte"].strip()) < 10:
            rep.err(f"{name} {mid}: texte vide")
        ts = m.get("titre_sceau")
        if not isinstance(ts, str) or not ts.strip():
            rep.err(f"{name} {mid}: titre_sceau vide")
        else:
            titres.append(ts)
    if len(set(titres)) != len(titres):
        rep.err(f"{name}: titres de sceau en double")
    return titres


def check_titres(d, rep, titres_missions):
    name = "titres.json"
    data = load(d, name, rep)
    if not data:
        return
    honneurs = data.get("honneurs")
    if not isinstance(honneurs, dict) or set(honneurs) != {"eclaireurs", "gardiens", "passeurs", "esprit"}:
        rep.err(f"{name}: honneurs doit contenir eclaireurs, gardiens, passeurs, esprit")
    else:
        for h, v in honneurs.items():
            for b in BIOMES_TITRES:
                if not isinstance(v.get(b), str) or not v[b].strip():
                    rep.err(f"{name}: honneurs.{h}.{b} manquant")
    sceaux = data.get("sceaux_peuple")
    if not isinstance(sceaux, dict) or set(sceaux) != {"eclaireuses", "mains"}:
        rep.err(f"{name}: sceaux_peuple doit contenir eclaireuses et mains")
    else:
        for s, v in sceaux.items():
            for b in BIOMES_TITRES:
                if not isinstance(v.get(b), str) or not v[b].strip():
                    rep.err(f"{name}: sceaux_peuple.{s}.{b} manquant")
    all_titles = []
    for grp in (honneurs or {}, sceaux or {}):
        for v in grp.values():
            if isinstance(v, dict):
                all_titles += [v.get(b) for b in BIOMES_TITRES]
    if len(set(all_titles)) != len(all_titles):
        rep.err(f"{name}: titres d'honneur / de sceau en double")
    missions = data.get("missions")
    if not isinstance(missions, list):
        rep.err(f"{name}: missions doit être une liste")
    else:
        for t in titres_missions:
            if t not in missions:
                rep.err(f"{name}: titre de mission « {t} » absent de titres.missions")
        if len(set(missions)) != len(missions):
            rep.err(f"{name}: titres de mission en double")


def check_badges(d, rep):
    name = "badges.json"
    data = load(d, name, rep)
    if not data:
        return
    items = data.get("badges")
    if not isinstance(items, list):
        rep.err(f"{name}: `badges` doit être une liste")
        return
    codes = set()
    for b in items:
        code = str(b.get("code", "?"))
        require_keys(rep, name, b, ["code", "nom", "critere", "regle", "icone"], code)
        if code in codes:
            rep.err(f"{name} {code}: code en double")
        codes.add(code)
        r = b.get("regle")
        if not isinstance(r, dict) or set(r) != {"type", "seuil", "source"}:
            rep.err(f"{name} {code}: regle doit avoir type, seuil, source")
        else:
            if r["type"] not in ("compteur", "serie_hebdo", "saisie_prof", "reserve"):
                rep.err(f"{name} {code}: regle.type {r['type']!r} invalide")
            if r["type"] == "reserve":
                if r["seuil"] is not None:
                    rep.err(f"{name} {code}: seuil doit être null pour un badge réservé")
            elif not isinstance(r["seuil"], int) or r["seuil"] < 1:
                rep.err(f"{name} {code}: seuil invalide")
        for k in ("nom", "critere", "icone"):
            if not isinstance(b.get(k), str) or not b[k].strip():
                rep.err(f"{name} {code}: {k} vide")
    if codes != BADGES_ATTENDUS:
        rep.err(f"{name}: codes attendus {sorted(BADGES_ATTENDUS - codes)} manquants, inattendus {sorted(codes - BADGES_ATTENDUS)}")


# --------------------------------------------------------------------------- Olu, parures, sorts, réglages, passeur


def check_olu(d, rep):
    name = "olu-lignes.json"
    data = load(d, name, rep)
    if not data:
        return
    items = data.get("lignes")
    if not isinstance(items, list):
        rep.err(f"{name}: `lignes` doit être une liste")
        return
    seen = set()
    moments = set()
    n_err = 0
    for l in items:
        lid = str(l.get("id", "?"))
        allowed = ["id", "moment", "expression", "texte", "variables", "correction", "plateaux"]
        extra = [k for k in l if k not in allowed]
        missing = [k for k in allowed[:5] if k not in l]
        if extra or missing:
            rep.err(f"{name} {lid}: clés manquantes {missing} / inattendues {extra}")
        if lid in seen:
            rep.err(f"{name} {lid}: id en double")
        seen.add(lid)
        if l.get("moment") not in MOMENTS:
            rep.err(f"{name} {lid}: moment {l.get('moment')!r} invalide")
        moments.add(l.get("moment"))
        if l.get("expression") not in EXPRESSIONS:
            rep.err(f"{name} {lid}: expression {l.get('expression')!r} invalide")
        t = l.get("texte")
        if not isinstance(t, str) or not t.strip():
            rep.err(f"{name} {lid}: texte vide")
            continue
        if len(t) > 240:
            rep.err(f"{name} {lid}: texte trop long ({len(t)} > 240)")
        found = sorted(set(re.findall(r"\{(\w+)\}", t)))
        if found != sorted(l.get("variables") or []):
            rep.err(f"{name} {lid}: variables {l.get('variables')} ≠ {found} trouvées dans le texte")
        for v in found:
            if v not in ("equipe", "n", "biome"):
                rep.err(f"{name} {lid}: variable {{{v}}} inconnue")
        if l.get("moment") == "erreur":
            n_err += 1
            if not isinstance(l.get("correction"), str) or not l["correction"].strip():
                rep.err(f"{name} {lid}: une erreur volontaire doit avoir une correction")
            pl = l.get("plateaux", "tous")
            if pl != "tous" and (not isinstance(pl, list) or not pl
                                 or any(x not in (1, 2, 3, 4) for x in pl)):
                rep.err(f"{name} {lid}: plateaux attend \"tous\" ou une liste de plateaux 1-4")
        elif "plateaux" in l:
            rep.err(f"{name} {lid}: plateaux réservé au moment erreur")
        elif "correction" in l:
            rep.err(f"{name} {lid}: correction réservée au moment erreur")
    for m in MOMENTS - moments:
        rep.warn(f"{name}: aucune ligne pour le moment {m}")
    if n_err < 5:
        rep.err(f"{name}: {n_err} erreurs volontaires, au moins 5 attendues")


def check_parures(d, rep):
    name = "parures.json"
    data = load(d, name, rep)
    if not data:
        return
    items = data.get("parures")
    if not isinstance(items, list):
        rep.err(f"{name}: `parures` doit être une liste")
        return
    if len(items) != 12:
        rep.err(f"{name}: {len(items)} parures, 12 attendues")
    codes = set()
    pelages = set()
    for p in items:
        code = str(p.get("code", "?"))
        allowed = ["code", "nom", "description", "prix", "ressource", "chapitre_min", "type", "asset", "pelage"]
        extra = [k for k in p if k not in allowed]
        missing = [k for k in allowed[:8] if k not in p]
        if extra or missing:
            rep.err(f"{name} {code}: clés manquantes {missing} / inattendues {extra}")
        if code in codes:
            rep.err(f"{name} {code}: code en double")
        codes.add(code)
        if p.get("prix") not in (2, 3, 4):
            rep.err(f"{name} {code}: prix {p.get('prix')!r} hors 2-4")
        if p.get("ressource") != "choix":
            rep.err(f"{name} {code}: ressource doit être choix")
        if p.get("chapitre_min") not in (1, 2, 3, 4):
            rep.err(f"{name} {code}: chapitre_min invalide")
        if p.get("type") not in ("calque", "pastille"):
            rep.err(f"{name} {code}: type invalide")
        if p.get("asset") is not None and not isinstance(p["asset"], str):
            rep.err(f"{name} {code}: asset doit être une chaîne ou null")
        if "pelage" in p:
            if p["pelage"] not in ("bestiaire", "neon"):
                rep.err(f"{name} {code}: pelage invalide")
            if p.get("chapitre_min") != 4:
                rep.err(f"{name} {code}: un pelage est une parure du chapitre 4")
            pelages.add(p["pelage"])
        for k in ("nom", "description"):
            if not isinstance(p.get(k), str) or not p[k].strip():
                rep.err(f"{name} {code}: {k} vide")
        if isinstance(p.get("description"), str) and len(p["description"]) > 200:
            rep.err(f"{name} {code}: description trop longue")
    if pelages != {"bestiaire", "neon"}:
        rep.err(f"{name}: pelages bestiaire et neon attendus au chapitre 4")


def check_sorts(d, rep, use_db):
    name = "sorts.json"
    data = load(d, name, rep)
    if not data:
        return
    items = data.get("sorts")
    if not isinstance(items, list):
        rep.err(f"{name}: `sorts` doit être une liste")
        return
    keys = ["code", "nom", "famille", "peuple", "cout", "ressource", "fenetre", "limite", "cible", "execution",
            "effet_court", "effet_auto_json", "chapitre_ouverture", "nouveau"]
    codes = {}
    names = set()
    for s in items:
        code = str(s.get("code", "?"))
        require_keys(rep, name, s, keys, code)
        if not re.fullmatch(r"SL\d{3}", code):
            rep.err(f"{name} {code}: code hors motif SL0xx")
        if code in codes:
            rep.err(f"{name} {code}: code en double")
        codes[code] = s
        if s.get("nom") in names:
            rep.err(f"{name} {code}: nom en double")
        names.add(s.get("nom"))
        if s.get("peuple") not in PEUPLES:
            rep.err(f"{name} {code}: peuple invalide")
        if s.get("ressource") not in RESSOURCES:
            rep.err(f"{name} {code}: ressource invalide")
        if s.get("fenetre") not in FENETRES:
            rep.err(f"{name} {code}: fenetre {s.get('fenetre')!r} invalide")
        if not isinstance(s.get("cout"), int) or s["cout"] < 0:
            rep.err(f"{name} {code}: cout invalide")
        lim = s.get("limite")
        if lim is not None:
            if not isinstance(lim, dict) or set(lim) != {"par", "n", "portee"}:
                rep.err(f"{name} {code}: limite doit avoir par, n, portee")
            else:
                if lim["par"] not in LIMITE_PAR or lim["portee"] not in LIMITE_PORTEE or not isinstance(lim["n"], int) or lim["n"] < 1:
                    rep.err(f"{name} {code}: limite invalide {lim}")
        if s.get("execution") not in ("auto", "prof"):
            rep.err(f"{name} {code}: execution invalide")
        if s.get("execution") == "auto" and not isinstance(s.get("effet_auto_json"), dict):
            rep.err(f"{name} {code}: un sort auto doit avoir un effet_auto_json")
        if (s.get("execution") == "prof" and isinstance(s.get("effet_auto_json"), dict)
                and s.get("peuple") != "classe" and s["effet_auto_json"].get("validation") != "prof"):
            rep.warn(f"{name} {code}: sort prof avec effet_auto_json sans validation prof")
        co = s.get("chapitre_ouverture")
        if co not in (1, 2, 3, 4, "retour"):
            rep.err(f"{name} {code}: chapitre_ouverture invalide")
        if s.get("peuple") == "pacte" and s.get("ressource") != "pacte":
            rep.err(f"{name} {code}: un sort du pacte se paie en pacte")
        if s.get("peuple") == "unicorn" and s.get("ressource") != "gemmes":
            rep.err(f"{name} {code}: un sort licorne se paie en gemmes")
        if s.get("peuple") == "gnome" and s.get("ressource") != "coeurs":
            rep.err(f"{name} {code}: un sort gnome se paie en cœurs")
        if not isinstance(s.get("nouveau"), bool):
            rep.err(f"{name} {code}: nouveau doit être un booléen")
    if names != SPELL_NAMES_ATTENDUS:
        rep.err(f"{name}: sorts manquants {sorted(SPELL_NAMES_ATTENDUS - names)}, inattendus {sorted(names - SPELL_NAMES_ATTENDUS)}")
    ouv = data.get("ouverture_par_chapitre")
    if not isinstance(ouv, dict) or set(ouv) != {"1", "2", "3", "4", "retour"}:
        rep.err(f"{name}: ouverture_par_chapitre doit avoir les clés 1, 2, 3, 4, retour")
    else:
        listed = {}
        for ch, lst in ouv.items():
            for c in lst:
                if c not in codes:
                    rep.err(f"{name}: ouverture_par_chapitre.{ch} cite {c} inconnu")
                elif str(codes[c].get("chapitre_ouverture")) != ch:
                    rep.err(f"{name}: {c} ouvert au chapitre {ch} mais chapitre_ouverture = {codes[c].get('chapitre_ouverture')}")
                if c in listed:
                    rep.err(f"{name}: {c} listé deux fois dans ouverture_par_chapitre")
                listed[c] = ch
        for c in codes:
            if c not in listed:
                rep.err(f"{name}: {c} absent de ouverture_par_chapitre")
    voy = data.get("voyageur")
    if not isinstance(voy, list) or len(voy) != 6:
        rep.err(f"{name}: voyageur doit lister 6 sorts")
    else:
        niveaux = sorted(v.get("niveau") for v in voy)
        if niveaux != [1, 2, 3, 4, 5, 6]:
            rep.err(f"{name}: niveaux du voyageur {niveaux} ≠ 1..6")
        vcodes = [v.get("code") for v in voy]
        if len(set(vcodes)) != 6:
            rep.err(f"{name}: codes du voyageur en double")
        for v in voy:
            for k in ("code", "nom", "niveau", "cout", "limite", "effet_court", "execution", "perimetre"):
                if k not in v:
                    rep.err(f"{name} voyageur {v.get('code')}: clé {k} manquante")
    if use_db:
        rows = mysql_rows("SELECT spell_code, nom FROM gl_spells")
        db = {r[0]: r[1] for r in rows}
        for code, s in codes.items():
            if s.get("nouveau") is False:
                if code not in db:
                    rep.err(f"{name} {code}: marqué repris mais absent de gl_spells")
                elif db[code] != s.get("nom"):
                    rep.err(f"{name} {code}: nom {s.get('nom')!r} ≠ {db[code]!r} en base")
            elif code in db:
                rep.err(f"{name} {code}: marqué nouveau mais le code existe en base ({db[code]})")


def check_reglages(d, rep):
    name = "reglages-defaut.json"
    data = load(d, name, rep)
    if not data:
        return
    if data.get("prefixe") != "tenir_" or data.get("groupe") != "gameplay":
        rep.err(f"{name}: groupe gameplay et préfixe tenir_ attendus")
    defaut = data.get("defaut")
    if not isinstance(defaut, dict):
        rep.err(f"{name}: defaut doit être un objet")
        return
    missing = REGLAGES_ATTENDUS - set(defaut)
    if missing:
        rep.err(f"{name}: réglages manquants {sorted(missing)}")
    checks = [
        ("surface", lambda v: v in ("tableau", "hybride", "tablette")),
        ("des_mode", lambda v: v in ("serveur", "physique")),
        ("des_count", lambda v: isinstance(v, int) and 1 <= v <= 3),
        ("des_physiques_validation", lambda v: v in ("prof", "auto")),
        ("fouilles_par_tour", lambda v: isinstance(v, dict) and set(v) == {"gnome", "unicorn"}),
        ("fouille_seuils", lambda v: isinstance(v, dict) and set(v) == {"chaud", "tiede"} and v["chaud"] < v["tiede"]),
        ("zones_par_plateau", lambda v: isinstance(v, dict) and set(v) == {"1", "2", "3", "4"}),
        ("voile_bonus_par_plateau", lambda v: isinstance(v, dict) and set(v) == {"1", "2", "3", "4"}),
        ("palissement_pct", lambda v: isinstance(v, int) and 0 < v <= 100),
        ("palissement_max", lambda v: isinstance(v, int) and 0 < v <= 100),
        ("max_power_points", lambda v: isinstance(v, int) and v > 0),
        ("max_health_points", lambda v: isinstance(v, int) and v > 0),
        ("lore_feuillet_retrigger", lambda v: v in ("once_per_team", "once_per_game", "every_arrival")),
    ]
    for key, ok in checks:
        if key in defaut and not ok(defaut[key]):
            rep.err(f"{name}: defaut.{key} = {defaut[key]!r} invalide")
    for key in ("enabled", "questions_de_case", "vent", "voile", "marche", "marche_pendant_tour", "parures",
                "lumiere", "cartes_vers_cases", "chapardeur", "peripeties", "olu_erreur_du_jour",
                "lore_gemme_costs_enabled", "lore_heart_rewards_enabled", "feuillet_zone_traversal_enabled"):
        if key in defaut and not isinstance(defaut[key], bool):
            rep.err(f"{name}: defaut.{key} doit être un booléen")
    profils = data.get("profils")
    if not isinstance(profils, dict) or set(profils) != {"complet", "prologue"}:
        rep.err(f"{name}: profils complet et prologue attendus")
    else:
        for pname, p in profils.items():
            ecarts = p.get("ecarts")
            if not isinstance(ecarts, dict):
                rep.err(f"{name}: profils.{pname}.ecarts doit être un objet")
                continue
            for k in ecarts:
                if k not in defaut:
                    rep.err(f"{name}: profils.{pname}.ecarts.{k} n'est pas un réglage connu")
        if profils.get("complet", {}).get("ecarts"):
            rep.err(f"{name}: le profil complet ne doit avoir aucun écart")
        pro = profils.get("prologue", {}).get("ecarts", {})
        for k in ("voile", "marche", "chapardeur"):
            if pro.get(k) is not False:
                rep.err(f"{name}: le profil prologue doit mettre {k} à false")


def check_passeur(d, rep, use_db):
    name = "passeur-plateau4.json"
    data = load(d, name, rep)
    if not data:
        return
    plateaux = data.get("plateaux")
    if not isinstance(plateaux, dict) or set(plateaux) != {"1", "2", "3", "4"}:
        rep.err(f"{name}: plateaux 1 à 4 attendus")
        return
    attendus = {"1": 7, "2": 7, "3": 9, "4": 7}
    all_codes = []
    for pl, bloc in plateaux.items():
        pages = bloc.get("pages")
        if not isinstance(pages, list):
            rep.err(f"{name}: plateaux.{pl}.pages doit être une liste")
            continue
        if len(pages) != attendus[pl] or bloc.get("nb") != attendus[pl]:
            rep.err(f"{name}: plateau {pl} a {len(pages)} pages (nb={bloc.get('nb')}), {attendus[pl]} attendues")
        ordres = [p.get("ordre") for p in pages]
        if ordres != list(range(1, len(pages) + 1)):
            rep.err(f"{name}: plateau {pl} ordre non contigu {ordres}")
        ov = [p.get("ordre_voyage") for p in pages]
        if ov != sorted(ov):
            rep.err(f"{name}: plateau {pl} pages hors ordre de voyage")
        for p in pages:
            for k in ("feuillet_code", "ordre_voyage", "titre", "biome_slug", "ordre"):
                if k not in p:
                    rep.err(f"{name}: plateau {pl} page {p.get('feuillet_code')} sans {k}")
            if pl == "4":
                if not isinstance(p.get("justification"), str) or not p["justification"].strip():
                    rep.err(f"{name}: plateau 4 page {p.get('feuillet_code')} sans justification")
                check_forbidden(rep, name, f"plateau 4 titre {p.get('feuillet_code')}", p.get("titre", ""), ["corbeau", "krâ", "kraa"])
            elif "corbeau" in str(p.get("titre", "")).lower() and not p.get("avertissement"):
                rep.err(f"{name}: plateau {pl} page {p.get('feuillet_code')} nomme le corbeau dans le titre sans avertissement")
            all_codes.append((pl, p.get("feuillet_code")))
    codes_only = [c for _, c in all_codes]
    if len(set(codes_only)) != len(codes_only):
        rep.err(f"{name}: feuillet listé deux fois")
    if use_db:
        rows = mysql_rows(
            "SELECT feuillet_code, plateau_number, mode_apparition, type, statut, "
            "(texte LIKE '%corbeau%' OR texte LIKE '%krâ%') FROM gl_lore_feuillets "
            f"WHERE feuillet_code IN ({sql_list(codes_only)})"
        )
        info = {r[0]: r for r in rows}
        for pl, c in all_codes:
            r = info.get(c)
            if not r:
                rep.err(f"{name}: {c} introuvable en base")
                continue
            if r[1] != pl or r[2] != "carnet_route" or r[3] != "scene" or r[4] != "actif":
                rep.err(f"{name}: {c} n'est pas une page de route active du plateau {pl} ({r[1:5]})")
            if pl == "4" and r[5] == "1":
                rep.err(f"{name}: la page {c} du plateau 4 nomme le corbeau dans son texte")
        for pl in ("1", "2", "3"):
            rows = mysql_rows(
                "SELECT feuillet_code FROM gl_lore_feuillets WHERE plateau_number=%s AND mode_apparition='carnet_route' "
                "AND type='scene' AND statut='actif'" % pl
            )
            en_base = {r[0] for r in rows}
            listes = {c for p, c in all_codes if p == pl}
            if en_base != listes:
                rep.err(f"{name}: plateau {pl} : pages en base {sorted(en_base - listes)} manquantes, inconnues {sorted(listes - en_base)}")


# --------------------------------------------------------------------------- chaînes interdites globales

SKIP_FORBIDDEN = {
    "chasse-zones.json": re.compile(r"\.titre_prive$|^format$"),
    "passeur-plateau4.json": re.compile(r"\.justification$|\.ecartees$|\.avertissement$|\.note$|^format$|^regle$|^plateaux\.[123]\.pages\[\d+\]\.titre$"),
    "sorts.json": re.compile(r"^format$|^vocabulaire"),
    "reglages-defaut.json": re.compile(r"^format$|^notes"),
    "README.md": None,
}


def check_forbidden_everywhere(d, rep):
    for fname in sorted(os.listdir(d)):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fname), encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        skip = SKIP_FORBIDDEN.get(fname, re.compile(r"^format$"))
        for path, s in walk_strings(data):
            if skip and skip.search(path):
                continue
            check_forbidden(rep, fname, path, s)


# --------------------------------------------------------------------------- main


def load_catalogue(path, rep):
    if not path:
        return None
    if not os.path.isfile(path):
        rep.warn(f"catalogue de polygones {path} introuvable : polygone_ref non vérifiés")
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        rep.warn(f"catalogue de polygones illisible ({exc})")
        return None
    zones = data.get("zones") if isinstance(data, dict) else data
    return {z.get("zone_id"): z for z in zones if isinstance(z, dict)}


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    opts = [a for a in argv[1:] if a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    d = args[0]
    if not os.path.isdir(d):
        print(f"dossier introuvable : {d}", file=sys.stderr)
        return 2
    catalogue_path = None
    for o in opts:
        if o.startswith("--catalogue="):
            catalogue_path = o.split("=", 1)[1]
    if catalogue_path is None:
        for cand in ("src/gl/data/zones_feuillets.json",
                     os.path.join(d, "..", "..", "..", "src", "gl", "data", "zones_feuillets.json"),
                     os.path.expanduser("~/oliviera999/foretmap/src/gl/data/zones_feuillets.json")):
            if os.path.isfile(cand):
                catalogue_path = cand
                break
    rep = Report()
    use_db = "--no-db" not in opts and db_available()
    if not use_db:
        rep.warn("base `fm` non joignable (ou --no-db) : codes de feuillets et de questions non vérifiés en base")
    catalogue = load_catalogue(catalogue_path, rep)
    if catalogue is None and catalogue_path is None:
        rep.warn("aucun catalogue de polygones trouvé : polygone_ref non vérifiés")

    zones = check_zones(d, rep, use_db, catalogue)
    check_questions(d, rep, zones)
    check_peripeties(d, rep)
    titres_missions = check_missions(d, rep)
    check_titres(d, rep, titres_missions)
    check_badges(d, rep)
    check_olu(d, rep)
    check_parures(d, rep)
    check_sorts(d, rep, use_db)
    check_reglages(d, rep)
    check_passeur(d, rep, use_db)
    check_forbidden_everywhere(d, rep)
    if not os.path.isfile(os.path.join(d, "README.md")):
        rep.err("README.md absent")

    for w in rep.warnings:
        print("AVERTISSEMENT :", w)
    for e in rep.errors:
        print("ERREUR :", e)
    print(f"{len(rep.errors)} erreur(s), {len(rep.warnings)} avertissement(s) — base {'consultée' if use_db else 'non consultée'}")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
