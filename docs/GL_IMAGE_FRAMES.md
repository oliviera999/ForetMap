# GL — Cadres d'image configurables

## Objectif

Uniformiser le recadrage et les dimensions des images GL avec un modèle partagé, pour :

- la charte (`platform.brand.slots.*.frame`),
- les images markdown (`data-gl-frame`),
- les cartes de chapitre (`mapImageFrame`),
- l'avatar profil (recadrage 1:1 avant upload).

## Modèle partagé

Module : `lib/shared/glImageFrameCore.js` (source canonique partagée backend/frontend via `lib/glImageFrame.js` et `src/utils/glImageFrame.js`).

```js
{
  aspectRatio: 'auto' | '1/1' | '4/3' | '16/9' | '21/9',
  objectFit: 'cover' | 'contain',
  focalX: 0..100,
  focalY: 0..100,
  maxWidthPx: null | number,
  maxHeightPx: null | number,
  crop: null | { x, y, w, h } // normalisé 0..1
}
```

Contexte par défaut :

- `brand-hero`: `21/9`, `cover`
- `brand-card`: `4/3`, `cover`
- `brand-banner`: `16/9`, `cover`, `maxHeightPx=280`
- `markdown`: `auto`, `cover`
- `chapter-map`: `auto`, `contain`
- `avatar`: `1/1`, `cover`

## Charte GL

- Edition dans `GLSettingsView` via `GLBrandEditor`.
- Chaque slot (`hero`, `card_world`, `card_rules`, `card_spells`) possède `frame`.
- Persistance : `PUT /api/gl/admin/settings/platform.brand`.
- Validation serveur : `routes/gl/admin.js` normalise `platform.brand` et refuse un type invalide.

## Images markdown

- Insertion : `GLMarkdownImageInsert` ouvre `GLImageFrameEditor`, puis injecte :

```html
<img src="/uploads/..." alt="..." class="gl-content-image" data-gl-frame='{"aspectRatio":"16/9",...}' loading="lazy" />
```

- Sanitization : `renderMarkdownToSafeHtml` autorise `class`, `data-gl-frame`, `style`.
- `DOMPurify` recalcule un frame normalisé et applique le style sécurisé (`object-fit`, `object-position`, ratio, dimensions max).

## Cartes chapitre

- Migration : `migrations/091_gl_chapters_map_image_frame.sql` (`gl_chapters.map_image_frame_json`).
- API chapitres : lecture/écriture de `mapImageFrame` via `routes/gl/chapters.js`.
- UI : `GLChaptersAdminView` + `GLChapterMapEditor` appliquent le style d'image via `GLPctMapCanvas`.

## Avatar profil

- `GLProfileAvatar` applique un recadrage destructif 1:1 avant envoi.
- Le focus X/Y pilote le centre du crop carré.
- Le fichier final reste borné (max 2 Mo).

## Sécurité

- Aucune URL d'image externe non autorisée : seules `https://`, `/uploads/`, `/maps/`.
- `data-gl-frame` est toujours reparsé et normalisé avant rendu.
- Pas de style libre issu du markdown utilisateur : style reconstruit à partir d'un schéma borné.
