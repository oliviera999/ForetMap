import React, { useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLBrandHub } from './GLBrandHub.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLImageSourceField } from './GLImageSourceField.jsx';
import { GLImageFrameEditor } from './GLImageFrameEditor.jsx';
import { normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { normalizeBrand } from '../hooks/useGLBrandTheme.js';
import { compressImage, isLikelyImageFile } from '../../utils/image.js';
import { GLBrandColorEditor } from './GLBrandColorEditor.jsx';

const SLOT_DEFS = [
  { id: 'hero', label: 'Hero', context: 'brand-hero', hasSubtitle: true },
  { id: 'card_world', label: 'Carte Monde', context: 'brand-card', hasSubtitle: false },
  { id: 'card_rules', label: 'Carte Regles', context: 'brand-card', hasSubtitle: false },
  { id: 'card_spells', label: 'Carte Sortileges', context: 'brand-card', hasSubtitle: false },
];

export function GLBrandEditor({ value, onChange, onStatus, disabled = false }) {
  const [editingSlotId, setEditingSlotId] = useState('');
  const brand = useMemo(() => {
    const source = value && typeof value === 'object' ? value : {};
    const srcSlots = source?.slots && typeof source.slots === 'object' ? source.slots : {};
    return {
      ...source,
      colors: normalizeBrand(source).colors,
      slots: {
        hero: {
          imageUrl: String(srcSlots?.hero?.imageUrl || '').trim(),
          title: String(srcSlots?.hero?.title || '').trim(),
          subtitle: String(srcSlots?.hero?.subtitle || '').trim(),
          frame: normalizeGlImageFrame(srcSlots?.hero?.frame, 'brand-hero'),
        },
        card_world: {
          imageUrl: String(srcSlots?.card_world?.imageUrl || '').trim(),
          title: String(srcSlots?.card_world?.title || 'Un monde').trim(),
          tab: 'world',
          frame: normalizeGlImageFrame(srcSlots?.card_world?.frame, 'brand-card'),
        },
        card_rules: {
          imageUrl: String(srcSlots?.card_rules?.imageUrl || '').trim(),
          title: String(srcSlots?.card_rules?.title || 'Les règles du jeu').trim(),
          tab: 'rules',
          frame: normalizeGlImageFrame(srcSlots?.card_rules?.frame, 'brand-card'),
        },
        card_spells: {
          imageUrl: String(srcSlots?.card_spells?.imageUrl || '').trim(),
          title: String(srcSlots?.card_spells?.title || 'Les sortilèges').trim(),
          tab: 'spells',
          frame: normalizeGlImageFrame(srcSlots?.card_spells?.frame, 'brand-card'),
        },
      },
    };
  }, [value]);
  const slot = editingSlotId ? brand?.slots?.[editingSlotId] : null;
  const slotDef = SLOT_DEFS.find((item) => item.id === editingSlotId) || null;

  async function uploadAsMedia(file, slotId) {
    if (!file || !isLikelyImageFile(file)) {
      onStatus?.('Format image non reconnu (JPEG, PNG ou WebP).', true);
      return;
    }
    try {
      const mediaData = await compressImage(file, 2400, 0.9);
      const saved = await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
      const url = String(saved?.url || '').trim();
      if (!url) throw new Error('URL media manquante apres import');
      onChange?.((prev) => ({
        ...prev,
        slots: {
          ...(prev?.slots || {}),
          [slotId]: {
            ...(prev?.slots?.[slotId] || {}),
            imageUrl: url,
          },
        },
      }));
      onStatus?.('Image de charte importee.');
    } catch (err) {
      onStatus?.(err.message || 'Import impossible', true);
    }
  }

  function patchSlot(slotId, patch) {
    onChange?.((prev) => ({
      ...prev,
      slots: {
        ...(prev?.slots || {}),
        [slotId]: {
          ...(prev?.slots?.[slotId] || {}),
          ...patch,
        },
      },
    }));
  }

  return (
    <section className="gl-form">
      <h3>Charte visuelle GL</h3>
      <p className="gl-hint">
        Ajustez les couleurs, les images hero/cartes, puis recadrez chaque slot selon votre besoin.
      </p>

      <h4>Couleurs de la charte</h4>
      <GLBrandColorEditor
        value={brand.colors}
        disabled={disabled}
        onChange={(updater) => {
          onChange?.((prev) => {
            const prevBrand = normalizeBrand(prev);
            const nextColors = typeof updater === 'function' ? updater(prevBrand.colors) : updater;
            return { ...prevBrand, colors: nextColors };
          });
        }}
      />

      <div className="gl-brand-editor-grid">
        {SLOT_DEFS.map((def) => {
          const current = brand?.slots?.[def.id] || {};
          return (
            <div key={def.id} className="gl-brand-editor-card">
              <h4>{def.label}</h4>
              <GLField label="Titre">
                <GLInput
                  value={String(current.title || '')}
                  disabled={disabled}
                  onChange={(event) => patchSlot(def.id, { title: event.target.value })}
                />
              </GLField>
              {def.hasSubtitle ? (
                <GLField label="Sous-titre">
                  <GLInput
                    value={String(current.subtitle || '')}
                    disabled={disabled}
                    onChange={(event) => patchSlot(def.id, { subtitle: event.target.value })}
                  />
                </GLField>
              ) : null}
              <GLImageSourceField
                label="Image"
                url={String(current.imageUrl || '')}
                onUrlChange={(nextUrl) => patchSlot(def.id, { imageUrl: nextUrl })}
                onPickFile={(file) => uploadAsMedia(file, def.id)}
                filePickDisabled={disabled}
              />
              <div className="gl-inline-actions">
                <GLButton
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setEditingSlotId(def.id)}
                >
                  Ajuster le cadre
                </GLButton>
              </div>
            </div>
          );
        })}
      </div>

      <GLBrandHub slots={brand.slots} compact />

      <GLImageFrameEditor
        open={Boolean(slotDef)}
        title={slotDef ? `Cadre image - ${slotDef.label}` : 'Cadre image'}
        context={slotDef?.context || 'brand-card'}
        imageUrl={String(slot?.imageUrl || '')}
        initialFrame={slot?.frame || normalizeGlImageFrame(null, slotDef?.context || 'brand-card')}
        onApply={({ frame }) => {
          if (slotDef) patchSlot(slotDef.id, { frame });
          setEditingSlotId('');
        }}
        onClose={() => setEditingSlotId('')}
      />
    </section>
  );
}
