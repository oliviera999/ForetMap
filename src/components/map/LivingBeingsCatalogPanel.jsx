import { useEffect, useMemo, useState } from 'react';

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
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--fw-bold)',
  color: 'var(--ink-soft)',
  textTransform: 'uppercase',
  marginBottom: 4,
  marginTop: 10,
};

/**
 * Texte des remarques d'une fiche : le champ unique `remarks` (migration 305, déjà résolu par
 * le serveur, repli compris) ; à défaut (réponse d'un serveur antérieur), les trois anciens
 * champs mis bout à bout.
 */
export function plantRemarksText(plant) {
  if (!plant) return null;
  if (plant.remarks != null) return livingBeingCatalogText(plant.remarks);
  const parts = [plant.remark_1, plant.remark_2, plant.remark_3]
    .map(livingBeingCatalogText)
    .filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Bloc « Remarques » — même présentation partout (mission, zone, fiche biodiversité). Une
 * ligne vide sépare deux remarques (un paragraphe chacune).
 */
export function CatalogRemarksSection({ plant }) {
  const text = plantRemarksText(plant);
  if (!text) return null;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div>
      <div style={CATALOG_PANEL_LABEL_STYLE}>Remarques</div>
      {paragraphs.map((paragraph, idx) => (
        <p
          key={`remark-${idx}`}
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-soft)',
            lineHeight: 'var(--lh-normal)',
            margin: idx === 0 ? '0 0 4px' : '4px 0 0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * Mention « à chercher » d'une pastille d'espèce (collège : présence `documentaire` ou
 * `a_confirmer` sur la carte). `toSearchNames` absent : rien.
 */
function ToSearchMention({ name, toSearchNames }) {
  if (!(toSearchNames instanceof Set) || !toSearchNames.has(name)) return null;
  return <span className="zone-species-to-search">à chercher</span>;
}

function toSearchSuffix(name, toSearchNames) {
  return toSearchNames instanceof Set && toSearchNames.has(name) ? ', à chercher' : '';
}

/** Liste d'êtres vivants cliquable + extrait catalogue (description, rôle, utilité, remarques). */
export function LivingBeingsCatalogPanel({ plants, names, showHeading = true, toSearchNames }) {
  const list = useMemo(() => names || [], [names]);
  const listKey = list.join('\u0001');
  const [selectedName, setSelectedName] = useState(() => list[0] || null);

  useEffect(() => {
    if (!list.length) {
      setSelectedName(null);
      return;
    }
    setSelectedName((prev) => (prev && list.includes(prev) ? prev : list[0]));
    // `listKey` porte le contenu de `list` : l'appelant passe souvent un tableau neuf à chaque
    // rendu (même contenu), qui ne doit pas réinitialiser la sélection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-bold)',
            color: 'var(--ink-soft)',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          Êtres vivants
        </div>
      )}
      <p
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-soft)',
          margin: '0 0 8px',
          lineHeight: 'var(--lh-normal)',
        }}
      >
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
                fontWeight: 'var(--fw-medium)',
                border: isSel ? '2px solid var(--forest)' : '1px solid rgba(0,0,0,.12)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: isSel ? 'rgba(26, 71, 49, 0.08)' : undefined,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
              <ToSearchMention name={name} toSearchNames={toSearchNames} />
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
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--ink-warning)',
                margin: 0,
                lineHeight: 'var(--lh-normal)',
              }}
            >
              Aucune fiche catalogue ne correspond à «{selectedName}
              ». Un professeur peut mettre à jour la base biodiversité.
            </p>
          ) : (
            <>
              <div>
                <div style={{ ...labelStyle, marginTop: 0 }}>Description</div>
                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: desc ? '#555' : 'var(--ink-dim)',
                    lineHeight: 'var(--lh-normal)',
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
                    fontSize: 'var(--text-sm)',
                    color: role ? '#555' : 'var(--ink-dim)',
                    lineHeight: 'var(--lh-normal)',
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
                    fontSize: 'var(--text-sm)',
                    color: utility ? '#555' : 'var(--ink-dim)',
                    lineHeight: 'var(--lh-normal)',
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
  toSearchNames,
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
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-bold)',
            color: 'var(--ink-soft)',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {sectionTitle || 'Êtres vivants'}
        </div>
      )}
      <p
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-soft)',
          margin: '0 0 8px',
          lineHeight: 'var(--lh-normal)',
        }}
      >
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
                plant
                  ? `Ouvrir la fiche biodiversité : ${name}${toSearchSuffix(name, toSearchNames)}`
                  : `Aucune fiche pour : ${name}`
              }
              onClick={() => plant && canOpen && onOpenPlant(plant.id)}
              style={{
                fontWeight: 'var(--fw-medium)',
                border:
                  plant && canOpen ? '1px solid rgba(0,0,0,.12)' : '1px solid rgba(0,0,0,.08)',
                cursor: plant && canOpen ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: plant && canOpen ? 1 : 0.65,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
              <ToSearchMention name={name} toSearchNames={toSearchNames} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
