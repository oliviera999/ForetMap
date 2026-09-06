# Charge — ouverture du catalogue biodiversité (avant / après)

Mesure de l'écart traité par [`docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`](../../docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md).
Scénario : [`load/artillery-biodiv.yml`](../artillery-biodiv.yml).

## Pourquoi cette mesure existe

Les scénarios `artillery-light.yml`, `artillery.yml` et `artillery-10vu.yml` simulent
l'ouverture du catalogue par **un seul `GET /api/plants`**. Ils mesuraient donc 1 requête là
où le navigateur en émettait ~471 — d'où des rapports verts sur un écran qui saturait le
plafond de requêtes d'un établissement à trois ouvertures simultanées (audit, §1.2).

`artillery-biodiv.yml` rejoue la rafale réelle, dans ses deux régimes, pour que l'écart soit
**mesuré** et pas seulement compté.

## Conditions

| | |
| --- | --- |
| Date | 6 septembre 2026 |
| Machine | conteneur de développement (Node 22, MariaDB 10.11 locale) — **pas** l'hébergement de production |
| Serveur | `node server.js --foretmap-e2e-no-rate-limit`, `NODE_ENV=production`, `dist/` servi |
| Rate limit | contourné (`X-ForetMap-Load-Test`) : sinon le régime « avant » se ferait couper par les 429 — le symptôme même décrit par l'audit, mais qui empêcherait de mesurer les temps de réponse |
| Charge | phases identiques pour les deux régimes : 20 s à 2 arrivées/s, 60 s à 5, 20 s à 2 |
| Utilisateurs virtuels | **380 de part et d'autre** |

## Résultat

| | Avant | Après | Écart |
| --- | --- | --- | --- |
| Requêtes HTTP totales | **23 180** | **1 520** | **÷ 15,2** |
| Débit soutenu | 135 req/s | 8 req/s | ÷ 17 |
| Requêtes par ouverture d'écran | 61 | 4 | ÷ 15,2 |
| Réponses non-2xx | 0 | 0 | — |
| Temps de réponse médian | 2 ms | 3 ms | — |
| Temps de réponse p95 | 4 ms | 5 ms | — |
| Temps de réponse p99 | 7 ms | 10,1 ms | — |

## Lecture

**Le serveur n'était pas lent : on lui en demandait quinze fois trop.** Les temps de réponse
sont identiques dans les deux régimes (2–5 ms) — c'est le **nombre** de requêtes qui a changé,
pas leur coût unitaire. Cela confirme la thèse de l'audit : le point de rupture n'était pas le
CPU par requête mais le plafond de requêtes par adresse IP, franchi par trois élèves ouvrant
l'onglet dans la même minute.

Le p99 légèrement plus haut « après » n'est pas une régression : avec 15 fois moins de
requêtes, chaque valeur extrême pèse davantage dans le centile.

## Ce que cette mesure sous-estime — volontairement

Le facteur réel est **plus grand** que le 15,2 mesuré, pour deux raisons cumulées :

1. **20 fiches rejouées au lieu de 78.** Le scénario borne la boucle pour rester jouable sur
   un poste de développement.
2. **Seules les routes publiques sont rejouées.** Le volet « commentaires de contexte » de la
   rafale historique — deux appels par fiche, plus un `GET /api/settings/public` — demande un
   jeton et n'est pas simulé. La rafale réelle comptait **six** appels par fiche, pas trois.

Rapporté au catalogue réel : ~471 appels à l'ouverture contre 3 aujourd'hui, soit un facteur
d'environ **120** — cf. le tableau de bilan de l'audit, § 5.

## Rejouer

```bash
npm run build
LOAD_TEST_SECRET=… node server.js --foretmap-e2e-no-rate-limit   # autre terminal
LOAD_TEST_SECRET=… npx artillery run load/artillery-biodiv.yml --output load/report-biodiv.json
```

Les deux régimes tournent alors dans le même run (poids 50/50). Pour les mesurer séparément,
comme ci-dessus, dupliquer le fichier en ne gardant qu'un scénario avec `weight: 100`.
