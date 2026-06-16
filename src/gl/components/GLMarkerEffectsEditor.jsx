import React, { useEffect, useState } from 'react';
import { normalizeMarkerEffects } from '../../utils/glMarkerEventConfig.js';

const EMPTY_BRANCH = {
  label: '',
  deltaPv: 0,
  deltaGems: 0,
  deltaMove: 0,
  passTurn: false,
};

function branchFromConfig(effects, key) {
  const src = effects?.[key] || {};
  return {
    label: src.label || '',
    deltaPv: Number(src.deltaPv) || 0,
    deltaGems: Number(src.deltaGems) || 0,
    deltaMove: Number(src.deltaMove) || 0,
    passTurn: Boolean(src.passTurn),
  };
}

function formFromEventConfig(eventConfig) {
  const effects = eventConfig?.effects || {};
  const meta = eventConfig?.eventMeta || {};
  return {
    neutral: branchFromConfig(effects, 'neutral'),
    gnome: branchFromConfig(effects, 'gnome'),
    unicorn: branchFromConfig(effects, 'unicorn'),
    tonalite: meta.tonalite || '',
    rarete: meta.rarete || '',
  };
}

function buildEffectsFromForm(form) {
  return normalizeMarkerEffects({
    neutral: {
      deltaPv: form.neutral.deltaPv,
      deltaGems: form.neutral.deltaGems,
      deltaMove: form.neutral.deltaMove,
    },
    gnome: {
      label: form.gnome.label || null,
      deltaPv: form.gnome.deltaPv,
      deltaGems: form.gnome.deltaGems,
      deltaMove: form.gnome.deltaMove,
      passTurn: form.gnome.passTurn,
    },
    unicorn: {
      label: form.unicorn.label || null,
      deltaPv: form.unicorn.deltaPv,
      deltaGems: form.unicorn.deltaGems,
      deltaMove: form.unicorn.deltaMove,
      passTurn: form.unicorn.passTurn,
    },
  });
}

function BranchFields({ title, branchKey, form, onPatch }) {
  const branch = form[branchKey];
  return (
    <fieldset className="gl-marker-effects-branch">
      <legend>{title}</legend>
      {branchKey !== 'neutral' ? (
        <label>
          Texte d&apos;effet
          <textarea
            rows={2}
            value={branch.label}
            onChange={(event) => onPatch(branchKey, { label: event.target.value })}
          />
        </label>
      ) : null}
      <div className="gl-marker-effects-deltas">
        <label>
          Δ cœurs
          <input
            type="number"
            min="-99"
            max="99"
            value={branch.deltaPv}
            onChange={(event) => onPatch(branchKey, { deltaPv: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          Δ gemmes
          <input
            type="number"
            min="-99"
            max="99"
            value={branch.deltaGems}
            onChange={(event) => onPatch(branchKey, { deltaGems: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          Δ cases
          <input
            type="number"
            min="-99"
            max="99"
            value={branch.deltaMove}
            onChange={(event) => onPatch(branchKey, { deltaMove: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
      {branchKey !== 'neutral' ? (
        <label>
          <input
            type="checkbox"
            checked={branch.passTurn}
            onChange={(event) => onPatch(branchKey, { passTurn: event.target.checked })}
          />
          Passe le tour
        </label>
      ) : null}
    </fieldset>
  );
}

export function GLMarkerEffectsEditor({ eventConfig, onChange }) {
  const [form, setForm] = useState(() => formFromEventConfig(eventConfig));

  useEffect(() => {
    setForm(formFromEventConfig(eventConfig));
  }, [eventConfig]);

  useEffect(() => {
    const effects = buildEffectsFromForm(form);
    const eventMeta =
      form.tonalite || form.rarete
        ? { tonalite: form.tonalite || null, rarete: form.rarete || null }
        : null;
    onChange?.({ effects, eventMeta });
  }, [form, onChange]);

  function patchBranch(key, patch) {
    setForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  return (
    <div className="gl-marker-effects-editor">
      <BranchFields
        title="Effet neutre (deltas communs)"
        branchKey="neutral"
        form={form}
        onPatch={patchBranch}
      />
      <BranchFields title="Effet Gnome" branchKey="gnome" form={form} onPatch={patchBranch} />
      <BranchFields title="Effet Licorne" branchKey="unicorn" form={form} onPatch={patchBranch} />
      <div className="gl-marker-effects-meta">
        <label>
          Tonalité (optionnel)
          <input
            value={form.tonalite}
            onChange={(event) => setForm((prev) => ({ ...prev, tonalite: event.target.value }))}
            placeholder="positif, negatif, neutre…"
          />
        </label>
        <label>
          Rareté (optionnel)
          <input
            value={form.rarete}
            onChange={(event) => setForm((prev) => ({ ...prev, rarete: event.target.value }))}
            placeholder="commun, rare…"
          />
        </label>
      </div>
    </div>
  );
}

export { EMPTY_BRANCH, formFromEventConfig, buildEffectsFromForm };
