import React, { useEffect, useMemo, useState } from 'react';

/** Emoji catalogue plantes pour un nom d'être vivant (fiches Info zone/repère). */
export function livingBeingEmoji(plants, name) {
  const p = (plants || []).find((x) => x.name === name);
  return p?.emoji || '🌱';
}

export function livingBeingCatalogText(value) {
  const t = String(value ?? '').trim();
  return t.length ? t : null;
}

const CATALOG_PANEL_LABEL_STYLE = {
  fontSize: '.72rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  marginBottom: 4,
  marginTop: 10,
};

/**
 * Bloc « Remarques » (3 champs catalogue) — même présentation partout (mission, zone, fiche biodiversité).
 */
export function CatalogRemarksSection({ plant }) {
  if (!plant) return null;
  const remark1 = livingBeingCatalogText(plant.remark_1);
  const remark2 = livingBeingCatalogText(plant.remark_2);
  const remark3 = livingBeingCatalogText(plant.remark_3);
  const remarkLines = [remark1, remark2, remark3];
  const hasAnyRemark = remarkLines.some(Boolean);
  if (!hasAnyRemark) return null;
  return (
    <div>
      <div style={CATALOG_PANEL_LABEL_STYLE}>Remarques</div>
      {remarkLines.map((text, idx) => (
        <p
          key={`remark-${idx}`}
          style={{
            fontSize: '.83rem',
            color: text ? '#555' : '#94a3b8',
            lineHeight: 1.5,
            margin: idx === 0 ? '0 0 4px' : '4px 0 0',
            whiteSpace: 'pre-wrap',
            fontStyle: text ? 'normal' : 'italic',
          }}
        >
          {text || '—'}
        </p>
      ))}
    </div>
  );
}

/** Liste d'êtres vivants cliquable + extrait catalogue (description, rôle, utilité, remarques). */
export function LivingBeingsCatalogPanel({ plants, names, showHeading = true }) {
  const list = names || [];
  const listKey = useMemo(() => list.join('\u0001'), [list]);
  const [selectedName, setSelectedName] = useState(() => list[0] || null);

  useEffect(() => {
    if (!list.length) {
      setSelectedName(null);
      return;
    }
    setSelectedName((prev) => (prev && list.includes(prev) ? prev : list[0]));
  }, [listKey]);

  if (!list.length) return null;

  const selectedPlant = selectedName ? (plants || []).find((p) => p.name === selectedName) : null;
  const desc = selectedPlant ? livingBeingCatalogText(selectedPlant.description) : null;
  const role = selectedPlant ? livingBeingCatalogText(selectedPlant.ecosystem_role) : null;
  const utility = selectedPlant ? livingBeingCatalogText(selectedPlant.human_utility) : null;
  const labelStyle = {
    ...CATALOG_PANEL_LABEL_STYLE,
  };

  return (
    <div
      style={{
        background: 'var(--parchment)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 12,
        border: '1px solid rgba(0,0,0,.06)',
      }}
    >
      {showHeading && (
        <div
          style={{
            fontSize: '.78rem',
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          Êtres vivants
        </div>
      )}
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
        Touche ou clique un nom pour afficher la fiche du catalogue (description, rôle, utilité,
        remarques).
      </p>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        role="group"
        aria-label="Sélection d'un être vivant pour la fiche catalogue"
      >
        {list.map((name) => {
          const isSel = selectedName === name;
          return (
            <button
              type="button"
              key={name}
              className="task-chip living-being-catalog-chip"
              aria-pressed={isSel}
              onClick={() => setSelectedName(name)}
              style={{
                fontWeight: 500,
                border: isSel ? '2px solid var(--forest)' : '1px solid rgba(0,0,0,.12)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: isSel ? 'rgba(26, 71, 49, 0.08)' : undefined,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
            </button>
          );
        })}
      </div>
      {selectedName && (
        <div
          style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,.08)' }}
          role="region"
          aria-live="polite"
          aria-label={`Fiche catalogue : ${selectedName}`}
        >
          {!selectedPlant ? (
            <p style={{ fontSize: '.83rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
              Aucune fiche catalogue ne correspond à «{selectedName}
              ». Un professeur peut mettre à jour la base biodiversité.
            </p>
          ) : (
            <>
              <div>
                <div style={{ ...labelStyle, marginTop: 0 }}>Description</div>
                <p
                  style={{
                    fontSize: '.83rem',
                    color: desc ? '#555' : '#94a3b8',
                    lineHeight: 1.5,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontStyle: desc ? 'normal' : 'italic',
                  }}
                >
                  {desc || 'Non renseigné'}
                </p>
              </div>
              <div>
                <div style={labelStyle}>Rôle dans l&apos;écosystème</div>
                <p
                  style={{
                    fontSize: '.83rem',
                    color: role ? '#555' : '#94a3b8',
                    lineHeight: 1.5,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontStyle: role ? 'normal' : 'italic',
                  }}
                >
                  {role || 'Non renseigné'}
                </p>
              </div>
              <div>
                <div style={labelStyle}>Utilité pour l&apos;être humain</div>
                <p
                  style={{
                    fontSize: '.83rem',
                    color: utility ? '#555' : '#94a3b8',
                    lineHeight: 1.5,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontStyle: utility ? 'normal' : 'italic',
                  }}
                >
                  {utility || 'Non renseigné'}
                </p>
              </div>
              <CatalogRemarksSection plant={selectedPlant} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Boutons espèces : ouvre la même fiche que l'onglet « Biodiversité » (via callback parent). */
export function BiodiversitySpeciesOpenLinks({
  plants,
  names,
  showHeading = true,
  sectionTitle = null,
  onOpenPlant,
}) {
  const raw = names || [];
  const list = [];
  const seen = new Set();
  for (const n of raw) {
    const s = String(n || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    list.push(s);
  }
  if (!list.length) return null;
  const canOpen = typeof onOpenPlant === 'function';

  return (
    <div
      style={{
        background: 'var(--parchment)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 12,
        border: '1px solid rgba(0,0,0,.06)',
      }}
    >
      {showHeading && (
        <div
          style={{
            fontSize: '.78rem',
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {sectionTitle || 'Êtres vivants'}
        </div>
      )}
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
        Affiche la fiche catalogue dans une fenêtre (comme pour les tutoriels).
      </p>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        role="group"
        aria-label="Espèces liées — ouvrir le catalogue biodiversité"
      >
        {list.map((name) => {
          const plant = (plants || []).find((p) => String(p?.name || '').trim() === name);
          const disabled = !canOpen || !plant?.id;
          return (
            <button
              type="button"
              key={name}
              className="task-chip living-being-catalog-chip"
              disabled={disabled}
              title={
                !plant
                  ? 'Pas de fiche catalogue pour ce nom — un prof peut compléter la biodiversité.'
                  : undefined
              }
              aria-label={
                plant ? `Ouvrir la fiche biodiversité : ${name}` : `Aucune fiche pour : ${name}`
              }
              onClick={() => plant && canOpen && onOpenPlant(plant.id)}
              style={{
                fontWeight: 500,
                border:
                  plant && canOpen ? '1px solid rgba(0,0,0,.12)' : '1px solid rgba(0,0,0,.08)',
                cursor: plant && canOpen ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: plant && canOpen ? 1 : 0.65,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
