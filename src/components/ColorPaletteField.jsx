import { ZONE_COLORS } from '../constants/garden';
import { applyPickedHexColor, colorPickerValue } from '../utils/hexColorWithAlpha.js';

/**
 * Champ « Couleur » commun aux zones et aux catégories de zones/repères.
 *
 * Un seul et même choix partout : la palette prédéfinie (`ZONE_COLORS`), la pastille
 * de sélection du système et la saisie hexadécimale directe. Les couleurs sont
 * stockées en `#rrggbb` ou `#rrggbbaa` — les deux derniers caractères règlent la
 * transparence, conservée par le sélecteur (cf. `utils/hexColorWithAlpha.js`).
 */

/** Deux couleurs désignent-elles la même valeur (casse et espaces ignorés) ? */
function sameColor(a, b) {
  return (
    String(a ?? '')
      .trim()
      .toLowerCase() ===
    String(b ?? '')
      .trim()
      .toLowerCase()
  );
}

export function ColorPaletteField({
  id,
  value,
  onChange,
  label = 'Couleur',
  colors = ZONE_COLORS,
  hint = true,
  style,
}) {
  const current = value || '';
  const hexId = id ? `${id}-hex` : undefined;

  return (
    <div className="field" style={style}>
      {hexId ? <label htmlFor={hexId}>{label}</label> : <label>{label}</label>}
      <div className="color-palette-field__swatches" role="group" aria-label="Palette prédéfinie">
        {colors.map((c) => {
          const selected = sameColor(current, c);
          return (
            <button
              key={c}
              type="button"
              className={`color-palette-field__swatch${
                selected ? ' color-palette-field__swatch--selected' : ''
              }`}
              style={{ background: c }}
              aria-label={`Couleur ${c}`}
              aria-pressed={selected}
              onClick={() => onChange(c)}
            />
          );
        })}
      </div>
      <div className="color-palette-field">
        <input
          type="color"
          className="color-palette-field__picker"
          value={colorPickerValue(current)}
          aria-label="Choisir la teinte"
          onChange={(e) => onChange(applyPickedHexColor(current, e.target.value))}
        />
        <input
          id={hexId}
          className="color-palette-field__hex"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#86efac90"
          spellCheck={false}
        />
      </div>
      {hint ? (
        <p className="color-palette-field__hint">
          Les deux derniers caractères règlent la transparence (<code>90</code> ≈ 56 %) et sont
          conservés par le sélecteur.
        </p>
      ) : null}
    </div>
  );
}
