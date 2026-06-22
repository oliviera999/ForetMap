# Audit — mascottes de visite & gestion des packs

Audit approfondi du système de mascottes de visite ForetMap (catalogue, packs `sprite_cut`,
import/export ZIP, publication, service des assets, rendu). Les constats marqués **vérifié**
l'ont été par lecture directe du code (`file:line`) ; ceux marqués **à confirmer** proviennent
de l'exploration et restent à valider.

## 1. Flux de bout en bout

```
IMPORT ZIP (POST /api/visit/mascot-packs/import)
  parse manifest+pack+assets → rewrite framesBase=/api/visit/mascot-packs/{uuid}/assets/
  → stateFrames.files = basenames → écrit les PNG sous uploads/visit_mascot_packs/{uuid}/
  → INSERT visit_mascot_packs (is_published)
STOCKAGE   : table visit_mascot_packs (is_published clé) + disque uploads/visit_mascot_packs/{uuid}/
SERVICE
  - Visite publique : GET /api/visit/:id → mascot_packs[] WHERE is_published = 1   (routes/visit.js:316)
  - Asset PNG       : GET /api/visit/mascot-packs/:uuid/assets/:file
      publié        → lecture publique (sans JWT)
      brouillon     → visit.manage élevé OU preview_token valide, sinon 403
RENDU
  - Front construit les <img src> = framesBase + files (URLs brutes, sans token)
  - Catalogue visite : buildVisitMascotCatalogExtrasFromContent(content.mascot_packs)
```

## 2. Cause racine — « un pack importé ne s'affiche pas » (vérifié)

1. **L'import (`create`) créait le pack en brouillon** : `is_published = 0`
   (`routes/visit/mascot.js:700`, avant correctif).
2. **La visite publique ne sert que les packs publiés** : `WHERE is_published = 1`
   (`routes/visit.js:316`).
3. ⟹ Un pack fraîchement importé **n'entrait jamais** dans le payload `mascot_packs` de la
   visite → mascotte invisible (fallback silhouette) côté élève, tant que le prof ne publiait
   pas manuellement (toggle `PUT /api/visit/mascot-packs/:id` `{ is_published: 1 }`).
4. Les requêtes `<img>` ne portent pas le header `Authorization: Bearer` → pour un **brouillon**,
   les assets renvoient **403** partout sauf l'aperçu d'édition du studio (qui utilise un
   `preview_token` signé). C'est l'origine des `403` observés sur `…/assets/cell-*.png`.

### Démenti d'un faux positif

Un pré-rapport indiquait que le middleware `authenticate` bloquerait **aussi** les packs
publiés. **Faux** (vérifié `middleware/requireTeacher.js:91`) : `authenticate` est **optionnel**
(`if (!token) { req.auth = null; return next(); }`). Un pack **publié** est donc bien servi aux
visiteurs anonymes. Le problème portait uniquement sur l'état **brouillon**.

## 3. Correctif appliqué (ce lot)

**Publier par défaut à l'import**, pour que « quel que soit l'import, cela fonctionne » :

- `lib/visitMascotPackHelpers.js` : helper pur **`resolveVisitMascotImportPublishState`**
  - `create` → **publié par défaut** (`1`) ; override `is_published: 0` pour importer en brouillon.
  - `replace` → conserve l'état `is_published` du pack cible (pas de (dé)publication par surprise).
- `routes/visit/mascot.js` : la route d'import utilise ce helper (remplace le `… : 0` figé).
- `src/shared/mascot-pack/MascotPackArchiveImportDialog.jsx` : case **« Publier dès l'import »**
  (cochée par défaut, visite) ; libellé du mode `create` corrigé (« Nouveau pack » au lieu de
  « Nouveau brouillon »).
- Tests : `tests/visit-mascot-import-publish.test.js` (6 cas) ; doc `docs/API.md` mise à jour.

Effet : import → `is_published = 1` → présent dans `GET /api/visit/:id` → assets servis en
public (`authenticate` optionnel + lecture publique des packs publiés) → **sprites affichés**.

## 4. Autres constats (hors périmètre de ce correctif)

| #   | Sévérité | Constat                                                                                                                                                                                                                                                          | Statut      |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A   | Moyenne  | **Carte éditeur** (`map-views.jsx` → `MapViewMascotOverlay`) ne passe pas `extraCatalogEntries` au renderer → packs importés non rendus dans la vue d'édition prof.                                                                                              | vérifié     |
| B   | Moyenne  | **Aperçu global studio** (`VisitMascotStudioPreviewSection`) et `buildVisitMascotCatalogExtrasFromContent` n'appliquent pas les `preview_url` tokenisés → un **brouillon** y rend en 403 (l'aperçu d'édition `MascotPackRenderPreview`, lui, applique le token). | vérifié     |
| C   | Faible   | **gnome1** : `buildGnome1CatalogPackTemplate` existe mais l'id n'est pas dans `VISIT_MASCOT_CATALOG_MODEL_META` → template absent de `listVisitMascotCatalogTemplateIds()` (clonage catalogue indisponible).                                                     | vérifié     |
| D   | Faible   | **Export d'un pack à assets statiques** (`/assets/mascots/…`, ex. gnome1) : `collectVisitPackAssets` n'embarque pas ces fichiers → ZIP incomplète → réimport cassé.                                                                                              | à confirmer |
| E   | Faible   | Asset brouillon non autorisé → **403** ; un **401** serait plus correct pour un `<img>` anonyme (impact mineur, le front retombe sur la silhouette via `onError`).                                                                                               | vérifié     |
| F   | Info     | `preview_token` TTL 1 h (`lib/visitMascotPackAssetPreview.js:59`) : ré-émis à chaque réponse liste/upload, mais une session studio très longue peut voir expirer un aperçu.                                                                                      | vérifié     |

### Recommandations

- **A/B** : passer `extraCatalogEntries` (et, pour les brouillons côté prof, les `spriteCut`
  tokenisés via `applyPackAssetPreviewUrlsToSpriteCut`) au renderer de la carte éditeur et de
  l'aperçu global, pour un rendu cohérent des brouillons côté prof.
- **C** : enregistrer `gnome1` dans `VISIT_MASCOT_CATALOG_MODEL_META` si le clonage catalogue
  gnome1 est souhaité.
- **D** : étendre `collectVisitPackAssets` pour embarquer les fichiers `/assets/mascots/…` à
  l'export (round-trip des templates statiques).

> Modèle de sécurité confirmé et **sain** : _publié = assets publics_ ; _brouillon = aperçu prof
> via token signé_. Un visiteur anonyme ne doit jamais recevoir d'asset de brouillon — d'où le
> choix de **publier à l'import** plutôt que d'exposer les brouillons publiquement.
