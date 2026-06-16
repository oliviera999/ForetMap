import React from 'react';

/**
 * Badge (présentation) indiquant la source d'un champ proposé par la pré-saisie — extrait de
 * `PlantPrefillPanel` (O6). Affiche « 🧠 OpenAI » pour les sources OpenAI (`openai`/`openai_gap`)
 * ou « 🔎 <source> » sinon. Ne rend rien quand aucune source n'est fournie. Composant pur, sans
 * état : toute la logique de sélection reste gérée par le parent.
 *
 * @param {object} props
 * @param {{ source?: string }} [props.sourceMeta] métadonnées du champ (clé `source`)
 */
export function PrefillSourceBadge({ sourceMeta }) {
  const src = String(sourceMeta?.source || '')
    .trim()
    .toLowerCase();
  if (!src) return null;
  const isOpenAi = src === 'openai' || src === 'openai_gap';
  const label = isOpenAi ? '🧠 OpenAI' : `🔎 ${src}`;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: '.72rem',
        lineHeight: 1.5,
        fontWeight: 600,
        background: isOpenAi ? '#ede9fe' : '#ecfeff',
        color: isOpenAi ? '#5b21b6' : '#155e75',
        border: `1px solid ${isOpenAi ? '#c4b5fd' : '#a5f3fc'}`,
      }}
      title={
        isOpenAi
          ? 'Champ proposé par OpenAI à partir du contexte multi-sources'
          : `Champ proposé par la source ${src}`
      }
    >
      {label}
    </span>
  );
}
