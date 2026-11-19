import { useEffect, useState } from 'react';
import { normalizeMarkerEffects } from '../utils/glMarkerEventConfig.js';

/**
 * `passTurn` (branche neutre) et `unDeAuProchainTour` (case Souffle : un seul dé au tour suivant)
 * n'ont pas de contrôle dans ce formulaire : ils sont relus pour être réécrits tels quels. Sans
 * eux, ouvrir une case Souffle puis l'enregistrer lui retirait « un seul dé »
 * (audit des bugs G&L 2026-11-19, E2).
 */
function branchFromConfig(effects, key) {
  const src = effects?.[key] || {};
  return {
    label: src.label || '',
    deltaPv: Number(src.deltaPv) || 0,
    deltaGems: Number(src.deltaGems) || 0,
    deltaMove: Number(src.deltaMove) || 0,
    passTurn: Boolean(src.passTurn),
    unDeAuProchainTour: src.unDeAuProchainTour === true,
  };
}

function branchToConfig(branch) {
  return {
    label: branch.label || null,
    deltaPv: branch.deltaPv,
    deltaGems: branch.deltaGems,
    deltaMove: branch.deltaMove,
    passTurn: branch.passTurn,
    unDeAuProchainTour: branch.unDeAuProchainTour,
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
    neutral: branchToConfig(form.neutral),
    gnome: branchToConfig(form.gnome),
    unicorn: branchToConfig(form.unicorn),
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

  // Pas de recalage sur `eventConfig` : son identité change à chaque rechargement de la liste
  // des repères (donc après chaque enregistrement), ce qui écrasait le texte en cours de
  // frappe. L'appelant remonte l'éditeur (`key`) quand on change de repère.

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

export { formFromEventConfig, buildEffectsFromForm };
