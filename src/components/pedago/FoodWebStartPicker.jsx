import { useId } from 'react';
import './foodWebView.css';
import { FOCUS_DEPTH_LABELS, FOCUS_DEPTH_TITLES } from './foodWebGraphModel.js';
import { focusDepthChoices } from './foodWebProfileModel.js';

function StartChip({ species, onPick }) {
  return (
    <li>
      <button
        type="button"
        className={`pedago-chip-btn${species.featured ? ' pedago-foodweb__start-chip--featured' : ''}`}
        onClick={() => onPick(species.id)}
      >
        {species.emoji ? `${species.emoji} ` : ''}
        {species.name}
      </button>
    </li>
  );
}

/**
 * Choix de l'espèce de départ du réseau « collège » (flux C3) : les espèces phares de la
 * carte d'abord, puis une recherche. Rendu à la place du graphe tant qu'aucune espèce n'est
 * choisie : au collège, pas de réseau complet par défaut.
 *
 * @param {{ start: ReturnType<typeof import('../../hooks/useFoodWebStartSpecies.js').useFoodWebStartSpecies>,
 *   onPick: (id: number) => void, notice?: import('react').ReactNode }} props
 */
export function FoodWebStartPicker({ start, onPick, notice = null }) {
  const searchId = useId();
  const { featured, others, query, setQuery, candidates } = start;
  return (
    <section className="card pedago-foodweb__start" aria-labelledby={`${searchId}-title`}>
      <h3 id={`${searchId}-title`} className="pedago-foodweb__start-title">
        Choisis une espèce de départ
      </h3>
      <p className="section-sub">
        Le réseau s&apos;ouvre sur ses voisins : ce qu&apos;elle mange, qui la mange, qui
        l&apos;aide. Tu pourras ensuite élargir à la chaîne.
      </p>
      {notice}
      {candidates.length === 0 ? (
        <p className="section-sub">Aucune espèce n&apos;a encore de relation sur cette carte.</p>
      ) : (
        <>
          {featured.length > 0 ? (
            <>
              <h4 className="pedago-foodweb__start-subtitle">Espèces phares de la carte</h4>
              <ul className="pedago-foodweb__start-list">
                {featured.map((s) => (
                  <StartChip key={s.id} species={s} onPick={onPick} />
                ))}
              </ul>
            </>
          ) : null}
          <label className="pedago-foodweb__start-search" htmlFor={searchId}>
            <span>Chercher une espèce</span>
            <input
              id={searchId}
              type="search"
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom de l’espèce"
              autoComplete="off"
            />
          </label>
          {others.length > 0 ? (
            <ul className="pedago-foodweb__start-list" aria-label="Autres espèces">
              {others.map((s) => (
                <StartChip key={s.id} species={s} onPick={onPick} />
              ))}
            </ul>
          ) : query ? (
            <p className="section-sub">Aucune espèce ne correspond à cette recherche.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Barre du réseau « collège » une fois l'espèce choisie : rappel du départ, profondeur
 * (voisins, chaîne ; « sélection » pour plusieurs espèces d'une séance) et retour au choix.
 */
export function FoodWebStartBar({ seeds, depth, depths, onDepthChange, onReset, nameOf }) {
  const choices = focusDepthChoices(depths, seeds.length);
  const label =
    seeds.length === 1 ? nameOf(seeds[0]) || 'Espèce choisie' : `${seeds.length} espèces choisies`;
  return (
    <div className="card pedago-foodweb__startbar" role="group" aria-label="Espèce de départ">
      <span className="pedago-foodweb__startbar-label">
        Départ : <strong>{label}</strong>
      </span>
      {choices.map((d) => (
        <button
          key={d}
          type="button"
          className={`pedago-chip-btn${depth === d ? ' active' : ''}`}
          aria-pressed={depth === d}
          title={FOCUS_DEPTH_TITLES[d]}
          onClick={() => onDepthChange(d)}
        >
          {FOCUS_DEPTH_LABELS[d]}
        </button>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
        Changer d&apos;espèce
      </button>
    </div>
  );
}
