# Audit traceurs / art. 82 — 24 octobre 2026

Instantané des quatre écarts relevés pour rester dispensé de bandeau cookies (loi
Informatique et Libertés art. 82, lignes directrices CNIL 2020), et des correctifs livrés
sur la branche `feat/traceurs-rgpd` (lots A–D). Périmètre : ForetMap, plan public, plan des
personnels, plan e-nov. **Hors périmètre** : Gnomes & Licornes (dossier distinct).

## Constats

| #   | Écart                                                                                                             | Correctif                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A   | Copies d'API authentifiées (`__fm_sw_user`) et charges plan survivant à la déconnexion ; pas de `Clear-Site-Data` | `POST /api/auth/logout` + en-tête ; purge client systématique ; mode borne `cache_storage` |
| B   | Images hors Wikimedia chargées en direct ; CSP `img-src https:` trop large                                        | Relais généralisé + SSRF ; CSP par produit (gl inchangé)                                   |
| C   | Iframe tutoriel-lien dès l'ouverture                                                                              | Façade « Afficher ici » ; `youtube-nocookie` ; `no-referrer`                               |
| D   | Notice incomplète (OAuth/LTI, formulation trop optimiste)                                                         | Notice + docs de référence alignées                                                        |

## Hors périmètre (volontaire)

- Jeton de session dans le `localStorage` : choix de sécurité (pas d'obligation cookie) ;
  la CSP imposée limite l'exfiltration XSS.
- Révocation serveur des JWT à la déconnexion : non traitée ici (pas de liste noire).
- Actions organisationnelles du dossier de conformité (convention art. 28, registre, AIPD,
  activation purge, DPO) : hors code.

## Recette manuelle (10 lignes)

1. Navigation privée, onglets Application + Réseau.
2. `/confidentialite` sans compte : cookies OAuth/LTI et façade mentionnés.
3. Connexion élève → tâches → déconnexion → plus d'`__fm_sw_user` ; réponse logout avec
   `Clear-Site-Data` ; hors ligne = écran de connexion.
4. Fiche avec photo `https:` tierce → requête `/api/media/remote`, pas l'hôte tiers.
5. Tutoriel-lien YouTube → façade, puis nocookie après clic.
6. Plan public fermé par code → logout purge content/settings en cache.
7. Produit `gl` : CSP `img-src` toujours avec `https:` (instantané de test).
