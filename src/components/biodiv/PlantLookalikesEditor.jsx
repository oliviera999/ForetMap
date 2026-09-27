import { useId, useMemo } from 'react';
import { useData } from '../../contexts/DataContext.jsx';

const TOUCH = { minHeight: 44 };

/**
 * Sosies d'une fiche dans le formulaire — « ne pas confondre avec… » (migration 305,
 * `plant_lookalikes` ; piste C de l'audit du 25/09/2026, § 1.3.6).
 *
 * Une ligne par sosie : la fiche du catalogue qui ressemble, et le critère qui permet de les
 * distinguer. La paire vaut dans les deux sens : ajoutée ici, elle apparaît aussi sur la fiche
 * du sosie. Une espèce absente du catalogue se décrit dans « Confusions possibles ».
 *
 * @param {object} props
 * @param {Array<{ plant_id: number|string, note?: string }>} props.lookalikes
 * @param {(next: Array<object>) => void} props.onChange
 * @param {number|string|null} props.plantId fiche éditée (exclue du choix)
 */
export function PlantLookalikesEditor({ lookalikes = [], onChange, plantId = null }) {
  const uid = useId();
  const { plants = [] } = useData();
  const list = Array.isArray(lookalikes) ? lookalikes : [];
  const options = useMemo(
    () =>
      (Array.isArray(plants) ? plants : [])
        .filter((p) => p && p.id != null && String(p.id) !== String(plantId ?? ''))
        .map((p) => ({ id: String(p.id), label: `${p.emoji ? `${p.emoji} ` : ''}${p.name}` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })),
    [plants, plantId],
  );

  const updateAt = (index, patch) =>
    onChange(list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const removeAt = (index) => onChange(list.filter((_, i) => i !== index));

  return (
    <div className="plant-lookalikes-editor">
      {list.length === 0 ? (
        <p className="section-sub" style={{ margin: '0 0 6px' }}>
          Aucun sosie renseigné.
        </p>
      ) : null}
      {list.map((entry, index) => {
        const base = `${uid}-${index}`;
        const position = `sosie ${index + 1}`;
        const chosen = String(entry.plant_id ?? '');
        const known = options.some((o) => o.id === chosen);
        return (
          <div
            key={base}
            className="plant-lookalikes-editor__entry"
            style={{ display: 'grid', gap: 6, marginBottom: 10 }}
          >
            <label htmlFor={`${base}-plant`}>Ne pas confondre avec</label>
            <select
              id={`${base}-plant`}
              aria-label={`Ne pas confondre avec — ${position}`}
              value={chosen}
              style={TOUCH}
              onChange={(e) => updateAt(index, { plant_id: e.target.value })}
            >
              <option value="">— choisir une fiche</option>
              {!known && chosen ? (
                <option value={chosen}>{entry.name || `Fiche ${chosen}`}</option>
              ) : null}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <label htmlFor={`${base}-note`}>Ce qui permet de les distinguer</label>
            <input
              id={`${base}-note`}
              aria-label={`Ce qui permet de les distinguer — ${position}`}
              value={entry.note || ''}
              maxLength={500}
              onChange={(e) => updateAt(index, { note: e.target.value })}
              placeholder="Ex. : latex blanc amer, nervure épineuse"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={TOUCH}
              onClick={() => removeAt(index)}
              aria-label={`Retirer — ${position}`}
            >
              Retirer
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={TOUCH}
        onClick={() => onChange([...list, { plant_id: '', note: '' }])}
      >
        + Ajouter un sosie
      </button>
    </div>
  );
}
