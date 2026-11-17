/**
 * Écran d'arrivée d'une clé d'identification : espèce, groupe d'espèces ou grand groupe
 * (migration 366), avec le renvoi éventuel « Pour aller plus loin » vers une autre clé.
 */

/** Arrivée normalisée à partir d'une proposition terminale choisie par l'élève. */
export function arrivalFromLead(lead, outcome) {
  return {
    outcome,
    plant:
      outcome === 'espece'
        ? { id: lead.plant_id, name: lead.plant_name, emoji: lead.plant_emoji }
        : null,
    label: lead.result_label || null,
    groupPlants: Array.isArray(lead.group_plants) ? lead.group_plants : [],
    clade: lead.clade || (lead.clade_id ? { id: lead.clade_id, name: lead.clade_id } : null),
    nextKey: lead.next_key || null,
  };
}

const TITLES = {
  espece: 'Espèce identifiée',
  groupe: 'Groupe identifié',
  clade: 'Grand groupe identifié',
};

export function IdKeyArrival({ arrival, onOpenPlant, onOpenKey }) {
  const { outcome, plant, label, groupPlants, clade, nextKey } = arrival;
  return (
    <div className="id-key-arrival">
      <p className="form-success">{TITLES[outcome] || 'Résultat'}</p>

      {outcome === 'espece' && plant ? (
        <button type="button" className="btn btn-primary" onClick={() => onOpenPlant?.(plant.id)}>
          {plant.emoji ? `${plant.emoji} ` : ''}
          {plant.name || `Fiche #${plant.id}`}
        </button>
      ) : null}

      {outcome === 'groupe' ? (
        <>
          <h4 className="id-key-arrival__title">{label}</h4>
          {clade?.name ? <p className="muted">Grand groupe : {clade.name}</p> : null}
          {groupPlants.length > 1 ? (
            <p>
              La clé s’arrête ici : ces espèces se ressemblent trop pour être séparées sans
              matériel. Compare leurs fiches.
            </p>
          ) : null}
          <ul className="id-key-arrival__plants">
            {groupPlants.map((p) => (
              <li key={p.id}>
                <button type="button" className="btn" onClick={() => onOpenPlant?.(p.id)}>
                  {p.emoji ? `${p.emoji} ` : ''}
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {outcome === 'clade' && clade ? (
        <>
          <h4 className="id-key-arrival__title">{clade.name}</h4>
          {clade.shared_attribute ? <p>Point commun : {clade.shared_attribute}</p> : null}
          {clade.description ? <p className="muted">{clade.description}</p> : null}
        </>
      ) : null}

      {nextKey ? (
        <div className="id-key-arrival__next">
          <strong>Pour aller plus loin :</strong>{' '}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onOpenKey?.(nextKey.slug || nextKey.id)}
          >
            {nextKey.title}
          </button>
        </div>
      ) : null}
    </div>
  );
}
