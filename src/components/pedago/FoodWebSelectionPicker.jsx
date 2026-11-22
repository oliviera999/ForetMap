import { useId } from 'react';
import { IconClose } from '../../shared/icons.jsx';
import {
  NO_RELATION_TEXT,
  SELECTION_DEPTH_LABELS,
  selectionDepthChoices,
} from './foodWebSelectionModel.js';
import './foodWebView.css';

/** Puce à bascule d'une espèce candidate : un clic ajoute ou retire. */
function CandidateChip({ species, selected, onToggle }) {
  const notes = [
    species.outOfScope ? 'vit sur une autre carte' : '',
    species.links === 0 ? NO_RELATION_TEXT : '',
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        className={`pedago-chip-btn${species.featured ? ' pedago-foodweb__start-chip--featured' : ''}${species.outOfScope ? ' pedago-foodweb__start-chip--outside' : ''}${selected ? ' active' : ''}`}
        aria-pressed={selected}
        onClick={() => onToggle(species.id)}
      >
        {species.emoji ? <span aria-hidden="true">{species.emoji} </span> : null}
        {species.name}
        {notes.length ? (
          <span className="pedago-foodweb__chip-note"> — {notes.join(', ')}</span>
        ) : null}
      </button>
    </li>
  );
}

function CandidateList({ list, sel, label }) {
  if (!list.length) return null;
  return (
    <ul className="pedago-foodweb__start-list" aria-label={label}>
      {list.map((s) => (
        <CandidateChip key={s.id} species={s} selected={sel.has(s.id)} onToggle={sel.toggle} />
      ))}
    </ul>
  );
}

/** Champ de recherche partagé par le choix initial et la barre (« Ajouter une espèce »). */
function SelectionSearch({ sel, label }) {
  const id = useId();
  return (
    <label className="pedago-foodweb__start-search" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="search"
        className="form-input"
        value={sel.query}
        onChange={(e) => sel.setQuery(e.target.value)}
        placeholder="Nom de l’espèce"
        autoComplete="off"
      />
    </label>
  );
}

/**
 * Choix initial du réseau « collège » (chantier collège du 22/11/2026, lot 2 ; remplace
 * l'espèce de départ unique) : puces à bascule — un clic ajoute ou retire —, espèces phares de
 * la carte d'abord, puis recherche. Rendu tant que la sélection est vide.
 *
 * @param {{ sel: ReturnType<typeof import('../../hooks/useFoodWebSelection.js').useFoodWebSelection>,
 *   notice?: import('react').ReactNode }} props
 */
export function FoodWebSelectionPicker({ sel, notice = null }) {
  const titleId = useId();
  const { featured, others, query, candidates } = sel;
  return (
    <section className="card pedago-foodweb__start" aria-labelledby={titleId}>
      <h3 id={titleId} className="pedago-foodweb__start-title">
        Choisis les espèces à observer
      </h3>
      <p className="section-sub">
        Touche une ou plusieurs espèces : le réseau montre ce qu&apos;elles mangent, qui les mange
        et qui les aide. Touche-la de nouveau pour la retirer.
      </p>
      {notice}
      {candidates.length === 0 ? (
        <p className="section-sub">Aucune espèce n&apos;a encore de relation sur cette carte.</p>
      ) : (
        <>
          {featured.length > 0 ? (
            <>
              <h4 className="pedago-foodweb__start-subtitle">Espèces phares de la carte</h4>
              <CandidateList list={featured} sel={sel} label="Espèces phares de la carte" />
            </>
          ) : null}
          <SelectionSearch sel={sel} label="Chercher une espèce" />
          {others.length > 0 ? (
            <CandidateList list={others} sel={sel} label="Autres espèces" />
          ) : query ? (
            <p className="section-sub">Aucune espèce ne correspond à cette recherche.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Barre de sélection au-dessus du graphe et de la liste : une puce par espèce (bouton
 * « Retirer » accessible), « Tout retirer », « Ajouter une espèce » (même recherche) et la
 * profondeur. Le graphe se recompose à chaque changement, sans bouton « Valider ».
 *
 * @param {{ sel: ReturnType<typeof import('../../hooks/useFoodWebSelection.js').useFoodWebSelection>,
 *   speciesOf: (id: number) => { name: string, emoji: string }, extra?: import('react').ReactNode }} props
 */
export function FoodWebSelectionBar({ sel, speciesOf, extra = null }) {
  const choices = selectionDepthChoices(sel.selection.length);
  const matches = sel.query ? [...sel.featured, ...sel.others].slice(0, 8) : [];
  return (
    <div className="card pedago-foodweb__startbar pedago-foodweb__selbar">
      <div className="pedago-foodweb__selbar-row" role="group" aria-label="Ma sélection">
        <span className="pedago-foodweb__startbar-label">Ma sélection :</span>
        <ul className="pedago-foodweb__start-list">
          {sel.selection.map((id) => {
            const sp = speciesOf(id);
            const name = sp.name || 'Espèce';
            return (
              <li key={id} className="pedago-foodweb__selchip">
                {sp.emoji ? <span aria-hidden="true">{sp.emoji} </span> : null}
                <span>{name}</span>
                <button
                  type="button"
                  className="pedago-foodweb__selchip-remove"
                  onClick={() => sel.remove(id)}
                  aria-label={`Retirer ${name} de la sélection`}
                  title={`Retirer ${name}`}
                >
                  <IconClose size={12} />
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-secondary btn-sm" onClick={sel.clear}>
          Tout retirer
        </button>
        {extra}
      </div>
      <div className="pedago-foodweb__selbar-row" role="group" aria-label="Étendue du réseau">
        {choices.map((d) => (
          <button
            key={d}
            type="button"
            className={`pedago-chip-btn${sel.depth === d ? ' active' : ''}`}
            aria-pressed={sel.depth === d}
            onClick={() => sel.setDepth(d)}
          >
            {SELECTION_DEPTH_LABELS[d]}
          </button>
        ))}
      </div>
      <div className="pedago-foodweb__selbar-row">
        <SelectionSearch sel={sel} label="Ajouter une espèce" />
        {sel.query ? (
          matches.length ? (
            <CandidateList list={matches} sel={sel} label="Espèces trouvées" />
          ) : (
            <p className="section-sub">Aucune espèce ne correspond à cette recherche.</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Espèces de la sélection sans lien montré : on le **dit** (jamais de graphe vide muet).
 * - `absent` : aucune relation enregistrée dans cette carte ou cette zone ;
 * - `hidden` : des relations existent, hors de ce cadrage ou réservées au cycle 4.
 *
 * @param {{ statuses: { id: number, name: string, status: string }[], extra?: import('react').ReactNode }} props
 */
export function FoodWebSelectionNotice({ statuses, extra = null }) {
  if (!statuses.length) return null;
  const names = (list) => list.map((s) => (s.name ? `« ${s.name} »` : 'cette espèce')).join(', ');
  const hidden = statuses.filter((s) => s.status === 'hidden');
  const absent = statuses.filter((s) => s.status === 'absent');
  if (statuses.length === 1 && absent.length === 1) {
    return (
      <p className="pedago-foodweb__highlight-notice" role="status">
        {absent[0].name ? `« ${absent[0].name} » n’a` : 'L’espèce d’où tu viens n’a'} encore aucune
        interaction enregistrée dans cette sélection — élargis la carte ou la zone, ou demande à un
        professeur d’ajouter ses relations. {extra}
      </p>
    );
  }
  return (
    <p className="pedago-foodweb__highlight-notice" role="status">
      {absent.length ? (
        <>
          {names(absent)} : {NO_RELATION_TEXT} dans cette sélection.{' '}
        </>
      ) : null}
      {hidden.length ? (
        <>{names(hidden)} : ses relations ne sont pas dans ce cadrage ou à ton niveau. </>
      ) : null}
      {extra}
    </p>
  );
}
