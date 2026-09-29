# Audit — affichage des photos (ForetMap, GL, Plan) — 29 sept. 2026

> **Instantané** (convention : [`docs/audits/README.md`](audits/README.md)). Ne pas réécrire ;
> marquer « Traité » + lien lot/tests au fil des correctifs.
> Précédent, plus étroit : [`AUDIT_PHOTOS_BIODIVERSITE.md`](AUDIT_PHOTOS_BIODIVERSITE.md).

**Statut : à traiter.** 4 bloquants (PH-B1 à PH-B4), 9 constats moyens, une série de
constats faibles. Aucune correction faite dans ce lot.

**Périmètre.** Toute la chaîne d'une photo de contenu (plantes, zones et repères, tâches et
rapports, observations, carnet, visite, médiathèque, forum, QCM, espèces et chapitres GL,
avatars) : envoi depuis le navigateur, traitement et stockage serveur, service HTTP, rendu
`<img>`, visionneuse (lightbox), service worker. Hors périmètre : logos, icônes, mascottes,
fonds de plan.

**Méthode.** Lecture du code (44 balises `<img>` de photos recensées sur ~75 fichiers qui en
contiennent). Les bloquants ont été revérifiés ligne à ligne ; **rien n'a été exécuté dans un
navigateur** — PH-B1 est à confirmer par une recette.

---

## 1. Bloquants

### PH-B1 — Les illustrations du carnet ForetMap ne s'affichent pas

- Les pièces jointes d'un article ont une adresse protégée `/api/user-journal/assets/:id/file`
  (`routes/user-journal.js`, famille privée dans `lib/uploadsPrivatePaths.js`).
- La carte de lecture par défaut les affiche avec un `<img>` simple, qui n'envoie pas le
  jeton : `src/shared/journal/JournalArticleReadCard.jsx:108`. Même chose dans la vue livre
  `src/shared/journal/JournalBookView.jsx:43`. `JournalReadModal.jsx:213` ne transmet pas à la
  vue livre le composant d'image authentifiée qu'il sait pourtant injecter (l.72).
- Les illustrations insérées **dans le texte** sont aussi perdues : le filtre DOMPurify ne
  garde que `https?://`, `/uploads/` et `/maps/` (`src/shared/platform/markdown.js:271`) et
  retire donc le `src` des adresses `/api/user-journal/assets/…`. La branche correspondante de
  `useAuthedHtmlImages` (`src/hooks/useAuthedHtmlImages.js:7,29`) ne trouve jamais rien. Le
  test `tests-ui/hooks/useAuthedHtmlImages.test.jsx` injecte du HTML brut et ne voit pas le
  problème.

### PH-B2 — La lightbox globale neutralise les `onClick` des images

- `ImageLightboxProvider.jsx:18` écoute `click` sur `document` **en capture** et
  `handleImageLightboxClick` fait `stopPropagation()` (`imageLightboxClick.js:93-94`). React 19
  écoute sur la racine : les gestionnaires `onClick` posés sur des `<img>` ne s'exécutent plus.
- Conséquence visible : la galerie des zones et repères (`src/components/map/PhotoGallery.jsx:203`)
  devait ouvrir `image_url` ; la lightbox globale ouvre `currentSrc`, c'est-à-dire la
  **vignette 520 px**. Correctif trivial : `data-lightbox-src`, déjà lu par
  `resolveImageLightboxSrc` (l.52).
- Même motif, sans effet visible aujourd'hui, dans `TaskLogModals.jsx:406` — mais si l'image
  y reçoit `data-no-lightbox`, la lightbox locale se réveille avec une adresse `/api/…` sans
  jeton (401). Deux mécanismes de lightbox concurrents coexistent.

### PH-B3 — La médiathèque contourne toute la chaîne de sécurité des images

- `lib/mediaLibrary.js:255` et `:314` écrivent par `fs.writeFileSync` direct : **pas de
  retrait EXIF/GPS**, pas de `assertUploadSize`, écriture synchrone qui bloque le serveur.
- Le dossier est public (`/uploads/media-library/`), et le script de rattrapage l'exclut
  (`scripts/strip-uploads-exif.js:34`, commentaire « rien d'imageable » inexact).
- Le type **déclaré** prime sur la signature binaire (`lib/mediaLibrary.js:298-309`).

### PH-B4 — Photos d'élèves laissées sur disque après suppression du compte (RGPD)

- `lib/social/accountCleaners.js:12-45` supprime les lignes `forum_posts` et
  `context_comments` d'un élève, **pas les fichiers** `uploads/forum-posts/…` et
  `uploads/context-comments/…` — qui restent **publics** pour qui connaît l'URL.
- Idem pour les photos de rapports de tâche (`lib/tasks/accountCleaners.js:37`, famille privée).
- `scripts/reconcile-orphan-uploads.js:28` ne couvre que `zones/`, `task-logs/`,
  `observations/`, `students/`.

---

## 2. Constats moyens

| ID    | Constat                                                                                                                                                                                                                                                                                                                                       | Emplacement                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PH-M1 | **Pas de variantes de taille.** Vignettes serveur (sharp, 520 px) pour zones et repères seulement ; 0 `srcset` sur 44 photos. Originaux servis dans des tuiles de 52 à 88 px : catalogue plantes, biodiversité visite, catalogue espèces GL, médiathèque, observations, couvertures de tâches. Wikimedia chargé en original (pas de `NNNpx-`) | `lib/imageThumb.js:33-34`, `PlantCatalogTile.jsx:72`, `VisitBiodiversityPanel.jsx:53`, `GLSpeciesCatalog.jsx:35`, `MediaLibraryGalleryTile.jsx:45`, `TaskTileCard.jsx:250` |
| PH-M2 | **`AuthedImage` :** `fetch` au montage (le `loading="lazy"` transmis est sans effet), aucun cache entre composants, `return null` pendant le chargement et en erreur (saut de mise en page, échec muet), pas d'`AbortController`, jeton absent des dépendances                                                                                | `src/components/AuthedImage.jsx:8-39`                                                                                                                                      |
| PH-M3 | **`useAuthedHtmlImages` :** re-télécharge toutes les images à chaque frappe dans l'aperçu ; URL blob créées après le nettoyage de l'effet et jamais révoquées ; un seul échec réseau annule tout (`Promise.all`)                                                                                                                              | `src/hooks/useAuthedHtmlImages.js:38-65`                                                                                                                                   |
| PH-M4 | **Échap ferme toutes les fenêtres empilées** : une lightbox ouverte au-dessus d'un `DialogShell` ferme les deux (chaque fenêtre écoute `keydown` sur `document`, sans pile)                                                                                                                                                                   | `src/shared/platform/useDialogA11y.js:56-60,86`                                                                                                                            |
| PH-M5 | **Lightbox inaccessible au clavier** : ouverture uniquement au clic sur un `<img>` non focalisable, alors que le curseur loupe est posé partout ; focus rendu au `body` à la fermeture ; `aria-label` figé, légende lue deux fois ; pas de navigation entre images ni de zoom                                                                 | `motion.css:258`, `ImageLightbox.jsx:40-51`                                                                                                                                |
| PH-M6 | **Pièces jointes non compressées** : `AttachmentImagesPicker` lit le fichier brut en data URL (3 photos d'appareil ≈ 45 Mo de JSON, au-delà de la limite de 25 Mo) ; HEIC/AVIF écartés sans message                                                                                                                                           | `AttachmentImagesPicker.jsx:54-61,80,88`                                                                                                                                   |
| PH-M7 | **Bug de redimensionnement portrait** : `if (w > maxPx) … else if (h > maxPx)` — une photo 3000×4000 devient 1200×1600, le grand côté dépasse le plafond                                                                                                                                                                                      | `src/shared/platform/image.js:97-103`                                                                                                                                      |
| PH-M8 | **Images du Markdown hors relais** : pas de passage par `resolveExternalImageUrl`, donc le mode « local » (audit RGPD) est contourné ; pas de `loading`/`decoding` ; `<img>` vide laissé quand le `src` est refusé                                                                                                                            | `markdown.js:269-284`                                                                                                                                                      |
| PH-M9 | **Contrôle de contenu absent** pour les photos de rapports de tâche (élèves), zones, repères, carte, médias de visite : n'importe quels octets sous `.jpg` (servis `image/jpeg` + `nosniff`, donc pas de XSS). Forum GL : identifiants séquentiels → images `gl-forum-posts/<n>/0.jpg` publiques et énumérables                               | `tasks/assignments.js:388-390`, `entityPhotoRoutes.js:166-180`, `lib/shared/forumCore.js:92-93`                                                                            |

Aussi moyen : le service worker met les images en cache « d'abord » **sans limite ni durée
de vie**, et continue de servir une image privée dont l'accès a été révoqué
(`src/shared/pwa/swTemplate.js:101,236-242`).

---

## 3. Constats faibles (sélection)

- **Décalages de mise en page** : 1 photo sur 44 a `width`/`height` ; pas de boîte réservée pour
  `.task-card-cover`, `.log-image`, `.pedago-quiz__photo`, `.gl-qcm-modal__photo`, image
  principale d'une fiche plante.
- **Replis `onError`** : 4 sur 44. Bon modèle à généraliser : `PrefillPhotoCard.jsx:77-85`.
- **`decoding="async"`** : 14 sur 44 ; 7 `loading="lazy"` réellement manquants.
- **Textes alternatifs** : `alt="preview"` en anglais (`TaskLogModals.jsx:272`), `alt="rapport"`,
  `alt="Avatar"` redondant avec le nom affiché, repli sur `stableKey` technique
  (`GLChapterSceneDraftRow.jsx:31-37`), marque en dur `alt="Lycée Lyautey"`
  (`src/plan/components/PlanMapStage.jsx:40`) et `productLabel = 'ForetMap'`
  (`JournalBookView.jsx:74`) — contraires à la règle « marque jamais en dur ».
- **Cache HTTP** : images privées servies sans en-tête (`max-age=0` public par défaut) au lieu de
  `private, no-store` (`tasks/logs.js:75`, `user-journal.js:114`, `visit/media.js:98`,
  `tasks/media.js:45`) ; jamais `immutable` pour les noms horodatés.
- **Limites incohérentes** : `/api/tasks` plafonné à 2 Mo de JSON alors que l'image de tâche
  est autorisée à 4 Mo ; avatar 2 Mo décodés refusé en 413 générique.
- **Éditeur de cadre** : point focal 0 % impossible (`Number(v) || 50`,
  `ImageFrameEditor.jsx:105-106,119-120`) ; accents manquants dans les libellés.
- **Divers** : `fs.existsSync` par photo à chaque liste (`uploadsPublicUrls.js:97-98`) ; cache
  du relais Wikimedia jamais purgé ; fond `GLBrandHub.jsx:37` en `url()` sans guillemets ;
  bouton de suppression de `PhotoGallery` à 22 px (< 44 px).

---

## 4. Duplications à factoriser

1. Photo de QCM : `QcmQuestionPhoto` existe, mais `QuizView.jsx:252-267`,
   `GLQcmPopover.jsx:160-175`, `GLQcmModal.jsx:180-195` le recopient.
2. Vignette de galerie + lightbox : `PhotoGallery`, vignettes de visite, grille de
   `PlantMetaSections`, couverture de `TaskTileCard` → un composant `PhotoThumb`
   (bouton, `aria-label`, vignette/original via `data-lightbox-src`, lazy + async, repli,
   boîte réservée).
3. Tuile « photo ou emoji » : `PlantCatalogTile`, `VisitBiodiversityPanel`, tuile GL (un seul
   gère `onError`).
4. Chargement authentifié : `AuthedImage` et `useAuthedHtmlImages` → cache commun
   url → objectURL avec compteur de références.
5. Illustrations de chapitre et de feuillet GL (4 fois le même motif).

---

## 5. Ce qui va bien

- Retrait EXIF/GPS et correction d'orientation par sharp sur le point d'entrée commun
  (`lib/imageMetadata.js`), testé sur une vraie route (`tests/uploads-exif.test.js`).
- Garde de sortie du dossier `uploads/` (`assertInsideUploads`), noms générés côté serveur.
- SVG neutralisé au service (`sandbox` + `attachment`), `nosniff` global, relais Wikimedia
  à liste fermée avec revalidation des redirections.
- Aucune image en base64 en base ; les listes renvoient des URL.
- Compression côté navigateur avant envoi (hors pièces jointes).
- Lightbox : piège de focus, retour navigateur, blocage du défilement compté, bouton 44 px.
- Service worker de production cloisonné par compte, ne garde que les réponses `ok`.

---

## 6. Plan proposé

| Lot                     | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Tests à ajouter                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A (bloquants)**       | PH-B1 : autoriser `/api/user-journal/assets/\d+/file` dans le filtre, brancher l'image authentifiée dans `JournalArticleReadCard` / `JournalBookView` / `JournalReadModal`. PH-B2 : `data-lightbox-src` + suppression des lightbox locales mortes. PH-B3 : médiathèque via `writeBufferToDisk`, sortie de `SKIPPED_DIRS`. PH-B4 : suppression des fichiers forum / commentaires / rapports à la suppression d'un élève, extension de `reconcile-orphan-uploads` | enchaînement Markdown → `useAuthedHtmlImages` ; clic galerie → original ; EXIF médiathèque ; fichiers absents après suppression d'élève |
| **B (fiabilité)**       | Cache partagé + `AbortController` pour les images authentifiées (PH-M2/M3) ; pile d'Échap (PH-M4) ; compression des pièces jointes et correctif portrait (PH-M6/M7)                                                                                                                                                                                                                                                                                             | révocation des blobs ; Échap empilé ; ratio portrait ; HEIC refusé avec message                                                         |
| **C (performance)**     | Vignettes serveur généralisées (plantes, tâches, médiathèque, observations), vignettes Wikimedia `NNNpx-`, puis `srcset`/`sizes` ; composant `PhotoThumb`                                                                                                                                                                                                                                                                                                       | e2e poids des tuiles                                                                                                                    |
| **D (sécurité / RGPD)** | Signature binaire sur toutes les familles (PH-M9), UUID forum GL, relais des images Markdown (PH-M8), `private, no-store` sur images privées, borne du cache SW                                                                                                                                                                                                                                                                                                 | refus non-image ; en-têtes de cache                                                                                                     |
| **E (finitions)**       | Accessibilité clavier de la lightbox (PH-M5), textes alternatifs, marque en dur, éditeur de cadre, duplications                                                                                                                                                                                                                                                                                                                                                 | tests UI ciblés                                                                                                                         |
